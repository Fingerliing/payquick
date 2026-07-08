/**
 * Écran "Réinitialisation du mot de passe" — étape 2
 *
 * L'utilisateur saisit :
 *   - le code à 6 chiffres reçu par email
 *   - son nouveau mot de passe (avec confirmation)
 *
 * Appels API :
 *   - POST /auth/password/confirm/  (validation + changement)
 *   - POST /auth/password/resend/   (renvoi du code)
 *
 * Règles mot de passe (alignées sur l'inscription) :
 *   - 8+ caractères
 *   - 1 majuscule
 *   - 1 chiffre
 *   - 1 caractère spécial
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SystemBars } from 'react-native-edge-to-edge';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert as CustomAlert } from '@/components/ui/Alert';
import { API_BASE_URL } from '@/constants/config';
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
const RESEND_COOLDOWN = 60;
const API_URL = `${API_BASE_URL}/api/v1`;

const GRADIENT: [string, string, string] = [
  COLORS.variants.primary[900],
  COLORS.variants.primary[700],
  COLORS.primary,
];

// Règles mot de passe — alignées avec le backend
const PWD_RULES = {
  minLength: 8,
  hasUpper: /[A-Z]/,
  hasDigit: /\d/,
  hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~;']/,
};

function validatePassword(pwd: string, t: (k: string, o?: any) => string): string | undefined {
  if (pwd.length < PWD_RULES.minLength) {
    return t('auth.reset.pwdMinLength', { n: PWD_RULES.minLength });
  }
  if (!PWD_RULES.hasUpper.test(pwd)) {
    return t('auth.reset.pwdUpper');
  }
  if (!PWD_RULES.hasDigit.test(pwd)) {
    return t('auth.reset.pwdDigit');
  }
  if (!PWD_RULES.hasSpecial.test(pwd)) {
    return t('auth.reset.pwdSpecial');
  }
  return undefined;
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{
    reset_id: string;
    email: string;
    email_masked: string;
    expires_in: string;
  }>();
  const { reset_id, email_masked, expires_in } = params;

  const insets = useSafeAreaInsets();
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  // Dégradé : navy de marque en clair, bleu nuit profond en dark.
  const gradientColors = (isDark
    ? ['#070B18', '#0F1528', '#161D33']
    : GRADIENT) as [string, string, string];

  const sp = (token: { mobile: number; tablet: number; desktop: number }): number =>
    getResponsiveValue(token, screenType);

  // ── State ──────────────────────────────────────────────────────────────────
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();

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

  const fullCode = code.join('');
  const isCodeComplete = fullCode.length === CODE_LENGTH;

  // ── Countdown renvoi ────────────────────────────────────────────────────────
  useEffect(() => {
    if (resendCountdown <= 0) {
      setCanResend(true);
      return;
    }
    const t = setTimeout(() => setResendCountdown((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  // ── Saisie OTP ──────────────────────────────────────────────────────────────
  const handleCodeChange = useCallback(
    (value: string, index: number) => {
      const cleaned = value.replace(/[^0-9]/g, '');

      if (cleaned.length > 1) {
        // Collage (presse-papiers)
        const digits = cleaned.slice(0, CODE_LENGTH).split('');
        const newCode = [...code];
        digits.forEach((d, i) => {
          if (index + i < CODE_LENGTH) newCode[index + i] = d;
        });
        setCode(newCode);
        inputRefs.current[
          Math.min(index + digits.length, CODE_LENGTH - 1)
        ]?.focus();
        return;
      }

      const newCode = [...code];
      newCode[index] = cleaned;
      setCode(newCode);
      if (cleaned && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [code],
  );

  const handleKeyPress = useCallback(
    (key: string, index: number) => {
      if (key === 'Backspace' && !code[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [code],
  );

  // ── Validation locale ───────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    let ok = true;

    if (!isCodeComplete) {
      setCustomAlert({
        variant: 'error',
        title: t('auth.reset.codeIncompleteTitle'),
        message: t('auth.reset.codeIncompleteMsg'),
      });
      ok = false;
    }

    const pwdErr = validatePassword(newPassword, t);
    if (pwdErr) {
      setPasswordError(pwdErr);
      ok = false;
    } else {
      setPasswordError(undefined);
    }

    if (newPassword !== confirmPassword) {
      setConfirmError(t('errors.passwordMismatch'));
      ok = false;
    } else {
      setConfirmError(undefined);
    }

    return ok;
  }, [isCodeComplete, newPassword, confirmPassword]);

  // ── Soumission ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    if (!reset_id) {
      setCustomAlert({
        variant: 'error',
        title: t('auth.reset.invalidRequestTitle'),
        message: t('auth.reset.invalidRequestMsg'),
      });
      return;
    }

    setLoading(true);
    setCustomAlert(null);

    try {
      const response = await fetch(`${API_URL}/auth/password/confirm/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reset_id,
          code: fullCode,
          new_password: newPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        // Code incorrect
        if (response.status === 400 && typeof data?.attempts_remaining === 'number') {
          setCustomAlert({
            variant: 'error',
            title: t('auth.reset.codeIncorrectTitle'),
            message:
              data.attempts_remaining > 0
                ? t('auth.reset.codeInvalidRemaining', { count: data.attempts_remaining })
                : t('auth.reset.tooManyAttempts'),
          });
          setCode(Array(CODE_LENGTH).fill(''));
          inputRefs.current[0]?.focus();
          return;
        }

        // Code expiré ou demande invalide
        if (response.status === 400 || response.status === 404) {
          setCustomAlert({
            variant: 'error',
            title: t('auth.reset.requestExpiredTitle'),
            message:
              data?.error ||
              t('auth.reset.requestExpiredMsg'),
          });
          return;
        }

        // Trop de tentatives
        if (response.status === 429) {
          setCustomAlert({
            variant: 'warning',
            title: t('auth.reset.tooManyTitle'),
            message:
              data?.error ||
              t('auth.reset.tooManyMsg'),
          });
          return;
        }

        // Mot de passe rejeté par le serveur
        if (data?.new_password) {
          const msg = Array.isArray(data.new_password)
            ? data.new_password.join(' ')
            : String(data.new_password);
          setPasswordError(msg);
          return;
        }

        setCustomAlert({
          variant: 'error',
          title: t('common.error'),
          message:
            data?.error ||
            data?.detail ||
            t('auth.reset.genericError'),
        });
        return;
      }

      // Succès
      setCustomAlert({
        variant: 'success',
        title: t('auth.reset.successTitle'),
        message: t('auth.reset.successMsg'),
      });

      // Petite pause pour laisser voir le message de succès
      setTimeout(() => {
        router.replace('/(auth)/login');
      }, 1200);
    } catch (e) {
      setCustomAlert({
        variant: 'error',
        title: t('auth.forgot.networkErrorTitle'),
        message: t('auth.forgot.networkErrorMsg'),
      });
    } finally {
      setLoading(false);
    }
  }, [validate, reset_id, fullCode, newPassword]);

  // ── Renvoi du code ──────────────────────────────────────────────────────────
  const handleResend = useCallback(async () => {
    if (!canResend || !reset_id) return;

    setResendLoading(true);
    setCustomAlert(null);

    try {
      const response = await fetch(`${API_URL}/auth/password/resend/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset_id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setCustomAlert({
          variant: 'error',
          title: t('common.error'),
          message:
            data?.error ||
            data?.detail ||
            t('auth.verify.resendError'),
        });
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
    } catch (e) {
      setCustomAlert({
        variant: 'error',
        title: t('auth.forgot.networkErrorTitle'),
        message: t('auth.forgot.networkErrorMsg'),
      });
    } finally {
      setResendLoading(false);
    }
  }, [canResend, reset_id, email_masked]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const styles = StyleSheet.create({
    gradient: { flex: 1 },
    container: { flex: 1 },
    inner: {
      flexGrow: 1,
      paddingHorizontal: sp(SPACING.container),
      paddingTop: insets.top + sp(SPACING.md),
      paddingBottom: insets.bottom + sp(SPACING.xl),
    },
    backButton: {
      alignSelf: 'flex-start',
      padding: sp(SPACING.sm),
      marginBottom: sp(SPACING.sm),
    },

    // Header
    headerSection: {
      alignItems: 'center',
      marginBottom: sp(SPACING.xl),
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(255, 255, 255, 0.10)',
      borderWidth: 1.5,
      borderColor: COLORS.secondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: sp(SPACING.md),
    },
    title: {
      fontSize: sp(TYPOGRAPHY.fontSize['2xl']),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.inverse,
      textAlign: 'center',
      marginBottom: sp(SPACING.sm),
    },
    subtitle: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color: 'rgba(255, 255, 255, 0.75)',
      textAlign: 'center',
      lineHeight:
        sp(TYPOGRAPHY.fontSize.sm) * TYPOGRAPHY.lineHeight.relaxed,
    },
    emailHighlight: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.secondary,
    },

    // Card
    card: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS['3xl'],
      padding: sp(SPACING.xl),
      ...SHADOWS.card,
    },
    goldenAccent: {
      height: 3,
      backgroundColor: colors.secondary,
      borderRadius: BORDER_RADIUS.full,
      marginBottom: sp(SPACING.lg),
      opacity: 0.4,
    },
    alert: { marginBottom: sp(SPACING.md) },

    sectionLabel: {
      fontSize: sp(TYPOGRAPHY.fontSize.base),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: sp(SPACING.md),
    },

    // OTP
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

    // Séparateur
    divider: {
      height: 1,
      backgroundColor: colors.border.light,
      marginVertical: sp(SPACING.md),
    },

    // Mot de passe
    passwordContainer: { position: 'relative' },
    passwordToggle: {
      position: 'absolute',
      right: 12,
      top: 38,
      padding: 4,
    },
    passwordHintRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 4,
      marginTop: 4,
      paddingHorizontal: 2,
      marginBottom: sp(SPACING.sm),
    },
    passwordHintText: {
      flex: 1,
      fontSize: sp(TYPOGRAPHY.fontSize.xs),
      color: colors.text.light,
      lineHeight:
        sp(TYPOGRAPHY.fontSize.xs) * TYPOGRAPHY.lineHeight.relaxed,
    },

    // Bouton
    submitButton: { marginTop: sp(SPACING.md), marginBottom: sp(SPACING.lg) },

    // Renvoi
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

    // Lien retour
    backLink: { alignItems: 'center', paddingTop: sp(SPACING.xs) },
    backLinkText: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color: colors.text.light,
    },
    backLinkBold: {
      color: colors.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
  });

  return (
    <LinearGradient
      colors={gradientColors}
      style={styles.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Gradient sombre dans les 2 modes → icônes système claires */}
      <SystemBars style="light" />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Retour */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text.inverse} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.iconCircle}>
              <Ionicons name="key-outline" size={34} color={COLORS.secondary} />
            </View>
            <Text style={styles.title}>{t('auth.reset.title')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.verify.sentTo')}{'\n'}
              <Text style={styles.emailHighlight}>
                {email_masked || '···@···'}
              </Text>
            </Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <View style={styles.goldenAccent} />

            {customAlert && (
              <CustomAlert
                variant={customAlert.variant}
                title={customAlert.title}
                message={customAlert.message}
                autoDismiss={customAlert.variant === 'success'}
                autoDismissDuration={2500}
                onDismiss={() => setCustomAlert(null)}
                style={styles.alert}
              />
            )}

            {/* Bloc OTP */}
            <Text style={styles.sectionLabel}>
              {t('auth.reset.step1')}
            </Text>
            <View style={styles.codeContainer}>
              {Array(CODE_LENGTH)
                .fill(null)
                .map((_, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      inputRefs.current[index] = ref;
                    }}
                    style={[
                      styles.codeInput,
                      code[index] ? styles.codeInputFilled : undefined,
                      index === code.findIndex((c) => !c)
                        ? styles.codeInputActive
                        : undefined,
                    ]}
                    value={code[index]}
                    onChangeText={(v) => handleCodeChange(v, index)}
                    onKeyPress={({ nativeEvent }) =>
                      handleKeyPress(nativeEvent.key, index)
                    }
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    autoFocus={index === 0}
                  />
                ))}
            </View>
            {expires_in ? (
              <Text style={styles.expiryText}>
                {t('auth.verify.expiresIn', { minutes: Math.round(Number(expires_in) / 60) })}
              </Text>
            ) : (
              <View style={{ height: sp(SPACING.md) }} />
            )}

            <View style={styles.divider} />

            {/* Bloc nouveau mot de passe */}
            <Text style={styles.sectionLabel}>
              {t('auth.reset.step2')}
            </Text>

            <View style={styles.passwordContainer}>
              <Input
                label={t('auth.reset.newPasswordLabel')}
                placeholder="••••••••"
                value={newPassword}
                onChangeText={(v: string) => {
                  setNewPassword(v);
                  if (passwordError) setPasswordError(undefined);
                }}
                error={passwordError}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password-new"
                required
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword((p) => !p)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.text.light}
                />
              </TouchableOpacity>
              {!passwordError && (
                <View style={styles.passwordHintRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={13}
                    color={colors.text.light}
                  />
                  <Text style={styles.passwordHintText}>
                    {t('auth.passwordHint')}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.passwordContainer}>
              <Input
                label={t('auth.passwordConfirm')}
                placeholder="••••••••"
                value={confirmPassword}
                onChangeText={(v: string) => {
                  setConfirmPassword(v);
                  if (confirmError) setConfirmError(undefined);
                }}
                error={confirmError}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoComplete="password-new"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                required
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowConfirm((p) => !p)}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.text.light}
                />
              </TouchableOpacity>
            </View>

            {/* Bouton de validation */}
            <Button
              title={t('auth.reset.submit')}
              onPress={handleSubmit}
              disabled={loading || !isCodeComplete || !newPassword || !confirmPassword}
              loading={loading}
              variant="primary"
              fullWidth
              style={styles.submitButton}
            />

            {/* Renvoi */}
            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>
                {t('auth.verify.noCode')}
              </Text>
              {canResend ? (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={resendLoading}
                  activeOpacity={0.7}
                >
                  {resendLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.resendLink}>{t('auth.verify.resend')}</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <Text style={styles.resendCountdown}>
                  {t('auth.verify.resendIn', { seconds: resendCountdown })}
                </Text>
              )}
            </View>

            {/* Retour login */}
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => router.replace('/(auth)/login')}
              activeOpacity={0.7}
            >
              <Text style={styles.backLinkText}>
                {t('auth.forgot.backToPrefix')}{' '}
                <Text style={styles.backLinkBold}>{t('auth.forgot.backToLogin')}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}