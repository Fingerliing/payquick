// hooks/useOrderRealtime.ts - Version ultra-simple SANS boucle
import { useEffect, useRef, useState } from 'react';
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

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:8000';

/**
 * Hook temps réel ultra-simple pour éviter les boucles
 */
export function useOrderRealtime(
  orders: OrderList[],
  refreshFn: () => void,
  options: RealtimeOptions = {}
): RealtimeState {
  const { enabled = true, onOrderUpdate, onConnectionChange } = options;
  const { isAuthenticated } = useAuth();
  
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>();
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastOrderIdsRef = useRef<string>('');

  // Extraire les IDs des commandes actives
  const activeOrderIds = orders
    .filter(order => ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status))
    .map(order => order.id);
  
  const orderIdsString = activeOrderIds.sort().join(',');

  // ✅ EFFET PRINCIPAL - Se déclenche SEULEMENT si les IDs changent
  useEffect(() => {
    // ✅ PROTECTION ANTI-BOUCLE : vérifier si les IDs ont vraiment changé
    if (lastOrderIdsRef.current === orderIdsString) {
      console.log('🔄 Order IDs unchanged, skipping reconnection');
      return;
    }
    
    lastOrderIdsRef.current = orderIdsString;
    
    console.log(`🎯 Order IDs changed, active orders: ${activeOrderIds.length}`);
    
    // Nettoyer l'ancienne connexion
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    // Se connecter si on a des commandes actives et qu'on est authentifié
    if (activeOrderIds.length > 0 && enabled && isAuthenticated) {
      connectWebSocket();
    } else {
      setConnectionState('disconnected');
      onConnectionChange?.('disconnected');
    }
    
  }, [orderIdsString, enabled, isAuthenticated]); // ✅ Seulement ces dépendances

  // ✅ FONCTION DE CONNEXION SIMPLE
  const connectWebSocket = async () => {
    try {
      setConnectionState('connecting');
      onConnectionChange?.('connecting');
      console.log('🔗 Connecting to WebSocket...');
      
      const token = await AsyncStorage.getItem('access_token');
      if (!token) {
        console.warn('❌ No token found');
        setConnectionState('error');
        onConnectionChange?.('error');
        return;
      }
      
      const wsUrl = `${WS_URL}/ws/orders/?token=${token}&orders=${activeOrderIds.join(',')}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setConnectionState('connected');
        onConnectionChange?.('connected');
        reconnectAttemptsRef.current = 0;
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'order_update' || data.type === 'initial_status') {
            console.log('📦 Order update received:', data.order_id);
            
            const update: OrderUpdate = {
              order_id: data.order_id,
              status: data.status,
              waiting_time: data.waiting_time,
              timestamp: data.timestamp,
              data: data.data
            };
            
            // Vérifier si c'est une de nos commandes
            if (activeOrderIds.includes(update.order_id)) {
              console.log('✅ Update is for our order');
              setLastUpdateTime(new Date());
              onOrderUpdate?.(update);
              refreshFn();
            }
          }
        } catch (error) {
          console.error('❌ Failed to parse message:', error);
        }
      };
      
      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code);
        setConnectionState('disconnected');
        onConnectionChange?.('disconnected');
        
        // Reconnexion simple après 5 secondes si fermeture inattendue
        if (event.code !== 1000 && enabled && activeOrderIds.length > 0 && reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current++;
          console.log(`🔄 Reconnecting in 5s (attempt ${reconnectAttemptsRef.current}/3)`);
          setTimeout(() => {
            if (activeOrderIds.length > 0 && enabled) {
              connectWebSocket();
            }
          }, 5000);
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionState('error');
        onConnectionChange?.('error');
      };
      
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      setConnectionState('error');
      onConnectionChange?.('error');
    }
  };

  // ✅ NETTOYAGE AU DÉMONTAGE
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up on unmount');
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    activeOrdersCount: activeOrderIds.length,
    reconnectAttempts: reconnectAttemptsRef.current,
    lastUpdateTime,
  };
}