import type { Restaurant } from './restaurant';
import type { User } from './auth';
import type { Product } from './restaurant';
import type { ProductVariant } from './restaurant';
import type { ProductAddon } from './restaurant';

export interface Order {
  id: string;
  restaurantId: string;
  restaurant: Pick<Restaurant, 'id' | 'name' | 'image'>;
  customerId?: string;
  customer?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'phone'>;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryAddress?: DeliveryAddress;
  customerNotes?: string;
  estimatedDeliveryTime?: string;
  actualDeliveryTime?: string;
  rating?: number;
  review?: string;
  createdAt: string;
  updatedAt: string;
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