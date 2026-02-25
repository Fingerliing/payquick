import { apiClient } from './api';

export interface SessionParticipant {
  id: string;
  display_name: string;
  status: 'pending' | 'active' | 'left' | 'removed';
  role: 'host' | 'member';
  is_host: boolean;
  joined_at: string;
  last_activity: string;
  orders_count: number;
  total_spent: number;
  notes?: string;
}

export interface CollaborativeSession {
  id: string;
  share_code: string;
  restaurant: number;
  restaurant_name: string;
  table: number | null;
  table_number: string;
  table_info?: {
    id: string;
    number: string;
    capacity: number;
  };
  session_type: 'collaborative' | 'individual';
  status: 'active' | 'locked' | 'payment' | 'completed' | 'cancelled';
  host_name: string;
  max_participants: number;
  require_approval: boolean;
  split_payment_enabled: boolean;
  participant_count: number;
  is_full: boolean;
  can_join: boolean;
  participants: SessionParticipant[];
  total_orders_count: number;
  total_amount: number;
  created_at: string;
  locked_at?: string;
  completed_at?: string;
  session_notes?: string;
}

export interface CreateSessionRequest {
  restaurant_id: number;
  table_number: string;
  table_id?: number;
  session_type?: 'collaborative' | 'individual';
  host_name?: string;
  max_participants?: number;
  require_approval?: boolean;
  split_payment_enabled?: boolean;
  session_notes?: string;
}

export interface JoinSessionRequest {
  share_code: string;
  guest_name?: string;
  guest_phone?: string;
  notes?: string;
}

export interface SessionSummary {
  session: CollaborativeSession;
  orders: any[];
  payment_breakdown: {
    [participant_id: string]: {
      name: string;
      total: number;
      orders_count: number;
      paid: number;
    };
  };
  can_finalize: boolean;
  stats: {
    total_participants: number;
    total_orders: number;
    total_amount: number;
    paid_orders: number;
    pending_orders: number;
  };
}

class CollaborativeSessionService {
  /**
   * Créer une nouvelle session collaborative
   */
  async createSession(data: CreateSessionRequest): Promise<CollaborativeSession> {
    const response = await apiClient.post(
      '/api/v1/collaborative-sessions/create_session/',
      data
    );
    return response;
  }

  /**
   * Rejoindre une session existante avec un code
   */
  async joinSession(data: JoinSessionRequest): Promise<{
    message: string;
    participant_id: string;
    requires_approval: boolean;
    session: CollaborativeSession;
  }> {
    const response = await apiClient.post(
      '/api/v1/collaborative-sessions/join_session/',
      data
    );
    return response;
  }

  /**
   * Obtenir une session par son code (sans la rejoindre)
   */
  async getSessionByCode(shareCode: string): Promise<CollaborativeSession> {
    const response = await apiClient.get(
      '/api/v1/collaborative-sessions/get_by_code/',
      {
        params: { share_code: shareCode }
      }
    );
    return response;
  }

  /**
   * Obtenir les détails d'une session
   */
  async getSession(sessionId: string): Promise<CollaborativeSession> {
    const response = await apiClient.get(
      `/api/v1/collaborative-sessions/${sessionId}/`
    );
    return response;
  }

  /**
   * Obtenir le résumé complet d'une session
   */
  async getSessionSummary(sessionId: string): Promise<SessionSummary> {
    const response = await apiClient.get(
      `/api/v1/collaborative-sessions/${sessionId}/summary/`
    );
    return response;
  }

  /**
   * Effectuer une action sur la session (lock, unlock, complete, cancel)
   */
  async sessionAction(
    sessionId: string,
    action: 'lock' | 'unlock' | 'complete' | 'cancel',
    reason?: string
  ): Promise<{ message: string; session: CollaborativeSession }> {
    const response = await apiClient.post(
      `/api/v1/collaborative-sessions/${sessionId}/session_action/`,
      { action, reason }
    );
    return response;
  }

  /**
   * Quitter une session
   */
  async leaveSession(
    sessionId: string,
    participantId?: string
  ): Promise<{ message: string }> {
    const data: any = {};
    if (participantId) {
      data.participant_id = participantId;
    }
    
    const response = await apiClient.post(
      `/api/v1/collaborative-sessions/${sessionId}/leave/`,
      data
    );
    return response;
  }

  /**
   * Actions sur un participant (approve, reject, remove, make_host)
   */
  async participantAction(
    participantId: string,
    action: 'approve' | 'reject' | 'remove' | 'make_host',
    reason?: string
  ) {
    const response = await apiClient.post(
      `/api/v1/collaborative-sessions/participants/${participantId}/participant_action/`,
      { action, reason }
    );
    return response;
  }

  /**
   * Lister les sessions de l'utilisateur
   */
  async listMySessions(): Promise<CollaborativeSession[]> {
    const response = await apiClient.get('/api/v1/collaborative-sessions/');
    return response.results || response;
  }

  /**
   * Vérifier si une session active existe pour une table
   */
  async checkActiveSession(
    restaurantId: number,
    tableNumber: string
  ): Promise<CollaborativeSession | null> {
    try {
      const sessions = await apiClient.get('/api/v1/collaborative-sessions/', {
        params: {
          restaurant: restaurantId,
          table_number: tableNumber,
          status: 'active'
        }
      });
      
      if (sessions.results && sessions.results.length > 0) {
        return sessions.results[0];
      }
      return null;
    } catch (error) {
      console.error('Error checking active session:', error);
      return null;
    }
  }
}

export const collaborativeSessionService = new CollaborativeSessionService();