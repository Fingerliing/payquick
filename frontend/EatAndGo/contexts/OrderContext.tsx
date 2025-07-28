import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Order, OrderItem, CreateOrderRequest } from '@/types/order';
import { SearchFilters } from '@/types/common';
import { orderService } from '@/services/orderService';

interface OrderState {
  orders: Order[];
  currentOrder: Order | null;
  isLoading: boolean;
  error: string | null;
  filters: SearchFilters;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  stats: {
    pending: number;
    preparing: number;
    ready: number;
    served: number;
  };
}

export interface OrderContextType extends OrderState {
  loadOrders: (filters?: SearchFilters, page?: number) => Promise<void>;
  loadOrder: (id: number) => Promise<void>;
  createOrder: (data: CreateOrderRequest) => Promise<Order>;
  updateOrder: (id: number, data: Partial<Order>) => Promise<void>;
  updateOrderStatus: (id: number, status: string) => Promise<void>;
  cancelOrder: (id: number) => Promise<void>;
  markAsPaid: (id: number, paymentMethod: string) => Promise<void>;
  searchOrders: (query: string, filters?: SearchFilters) => Promise<void>;
  setFilters: (filters: SearchFilters) => void;
  clearCurrentOrder: () => void;
  refreshOrders: () => Promise<void>;
  loadStats: () => Promise<void>;
}

type OrderAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ORDERS'; payload: Order[] }
  | { type: 'SET_CURRENT_ORDER'; payload: Order | null }
  | { type: 'ADD_ORDER'; payload: Order }
  | { type: 'UPDATE_ORDER'; payload: Order }
  | { type: 'REMOVE_ORDER'; payload: number }
  | { type: 'SET_FILTERS'; payload: SearchFilters }
  | { type: 'SET_PAGINATION'; payload: any }
  | { type: 'SET_STATS'; payload: any };

const initialState: OrderState = {
  orders: [],
  currentOrder: null,
  isLoading: false,
  error: null,
  filters: {},
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
  stats: {
    pending: 0,
    preparing: 0,
    ready: 0,
    served: 0
  }
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
      return { ...state, currentOrder: action.payload };
    case 'ADD_ORDER':
      return { 
        ...state, 
        orders: [action.payload, ...state.orders],
        error: null 
      };
    case 'UPDATE_ORDER':
      return {
        ...state,
        orders: state.orders.map(o => 
          o.id === action.payload.id ? action.payload : o
        ),
        currentOrder: state.currentOrder?.id === action.payload.id 
          ? action.payload 
          : state.currentOrder,
        error: null
      };
    case 'REMOVE_ORDER':
      return {
        ...state,
        orders: state.orders.filter(o => o.id !== action.payload),
        currentOrder: state.currentOrder?.id === action.payload 
          ? null 
          : state.currentOrder,
        error: null
      };
    case 'SET_FILTERS':
      return { ...state, filters: action.payload };
    case 'SET_PAGINATION':
      return { ...state, pagination: action.payload };
    case 'SET_STATS':
      return { ...state, stats: action.payload };
    default:
      return state;
  }
};

export const OrderContext = createContext<OrderContextType | undefined>(undefined);

export const OrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(orderReducer, initialState);

  useEffect(() => {
    console.log('🔍 OrderContext state change:', {
      orders: state.orders.length,
      isLoading: state.isLoading,
      error: state.error,
      stats: state.stats
    });
  }, [state.orders, state.isLoading, state.error, state.stats]);

  const loadOrders = async (filters?: SearchFilters, page = 1) => {
    try {
      console.log('🚀 OrderContext: Starting loadOrders...', { filters, page });
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const response = await orderService.getMyOrders({
        page,
        limit: state.pagination.limit,
        ...filters,
      });
      
      console.log('📥 OrderService response:', response);
      
      let orderData: Order[] = [];
      let paginationData = state.pagination;
      
      if (response && typeof response === 'object') {
        if (Array.isArray(response.data)) {
          orderData = response.data;
          paginationData = response.pagination || state.pagination;
        } else if (Array.isArray(response)) {
          orderData = response;
        }
      } else if (Array.isArray(response)) {
        orderData = response;
      }
      
      console.log('✅ OrderContext: Processed data:', {
        orderCount: orderData.length,
        pagination: paginationData
      });
      
      dispatch({ type: 'SET_ORDERS', payload: orderData });
      dispatch({ type: 'SET_PAGINATION', payload: paginationData });
      
      if (filters) {
        dispatch({ type: 'SET_FILTERS', payload: filters });
      }
      
    } catch (error: any) {
      console.error('❌ OrderContext: Load error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement des commandes' });
      dispatch({ type: 'SET_ORDERS', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadOrder = async (id: number) => {
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

  const createOrder = async (data: CreateOrderRequest) => {
    try {
      console.log('🚀 OrderContext: Creating order:', data);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.createOrder(data);
      console.log('✅ OrderContext: Order created:', order);
      
      dispatch({ type: 'ADD_ORDER', payload: order });
      return order;
    } catch (error: any) {
      console.error('❌ OrderContext: Create error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la création de la commande' });
      throw error;
    }
  };

  const updateOrder = async (id: number, data: Partial<Order>) => {
    try {
      console.log('🚀 OrderContext: Updating order:', id, data);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.updateOrder(id, data);
      console.log('✅ OrderContext: Order updated:', order);
      
      dispatch({ type: 'UPDATE_ORDER', payload: order });
    } catch (error: any) {
      console.error('❌ OrderContext: Update error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la mise à jour de la commande' });
      throw error;
    }
  };

  const updateOrderStatus = async (id: number, status: string) => {
    try {
      console.log('🚀 OrderContext: Updating order status:', id, status);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.updateOrderStatus(id, status);
      console.log('✅ OrderContext: Order status updated:', order);
      
      dispatch({ type: 'UPDATE_ORDER', payload: order });
    } catch (error: any) {
      console.error('❌ OrderContext: Status update error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la mise à jour du statut' });
      throw error;
    }
  };

  const cancelOrder = async (id: number) => {
    try {
      console.log('🚀 OrderContext: Cancelling order:', id);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      await orderService.cancelOrder(id);
      console.log('✅ OrderContext: Order cancelled:', id);
      
      // Recharger les commandes pour avoir le statut à jour
      await loadOrders(state.filters, state.pagination.page);
    } catch (error: any) {
      console.error('❌ OrderContext: Cancel error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de l\'annulation de la commande' });
      throw error;
    }
  };

  const markAsPaid = async (id: number, paymentMethod: string) => {
    try {
      console.log('🚀 OrderContext: Marking order as paid:', id, paymentMethod);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const order = await orderService.markAsPaid(id, paymentMethod);
      console.log('✅ OrderContext: Order marked as paid:', order);
      
      dispatch({ type: 'UPDATE_ORDER', payload: order });
    } catch (error: any) {
      console.error('❌ OrderContext: Mark paid error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du marquage comme payé' });
      throw error;
    }
  };

  const searchOrders = async (query: string, filters?: SearchFilters) => {
    try {
      console.log('🚀 OrderContext: Searching orders:', query, filters);
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const orders = await orderService.searchOrders(query, filters);
      console.log('✅ OrderContext: Search results:', orders.length);
      
      const orderData = Array.isArray(orders) ? orders : [];
      dispatch({ type: 'SET_ORDERS', payload: orderData });
    } catch (error: any) {
      console.error('❌ OrderContext: Search error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la recherche' });
      dispatch({ type: 'SET_ORDERS', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadStats = async () => {
    try {
      const stats = await orderService.getOrderStats();
      dispatch({ type: 'SET_STATS', payload: stats });
    } catch (error: any) {
      console.error('❌ OrderContext: Load stats error:', error);
    }
  };

  const setFilters = (filters: SearchFilters) => {
    dispatch({ type: 'SET_FILTERS', payload: filters });
  };

  const clearCurrentOrder = () => {
    dispatch({ type: 'SET_CURRENT_ORDER', payload: null });
  };

  const refreshOrders = async () => {
    console.log('🔄 OrderContext: Refreshing orders...');
    await loadOrders(state.filters, state.pagination.page);
    await loadStats();
  };

  useEffect(() => {
    console.log('🎬 OrderProvider mounted, loading initial data...');
    loadOrders();
    loadStats();
  }, []);

  const value: OrderContextType = {
    ...state,
    loadOrders,
    loadOrder,
    createOrder,
    updateOrder,
    updateOrderStatus,
    cancelOrder,
    markAsPaid,
    searchOrders,
    setFilters,
    clearCurrentOrder,
    refreshOrders,
    loadStats,
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