import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ============================================================================
// CONSTANTES - Commission plateforme
// ============================================================================

export const PLATFORM_COMMISSION_RATE = 0.02; // 2%
export const PLATFORM_COMMISSION_PERCENT = 2;

// Estimation frais Stripe (variable selon le pays et le type de carte)
export const STRIPE_FEE_PERCENT = 1.4;
export const STRIPE_FEE_FIXED = 0.25; // €

// ============================================================================
// DESIGN SYSTEM
// ============================================================================

const COLORS = {
  primary: '#1E2A78',
  secondary: '#FFC845',
  success: '#10B981',
  warning: '#F59E0B',
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

interface StripeCommissionInfoProps {
  /** Afficher en mode compact (moins de détails) */
  compact?: boolean;
  /** Afficher l'exemple de calcul */
  showExample?: boolean;
  /** Montant exemple pour le calcul (défaut: 50€) */
  exampleAmount?: number;
  /** Callback quand l'utilisateur accepte les conditions */
  onAccept?: () => void;
  /** Afficher le bouton d'acceptation */
  showAcceptButton?: boolean;
  /** État d'acceptation */
  isAccepted?: boolean;
}

interface CommissionCalculation {
  grossAmount: number;
  platformFee: number;
  stripeFee: number;
  netAmount: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calcule la répartition des frais pour un montant donné
 */
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

/**
 * Formate un montant en euros
 */
const formatCurrency = (amount: number): string => {
  return `${amount.toFixed(2).replace('.', ',')} €`;
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
  const calculation = calculateCommission(exampleAmount);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactHeader}>
          <Ionicons name="information-circle" size={20} color={COLORS.info} />
          <Text style={styles.compactTitle}>Commission plateforme</Text>
        </View>
        <Text style={styles.compactText}>
          Une commission de <Text style={styles.highlight}>{PLATFORM_COMMISSION_PERCENT}%</Text> est 
          prélevée sur chaque paiement par carte bancaire.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="card-outline" size={24} color={COLORS.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Tarification des paiements</Text>
          <Text style={styles.subtitle}>Conditions applicables aux paiements par carte</Text>
        </View>
      </View>

      {/* Commission EatQuickeR */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Commission EatQuickeR</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{PLATFORM_COMMISSION_PERCENT}%</Text>
          </View>
        </View>
        <Text style={styles.sectionDescription}>
          Pour chaque commande payée via l'application, EatQuickeR prélève une commission 
          de {PLATFORM_COMMISSION_PERCENT}% sur le montant TTC. Cette commission couvre les frais 
          de mise en relation, de gestion de la plateforme et du support technique.
        </Text>
      </View>

      {/* Frais Stripe */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Frais de traitement Stripe</Text>
          <View style={[styles.badge, styles.badgeSecondary]}>
            <Text style={[styles.badgeText, styles.badgeTextSecondary]}>
              ~{STRIPE_FEE_PERCENT}% + {formatCurrency(STRIPE_FEE_FIXED)}
            </Text>
          </View>
        </View>
        <Text style={styles.sectionDescription}>
          Les frais bancaires Stripe sont appliqués selon leur grille tarifaire standard. 
          Ces frais peuvent varier selon le type de carte utilisée par le client.
        </Text>
      </View>

      {/* Exemple de calcul */}
      {showExample && (
        <View style={styles.exampleContainer}>
          <Text style={styles.exampleTitle}>
            Exemple pour une commande de {formatCurrency(exampleAmount)}
          </Text>
          
          <View style={styles.calculationRow}>
            <Text style={styles.calculationLabel}>Montant de la commande</Text>
            <Text style={styles.calculationValue}>{formatCurrency(calculation.grossAmount)}</Text>
          </View>
          
          <View style={styles.calculationRow}>
            <Text style={styles.calculationLabel}>
              Commission EatQuickeR ({PLATFORM_COMMISSION_PERCENT}%)
            </Text>
            <Text style={styles.calculationValueNegative}>
              - {formatCurrency(calculation.platformFee)}
            </Text>
          </View>
          
          <View style={styles.calculationRow}>
            <Text style={styles.calculationLabel}>
              Frais Stripe (estimés)
            </Text>
            <Text style={styles.calculationValueNegative}>
              - {formatCurrency(calculation.stripeFee)}
            </Text>
          </View>
          
          <View style={[styles.calculationRow, styles.calculationTotal]}>
            <Text style={styles.calculationTotalLabel}>Montant net reçu</Text>
            <Text style={styles.calculationTotalValue}>
              {formatCurrency(calculation.netAmount)}
            </Text>
          </View>
        </View>
      )}

      {/* Points importants */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.info} />
        <View style={styles.infoContent}>
          <Text style={styles.infoText}>
            • La commission est prélevée automatiquement lors du paiement{'\n'}
            • Les paiements en espèces ne sont pas soumis à commission{'\n'}
            • Vous recevez vos fonds directement sur votre compte bancaire
          </Text>
        </View>
      </View>

      {/* Bouton d'acceptation */}
      {showAcceptButton && (
        <TouchableOpacity
          style={[
            styles.acceptButton,
            isAccepted && styles.acceptButtonAccepted
          ]}
          onPress={onAccept}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, isAccepted && styles.checkboxChecked]}>
            {isAccepted && (
              <Ionicons name="checkmark" size={16} color={COLORS.text.inverse} />
            )}
          </View>
          <Text style={styles.acceptButtonText}>
            J'ai lu et j'accepte les conditions tarifaires
          </Text>
        </TouchableOpacity>
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
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: `${COLORS.primary}10`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },

  // Sections
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  sectionDescription: {
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },

  // Badge
  badge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.inverse,
  },
  badgeSecondary: {
    backgroundColor: COLORS.border.light,
  },
  badgeTextSecondary: {
    color: COLORS.text.secondary,
  },

  // Exemple de calcul
  exampleContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  exampleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 12,
  },
  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  calculationLabel: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  calculationValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.primary,
  },
  calculationValueNegative: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.warning,
  },
  calculationTotal: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border.medium,
    marginTop: 8,
    paddingTop: 12,
  },
  calculationTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  calculationTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.success,
  },

  // Info box
  infoBox: {
    flexDirection: 'row',
    backgroundColor: `${COLORS.info}10`,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoContent: {
    flex: 1,
    marginLeft: 10,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },

  // Bouton d'acceptation
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  acceptButtonAccepted: {
    backgroundColor: `${COLORS.success}10`,
    borderColor: COLORS.success,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border.medium,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  acceptButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.primary,
  },

  // Compact mode
  compactContainer: {
    backgroundColor: `${COLORS.info}08`,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.info,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginLeft: 8,
  },
  compactText: {
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 18,
  },
  highlight: {
    fontWeight: '700',
    color: COLORS.primary,
  },
});

export default StripeCommissionInfo;
