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
  // Aligné avec GuestPrepare (guest_views.py)
  const { data } = await apiClient.post("/api/guest/prepare", payload) as any;
  return data as {
    draft_order_id: string;
    amount: number;
    currency: string;
    payment_intent_client_secret?: string;
  };
}

export async function confirmGuestCash(draft_order_id: string) {
  // Aligné avec GuestConfirmCash (guest_views.py)
  const { data } = await apiClient.post("/api/guest/confirm-cash", { draft_order_id }) as any;
  return data as { order_id: number; status: string; payment_status: string };
}

export async function getDraftStatus(draft_order_id: string) {
  // Aligné avec GuestDraftStatus (guest_views.py)
  const { data } = await apiClient.get("/api/guest/draft-status", { params: { draft_order_id } }) as any;
  return data as { status: string; order_id: number | null };
}
