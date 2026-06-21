// app/(auth)/stripe.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Linking,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { stripeService } from '@/services/stripeService';
import { AlertWithAction } from '@/components/ui/Alert';
import { useAuth } from '@/contexts/AuthContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/utils/designSystem';

// -----------------------
// Types
// -----------------------
type Status = 'checking' | 'waiting' | 'success' | 'error';

interface AccountStatus {
  has_validated_profile?: boolean;
  status?: 'account_exists' | 'needs_onboarding' | 'pending' | 'no_account' | 'unknown' | string;
}

// -----------------------
// Helpers
// -----------------------
function extractErrorMessage(err: any, fallback: string): string {
  // Axios / apiClient style
  const status = err?.response?.status;
  const data = err?.response?.data;
  const backendMsg =
    data?.error ||
    data?.detail ||
    data?.message ||
    (typeof data === 'string' ? data : null);

  if (backendMsg) return `${backendMsg}${status ? ` (HTTP ${status})` : ''}`;
  if (err?.message) return err.message;
  return fallback;
}

// -----------------------
// Hook mutualisé
// -----------------------
function useStripeAccountStatus(t: (k: string) => string, initialDelayMs = 800, pollMs = 5000) {
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState<string>(t('auth.stripe.prepStatus'));
  const [lastAccount, setLastAccount] = useState<AccountStatus | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
      try {
        const a: AccountStatus = await stripeService.getAccountStatus();
        if (!isMounted) return;

        setLastAccount(a);
        setLastError(null);

        if (a?.has_validated_profile) {
          setStatus('success');
          setMessage(t('auth.stripe.validated'));
          if (interval) clearInterval(interval);
        } else {
          setStatus('waiting');
          setMessage(t('auth.stripe.inProgress'));
        }
      } catch (e: any) {
        if (!isMounted) return;
        const msg = extractErrorMessage(e, t('auth.stripe.statusCheckError'));
        console.error('[Stripe] getAccountStatus failed:', msg, e?.response?.data);
        setLastError(msg);
        setStatus('error');
        setMessage(t('auth.stripe.statusFetchFail'));
        if (interval) clearInterval(interval);
      }
    };

    timer = setTimeout(() => {
      check();
      interval = setInterval(check, pollMs);
    }, initialDelayMs);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [initialDelayMs, pollMs]);

  const refresh = async () => {
    try {
      const a: AccountStatus = await stripeService.getAccountStatus();
      setLastAccount(a);
      setLastError(null);
      if (a?.has_validated_profile) {
        setStatus('success');
        setMessage(t('auth.stripe.validated'));
      } else {
        setStatus('waiting');
        setMessage(t('auth.stripe.stillChecking'));
      }
    } catch (e: any) {
      const msg = extractErrorMessage(e, t('auth.stripe.refreshFail'));
      console.error('[Stripe] refresh failed:', msg, e?.response?.data);
      setLastError(msg);
      setStatus('error');
      setMessage(t('auth.stripe.refreshFailShort'));
    }
  };

  return { status, message, refresh, lastAccount, lastError, setLastError };
}

// -----------------------
// UI helpers
// -----------------------
function StatusEmoji({ status, styles }: { status: Status; styles: any }) {
  const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
  return (
    <Text style={styles.emoji} accessibilityRole="image" accessibilityLabel={`Statut: ${status}`}>
      {emoji}
    </Text>
  );
}

// -----------------------
// Composant principal
// -----------------------
export default function StripeScreen() {
  const { width } = useWindowDimensions();
  const responsive = useMemo(() => makeResponsiveStyles(width), [width]);
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { status, message, refresh, lastAccount, lastError, setLastError } =
    useStripeAccountStatus(t, 800, 5000);

  const [opening, setOpening] = useState(false);
  // Mutex partagé entre l'auto-open et le clic bouton pour éviter les doubles ouvertures
  const openingRef = useRef(false);
  // Garde-fou pour ne tenter l'auto-open qu'une seule fois par montage
  const autoOpenedRef = useRef(false);

  const { refreshUser } = useAuth();
  const { clearValidationStatus, loadRestaurants } = useRestaurant();

  const goToDashboard = async () => {
    try {
      clearValidationStatus();
      await refreshUser();
      await loadRestaurants();
    } catch {
      // Le dashboard re-essaiera au focus.
    }
    router.replace('/(restaurant)');
  };

  /**
   * Tente d'ouvrir l'onboarding Stripe.
   * - createOnboardingLink (compte existant) sinon createAccount (premier passage)
   * - Web : window.open ; Native : Linking.openURL
   * - Surface toutes les erreurs à l'utilisateur.
   */
  const openOnboarding = async () => {
    if (openingRef.current) {
      console.log('[Stripe] openOnboarding skipped (already opening)');
      return;
    }
    openingRef.current = true;
    setOpening(true);
    setLastError(null);

    try {
      // 1) Récupérer l'URL : essayer un nouveau lien d'abord, sinon créer le compte
      let onboardingUrl: string | undefined;

      try {
        const link = await stripeService.createOnboardingLink();
        onboardingUrl = link.onboarding_url;
        console.log('[Stripe] createOnboardingLink OK');
      } catch (linkErr: any) {
        const linkStatus = linkErr?.response?.status;
        console.warn(
          '[Stripe] createOnboardingLink failed → fallback createAccount',
          linkStatus,
          linkErr?.response?.data,
        );
        // Pas de compte ? On le crée. (Backend renvoie 400 "Aucun compte Stripe trouvé")
        try {
          const created = await stripeService.createAccount();
          onboardingUrl = created.onboarding_url;
          console.log('[Stripe] createAccount OK');
        } catch (createErr: any) {
          // Si createAccount échoue avec "compte déjà existant", on remonte l'erreur
          // de createOnboardingLink (la vraie cause), sinon celle de createAccount.
          const createStatus = createErr?.response?.status;
          console.error(
            '[Stripe] createAccount failed:',
            createStatus,
            createErr?.response?.data,
          );
          throw createStatus === 400 ? linkErr : createErr;
        }
      }

      if (!onboardingUrl) {
        throw new Error(t('auth.stripe.noUrl'));
      }

      console.log('[Stripe] Opening onboarding URL:', onboardingUrl);

      // 2) Ouvrir l'URL selon la plateforme
      if (Platform.OS === 'web') {
        // window.open est le seul moyen fiable d'ouvrir un onglet sur Web depuis un click
        const opened = window.open(onboardingUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
          throw new Error(t('auth.stripe.popupBlocked'));
        }
      } else {
        // Sur natif, on utilise le service qui gère Linking + WebBrowser fallback
        const ok = await stripeService.openStripeOnboarding(onboardingUrl);
        if (!ok) {
          throw new Error(t('auth.stripe.cannotOpenBrowser'));
        }
      }
    } catch (e: any) {
      const msg = extractErrorMessage(
        e,
        t('auth.stripe.cannotOpenPage'),
      );
      console.error('[Stripe] openOnboarding failed:', msg, e);
      setLastError(msg);
      Alert.alert(t('auth.stripe.title'), msg, [{ text: t('common.ok') }]);
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  // Redirection automatique vers le dashboard après validation
  useEffect(() => {
    if (status === 'success') {
      const timer = setTimeout(goToDashboard, 2000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Auto-open de l'onboarding au premier chargement si pas de compte / onboarding incomplet.
  // On attend que `lastAccount` soit défini par le hook avant de décider.
  useEffect(() => {
    if (!lastAccount) return;
    if (autoOpenedRef.current) return;
    if (lastAccount.has_validated_profile) return;

    const needsOnboarding =
      lastAccount.status === 'no_account' ||
      lastAccount.status === 'needs_onboarding' ||
      // Compte existe mais incomplet : on relance aussi l'onboarding
      lastAccount.status === 'account_exists';

    if (needsOnboarding) {
      autoOpenedRef.current = true;
      console.log('[Stripe] Auto-opening onboarding, account status:', lastAccount.status);
      openOnboarding();
    }
  }, [lastAccount]);

  const handlePrimary = async () => {
    if (status === 'success') {
      return goToDashboard();
    }
    await refresh();
  };

  const handleSecondary = async () => {
    await openOnboarding();
  };

  const handleContact = () => {
    Linking.openURL('mailto:contact@eatquicker.fr?subject=Aide%20configuration%20Stripe');
  };

  const showSecondaryButton =
    status === 'waiting' || status === 'error' || status === 'checking';

  return (
    <View style={[styles.container, responsive.container]}>
      <View style={[styles.card, responsive.card, webShadow]}>
        <StatusEmoji status={status} styles={styles} />
        <Text style={[styles.title, responsive.title]} accessibilityRole="header">
          {t('auth.stripe.title')}
        </Text>

        <Text style={[styles.message, responsive.message]} accessible accessibilityLabel={message}>
          {message}
        </Text>

        {status === 'checking' && <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />}

        {status === 'success' && (
          <Text style={styles.redirectNote}>
            {t('auth.stripe.redirectNote')}
          </Text>
        )}

        {!!lastError && status !== 'success' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{t('auth.stripe.errorDetail')}</Text>
            <Text style={styles.errorMsg}>{lastError}</Text>
          </View>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            label={status === 'success' ? t('auth.stripe.goToDashboard') : t('auth.stripe.refreshStatus')}
            onPress={handlePrimary}
            disabled={status === 'checking'}
            loading={status === 'checking'}
            styles={styles}
          />

          {showSecondaryButton && (
            <SecondaryButton
              label={opening ? t('auth.stripe.opening') : t('auth.stripe.configureAccount')}
              onPress={handleSecondary}
              disabled={opening}
              loading={opening}
              styles={styles}
            />
          )}

          {status === 'waiting' && (
            <>
              <View style={styles.divider} />
              <SecondaryButton label={t('auth.stripe.continueWithout')} onPress={goToDashboard} styles={styles} />
              <Text style={styles.note} accessibilityLabel="Information">
                {t('auth.stripe.paymentsDisabledPrefix')}{' '}
                <Text style={styles.bold}>{t('auth.stripe.paymentsDisabledWord')}</Text>{' '}
                {t('auth.stripe.paymentsDisabledSuffix')}
              </Text>
            </>
          )}
        </View>

        <View style={styles.alertContainer}>
          <AlertWithAction
            variant="info"
            title={t('auth.stripe.helpTitle')}
            message={t('auth.stripe.helpMessage')}
            autoDismiss={false}
            primaryButton={{
              text: t('auth.stripe.contactUs'),
              onPress: handleContact,
            }}
          />
        </View>
      </View>
    </View>
  );
}

// -----------------------
// Boutons
// -----------------------
function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  styles,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  styles: any;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.btn, styles.btnPrimary, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnPrimaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  styles,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  styles: any;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.btn, styles.btnSecondary, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {loading ? <ActivityIndicator /> : <Text style={styles.btnSecondaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

// -----------------------
// Styles
// -----------------------
const webShadow = Platform.select({
  web: {
    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
  },
  default: {},
});

function createStyles(c: any) {
  return StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: c.background,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  emoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    color: c.text.primary,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: c.text.secondary,
    marginBottom: 16,
  },
  loader: {
    marginVertical: 8,
  },
  redirectNote: {
    fontSize: 14,
    textAlign: 'center',
    color: c.success,
    fontWeight: '500',
    marginBottom: 8,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: c.error,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorTitle: {
    color: c.error,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  errorMsg: {
    color: c.error,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    marginTop: 8,
    gap: 10,
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: c.primary,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border.default,
  },
  btnSecondaryText: {
    color: c.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: c.border.light,
    marginVertical: 4,
  },
  note: {
    fontSize: 13,
    color: c.text.secondary,
    textAlign: 'center',
  },
  bold: {
    fontWeight: '700',
  },
  alertContainer: {
    marginTop: 16,
  },
  });
}

function makeResponsiveStyles(width: number) {
  const isTablet = width >= 768;
  const isSmall = width < 360;

  return StyleSheet.create({
    container: {
      paddingHorizontal: isTablet ? 24 : 16,
    },
    card: {
      padding: isTablet ? 28 : 20,
      borderRadius: isTablet ? 18 : 16,
    },
    title: {
      fontSize: isTablet ? 24 : isSmall ? 20 : 22,
    },
    message: {
      fontSize: isSmall ? 15 : 16,
    },
  });
}