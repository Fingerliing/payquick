import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useStripeTerminal,
  requestNeededAndroidPermissions,
  type Reader,
} from '@stripe/stripe-terminal-react-native';

import { terminalService } from '@/services/terminalService';
import { TAP_TO_PAY_DIAGNOSTICS, TAP_TO_PAY_SIMULATED } from '@/utils/TapTopayFlags';
import type { OrderDetail } from '@/types/order';

/**
 * Tap to Pay — machine à états d'un encaissement au contact.
 *
 * Règle structurante : `succeeded` n'est atteint QUE lorsque le backend a
 * confirmé l'écriture. Tout échec avant la capture Stripe ramène à `ready`
 * sans qu'aucune commande ne soit marquée payée.
 *
 * Cas particulier `settling` : la carte a été débitée mais la confirmation
 * serveur n'est pas passée (réseau coupé juste après la capture). L'argent a
 * bougé — on n'affiche donc PAS « échec » et on ne propose PAS de recharger la
 * carte. Le webhook `payment_intent.succeeded` réconcilie de son côté.
 *
 * Initialisation : `initialize()` est appelé dans un effet dédié, PAS enchaîné
 * dans `prepare`. `isInitialized` est un état React ; la promesse d'init peut
 * résoudre avant que le flag lu par le garde interne du SDK ne soit propagé.
 * On gate donc la découverte sur `isInitialized`.
 *
 * Auto-préparation : elle vit ICI, gatée sur `phase === 'idle'` et appelée via
 * une ref. `prepare` change d'identité à chaque re-render du provider Terminal
 * (`discoverReaders`/`connectReader` ne sont pas mémoïsés côté SDK) ; un effet
 * de l'écran dépendant de `prepare` le relançait en boucle, et le
 * `safeSet('ready')` du chemin « déjà connecté » écrasait `collecting`,
 * `confirming` et `succeeded` — l'encaissement était interrompu par un simple
 * re-render, sans qu'aucune erreur ne l'explique.
 *
 * Annulation : `cancelCollectPaymentMethod()` ne tue pas la promesse de
 * `collectPaymentMethod` — elle résout ensuite avec un code d'annulation. Sans
 * `abortingRef`, cette continuation écrase le `ready` posé par `abort` et
 * affiche un écran d'échec alors que l'opérateur a lui-même annulé.
 */

export type TapToPayPhase =
  | 'idle'
  | 'checking'
  | 'unsupported'
  | 'connecting'
  | 'ready'
  | 'creating'
  | 'collecting'
  | 'confirming'
  | 'settling'
  | 'succeeded'
  | 'failed';

export type TapToPayFailure =
  | 'permissions'
  | 'unsupported'
  | 'location'
  | 'connection'
  | 'intent'
  | 'declined'
  | 'canceled'
  | 'timeout'
  | 'network'
  | 'unknown';

/** Étape où l'échec s'est produit — diagnostic uniquement, jamais affiché au client final. */
export type TapToPayStage =
  | 'initialize'
  | 'permissions'
  | 'location'
  | 'discover'
  | 'connect'
  | 'createIntent'
  | 'retrieve'
  | 'collect'
  | 'confirm'
  | 'serverConfirm';

export interface TapToPayErrorDetail {
  stage: TapToPayStage;
  code: string | null;
  message: string | null;
  httpStatus: number | null;
}

interface UseTapToPayArgs {
  restaurantId: number;
  orderId: number;
}

interface UseTapToPayResult {
  phase: TapToPayPhase;
  failure: TapToPayFailure | null;
  /** Dernière erreur brute. Destinée au debug et aux rapports de bug. */
  lastError: TapToPayErrorDetail | null;
  amountCents: number | null;
  paidOrder: OrderDetail | null;
  isBusy: boolean;
  /**
   * Découverte + connexion du reader intégré. Idempotent.
   * Déclenchée automatiquement en phase `idle` — l'écran ne doit PAS l'appeler
   * dans un effet, sous peine de rétablir la boucle décrite en tête de fichier.
   */
  prepare: () => Promise<void>;
  /** Crée le PaymentIntent puis collecte. À n'appeler qu'en phase `ready`. */
  collect: () => Promise<void>;
  /** Annule la collecte en cours (le serveur reprend la main). */
  abort: () => Promise<void>;
  /** Repasse de `failed` à `ready` sans reconnecter le reader. */
  reset: () => void;
  /** Rejoue l'étape échouée : découverte+connexion si pas encore connecté, sinon paiement. */
  retry: () => void;
}

/** Erreurs SDK dont on sait qu'elles ne sont pas un refus bancaire. */
const CANCEL_CODES = ['Canceled', 'CanceledError', 'CommandCancelled', 'CancelFailedUnavailable'];
const NETWORK_CODES = ['NotConnectedToInternet', 'RequestTimedOut', 'StripeAPIConnectionError'];
const CONNECTION_CODES = [
  'NotConnectedToReader',
  'ReaderBusy',
  'SessionExpired',
  'ConnectionTokenProviderError',
  'ConnectionTokenProviderCompletedWithNothing',
  'ReaderCommunicationError',
];
const UNSUPPORTED_CODES = [
  'UnsupportedOperation',
  'FeatureNotAvailable',
  'UnsupportedSDK',
  'UnsupportedMobileDeviceConfiguration',
  'UnsupportedReaderVersion',
];

function classifyError(code: string | undefined, message: string | undefined): TapToPayFailure {
  if (!code && !message) return 'unknown';
  if (code) {
    if (CANCEL_CODES.includes(code)) return 'canceled';
    if (NETWORK_CODES.includes(code)) return 'network';
    if (CONNECTION_CODES.includes(code)) return 'connection';
    if (UNSUPPORTED_CODES.includes(code)) return 'unsupported';
    // Famille Tap to Pay : device banni, TOS non acceptées, entitlement absent,
    // compte non éligible. Aucune n'est récupérable par un retry immédiat.
    if (code.startsWith('TapToPay') || code.startsWith('LocalMobile')) return 'unsupported';
    if (code === 'DeclinedByStripeAPI' || code === 'DeclinedByReader') return 'declined';
    if (code === 'CardReadTimedOut') return 'timeout';
  }
  return 'unknown';
}

export function useTapToPay({ restaurantId, orderId }: UseTapToPayArgs): UseTapToPayResult {
  const [phase, setPhase] = useState<TapToPayPhase>('idle');
  const [failure, setFailure] = useState<TapToPayFailure | null>(null);
  const [lastError, setLastError] = useState<TapToPayErrorDetail | null>(null);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [paidOrder, setPaidOrder] = useState<OrderDetail | null>(null);

  // Le reader découvert arrive par callback, pas par valeur de retour :
  // on le stocke en ref pour que `prepare` puisse l'attendre sans re-render.
  const discoveredRef = useRef<Reader.Type | null>(null);
  const mountedRef = useRef(true);
  const abortingRef = useRef(false);

  const {
    initialize,
    isInitialized,
    discoverReaders,
    connectReader,
    connectedReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      if (readers.length > 0) discoveredRef.current = readers[0];
    },
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSet = useCallback(
    (next: TapToPayPhase, reason: TapToPayFailure | null = null) => {
      if (!mountedRef.current) return;
      setPhase(next);
      setFailure(reason);
    },
    [],
  );

  const record = useCallback((detail: TapToPayErrorDetail) => {
    if (TAP_TO_PAY_DIAGNOSTICS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[TapToPay] @${detail.stage} · code=${detail.code ?? '∅'} · http=${
          detail.httpStatus ?? '∅'
        } · msg=${detail.message ?? '∅'}`,
      );
    }
    if (mountedRef.current) setLastError(detail);
  }, []);

  /**
   * Bascule en `failed` en conservant le code brut du SDK. Sans ça, toute
   * erreur non mappée devient `unknown` et le diagnostic est impossible depuis
   * un retour terrain.
   */
  const failWith = useCallback(
    (
      stage: TapToPayStage,
      code?: string,
      message?: string,
      httpStatus?: number,
      forced?: TapToPayFailure,
    ) => {
      record({
        stage,
        code: code ?? null,
        message: message ?? null,
        httpStatus: httpStatus ?? null,
      });
      safeSet('failed', forced ?? classifyError(code, message));
    },
    [record, safeSet],
  );

  // Init native du SDK, isolée de la découverte. Un échec ici fige la phase en
  // `failed` ; `prepare` ne discover pas tant que `isInitialized` n'est pas vrai.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { error } = await initialize();
      if (cancelled || !error) return;
      failWith('initialize', error.code, error.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialize, failWith]);

  const prepare = useCallback(async () => {
    if (connectedReader) {
      safeSet('ready');
      return;
    }
    if (!isInitialized) return;

    safeSet('checking');

    if (Platform.OS === 'android') {
      // Tap to Pay refuse de transmettre sans position : un refus de permission
      // n'est pas récupérable en cours de transaction, on le règle en amont.
      const granted = await requestNeededAndroidPermissions({
        accessFineLocation: {
          title: 'Localisation',
          message: 'Stripe exige la position de l’appareil pour accepter un paiement sans contact.',
          buttonPositive: 'Autoriser',
        },
      });
      if (granted?.error) {
        failWith(
          'permissions',
          'AndroidPermissionsDenied',
          String(granted.error),
          undefined,
          'permissions',
        );
        return;
      }
    }

    try {
      const locationId = await terminalService.getLocationId(restaurantId);
      if (!locationId) {
        failWith('location', 'EmptyLocationId', undefined, undefined, 'location');
        return;
      }

      safeSet('connecting');
      discoveredRef.current = null;

      const { error: discoverError } = await discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: TAP_TO_PAY_SIMULATED,
      });
      if (discoverError) {
        failWith('discover', discoverError.code, discoverError.message);
        return;
      }

      const reader = discoveredRef.current;
      if (!reader) {
        // Aucun reader intégré publié par l'OS : appareil non éligible, ou
        // entitlement `proximity-reader.payment.acceptance` absent du binaire.
        record({
          stage: 'discover',
          code: 'NoIntegratedReader',
          message: TAP_TO_PAY_SIMULATED ? 'mode simulé actif' : 'mode réel',
          httpStatus: null,
        });
        safeSet('unsupported', 'unsupported');
        return;
      }

      const { error: connectError } = await connectReader({
        reader,
        locationId,
        discoveryMethod: 'tapToPay',
      });
      if (connectError) {
        failWith('connect', connectError.code, connectError.message);
        return;
      }

      safeSet('ready');
    } catch (err) {
      const httpErr = err as {
        response?: { status?: number; data?: { error?: string } };
        message?: string;
      };
      failWith(
        'location',
        undefined,
        httpErr.response?.data?.error ?? httpErr.message,
        httpErr.response?.status,
      );
    }
  }, [
    connectedReader,
    isInitialized,
    restaurantId,
    discoverReaders,
    connectReader,
    safeSet,
    failWith,
    record,
  ]);

  // Auto-préparation. La ref évite que la ré-identification de `prepare` à
  // chaque re-render du provider Terminal ne relance la découverte : seule la
  // phase `idle` autorise un déclenchement.
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;

  useEffect(() => {
    if (phase !== 'idle' || !isInitialized) return;
    void prepareRef.current();
  }, [phase, isInitialized]);

  const collect = useCallback(async () => {
    abortingRef.current = false;
    safeSet('creating');

    let clientSecret: string;
    try {
      const created = await terminalService.createPaymentIntent(orderId);
      clientSecret = created.client_secret;
      if (mountedRef.current) setAmountCents(created.amount_cents);
    } catch (err) {
      const httpErr = err as {
        response?: { status?: number; data?: { error?: string } };
        message?: string;
      };
      failWith(
        'createIntent',
        undefined,
        httpErr.response?.data?.error ?? httpErr.message,
        httpErr.response?.status,
        'intent',
      );
      return;
    }

    const { paymentIntent: retrieved, error: retrieveError } =
      await retrievePaymentIntent(clientSecret);
    if (retrieveError || !retrieved) {
      failWith('retrieve', retrieveError?.code, retrieveError?.message);
      return;
    }

    // Phase visible par le serveur : c'est ici que le téléphone est tendu au
    // client, et que la saisie du PIN peut s'ouvrir au-delà du seuil CVM.
    safeSet('collecting');
    const { paymentIntent: collected, error: collectError } = await collectPaymentMethod({
      paymentIntent: retrieved,
    });

    // Annulation opérateur : `abort` a déjà repositionné la phase, on ne
    // transforme pas son geste en écran d'échec.
    if (abortingRef.current) {
      abortingRef.current = false;
      return;
    }

    if (collectError || !collected) {
      failWith('collect', collectError?.code, collectError?.message);
      return;
    }

    safeSet('confirming');
    const { paymentIntent: confirmed, error: confirmError } = await confirmPaymentIntent({
      paymentIntent: collected,
    });
    if (confirmError || !confirmed) {
      failWith('confirm', confirmError?.code, confirmError?.message);
      return;
    }

    // Au-delà de ce point la carte est débitée : plus aucun chemin ne doit
    // reproposer un encaissement.
    try {
      const order = await terminalService.confirm(orderId, confirmed.id);
      if (mountedRef.current) setPaidOrder(order);
      safeSet('succeeded');
    } catch (err) {
      const httpErr = err as {
        response?: { status?: number; data?: { error?: string } };
        message?: string;
      };
      record({
        stage: 'serverConfirm',
        code: confirmed.id,
        message: httpErr.response?.data?.error ?? httpErr.message ?? null,
        httpStatus: httpErr.response?.status ?? null,
      });
      safeSet('settling');
    }
  }, [
    orderId,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    safeSet,
    failWith,
    record,
  ]);

  const abort = useCallback(async () => {
    if (phase !== 'collecting') return;
    abortingRef.current = true;
    await cancelCollectPaymentMethod();
    safeSet('ready');
  }, [phase, cancelCollectPaymentMethod, safeSet]);

  const reset = useCallback(() => {
    if (mountedRef.current) setLastError(null);
    safeSet(connectedReader ? 'ready' : 'idle');
  }, [connectedReader, safeSet]);

  const retry = useCallback(() => {
    // Échec AVANT connexion (init/permissions/location/discover/connect) → rejouer
    // la découverte via le retour en `idle`, que l'effet d'auto-préparation capte.
    // Échec À PARTIR de `ready` (intent/refus/timeout) → rejouer le paiement seul.
    if (mountedRef.current) setLastError(null);
    if (connectedReader) {
      safeSet('ready');
      void collect();
    } else {
      safeSet('idle');
    }
  }, [connectedReader, collect, safeSet]);

  const isBusy =
    phase === 'checking' ||
    phase === 'connecting' ||
    phase === 'creating' ||
    phase === 'collecting' ||
    phase === 'confirming';

  return {
    phase,
    failure,
    lastError,
    amountCents,
    paidOrder,
    isBusy,
    prepare,
    collect,
    abort,
    reset,
    retry,
  };
}