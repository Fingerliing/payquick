import React, { createContext, useContext, useReducer, ReactNode, useCallback } from "react";
import { orderService } from "@/services/orderService";

// --- Types (uniquement en 'type' import) ---
import type { OrderList, OrderDetail, CreateOrderRequest } from "@/types/order";
import type { OrderSearchFilters } from "@/types/common";
import { paymentService } from "@/services/paymentService";

// --------------------
// Types & état local
// --------------------
type Pagination = { page: number; limit: number; total: number; pages: number };

interface OrderState {
  orders: OrderList[];
  currentOrder: OrderDetail | null;
  isLoading: boolean;
  error: string | null;
  filters: OrderSearchFilters;
  pagination: Pagination;
  stats: Record<string, any> | null;
}

const initialState: OrderState = {
  orders: [],
  currentOrder: null,
  isLoading: false,
  error: null,
  filters: {},
  pagination: { page: 1, limit: 10, total: 0, pages: 1 },
  stats: null,
};

type Ctx = OrderState & {
  fetchOrders: (opts?: { page?: number; limit?: number; filters?: Partial<OrderSearchFilters> }) => Promise<void>;
  searchOrders: (q: string, filters?: Partial<OrderSearchFilters>) => Promise<void>;
  getOrder: (id: number) => Promise<OrderDetail | null>;
  createOrder: (payload: CreateOrderRequest) => Promise<OrderDetail>;
  updateOrderStatus: (id: number, status: string) => Promise<OrderDetail>;
  markAsPaid: (id: number, paymentMethod?: string) => Promise<OrderDetail>;
  reportClientPayment: (id: number, paymentMethod?: string) => Promise<OrderDetail>;
  fetchStats: (filters?: Partial<OrderSearchFilters>) => Promise<void>;
};

const OrderContext = createContext<Ctx | null>(null);

// --------------------
// Reducer
// --------------------
type Action =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_ORDERS"; payload: OrderList[] }
  | { type: "SET_CURRENT_ORDER"; payload: OrderDetail | null }
  | { type: "SET_FILTERS"; payload: Partial<OrderSearchFilters> }
  | { type: "SET_PAGINATION"; payload: Partial<Pagination> }
  | { type: "SET_STATS"; payload: Record<string, any> | null };

function reducer(state: OrderState, action: Action): OrderState {
  switch (action.type) {
    case "SET_LOADING": return { ...state, isLoading: action.payload };
    case "SET_ERROR": return { ...state, error: action.payload };
    case "SET_ORDERS": return { ...state, orders: action.payload, error: null };
    case "SET_CURRENT_ORDER": return { ...state, currentOrder: action.payload, error: null };
    case "SET_FILTERS": return { ...state, filters: { ...state.filters, ...action.payload } };
    case "SET_PAGINATION": return { ...state, pagination: { ...state.pagination, ...action.payload } };
    case "SET_STATS": return { ...state, stats: action.payload };
    default: return state;
  }
}

// --------------------
// Helpers locaux
// (on évite d’importer des helpers cassés)
// --------------------
type ListResponse<T> = T[] | { results: T[]; count: number } | { data: T[]; pagination: Pagination };

function isDRF<T>(r: any): r is { results: T[]; count: number } {
  return !!r && typeof r === "object" && "results" in r && "count" in r;
}
function isFrontPaginated<T>(r: any): r is { data: T[]; pagination: Pagination } {
  return !!r && typeof r === "object" && "data" in r && "pagination" in r;
}

function normalizeListResponse<T>(
  resp: ListResponse<T>,
  fallback: { page: number; limit: number }
): { data: T[]; pagination: Pagination } {
  const { page, limit } = fallback;
  if (Array.isArray(resp)) {
    return { data: resp, pagination: { page, limit, total: resp.length, pages: 1 } };
  }
  if (isDRF<T>(resp)) {
    const total = resp.count ?? resp.results.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    return { data: resp.results, pagination: { page, limit, total, pages } };
  }
  if (isFrontPaginated<T>(resp)) {
    return { data: resp.data, pagination: resp.pagination };
  }
  return { data: [], pagination: { page, limit, total: 0, pages: 1 } };
}

function unwrapStats(x: any): Record<string, any> | null {
  if (!x) return null;
  return typeof x === "object" && "stats" in x ? x.stats : x;
}

// --------------------
// Provider
// --------------------
export const OrderProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchOrders: Ctx["fetchOrders"] = async (opts) => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const page = opts?.page ?? state.pagination.page;
      const limit = opts?.limit ?? state.pagination.limit;
      const filters = { ...state.filters, ...(opts?.filters ?? {}) };

      const resp: ListResponse<OrderList> = await orderService.getMyOrders({ page, limit, ...filters });
      const { data, pagination } = normalizeListResponse<OrderList>(resp, { page, limit });

      dispatch({ type: "SET_ORDERS", payload: data });
      dispatch({ type: "SET_PAGINATION", payload: pagination });
      dispatch({ type: "SET_FILTERS", payload: filters });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message ?? "Erreur lors du chargement des commandes" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const searchOrders: Ctx["searchOrders"] = async (q, filters) => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const resp: ListResponse<OrderList> = await orderService.searchOrders(q, { ...state.filters, ...(filters ?? {}) });
      const { data, pagination } = normalizeListResponse<OrderList>(resp, { page: 1, limit: state.pagination.limit });
      dispatch({ type: "SET_ORDERS", payload: data });
      dispatch({ type: "SET_PAGINATION", payload: pagination });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e?.message ?? "Erreur lors de la recherche" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const getOrder: Ctx["getOrder"] = useCallback(async (id: number) => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const order = await orderService.getOrderById(id);
      dispatch({ type: "SET_CURRENT_ORDER", payload: order });
      return order;
    } catch {
      dispatch({ type: "SET_ERROR", payload: "Commande introuvable" });
      return null;
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, []);

  const createOrder: Ctx["createOrder"] = async (payload) => {
    const order = await orderService.createOrder(payload);
    dispatch({ type: "SET_CURRENT_ORDER", payload: order });
    return order;
  };

  const updateOrderStatus: Ctx["updateOrderStatus"] = async (id, status) => {
    const updated = await orderService.updateOrderStatus(id, status); // PATCH action dédiée côté back
    dispatch({ type: "SET_CURRENT_ORDER", payload: updated });
    await fetchOrders();
    return updated;
  };

  const markAsPaid: Ctx["markAsPaid"] = async (id, paymentMethod) => {
    const updated = await orderService.markAsPaid(id, paymentMethod); // POST action dédiée côté back
    dispatch({ type: "SET_CURRENT_ORDER", payload: updated });
    await fetchOrders();
    return updated;
  };

  const reportClientPayment = async (id: number, paymentMethod?: string) => {
    // Si paiement en ligne : appeler updatePaymentStatus('paid') après succès Stripe
    if (paymentMethod === 'online') {
      await paymentService.updatePaymentStatus(String(id), 'paid');
    } else {
      // Cash (ou inconnu côté client) : déclarer "en attente de caisse"
      await paymentService.updatePaymentStatus(String(id), 'cash_pending');
    }
    const order = await orderService.getOrderById(id);
    dispatch({ type: "SET_CURRENT_ORDER", payload: order });
    await fetchOrders();
    return order;
  };

  const fetchStats: Ctx["fetchStats"] = async (filters) => {
    const resp = await orderService.getOrderStats(filters);
    dispatch({ type: "SET_STATS", payload: unwrapStats(resp) });
  };

  const value: Ctx = {
    ...state,
    fetchOrders,
    searchOrders,
    getOrder,
    createOrder,
    updateOrderStatus,
    markAsPaid,
    reportClientPayment,
    fetchStats,
  };

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
};

export const useOrder = () => {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrder doit être utilisé dans un OrderProvider");
  return { ...ctx, orders: Array.isArray(ctx.orders) ? ctx.orders : [] };
};
