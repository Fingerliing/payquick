import type { OrderStatus, PaymentStatus, OrderType, ListResponse, MonetaryAmount } from './common';

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
  allergen_display?: any;            // read-only (serializer)
  dietary_tags?: any;                // read-only (serializer)

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
  customer_display?: string;         // username / nom / "Client N"
  order_type: OrderType;
  order_type_display?: string;

  table_number?: string | null;      // CORRIGÉ: string comme dans le backend

  status: OrderStatus;
  status_display?: string;

  payment_status: PaymentStatus;
  payment_status_display?: string;

  total_amount: string;              // décimal en string
  items_count?: number;              // SerializerMethodField
  waiting_time?: number | null;      // minutes (SerializerMethodField)
  restaurant_name?: string;
  
  estimated_ready_time?: string | null; // "HH:MM:SS"
  created_at: string;                // ISO
}

// ------------------------------
// Représentation "détail"
// ------------------------------
export interface OrderDetail {
  id: number;
  order_number: string;
  user?: number | null;              // FK User si connecté
  customer_display?: string;
  restaurant: number;
  restaurant_name?: string;

  order_type: OrderType;
  order_type_display?: string;
  table_number?: string | null;      // string comme dans le backend
  customer_name?: string;
  phone?: string;

  status: OrderStatus;
  status_display?: string;
  payment_status: PaymentStatus;
  payment_status_display?: string;
  payment_method?: string;           // 'cash' | 'card' | 'online'
  payment_method_display?: string;   // littéral avec emoji

  // Montants calculés par le backend (source de vérité)
  subtotal: string;                  // décimal en string
  tax_amount: string;                // décimal en string
  total_amount: string;              // décimal en string

  estimated_ready_time?: string | null; // "HH:MM:SS"
  ready_at?: string | null;             // ISO
  served_at?: string | null;            // ISO

  notes?: string | null;

  // Items de la commande
  items: OrderItem[];

  // Méthodes du serializer
  can_be_cancelled?: boolean;        // SerializerMethodField
  preparation_time?: number | null;  // SerializerMethodField (minutes)

  created_at: string;                // ISO
  updated_at?: string;               // ISO
}

export interface OrderDetailWithPayment extends OrderDetail {
  tip_amount?: MonetaryAmount;
  total_with_tip?: MonetaryAmount;
  customer_email?: string;
}

// ------------------------------
// Payload pour les items de création
// ------------------------------
export interface CreateOrderItemInput {
  menu_item: number;                 // champ attendu côté backend
  quantity: number;
  customizations?: Record<string, any>;
  special_instructions?: string;
  // SUPPRIMÉ: unit_price - calculé automatiquement par le backend
}

// ------------------------------
// Payload de création (POST /orders)
// Correspond exactement à OrderCreateSerializer
// ------------------------------
export interface CreateOrderRequest {
  restaurant: number;
  order_type: OrderType;             // 'dine_in' | 'takeaway'
  table_number?: string;             // requis si dine_in (string, pas number)
  customer_name?: string;            // requis pour commandes anonymes
  phone?: string;
  payment_method?: string;           // 'cash' | 'card' | 'online'
  notes?: string;
  items: CreateOrderItemInput[];     // liste des items
}

// ------------------------------
// Types étendus avec informations de table
// ------------------------------
export interface OrderWithTableInfo extends OrderDetail {
  // Informations de session de table
  table_session_id?: string;         // UUID
  order_sequence?: number;
  is_main_order?: boolean;
  
  // Informations calculées
  table_orders_count?: number;
  table_total_amount?: string;
  table_waiting_time?: number;
  table_status_summary?: any;
}

// ------------------------------
// Session de table
// ------------------------------
export interface TableSession {
  id: string;                        // UUID
  restaurant: number;
  table_number: string;
  started_at: string;                // ISO
  ended_at?: string | null;          // ISO
  is_active: boolean;
  primary_customer_name?: string;
  primary_phone?: string;
  guest_count?: number;
  session_notes?: string;
  orders_count?: number;             // ReadOnlyField
  total_amount?: string;             // ReadOnlyField
  duration?: any;                    // ReadOnlyField
  orders?: OrderList[];              // SerializerMethodField
}

// ------------------------------
// Réponses possibles de l'API
// ------------------------------
export type OrderListResponse = ListResponse<OrderList>;
export type OrderDetailResponse = OrderDetail;
export type KitchenListResponse = ListResponse<OrderList>;

// ------------------------------
// Stats (action /orders/statistics)
// Correspond exactement à OrderStatsSerializer
// ------------------------------
export interface OrderStats {
  total_orders: number;
  pending: number;
  confirmed: number;
  preparing: number;
  ready: number;
  served: number;
  cancelled: number;
  paid_orders: number;
  unpaid_orders: number;
  total_revenue: string;             // DecimalField en string
  average_order_value: string;       // DecimalField en string
  average_preparation_time: number;  // IntegerField en minutes
}

// Réponse enveloppée des statistiques
export interface OrderStatsResponse {
  period?: string;
  restaurant_id?: number;
  stats: OrderStats;
  generated_at?: string;             // ISO timestamp
}

// ------------------------------
// Réponse pour les commandes de table
// ------------------------------
export interface TableOrdersResponse {
  restaurant_id: number;
  restaurant_name: string;
  table_number: string;
  active_orders: OrderWithTableInfo[];
  completed_orders: OrderWithTableInfo[];
  table_statistics: any;
  current_session?: TableSession | null;
  can_add_order: boolean;
  last_updated: string;              // ISO timestamp
}

// ------------------------------
// Réponse de la vue cuisine
// ------------------------------
export interface KitchenViewTable {
  table_number: string;
  orders: OrderWithTableInfo[];
  total_items: number;
  oldest_order_time: string;         // ISO
  urgency_level: 'normal' | 'warning' | 'urgent';
}

export interface KitchenViewResponse {
  restaurant_id: number;
  tables: KitchenViewTable[];
  total_active_orders: number;
  last_updated: string;              // ISO
}

// ------------------------------
// Helpers de validation et transformation
// ------------------------------
export const normalizeCreateOrderRequest = (
  request: any
): CreateOrderRequest => {
  const normalized: CreateOrderRequest = {
    restaurant: request.restaurant,
    order_type: request.order_type,
    items: request.items || [],
  };

  // Gérer table vs table_number
  if (request.table_number) {
    normalized.table_number = request.table_number;
  } else if (request.table) {
    normalized.table_number = String(request.table);
  }

  // Champs optionnels
  if (request.customer_name) normalized.customer_name = request.customer_name;
  if (request.phone) normalized.phone = request.phone;
  if (request.payment_method) normalized.payment_method = request.payment_method;
  if (request.notes) normalized.notes = request.notes;

  return normalized;
};

// Type guard pour valider un payload de commande
export const isValidCreateOrderRequest = (
  data: any
): data is CreateOrderRequest => {
  if (!data || typeof data !== 'object') return false;

  // Vérifications de base
  if (typeof data.restaurant !== 'number') return false;
  if (!['dine_in', 'takeaway'].includes(data.order_type)) return false;
  
  // Pour dine_in, table_number est requis
  if (data.order_type === 'dine_in' && !data.table_number) return false;
  
  // Vérifier les items
  if (!Array.isArray(data.items) || data.items.length === 0) return false;
  
  // Vérifier chaque item
  return data.items.every((item: any) =>
    item &&
    typeof item.menu_item === 'number' &&
    typeof item.quantity === 'number' &&
    item.quantity > 0
  );
};

// Helper pour extraire les stats d'une réponse enveloppée
export const extractOrderStats = (
  response: OrderStats | OrderStatsResponse
): OrderStats => {
  return 'stats' in response ? response.stats : response;
};

// Helper pour formater les montants décimaux
export const formatDecimalAmount = (amount: string): number => {
  return parseFloat(amount);
};

// Helper pour vérifier si une commande peut être annulée
export const canCancelOrder = (order: OrderDetail): boolean => {
  return order.can_be_cancelled === true;
};

// Helper pour obtenir le prochain statut possible
export const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
  const transitions: Record<OrderStatus, OrderStatus | null> = {
    pending: 'confirmed',
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'served',
    served: null,
    cancelled: null,
  };
  return transitions[currentStatus] || null;
};