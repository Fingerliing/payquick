import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collaborativeSessionService,
  CollaborativeSession,
  SessionParticipant,
} from '@/services/collaborativeSessionService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UseCollaborativeSessionOptions {
  sessionId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface SessionState {
  session: CollaborativeSession | null;
  loading: boolean;
  error: Error | null;
  currentParticipant: SessionParticipant | null;
  isHost: boolean;
  canManage: boolean;
}

export const useCollaborativeSession = (options: UseCollaborativeSessionOptions = {}) => {
  const {
    sessionId,
    autoRefresh = true,
    refreshInterval = 10000, // 10 secondes
  } = options;

  const [state, setState] = useState<SessionState>({
    session: null,
    loading: false,
    error: null,
    currentParticipant: null,
    isHost: false,
    canManage: false,
  });

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Charger la session
  const loadSession = useCallback(async () => {
    if (!sessionId) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const session = await collaborativeSessionService.getSession(sessionId);
      
      if (!mountedRef.current) return;

      // Trouver le participant actuel
      const storedParticipantId = await AsyncStorage.getItem(
        `session_participant_${sessionId}`
      );
      
      const currentParticipant = session.participants.find(
        p => p.id === storedParticipantId && p.status === 'active'
      ) || null;

      const isHost = currentParticipant?.is_host || false;
      const canManage = isHost;

      setState({
        session,
        loading: false,
        error: null,
        currentParticipant,
        isHost,
        canManage,
      });
    } catch (error) {
      if (!mountedRef.current) return;
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
    }
  }, [sessionId]);

  // Rejoindre une session
  const joinSession = useCallback(async (
    shareCode: string,
    guestName?: string,
    guestPhone?: string
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await collaborativeSessionService.joinSession({
        share_code: shareCode,
        guest_name: guestName,
        guest_phone: guestPhone,
      });

      // Stocker l'ID du participant
      await AsyncStorage.setItem(
        `session_participant_${result.session.id}`,
        result.participant_id
      );

      if (!mountedRef.current) return result;

      const currentParticipant = result.session.participants.find(
        p => p.id === result.participant_id
      ) || null;

      setState({
        session: result.session,
        loading: false,
        error: null,
        currentParticipant,
        isHost: false,
        canManage: false,
      });

      return result;
    } catch (error) {
      if (!mountedRef.current) throw error;
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
      throw error;
    }
  }, []);

  // Créer une session
  const createSession = useCallback(async (data: any) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const session = await collaborativeSessionService.createSession(data);

      // L'hôte est automatiquement le premier participant
      const hostParticipant = session.participants.find(p => p.is_host) || null;

      if (hostParticipant) {
        await AsyncStorage.setItem(
          `session_participant_${session.id}`,
          hostParticipant.id
        );
      }

      if (!mountedRef.current) return session;

      setState({
        session,
        loading: false,
        error: null,
        currentParticipant: hostParticipant,
        isHost: true,
        canManage: true,
      });

      return session;
    } catch (error) {
      if (!mountedRef.current) throw error;
      
      setState(prev => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
      throw error;
    }
  }, []);

  // Quitter la session
  const leaveSession = useCallback(async () => {
    if (!sessionId || !state.currentParticipant) return;

    try {
      await collaborativeSessionService.leaveSession(
        sessionId,
        state.currentParticipant.id
      );

      // Nettoyer le stockage local
      await AsyncStorage.removeItem(`session_participant_${sessionId}`);

      if (!mountedRef.current) return;

      setState({
        session: null,
        loading: false,
        error: null,
        currentParticipant: null,
        isHost: false,
        canManage: false,
      });
    } catch (error) {
      throw error;
    }
  }, [sessionId, state.currentParticipant]);

  // Verrouiller la session
  const lockSession = useCallback(async () => {
    if (!sessionId || !state.canManage) {
      throw new Error('Vous n\'avez pas les permissions nécessaires');
    }

    try {
      await collaborativeSessionService.sessionAction(sessionId, 'lock');
      await loadSession();
    } catch (error) {
      throw error;
    }
  }, [sessionId, state.canManage, loadSession]);

  // Déverrouiller la session
  const unlockSession = useCallback(async () => {
    if (!sessionId || !state.canManage) {
      throw new Error('Vous n\'avez pas les permissions nécessaires');
    }

    try {
      await collaborativeSessionService.sessionAction(sessionId, 'unlock');
      await loadSession();
    } catch (error) {
      throw error;
    }
  }, [sessionId, state.canManage, loadSession]);

  // Terminer la session
  const completeSession = useCallback(async () => {
    if (!sessionId || !state.canManage) {
      throw new Error('Vous n\'avez pas les permissions nécessaires');
    }

    try {
      await collaborativeSessionService.sessionAction(sessionId, 'complete');
      await loadSession();
    } catch (error) {
      throw error;
    }
  }, [sessionId, state.canManage, loadSession]);

  // Approuver un participant
  const approveParticipant = useCallback(async (participantId: string) => {
    if (!state.canManage) {
      throw new Error('Vous n\'avez pas les permissions nécessaires');
    }

    try {
      await collaborativeSessionService.participantAction(participantId, 'approve');
      await loadSession();
    } catch (error) {
      throw error;
    }
  }, [state.canManage, loadSession]);

  // Rejeter un participant
  const rejectParticipant = useCallback(async (participantId: string) => {
    if (!state.canManage) {
      throw new Error('Vous n\'avez pas les permissions nécessaires');
    }

    try {
      await collaborativeSessionService.participantAction(participantId, 'reject');
      await loadSession();
    } catch (error) {
      throw error;
    }
  }, [state.canManage, loadSession]);

  // Retirer un participant
  const removeParticipant = useCallback(async (participantId: string) => {
    if (!state.canManage) {
      throw new Error('Vous n\'avez pas les permissions nécessaires');
    }

    try {
      await collaborativeSessionService.participantAction(participantId, 'remove');
      await loadSession();
    } catch (error) {
      throw error;
    }
  }, [state.canManage, loadSession]);

  // Nommer un nouvel hôte
  const makeHost = useCallback(async (participantId: string) => {
    if (!state.canManage) {
      throw new Error('Vous n\'avez pas les permissions nécessaires');
    }

    try {
      await collaborativeSessionService.participantAction(participantId, 'make_host');
      await loadSession();
    } catch (error) {
      throw error;
    }
  }, [state.canManage, loadSession]);

  // Rafraîchir manuellement
  const refresh = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  // Effet pour charger la session initiale
  useEffect(() => {
    if (sessionId) {
      loadSession();
    }
  }, [sessionId, loadSession]);

  // Effet pour le rafraîchissement automatique
  useEffect(() => {
    if (!sessionId || !autoRefresh) return;

    intervalRef.current = setInterval(() => {
      loadSession();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sessionId, autoRefresh, refreshInterval, loadSession]);

  // Nettoyage à la destruction
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    // État
    session: state.session,
    loading: state.loading,
    error: state.error,
    currentParticipant: state.currentParticipant,
    isHost: state.isHost,
    canManage: state.canManage,

    // Actions de session
    createSession,
    joinSession,
    leaveSession,
    lockSession,
    unlockSession,
    completeSession,
    refresh,

    // Actions de participant
    approveParticipant,
    rejectParticipant,
    removeParticipant,
    makeHost,

    // Helpers
    isInSession: !!state.session,
    isActive: state.session?.status === 'active',
    isLocked: state.session?.status === 'locked',
    isCompleted: state.session?.status === 'completed',
    participantCount: state.session?.participant_count || 0,
    totalAmount: state.session?.total_amount || 0,
    canJoin: state.session?.can_join || false,
  };
};

// Hook pour vérifier l'existence d'une session active sur une table
export const useActiveTableSession = (
  restaurantId?: number,
  tableNumber?: string
) => {
  const [activeSession, setActiveSession] = useState<CollaborativeSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkActiveSession = useCallback(async () => {
    if (!restaurantId || !tableNumber) {
      setChecked(true);
      return null;
    }

    setLoading(true);
    try {
      const session = await collaborativeSessionService.checkActiveSession(
        restaurantId,
        tableNumber
      );
      setActiveSession(session);
      setChecked(true);
      return session;
    } catch (error) {
      console.error('Error checking active session:', error);
      setActiveSession(null);
      setChecked(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [restaurantId, tableNumber]);

  useEffect(() => {
    checkActiveSession();
  }, [checkActiveSession]);

  return {
    activeSession,
    hasActiveSession: !!activeSession,
    loading,
    checked,
    refresh: checkActiveSession,
  };
};

// Hook pour gérer le stockage local de la session
export const useSessionStorage = () => {
  const getStoredSession = useCallback(async (sessionId: string) => {
    try {
      const participantId = await AsyncStorage.getItem(
        `session_participant_${sessionId}`
      );
      return participantId;
    } catch (error) {
      console.error('Error getting stored session:', error);
      return null;
    }
  }, []);

  const storeSession = useCallback(async (
    sessionId: string,
    participantId: string
  ) => {
    try {
      await AsyncStorage.setItem(
        `session_participant_${sessionId}`,
        participantId
      );
    } catch (error) {
      console.error('Error storing session:', error);
    }
  }, []);

  const clearSession = useCallback(async (sessionId: string) => {
    try {
      await AsyncStorage.removeItem(`session_participant_${sessionId}`);
    } catch (error) {
      console.error('Error clearing session:', error);
    }
  }, []);

  const getAllSessions = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const sessionKeys = keys.filter(k => k.startsWith('session_participant_'));
      
      const sessions = await Promise.all(
        sessionKeys.map(async key => {
          const sessionId = key.replace('session_participant_', '');
          const participantId = await AsyncStorage.getItem(key);
          return { sessionId, participantId };
        })
      );

      return sessions;
    } catch (error) {
      console.error('Error getting all sessions:', error);
      return [];
    }
  }, []);

  return {
    getStoredSession,
    storeSession,
    clearSession,
    getAllSessions,
  };
};