import { apiClient } from './api';
import { CartItem } from '../types/cart';

interface CreateClientOrderData {
  restaurant: number;
  table_number?: number;
  items: Array<{
    menu_item: number;
    quantity: number;
    special_instructions?: string;
  }>;
  notes?: string;
  order_type: 'dine_in' | 'takeaway';
}

export class ClientOrderService {
  /**
   * Créer une commande depuis le panier client
   */
  async createOrderFromCart(
    cartItems: CartItem[],
    restaurantId: number,
    tableNumber?: number,
    notes?: string
  ) {
    const orderData: CreateClientOrderData = {
      restaurant: restaurantId,
      table_number: tableNumber ? parseInt(tableNumber) : undefined,
      order_type: tableNumber ? 'dine_in' : 'takeaway',
      items: cartItems.map(item => ({
        menu_item: item.menuItemId,
        quantity: item.quantity,
        special_instructions: item.specialInstructions || undefined,
      })),
      notes: notes || undefined,
    };

    return apiClient.post('/api/v1/orders/', orderData);
  }

  /**
   * Obtenir les commandes du client connecté
   */
  async getMyOrders(params?: {
    page?: number;
    status?: string;
  }) {
    return apiClient.get('/api/v1/orders/my/', params);
  }

  /**
   * Suivre une commande spécifique
   */
  async trackOrder(orderId: number) {
    return apiClient.get(`/api/v1/orders/${orderId}/track/`);
  }

  /**
   * Annuler une commande (si possible)
   */
  async cancelOrder(orderId: number) {
    return apiClient.post(`/api/v1/orders/${orderId}/cancel/`);
  }

  /**
   * Évaluer une commande terminée
   */
  async rateOrder(orderId: number, rating: number, comment?: string) {
    return apiClient.post(`/api/v1/orders/${orderId}/rate/`, {
      rating,
      comment
    });
  }
}

export const clientOrderService = new ClientOrderService();