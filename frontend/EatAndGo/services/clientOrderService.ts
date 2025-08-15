import { apiClient } from './api';
import type { CartItem } from '../types/cart';
import type {
  OrderList,
  OrderDetail,
  CreateOrderRequest,
  OrderStatsEnvelope, // au cas où tu l'utilises plus tard
} from '../types/order';
import type { OrderSearchFilters, ListResponse } from '../types/common';
import { normalizeListResponse } from '../types/common';

/**
 * Service côté client (utilisateur final).
 * Aligne les endpoints DRF:
 *  - GET    /api/v1/orders/                 (liste - paginée ou tableau)
 *  - GET    /api/v1/orders/{id}/            (détail)
 *  - POST   /api/v1/orders/                 (création)
 *  - GET    /api/v1/orders/?search=...      (recherche via SearchFilter)
 *  - POST   /api/v1/orders/{id}/cancel/     (annulation)
 *  - POST   /api/v1/orders/{id}/rate/       (évaluation)
 */
export class ClientOrderService {
  /**
   * Liste des commandes du client connecté
   */
  async getOrders(params: {
    page?: number;
    limit?: number;
    status?: OrderSearchFilters['status'];
    restaurant?: OrderSearchFilters['restaurant'];
    order_type?: OrderSearchFilters['order_type'];
    search?: string;
  }): Promise<ListResponse<OrderList>> {
    const { page, limit, ...rest } = params ?? {};
    const response = await apiClient.get('/api/v1/orders/', {
      params: {
        page,
        page_size: limit, // DRF par défaut
        ...rest,
      },
    });
    return response.data;
  }

  /**
   * Recherche (propage ?search= vers DRF SearchFilter)
   */
  async searchOrders(query: string, filters?: Partial<OrderSearchFilters>): Promise<ListResponse<OrderList>> {
    const response = await apiClient.get('/api/v1/orders/', {
      params: {
        search: query,
        ...(filters ?? {}),
      },
    });
    return response.data;
  }

  /**
   * Détail d'une commande
   */
  async getOrderById(id: number): Promise<OrderDetail> {
    const response = await apiClient.get(`/api/v1/orders/${id}/`);
    return response.data;
  }

  /**
   * Création d'une commande depuis des items de panier
   * Mappe CartItem -> CreateOrderRequest.items[].menu_item
   */
  async createFromCart(args: {
    restaurant: number;
    order_type: 'dine_in' | 'takeaway';
    table?: number | null;
    customer_name?: string | null;
    notes?: string | null;
    items: CartItem[];
  }): Promise<OrderDetail> {
    const payload: CreateOrderRequest = {
      restaurant: args.restaurant,
      order_type: args.order_type,
      table: args.table,
      customer_name: args.customer_name,
      notes: args.notes,
      items: args.items.map((it) => ({
        menu_item: it.menuItemId,
        quantity: it.quantity,
        ...(it.customizations ? { customizations: it.customizations } : {}),
        ...(it.specialInstructions ? { special_instructions: it.specialInstructions } : {}),
      })),
    };
    const response = await apiClient.post('/api/v1/orders/', payload);
    return response.data;
  }

  /**
   * Création directe (si tu construis déjà CreateOrderRequest côté appelant)
   */
  async createOrder(payload: CreateOrderRequest): Promise<OrderDetail> {
    const response = await apiClient.post('/api/v1/orders/', payload);
    return response.data;
  }

  /**
   * Annuler une commande (action dédiée côté backend)
   */
  async cancelOrder(orderId: number) {
    return apiClient.post(`/api/v1/orders/${orderId}/cancel/`);
  }

  /**
   * Évaluer une commande terminée
   */
  async rateOrder(orderId: number, rating: number, comment?: string) {
    return apiClient.post(`/api/v1/orders/${orderId}/rate/`, { rating, comment });
  }
}

export const clientOrderService = new ClientOrderService();
