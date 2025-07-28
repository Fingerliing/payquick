import React, { createContext, useContext, useState } from "react";
import { OrderItemInput } from "@/services/orderService";

interface Cart {
  restaurantId: number | null;
  tableId: number | null;
  items: OrderItemInput[];
}

const CartContext = createContext<{
  cart: Cart;
  addItem: (item: OrderItemInput) => void;
  clearCart: () => void;
}>({} as any);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<Cart>({ restaurantId: null, tableId: null, items: [] });

  const addItem = (item: OrderItemInput) => {
    setCart((prev) => ({ ...prev, items: [...prev.items, item] }));
  };

  const clearCart = () => setCart({ restaurantId: null, tableId: null, items: [] });

  return (
    <CartContext.Provider value={{ cart, addItem, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);