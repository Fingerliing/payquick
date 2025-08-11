import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem, Cart, CartContextType } from '@/types/cart';

const CART_STORAGE_KEY = '@EatAndGo_cart';

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({
    items: [],
    subtotal: 0,
    deliveryFee: 0,
    tax: 0,
    total: 0,
    itemCount: 0,
  });

  useEffect(() => {
    loadCart();
  }, []);

  useEffect(() => {
    saveCart();
  }, [cart]);

  const loadCart = async () => {
    try {
      const savedCart = await AsyncStorage.getItem(CART_STORAGE_KEY);
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        setCart(calculateTotals(parsedCart));
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    }
  };

  const saveCart = async () => {
    try {
      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  };

  const calculateTotals = (cartData: Cart): Cart => {
    const subtotal = cartData.items.reduce(
      (sum, item) => sum + (item.price * item.quantity), 
      0
    );
    
    const deliveryFee = 2.50;
    const taxRate = 0.1; // 10% TVA comme dans votre Order
    const tax = subtotal * taxRate;
    const total = subtotal + deliveryFee + tax;
    
    const itemCount = cartData.items.reduce(
      (sum, item) => sum + item.quantity, 
      0
    );

    return {
      ...cartData,
      subtotal,
      deliveryFee,
      tax,
      total,
      itemCount,
    };
  };

  const addToCart = (item: Omit<CartItem, 'quantity'>) => {
    setCart(prev => {
      // Vérifier changement de restaurant
      if (prev.restaurantId && prev.restaurantId !== item.restaurantId) {
        const newCart = {
          items: [{ ...item, quantity: 1 }],
          restaurantId: item.restaurantId,
          restaurantName: item.restaurantName,
          subtotal: 0,
          deliveryFee: 0,
          tax: 0,
          total: 0,
          itemCount: 0,
        };
        return calculateTotals(newCart);
      }

      const existingItemIndex = prev.items.findIndex(
        cartItem => cartItem.menuItemId === item.menuItemId
      );

      let newItems: CartItem[];
      
      if (existingItemIndex !== -1) {
        newItems = prev.items.map((cartItem, index) =>
          index === existingItemIndex
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      } else {
        newItems = [...prev.items, { ...item, quantity: 1 }];
      }

      const newCart = {
        ...prev,
        items: newItems,
        restaurantId: item.restaurantId,
        restaurantName: item.restaurantName,
      };

      return calculateTotals(newCart);
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const newItems = prev.items.filter(item => item.id !== itemId);
      
      const newCart = {
        ...prev,
        items: newItems,
        restaurantId: newItems.length > 0 ? prev.restaurantId : undefined,
        restaurantName: newItems.length > 0 ? prev.restaurantName : undefined,
      };

      return calculateTotals(newCart);
    });
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
      return;
    }

    setCart(prev => {
      const newItems = prev.items.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      );

      const newCart = { ...prev, items: newItems };
      return calculateTotals(newCart);
    });
  };

  const clearCart = () => {
    setCart({
      items: [],
      restaurantId: undefined,
      restaurantName: undefined,
      subtotal: 0,
      deliveryFee: 0,
      tax: 0,
      total: 0,
      itemCount: 0,
    });
  };

  const getCartTotal = () => cart.total;
  const getItemCount = () => cart.itemCount;
  const isCartForRestaurant = (restaurantId: number): boolean => {
    return !cart.restaurantId || cart.restaurantId === restaurantId;
  };

  const value: CartContextType = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getItemCount,
    isCartForRestaurant,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}