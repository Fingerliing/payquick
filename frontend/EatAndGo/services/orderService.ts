import { apiClient } from "./api";
import { AxiosError } from "axios";
import camelcaseKeys from "camelcase-keys";
import snakecaseKeys from "snakecase-keys";
import { Order } from "../types/order";

/* -------------------------------------------------------------------------
 * Types payload
 * ------------------------------------------------------------------------*/
export interface OrderItemInput {
  menuItemId: number;
  quantity: number;
  specialRequest?: string;
}

export interface CreateOrderPayload {
  restaurant: number;
  table: number | null;
  items: OrderItemInput[];
}

/* -------------------------------------------------------------------------
 * Helpers de sérialisation / erreurs
 * ------------------------------------------------------------------------*/
function axiosCamel<T = any>(promise: Promise<{ data: any }>): Promise<T> {
  return promise.then(({ data }) => camelcaseKeys(data, { deep: true }));
}

function handleAxiosError(e: unknown): never {
  if (e instanceof AxiosError && e.response) {
    throw new Error(e.response.data?.detail || "Erreur réseau");
  }
  throw e;
}

/* -------------------------------------------------------------------------
 * API CRUD
 * ------------------------------------------------------------------------*/
export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  try {
    const snakePayload = snakecaseKeys(payload, { deep: true });
    return await axiosCamel<Order>(apiClient.post("/orders/", snakePayload));
  } catch (e) {
    handleAxiosError(e);
  }
}

export async function fetchOrders(params?: { status?: string }): Promise<Order[]> {
  try {
    return await axiosCamel<Order[]>(apiClient.get("/orders/", { params }));
  } catch (e) {
    handleAxiosError(e);
  }
}

export async function fetchOrder(id: number): Promise<Order> {
  try {
    return await axiosCamel<Order>(apiClient.get(`/orders/${id}/`));
  } catch (e) {
    handleAxiosError(e);
  }
}

export async function updateOrderStatus(
  id: number,
  status: "in_progress" | "served" | "cancelled",
): Promise<Order> {
  try {
    return await axiosCamel<Order>(apiClient.patch(`/orders/${id}/update_status/`, { status }));
  } catch (e) {
    handleAxiosError(e);
  }
}