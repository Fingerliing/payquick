import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Alert as CustomAlert } from '@/components/ui/Alert';
import secureStorage from '@/utils/secureStorage';
import { legalService } from '@/services/legalService';
import { API_BASE_URL } from '@/constants/config';
import { useTranslation } from 'react-i18next';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
  useAppTheme,
} from '@/utils/designSystem';

const CODE_LENGTH = 6;
const API_URL = `${API_BASE_URL}/api/v1`;
const RESEND_COOLDOWN = 60;

// Gradient : bleu nuit → bleu principal (charte graphique)
const GRADIENT: [string, string, string] = [
  COLORS.variants.primary[900], // '#0D1629'
  COLORS.variants.primary[700], // '#15204E'
  COLORS.primary,               // '#1E2A78'
];

export default function VerifyEmailScreen() {
  // ── Paramètres d'URL ────────────────────────────────────────────────────────
  // - registration_id, email_masked, expires_in : provenant de l'étape 1 du
  //   register.
  // - returnTo : optionnel. Si fourni, on redirige l'utilisateur vers ce
  //   chemin une fois la vérification réussie (utilisé par le parcours QR →
  //   menu → checkout → AuthGateModal → register → verify-email).
  const params = useLocalSearchParams<{
    registration_id: string;
    email_masked: string;
    expires_in: string;
    returnTo?: string;
  }>();
  const { registration_id, email_masked, expires_in } = params;
  const returnTo =
    typeof params.returnTo === 'string' && params.returnTo.trim().length > 0
      ? params.returnTo
      : null;

  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const [customAlert, setCustomAlert] = useState<{
    variant?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const insets = useSafeAreaInsets();
  const { refreshUser } = useAuth();
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  // Dégradé : navy de marque en clair, bleu nuit profond en dark.
  const gradientColors = (isDark
    ? ['#070B18', '#0F1528', '#161D33']
    : GRADIENT) as [string, string, string];

  // Raccourci pour valeur responsive numérique
  const sp = (token: { mobile: number; tablet: number; desktop: number }): number =>
    getResponsiveValue(token, screenType);

  // ── Countdown renvoi ────────────────────────────────────────────────────────
  useEffect(() => {
    if (resendCountdown <= 0) { setCanResend(true); return; }
    const t = setTimeout(() => setResendCountdown(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const fullCode = code.join('');
  const isComplete = fullCode.length === CODE_LENGTH;

  // ── Saisie OTP ──────────────────────────────────────────────────────────────
  const handleCodeChange = useCallback((value: string, index: number) => {
    const cleaned = value.replace(/[^0-9]/g, '');

    if (cleaned.length > 1) {
      // Collage depuis le presse-papiers
      const digits = cleaned.slice(0, CODE_LENGTH).split('');
      const newCode = [...code];
      digits.forEach((d, i) => { if (index + i < CODE_LENGTH) newCode[index + i] = d; });
      setCode(newCode);
      inputRefs.current[Math.min(index + digits.length, CODE_LENGTH - 1)]?.focus();
      return;
    }

    const newCode = [...code];
    newCode[index] = cleaned;
    setCode(newCode);
    if (cleaned && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }, [code]);

  const handleKeyPress = useCallback((key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [code]);

  // ── Vérification ────────────────────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    if (!isComplete) return;
    if (!registration_id) {
      setCustomAlert({
        variant: 'error',
        title: t('common.error'),
        message: t('auth.verify.sessionInvalid'),
      });
      return;
    }
    setLoading(true);
    setCustomAlert(null);
    try {
      const response = await fetch(`${API_URL}/auth/register/verify/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id, code: fullCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        setCustomAlert({
          variant: 'error',
          title: t('auth.verify.invalidCodeTitle'),
          message: data.error || data.message || data.detail || t('auth.verify.invalidCodeMsg'),
        });
        setCode(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        return;
      }

      if (data.access && data.refresh) {
        await secureStorage.setItem('access_token', data.access);
        await secureStorage.setItem('refresh_token', data.refresh);
        try {
          await legalService.recordConsent({
            terms_version: '1.0.0',
            privacy_version: '1.0.0',
            consent_date: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Consentement légal ignoré :', e);
        }
        await refreshUser();
      }
      setCustomAlert({ variant: 'success', title: t('auth.verify.accountCreatedTitle'), message: t('auth.verify.accountCreatedMsg') });

      // ── Redirection post-vérification ─────────────────────────────────────
      // Si l'utilisateur arrive d'un AuthGate (returnTo défini), on le ramène
      // à son point de départ (typiquement /order/checkout). Sinon, on suit
      // le comportement par défaut basé sur son rôle.
      const role = data.user?.role;
      setTimeout(() => {
        if (returnTo) {
          try {
            router.replace(returnTo as any);
            return;
          } catch (navError) {
            console.warn('⚠️ Redirection returnTo échouée, fallback rôle:', navError);
          }
        }
        if (role === 'restaurateur') {
          router.replace('/(restaurant)');
        } else {
          router.replace('/(client)');
        }
      }, 1000);
    } catch {
      setCustomAlert({ variant: 'error', title: t('auth.verify.networkErrorTitle'), message: t('auth.verify.networkErrorMsg') });
    } finally {
      setLoading(false);
    }
  }, [fullCode, isComplete, registration_id, refreshUser, returnTo]);

  // ── Renvoi ──────────────────────────────────────────────────────────────────
  const handleResend = useCallback(async () => {
    if (!canResend || !registration_id) return;
    setResendLoading(true);
    setCustomAlert(null);
    try {
      const response = await fetch(`${API_URL}/auth/register/resend/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCustomAlert({ variant: 'error', title: t('common.error'), message: data.error || t('auth.verify.resendError') });
        return;
      }
      setCanResend(false);
      setResendCountdown(RESEND_COOLDOWN);
      setCode(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      setCustomAlert({
        variant: 'success',
        title: t('auth.verify.codeResentTitle'),
        message: t('auth.verify.codeResentMsg', { email: email_masked }),
      });
    } catch {
      setCustomAlert({ variant: 'error', title: t('common.error'), message: t('errors.generic') });
    } finally {
      setResendLoading(false);
    }
  }, [canResend, registration_id, email_masked]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const styles = StyleSheet.create({
    // Layout principal
    gradient:  { flex: 1 },
    container: { flex: 1 },
    inner: {
      flex: 1,
      paddingHorizontal: sp(SPACING.container),
      paddingTop:    insets.top + sp(SPACING.md),
      paddingBottom: insets.bottom + sp(SPACING.xl),
    },

    backButton: {
      alignSelf: 'flex-start',
      padding: sp(SPACING.sm),
      marginBottom: sp(SPACING.sm),
    },

    // ── Zone titre ─────────────────────────────────────────────────────────
    headerSection: {
      alignItems: 'center',
      marginBottom: sp(SPACING['2xl']),
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(255, 255, 255, 0.10)',
      borderWidth: 1.5,
      borderColor: 'rgba(212, 175, 55, 0.40)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: sp(SPACING.md),
    },
    title: {
      fontSize: sp(TYPOGRAPHY.fontSize['2xl']),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.inverse,             // '#FFFFFF'
      textAlign: 'center',
      marginBottom: sp(SPACING.sm),
    },
    subtitle: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color: 'rgba(255, 255, 255, 0.75)',
      textAlign: 'center',
      lineHeight: sp(TYPOGRAPHY.fontSize.sm) * TYPOGRAPHY.lineHeight.relaxed,
    },
    phoneHighlight: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.secondary,               // or #D4AF37
    },

    // ── Card ───────────────────────────────────────────────────────────────
    card: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS['3xl'],     // 20
      padding: sp(SPACING.xl),
      ...SHADOWS.card,
    },
    // Liseré doré sous le bord haut de la card
    goldenAccent: {
      height: 3,
      backgroundColor: colors.secondary,
      borderRadius: BORDER_RADIUS.full,
      marginBottom: sp(SPACING.lg),
      opacity: 0.40,
    },
    alert: {
      marginBottom: sp(SPACING.md),
    },

    // Bandeau d'info si on revient d'un AuthGate (returnTo défini)
    returnToBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(212, 175, 55, 0.12)',
      borderLeftWidth: 3,
      borderLeftColor: COLORS.secondary,
      padding: sp(SPACING.sm),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: sp(SPACING.md),
    },
    returnToBannerText: {
      flex: 1,
      fontSize: sp(TYPOGRAPHY.fontSize.xs),
      color: colors.text.primary,
      lineHeight: sp(TYPOGRAPHY.fontSize.xs) * TYPOGRAPHY.lineHeight.relaxed,
    },

    cardLabel: {
      fontSize: sp(TYPOGRAPHY.fontSize.base),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: sp(SPACING.lg),
    },

    // ── OTP ────────────────────────────────────────────────────────────────
    codeContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: sp(SPACING.sm),
      marginBottom: sp(SPACING.sm),
    },
    codeInput: {
      width: 46,
      height: 56,
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1.5,
      borderColor: colors.border.default,
      textAlign: 'center',
      fontSize: sp(TYPOGRAPHY.fontSize.xl),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      backgroundColor: colors.background,
    },
    codeInputFilled: {
      borderColor: colors.primary,
      backgroundColor: colors.variants.primary[50],
      color: colors.primary,
    },
    codeInputActive: {
      borderColor: colors.primary,
      borderWidth: 2,
    },

    expiryText: {
      fontSize: sp(TYPOGRAPHY.fontSize.xs),
      color: colors.text.light,
      textAlign: 'center',
      marginBottom: sp(SPACING.lg),
    },

    verifyButton: {
      marginBottom: sp(SPACING.lg),
    },

    // ── Renvoi ─────────────────────────────────────────────────────────────
    resendContainer: {
      alignItems: 'center',
      gap: sp(SPACING.xs),
      marginBottom: sp(SPACING.md),
    },
    resendText: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color: colors.text.secondary,
    },
    resendLink: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.primary,
      textDecorationLine: 'underline',
    },
    resendCountdown: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color: colors.text.light,
    },

    // ── Lien retour ────────────────────────────────────────────────────────
    backLink:     { alignItems: 'center', paddingTop: sp(SPACING.xs) },
    backLinkText: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color: colors.text.light,
    },
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <LinearGradient
      colors={gradientColors}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <StatusBar barStyle="light-content" />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.inner}>

          {/* Retour */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text.inverse} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={34} color={COLORS.secondary} />
            </View>
            <Text style={styles.title}>{t('auth.verify.title')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.verify.sentTo')}{'\n'}
              <Text style={styles.phoneHighlight}>{email_masked || '···@···'}</Text>
            </Text>
          </View>

          {/* Card blanche */}
          <View style={styles.card}>

            {/* Liseré doré */}
            <View style={styles.goldenAccent} />

            {/* Bandeau d'info si on revient d'un AuthGate */}
            {returnTo && (
              <View style={styles.returnToBanner}>
                <Ionicons name="information-circle" size={16} color={COLORS.secondary} />
                <Text style={styles.returnToBannerText}>
                  {t('auth.verify.returnToBanner')}
                </Text>
              </View>
            )}

            {/* Alerte */}
            {customAlert && (
              <CustomAlert
                variant={customAlert.variant}
                title={customAlert.title}
                message={customAlert.message}
                autoDismiss={customAlert.variant === 'success'}
                autoDismissDuration={3000}
                onDismiss={() => setCustomAlert(null)}
                style={styles.alert}
              />
            )}

            <Text style={styles.cardLabel}>{t('auth.verify.enterCode')}</Text>

            {/* OTP inputs */}
            <View style={styles.codeContainer}>
              {Array(CODE_LENGTH).fill(null).map((_, index) => (
                <TextInput
                  key={index}
                  ref={ref => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.codeInput,
                    code[index] ? styles.codeInputFilled : undefined,
                    index === code.findIndex(c => !c) ? styles.codeInputActive : undefined,
                  ]}
                  value={code[index]}
                  onChangeText={v => handleCodeChange(v, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  autoFocus={index === 0}
                />
              ))}
            </View>

            {/* Expiration */}
            {expires_in && (
              <Text style={styles.expiryText}>
                {t('auth.verify.expiresIn', { minutes: Math.round(Number(expires_in) / 60) })}
              </Text>
            )}

            {/* Confirmer */}
            <Button
              title={t('auth.verify.confirm')}
              onPress={handleVerify}
              disabled={!isComplete || loading}
              loading={loading}
              style={styles.verifyButton}
            />

            {/* Renvoi */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>{t('auth.verify.noCode')}</Text>
              {canResend ? (
                <TouchableOpacity onPress={handleResend} disabled={resendLoading}>
                  {resendLoading
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Text style={styles.resendLink}>{t('auth.verify.resend')}</Text>
                  }
                </TouchableOpacity>
              ) : (
                <Text style={styles.resendCountdown}>{t('auth.verify.resendIn', { seconds: resendCountdown })}</Text>
              )}
            </View>

            {/* Modifier le numéro */}
            <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
              <Text style={styles.backLinkText}>{t('auth.verify.editEmail')}</Text>
            </TouchableOpacity>

          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}