import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';

// =============================================================================
// TYPES (importés du service)
// =============================================================================

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

interface SessionContextType {
  session: CollaborativeSession | null;
  participantId: string | null;
  isHost: boolean;
  isLoading: boolean;
  
  // Actions
  createSession: (data: {
    restaurant_id: number;
    table_number: string;
    table_id?: number;
    session_type?: 'collaborative' | 'individual';
    host_name?: string;
    max_participants?: number;
    require_approval?: boolean;
    split_payment_enabled?: boolean;
    session_notes?: string;
  }) => Promise<CollaborativeSession>;
  
  joinSession: (data: {
    share_code: string;
    guest_name?: string;
    guest_phone?: string;
    notes?: string;
  }) => Promise<void>;
  
  leaveSession: () => Promise<void>;
  
  refreshSession: () => Promise<void>;
  
  clearSession: () => void;
  
  getSessionByCode: (code: string) => Promise<CollaborativeSession>;
}

// =============================================================================
// CONTEXTE
// =============================================================================

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// =============================================================================
// CONSTANTES
// =============================================================================

const SESSION_STORAGE_KEY = '@eatandgo_session';
const PARTICIPANT_ID_STORAGE_KEY = '@eatandgo_participant_id';

// =============================================================================
// PROVIDER
// =============================================================================

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<CollaborativeSession | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Calculer si l'utilisateur est l'hôte
  const isHost = session?.participants?.some(
    p => p.id === participantId && p.is_host
  ) ?? false;

  // =============================================================================
  // CHARGEMENT INITIAL
  // =============================================================================

  useEffect(() => {
    loadStoredSession();
  }, []);

  const loadStoredSession = async () => {
    try {
      const [storedSession, storedParticipantId] = await Promise.all([
        AsyncStorage.getItem(SESSION_STORAGE_KEY),
        AsyncStorage.getItem(PARTICIPANT_ID_STORAGE_KEY),
      ]);

      if (storedSession) {
        const parsedSession = JSON.parse(storedSession);
        setSession(parsedSession);
        
        if (storedParticipantId) {
          setParticipantId(storedParticipantId);
        }

        // Rafraîchir la session pour obtenir l'état le plus récent
        try {
          await refreshSessionById(parsedSession.id);
        } catch (error) {
          console.error('Erreur lors du rafraîchissement de la session:', error);
          // Si la session n'existe plus, la nettoyer
          await clearSession();
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la session:', error);
    }
  };

  // =============================================================================
  // SAUVEGARDER LA SESSION
  // =============================================================================

  const saveSession = useCallback(async (
    sessionData: CollaborativeSession,
    participantIdData?: string
  ) => {
    try {
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
      
      if (participantIdData) {
        await AsyncStorage.setItem(PARTICIPANT_ID_STORAGE_KEY, participantIdData);
        setParticipantId(participantIdData);
      }
      
      setSession(sessionData);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la session:', error);
    }
  }, []);

  // =============================================================================
  // CRÉER UNE SESSION
  // =============================================================================

  const createSession = useCallback(async (data: {
    restaurant_id: number;
    table_number: string;
    table_id?: number;
    session_type?: 'collaborative' | 'individual';
    host_name?: string;
    max_participants?: number;
    require_approval?: boolean;
    split_payment_enabled?: boolean;
    session_notes?: string;
  }) => {
    setIsLoading(true);
    try {
      const newSession = await collaborativeSessionService.createSession(data);

      // L'hôte est automatiquement le premier participant
      const hostParticipant = newSession.participants?.find(p => p.is_host);
      
      await saveSession(newSession, hostParticipant?.id);
      
      return newSession;
    } catch (error) {
      console.error('Erreur lors de la création de la session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  // =============================================================================
  // REJOINDRE UNE SESSION
  // =============================================================================

  const joinSession = useCallback(async (data: {
    share_code: string;
    guest_name?: string;
    guest_phone?: string;
    notes?: string;
  }) => {
    setIsLoading(true);
    try {
      const result = await collaborativeSessionService.joinSession(data);
      
      await saveSession(result.session, result.participant_id);
    } catch (error) {
      console.error('Erreur lors de la connexion à la session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [saveSession]);

  // =============================================================================
  // QUITTER LA SESSION
  // =============================================================================

  const leaveSession = useCallback(async () => {
    if (!session || !participantId) return;

    setIsLoading(true);
    try {
      await collaborativeSessionService.leaveSession(session.id, participantId);
      await clearSession();
    } catch (error) {
      console.error('Erreur lors de la déconnexion de la session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [session, participantId]);

  // =============================================================================
  // RAFRAÎCHIR LA SESSION
  // =============================================================================

  const refreshSessionById = async (sessionId: string) => {
    try {
      const updatedSession = await collaborativeSessionService.getSession(sessionId);
      await saveSession(updatedSession, participantId || undefined);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement de la session:', error);
      throw error;
    }
  };

  const refreshSession = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    try {
      await refreshSessionById(session.id);
    } finally {
      setIsLoading(false);
    }
  }, [session, participantId, saveSession]);

  // =============================================================================
  // NETTOYER LA SESSION
  // =============================================================================

  const clearSession = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([SESSION_STORAGE_KEY, PARTICIPANT_ID_STORAGE_KEY]);
      setSession(null);
      setParticipantId(null);
    } catch (error) {
      console.error('Erreur lors du nettoyage de la session:', error);
    }
  }, []);

  // =============================================================================
  // OBTENIR UNE SESSION PAR CODE
  // =============================================================================

  const getSessionByCode = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const sessionData = await collaborativeSessionService.getSessionByCode(code);
      return sessionData;
    } catch (error) {
      console.error('Erreur lors de la récupération de la session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // =============================================================================
  // VALEUR DU CONTEXTE
  // =============================================================================

  const value: SessionContextType = {
    session,
    participantId,
    isHost,
    isLoading,
    createSession,
    joinSession,
    leaveSession,
    refreshSession,
    clearSession,
    getSessionByCode,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

export const useSession = () => {
  const context = useContext(SessionContext);
  
  if (context === undefined) {
    throw new Error('useSession doit être utilisé à l\'intérieur d\'un SessionProvider');
  }
  
  return context;
};

// Export du contexte pour les tests
export { SessionContext };