import { useState, useEffect } from 'react';
import { useSessionWebSocket } from './useSessionWebSocket';

export const useSessionEvents = (sessionId: string | null) => {
  const { on, isConnected } = useSessionWebSocket(sessionId);
  
  const [sessionData, setSessionData] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Écouter les événements de mise à jour de session
  useEffect(() => {
    if (!sessionId || !isConnected) return;

    // État complet de la session
    const unsubscribeState = on('session_state', (data) => {
      console.log('📊 Session state:', data);
      setSessionData(data.session);
      setParticipants(data.participants || []);
      setOrders(data.orders || []);
      setIsLocked(data.session?.status === 'locked');
      setIsCompleted(data.session?.status === 'completed');
    });

    // Mise à jour de session
    const unsubscribeUpdate = on('session_update', (data) => {
      console.log('🔄 Session update:', data);
      setSessionData((prev: any) => ({ ...prev, ...data }));
    });

    // Participant rejoint
    const unsubscribeJoined = on('participant_joined', (participant) => {
      console.log('👋 Participant joined:', participant);
      setParticipants((prev) => {
        // Éviter les doublons
        if (prev.find((p) => p.id === participant.id)) {
          return prev;
        }
        return [...prev, participant];
      });
    });

    // Participant quitté
    const unsubscribeLeft = on('participant_left', (participantId) => {
      console.log('👋 Participant left:', participantId);
      setParticipants((prev) => prev.filter((p) => p.id !== participantId));
    });

    // Participant approuvé
    const unsubscribeApproved = on('participant_approved', (participant) => {
      console.log('✅ Participant approved:', participant);
      setParticipants((prev) =>
        prev.map((p) => (p.id === participant.id ? participant : p))
      );
    });

    // Nouvelle commande
    const unsubscribeOrderCreated = on('order_created', (order) => {
      console.log('🛒 Order created:', order);
      setOrders((prev) => {
        // Éviter les doublons
        if (prev.find((o) => o.id === order.id)) {
          return prev;
        }
        return [...prev, order];
      });
    });

    // Commande mise à jour
    const unsubscribeOrderUpdated = on('order_updated', (order) => {
      console.log('🔄 Order updated:', order);
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, ...order } : o))
      );
    });

    // Session verrouillée
    const unsubscribeLocked = on('session_locked', (lockedBy) => {
      console.log('🔒 Session locked by:', lockedBy);
      setIsLocked(true);
      setSessionData((prev: any) => ({ ...prev, status: 'locked' }));
    });

    // Session déverrouillée
    const unsubscribeUnlocked = on('session_unlocked', () => {
      console.log('🔓 Session unlocked');
      setIsLocked(false);
      setSessionData((prev: any) => ({ ...prev, status: 'active' }));
    });

    // Session terminée
    const unsubscribeCompleted = on('session_completed', () => {
      console.log('✅ Session completed');
      setIsCompleted(true);
      setSessionData((prev: any) => ({ ...prev, status: 'completed' }));
    });

    // Nettoyage
    return () => {
      unsubscribeState();
      unsubscribeUpdate();
      unsubscribeJoined();
      unsubscribeLeft();
      unsubscribeApproved();
      unsubscribeOrderCreated();
      unsubscribeOrderUpdated();
      unsubscribeLocked();
      unsubscribeUnlocked();
      unsubscribeCompleted();
    };
  }, [sessionId, isConnected, on]);

  return {
    sessionData,
    participants,
    orders,
    isLocked,
    isCompleted,
    isConnected,
  };
};