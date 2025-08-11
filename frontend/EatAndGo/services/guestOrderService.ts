import { apiClient } from "./api";

export type GuestItem = { menu_item_id: number; quantity: number; options?: any };
export type GuestPreparePayload = {
  restaurant_id: number;
  table_number?: string;
  items: GuestItem[];
  customer_name: string;
  phone: string;
  email?: string;
  payment_method: "online" | "cash";
  consent: boolean;
};

export async function prepareGuestOrder(payload: GuestPreparePayload) {
  const { data } = await apiClient.post("/guest-orders/prepare", payload) as any;
  return data as { draft_order_id: string; amount: number; currency: string; payment_intent_client_secret?: string };
}

export async function confirmGuestCash(draft_order_id: string) {
  const { data } = await apiClient.post("/guest-orders/confirm-cash", { draft_order_id }) as any;
  return data as { order_id: number; status: string; payment_status: string };
}

export async function getDraftStatus(draft_order_id: string) {
  const { data } = await apiClient.get("/guest-orders/status", { params: { draft_order_id } }) as any;
  return data as { status: string; order_id: number | null };
}
