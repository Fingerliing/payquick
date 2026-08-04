import type { ConfigContext, ExpoConfig } from 'expo/config';

const TAP_TO_PAY_ENTITLEMENT =
  'com.apple.developer.proximity-reader.payment.acceptance';
const STRIPE_TERMINAL_PLUGIN = '@stripe/stripe-terminal-react-native';

const isAppStoreBuild = process.env.APP_ENV === 'production';

type PluginEntry = NonNullable<ExpoConfig['plugins']>[number];

const isStripeTerminalPlugin = (
  plugin: PluginEntry,
): plugin is [string, Record<string, unknown>] =>
  Array.isArray(plugin) &&
  plugin[0] === STRIPE_TERMINAL_PLUGIN &&
  typeof plugin[1] === 'object' &&
  plugin[1] !== null;

const resolveEntitlements = (
  base: Record<string, unknown>,
): Record<string, unknown> => {
  if (isAppStoreBuild) {
    return { ...base, [TAP_TO_PAY_ENTITLEMENT]: true };
  }
  return Object.fromEntries(
    Object.entries(base).filter(([key]) => key !== TAP_TO_PAY_ENTITLEMENT),
  );
};

const resolvePlugins = (plugins: readonly PluginEntry[]): PluginEntry[] =>
  plugins.map((plugin) =>
    isStripeTerminalPlugin(plugin)
      ? [plugin[0], { ...plugin[1], tapToPayCheck: isAppStoreBuild }]
      : plugin,
  );

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ios: {
    ...config.ios,
    entitlements: resolveEntitlements(
      (config.ios?.entitlements ?? {}) as Record<string, unknown>,
    ),
  },
  plugins: resolvePlugins(config.plugins ?? []),
});
