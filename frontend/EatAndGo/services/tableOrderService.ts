import { apiClient } from './api';
import { OrderDetail, OrderList, CreateOrderRequest } from '@/types/order'; // ✅ AJOUT: Imports manquants

export interface TableSession {
  id: string;
  restaurant: number;
  table_number: string;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
  primary_customer_name?: string;
  primary_phone?: string;
  guest_count: number;
  session_notes?: string;
  orders_count: number;
  total_amount: number;
  duration: string;
  orders: OrderList[];
}

export interface OrderWithTableInfo extends OrderDetail {
  table_session_id: string;
  order_sequence: number;
  is_main_order: boolean;
  table_orders_count: number;
  table_total_amount: number;
  table_waiting_time: number;
  table_status_summary: {
    total_orders: number;
    pending: number;
    confirmed: number;
    preparing: number;
    ready: number;
    served: number;
    cancelled: number;
  };
}

export interface TableOrdersResponse {
  restaurant_id: number;
  restaurant_name: string;
  table_number: string;
  active_orders: OrderWithTableInfo[];
  completed_orders: OrderWithTableInfo[];
  table_statistics: {
    total_orders: number;
    total_revenue: number;
    average_order_value: number;
    active_orders: number;
  };
  current_session?: TableSession;
  can_add_order: boolean;
  last_updated: string;
}

class TableOrderService {
  /**
   * Récupère toutes les commandes d'une table
   */
  async getTableOrders(restaurantId: number, tableNumber: string): Promise<TableOrdersResponse> {
    const response = await apiClient.get('/api/v1/table-orders/table_orders/', {
      params: {
        restaurant_id: restaurantId,
        table_number: tableNumber
      }
    });
    return response;
  }

  /**
   * Ajoute une nouvelle commande à une table
   */
  async addTableOrder(orderData: CreateOrderRequest): Promise<OrderWithTableInfo> {
    const response = await apiClient.post('/api/v1/table-orders/add_table_order/', orderData);
    return response;
  }

  /**
   * Récupère la session active d'une table
   */
  async getTableSession(restaurantId: number, tableNumber: string): Promise<{
    has_active_session: boolean;
    session?: TableSession;
  }> {
    const response = await apiClient.get('/api/v1/table-orders/table_session/', {
      params: {
        restaurant_id: restaurantId,
        table_number: tableNumber
      }
    });
    return response;
  }

  /**
   * Termine une session de table
   */
  async endTableSession(restaurantId: number, tableNumber: string): Promise<{
    message: string;
    session_id: string;
    total_amount: number;
    orders_count: number;
    duration_minutes: number;
  }> {
    const response = await apiClient.post('/api/v1/table-orders/end_table_session/', {
      restaurant_id: restaurantId,
      table_number: tableNumber
    });
    return response;
  }

  /**
   * Statistiques des tables d'un restaurant
   */
  async getRestaurantTablesStats(restaurantId: number): Promise<any> {
    const response = await apiClient.get('/api/v1/table-orders/restaurant_tables_stats/', {
      params: {
        restaurant_id: restaurantId
      }
    });
    return response;
  }

  /**
   * Vue cuisine améliorée avec regroupement par table
   */
  async getKitchenView(restaurantId: number): Promise<{
    restaurant_id: number;
    tables: {
      table_number: string;
      orders: OrderWithTableInfo[];
      total_items: number;
      oldest_order_time: string;
      urgency_level: 'normal' | 'warning' | 'urgent';
    }[];
    total_active_orders: number;
    last_updated: string;
  }> {
    const response = await apiClient.get('/api/v1/orders/kitchen_view/', {
      params: {
        restaurant: restaurantId
      }
    });
    return response;
  }
}

export const tableOrderService = new TableOrderService();