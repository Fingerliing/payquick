import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Cart, CartItem, CartContextType } from "@/types/cart";

const CART_STORAGE_KEY = "@EatAndGo_cart";

const CartContext = createContext<CartContextType | undefined>(undefined);

const emptyCart = (): Cart => ({
  items: [],
  restaurantId: undefined,
  restaurantName: undefined,
  tableNumber: undefined,
  subtotal: 0,
  total: 0,
  itemCount: 0,
});

function calculateTotals(cartData: Omit<Cart, "subtotal" | "total" | "itemCount"> & { items: CartItem[] }): Cart {
  const subtotal = cartData.items.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const itemCount = cartData.items.reduce((n, it) => n + it.quantity, 0);
  const total = subtotal; // pas de deliveryFee/tax côté front
  return { ...cartData, subtotal, total, itemCount };
}

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<Cart>(emptyCart());

  // Chargement persistant
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const parsed: Cart = JSON.parse(raw);
          setCart(calculateTotals({ ...parsed, items: parsed.items ?? [] }));
        }
      } catch {/* ignore */}
    })();
  }, []);

  // Persistance
  useEffect(() => {
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)).catch(() => {});
  }, [cart]);

  const addToCart: CartContextType["addToCart"] = (item, quantity = 1) => {
    setCart(prev => {
      // Panier mono-restaurant : reset si changement
      const shouldReset = prev.restaurantId && prev.restaurantId !== item.restaurantId;
      const base = shouldReset ? emptyCart() : prev;

      const idx = base.items.findIndex(it => it.id === item.id);
      const nextItems = [...base.items];
      if (idx >= 0) {
        nextItems[idx] = { ...nextItems[idx], quantity: nextItems[idx].quantity + quantity };
      } else {
        nextItems.push({ ...item, quantity });
      }

      return calculateTotals({
        ...base,
        restaurantId: item.restaurantId ?? base.restaurantId,
        restaurantName: item.restaurantName ?? base.restaurantName,
        items: nextItems,
      });
    });
  };

  const removeFromCart: CartContextType["removeFromCart"] = (itemId) => {
    setCart(prev => {
      const newItems = prev.items.filter(it => it.id !== itemId);
      const next = newItems.length ? { ...prev, items: newItems } : emptyCart();
      return calculateTotals(next);
    });
  };

  const updateQuantity: CartContextType["updateQuantity"] = (itemId, quantity) => {
    if (quantity <= 0) return removeFromCart(itemId);
    setCart(prev => {
      const newItems = prev.items.map(it => (it.id === itemId ? { ...it, quantity } : it));
      return calculateTotals({ ...prev, items: newItems });
    });
  };

  const setTableNumber: CartContextType["setTableNumber"] = (tableNumber) => {
    setCart(prev => ({
      ...prev,
      tableNumber
    }));
  };

  const clearCart: CartContextType["clearCart"] = () => setCart(emptyCart());
  const getCartTotal: CartContextType["getCartTotal"] = () => cart.total;
  const getItemCount: CartContextType["getItemCount"] = () => cart.itemCount;
  const isCartForRestaurant: CartContextType["isCartForRestaurant"] = (restaurantId) =>
    !cart.restaurantId || cart.restaurantId === restaurantId;

  const value: CartContextType = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getItemCount,
    isCartForRestaurant,
    setTableNumber,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
};
