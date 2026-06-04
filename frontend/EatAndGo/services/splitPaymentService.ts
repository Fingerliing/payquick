import { apiClient } from './api';
import {
  SplitPaymentSession,
  SplitPaymentPortion,
  SplitPaymentMode,
  CreatePortionInput,
} from '@/types/splitPayment';

// Helper de mapping interne — évite de dupliquer la logique entre create/get/claim
function mapPortion(p: any): SplitPaymentPortion {
  return {
    id: p.id,
    name: p.name,
    amount: parseFloat(p.amount) || 0,
    isPaid: p.is_paid || false,
    paymentIntentId: p.payment_intent_id,
    paidAt: p.paid_at,
    participant_id: p.participant || null,
    claimedItemIds: Array.isArray(p.claimed_item_ids)
      ? p.claimed_item_ids.map((id: any) => Number(id))
      : [],
  };
}

function mapSession(response: any, orderId: string): SplitPaymentSession {
  return {
    orderId,
    totalAmount: parseFloat(response.total_amount) || 0,
    tipAmount: parseFloat(response.tip_amount) || 0,
    splitType: response.split_type as SplitPaymentMode,
    portions: (response.portions || []).map(mapPortion),
    unclaimedItemIds: Array.isArray(response.unclaimed_item_ids)
      ? response.unclaimed_item_ids.map((id: any) => Number(id))
      : [],
    createdAt: response.created_at,
    completedAt: response.completed_at,
    isCompleted: response.is_completed || false,
  };
}

export class SplitPaymentService {
  /**
   * Créer une session de paiement divisé.
   *
   * - `equal` / `custom` : portions avec montants fixes (somme = total + tip).
   * - `items` : 1 portion par participant, amount=0 initial, recalculé côté
   *   backend à chaque claim/unclaim. `participantId` doit être renseigné.
   */
  async createSplitSession(
    orderId: string,
    splitType: SplitPaymentMode,
    portions: CreatePortionInput[],
    tipAmount: number = 0,
  ): Promise<SplitPaymentSession> {
    try {
      const response = await apiClient.post(`/api/v1/split-payments/create/${orderId}/`, {
        split_type: splitType,
        tip_amount: tipAmount,
        portions: portions.map(p => ({
          name: p.name,
          amount: p.amount ?? 0,
          participant_id: p.participantId ?? null,
        }))
      });

      return mapSession(response, orderId);
    } catch (error) {
      console.error('Error creating split session:', error);
      throw new Error('Impossible de créer la session de paiement divisé');
    }
  }

  /**
   * Récupérer une session existante
   */
  async getSplitSession(orderId: string): Promise<SplitPaymentSession | null> {
    try {
      const response = await apiClient.get(`/api/v1/split-payments/session/${orderId}/`);
      
      if (!response || response.status === 'not_found') {
        return null;
      }
      
      return mapSession(response, orderId);
    } catch (error: any) {
      // Vérifier si c'est une erreur 404 en utilisant la structure de l'ApiError
      if (error?.code === 404 || 
          error?.response?.status === 404 || 
          error?.details?.status?.[0] === 'not_found') {
        // C'est normal, pas de session existe - retourner null silencieusement
        return null;
      }
      
      // Pour toute autre erreur, la logger et la propager
      console.error('Error getting split session:', error);
      throw new Error('Impossible de récupérer la session de paiement divisé');
    }
  }

  /**
   * Claim un OrderItem pour une portion (mode `items` uniquement).
   *
   * Plusieurs participants peuvent claim le même item — le prix sera divisé
   * équitablement entre eux et les montants des portions seront recalculés
   * côté backend. Retourne la session complète à jour.
   */
  async claimItem(
    orderId: string,
    portionId: string,
    orderItemId: number,
  ): Promise<SplitPaymentSession> {
    try {
      const response = await apiClient.post(`/api/v1/split-payments/claim/${orderId}/`, {
        portion_id: portionId,
        order_item_id: orderItemId,
      });
      return mapSession(response, orderId);
    } catch (error) {
      console.error('Error claiming item:', error);
      throw new Error("Impossible d'ajouter cet article à votre part");
    }
  }

  /**
   * Unclaim un OrderItem pour une portion (mode `items` uniquement).
   */
  async unclaimItem(
    orderId: string,
    portionId: string,
    orderItemId: number,
  ): Promise<SplitPaymentSession> {
    try {
      const response = await apiClient.post(`/api/v1/split-payments/unclaim/${orderId}/`, {
        portion_id: portionId,
        order_item_id: orderItemId,
      });
      return mapSession(response, orderId);
    } catch (error) {
      console.error('Error unclaiming item:', error);
      throw new Error('Impossible de retirer cet article de votre part');
    }
  }

  /**
   * Créer un PaymentIntent pour une portion spécifique
   */
  async createPortionPaymentIntent(orderId: string, portionId: string): Promise<{
    client_secret: string;
    payment_intent_id: string;
    amount: number;
  }> {
    try {
      const response = await apiClient.post(`/api/v1/split-payments/pay-portion/${orderId}/`, {
        portion_id: portionId
      });
      
      return {
        client_secret: response.client_secret,
        payment_intent_id: response.payment_intent_id,
        amount: parseFloat(response.amount) || 0
      };
    } catch (error) {
      console.error('Error creating portion payment intent:', error);
      throw new Error('Impossible de créer le paiement pour cette portion');
    }
  }

  /**
   * Marquer une portion comme payée
   */
  async confirmPortionPayment(
    orderId: string, 
    portionId: string, 
    paymentIntentId: string
  ): Promise<void> {
    try {
      await apiClient.post(`/api/v1/split-payments/confirm-portion/${orderId}/`, {
        portion_id: portionId,
        payment_intent_id: paymentIntentId
      });
    } catch (error) {
      console.error('Error confirming portion payment:', error);
      throw new Error('Impossible de confirmer le paiement de cette portion');
    }
  }

  /**
   * Créer un PaymentIntent pour payer toutes les portions restantes
   */
  async createRemainingPaymentIntent(orderId: string): Promise<{
    client_secret: string;
    payment_intent_id: string;
    amount: number;
    portions: string[];
  }> {
    try {
      const response = await apiClient.post(`/api/v1/split-payments/pay-remaining/${orderId}/`);
      
      return {
        client_secret: response.client_secret,
        payment_intent_id: response.payment_intent_id,
        amount: parseFloat(response.amount) || 0,
        portions: response.portions
      };
    } catch (error) {
      console.error('Error creating remaining payment intent:', error);
      throw new Error('Impossible de créer le paiement pour les portions restantes');
    }
  }

  /**
   * Confirmer le paiement de toutes les portions restantes
   */
  async confirmRemainingPayments(
    orderId: string, 
    paymentIntentId: string
  ): Promise<void> {
    try {
      await apiClient.post(`/api/v1/split-payments/confirm-remaining/${orderId}/`, {
        payment_intent_id: paymentIntentId
      });
    } catch (error) {
      console.error('Error confirming remaining payments:', error);
      throw new Error('Impossible de confirmer le paiement des portions restantes');
    }
  }

  /**
   * Vérifier si tous les paiements sont effectués
   */
  async checkCompletion(orderId: string): Promise<{ 
    isCompleted: boolean; 
    remainingAmount: number;
    remainingPortions: number;
  }> {
    try {
      const response = await apiClient.get(`/api/v1/split-payments/status/${orderId}/`);
      
      return {
        isCompleted: response.is_completed || false,
        remainingAmount: parseFloat(response.remaining_amount || '0'),
        remainingPortions: parseInt(response.remaining_portions || '0')
      };
    } catch (error) {
      console.error('Error checking completion:', error);
      throw new Error('Impossible de vérifier l\'état des paiements');
    }
  }

  /**
   * Finaliser la commande quand tous les paiements sont effectués
   */
  async completePayment(orderId: string): Promise<void> {
    try {
      await apiClient.post(`/api/v1/split-payments/complete/${orderId}/`);
    } catch (error) {
      console.error('Error completing payment:', error);
      throw new Error('Impossible de finaliser le paiement');
    }
  }

  /**
   * Annuler une session de paiement divisé
   */
  async cancelSplitSession(orderId: string): Promise<void> {
    try {
      await apiClient.delete(`/api/v1/split-payments/session/${orderId}/`);
    } catch (error) {
      console.error('Error canceling split session:', error);
      throw new Error('Impossible d\'annuler la session de paiement divisé');
    }
  }

  /**
   * Obtenir l'historique des paiements pour une commande
   */
  async getPaymentHistory(orderId: string): Promise<{
    portions: Array<{
      id: string;
      name: string;
      amount: number;
      isPaid: boolean;
      paidAt?: string;
      paymentMethod?: string;
    }>;
    totalPaid: number;
    totalRemaining: number;
  }> {
    try {
      const response = await apiClient.get(`/api/v1/split-payments/history/${orderId}/`);
      
      return {
        portions: response.portions.map((p: any) => ({
          id: p.id,
          name: p.name,
          amount: parseFloat(p.amount),
          isPaid: p.is_paid || false,
          paidAt: p.paid_at,
          paymentMethod: p.payment_method
        })),
        totalPaid: parseFloat(response.total_paid || '0'),
        totalRemaining: parseFloat(response.total_remaining || '0')
      };
    } catch (error) {
      console.error('Error getting payment history:', error);
      throw new Error('Impossible de récupérer l\'historique des paiements');
    }
  }
}

export const splitPaymentService = new SplitPaymentService();