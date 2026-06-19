import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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

// ============================================================================
// CONSTANTES — Commission plateforme (exportées car réutilisées ailleurs)
// ============================================================================

export const PLATFORM_COMMISSION_RATE = 0.02; // 2%
export const PLATFORM_COMMISSION_PERCENT = 2;

// Estimation frais Stripe (variable selon pays et type de carte)
export const STRIPE_FEE_PERCENT = 1.4;
export const STRIPE_FEE_FIXED = 0.25; // €

// ============================================================================
// TYPES
// ============================================================================

interface StripeCommissionInfoProps {
  /** Mode compact (moins de détails). */
  compact?: boolean;
  /** Afficher le bloc d'exemple de calcul. */
  showExample?: boolean;
  /** Montant exemple pour le calcul (défaut : 50€). */
  exampleAmount?: number;
  /** Callback à l'acceptation des conditions. */
  onAccept?: () => void;
  /** Afficher la case d'acceptation. */
  showAcceptButton?: boolean;
  /** État d'acceptation. */
  isAccepted?: boolean;
}

export interface CommissionCalculation {
  grossAmount: number;
  platformFee: number;
  stripeFee: number;
  netAmount: number;
}

// ============================================================================
// HELPERS (exportés)
// ============================================================================

export const calculateCommission = (grossAmount: number): CommissionCalculation => {
  const platformFee = grossAmount * PLATFORM_COMMISSION_RATE;
  const stripeFee = (grossAmount * STRIPE_FEE_PERCENT / 100) + STRIPE_FEE_FIXED;
  const netAmount = grossAmount - platformFee - stripeFee;

  return {
    grossAmount: Math.round(grossAmount * 100) / 100,
    platformFee: Math.round(platformFee * 100) / 100,
    stripeFee: Math.round(stripeFee * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
  };
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export const StripeCommissionInfo: React.FC<StripeCommissionInfoProps> = ({
  compact = false,
  showExample = true,
  exampleAmount = 50,
  onAccept,
  showAcceptButton = false,
  isAccepted = false,
}) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  const calculation = calculateCommission(exampleAmount);

  // Formatage devise localisé
  const currencyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'EUR',
      });
    } catch {
      return null;
    }
  }, [i18n.language]);

  const formatCurrency = (amount: number): string => {
    if (currencyFormatter) return currencyFormatter.format(amount);
    return `${amount.toFixed(2)} €`;
  };

  // ── Mode compact ─────────────────────────────────────────────────────
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactHeader}>
          <Ionicons name="information-circle" size={20} color={colors.info} />
          <Text style={styles.compactTitle}>
            {t('stripeCommission.compact.title')}
          </Text>
        </View>
        <Text style={styles.compactText}>
          {t('stripeCommission.compact.description', {
            percent: PLATFORM_COMMISSION_PERCENT,
          })}
        </Text>
      </View>
    );
  }

  // ── Mode complet ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="card-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('stripeCommission.title')}</Text>
          <Text style={styles.subtitle}>{t('stripeCommission.subtitle')}</Text>
        </View>
      </View>

      {/* Commission EatQuickeR */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t('stripeCommission.platform.title')}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{PLATFORM_COMMISSION_PERCENT}%</Text>
          </View>
        </View>
        <Text style={styles.sectionDescription}>
          {t('stripeCommission.platform.description', {
            percent: PLATFORM_COMMISSION_PERCENT,
          })}
        </Text>
      </View>

      {/* Frais Stripe */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t('stripeCommission.stripe.title')}
          </Text>
          <View style={[styles.badge, styles.badgeSecondary]}>
            <Text style={[styles.badgeText, styles.badgeTextSecondary]}>
              ~{STRIPE_FEE_PERCENT}% + {formatCurrency(STRIPE_FEE_FIXED)}
            </Text>
          </View>
        </View>
        <Text style={styles.sectionDescription}>
          {t('stripeCommission.stripe.description')}
        </Text>
      </View>

      {/* Exemple de calcul */}
      {showExample && (
        <View style={styles.exampleContainer}>
          <Text style={styles.exampleTitle}>
            {t('stripeCommission.example.title', {
              amount: formatCurrency(exampleAmount),
            })}
          </Text>

          <View style={styles.calculationRow}>
            <Text style={styles.calculationLabel}>
              {t('stripeCommission.example.orderAmount')}
            </Text>
            <Text style={styles.calculationValue}>
              {formatCurrency(calculation.grossAmount)}
            </Text>
          </View>

          <View style={styles.calculationRow}>
            <Text style={styles.calculationLabel}>
              {t('stripeCommission.example.platformFee', {
                percent: PLATFORM_COMMISSION_PERCENT,
              })}
            </Text>
            <Text style={styles.calculationValueNegative}>
              − {formatCurrency(calculation.platformFee)}
            </Text>
          </View>

          <View style={styles.calculationRow}>
            <Text style={styles.calculationLabel}>
              {t('stripeCommission.example.stripeFee')}
            </Text>
            <Text style={styles.calculationValueNegative}>
              − {formatCurrency(calculation.stripeFee)}
            </Text>
          </View>

          <View style={[styles.calculationRow, styles.calculationTotal]}>
            <Text style={styles.calculationTotalLabel}>
              {t('stripeCommission.example.netAmount')}
            </Text>
            <Text style={styles.calculationTotalValue}>
              {formatCurrency(calculation.netAmount)}
            </Text>
          </View>
        </View>
      )}

      {/* Bullet points info */}
      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={colors.info}
        />
        <View style={styles.infoContent}>
          <Text style={styles.infoText}>
            {`• ${t('stripeCommission.bullets.autoDeduct')}\n• ${t(
              'stripeCommission.bullets.cashNoFee',
            )}\n• ${t('stripeCommission.bullets.directPayout')}`}
          </Text>
        </View>
      </View>

      {/* Bouton d'acceptation */}
      {showAcceptButton && (
        <TouchableOpacity
          style={[
            styles.acceptButton,
            isAccepted && styles.acceptButtonAccepted,
          ]}
          onPress={onAccept}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.checkbox,
              isAccepted && styles.checkboxChecked,
            ]}
          >
            {isAccepted && (
              <Ionicons name="checkmark" size={16} color={colors.text.inverse} />
            )}
          </View>
          <Text style={styles.acceptButtonText}>
            {t('stripeCommission.acceptTerms')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================

const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    // Container principal
    container: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.lg, screenType),
      marginVertical: getResponsiveValue(SPACING.sm, screenType),
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.card,
    },

    // En-tête
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.18)'
        : colors.variants.primary[50],
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: 2,
    },
    subtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
    },

    // Sections
    section: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      flex: 1,
      marginRight: 8,
    },
    sectionDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      lineHeight: 20,
    },

    // Badge
    badge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.lg,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.inverse,
    },
    badgeSecondary: {
      backgroundColor: isDark
        ? 'rgba(255, 255, 255, 0.08)'
        : colors.border.light,
    },
    badgeTextSecondary: {
      color: colors.text.secondary,
    },

    // Exemple
    exampleContainer: {
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.md, screenType),
      marginTop: 8,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    exampleTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: 12,
    },
    calculationRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    calculationLabel: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginRight: 8,
    },
    calculationValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.primary,
    },
    calculationValueNegative: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.warning,
    },
    calculationTotal: {
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      marginTop: 8,
      paddingTop: 12,
    },
    calculationTotalLabel: {
      fontSize: 15,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    calculationTotalValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.success,
    },

    // Info box
    infoBox: {
      flexDirection: 'row',
      backgroundColor: isDark
        ? 'rgba(59, 130, 246, 0.10)'
        : 'rgba(59, 130, 246, 0.08)',
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    infoContent: {
      flex: 1,
      marginLeft: 10,
    },
    infoText: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 20,
    },

    // Bouton d'acceptation
    acceptButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    acceptButtonAccepted: {
      backgroundColor: isDark
        ? 'rgba(16, 185, 129, 0.10)'
        : 'rgba(16, 185, 129, 0.10)',
      borderColor: colors.success,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 2,
      borderColor: colors.border.default,
      marginRight: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxChecked: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    acceptButtonText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.primary,
    },

    // Mode compact
    compactContainer: {
      backgroundColor: isDark
        ? 'rgba(59, 130, 246, 0.10)'
        : 'rgba(59, 130, 246, 0.08)',
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.info,
    },
    compactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    compactTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginLeft: 8,
    },
    compactText: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
  });
};

export default StripeCommissionInfo;