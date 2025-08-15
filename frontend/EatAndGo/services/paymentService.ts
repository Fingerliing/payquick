import { apiClient } from './api';

export class PaymentService {
  // (si utilisé côté app) créer un PaymentIntent pour une commande interne
  async createPaymentIntent(orderId: string): Promise<never> { 
    throw new Error('Not supported by backend v1 (use Stripe Checkout session).'); 
  }

  async confirmPayment(paymentIntentId: string): Promise<never> { 
    throw new Error('Not supported by backend v1.'); 
  }

  async refundPayment(paymentId: string, amount?: number): Promise<never> { 
    throw new Error('Not supported by backend v1.'); 
  }

  async getPaymentMethods(): Promise<any[]> {
    return apiClient.get('/payments/methods/');
  }

  async savePaymentMethod(data: any): Promise<never> { 
    throw new Error('Not supported by backend v1.'); 
  }

  async deletePaymentMethod(id: string): Promise<never> { 
    throw new Error('Not supported by backend v1.'); 
  }

  async createCheckoutSession(order_id: number): Promise<{ checkout_url: string } & { url?: string }> {
    // Backend expects POST /api/v1/payments/create_checkout_session/<order_id>/
    return apiClient.post(`/api/v1/payments/create_checkout_session/${order_id}/`);
  }
}

export const paymentService = new PaymentService();
