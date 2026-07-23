import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useStripeTerminal,
  requestNeededAndroidPermissions,
  type Reader,
} from '@stripe/stripe-terminal-react-native';

import { terminalService } from '@/services/terminalService';
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

interface UseTapToPayArgs {
  restaurantId: number;
  orderId: number;
}

interface UseTapToPayResult {
  phase: TapToPayPhase;
  failure: TapToPayFailure | null;
  amountCents: number | null;
  paidOrder: OrderDetail | null;
  isBusy: boolean;
  /** Découverte + connexion du reader intégré. Idempotent. */
  prepare: () => Promise<void>;
  /** Crée le PaymentIntent puis collecte. À n'appeler qu'en phase `ready`. */
  collect: () => Promise<void>;
  /** Annule la collecte en cours (le serveur reprend la main). */
  abort: () => Promise<void>;
  /** Repasse de `failed` à `ready` sans reconnecter le reader. */
  reset: () => void;
}

/** Erreurs SDK dont on sait qu'elles ne sont pas un refus bancaire. */
const CANCEL_CODES = ['Canceled', 'CanceledError', 'CommandCancelled'];
const NETWORK_CODES = ['NotConnectedToInternet', 'RequestTimedOut', 'StripeAPIConnectionError'];

function classifyError(code: string | undefined, message: string | undefined): TapToPayFailure {
  if (!code && !message) return 'unknown';
  if (code && CANCEL_CODES.includes(code)) return 'canceled';
  if (code && NETWORK_CODES.includes(code)) return 'network';
  if (code === 'DeclinedByStripeAPI' || code === 'DeclinedByReader') return 'declined';
  if (code === 'CardReadTimedOut') return 'timeout';
  if (code === 'UnsupportedOperation' || code === 'FeatureNotAvailable') return 'unsupported';
  return 'unknown';
}

export function useTapToPay({ restaurantId, orderId }: UseTapToPayArgs): UseTapToPayResult {
  const [phase, setPhase] = useState<TapToPayPhase>('idle');
  const [failure, setFailure] = useState<TapToPayFailure | null>(null);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [paidOrder, setPaidOrder] = useState<OrderDetail | null>(null);

  // Le reader découvert arrive par callback, pas par valeur de retour :
  // on le stocke en ref pour que `prepare` puisse l'attendre sans re-render.
  const discoveredRef = useRef<Reader.Type | null>(null);
  const mountedRef = useRef(true);

  const {
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

  const prepare = useCallback(async () => {
    if (connectedReader) {
      safeSet('ready');
      return;
    }
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
        safeSet('failed', 'permissions');
        return;
      }
    }

    try {
      const locationId = await terminalService.getLocationId(restaurantId);
      if (!locationId) {
        safeSet('failed', 'location');
        return;
      }

      safeSet('connecting');
      discoveredRef.current = null;

      const { error: discoverError } = await discoverReaders({ discoveryMethod: 'tapToPay' });
      if (discoverError) {
        safeSet('failed', classifyError(discoverError.code, discoverError.message));
        return;
      }

      const reader = discoveredRef.current;
      if (!reader) {
        safeSet('unsupported', 'unsupported');
        return;
      }

      const { error: connectError } = await connectReader({ reader, locationId }, 'tapToPay');
      if (connectError) {
        safeSet('failed', classifyError(connectError.code, connectError.message));
        return;
      }

      safeSet('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      safeSet('failed', classifyError(undefined, message));
    }
  }, [connectedReader, restaurantId, discoverReaders, connectReader, safeSet]);

  const collect = useCallback(async () => {
    safeSet('creating');

    let clientSecret: string;
    try {
      const created = await terminalService.createPaymentIntent(orderId);
      clientSecret = created.client_secret;
      if (mountedRef.current) setAmountCents(created.amount_cents);
    } catch {
      safeSet('failed', 'intent');
      return;
    }

    const { paymentIntent: retrieved, error: retrieveError } =
      await retrievePaymentIntent(clientSecret);
    if (retrieveError || !retrieved) {
      safeSet('failed', classifyError(retrieveError?.code, retrieveError?.message));
      return;
    }

    // Phase visible par le serveur : c'est ici que le téléphone est tendu au
    // client, et que la saisie du PIN peut s'ouvrir au-delà du seuil CVM.
    safeSet('collecting');
    const { paymentIntent: collected, error: collectError } = await collectPaymentMethod({
      paymentIntent: retrieved,
    });
    if (collectError || !collected) {
      safeSet('failed', classifyError(collectError?.code, collectError?.message));
      return;
    }

    safeSet('confirming');
    const { paymentIntent: confirmed, error: confirmError } = await confirmPaymentIntent({
      paymentIntent: collected,
    });
    if (confirmError || !confirmed) {
      safeSet('failed', classifyError(confirmError?.code, confirmError?.message));
      return;
    }

    // Au-delà de ce point la carte est débitée : plus aucun chemin ne doit
    // reproposer un encaissement.
    try {
      const order = await terminalService.confirm(orderId, confirmed.id);
      if (mountedRef.current) setPaidOrder(order);
      safeSet('succeeded');
    } catch {
      safeSet('settling');
    }
  }, [
    orderId,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    safeSet,
  ]);

  const abort = useCallback(async () => {
    if (phase !== 'collecting') return;
    await cancelCollectPaymentMethod();
    safeSet('ready');
  }, [phase, cancelCollectPaymentMethod, safeSet]);

  const reset = useCallback(() => {
    safeSet(connectedReader ? 'ready' : 'idle');
  }, [connectedReader, safeSet]);

  const isBusy =
    phase === 'checking' ||
    phase === 'connecting' ||
    phase === 'creating' ||
    phase === 'collecting' ||
    phase === 'confirming';

  return { phase, failure, amountCents, paidOrder, isBusy, prepare, collect, abort, reset };
}
