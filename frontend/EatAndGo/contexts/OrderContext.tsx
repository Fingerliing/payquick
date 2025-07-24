import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Order, OrderItem, OrderSummary } from '@/types/order';
import { orderService } from '@/services/orderService';

interface OrderState {
  orders: Order[];
  currentOrder: Order | null;
  cart: OrderItem[];
  isLoading: boolean;
  error: string | null;
  orderSummary: OrderSummary | null;
}

interface OrderContextType extends OrderState {
  loadOrders: (params?: any) => Promise<void>;
  loadOrder: (id: string) => Promise<void>;
  createOrder: (data: any) => Promise<Order>;
  updateOrderStatus: (id: string, status: string) => Promise<void>;
  cancelOrder: (id: string, reason?: string) => Promise<void>;
  addToCart: (item: OrderItem) => void;
  removeFromCart: (productId: string) => void;
  updateCartItem: (productId: string, updates: Partial<OrderItem>) => void;
  clearCart: () => void;
  calculateTotal: () => Promise<void>;
  refreshOrders: () => Promise<void>;
}

type OrderAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ORDERS'; payload: Order[] }
  | { type: 'SET_CURRENT_ORDER'; payload: Order | null }
  | { type: 'UPDATE_ORDER'; payload: Order }
  | { type: 'ADD_TO_CART'; payload: OrderItem }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'UPDATE_CART_ITEM'; payload: { productId: string; updates: Partial<OrderItem> } }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_ORDER_SUMMARY'; payload: OrderSummary | null};

const initialState: OrderState = {
  orders: [],
  currentOrder: null,
  cart: [],
  isLoading: false,
  error: null,
  orderSummary: null,
};

const orderReducer = (state: OrderState, action: OrderAction): OrderState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR': 
      return { ...state, error: action.payload };
    case 'SET_ORDERS':
      return { 
        ...state, 
        orders: Array.isArray(action.payload) ? action.payload : [],
        error: null
      };
    case 'SET_CURRENT_ORDER':
      return { ...state, currentOrder: action.payload, error: null };
    case 'UPDATE_ORDER':
      return {
        ...state,
        orders: state.orders.map(o => o.id === action.payload.id ? action.payload : o),
        currentOrder: state.currentOrder?.id === action.payload.id ? action.payload : state.currentOrder,
        error: null
      };
    case 'ADD_TO_CART':
      const existingItem = state.cart.find(item => item.productId === action.payload.productId);
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map(item =>
            item.productId === action.payload.productId
              ? { ...item, quantity: item.quantity + action.payload.quantity }
              : item
          ),
        };
      }
      return { ...state, cart: [...state.cart, action.payload] };
    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter(item => item.productId !== action.payload) };
    case 'UPDATE_CART_ITEM':
      return {
        ...state,
        cart: state.cart.map(item =>
          item.productId === action.payload.productId
            ? { ...item, ...action.payload.updates }
            : item
        ),
      };
    case 'CLEAR_CART':
      return { ...state, cart: [], orderSummary: null };
    case 'SET_ORDER_SUMMARY':
      return { ...state, orderSummary: action.payload };
    default:
      return state;
  }
};

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const OrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(orderReducer, initialState);

  // ✅ DEBUG: Logs pour tracer le cycle de vie
  useEffect(() => {
    console.log('🔍 OrderContext state change:', {
      orders: state.orders.length,
      cart: state.cart.length,
      isLoading: state.isLoading,
      error: state.error,
      isArray: Array.isArray(state.orders)
    });
  }, [state.orders, state.cart, state.isLoading, state.error]);

  const loadOrders = async (params?: any) => {
    try {
      console.log('🚀 OrderContext: Starting loadOrders...', params);
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const response = await orderService.getOrders(params);
      console.log('📥 OrderService response:', response);
      
      // ✅ CORRECTION: Sécurisation de la réponse comme pour RestaurantContext
      let orderData: Order[] = [];
      
      if (response && typeof response === 'object') {
        // Cas 1: Structure {data: []}
        if (Array.isArray(response.data)) {
          orderData = response.data;
        }
        // Cas 2: Response est un objet mais pas les structures attendues
        else if (Array.isArray(response)) {
          orderData = response;
        }
      }
      // Cas 3: Response est directement un array
      else if (Array.isArray(response)) {
        orderData = response;
      }
      
      console.log('✅ OrderContext: Processed data:', {
        orderCount: orderData.length,
        firstOrder: orderData[0]?.id || 'none'
      });
      
      dispatch({ type: 'SET_ORDERS', payload: orderData });
      
    } catch (error: any) {
      console.error('❌ OrderContext: Load error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement des commandes' });
      dispatch({ type: 'SET_ORDERS', payload: [] }); // ✅ Fallback sur array vide
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadOrder = async (id: string) => {
    try {
      console.log('🚀 OrderContext: Loading single order:', id);
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.getOrder(id);
      console.log('✅ OrderContext: Single order loaded:', order);
      
      dispatch({ type: 'SET_CURRENT_ORDER', payload: order });
    } catch (error: any) {
      console.error('❌ OrderContext: Load single error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement de la commande' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const createOrder = async (data: any) => {
    try {
      console.log('🚀 OrderContext: Creating order:', data);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.createOrder(data);
      console.log('✅ OrderContext: Order created:', order);
      
      dispatch({ type: 'CLEAR_CART' });
      
      await loadOrders({ limit: 10 });
      
      return order;
    } catch (error: any) {
      console.error('❌ OrderContext: Create error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la création de la commande' });
      throw error;
    }
  };

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      console.log('🚀 OrderContext: Updating order status:', id, status);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.updateOrderStatus(id, status);
      console.log('✅ OrderContext: Order status updated:', order);
      
      dispatch({ type: 'UPDATE_ORDER', payload: order });
    } catch (error: any) {
      console.error('❌ OrderContext: Update status error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la mise à jour du statut' });
      throw error;
    }
  };

  const cancelOrder = async (id: string, reason?: string) => {
    try {
      console.log('🚀 OrderContext: Cancelling order:', id, reason);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.cancelOrder(id, reason);
      console.log('✅ OrderContext: Order cancelled:', order);
      
      dispatch({ type: 'UPDATE_ORDER', payload: order });
    } catch (error: any) {
      console.error('❌ OrderContext: Cancel error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de l\'annulation' });
      throw error;
    }
  };

  const addToCart = (item: OrderItem) => {
    console.log('🛒 OrderContext: Adding to cart:', item);
    dispatch({ type: 'ADD_TO_CART', payload: item });
  };

  const removeFromCart = (productId: string) => {
    console.log('🗑️ OrderContext: Removing from cart:', productId);
    dispatch({ type: 'REMOVE_FROM_CART', payload: productId });
  };

  const updateCartItem = (productId: string, updates: Partial<OrderItem>) => {
    console.log('✏️ OrderContext: Updating cart item:', productId, updates);
    dispatch({ type: 'UPDATE_CART_ITEM', payload: { productId, updates } });
  };

  const clearCart = () => {
    console.log('🧹 OrderContext: Clearing cart');
    dispatch({ type: 'CLEAR_CART' });
  };

  const calculateTotal = async () => {
    try {
      console.log('🧮 OrderContext: Calculating total for', state.cart.length, 'items');
      
      if (state.cart.length > 0) {
        const summary = await orderService.calculateOrderTotal(state.cart);
        console.log('✅ OrderContext: Total calculated:', summary);
        dispatch({ type: 'SET_ORDER_SUMMARY', payload: summary });
      } else {
        console.log('🛒 OrderContext: Cart is empty, clearing summary');
        dispatch({ type: 'SET_ORDER_SUMMARY', payload: null });
      }
    } catch (error: any) {
      console.error('❌ OrderContext: Calculate total error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du calcul du total' });
      throw error;
    }
  };

  const refreshOrders = async () => {
    console.log('🔄 OrderContext: Refreshing orders...');
    await loadOrders({ limit: 10 });
  };

  useEffect(() => {
    console.log('🎬 OrderProvider mounted, loading initial data...');
    loadOrders({ limit: 5 }); // Charger les 5 dernières commandes par défaut
  }, []); // Chargement initial automatique

  useEffect(() => {
    if (state.cart.length > 0) {
      calculateTotal();
    } else {
      dispatch({ type: 'SET_ORDER_SUMMARY', payload: null });
    }
  }, [state.cart]);

  const value: OrderContextType = {
    ...state,
    loadOrders,
    loadOrder,
    createOrder,
    updateOrderStatus,
    cancelOrder,
    addToCart,
    removeFromCart,
    updateCartItem,
    clearCart,
    calculateTotal,
    refreshOrders,
  };

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
};

export const useOrder = (): OrderContextType => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder doit être utilisé dans un OrderProvider');
  }
  
  return {
    ...context,
    orders: Array.isArray(context.orders) ? context.orders : [],
  };
};