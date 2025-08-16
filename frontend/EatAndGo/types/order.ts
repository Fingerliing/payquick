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

  table_number?: string | null;      // ← CORRIGÉ: était table?: number

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
  
  // ✅ AJOUT: Champs additionnels du backend
  customer_name?: string;
  phone?: string;
  user?: number | null;              // FK User si connecté
}

// ------------------------------
// Payload de création (POST /orders)
// ------------------------------
export interface CreateOrderItemInput {
  menu_item: number;                 // ⚠️ champ attendu côté back
  quantity: number;
  unit_price: string;
  customizations?: Record<string, any>;
  special_instructions?: string;
}

// ✅ CORRECTION MAJEURE: Correspondre exactement au serializer backend
export interface CreateOrderRequest {
  restaurant: number;
  order_type: OrderType;             // 'dine_in' | 'takeaway'
  
  // ✅ CORRIGÉ: table_number (string) au lieu de table (number)
  table_number?: string;             // requis si dine_in (selon logique back)
  
  // ✅ CORRIGÉ: customer_name est REQUIS pour les commandes anonymes
  customer_name: string;             // ← REQUIS (pas optionnel)
  
  // ✅ AJOUT: Champs optionnels supportés par le backend
  phone?: string;
  payment_method?: string;
  
  items: CreateOrderItemInput[];     // mapping depuis le panier
  notes?: string | null;
}

// ------------------------------
// Type pour la compatibilité avec l'ancien code
// ------------------------------
export interface CreateOrderRequestLegacy {
  restaurant: number;
  order_type: OrderType;
  table?: number;                    // Ancien format (sera converti)
  table_number?: string;             // Nouveau format
  customer_name: string;
  phone?: string;
  payment_method?: string;
  items: CreateOrderItemInput[];
  notes?: string | null;
}

// ------------------------------
// Réponses possibles de l'API
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
  
  // ✅ AJOUT: Champs du backend OrderStatsSerializer
  confirmed?: number;
  preparing?: number;
  ready?: number;
  served?: number;
  cancelled?: number;
  unpaid_orders?: number;
  total_revenue?: string;
  average_order_value?: string;
  average_preparation_time?: number; // minutes
}

// Certaines implémentations renvoient { period, restaurant_id, stats: {...} }
export type OrderStatsEnvelope =
  | OrderStats
  | {
      period?: string;
      restaurant_id?: number;
      stats: OrderStats;
      generated_at?: string;        // ISO timestamp
    };

// ------------------------------
// Helpers optionnels (utiles côté services/hooks)
// ------------------------------
export const isOrderStatsEnvelope = (x: any): x is { stats: OrderStats } =>
  !!x && typeof x === 'object' && 'stats' in x && x.stats;

export const unwrapOrderStats = (x: OrderStatsEnvelope | null | undefined): OrderStats | null =>
  !x ? null : (isOrderStatsEnvelope(x) ? x.stats : x);

export const normalizeCreateOrderRequest = (
  request: CreateOrderRequestLegacy
): CreateOrderRequest => {
  const normalized: CreateOrderRequest = {
    restaurant: request.restaurant,
    order_type: request.order_type,
    customer_name: request.customer_name,
    items: request.items,
    notes: request.notes,
  };

  // Gérer table vs table_number
  if (request.table_number) {
    normalized.table_number = request.table_number;
  } else if (request.table) {
    normalized.table_number = String(request.table);
  }

  // Champs optionnels
  if (request.phone) normalized.phone = request.phone;
  if (request.payment_method) normalized.payment_method = request.payment_method;

  return normalized;
};

// ✅ NOUVEAU: Type guard pour valider un payload de commande
export const isValidCreateOrderRequest = (
  data: any
): data is CreateOrderRequest => {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.restaurant === 'number' &&
    typeof data.order_type === 'string' &&
    ['dine_in', 'takeaway'].includes(data.order_type) &&
    typeof data.customer_name === 'string' &&
    data.customer_name.trim().length > 0 &&
    Array.isArray(data.items) &&
    data.items.length > 0 &&
    data.items.every((item: any) =>
      item &&
      typeof item.menu_item === 'number' &&
      typeof item.quantity === 'number' &&
      item.quantity > 0
    ) &&
    // Pour dine_in, table_number est requis
    (data.order_type !== 'dine_in' || 
     (data.table_number && typeof data.table_number === 'string'))
  );
};