// hooks/useSessionWebSocket.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionWebSocket, SessionWebSocketEvent } from '@/services/sessionWebSocket';

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
      console.log('✅ WebSocket connecté');
      setIsConnected(true);
      setError(null);
    });

    ws.on('disconnected', () => {
      console.log('🔌 WebSocket déconnecté');
      setIsConnected(false);
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket erreur:', err);
      setError(err);
    });

    // Connexion automatique
    if (autoConnect) {
      ws.connect();
    }

    // Nettoyage
    return () => {
      console.log('🧹 Nettoyage WebSocket');
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
    // Retourner une fonction de nettoyage
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