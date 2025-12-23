import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PLATFORM_COMMISSION_RATE, PLATFORM_COMMISSION_PERCENT } from './StripeCommissionInfo';

// ============================================================================
// DESIGN SYSTEM
// ============================================================================

const COLORS = {
  primary: '#1E2A78',
  secondary: '#FFC845',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    light: '#64748B',
    inverse: '#FFFFFF',
  },
  border: {
    light: '#E2E8F0',
    medium: '#CBD5E1',
  },
};

// ============================================================================
// TYPES
// ============================================================================

interface RevenueCommissionCardProps {
  /** Chiffre d'affaires brut (paiements carte uniquement) */
  grossRevenueCard: number;
  /** Chiffre d'affaires paiements espèces */
  grossRevenueCash?: number;
  /** Période affichée (ex: "Ce mois", "Cette semaine") */
  periodLabel?: string;
  /** Nombre de commandes payées par carte */
  cardOrdersCount?: number;
  /** Nombre de commandes payées en espèces */
  cashOrdersCount?: number;
  /** Afficher les détails étendus */
  showDetails?: boolean;
  /** Callback pour voir plus de détails */
  onViewDetails?: () => void;
  /** Mode compact */
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
// HELPERS
// ============================================================================

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

const formatPercent = (value: number): string => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export const RevenueCommissionCard: React.FC<RevenueCommissionCardProps> = ({
  grossRevenueCard,
  grossRevenueCash = 0,
  periodLabel = 'Ce mois',
  cardOrdersCount = 0,
  cashOrdersCount = 0,
  showDetails = true,
  onViewDetails,
  compact = false,
}) => {
  // Calcul de la répartition des revenus
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

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <View>
            <Text style={styles.compactLabel}>Revenu net</Text>
            <Text style={styles.compactValue}>{formatCurrency(breakdown.netRevenue)}</Text>
          </View>
          <View style={styles.compactBadge}>
            <Ionicons name="trending-up" size={14} color={COLORS.success} />
            <Text style={styles.compactBadgeText}>{periodLabel}</Text>
          </View>
        </View>
        {breakdown.platformFee > 0 && (
          <Text style={styles.compactSubtext}>
            Commission EatQuickeR : {formatCurrency(breakdown.platformFee)}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Ionicons name="wallet-outline" size={22} color={COLORS.primary} />
          </View>
          <View>
            <Text style={styles.title}>Revenus</Text>
            <Text style={styles.subtitle}>{periodLabel}</Text>
          </View>
        </View>
        {onViewDetails && (
          <TouchableOpacity onPress={onViewDetails} style={styles.detailsButton}>
            <Text style={styles.detailsButtonText}>Détails</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Montant principal - Revenu Net */}
      <View style={styles.mainAmount}>
        <Text style={styles.mainAmountLabel}>Revenu net estimé</Text>
        <Text style={styles.mainAmountValue}>{formatCurrency(breakdown.netRevenue)}</Text>
        <Text style={styles.mainAmountSubtext}>
          {totalOrders} commande{totalOrders > 1 ? 's' : ''}
        </Text>
      </View>

      {/* Détails de la répartition */}
      {showDetails && (
        <View style={styles.breakdownContainer}>
          {/* CA Brut */}
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownSectionTitle}>Chiffre d'affaires brut</Text>
            
            {/* Paiements carte */}
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownRowLeft}>
                <Ionicons name="card-outline" size={16} color={COLORS.text.secondary} />
                <Text style={styles.breakdownLabel}>Paiements carte</Text>
                {cardOrdersCount > 0 && (
                  <Text style={styles.breakdownCount}>({cardOrdersCount})</Text>
                )}
              </View>
              <Text style={styles.breakdownValue}>{formatCurrency(breakdown.grossCard)}</Text>
            </View>

            {/* Paiements espèces */}
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownRowLeft}>
                <Ionicons name="cash-outline" size={16} color={COLORS.text.secondary} />
                <Text style={styles.breakdownLabel}>Paiements espèces</Text>
                {cashOrdersCount > 0 && (
                  <Text style={styles.breakdownCount}>({cashOrdersCount})</Text>
                )}
              </View>
              <Text style={styles.breakdownValue}>{formatCurrency(breakdown.grossCash)}</Text>
            </View>

            {/* Total brut */}
            <View style={[styles.breakdownRow, styles.breakdownRowTotal]}>
              <Text style={styles.breakdownTotalLabel}>Total brut</Text>
              <Text style={styles.breakdownTotalValue}>{formatCurrency(breakdown.grossTotal)}</Text>
            </View>
          </View>

          {/* Commission */}
          <View style={styles.breakdownSection}>
            <Text style={styles.breakdownSectionTitle}>Frais et commissions</Text>
            
            <View style={styles.breakdownRow}>
              <View style={styles.breakdownRowLeft}>
                <Ionicons name="remove-circle-outline" size={16} color={COLORS.warning} />
                <Text style={styles.breakdownLabel}>
                  Commission EatQuickeR ({PLATFORM_COMMISSION_PERCENT}%)
                </Text>
              </View>
              <Text style={styles.breakdownValueNegative}>
                - {formatCurrency(breakdown.platformFee)}
              </Text>
            </View>

            <View style={styles.infoNote}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.info} />
              <Text style={styles.infoNoteText}>
                Applicable uniquement aux paiements par carte. Les frais Stripe sont déduits séparément.
              </Text>
            </View>
          </View>

          {/* Résultat net */}
          <View style={styles.netResultContainer}>
            <View style={styles.netResultRow}>
              <Text style={styles.netResultLabel}>Revenu net estimé</Text>
              <Text style={styles.netResultValue}>{formatCurrency(breakdown.netRevenue)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Légende */}
      {!showDetails && breakdown.platformFee > 0 && (
        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.legendText}>
              CA brut : {formatCurrency(breakdown.grossTotal)}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.warning }]} />
            <Text style={styles.legendText}>
              Commission : {formatCurrency(breakdown.platformFee)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  // Container principal
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    borderRadius: 10,
    backgroundColor: `${COLORS.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailsButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
    marginRight: 4,
  },

  // Montant principal
  mainAmount: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    marginBottom: 16,
  },
  mainAmountLabel: {
    fontSize: 13,
    color: COLORS.text.secondary,
    marginBottom: 4,
  },
  mainAmountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.success,
  },
  mainAmountSubtext: {
    fontSize: 13,
    color: COLORS.text.light,
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
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.secondary,
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
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  breakdownCount: {
    fontSize: 12,
    color: COLORS.text.light,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.primary,
  },
  breakdownValueNegative: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.warning,
  },
  breakdownRowTotal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    marginTop: 4,
    paddingTop: 10,
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  breakdownTotalValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  // Info note
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${COLORS.info}08`,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    gap: 8,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.text.secondary,
    lineHeight: 16,
  },

  // Résultat net
  netResultContainer: {
    backgroundColor: `${COLORS.success}10`,
    borderRadius: 12,
    padding: 16,
  },
  netResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netResultLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  netResultValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.success,
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
    fontSize: 12,
    color: COLORS.text.secondary,
  },

  // Compact mode
  compactContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactLabel: {
    fontSize: 13,
    color: COLORS.text.secondary,
    marginBottom: 2,
  },
  compactValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.success,
  },
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.success}10`,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  compactBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.success,
  },
  compactSubtext: {
    fontSize: 12,
    color: COLORS.text.light,
    marginTop: 8,
  },
});

export default RevenueCommissionCard;
