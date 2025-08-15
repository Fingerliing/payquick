import { apiClient } from './api';

export class PaymentService {
  // (si utilisé côté app) créer un PaymentIntent pour une commande interne
  async createPaymentIntent(orderId: string): Promise<{ clientSecret: string; publishableKey: string }> {
    return apiClient.post('/payments/create-intent/', { orderId });
  }

  async confirmPayment(paymentIntentId: string): Promise<{ status: string }> {
    return apiClient.post('/payments/confirm/', { paymentIntentId });
  }

  async refundPayment(paymentId: string, amount?: number): Promise<{ status: string }> {
    return apiClient.post('/payments/refund/', { paymentId, amount });
  }

  async getPaymentMethods(): Promise<any[]> {
    return apiClient.get('/payments/methods/');
  }

  async savePaymentMethod(data: any): Promise<any> {
    return apiClient.post('/payments/methods/', data);
  }

  async deletePaymentMethod(id: string): Promise<void> {
    return apiClient.delete(`/payments/methods/${id}/`);
  }

  async createCheckoutSession(order_id: number): Promise<{ checkout_url: string }> {
    return apiClient.post(`/api/payments/checkout/${order_id}/`);
  }
}

export const paymentService = new PaymentService();
