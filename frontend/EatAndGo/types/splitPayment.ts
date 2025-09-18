export interface SplitPaymentPortion {
  id: string;
  name?: string; // Nom optionnel pour identifier la personne
  amount: number;
  isPaid: boolean;
  paymentIntentId?: string;
  paidAt?: string;
}

export interface SplitPaymentSession {
  orderId: string;
  totalAmount: number;
  tipAmount: number;
  splitType: 'equal' | 'custom';
  portions: SplitPaymentPortion[];
  createdAt: string;
  completedAt?: string;
  isCompleted: boolean;
}

export type SplitPaymentMode = 'none' | 'equal' | 'custom';

// Service pour gérer les paiements divisés
export interface SplitPaymentService {
  // Créer une session de paiement divisé
  createSplitSession(orderId: string, splitType: 'equal' | 'custom', portions: Omit<SplitPaymentPortion, 'id' | 'isPaid' | 'paidAt'>[]): Promise<SplitPaymentSession>;
  
  // Récupérer une session existante
  getSplitSession(orderId: string): Promise<SplitPaymentSession | null>;
  
  // Effectuer un paiement partiel
  payPortion(orderId: string, portionId: string, paymentIntentId: string): Promise<void>;
  
  // Vérifier si tous les paiements sont effectués
  checkCompletion(orderId: string): Promise<{ isCompleted: boolean; remainingAmount: number }>;
  
  // Marquer la commande comme payée si tous les paiements sont effectués
  completePayment(orderId: string): Promise<void>;
}