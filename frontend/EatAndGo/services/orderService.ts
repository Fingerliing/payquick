import {
  OrderList,
  OrderDetail,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  MarkAsPaidRequest,
  OrderStats,
  OrderStatsResponse,
  KitchenViewResponse,
  extractOrdersFromResponse,
  normalizeOrderToList
} from '@/types/order';
import { apiClient } from './api';

export class OrderService {
  
  // ============================================================================
  // MÉTHODES CLIENT (pour l'app client)
  // ============================================================================
  
  /**
   * Récupère les commandes du client connecté
   * Correspond à GET /api/v1/orders/ avec filtrage dans get_queryset()
   */
  async getMyOrders(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<OrderList[]> {
    try {
      console.log('📤 OrderService.getMyOrders called with:', params);
      
      const response = await apiClient.get('/api/v1/orders/', params) as any;
      
      console.log('📥 getMyOrders response:', {
        type: typeof response,
        isArray: Array.isArray(response),
        keys: response ? Object.keys(response) : [],
        hasResults: response && 'results' in response,
        hasPagination: response && 'count' in response
      });
      
      // Utiliser l'extracteur pour gérer tous les formats
      const orders = extractOrdersFromResponse(response);
      
      console.log('✅ Orders extracted:', {
        count: orders.length,
        sample: orders[0]
      });
      
      return orders;
      
    } catch (error) {
      console.error('❌ OrderService.getMyOrders error:', error);
      return [];
    }
  }
  
  /**
   * Récupère les détails d'une commande
   * Correspond à GET /api/v1/orders/{id}/
   */
  async getOrder(id: number): Promise<OrderDetail | null> {
    try {
      console.log('📤 OrderService.getOrder called with ID:', id);
      
      const response = await apiClient.get<OrderDetail>(`/api/v1/orders/${id}/`);
      
      console.log('✅ Order detail retrieved:', response);
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.getOrder error:', error);
      return null;
    }
  }
  
  /**
   * Suit une commande spécifique (alias de getOrder)
   */
  async trackOrder(orderId: number): Promise<OrderDetail | null> {
    return this.getOrder(orderId);
  }
  
  /**
   * Annule une commande (côté client)
   * Correspond à POST /api/v1/orders/{id}/cancel_order/
   */
  async cancelOrder(orderId: number): Promise<void> {
    try {
      console.log('📤 OrderService.cancelOrder called with ID:', orderId);
      
      await apiClient.post(`/api/v1/orders/${orderId}/cancel_order/`);
      
      console.log('✅ Order cancelled successfully');
    } catch (error) {
      console.error('❌ OrderService.cancelOrder error:', error);
      throw error;
    }
  }
  
  /**
   * Évalue une commande terminée
   */
  async rateOrder(orderId: number, rating: number, comment?: string): Promise<void> {
    try {
      console.log('📤 OrderService.rateOrder called:', { orderId, rating, comment });
      
      // Cet endpoint devrait être ajouté dans order_views.py
      await apiClient.post(`/api/v1/orders/${orderId}/rate/`, {
        rating,
        comment
      });
      
      console.log('✅ Order rated successfully');
    } catch (error) {
      console.error('❌ OrderService.rateOrder error:', error);
      throw error;
    }
  }
  
  // ============================================================================
  // MÉTHODES RESTAURATEUR (pour l'app restaurant)
  // ============================================================================
  
  /**
   * Récupère toutes les commandes du restaurateur
   * Correspond à GET /api/v1/orders/ avec filtrage restaurateur dans get_queryset()
   */
  async getRestaurantOrders(params?: {
    page?: number;
    limit?: number;
    status?: string;
    restaurant?: number;
  }): Promise<OrderList[]> {
    try {
      console.log('📤 OrderService.getRestaurantOrders called with:', params);
      
      const response = await apiClient.get('/api/v1/orders/', params);
      const orders = extractOrdersFromResponse(response);
      
      console.log('✅ Restaurant orders retrieved:', orders.length);
      return orders;
      
    } catch (error) {
      console.error('❌ OrderService.getRestaurantOrders error:', error);
      return [];
    }
  }
  
  /**
   * Met à jour le statut d'une commande (personnel cuisine/comptoir)
   * Correspond à PATCH /api/v1/orders/{id}/update_status/
   */
  async updateOrderStatus(id: number, status: string): Promise<OrderDetail | null> {
    try {
      console.log('📤 OrderService.updateOrderStatus called:', { id, status });
      
      const response = await apiClient.patch<OrderDetail>(
        `/api/v1/orders/${id}/update_status/`,
        { status }
      );
      
      console.log('✅ Order status updated:', response);
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.updateOrderStatus error:', error);
      throw error;
    }
  }
  
  /**
   * Marque une commande comme payée
   * Correspond à POST /api/v1/orders/{id}/mark_as_paid/
   */
  async markAsPaid(id: number, paymentMethod: string): Promise<void> {
    try {
      console.log('📤 OrderService.markAsPaid called:', { id, paymentMethod });
      
      await apiClient.post(`/api/v1/orders/${id}/mark_as_paid/`, { 
        payment_method: paymentMethod 
      });
      
      console.log('✅ Order marked as paid');
    } catch (error) {
      console.error('❌ OrderService.markAsPaid error:', error);
      throw error;
    }
  }
  
  // ============================================================================
  // CRÉATION DE COMMANDES
  // ============================================================================
  
  /**
   * Crée une nouvelle commande
   * Correspond à POST /api/v1/orders/
   */
  async createOrder(data: CreateOrderRequest): Promise<OrderDetail> {
    try {
      console.log('📤 OrderService.createOrder called with:', data);
      
      const response = await apiClient.post<OrderDetail>('/api/v1/orders/', data);
      
      console.log('✅ Order created successfully:', response);
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.createOrder error:', error);
      throw error;
    }
  }
  
  /**
   * Met à jour une commande existante
   */
  async updateOrder(id: number, data: Partial<CreateOrderRequest>): Promise<OrderDetail | null> {
    try {
      console.log('📤 OrderService.updateOrder called:', { id, data });
      
      const response = await apiClient.patch<OrderDetail>(`/api/v1/orders/${id}/`, data);
      
      console.log('✅ Order updated successfully:', response);
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.updateOrder error:', error);
      throw error;
    }
  }
  
  // ============================================================================
  // STATISTIQUES ET ANALYSE
  // ============================================================================
  
  /**
   * Obtient les statistiques des commandes
   * Correspond à GET /api/v1/orders/statistics/
   */
  async getOrderStats(restaurantId?: number, period?: string): Promise<OrderStats | null> {
    try {
      console.log('📤 OrderService.getOrderStats called:', { restaurantId, period });
      
      const params = {
        ...(restaurantId && { restaurant: restaurantId }),
        ...(period && { period })
      };
      
      const response = await apiClient.get<OrderStatsResponse>(
        '/api/v1/orders/statistics/', 
        params
      );
      
      console.log('✅ Order stats retrieved:', response.stats);
      return response.stats;
      
    } catch (error) {
      console.error('❌ OrderService.getOrderStats error:', error);
      return null;
    }
  }
  
  // ============================================================================
  // INTERFACE CUISINE
  // ============================================================================
  
  /**
   * Vue cuisine optimisée
   * Correspond à GET /api/v1/orders/kitchen_view/
   */
  async getKitchenView(restaurantId: number): Promise<KitchenViewResponse | null> {
    try {
      console.log('📤 OrderService.getKitchenView called with restaurant:', restaurantId);
      
      const response = await apiClient.get<KitchenViewResponse>(
        '/api/v1/orders/kitchen_view/',
        { restaurant: restaurantId }
      );
      
      console.log('✅ Kitchen view retrieved:', {
        restaurant: response.restaurant_id,
        totalOrders: Object.values(response.orders_by_status).flat().length
      });
      
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.getKitchenView error:', error);
      return null;
    }
  }
  
  // ============================================================================
  // UTILITAIRES POUR COMMANDES SUR PLACE
  // ============================================================================
  
  /**
   * Scanner QR code de table
   * Correspond à GET /api/v1/orders/scan_table/{table_code}/
   */
  async scanTable(tableCode: string): Promise<{ restaurant: any; table: any } | null> {
    try {
      console.log('📤 OrderService.scanTable called with code:', tableCode);
      
      const response = await apiClient.get(`/api/v1/orders/scan_table/${tableCode}/`) as any;
      
      console.log('✅ Table scanned successfully:', response);
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.scanTable error:', error);
      return null;
    }
  }
  
  /**
   * Estimer le temps de préparation
   * Correspond à POST /api/v1/orders/estimate_time/
   */
  async estimateTime(items: { menu_item: number; quantity: number }[]): Promise<{ estimated_minutes: number } | null> {
    try {
      console.log('📤 OrderService.estimateTime called with items:', items);
      
      const response = await apiClient.post('/api/v1/orders/estimate_time/', { items }) as any;
      
      console.log('✅ Time estimated:', response);
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.estimateTime error:', error);
      return null;
    }
  }
  
  /**
   * Générer un ticket de commande
   * Correspond à POST /api/v1/orders/{id}/generate_ticket/
   */
  async generateTicket(orderId: number): Promise<{ ticket_url: string } | null> {
    try {
      console.log('📤 OrderService.generateTicket called with ID:', orderId);
      
      const response = await apiClient.post(`/api/v1/orders/${orderId}/generate_ticket/`) as any;
      
      console.log('✅ Ticket generated:', response);
      return response;
      
    } catch (error) {
      console.error('❌ OrderService.generateTicket error:', error);
      return null;
    }
  }
  
  // ============================================================================
  // RECHERCHE ET FILTRAGE
  // ============================================================================
  
  /**
   * Recherche des commandes
   * Utilise les filtres de recherche intégrés dans la vue list()
   */
  async searchOrders(query: string, filters?: {
    status?: string;
    restaurant?: number;
    order_type?: string;
  }): Promise<OrderList[]> {
    try {
      console.log('📤 OrderService.searchOrders called:', { query, filters });
      
      const params = {
        search: query,
        ...filters
      };
      
      const response = await apiClient.get('/api/v1/orders/', params);
      const orders = extractOrdersFromResponse(response);
      
      console.log('✅ Orders search completed:', orders.length);
      return orders;
      
    } catch (error) {
      console.error('❌ OrderService.searchOrders error:', error);
      return [];
    }
  }
  
  // ============================================================================
  // GESTION DES ITEMS DE COMMANDE
  // ============================================================================
  
  /**
   * Sous-service pour les OrderItems
   * Ces endpoints devraient être ajoutés dans order_views.py si nécessaire
   */
  orderItems = {
    /**
     * Récupère tous les items d'une commande
     */
    getOrderItems: async (orderId: number): Promise<any[]> => {
      try {
        const response = await apiClient.get(`/api/v1/orders/${orderId}/items/`);
        return Array.isArray(response) ? response : [];
      } catch (error) {
        console.error('❌ OrderService.orderItems.getOrderItems error:', error);
        return [];
      }
    },

    /**
     * Ajoute un item à une commande existante
     */
    addOrderItem: async (orderId: number, data: {
      menu_item: number;
      quantity: number;
      customizations?: any;
      special_instructions?: string;
    }): Promise<any | null> => {
      try {
        const response = await apiClient.post(`/api/v1/orders/${orderId}/items/`, data);
        return response;
      } catch (error) {
        console.error('❌ OrderService.orderItems.addOrderItem error:', error);
        return null;
      }
    },

    /**
     * Met à jour un item de commande
     */
    updateOrderItem: async (orderId: number, itemId: number, data: any): Promise<any | null> => {
      try {
        const response = await apiClient.patch(`/api/v1/orders/${orderId}/items/${itemId}/`, data);
        return response;
      } catch (error) {
        console.error('❌ OrderService.orderItems.updateOrderItem error:', error);
        return null;
      }
    },

    /**
     * Supprime un item de commande
     */
    removeOrderItem: async (orderId: number, itemId: number): Promise<void> => {
      try {
        await apiClient.delete(`/api/v1/orders/${orderId}/items/${itemId}/`);
      } catch (error) {
        console.error('❌ OrderService.orderItems.removeOrderItem error:', error);
        throw error;
      }
    }
  };
}

// Export de l'instance singleton
export const orderService = new OrderService();

// Export des types pour faciliter l'import
export type { 
  OrderList, 
  OrderDetail, 
  CreateOrderRequest,
  OrderStats 
} from '@/types/order';