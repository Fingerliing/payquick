import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Order, OrderItem, OrderSummary } from '@/types/order';
import { orderService } from '@/services/orderService';

interface OrderState {
  orders: Order[];
  currentOrder: Order | null;
  cart: OrderItem[];
  isLoading: boolean;
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
}

type OrderAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ORDERS'; payload: Order[] }
  | { type: 'SET_CURRENT_ORDER'; payload: Order | null }
  | { type: 'UPDATE_ORDER'; payload: Order }
  | { type: 'ADD_TO_CART'; payload: OrderItem }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'UPDATE_CART_ITEM'; payload: { productId: string; updates: Partial<OrderItem> } }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_ORDER_SUMMARY'; payload: OrderSummary };

const initialState: OrderState = {
  orders: [],
  currentOrder: null,
  cart: [],
  isLoading: false,
  orderSummary: null,
};

const orderReducer = (state: OrderState, action: OrderAction): OrderState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ORDERS':
      return { ...state, orders: action.payload };
    case 'SET_CURRENT_ORDER':
      return { ...state, currentOrder: action.payload };
    case 'UPDATE_ORDER':
      return {
        ...state,
        orders: state.orders.map(o => o.id === action.payload.id ? action.payload : o),
        currentOrder: state.currentOrder?.id === action.payload.id ? action.payload : state.currentOrder,
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

  const loadOrders = async (params?: any) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await orderService.getOrders(params);
      dispatch({ type: 'SET_ORDERS', payload: response.data });
    } catch (error) {
      console.error('Erreur lors du chargement des commandes:', error);
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadOrder = async (id: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const order = await orderService.getOrder(id);
      dispatch({ type: 'SET_CURRENT_ORDER', payload: order });
    } catch (error) {
      console.error('Erreur lors du chargement de la commande:', error);
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const createOrder = async (data: any) => {
    try {
      const order = await orderService.createOrder(data);
      dispatch({ type: 'CLEAR_CART' });
      return order;
    } catch (error) {
      console.error('Erreur lors de la création de la commande:', error);
      throw error;
    }
  };

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      const order = await orderService.updateOrderStatus(id, status);
      dispatch({ type: 'UPDATE_ORDER', payload: order });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      throw error;
    }
  };

  const cancelOrder = async (id: string, reason?: string) => {
    try {
      const order = await orderService.cancelOrder(id, reason);
      dispatch({ type: 'UPDATE_ORDER', payload: order });
    } catch (error) {
      console.error('Erreur lors de l\'annulation:', error);
      throw error;
    }
  };

  const addToCart = (item: OrderItem) => {
    dispatch({ type: 'ADD_TO_CART', payload: item });
  };

  const removeFromCart = (productId: string) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: productId });
  };

  const updateCartItem = (productId: string, updates: Partial<OrderItem>) => {
    dispatch({ type: 'UPDATE_CART_ITEM', payload: { productId, updates } });
  };

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' });
  };

  const calculateTotal = async () => {
    try {
      if (state.cart.length > 0) {
        const summary = await orderService.calculateOrderTotal(state.cart);
        dispatch({ type: 'SET_ORDER_SUMMARY', payload: summary });
      }
    } catch (error) {
      console.error('Erreur lors du calcul du total:', error);
      throw error;
    }
  };

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
  };

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
};

export const useOrder = (): OrderContextType => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrder doit être utilisé dans un OrderProvider');
  }
  return context;
};