export interface SplitPaymentPortion {
  id: string;
  name?: string; // Nom optionnel pour identifier la personne
  amount: number;
  isPaid: boolean;
  paymentIntentId?: string;
  paidAt?: string;
  participant_id?: string | null;
  /** IDs des OrderItem claim par cette portion (mode `items` uniquement) */
  claimedItemIds?: number[];
}

export interface SplitPaymentSession {
  orderId: string;
  totalAmount: number;
  tipAmount: number;
  splitType: SplitPaymentMode;
  portions: SplitPaymentPortion[];
  /** IDs des OrderItem encore non claim par aucune portion (mode `items`) */
  unclaimedItemIds?: number[];
  createdAt: string;
  completedAt?: string;
  isCompleted: boolean;
}

export type SplitPaymentMode = 'none' | 'equal' | 'custom' | 'items';

/**
 * Données envoyées au backend pour créer une portion.
 * - `equal` / `custom` : amount obligatoire
 * - `items` : amount=0, participantId obligatoire (1 portion par participant)
 */
export interface CreatePortionInput {
  name: string;
  amount: number;
  participantId?: string | null;
}

// Service pour gérer les paiements divisés
export interface SplitPaymentService {
  // Créer une session de paiement divisé
  createSplitSession(
    orderId: string,
    splitType: SplitPaymentMode,
    portions: CreatePortionInput[],
    tipAmount?: number,
  ): Promise<SplitPaymentSession>;

  // Récupérer une session existante
  getSplitSession(orderId: string): Promise<SplitPaymentSession | null>;

  // Claim/unclaim d'un article (mode `items`)
  claimItem(orderId: string, portionId: string, orderItemId: number): Promise<SplitPaymentSession>;
  unclaimItem(orderId: string, portionId: string, orderItemId: number): Promise<SplitPaymentSession>;

  // Effectuer un paiement partiel
  payPortion(orderId: string, portionId: string, paymentIntentId: string): Promise<void>;

  // Vérifier si tous les paiements sont effectués
  checkCompletion(orderId: string): Promise<{ isCompleted: boolean; remainingAmount: number }>;

  // Marquer la commande comme payée si tous les paiements sont effectués
  completePayment(orderId: string): Promise<void>;
}