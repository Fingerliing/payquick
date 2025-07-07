import { Order, OrderSummary, OrderItem } from '@/types/order';
import { apiClient } from './api';

export class OrderService {
  async getOrders(params?: {
    page?: number;
    limit?: number;
    status?: string;
    restaurantId?: string;
  }): Promise<{ data: Order[]; pagination: any }> {
    return apiClient.get('/orders/', params);
  }

  async getOrder(id: string): Promise<Order> {
    return apiClient.get(`/orders/${id}/`);
  }

  async createOrder(data: {
    restaurantId: string;
    items: OrderItem[];
    deliveryAddress?: any;
    customerNotes?: string;
  }): Promise<Order> {
    return apiClient.post('/orders/', data);
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    return apiClient.patch(`/orders/${id}/`, { status });
  }

  async cancelOrder(id: string, reason?: string): Promise<Order> {
    return apiClient.post(`/orders/${id}/cancel/`, { reason });
  }

  async addReview(orderId: string, data: { rating: number; review: string }): Promise<Order> {
    return apiClient.post(`/orders/${orderId}/review/`, data);
  }

  async getOrderTracking(id: string): Promise<any> {
    return apiClient.get(`/orders/${id}/tracking/`);
  }

  async calculateOrderTotal(items: OrderItem[], deliveryAddress?: any): Promise<OrderSummary> {
    return apiClient.post('/orders/calculate-total/', { items, deliveryAddress });
  }
}

export const orderService = new OrderService();
