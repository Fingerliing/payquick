import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Cart, CartItem, CartContextType } from "@/types/cart";
import { tableOrderService, TableOrdersResponse, OrderWithTableInfo } from "@/services/tableOrderService";
import { CreateOrderRequest } from "@/types/order";

const CART_STORAGE_KEY = "@EatAndGo_cart";
const QR_SESSION_KEY = "@qr_session_data";

interface QRSessionData {
  restaurantId: string;
  restaurantName?: string;
  tableNumber?: string;
  originalCode: string;
  timestamp: number;
}

// Type étendu pour inclure les méthodes de gestion des commandes multiples
interface ExtendedCartContextType extends CartContextType {
  // Méthodes QR session existantes
  initializeFromQRSession: () => Promise<void>;
  getQRSessionData: () => Promise<QRSessionData | null>;
  updateTableFromQR: (tableNumber: string) => Promise<void>;
  qrSessionData: QRSessionData | null;
  
  // Nouvelles méthodes pour commandes multiples
  tableOrders: TableOrdersResponse | null;
  isLoadingTableOrders: boolean;
  tableOrdersError: string | null;
  refreshTableOrders: () => Promise<void>;
  hasActiveTableOrders: boolean;
  canAddOrderToTable: boolean;
  addOrderToTable: (orderData: CreateOrderRequest) => Promise<OrderWithTableInfo>;
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
  const total = subtotal;
  return { ...cartData, subtotal, total, itemCount };
}

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<Cart>(emptyCart());
  const [qrSessionData, setQRSessionData] = useState<QRSessionData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Nouveaux states pour les commandes multiples
  const [tableOrders, setTableOrders] = useState<TableOrdersResponse | null>(null);
  const [isLoadingTableOrders, setIsLoadingTableOrders] = useState(false);
  const [tableOrdersError, setTableOrdersError] = useState<string | null>(null);

  // États calculés
  const hasActiveTableOrders = tableOrders ? tableOrders.active_orders.length > 0 : false;
  const canAddOrderToTable = tableOrders ? tableOrders.can_add_order : true;

  // Chargement initial
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
        const maxAge = 24 * 60 * 60 * 1000;
        
        if (sessionAge > maxAge) {
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
      console.error('⚠️ Error loading initial data:', error);
      setIsInitialized(true);
    }
  };

  // Persistance du cart
  useEffect(() => {
    if (isInitialized) {
      AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)).catch(() => {});
    }
  }, [cart, isInitialized]);

  // Méthodes pour les commandes multiples
  const refreshTableOrders = useCallback(async () => {
    if (!cart.restaurantId || !cart.tableNumber) {
      setTableOrders(null);
      return;
    }

    try {
      setIsLoadingTableOrders(true);
      setTableOrdersError(null);
      
      const data = await tableOrderService.getTableOrders(
        cart.restaurantId,
        cart.tableNumber
      );
      
      setTableOrders(data);
      setIsLoadingTableOrders(false);
      console.log('📋 Table orders refreshed:', data.active_orders.length + ' active orders');
      
    } catch (error: any) {
      console.error('⚠️ Error loading table orders:', error);
      setTableOrdersError(error.message || 'Erreur lors du chargement des commandes');
      setIsLoadingTableOrders(false);
    }
  }, [cart.restaurantId, cart.tableNumber]);

  // Charger les commandes de table quand on a un restaurant, une table ET une session QR valide
  useEffect(() => {
    if (cart.restaurantId && cart.tableNumber && isInitialized && qrSessionData) {
      refreshTableOrders();
    }
  }, [cart.restaurantId, cart.tableNumber, isInitialized, qrSessionData, refreshTableOrders]);

  const clearCart: CartContextType["clearCart"] = useCallback(() => setCart(emptyCart()), []);

  const addOrderToTable = useCallback(async (orderData: CreateOrderRequest): Promise<OrderWithTableInfo> => {
    if (!cart.restaurantId || !cart.tableNumber) {
      throw new Error('Restaurant et table requis pour passer une commande');
    }

    if (!canAddOrderToTable) {
      throw new Error('Impossible d\'ajouter une commande à cette table pour le moment');
    }

    try {
      console.log('🍽️ Adding new order to table:', {
        restaurant: cart.restaurantId,
        table: cart.tableNumber,
        items: cart.items.length
      });

      // Utiliser les données du cart pour construire la requête
      const completeOrderData: CreateOrderRequest = {
        ...orderData,
        restaurant: cart.restaurantId,
        table_number: cart.tableNumber,
        // Mapper les items du cart vers le format attendu par l'API
        items: cart.items.map(item => {
          const menuItemId = parseInt(item.id);
          if (isNaN(menuItemId)) {
            throw new Error(`Invalid menu item ID: ${item.id}`);
          }
          
          return {
            menu_item: menuItemId, // ✅ CORRIGÉ: Convertir string vers number avec validation
            quantity: item.quantity,
            unit_price: item.price.toString(),
            customizations: item.customizations || {},
            special_instructions: item.specialInstructions || ''
          };
        })
      };

      // Ajouter la commande via le service
      const newOrder = await tableOrderService.addTableOrder(completeOrderData);

      console.log('✅ Order added to table:', newOrder.order_number);

      // Vider le panier après succès
      clearCart();
      
      // Rafraîchir les commandes de la table
      await refreshTableOrders();

      return newOrder;
      
    } catch (error: any) {
      console.error('⚠️ Error adding order to table:', error);
      throw error;
    }
  }, [cart.restaurantId, cart.tableNumber, cart.items, canAddOrderToTable, clearCart, refreshTableOrders]);

  // Méthodes QR existantes (inchangées)
  const initializeFromQRSession = useCallback(async (): Promise<void> => {
    try {
      const qrRaw = await AsyncStorage.getItem(QR_SESSION_KEY);
      if (!qrRaw) return;

      const qrData: QRSessionData = JSON.parse(qrRaw);
      setQRSessionData(qrData);

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
      console.error('⚠️ Error initializing from QR session:', error);
    }
  }, []);

  const getQRSessionData = useCallback(async (): Promise<QRSessionData | null> => {
    try {
      const qrRaw = await AsyncStorage.getItem(QR_SESSION_KEY);
      return qrRaw ? JSON.parse(qrRaw) : null;
    } catch (error) {
      console.error('⚠️ Error getting QR session data:', error);
      return null;
    }
  }, []);

  const updateTableFromQR = useCallback(async (tableNumber: string): Promise<void> => {
    try {
      setCart(prev => ({ ...prev, tableNumber }));

      if (qrSessionData) {
        const updatedQRData = { ...qrSessionData, tableNumber };
        await AsyncStorage.setItem(QR_SESSION_KEY, JSON.stringify(updatedQRData));
        setQRSessionData(updatedQRData);
        console.log('✅ Table number updated in QR session:', tableNumber);
      }
    } catch (error) {
      console.error('⚠️ Error updating table from QR:', error);
    }
  }, [qrSessionData]);

  // Méthodes du cart
  const addToCart: CartContextType["addToCart"] = useCallback((item, quantity = 1) => {
    setCart(prev => {
      const shouldReset = prev.restaurantId && prev.restaurantId !== item.restaurantId;
      const base = shouldReset ? emptyCart() : prev;
  
      // Fonction pour comparer si deux articles sont identiques
      const isSameItem = (cartItem: CartItem): boolean => {
        // Vérifier si c'est le même article de menu
        if (cartItem.menuItemId !== item.menuItemId) return false;
        
        // Vérifier si les instructions spéciales sont identiques
        const sameInstructions = 
          (cartItem.specialInstructions || '') === (item.specialInstructions || '');
        
        // Vérifier si les customizations sont identiques
        const currentCustom = JSON.stringify(cartItem.customizations || {});
        const newCustom = JSON.stringify(item.customizations || {});
        const sameCustomizations = currentCustom === newCustom;
        
        return sameInstructions && sameCustomizations;
      };
  
      // Chercher si l'article existe déjà
      const existingIndex = base.items.findIndex(isSameItem);
      
      if (existingIndex >= 0) {
        // Article trouvé : on incrémente la quantité
        const updatedItems = [...base.items];
        updatedItems[existingIndex] = {
          ...updatedItems[existingIndex],
          quantity: updatedItems[existingIndex].quantity + quantity
        };
        
        console.log(`✅ Article existant, quantité mise à jour: ${updatedItems[existingIndex].name} (×${updatedItems[existingIndex].quantity})`);
        
        return calculateTotals({
          ...base,
          items: updatedItems,
        });
      } else {
        // Nouvel article : on l'ajoute avec un ID unique
        const newItem: CartItem = {
          ...item,
          id: item.id || `${item.menuItemId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          quantity
        };
        
        console.log(`➕ Nouvel article ajouté: ${newItem.name} (×${quantity})`);
        
        return calculateTotals({
          ...base,
          restaurantId: item.restaurantId ?? base.restaurantId,
          restaurantName: item.restaurantName ?? base.restaurantName,
          items: [...base.items, newItem],
        });
      }
    });
  }, []);

  const removeFromCart: CartContextType["removeFromCart"] = useCallback((itemId) => {
    setCart(prev => {
      const newItems = prev.items.filter(it => it.id !== itemId);
      const next = newItems.length ? { ...prev, items: newItems } : emptyCart();
      return calculateTotals(next);
    });
  }, []);

  const updateQuantity: CartContextType["updateQuantity"] = useCallback((itemId, quantity) => {
    if (quantity <= 0) return removeFromCart(itemId);
    setCart(prev => {
      const newItems = prev.items.map(it => (it.id === itemId ? { ...it, quantity } : it));
      return calculateTotals({ ...prev, items: newItems });
    });
  }, [removeFromCart]);

  const setTableNumber: CartContextType["setTableNumber"] = useCallback((tableNumber) => {
    setCart(prev => ({ ...prev, tableNumber }));
    updateTableFromQR(tableNumber).catch(console.error);
  }, [updateTableFromQR]);

  const getCartTotal: CartContextType["getCartTotal"] = useCallback(() => cart.total, [cart.total]);
  const getItemCount: CartContextType["getItemCount"] = useCallback(() => cart.itemCount, [cart.itemCount]);
  const isCartForRestaurant: CartContextType["isCartForRestaurant"] = useCallback((restaurantId) =>
    !cart.restaurantId || cart.restaurantId === restaurantId, [cart.restaurantId]);

  const value: ExtendedCartContextType = useMemo(() => ({
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
    
    // Méthodes QR existantes
    initializeFromQRSession,
    getQRSessionData,
    updateTableFromQR,
    qrSessionData,
    
    // Nouvelles méthodes pour commandes multiples
    tableOrders,
    isLoadingTableOrders,
    tableOrdersError,
    refreshTableOrders,
    hasActiveTableOrders,
    canAddOrderToTable,
    addOrderToTable
  }), [
    cart, addToCart, removeFromCart, updateQuantity, clearCart, getCartTotal,
    getItemCount, isCartForRestaurant, setTableNumber, initializeFromQRSession,
    getQRSessionData, updateTableFromQR, qrSessionData, tableOrders,
    isLoadingTableOrders, tableOrdersError, refreshTableOrders,
    hasActiveTableOrders, canAddOrderToTable, addOrderToTable
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
};