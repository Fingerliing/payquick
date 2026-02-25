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
  | 'session_completed'
  | 'session_archived'
  | 'table_released';

interface WebSocketMessage {
  type: string;
  event?: string;
  actor?: string;
  data?: any;
  participant?: any;
  participant_id?: string;
  order?: any;
  locked_by?: string;
  session_id?: string;
  message?: string;
  reason?: string;
  timestamp?: string;
  redirect_suggested?: boolean;
  will_archive_in?: number;
  table_id?: string;
  table_number?: string;
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
          this.emit('session_update', {
            event: message.event,
            actor: message.actor,
            data: message.data,
            session_id: message.session_id,
          });
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
          this.emit('session_completed', {
            will_archive_in: message.will_archive_in,
            message: message.message
          });
          break;

        //Handler pour session archivée
        case 'session_archived':
          console.log('🗄️ Session archived:', message.reason);
          this.emit('session_archived', {
            session_id: message.session_id,
            message: message.message,
            reason: message.reason,
            redirect_suggested: message.redirect_suggested,
            timestamp: message.timestamp
          });
          break;

        //Handler pour table libérée
        case 'table_released':
          console.log('🆓 Table released:', message.table_number);
          this.emit('table_released', {
            table_id: message.table_id,
            table_number: message.table_number,
            message: message.message,
            timestamp: message.timestamp
          });
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