import { MenuItem } from "./menu";

export interface OrderItem {
  id?: number;
  menu_item: MenuItem;
  quantity: number;
  price_snapshot: string;
  special_request?: string;
  line_total?: string;
}

export type OrderStatus = "pending" | "in_progress" | "served" | "cancelled";

export interface Order {
  id: number;
  restaurant: string;
  table?: number;
  status: OrderStatus;
  order_items: OrderItem[];
  total_price: string;
  created_at: string;
}