import { useEffect, useRef, useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OrderList } from '@/types/order';
import { useAuth } from '@/contexts/AuthContext';

export interface OrderUpdate {
  order_id: number;
  status?: string;
  waiting_time?: number;
  timestamp: string;
  data?: Record<string, any>;
}

export interface RealtimeOptions {
  enabled?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onOrderUpdate?: (update: OrderUpdate) => void;
  onConnectionChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export interface RealtimeState {
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  isConnected: boolean;
  activeOrdersCount: number;
  reconnectAttempts: number;
  lastUpdateTime?: Date;
}

// Configuration depuis vos variables d'environnement
const REALTIME_CONFIG = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
  wsUrl: process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:8001',
  reconnectInterval: 5000,
  maxReconnectAttempts: 5,
};

/**
 * Hook principal pour les mises à jour temps réel des commandes React Native
 */
export function useOrderRealtime(
  orders: OrderList[],
  refreshFn: () => void,
  options: RealtimeOptions = {}
): RealtimeState {
  const {
    enabled = true,
    reconnectInterval = REALTIME_CONFIG.reconnectInterval,
    maxReconnectAttempts = REALTIME_CONFIG.maxReconnectAttempts,
    onOrderUpdate,
    onConnectionChange,
  } = options;

  // ✅ CORRECTION : Récupérer le statut d'authentification depuis le contexte
  const { isAuthenticated, user } = useAuth();

  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>();
  const wsRef = useRef<WebSocket | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extraire les IDs des commandes actives
  const activeOrderIds = orders
    .filter(order => ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status))
    .map(order => order.id);

  const updateConnectionState = useCallback((state: typeof connectionState) => {
    setConnectionState(state);
    onConnectionChange?.(state);
  }, [onConnectionChange]);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const handleOrderUpdate = useCallback((update: OrderUpdate) => {
    console.log('📦 Order update received:', update);
    
    // Vérifier si c'est une de nos commandes actives
    if (activeOrderIds.includes(update.order_id)) {
      console.log('✅ Order update is for one of our active orders');
      setLastUpdateTime(new Date());
      onOrderUpdate?.(update);
      
      // Déclencher le refresh de la liste
      refreshFn();
    }
  }, [activeOrderIds, onOrderUpdate, refreshFn]);

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.warn('⚠️ Max reconnection attempts reached');
      updateConnectionState('error');
      return;
    }

    reconnectAttemptsRef.current++;
    console.log(`🔄 Attempting reconnection (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      connectWebSocket();
    }, reconnectInterval);
  }, [maxReconnectAttempts, reconnectInterval]);

  // ✅ CORRECTION : Fonction connectWebSocket qui récupère le token depuis AsyncStorage
  const connectWebSocket = useCallback(async () => {
    if (!enabled || activeOrderIds.length === 0 || !isAuthenticated) {
      if (!isAuthenticated) {
        console.warn('User not authenticated for WebSocket');
        updateConnectionState('error');
      }
      return;
    }

    cleanup();
    updateConnectionState('connecting');

    try {
      // Récupérer le token depuis AsyncStorage
      const token = await AsyncStorage.getItem('access_token');
      
      if (!token) {
        console.warn('No auth token found in AsyncStorage');
        updateConnectionState('error');
        return;
      }

      const wsUrl = `${REALTIME_CONFIG.wsUrl}/ws/orders/?token=${token}&orders=${activeOrderIds.join(',')}`;
      console.log('🔗 Connecting to WebSocket...');

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        updateConnectionState('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'order_update') {
            const update: OrderUpdate = {
              order_id: data.order_id,
              status: data.status,
              waiting_time: data.waiting_time,
              timestamp: data.timestamp,
              data: data.data
            };
            handleOrderUpdate(update);
          } else if (data.type === 'pong') {
            console.log('🏓 Pong received');
          }
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code);
        updateConnectionState('disconnected');
        
        if (event.code !== 1000 && enabled) {
          console.log('🔄 WebSocket closed unexpectedly, will retry...');
          attemptReconnect();
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        updateConnectionState('error');
        attemptReconnect();
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      updateConnectionState('error');
      attemptReconnect();
    }
  }, [enabled, activeOrderIds, isAuthenticated, cleanup, updateConnectionState, handleOrderUpdate, attemptReconnect]);

  // ✅ CORRECTION : Fallback vers SSE si WebSocket échoue
  const connectSSE = useCallback(async () => {
    if (!enabled || activeOrderIds.length === 0 || !isAuthenticated) {
      return;
    }

    cleanup();
    updateConnectionState('connecting');

    try {
      // Récupérer le token depuis AsyncStorage
      const token = await AsyncStorage.getItem('access_token');
      
      if (!token) {
        console.warn('No auth token found for SSE');
        updateConnectionState('error');
        return;
      }

      const sseUrl = `${REALTIME_CONFIG.apiUrl}/api/orders/status-stream/?token=${token}&orders=${activeOrderIds.join(',')}`;
      console.log('🔗 Fallback to SSE...');

      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('✅ SSE connected');
        updateConnectionState('connected');
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'initial_status' || data.type === 'order_update') {
            const update: OrderUpdate = {
              order_id: data.order_id,
              status: data.status,
              waiting_time: data.waiting_time,
              timestamp: data.timestamp,
              data: data.data
            };
            handleOrderUpdate(update);
          }
        } catch (error) {
          console.error('❌ Failed to parse SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('❌ SSE error:', error);
        updateConnectionState('error');
        attemptReconnect();
      };

    } catch (error) {
      console.error('❌ Failed to create SSE:', error);
      updateConnectionState('error');
      attemptReconnect();
    }
  }, [enabled, activeOrderIds, isAuthenticated, cleanup, updateConnectionState, handleOrderUpdate, attemptReconnect]);

  // ✅ CORRECTION : Fonction de connexion intelligente avec fallback
  const connect = useCallback(() => {
    // Essayer WebSocket d'abord, fallback vers SSE
    if (typeof WebSocket !== 'undefined') {
      connectWebSocket();
    } else {
      console.log('🔄 WebSocket not available, using SSE fallback');
      connectSSE();
    }
  }, [connectWebSocket, connectSSE]);

  // Démarrer la connexion quand il y a des commandes actives ET que l'utilisateur est authentifié
  useEffect(() => {
    if (activeOrderIds.length > 0 && enabled && isAuthenticated) {
      console.log(`🎯 Starting realtime for ${activeOrderIds.length} active orders:`, activeOrderIds);
      connect();
    } else {
      if (!isAuthenticated) {
        console.log('ℹ️ User not authenticated, waiting...');
      } else {
        console.log('ℹ️ No active orders, cleaning up connections');
      }
      cleanup();
      updateConnectionState('disconnected');
    }

    return cleanup;
  }, [activeOrderIds.length, enabled, isAuthenticated, connect, cleanup, updateConnectionState]);

  // Cleanup au démontage
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // ✅ NOUVEAU : Ping périodique pour maintenir la connexion
  useEffect(() => {
    if (connectionState === 'connected' && wsRef.current) {
      const pingInterval = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000); // Ping toutes les 30 secondes

      return () => clearInterval(pingInterval);
    }
  }, [connectionState]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    activeOrdersCount: activeOrderIds.length,
    reconnectAttempts: reconnectAttemptsRef.current,
    lastUpdateTime,
  };
}