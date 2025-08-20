'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

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
}

// Configuration depuis vos variables d'environnement existantes
const REALTIME_CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001',
  reconnectInterval: 5000,
  maxReconnectAttempts: 5,
};

/**
 * Hook principal pour les mises à jour temps réel des commandes
 * Compatible avec votre architecture Next.js existante
 */
export function useOrderRealtime(
  orderIds: number[], 
  options: RealtimeOptions = {}
): RealtimeState {
  const {
    enabled = true,
    reconnectInterval = REALTIME_CONFIG.reconnectInterval,
    maxReconnectAttempts = REALTIME_CONFIG.maxReconnectAttempts,
    onOrderUpdate,
    onConnectionChange,
  } = options;

  const [connectionState, setConnectionState] = useState<RealtimeState['connectionState']>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  // Fix TypeScript : utiliser le bon type pour le timer
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtrer les commandes actives (adaptez selon votre logique métier)
  const activeOrderIds = orderIds.filter(id => id > 0); // Exemple simple

  const updateConnectionState = useCallback((state: RealtimeState['connectionState']) => {
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
    
    // Vérifier si c'est une de nos commandes
    if (activeOrderIds.includes(update.order_id)) {
      onOrderUpdate?.(update);
    }
  }, [activeOrderIds, onOrderUpdate]);

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

  const connectWebSocket = useCallback(() => {
    if (!enabled || activeOrderIds.length === 0) {
      return;
    }

    cleanup();
    updateConnectionState('connecting');

    try {
      // Récupérer le token JWT depuis localStorage ou votre système d'auth
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        console.warn('No auth token found for WebSocket');
        connectServerSentEvents();
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
          console.log('🔄 WebSocket closed unexpectedly, trying SSE...');
          connectServerSentEvents();
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        updateConnectionState('error');
        connectServerSentEvents();
      };

    } catch (error) {
      console.error('❌ Failed to create WebSocket:', error);
      connectServerSentEvents();
    }
  }, [enabled, activeOrderIds, cleanup, updateConnectionState, handleOrderUpdate]);

  const connectServerSentEvents = useCallback(() => {
    if (!enabled || activeOrderIds.length === 0) {
      return;
    }

    cleanup();
    updateConnectionState('connecting');

    try {
      // Récupérer le token JWT
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) {
        console.warn('No auth token found for SSE');
        updateConnectionState('error');
        return;
      }

      // Fix EventSource : passer le token dans l'URL plutôt que dans les headers
      const sseUrl = `${REALTIME_CONFIG.apiUrl}/api/orders/status-stream/?orders=${activeOrderIds.join(',')}&token=${token}`;
      console.log('📡 Connecting to SSE...');

      // EventSource ne supporte pas les headers personnalisés
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
          } else if (data.type === 'connected') {
            console.log('✅ SSE connection confirmed');
          }
        } catch (error) {
          console.error('❌ Failed to parse SSE message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('❌ SSE error:', error);
        updateConnectionState('error');
        
        if (enabled) {
          attemptReconnect();
        }
      };

    } catch (error) {
      console.error('❌ Failed to create SSE:', error);
      updateConnectionState('error');
      
      if (enabled) {
        attemptReconnect();
      }
    }
  }, [enabled, activeOrderIds, cleanup, updateConnectionState, handleOrderUpdate, attemptReconnect]);

  // Démarrer la connexion
  useEffect(() => {
    if (activeOrderIds.length > 0 && enabled) {
      console.log(`🎯 Starting realtime for ${activeOrderIds.length} orders:`, activeOrderIds);
      connectWebSocket();
    } else {
      console.log('⏹️ No active orders, cleaning up');
      cleanup();
      updateConnectionState('disconnected');
    }

    return cleanup;
  }, [activeOrderIds.length, enabled, connectWebSocket, cleanup]);

  // Cleanup au démontage
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    activeOrdersCount: activeOrderIds.length,
    reconnectAttempts: reconnectAttemptsRef.current,
  };
}

/**
 * Service utilitaire pour les commandes
 * Compatible avec votre API existante
 */
export class OrderRealtimeService {
  private static instance: OrderRealtimeService;
  
  public static getInstance(): OrderRealtimeService {
    if (!OrderRealtimeService.instance) {
      OrderRealtimeService.instance = new OrderRealtimeService();
    }
    return OrderRealtimeService.instance;
  }

  /**
   * Tester les notifications (développement uniquement)
   */
  async testNotification(orderId: number, message: string = 'Test notification'): Promise<boolean> {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) return false;

      const response = await fetch(`${REALTIME_CONFIG.apiUrl}/api/realtime/test/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          order_id: orderId,
          message
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Test notification error:', error);
      return false;
    }
  }

  /**
   * Vérifier le statut du système temps réel
   */
  async getRealtimeStatus(): Promise<{websocket_enabled: boolean, sse_connections: number} | null> {
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      if (!token) return null;

      const response = await fetch(`${REALTIME_CONFIG.apiUrl}/api/realtime/status/`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Realtime status error:', error);
    }
    return null;
  }
}

// Utilitaires pour vos composants
export const getOrderStatusColor = (status: string): string => {
  const colors = {
    pending: '#f59e0b',
    confirmed: '#3b82f6',
    preparing: '#ef4444',
    ready: '#10b981',
    served: '#6b7280',
    cancelled: '#dc2626'
  };
  return colors[status as keyof typeof colors] || '#6b7280';
};

export const getOrderStatusLabel = (status: string): string => {
  const labels = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    preparing: 'En préparation', 
    ready: 'Prête',
    served: 'Servie',
    cancelled: 'Annulée'
  };
  return labels[status as keyof typeof labels] || status;
};

export const isActiveOrder = (status: string): boolean => {
  return ['pending', 'confirmed', 'preparing', 'ready'].includes(status);
};