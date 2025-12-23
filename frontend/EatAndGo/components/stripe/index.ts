/**
 * Composants et utilitaires pour la gestion des commissions EatQuickeR
 * 
 * Ce module contient :
 * - StripeCommissionInfo : Affiche les conditions tarifaires aux restaurateurs
 * - RevenueCommissionCard : Affiche les revenus avec détail des commissions dans le dashboard
 * - Utilitaires de calcul de commission
 */

export { 
  StripeCommissionInfo, 
  PLATFORM_COMMISSION_RATE,
  PLATFORM_COMMISSION_PERCENT,
  STRIPE_FEE_PERCENT,
  STRIPE_FEE_FIXED,
  calculateCommission,
} from './StripeCommissionInfo';

export { 
  RevenueCommissionCard,
} from './RevenueCommissionCard';

// Types exportés
export type { } from './StripeCommissionInfo';
export type { } from './RevenueCommissionCard';
