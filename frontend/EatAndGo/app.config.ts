import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * L'entitlement Tap to Pay est restreint : Apple ne l'embarque dans un profil
 * que si le compte figure sur sa whitelist POUR CE TYPE DE DISTRIBUTION. Tant
 * que le grant App Store n'est pas accordé, l'injecter fait échouer la
 * signature — d'où un flag dédié, volontairement décorrélé d'`APP_ENV` : le
 * grant est un état du compte Apple, pas une propriété de l'environnement.
 *
 * `TAP_TO_PAY_ENTITLEMENT=1` → entitlement injecté + capability synchronisée.
 * Absent ou toute autre valeur → binaire signable, feature masquée au runtime.
 */
const TAP_TO_PAY_KEY = 'com.apple.developer.proximity-reader.payment.acceptance';

const entitlementGranted = process.env.TAP_TO_PAY_ENTITLEMENT === '1';

export default ({ config }: ConfigContext): ExpoConfig => {
  const entitlements: Record<string, unknown> = Object.fromEntries(
    Object.entries((config.ios?.entitlements ?? {}) as Record<string, unknown>).filter(
      ([key]) => key !== TAP_TO_PAY_KEY,
    ),
  );

  if (entitlementGranted) {
    entitlements[TAP_TO_PAY_KEY] = true;
  }

  const ios = { ...config.ios };
  if (Object.keys(entitlements).length > 0) {
    ios.entitlements = entitlements;
  } else {
    delete ios.entitlements;
  }

  return {
    ...config,
    name: config.name ?? 'EatQuickeR',
    slug: config.slug ?? 'EatQuickeR',
    ios,
    extra: {
      ...config.extra,
      // Seule source de vérité côté JS : garantit que l'UI ne propose jamais
      // l'encaissement sans contact sur un binaire signé sans l'entitlement.
      tapToPayEntitlement: entitlementGranted,
    },
  };
};