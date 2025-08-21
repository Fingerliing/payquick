import { apiClient } from './api';

export interface PaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
}

export class PaymentService {
  async createPaymentIntent(orderId: string): Promise<PaymentIntentResponse> {
    return apiClient.post('/api/v1/payments/create-payment-intent/', {
      order_id: orderId
    });
  }

  async updatePaymentStatus(orderId: string, paymentStatus: string): Promise<void> {
    await apiClient.post(`/api/v1/payments/update-status/${orderId}/`, {
      payment_status: paymentStatus
    });
  }

  async createCheckoutSession(order_id: number): Promise<{ checkout_url: string }> {
    return apiClient.post(`/api/v1/payments/create_checkout_session/${order_id}/`);
  }
}

export const paymentService = new PaymentService();
