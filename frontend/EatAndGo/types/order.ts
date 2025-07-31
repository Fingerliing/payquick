// ============================================================================
// TYPES DE BASE (Correspondant aux modèles Django)
// ============================================================================

export interface OrderItem {
  id: number;
  menu_item: number;
  menu_item_name?: string;
  menu_item_image?: string; 
  menu_item_price?: string;
  category?: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  customizations?: Record<string, any>;
  special_instructions?: string;
  allergen_display?: string[];
  dietary_tags?: string[];
  created_at: string;
}

// ============================================================================
// TYPES ORDER (Basés sur les Serializers Django)
// ============================================================================

/**
 * Type Order de base (correspondant au modèle Django)
 */
export interface OrderBase {
  id: number;
  order_number: string;
  user?: number;
  customer_name?: string;
  restaurant: number;
  order_type: 'dine_in' | 'takeaway';
  table_number?: string;
  phone?: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed';
  payment_method?: 'cash' | 'card' | 'online';
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  estimated_ready_time?: string;
  ready_at?: string;
  served_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Order pour la liste (OrderListSerializer)
 * Correspond à ce que retourne la vue list()
 */
export interface OrderList extends OrderBase {
  // Propriétés ajoutées par OrderListSerializer
  restaurant_name?: string;
  customer_display?: string;
  order_type_display?: string;
  status_display?: string;
  payment_status_display?: string;
  items_count?: number;        // get_items_count()
  waiting_time?: number;       // get_waiting_time()
  
  // Propriétés ajoutées par la vue list() dans order_views.py
  is_urgent?: boolean;         // _is_order_urgent()
  items_summary?: string;      // _get_items_summary()
  next_possible_status?: string; // _get_next_status()
}

/**
 * Order détaillé (OrderDetailSerializer)
 * Correspond à ce que retourne la vue retrieve()
 */
export interface OrderDetail extends OrderBase {
  // Propriétés ajoutées par OrderDetailSerializer
  restaurant_name?: string;
  customer_display?: string;
  order_type_display?: string;
  status_display?: string;
  payment_status_display?: string;
  payment_method_display?: string;
  can_be_cancelled?: boolean;  // get_can_be_cancelled()
  preparation_time?: number;   // get_preparation_time()
  items?: OrderItem[];         // Relation avec OrderItems
  
  // Propriétés ajoutées par la vue retrieve() dans order_views.py
  is_urgent?: boolean;
  items_summary?: string;
  next_possible_status?: string;
  timeline?: TimelineEvent[];
  payment_info?: PaymentInfo;
}

/**
 * Order pour la vue cuisine (kitchen_view)
 */
export interface OrderKitchen extends OrderList {
  special_instructions?: string[]; // _get_special_instructions()
}

// ============================================================================
// TYPES UTILITAIRES (Basés sur order_views.py)
// ============================================================================

export interface TimelineEvent {
  status: string;
  timestamp: string;
  label: string;
}

export interface PaymentInfo {
  is_paid: boolean;
  can_be_paid: boolean;
  payment_methods_available: string[];
}

// ============================================================================
// TYPES DE RÉPONSES API (Basés sur order_views.py)
// ============================================================================

/**
 * Réponse de la vue list() - ATTENTION: Pas toujours paginée !
 */
export type OrderListResponse = OrderList[] | {
  count: number;
  next: string | null;
  previous: string | null;
  results: OrderList[];
};

/**
 * Réponse de la vue kitchen_view()
 */
export interface KitchenViewResponse {
  restaurant_id: string;
  orders_by_status: {
    pending: OrderKitchen[];
    confirmed: OrderKitchen[];
    preparing: OrderKitchen[];
    ready: OrderKitchen[];
  };
  daily_stats: {
    total: number;
    served: number;
    cancelled: number;
    revenue: number | null;
  };
  last_updated: string;
}

/**
 * Réponse de la vue statistics()
 */
export interface OrderStatsResponse {
  period: string;
  restaurant_id?: string;
  stats: OrderStats;
  generated_at: string;
}

// ============================================================================
// TYPES POUR LES REQUÊTES
// ============================================================================

export interface CreateOrderRequest {
  restaurant: number;
  order_type: 'dine_in' | 'takeaway';
  table_number?: string;
  customer_name?: string;
  phone?: string;
  payment_method: 'cash' | 'card' | 'online';
  notes?: string;
  items: CreateOrderItemRequest[];
}

export interface CreateOrderItemRequest {
  menu_item: number;
  quantity: number;
  customizations?: Record<string, any>;
  special_instructions?: string;
}

export interface UpdateOrderStatusRequest {
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
}

export interface MarkAsPaidRequest {
  payment_method: 'cash' | 'card' | 'online';
}

// ============================================================================
// TYPES STATISTIQUES (Basés sur OrderStatsSerializer)
// ============================================================================

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
  total_revenue: string;
  average_order_value: string; 
  average_preparation_time: number;
}

// ============================================================================
// TYPES UNION PRINCIPAUX
// ============================================================================

/**
 * Type Order générique - Union de tous les formats possibles
 */
export type Order = OrderBase | OrderList | OrderDetail | OrderKitchen;

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isOrderList(order: Order): order is OrderList {
  return 'items_count' in order && !('items' in order);
}

export function isOrderDetail(order: Order): order is OrderDetail {
  return 'items' in order && Array.isArray(order.items);
}

export function isOrderKitchen(order: Order): order is OrderKitchen {
  return 'special_instructions' in order;
}

// ============================================================================
// ADAPTATEURS
// ============================================================================

/**
 * Normalise une commande vers le format OrderList standard
 */
export function normalizeOrderToList(apiOrder: any): OrderList {
  return {
    // Propriétés de base garanties
    id: apiOrder.id,
    order_number: apiOrder.order_number,
    user: apiOrder.user,
    customer_name: apiOrder.customer_name,
    restaurant: apiOrder.restaurant,
    order_type: apiOrder.order_type,
    table_number: apiOrder.table_number,
    phone: apiOrder.phone,
    status: apiOrder.status,
    payment_status: apiOrder.payment_status,
    payment_method: apiOrder.payment_method,
    subtotal: apiOrder.subtotal,
    tax_amount: apiOrder.tax_amount,
    total_amount: apiOrder.total_amount,
    estimated_ready_time: apiOrder.estimated_ready_time,
    ready_at: apiOrder.ready_at,
    served_at: apiOrder.served_at,
    notes: apiOrder.notes,
    created_at: apiOrder.created_at,
    updated_at: apiOrder.updated_at,
    
    // Propriétés optionnelles du serializer
    restaurant_name: apiOrder.restaurant_name,
    customer_display: apiOrder.customer_display,
    order_type_display: apiOrder.order_type_display,
    status_display: apiOrder.status_display,
    payment_status_display: apiOrder.payment_status_display,
    items_count: apiOrder.items_count,
    waiting_time: apiOrder.waiting_time,
    
    // Propriétés ajoutées par les vues
    is_urgent: apiOrder.is_urgent,
    items_summary: apiOrder.items_summary,
    next_possible_status: apiOrder.next_possible_status,
  };
}

/**
 * Extrait les commandes d'une réponse API (gère tous les formats)
 */
export function extractOrdersFromResponse(response: any): OrderList[] {
  // Array direct
  if (Array.isArray(response)) {
    return response.map(normalizeOrderToList);
  }
  
  // Réponse paginée Django REST
  if (response && typeof response === 'object') {
    if ('results' in response && Array.isArray(response.results)) {
      return response.results.map(normalizeOrderToList);
    }
    if ('data' in response && Array.isArray(response.data)) {
      return response.data.map(normalizeOrderToList);
    }
  }
  
  // Fallback
  return [];
}

// ============================================================================
// CONSTANTES UTILES
// ============================================================================

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
} as const;

export const ORDER_TYPE = {
  DINE_IN: 'dine_in',
  TAKEAWAY: 'takeaway',
} as const;

export const PAYMENT_METHOD = {
  CASH: 'cash',
  CARD: 'card',
  ONLINE: 'online',
} as const;

// Types des constantes
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];
export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];
export type OrderType = typeof ORDER_TYPE[keyof typeof ORDER_TYPE];
export type PaymentMethod = typeof PAYMENT_METHOD[keyof typeof PAYMENT_METHOD];

// ============================================================================
// HOOKS UTILITAIRES
// ============================================================================

export function useOrderNormalizer() {
  const normalizeOrder = (order: any): Order => {
    return normalizeOrderToList(order);
  };
  
  const extractOrders = (response: any): OrderList[] => {
    return extractOrdersFromResponse(response);
  };
  
  const isUrgent = (order: Order): boolean => {
    if ('is_urgent' in order) {
      return order.is_urgent || false;
    }
    
    // Calcul fallback
    const elapsed = Date.now() - new Date(order.created_at).getTime();
    return elapsed > 30 * 60 * 1000; // Plus de 30 minutes
  };
  
  return {
    normalizeOrder,
    extractOrders,
    isUrgent,
  };
}