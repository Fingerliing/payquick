import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

interface ValidationStatus {
  needsValidation: boolean;
  message: string;
  canCreateRestaurant: boolean;
  stripeVerified?: boolean;
  isActive?: boolean;
}

interface ValidationPendingProps {
  validationStatus: ValidationStatus;
}

export const ValidationPending: React.FC<ValidationPendingProps> = ({
  validationStatus,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  // Conservé pour parité d'API (potentiellement nécessaire à un futur affichage)
  useAuth();

  const handleStripeSetup = () => router.push('/(auth)/stripe');

  const handleContactSupport = () => {
    const subject = encodeURIComponent(
      t('validationPending.supportEmailSubject'),
    );
    Linking.openURL(`mailto:contact@eatquicker.fr?subject=${subject}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="schedule" size={64} color={colors.warning} />
      </View>

      <Text style={styles.title}>{t('validationPending.title')}</Text>

      <Text style={styles.message}>{validationStatus.message}</Text>

      <View style={styles.statusContainer}>
        <View style={styles.statusItem}>
          <MaterialIcons
            name={validationStatus.stripeVerified ? 'check-circle' : 'schedule'}
            size={20}
            color={
              validationStatus.stripeVerified ? colors.success : colors.warning
            }
          />
          <Text style={styles.statusText}>
            {validationStatus.stripeVerified
              ? t('validationPending.stripeCompleted')
              : t('validationPending.stripePending')}
          </Text>
        </View>

        <View style={styles.statusItem}>
          <MaterialIcons
            name={validationStatus.isActive ? 'check-circle' : 'schedule'}
            size={20}
            color={
              validationStatus.isActive ? colors.success : colors.warning
            }
          />
          <Text style={styles.statusText}>
            {validationStatus.isActive
              ? t('validationPending.profileActivated')
              : t('validationPending.profilePending')}
          </Text>
        </View>
      </View>

      <View style={styles.actionContainer}>
        {!validationStatus.stripeVerified && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleStripeSetup}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name="payment"
              size={20}
              color={colors.text.inverse}
            />
            <Text style={styles.primaryButtonText}>
              {t('validationPending.setupStripe')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleContactSupport}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="help-outline"
            size={20}
            color={colors.text.secondary}
          />
          <Text style={styles.secondaryButtonText}>
            {t('validationPending.contactSupport')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoContainer}>
        <MaterialIcons
          name="info-outline"
          size={16}
          color={colors.text.secondary}
        />
        <Text style={styles.infoText}>
          {t('validationPending.infoDelay')}
        </Text>
      </View>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// STYLES (fabrique theme-aware)
// ──────────────────────────────────────────────────────────────────────────
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: colors.background,
    },

    iconContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },

    message: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
      lineHeight: 22,
    },

    statusContainer: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
      gap: 12,
      // Hairline dorée subtile en dark, neutre en light
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.card,
    },

    statusItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    statusText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.primary,
    },

    actionContainer: {
      width: '100%',
      gap: 10,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 14,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      gap: 8,
      ...shadows.sm,
    },

    primaryButtonText: {
      color: colors.text.inverse,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 14,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border.default,
    },

    secondaryButtonText: {
      color: colors.text.primary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    infoContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark
        ? 'rgba(59, 130, 246, 0.10)'
        : colors.variants.primary[50],
      padding: 12,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
    },

    infoText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      lineHeight: 18,
    },
  });
};