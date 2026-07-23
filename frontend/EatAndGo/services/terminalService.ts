import { apiClient } from './api';
import type { OrderDetail } from '@/types/order';

/**
 * Stripe Terminal / Tap to Pay.
 *
 * Modèle Connect : destination charges. Le PaymentIntent est créé sur le compte
 * PLATEFORME (`application_fee_amount` + `transfer_data.destination`), donc la
 * Location et le reader appartiennent eux aussi au compte plateforme et le
 * ConnectionToken est généré SANS `stripe_account`. Ne pas basculer sur des
 * direct charges sans revoir les trois en même temps.
 */

export interface TerminalConnectionToken {
  secret: string;
}

export interface TerminalLocation {
  location_id: string;
}

export interface TerminalPaymentIntent {
  client_secret: string;
  payment_intent_id: string;
  amount_cents: number;
}

class TerminalService {
  /** POST /api/v1/payments/terminal/connection-token/ */
  async fetchConnectionToken(restaurantId: number): Promise<string> {
    const res = (await apiClient.post('/api/v1/payments/terminal/connection-token/', {
      restaurant: restaurantId,
    })) as TerminalConnectionToken;
    return res.secret;
  }

  /** POST /api/v1/payments/terminal/location/ — get-or-create, idempotent côté backend. */
  async getLocationId(restaurantId: number): Promise<string> {
    const res = (await apiClient.post('/api/v1/payments/terminal/location/', {
      restaurant: restaurantId,
    })) as TerminalLocation;
    return res.location_id;
  }

  /** POST /api/v1/payments/terminal/payment-intent/ */
  async createPaymentIntent(orderId: number): Promise<TerminalPaymentIntent> {
    const res = (await apiClient.post('/api/v1/payments/terminal/payment-intent/', {
      order_id: orderId,
    })) as TerminalPaymentIntent;
    return res;
  }

  /**
   * POST /api/v1/payments/terminal/confirm/
   *
   * Seule écriture autorisée de `payment_method: 'terminal'`. Le backend
   * re-interroge Stripe : un PI absent, non `succeeded`, non `card_present` ou
   * rattaché à une autre commande est refusé. Le webhook reste le filet
   * asynchrone si cet appel échoue (réseau coupé après la transaction).
   */
  async confirm(orderId: number, paymentIntentId: string): Promise<OrderDetail> {
    const res = (await apiClient.post('/api/v1/payments/terminal/confirm/', {
      order_id: orderId,
      payment_intent_id: paymentIntentId,
    })) as OrderDetail;
    return res;
  }
}

export const terminalService = new TerminalService();
