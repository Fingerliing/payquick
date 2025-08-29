// app/(auth)/stripe.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { stripeService } from '@/services/stripeService'; // ajuste le chemin si besoin

// -----------------------
// Types
// -----------------------
type Status = 'checking' | 'waiting' | 'success' | 'error';

interface AccountStatus {
  has_validated_profile?: boolean;
  status?: 'account_exists' | 'needs_onboarding' | 'pending' | 'unknown' | string;
}

// -----------------------
// Hook mutualisé
// -----------------------
function useStripeAccountStatus(initialDelayMs = 3000, pollMs = 5000) {
  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState<string>('Vérification de votre compte Stripe...');

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
      try {
        const a: AccountStatus = await stripeService.getAccountStatus();
        if (!isMounted) return;

        if (a?.has_validated_profile) {
          setStatus('success');
          setMessage('Votre compte Stripe a été validé avec succès !');
          if (interval) clearInterval(interval);
        } else {
          setStatus('waiting');
          setMessage('Configuration en cours. Cela peut prendre quelques minutes...');
        }
      } catch (e) {
        if (!isMounted) return;
        setStatus('error');
        setMessage('Erreur lors de la vérification du statut de votre compte.');

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
      if (a?.has_validated_profile) {
        setStatus('success');
        setMessage('Votre compte Stripe a été validé avec succès !');
      } else {
        setStatus('waiting');
        setMessage('Toujours en cours de vérification...');
      }
    } catch {
      setStatus('error');
      setMessage('Impossible de rafraîchir le statut. Réessayez.');
    }
  };

  return { status, message, refresh };
}

// -----------------------
// UI helpers
// -----------------------
function StatusEmoji({ status }: { status: Status }) {
  const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
  return <Text style={styles.emoji} accessibilityRole="image" accessibilityLabel={`Statut: ${status}`}>{emoji}</Text>;
}

// -----------------------
// Composant principal
// -----------------------
export default function StripeScreen() {
  const { width } = useWindowDimensions();
  const responsive = useMemo(() => makeResponsiveStyles(width), [width]);

  const { status, message, refresh } = useStripeAccountStatus(3000, 5000);
  const [opening, setOpening] = useState(false);

  const goToDashboard = () => router.replace('/(restaurant)');

  const openOnboarding = async () => {
    try {
      setOpening(true);
      const link = await stripeService.createOnboardingLink();
      // Préfère l’ouverture via le service (in-app/browser) si dispo
      if (stripeService.openStripeOnboarding) {
        await stripeService.openStripeOnboarding(link.onboarding_url);
      } else {
        await Linking.openURL(link.onboarding_url);
      }
    } catch {
      // Optionnel: journaliser (Sentry)
    } finally {
      setOpening(false);
    }
  };

  // Ouvre automatiquement l'onboarding Stripe si aucun compte n'existe encore
  // (status retourné par le backend === 'no_account'). Pour les autres statuts 
  // (compte existant non validé, etc.), aucune redirection automatique.
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const account: AccountStatus = await stripeService.getAccountStatus();
        if (isMounted && account.status === 'no_account') {
          await openOnboarding();
        }
      } catch {
        // Optionnel: journaliser l'erreur (Sentry)
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handlePrimary = async () => {
    if (status === 'success') {
      return goToDashboard();
    }
    // Sinon on tente un refresh rapide
    await refresh();
  };

  const handleSecondary = async () => {
    if (status === 'waiting' || status === 'error') {
      await openOnboarding();
    }
  };

  return (
    <View style={[styles.container, responsive.container]}>
      <View style={[styles.card, responsive.card, webShadow]}>
        <StatusEmoji status={status} />
        <Text
          style={[styles.title, responsive.title]}
          accessibilityRole="header"
        >
          Configuration Stripe
        </Text>

        <Text style={[styles.message, responsive.message]} accessible accessibilityLabel={message}>
          {message}
        </Text>

        {status === 'checking' && (
          <ActivityIndicator size="large" style={styles.loader} />
        )}

        <View style={styles.actions}>
          <PrimaryButton
            label={status === 'success' ? 'Accéder au tableau de bord' : 'Rafraîchir le statut'}
            onPress={handlePrimary}
            disabled={status === 'checking'}
            loading={status === 'checking'}
          />

          {(status === 'waiting' || status === 'error') && (
            <SecondaryButton
              label={opening ? 'Ouverture...' : 'Modifier mes infos Stripe'}
              onPress={handleSecondary}
              disabled={opening}
            />
          )}

          {status === 'waiting' && (
            <>
              <View style={styles.divider} />
              <SecondaryButton
                label="Continuer sans Stripe"
                onPress={goToDashboard}
              />
              <Text style={styles.note} accessibilityLabel="Information importante">
                Les paiements resteront <Text style={styles.bold}>désactivés</Text> tant que la validation Stripe n’est pas terminée.
              </Text>
            </>
          )}
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
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
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
      {loading ? <ActivityIndicator /> : <Text style={styles.btnPrimaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
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
      <Text style={styles.btnSecondaryText}>{label}</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#F7F7FA',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    // Ombres natives (iOS/Android)
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
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#444',
    marginBottom: 16,
  },
  loader: {
    marginVertical: 8,
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
    backgroundColor: '#111827',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: '#F3F4F6',
  },
  btnSecondaryText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: '#EEE',
    marginVertical: 4,
  },
  note: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  bold: {
    fontWeight: '700',
  },
});

// Styles responsives dérivés
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
