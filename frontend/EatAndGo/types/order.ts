import type { Restaurant } from './restaurant';
import type { User } from './user';
import type { Product } from './restaurant';
import type { ProductVariant } from './restaurant';
import type { ProductAddon } from './restaurant';

export interface Order {
  id: number;
  restaurant_name: string;
  restaurant_id: number | null;
  table: string;
  status: 'pending' | 'in_progress' | 'served' | 'delivered';
  is_paid: boolean;
  created_at: string;
  items_count: number;
  restaurant?: {
    id: number;
    name: string;
  };
  total?: number;
  createdAt?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  product: Pick<Product, 'id' | 'name' | 'price' | 'image'>;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  selectedVariant?: ProductVariant;
  selectedAddons: ProductAddon[];
  specialInstructions?: string;
}

export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'refunded';

export type PaymentMethod = 
  | 'credit_card'
  | 'debit_card'
  | 'paypal'
  | 'apple_pay'
  | 'google_pay'
  | 'cash';

export interface DeliveryAddress {
  street: string;
  city: string;
  zipCode: string;
  country: string;
  apartment?: string;
  instructions?: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

export interface OrderSummary {
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  total: number;
}