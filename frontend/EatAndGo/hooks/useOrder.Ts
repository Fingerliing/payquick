import useSWR, { mutate } from "swr";
import { fetchOrder, fetchOrders, createOrder, CreateOrderPayload } from "@/services/orderService";
import { Order } from "../types/order";

/** Liste de commandes (client ou restaurateur) */
export function useOrders(params?: { status?: string }) {
  return useSWR<Order[]>(["orders", params], () => fetchOrders(params), {
    revalidateOnFocus: true,
  });
}

/** Création d'une commande et invalidation du cache */
export async function placeOrder(payload: CreateOrderPayload) {
  const order = await createOrder(payload);
  mutate(key => Array.isArray(key) && key[0] === "orders");
  return order;
}

/** Détail d'une commande avec rafraîchissement périodique */
export function useOrder(id: number, refreshInterval = 5000) {
  return useSWR<Order>(id ? ["order", id] : null, () => fetchOrder(id), {
    refreshInterval,
  });
}