import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Cart, CartItem, CartContextType } from "@/types/cart";

const CART_STORAGE_KEY = "@EatAndGo_cart";
const QR_SESSION_KEY = "@qr_session_data";

// Interface pour les données de session QR
interface QRSessionData {
  restaurantId: string;
  restaurantName?: string;
  tableNumber?: string;
  originalCode: string;
  timestamp: number;
}

// Type étendu pour inclure les méthodes QR
interface ExtendedCartContextType extends CartContextType {
  // Méthodes QR session
  initializeFromQRSession: () => Promise<void>;
  getQRSessionData: () => Promise<QRSessionData | null>;
  updateTableFromQR: (tableNumber: string) => Promise<void>;
  qrSessionData: QRSessionData | null;
}

const CartContext = createContext<ExtendedCartContextType | undefined>(undefined);

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
  const [qrSessionData, setQRSessionData] = useState<QRSessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Chargement initial : cart + session QR
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      // Charger le cart persistant
      const cartRaw = await AsyncStorage.getItem(CART_STORAGE_KEY);
      let cartData = emptyCart();
      
      if (cartRaw) {
        const parsed: Cart = JSON.parse(cartRaw);
        cartData = calculateTotals({ ...parsed, items: parsed.items ?? [] });
      }

      // Charger la session QR
      const qrRaw = await AsyncStorage.getItem(QR_SESSION_KEY);
      let qrData: QRSessionData | null = null;
      
      if (qrRaw) {
        qrData = JSON.parse(qrRaw);
        
        // Vérifier la validité de la session (24h)
        const now = Date.now();
        const sessionAge = now - (qrData?.timestamp ?? 0);
        const maxAge = 24 * 60 * 60 * 1000; // 24 heures
        
        if (sessionAge > maxAge) {
          // Session expirée, la supprimer
          await AsyncStorage.removeItem(QR_SESSION_KEY);
          qrData = null;
          console.log('🕐 QR session expired and removed');
        }
      }

      // Si on a des données QR et pas de restaurant dans le cart, initialiser
      if (qrData && !cartData.restaurantId) {
        cartData = {
          ...cartData,
          restaurantId: parseInt(qrData.restaurantId),
          restaurantName: qrData.restaurantName,
          tableNumber: qrData.tableNumber
        };
        console.log('🔄 Cart initialized from QR session:', qrData);
      }

      setCart(cartData);
      setQRSessionData(qrData);
      setIsInitialized(true);
      
    } catch (error) {
      console.error('❌ Error loading initial data:', error);
      setIsInitialized(true);
    }
  };

  // Persistance du cart (garder la logique existante)
  useEffect(() => {
    if (isInitialized) {
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)).catch(() => {});
    }
  }, [cart, isInitialized]);

  // Méthodes QR Session
  const initializeFromQRSession = async (): Promise<void> => {
    try {
      const qrRaw = await AsyncStorage.getItem(QR_SESSION_KEY);
      if (!qrRaw) return;

      const qrData: QRSessionData = JSON.parse(qrRaw);
      setQRSessionData(qrData);

      // Mettre à jour le cart si nécessaire
      setCart(prev => {
        const shouldUpdate = !prev.restaurantId || prev.restaurantId.toString() !== qrData.restaurantId;
        
        if (shouldUpdate) {
          console.log('🔄 Updating cart from QR session');
          return {
            ...prev,
            restaurantId: parseInt(qrData.restaurantId),
            restaurantName: qrData.restaurantName,
            tableNumber: qrData.tableNumber
          };
        }
        
        return prev;
      });
      
    } catch (error) {
      console.error('❌ Error initializing from QR session:', error);
    }
  };

  const getQRSessionData = async (): Promise<QRSessionData | null> => {
    try {
      const qrRaw = await AsyncStorage.getItem(QR_SESSION_KEY);
      return qrRaw ? JSON.parse(qrRaw) : null;
    } catch (error) {
      console.error('❌ Error getting QR session data:', error);
      return null;
    }
  };

  const updateTableFromQR = async (tableNumber: string): Promise<void> => {
    try {
      // Mettre à jour le cart
      setCart(prev => ({ ...prev, tableNumber }));

      // Mettre à jour la session QR si elle existe
      if (qrSessionData) {
        const updatedQRData = { ...qrSessionData, tableNumber };
        await AsyncStorage.setItem(QR_SESSION_KEY, JSON.stringify(updatedQRData));
        setQRSessionData(updatedQRData);
        console.log('✅ Table number updated in QR session:', tableNumber);
      }
    } catch (error) {
      console.error('❌ Error updating table from QR:', error);
    }
  };

  // Méthodes existantes (garder votre logique)
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
    setCart(prev => ({ ...prev, tableNumber }));
    
    // Aussi mettre à jour la session QR
    updateTableFromQR(tableNumber).catch(console.error);
  };

  const clearCart: CartContextType["clearCart"] = () => setCart(emptyCart());
  const getCartTotal: CartContextType["getCartTotal"] = () => cart.total;
  const getItemCount: CartContextType["getItemCount"] = () => cart.itemCount;
  const isCartForRestaurant: CartContextType["isCartForRestaurant"] = (restaurantId) =>
    !cart.restaurantId || cart.restaurantId === restaurantId;

  const value: ExtendedCartContextType = {
    // Méthodes existantes
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getItemCount,
    isCartForRestaurant,
    setTableNumber,
    
    // Nouvelles méthodes QR
    initializeFromQRSession,
    getQRSessionData,
    updateTableFromQR,
    qrSessionData
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
};