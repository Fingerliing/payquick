/**
 * Flags Tap to Pay.
 *
 * `__DEV__` sert de défaut, pas de plancher : `EXPO_PUBLIC_TAP_TO_PAY_SIMULATED=0`
 * doit pouvoir forcer le reader réel en développement, et `=1` doit pouvoir
 * activer le reader simulé sur un build interne où `__DEV__` est faux et où les
 * diagnostics seraient sinon invisibles.
 *
 * Deux contraintes Stripe à garder en tête :
 *  - le reader simulé n'existe qu'en mode test, donc tout build portant
 *    `SIMULATED=1` doit viser un backend en clés `sk_test_` ;
 *  - le reader NON simulé refuse les applications debuggables, donc un dev
 *    client ne peut jamais encaisser réellement, quelle que soit la valeur du
 *    flag. Le test en conditions réelles exige un build release.
 */
import Constants from 'expo-constants';

function flag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return fallback;
}

export const TAP_TO_PAY_SIMULATED = flag(
  process.env.EXPO_PUBLIC_TAP_TO_PAY_SIMULATED,
  __DEV__,
);

export const TAP_TO_PAY_DIAGNOSTICS = flag(
  process.env.EXPO_PUBLIC_TAP_TO_PAY_DIAGNOSTICS,
  __DEV__,
);

/**
 * Vrai uniquement si le binaire courant embarque
 * `com.apple.developer.proximity-reader.payment.acceptance`. Injecté par
 * `app.config.ts`, donc impossible à désynchroniser du binaire signé.
 *
 * Sans lui, iOS ne publie aucun reader intégré : `discoverReaders` réussit mais
 * ne remonte rien, et l'écran d'encaissement termine en `unsupported` après
 * avoir fait attendre le serveur devant un client.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { tapToPayEntitlement?: boolean };

export const TAP_TO_PAY_ENTITLED = extra.tapToPayEntitlement === true;