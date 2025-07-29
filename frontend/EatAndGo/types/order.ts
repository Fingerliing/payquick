export interface Order {
  id: number;
  order_number: string;
  user?: number;
  customer_name?: string;
  customer_display?: string;
  restaurant: number;
  restaurant_name?: string;
  order_type: 'dine_in' | 'takeaway';
  order_type_display?: string;
  table_number?: string;
  phone?: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
  status_display?: string;
  payment_status: 'pending' | 'paid' | 'failed';
  payment_status_display?: string;
  payment_method?: 'cash' | 'card' | 'online';
  payment_method_display?: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  estimated_ready_time?: string;
  ready_at?: string;
  served_at?: string;
  notes?: string;
  items?: OrderItem[];
  can_be_cancelled?: boolean;
  preparation_time?: number;
  created_at: string;
  updated_at: string;
}

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