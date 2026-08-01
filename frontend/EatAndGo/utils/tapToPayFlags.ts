/**
 * Flags Tap to Pay.
 *
 * `__DEV__` ne suffit pas : un build preview ou production le met à false, ce
 * qui rend le reader simulé indisponible ET les diagnostics invisibles —
 * exactement le contexte où on en a besoin. Les deux flags sont donc pilotés
 * explicitement par `env` du profil EAS, avec `__DEV__` comme raccourci local.
 *
 * Le reader simulé Stripe n'existe qu'en mode test : tout build portant
 * `EXPO_PUBLIC_TAP_TO_PAY_SIMULATED=1` doit viser un backend en clés `sk_test_`.
 */
export const TAP_TO_PAY_SIMULATED =
  __DEV__ || process.env.EXPO_PUBLIC_TAP_TO_PAY_SIMULATED === '1';

export const TAP_TO_PAY_DIAGNOSTICS =
  __DEV__ || process.env.EXPO_PUBLIC_TAP_TO_PAY_DIAGNOSTICS === '1';