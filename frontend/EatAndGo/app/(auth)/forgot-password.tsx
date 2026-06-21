/**
 * Écran "Mot de passe oublié" — étape 1
 *
 * L'utilisateur saisit son email. On envoie un code à 6 chiffres par email
 * via POST /api/v1/auth/password/forgot/, puis on navigue vers reset-password
 * avec reset_id et email_masked.
 *
 * Sécurité :
 * - L'API ne révèle JAMAIS si l'email existe ou non. Côté front, on traite
 *   un succès comme un succès même si reset_id est null (pour les emails
 *   inconnus).
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

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

const API_URL = `${API_BASE_URL}/api/v1`;

const GRADIENT: [string, string, string] = [
  COLORS.variants.primary[900],
  COLORS.variants.primary[700],
  COLORS.primary,
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
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

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [customAlert, setCustomAlert] = useState<{
    variant?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(t('errors.requiredField'));
      return false;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setEmailError(t('errors.invalidEmail'));
      return false;
    }
    setEmailError(undefined);
    return true;
  }, [email]);

  // ── Soumission ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    setLoading(true);
    setCustomAlert(null);

    try {
      const response = await fetch(`${API_URL}/auth/password/forgot/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await response.json();

      if (response.status === 429) {
        setCustomAlert({
          variant: 'warning',
          title: t('auth.forgot.rateLimitTitle'),
          message: t('auth.forgot.rateLimitMsg'),
        });
        return;
      }

      if (!response.ok) {
        setCustomAlert({
          variant: 'error',
          title: t('common.error'),
          message:
            data?.error ||
            data?.detail ||
            t('auth.forgot.sendError'),
        });
        return;
      }

      // Succès — toujours générique, qu'un compte existe ou non.
      // On navigue vers l'écran de saisie du code en passant les infos
      // utiles (reset_id peut être null si l'email est inconnu, dans ce
      // cas la confirmation échouera côté API mais l'utilisateur reçoit
      // le même message).
      router.push({
        pathname: '/(auth)/reset-password',
        params: {
          reset_id: data.reset_id ?? '',
          email: email.trim().toLowerCase(),
          email_masked: data.email ?? '',
          expires_in: String(data.expires_in ?? 600),
        },
      });
    } catch (e) {
      setCustomAlert({
        variant: 'error',
        title: t('auth.forgot.networkErrorTitle'),
        message: t('auth.forgot.networkErrorMsg'),
      });
    } finally {
      setLoading(false);
    }
  }, [email, validate]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const styles = StyleSheet.create({
    gradient: { flex: 1 },
    container: { flex: 1 },
    inner: {
      flex: 1,
      paddingHorizontal: sp(SPACING.container),
      paddingTop: insets.top + sp(SPACING.md),
      paddingBottom: insets.bottom + sp(SPACING.xl),
    },
    backButton: {
      alignSelf: 'flex-start',
      padding: sp(SPACING.sm),
      marginBottom: sp(SPACING.sm),
    },

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
      paddingHorizontal: sp(SPACING.md),
    },

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

    cardLabel: {
      fontSize: sp(TYPOGRAPHY.fontSize.base),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: sp(SPACING.sm),
    },
    cardSubtitle: {
      fontSize: sp(TYPOGRAPHY.fontSize.sm),
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight:
        sp(TYPOGRAPHY.fontSize.sm) * TYPOGRAPHY.lineHeight.relaxed,
      marginBottom: sp(SPACING.lg),
    },

    submitButton: { marginTop: sp(SPACING.md), marginBottom: sp(SPACING.md) },

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
      <StatusBar barStyle="light-content" />

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
              <Ionicons
                name="lock-closed-outline"
                size={34}
                color={COLORS.secondary}
              />
            </View>
            <Text style={styles.title}>{t('auth.forgot.title')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.forgot.subtitle')}
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
                onDismiss={() => setCustomAlert(null)}
                style={styles.alert}
              />
            )}

            <Text style={styles.cardLabel}>{t('auth.forgot.cardLabel')}</Text>
            <Text style={styles.cardSubtitle}>
              {t('auth.forgot.cardSubtitle')}
            </Text>

            <Input
              label={t('auth.email')}
              placeholder="votre@email.com"
              value={email}
              onChangeText={(v: string) => {
                setEmail(v);
                if (emailError) setEmailError(undefined);
              }}
              error={emailError}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              required
            />

            <Button
              title={t('auth.forgot.sendCode')}
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || !email.trim()}
              variant="primary"
              fullWidth
              style={styles.submitButton}
            />

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