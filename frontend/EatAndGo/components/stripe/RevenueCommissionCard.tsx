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
  PLATFORM_COMMISSION_RATE,
  PLATFORM_COMMISSION_PERCENT,
} from './StripeCommissionInfo';
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
// TYPES
// ============================================================================

interface RevenueCommissionCardProps {
  /** Chiffre d'affaires brut (paiements carte uniquement). */
  grossRevenueCard: number;
  /** Chiffre d'affaires paiements espèces. */
  grossRevenueCash?: number;
  /** Libellé de période (si non fourni, fallback `t('revenueCard.defaultPeriod')`). */
  periodLabel?: string;
  /** Nombre de commandes payées par carte. */
  cardOrdersCount?: number;
  /** Nombre de commandes payées en espèces. */
  cashOrdersCount?: number;
  /** Afficher les détails étendus. */
  showDetails?: boolean;
  /** Callback pour voir plus de détails. */
  onViewDetails?: () => void;
  /** Mode compact. */
  compact?: boolean;
}

interface RevenueBreakdown {
  grossTotal: number;
  grossCard: number;
  grossCash: number;
  platformFee: number;
  netRevenue: number;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export const RevenueCommissionCard: React.FC<RevenueCommissionCardProps> = ({
  grossRevenueCard,
  grossRevenueCash = 0,
  periodLabel,
  cardOrdersCount = 0,
  cashOrdersCount = 0,
  showDetails = true,
  onViewDetails,
  compact = false,
}) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  const effectivePeriodLabel = periodLabel ?? t('revenueCard.defaultPeriod');

  // ── Formatage devise (locale-aware, mémoïsé) ─────────────────────────
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

  // ── Calcul de la répartition ─────────────────────────────────────────
  const breakdown = useMemo((): RevenueBreakdown => {
    const platformFee = grossRevenueCard * PLATFORM_COMMISSION_RATE;
    const grossTotal = grossRevenueCard + grossRevenueCash;
    const netRevenue = grossTotal - platformFee;

    return {
      grossTotal: Math.round(grossTotal * 100) / 100,
      grossCard: Math.round(grossRevenueCard * 100) / 100,
      grossCash: Math.round(grossRevenueCash * 100) / 100,
      platformFee: Math.round(platformFee * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
    };
  }, [grossRevenueCard, grossRevenueCash]);

  const totalOrders = cardOrdersCount + cashOrdersCount;

  // ── Mode compact ─────────────────────────────────────────────────────
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <View>
            <Text style={styles.compactLabel}>{t('revenueCard.netRevenue')}</Text>
            <Text style={styles.compactValue}>
              {formatCurrency(breakdown.netRevenue)}
            </Text>
          </View>
          <View style={styles.compactBadge}>
            <Ionicons name="trending-up" size={14} color={colors.success} />
            <Text style={styles.compactBadgeText}>{effectivePeriodLabel}</Text>
          </View>
        </View>
        {breakdown.platformFee > 0 && (
          <Text style={styles.compactSubtext}>
            {t('revenueCard.platformCommissionLine', {
              amount: formatCurrency(breakdown.platformFee),
            })}
          </Text>
        )}
      </View>
    );
  }

  // ── Mode complet ─────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="wallet-outline" size={22} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>{t('revenueCard.title')}</Text>
            <Text style={styles.subtitle}>{effectivePeriodLabel}</Text>
          </View>
        </View>
        {onViewDetails && (
          <TouchableOpacity
            onPress={onViewDetails}
            style={styles.detailsButton}
            activeOpacity={0.7}
          >
            <Text style={styles.detailsButtonText}>
              {t('revenueCard.details')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Montant principal — revenu net */}
      <View style={styles.mainAmount}>
        <Text style={styles.mainAmountLabel}>
          {t('revenueCard.netRevenueEstimated')}
        </Text>
        <Text style={styles.mainAmountValue}>
          {formatCurrency(breakdown.netRevenue)}
        </Text>
        <Text style={styles.mainAmountSubtext}>
          {t('revenueCard.ordersCount', { count: totalOrders })}
        </Text>
      </View>

      {/* Détails de la répartition */}
      {showDetails && (
        <View style={styles.breakdownContainer}>
          {/* CA Brut */}
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownSectionTitle}>
              {t('revenueCard.grossRevenueTitle')}
            </Text>

            {/* Paiements carte */}
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownRowLeft}>
                <Ionicons
                  name="card-outline"
                  size={16}
                  color={colors.text.secondary}
                />
                <Text style={styles.breakdownLabel}>
                  {t('revenueCard.cardPayments')}
                </Text>
                {cardOrdersCount > 0 && (
                  <Text style={styles.breakdownCount}>({cardOrdersCount})</Text>
                )}
              </View>
              <Text style={styles.breakdownValue}>
                {formatCurrency(breakdown.grossCard)}
              </Text>
            </View>

            {/* Paiements espèces */}
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownRowLeft}>
                <Ionicons
                  name="cash-outline"
                  size={16}
                  color={colors.text.secondary}
                />
                <Text style={styles.breakdownLabel}>
                  {t('revenueCard.cashPayments')}
                </Text>
                {cashOrdersCount > 0 && (
                  <Text style={styles.breakdownCount}>({cashOrdersCount})</Text>
                )}
              </View>
              <Text style={styles.breakdownValue}>
                {formatCurrency(breakdown.grossCash)}
              </Text>
            </View>

            {/* Total brut */}
            <View style={[styles.breakdownRow, styles.breakdownRowTotal]}>
              <Text style={styles.breakdownTotalLabel}>
                {t('revenueCard.grossTotal')}
              </Text>
              <Text style={styles.breakdownTotalValue}>
                {formatCurrency(breakdown.grossTotal)}
              </Text>
            </View>
          </View>

          {/* Frais et commissions */}
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownSectionTitle}>
              {t('revenueCard.feesTitle')}
            </Text>

            <View style={styles.breakdownRow}>
              <View style={styles.breakdownRowLeft}>
                <Ionicons
                  name="remove-circle-outline"
                  size={16}
                  color={colors.warning}
                />
                <Text style={styles.breakdownLabel}>
                  {t('stripeCommission.example.platformFee', {
                    percent: PLATFORM_COMMISSION_PERCENT,
                  })}
                </Text>
              </View>
              <Text style={styles.breakdownValueNegative}>
                − {formatCurrency(breakdown.platformFee)}
              </Text>
            </View>

            <View style={styles.infoNote}>
              <Ionicons
                name="information-circle-outline"
                size={14}
                color={colors.info}
              />
              <Text style={styles.infoNoteText}>
                {t('revenueCard.stripeFeesNote')}
              </Text>
            </View>
          </View>

          {/* Résultat net */}
          <View style={styles.netResultContainer}>
            <View style={styles.netResultRow}>
              <Text style={styles.netResultLabel}>
                {t('revenueCard.netRevenueEstimated')}
              </Text>
              <Text style={styles.netResultValue}>
                {formatCurrency(breakdown.netRevenue)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Légende (mode condensé) */}
      {!showDetails && breakdown.platformFee > 0 && (
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>
              {t('revenueCard.legendGross', {
                amount: formatCurrency(breakdown.grossTotal),
              })}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.legendText}>
              {t('revenueCard.legendCommission', {
                amount: formatCurrency(breakdown.platformFee),
              })}
            </Text>
          </View>
        </View>
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
      marginVertical: 8,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.card,
    },

    // En-tête
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.18)'
        : colors.variants.primary[50],
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginTop: 2,
    },
    detailsButton: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    detailsButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.primary,
      marginRight: 4,
    },

    // Montant principal
    mainAmount: {
      alignItems: 'center',
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
      marginBottom: 16,
    },
    mainAmountLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginBottom: 4,
    },
    mainAmountValue: {
      fontSize: getResponsiveValue({ mobile: 32, tablet: 36, desktop: 40 }, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.success,
    },
    mainAmountSubtext: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.light,
      marginTop: 4,
    },

    // Breakdown
    breakdownContainer: {
      gap: 16,
    },
    breakdownSection: {
      gap: 8,
    },
    breakdownSectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    breakdownRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    breakdownLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
    },
    breakdownCount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.light,
    },
    breakdownValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.primary,
    },
    breakdownValueNegative: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.warning,
    },
    breakdownRowTotal: {
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
      marginTop: 4,
      paddingTop: 10,
    },
    breakdownTotalLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    breakdownTotalValue: {
      fontSize: 15,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },

    // Info note
    infoNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark
        ? 'rgba(59, 130, 246, 0.12)'
        : 'rgba(59, 130, 246, 0.08)',
      borderRadius: BORDER_RADIUS.md,
      padding: 10,
      marginTop: 4,
      gap: 8,
    },
    infoNoteText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      lineHeight: 16,
    },

    // Résultat net
    netResultContainer: {
      backgroundColor: isDark
        ? 'rgba(16, 185, 129, 0.12)'
        : 'rgba(16, 185, 129, 0.10)',
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.md, screenType),
    },
    netResultRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    netResultLabel: {
      fontSize: 15,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    netResultValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.success,
    },

    // Légende
    legendContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 20,
      marginTop: 12,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
    },

    // Mode compact
    compactContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(212, 175, 55, 0.12)'
        : colors.border.light,
    },
    compactRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    compactLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginBottom: 2,
    },
    compactValue: {
      fontSize: getResponsiveValue({ mobile: 22, tablet: 24, desktop: 26 }, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.success,
    },
    compactBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark
        ? 'rgba(16, 185, 129, 0.18)'
        : 'rgba(16, 185, 129, 0.10)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
      gap: 4,
    },
    compactBadgeText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.success,
    },
    compactSubtext: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.light,
      marginTop: 8,
    },
  });
};

export default RevenueCommissionCard;