import { EventEmitter } from 'events';

export type SessionWebSocketEvent = 
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'session_state'
  | 'session_update'
  | 'participant_joined'
  | 'participant_left'
  | 'participant_approved'
  | 'order_created'
  | 'order_updated'
  | 'session_locked'
  | 'session_unlocked'
  | 'session_completed';

interface WebSocketMessage {
  type: string;
  data?: any;
  participant?: any;
  participant_id?: string;
  order?: any;
  locked_by?: string;
}

export class SessionWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // ms
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isIntentionallyClosed = false;

  constructor(sessionId: string, baseUrl?: string) {
    super();
    this.sessionId = sessionId;
    
    // Construire l'URL WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultBaseUrl = `${wsProtocol}//${window.location.host}`;
    this.url = `${baseUrl || defaultBaseUrl}/ws/session/${sessionId}/`;
  }

  /**
   * Connecter au WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.isIntentionallyClosed = false;
    
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.emit('error', error);
    }
  }

  /**
   * Déconnecter du WebSocket
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.stopPing();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Envoyer un message
   */
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not open. Cannot send message.');
    }
  }

  /**
   * Demander une mise à jour de l'état de la session
   */
  requestUpdate(): void {
    this.send({ type: 'request_update' });
  }

  /**
   * Vérifier si le WebSocket est connecté
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // Gestionnaires d'événements privés

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.reconnectAttempts = 0;
    this.emit('connected');
    this.startPing();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'pong':
          // Réponse au ping, ne rien faire
          break;

        case 'session_state':
          this.emit('session_state', message.data);
          break;

        case 'session_update':
          this.emit('session_update', message.data);
          break;

        case 'participant_joined':
          this.emit('participant_joined', message.participant);
          break;

        case 'participant_left':
          this.emit('participant_left', message.participant_id);
          break;

        case 'participant_approved':
          this.emit('participant_approved', message.participant);
          break;

        case 'order_created':
          this.emit('order_created', message.order);
          break;

        case 'order_updated':
          this.emit('order_updated', message.order);
          break;

        case 'session_locked':
          this.emit('session_locked', message.locked_by);
          break;

        case 'session_unlocked':
          this.emit('session_unlocked');
          break;

        case 'session_completed':
          this.emit('session_completed');
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.emit('error', event);
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket closed:', event.code, event.reason);
    this.stopPing();
    this.emit('disconnected', event);

    // Tentative de reconnexion si ce n'était pas intentionnel
    if (!this.isIntentionallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, delay);
    }
  }

  private startPing(): void {
    this.stopPing();
    
    // Envoyer un ping toutes les 30 secondes
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({ type: 'ping' });
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Hook React pour utiliser le WebSocket de session
import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSessionWebSocketOptions {
  autoConnect?: boolean;
}

export const useSessionWebSocket = (
  sessionId: string | null,
  options: UseSessionWebSocketOptions = {}
) => {
  const { autoConnect = true } = options;
  
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<SessionWebSocket | null>(null);

  // Créer la connexion WebSocket
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const ws = new SessionWebSocket(sessionId);
    wsRef.current = ws;

    // Gestionnaires d'événements
    ws.on('connected', () => {
      setIsConnected(true);
      setError(null);
    });

    ws.on('disconnected', () => {
      setIsConnected(false);
    });

    ws.on('error', (err) => {
      setError(err);
    });

    // Connexion automatique
    if (autoConnect) {
      ws.connect();
    }

    // Nettoyage
    return () => {
      ws.disconnect();
      ws.removeAllListeners();
    };
  }, [sessionId, autoConnect]);

  // Méthodes utilitaires
  const connect = useCallback(() => {
    wsRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
  }, []);

  const requestUpdate = useCallback(() => {
    wsRef.current?.requestUpdate();
  }, []);

  const on = useCallback((event: SessionWebSocketEvent, handler: (...args: any[]) => void) => {
    wsRef.current?.on(event, handler);
    return () => {
      wsRef.current?.off(event, handler);
    };
  }, []);

  return {
    isConnected,
    error,
    connect,
    disconnect,
    requestUpdate,
    on,
    ws: wsRef.current,
  };
};

// Hook pour écouter les événements spécifiques de session
export const useSessionEvents = (sessionId: string | null) => {
  const { on, isConnected } = useSessionWebSocket(sessionId);
  
  const [sessionData, setSessionData] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    if (!isConnected) return;

    // État de la session
    const unsubState = on('session_state', (data) => {
      setSessionData(data);
      setParticipants(data.participants || []);
      setIsLocked(data.status === 'locked');
    });

    // Mise à jour de session
    const unsubUpdate = on('session_update', (data) => {
      setSessionData(data);
    });

    // Participant rejoint
    const unsubJoined = on('participant_joined', (participant) => {
      setParticipants(prev => [...prev, participant]);
    });

    // Participant parti
    const unsubLeft = on('participant_left', (participantId) => {
      setParticipants(prev => prev.filter(p => p.id !== participantId));
    });

    // Nouvelle commande
    const unsubOrderCreated = on('order_created', (order) => {
      setOrders(prev => [...prev, order]);
    });

    // Commande mise à jour
    const unsubOrderUpdated = on('order_updated', (order) => {
      setOrders(prev => prev.map(o => o.id === order.id ? order : o));
    });

    // Session verrouillée
    const unsubLocked = on('session_locked', () => {
      setIsLocked(true);
    });

    // Session déverrouillée
    const unsubUnlocked = on('session_unlocked', () => {
      setIsLocked(false);
    });

    return () => {
      unsubState();
      unsubUpdate();
      unsubJoined();
      unsubLeft();
      unsubOrderCreated();
      unsubOrderUpdated();
      unsubLocked();
      unsubUnlocked();
    };
  }, [on, isConnected]);

  return {
    sessionData,
    participants,
    orders,
    isLocked,
    isConnected,
  };
};