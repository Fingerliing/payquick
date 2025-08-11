export interface CartItem {
  id: string;
  menuItemId: number;
  name: string;
  description?: string;
  price: number;
  image?: string;
  quantity: number;
  restaurantId: number;
  restaurantName: string;
  specialInstructions?: string;
}

export interface Cart {
  items: CartItem[];
  restaurantId?: number;
  restaurantName?: string;
  tableNumber?: number;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface CartContextType {
  cart: Cart;
  addToCart: (item: Omit<CartItem, 'quantity'>) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getItemCount: () => number;
  isCartForRestaurant: (restaurantId: number) => boolean;
}
