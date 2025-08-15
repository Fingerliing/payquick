import { apiClient } from "./api";
import type { OrderList, OrderDetail, CreateOrderRequest } from "@/types/order";
import type { OrderSearchFilters } from "@/types/common";

// Union minimaliste utilisée par OrderContext.normalizeListResponse
type ListResponse<T> = T[] | { results: T[]; count: number } | { data: T[]; pagination: { page: number; limit: number; total: number; pages: number } };

class OrderService {
  /** GET /api/v1/orders/ — liste (DRF ou tableau brut) */
  async getMyOrders(params: {
    page?: number;
    limit?: number;
    status?: OrderSearchFilters["status"];
    restaurant?: OrderSearchFilters["restaurant"];
    order_type?: OrderSearchFilters["order_type"];
    search?: string;
  }): Promise<ListResponse<OrderList>> {
    const { page, limit, ...rest } = params ?? {};
    const response = await apiClient.get("/api/v1/orders/", {
      params: { page, page_size: limit, ...rest },
    });
    return response.data;
  }

  /** GET /api/v1/orders/?search=... — recherche DRF */
  async searchOrders(query: string, filters?: Partial<OrderSearchFilters>): Promise<ListResponse<OrderList>> {
    const response = await apiClient.get("/api/v1/orders/", {
      params: { search: query, ...(filters ?? {}) },
    });
    return response.data;
  }

  /** GET /api/v1/orders/:id/ — détail */
  async getOrderById(id: number): Promise<OrderDetail> {
    const response = await apiClient.get(`/api/v1/orders/${id}/`);
    return response.data;
  }

  /** POST /api/v1/orders/ — création */
  async createOrder(payload: CreateOrderRequest): Promise<OrderDetail> {
    const response = await apiClient.post("/api/v1/orders/", payload);
    return response.data;
  }

  /** PATCH action /api/v1/orders/:id/update_status/ — mise à jour de statut */
  async updateOrderStatus(id: number, status: string): Promise<OrderDetail> {
    const response = await apiClient.patch(`/api/v1/orders/${id}/update_status/`, { status });
    return response.data;
  }

  /** POST action /api/v1/orders/:id/mark_as_paid/ — marquer payée */
  async markAsPaid(id: number, payment_method?: string): Promise<OrderDetail> {
    const response = await apiClient.post(`/api/v1/orders/${id}/mark_as_paid/`, { payment_method });
    return response.data;
  }

  /** GET action /api/v1/orders/statistics/ — stats */
  async getOrderStats(filters?: Partial<OrderSearchFilters>): Promise<any> {
    const response = await apiClient.get("/api/v1/orders/statistics/", { params: { ...(filters ?? {}) } });
    return response.data; // peut être { stats: {...} } ou directement {...}
  }
}

export const orderService = new OrderService();
