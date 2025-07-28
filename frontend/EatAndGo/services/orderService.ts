import { Order, OrderItem, CreateOrderRequest, OrderStats } from '@/types/order';
import { PaginatedResponse, SearchFilters } from '@/types/common';
import { apiClient } from './api';

export class OrderService {
  /**
   * Récupérer toutes les commandes du restaurateur connecté
   */
  async getMyOrders(params?: {
    page?: number;
    limit?: number;
    status?: string;
    restaurant?: number;
  }): Promise<PaginatedResponse<Order>> {
    return apiClient.get('/api/v1/orders/', params);
  }

  /**
   * Récupérer une commande spécifique avec ses items
   */
  async getOrder(id: number): Promise<Order> {
    return apiClient.get(`/api/v1/orders/${id}/`);
  }

  /**
   * Créer une nouvelle commande (depuis le menu client)
   */
  async createOrder(data: CreateOrderRequest): Promise<Order> {
    return apiClient.post('/api/v1/orders/', data);
  }

  /**
   * Mettre à jour une commande (statut, notes, etc.)
   */
  async updateOrder(id: number, data: Partial<Order>): Promise<Order> {
    return apiClient.patch(`/api/v1/orders/${id}/`, data);
  }

  /**
   * Annuler une commande
   */
  async cancelOrder(id: number): Promise<void> {
    return apiClient.post(`/api/v1/orders/${id}/cancel/`);
  }

  /**
   * Mettre à jour le statut d'une commande (pour le personnel)
   */
  async updateOrderStatus(id: number, status: string): Promise<Order> {
    return apiClient.patch(`/api/v1/orders/${id}/status/`, { status });
  }

  /**
   * Marquer une commande comme payée
   */
  async markAsPaid(id: number, paymentMethod: string): Promise<Order> {
    return apiClient.post(`/api/v1/orders/${id}/mark-paid/`, { 
      payment_method: paymentMethod 
    });
  }

  /**
   * Obtenir les statistiques des commandes
   */
  async getOrderStats(restaurantId?: number, period?: string): Promise<OrderStats> {
    return apiClient.get('/api/v1/orders/stats/', { restaurant: restaurantId, period });
  }

  /**
   * Rechercher des commandes
   */
  async searchOrders(query: string, filters?: SearchFilters): Promise<Order[]> {
    return apiClient.get('/api/v1/orders/search/', { query, ...filters });
  }

  /**
   * Services pour les OrderItems
   */
  orderItems = {
    /**
     * Récupérer tous les items d'une commande
     */
    getOrderItems: (orderId: number): Promise<OrderItem[]> => {
      return apiClient.get(`/api/v1/orders/${orderId}/items/`);
    },

    /**
     * Ajouter un item à une commande existante
     */
    addOrderItem: (orderId: number, data: {
      menu_item: number;
      quantity: number;
      customizations?: any;
      special_instructions?: string;
    }): Promise<OrderItem> => {
      return apiClient.post(`/api/v1/orders/${orderId}/items/`, data);
    },

    /**
     * Mettre à jour un item de commande
     */
    updateOrderItem: (orderId: number, itemId: number, data: Partial<OrderItem>): Promise<OrderItem> => {
      return apiClient.patch(`/api/v1/orders/${orderId}/items/${itemId}/`, data);
    },

    /**
     * Supprimer un item de commande
     */
    removeOrderItem: (orderId: number, itemId: number): Promise<void> => {
      return apiClient.delete(`/api/v1/orders/${orderId}/items/${itemId}/`);
    }
  };

  /**
   * Actions spécifiques aux commandes sur place
   */
  onSite = {
    /**
     * Générer un ticket de commande
     */
    generateTicket: (orderId: number): Promise<{ ticket_url: string }> => {
      return apiClient.post(`/api/v1/orders/${orderId}/generate-ticket/`);
    },

    /**
     * Scanner QR code table pour nouvelle commande
     */
    scanTable: (tableCode: string): Promise<{ restaurant: any; table: any }> => {
      return apiClient.get(`/api/v1/orders/scan-table/${tableCode}/`);
    },

    /**
     * Estimer le temps de préparation
     */
    estimateTime: (items: { menu_item: number; quantity: number }[]): Promise<{ estimated_minutes: number }> => {
      return apiClient.post('/api/v1/orders/estimate-time/', { items });
    }
  };
}

export const orderService = new OrderService();