import { useState, useEffect, useCallback, useRef } from 'react';

interface DualWebSocketConfig {
  apiUrl?: string;
  orderIds?: number[];
  sessionId?: string;
  token?: string;
  autoConnect?: boolean;
}

interface WebSocketState {
  orders: {
    connected: boolean;
    ws: WebSocket | null;
  };
  session: {
    connected: boolean;
    ws: WebSocket | null;
  };
}

export const useDualWebSocket = (config: DualWebSocketConfig = {}) => {
  const {
    apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
    orderIds = [],
    sessionId,
    token,
    autoConnect = true,
  } = config;

  const [state, setState] = useState<WebSocketState>({
    orders: { connected: false, ws: null },
    session: { connected: false, ws: null },
  });

  const [orderUpdates, setOrderUpdates] = useState<any[]>([]);
  const [sessionUpdates, setSessionUpdates] = useState<any[]>([]);

  const wsOrderRef = useRef<WebSocket | null>(null);
  const wsSessionRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutOrder = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimeoutSession = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============================================================================
  // WebSocket pour les COMMANDES
  // ============================================================================

  const connectOrderWebSocket = useCallback(async () => {
    if (!orderIds.length || !token) return;

    try {
      // Construire l'URL WebSocket
      const wsProtocol = apiUrl.includes('https') ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${apiUrl.replace(/^https?:\/\//, '')}/ws/orders/?token=${token}&orders=${orderIds.join(',')}`;

      // Fermer l'ancienne connexion si elle existe
      if (wsOrderRef.current) {
        wsOrderRef.current.close();
      }

      const ws = new WebSocket(wsUrl);
      wsOrderRef.current = ws;

      ws.onopen = () => {
        console.log('📦 OrderWS: Connected');
        setState((prev) => ({
          ...prev,
          orders: { connected: true, ws },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              console.log('📦 OrderWS: Connection confirmed', data);
              break;

            case 'initial_status':
              console.log('📦 OrderWS: Initial status', data);
              break;

            case 'order_update':
              console.log('📦 OrderWS: Order update', data);
              setOrderUpdates((prev) => [...prev, data]);
              break;

            case 'pong':
              // Keep-alive response
              break;

            default:
              console.log('📦 OrderWS: Unknown message type', data.type);
          }
        } catch (error) {
          console.error('📦 OrderWS: Error parsing message', error);
        }
      };

      ws.onerror = (error) => {
        console.error('📦 OrderWS: Error', error);
      };

      ws.onclose = (event) => {
        console.log('📦 OrderWS: Disconnected', event.code);
        setState((prev) => ({
          ...prev,
          orders: { connected: false, ws: null },
        }));

        // Reconnexion automatique après 3 secondes
        if (!event.wasClean) {
          reconnectTimeoutOrder.current = setTimeout(() => {
            console.log('📦 OrderWS: Reconnecting...');
            connectOrderWebSocket();
          }, 3000);
        }
      };
    } catch (error) {
      console.error('📦 OrderWS: Connection error', error);
    }
  }, [apiUrl, orderIds, token]);

  const disconnectOrderWebSocket = useCallback(() => {
    if (reconnectTimeoutOrder.current) {
      clearTimeout(reconnectTimeoutOrder.current);
    }
    if (wsOrderRef.current) {
      wsOrderRef.current.close();
      wsOrderRef.current = null;
    }
  }, []);

  // ============================================================================
  // WebSocket pour les SESSIONS
  // ============================================================================

  const connectSessionWebSocket = useCallback(async () => {
    if (!sessionId) return;

    try {
      const wsProtocol = apiUrl.includes('https') ? 'wss:' : 'ws:';
      let wsUrl = `${wsProtocol}//${apiUrl.replace(/^https?:\/\//, '')}/ws/session/${sessionId}/`;
      
      // Ajouter le token si disponible
      if (token) {
        wsUrl += `?token=${token}`;
      }

      // Fermer l'ancienne connexion si elle existe
      if (wsSessionRef.current) {
        wsSessionRef.current.close();
      }

      const ws = new WebSocket(wsUrl);
      wsSessionRef.current = ws;

      ws.onopen = () => {
        console.log('🤝 SessionWS: Connected');
        setState((prev) => ({
          ...prev,
          session: { connected: true, ws },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              console.log('🤝 SessionWS: Connection confirmed', data);
              break;

            case 'session_state':
              console.log('🤝 SessionWS: Session state', data);
              setSessionUpdates((prev) => [...prev, data]);
              break;

            case 'session_update':
              console.log('🤝 SessionWS: Session update', data);
              setSessionUpdates((prev) => [...prev, data]);
              break;

            case 'participant_joined':
              console.log('🤝 SessionWS: Participant joined', data);
              setSessionUpdates((prev) => [...prev, data]);
              break;

            case 'participant_left':
              console.log('🤝 SessionWS: Participant left', data);
              setSessionUpdates((prev) => [...prev, data]);
              break;

            case 'order_created':
              console.log('🤝 SessionWS: Order created', data);
              setSessionUpdates((prev) => [...prev, data]);
              break;

            case 'order_updated':
              console.log('🤝 SessionWS: Order updated', data);
              setSessionUpdates((prev) => [...prev, data]);
              break;

            case 'session_locked':
            case 'session_unlocked':
            case 'session_completed':
              console.log('🤝 SessionWS: Session status change', data);
              setSessionUpdates((prev) => [...prev, data]);
              break;

            case 'pong':
              // Keep-alive response
              break;

            default:
              console.log('🤝 SessionWS: Unknown message type', data.type);
          }
        } catch (error) {
          console.error('🤝 SessionWS: Error parsing message', error);
        }
      };

      ws.onerror = (error) => {
        console.error('🤝 SessionWS: Error', error);
      };

      ws.onclose = (event) => {
        console.log('🤝 SessionWS: Disconnected', event.code);
        setState((prev) => ({
          ...prev,
          session: { connected: false, ws: null },
        }));

        // Reconnexion automatique après 3 secondes
        if (!event.wasClean) {
          reconnectTimeoutSession.current = setTimeout(() => {
            console.log('🤝 SessionWS: Reconnecting...');
            connectSessionWebSocket();
          }, 3000);
        }
      };
    } catch (error) {
      console.error('🤝 SessionWS: Connection error', error);
    }
  }, [apiUrl, sessionId, token]);

  const disconnectSessionWebSocket = useCallback(() => {
    if (reconnectTimeoutSession.current) {
      clearTimeout(reconnectTimeoutSession.current);
    }
    if (wsSessionRef.current) {
      wsSessionRef.current.close();
      wsSessionRef.current = null;
    }
  }, []);

  // ============================================================================
  // Connexion automatique
  // ============================================================================

  useEffect(() => {
    if (autoConnect) {
      if (orderIds.length && token) {
        connectOrderWebSocket();
      }
      if (sessionId) {
        connectSessionWebSocket();
      }
    }

    return () => {
      disconnectOrderWebSocket();
      disconnectSessionWebSocket();
    };
  }, [autoConnect, orderIds, sessionId, token]);

  // ============================================================================
  // Keep-alive (Ping)
  // ============================================================================

  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsOrderRef.current?.readyState === WebSocket.OPEN) {
        wsOrderRef.current.send(JSON.stringify({ type: 'ping' }));
      }
      if (wsSessionRef.current?.readyState === WebSocket.OPEN) {
        wsSessionRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Toutes les 30 secondes

    return () => clearInterval(pingInterval);
  }, []);

  // ============================================================================
  // API publique
  // ============================================================================

  return {
    // État
    isOrderConnected: state.orders.connected,
    isSessionConnected: state.session.connected,
    orderUpdates,
    sessionUpdates,

    // Contrôle des connexions
    connectOrders: connectOrderWebSocket,
    disconnectOrders: disconnectOrderWebSocket,
    connectSession: connectSessionWebSocket,
    disconnectSession: disconnectSessionWebSocket,

    // Envoyer des messages
    sendToOrders: (message: any) => {
      if (wsOrderRef.current?.readyState === WebSocket.OPEN) {
        wsOrderRef.current.send(JSON.stringify(message));
      }
    },
    sendToSession: (message: any) => {
      if (wsSessionRef.current?.readyState === WebSocket.OPEN) {
        wsSessionRef.current.send(JSON.stringify(message));
      }
    },

    // Nettoyer les mises à jour
    clearOrderUpdates: () => setOrderUpdates([]),
    clearSessionUpdates: () => setSessionUpdates([]),
  };
};

// ============================================================================
// EXEMPLE D'UTILISATION
// ============================================================================

/*
import { useDualWebSocket } from '@/hooks/useDualWebSocket';

function OrderTrackingScreen() {
  const { user } = useAuth();
  const { orderId, sessionId } = useLocalSearchParams();

  const {
    isOrderConnected,
    isSessionConnected,
    orderUpdates,
    sessionUpdates,
  } = useDualWebSocket({
    orderIds: [orderId],
    sessionId: sessionId || undefined,
    token: user?.token,
    autoConnect: true,
  });

  // Écouter les mises à jour de commande
  useEffect(() => {
    const latestUpdate = orderUpdates[orderUpdates.length - 1];
    if (latestUpdate?.type === 'order_update') {
      console.log('New order status:', latestUpdate.status);
      // Mettre à jour l'UI
    }
  }, [orderUpdates]);

  // Écouter les mises à jour de session
  useEffect(() => {
    const latestUpdate = sessionUpdates[sessionUpdates.length - 1];
    if (latestUpdate?.type === 'participant_joined') {
      alert(`${latestUpdate.participant.display_name} a rejoint !`);
    }
  }, [sessionUpdates]);

  return (
    <View>
      <Text>Order WS: {isOrderConnected ? '✅' : '❌'}</Text>
      <Text>Session WS: {isSessionConnected ? '✅' : '❌'}</Text>
    </View>
  );
}
*/