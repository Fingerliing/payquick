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