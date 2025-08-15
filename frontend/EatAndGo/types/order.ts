import type { OrderStatus, PaymentStatus, OrderType, DRFPaginated, ListResponse } from './common';

// ------------------------------
// Items de commande (backend)
// ------------------------------
export interface OrderItem {
  id: number;
  menu_item: number;                 // FK MenuItem (ID)
  menu_item_name?: string;           // read-only (serializer)
  menu_item_image?: string | null;   // read-only (serializer)
  menu_item_price?: string;          // read-only (serializer)
  category?: string;                 // read-only (serializer)

  quantity: number;
  unit_price: string;                // décimal en string
  total_price: string;               // décimal en string

  customizations?: Record<string, any>;
  special_instructions?: string;

  created_at?: string;               // ISO
}

// ------------------------------
// Représentation "liste" (kitchen/counter)
// ------------------------------
export interface OrderList {
  id: number;
  order_number: string;
  restaurant: number;
  restaurant_name?: string;

  table?: number | null;
  table_number?: string | null;

  order_type: OrderType;
  status: OrderStatus;
  status_display?: string;

  payment_status: PaymentStatus;
  payment_status_display?: string;

  items_count: number;               // SerializerMethodField
  waiting_time?: number | null;      // minutes (SerializerMethodField)
  customer_display?: string;         // username / nom / "Client N"
  created_at: string;                // ISO
  updated_at?: string;               // ISO
}

// ------------------------------
// Représentation "détail"
// ------------------------------
export interface OrderDetail extends Omit<OrderList, 'items_count'> {
  items: OrderItem[];
  payment_method?: string;           // 'cash' | 'card' | 'online' | autre
  payment_method_display?: string;   // litéral
  can_be_cancelled?: boolean;        // SerializerMethodField
  preparation_time?: number | null;  // SerializerMethodField (minutes)

  // Montants calculés par le backend (source de vérité)
  subtotal: string;                  // décimal en string
  tax_amount: string;                // si le backend le renvoie (sinon "0.00")
  total_amount: string;

  estimated_ready_time?: string | null; // "HH:MM:SS"
  ready_at?: string | null;             // ISO
  served_at?: string | null;            // ISO

  notes?: string | null;
}

// ------------------------------
// Payload de création (POST /orders)
// ------------------------------
export interface CreateOrderItemInput {
  menu_item: number;                 // ⚠️ champ attendu côté back
  quantity: number;
  customizations?: Record<string, any>;
  special_instructions?: string;
}

export interface CreateOrderRequest {
  restaurant: number;
  order_type: OrderType;             // 'dine_in' | 'takeaway'
  table?: number | null;             // requis si dine_in (selon logique back)
  customer_name?: string | null;
  items: CreateOrderItemInput[];     // mapping depuis le panier
  notes?: string | null;
}

// ------------------------------
// Réponses possibles de l’API
// ------------------------------
export type OrderListResponse = ListResponse<OrderList>;
export type OrderDetailResponse = OrderDetail;

// Pour la vue "cuisine" / "comptoir" spécifique si tu as un endpoint dédié
export type KitchenListResponse = ListResponse<OrderList>;

// ------------------------------
// Stats (action /orders/statistics)
// ------------------------------
export interface OrderStats {
  total_orders: number;
  paid_orders: number;
  cancelled_orders: number;
  pending_orders: number;
  revenue: string;                  // décimal en string
  by_status?: Record<OrderStatus, number>;
  by_hour?: Record<string, number>;
  // Ajoute ici les clés renvoyées par ton action "statistics" si besoin
}

// Certaines implémentations renvoient { period, restaurant_id, stats: {...} }
export type OrderStatsEnvelope =
  | OrderStats
  | {
      period?: string;
      restaurant_id?: number;
      stats: OrderStats;
    };

// ------------------------------
// Helpers optionnels (utiles côté services/hooks)
// ------------------------------
export const isOrderStatsEnvelope = (x: any): x is { stats: OrderStats } =>
  !!x && typeof x === 'object' && 'stats' in x && x.stats;

export const unwrapOrderStats = (x: OrderStatsEnvelope | null | undefined): OrderStats | null =>
  !x ? null : (isOrderStatsEnvelope(x) ? x.stats : x);