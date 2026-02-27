// hooks/useSessionWebSocket.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionWebSocket, SessionWebSocketEvent } from '@/services/sessionWebSocket';

// =============================================================================
// REGISTRE SINGLETON — une seule instance WS par sessionId
// =============================================================================

interface WsEntry {
  ws: SessionWebSocket;
  refCount: number;
  isConnected: boolean;
  connectedListeners: Set<() => void>;
  disconnectedListeners: Set<() => void>;
}

const wsRegistry = new Map<string, WsEntry>();

function getOrCreateEntry(sessionId: string, token: string | null): WsEntry {
  if (wsRegistry.has(sessionId)) {
    return wsRegistry.get(sessionId)!;
  }

  const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  const wsProtocol = API_URL.startsWith('https') ? 'wss:' : 'ws:';
  const baseUrl = `${wsProtocol}//${API_URL.replace(/^https?:\/\//, '')}/ws/session/${sessionId}/`;
  const url = token ? `${baseUrl}?token=${token}` : baseUrl;

  const ws = new SessionWebSocket(sessionId, url);

  const entry: WsEntry = {
    ws,
    refCount: 0,
    isConnected: false,
    connectedListeners: new Set(),
    disconnectedListeners: new Set(),
  };

  ws.on('connected', () => {
    entry.isConnected = true;
    entry.connectedListeners.forEach(fn => fn());
  });

  ws.on('disconnected', () => {
    entry.isConnected = false;
    entry.disconnectedListeners.forEach(fn => fn());
  });

  wsRegistry.set(sessionId, entry);
  ws.connect();

  return entry;
}

function releaseEntry(sessionId: string) {
  const entry = wsRegistry.get(sessionId);
  if (!entry) return;

  entry.refCount -= 1;

  if (entry.refCount <= 0) {
    entry.ws.disconnect();
    entry.ws.removeAllListeners();
    wsRegistry.delete(sessionId);
    console.log(`🧹 WebSocket singleton détruit pour session ${sessionId}`);
  }
}

// =============================================================================
// HOOK
// =============================================================================

interface UseSessionWebSocketOptions {
  autoConnect?: boolean;
}

export const useSessionWebSocket = (
  sessionId: string | null,
  options: UseSessionWebSocketOptions = {}
) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const entryRef = useRef<WsEntry | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!sessionId) return;

    let entry: WsEntry;

    // Récupérer le token au montage pour l'URL WS
    AsyncStorage.getItem('access_token').then(token => {
      if (!mountedRef.current) return;

      entry = getOrCreateEntry(sessionId, token);
      entry.refCount += 1;
      entryRef.current = entry;

      // Synchroniser l'état local
      setIsConnected(entry.isConnected);

      const onConnected = () => {
        if (mountedRef.current) setIsConnected(true);
      };
      const onDisconnected = () => {
        if (mountedRef.current) setIsConnected(false);
      };
      const onError = (err: Error) => {
        if (mountedRef.current) setError(err);
      };

      entry.connectedListeners.add(onConnected);
      entry.disconnectedListeners.add(onDisconnected);
      entry.ws.on('error', onError);

      // Cleanup de ce consommateur
      return () => {
        entry.connectedListeners.delete(onConnected);
        entry.disconnectedListeners.delete(onDisconnected);
        entry.ws.off('error', onError);
        releaseEntry(sessionId);
        entryRef.current = null;
      };
    });

    return () => {
      mountedRef.current = false;
      if (entryRef.current) {
        releaseEntry(sessionId);
        entryRef.current = null;
      }
    };
  }, [sessionId]);

  const on = useCallback((event: SessionWebSocketEvent, handler: (...args: any[]) => void) => {
    const ws = entryRef.current?.ws;
    ws?.on(event, handler);
    return () => {
      ws?.off(event, handler);
    };
  }, []);

  const requestUpdate = useCallback(() => {
    entryRef.current?.ws.requestUpdate();
  }, []);

  const disconnect = useCallback(() => {
    if (sessionId) releaseEntry(sessionId);
  }, [sessionId]);

  return {
    isConnected,
    error,
    requestUpdate,
    disconnect,
    on,
    ws: entryRef.current?.ws ?? null,
  };
};