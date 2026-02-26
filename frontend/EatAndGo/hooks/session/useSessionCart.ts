/**
 * Hook pour gérer le panier partagé en temps réel lors d'une session collaborative. 
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// ─── Types ────────────────────────────────────────────────────────────────

export interface SessionCartItem {
  id: string;
  participant: string;
  participant_name: string;
  menu_item: number;
  menu_item_name: string;
  menu_item_price: string;
  menu_item_image?: string;
  quantity: number;
  special_instructions: string;
  customizations: Record<string, any>;
  total_price: string;
  added_at: string;
  updated_at: string;
}

export interface SessionCartState {
  items: SessionCartItem[];
  total: number;
  items_count: number;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

export interface AddCartItemPayload {
  menu_item: number;
  quantity?: number;
  special_instructions?: string;
  customizations?: Record<string, any>;
}

interface UseSessionCartOptions {
  sessionId: string | null | undefined;
  participantId?: string | null;
  enabled?: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export const useSessionCart = ({
  sessionId,
  participantId,
  enabled = true,
}: UseSessionCartOptions) => {

  const [state, setState] = useState<SessionCartState>({
    items: [],
    total: 0,
    items_count: 0,
    isLoading: false,
    isConnected: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT = 5;

  // ── Helpers HTTP ────────────────────────────────────────────────────────

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const token = await AsyncStorage.getItem('access_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const sessionBase = `${API_URL}/api/sessions/${sessionId}`;

  // ── Charger le panier via REST (snapshot initial) ───────────────────────

  const fetchCart = useCallback(async () => {
    if (!sessionId) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${sessionBase}/cart/`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState(prev => ({
        ...prev,
        items: data.items,
        total: data.total,
        items_count: data.items_count,
        isLoading: false,
      }));
    } catch (err: any) {
      setState(prev => ({ ...prev, isLoading: false, error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders]);

  // ── Connexion WebSocket ─────────────────────────────────────────────────

  const connectWebSocket = useCallback(async () => {
    if (!sessionId || !enabled) return;

    const token = await AsyncStorage.getItem('access_token');
    const wsProtocol = API_URL.startsWith('https') ? 'wss:' : 'ws:';
    const baseHost = API_URL.replace(/^https?:\/\//, '');
    let wsUrl = `${wsProtocol}//${baseHost}/ws/session/${sessionId}/`;
    if (token) wsUrl += `?token=${token}`;

    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('🛒 SessionCart WS: Connected');
      reconnectAttemptsRef.current = 0;
      setState(prev => ({ ...prev, isConnected: true }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Snapshot initial du panier à la connexion
        if (data.type === 'cart_state') {
          setState(prev => ({
            ...prev,
            items: data.items,
            total: data.total,
            items_count: data.items_count,
          }));
        }

        // Mise à jour en temps réel
        if (data.type === 'cart_update') {
          setState(prev => ({
            ...prev,
            items: data.items,
            total: data.total,
            items_count: data.items_count,
          }));
        }
      } catch (e) {
        console.error('🛒 SessionCart WS: Parse error', e);
      }
    };

    ws.onerror = (e) => {
      console.error('🛒 SessionCart WS: Error', e);
      setState(prev => ({ ...prev, isConnected: false }));
    };

    ws.onclose = (e) => {
      console.log('🛒 SessionCart WS: Closed', e.code);
      setState(prev => ({ ...prev, isConnected: false }));

      if (!e.wasClean && enabled && reconnectAttemptsRef.current < MAX_RECONNECT) {
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      }
    };
  }, [sessionId, enabled]);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !enabled) return;
    fetchCart();
    connectWebSocket();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [sessionId, enabled]);

  // ── Actions REST ─────────────────────────────────────────────────────────

  const addItem = useCallback(async (payload: AddCartItemPayload): Promise<SessionCartItem | null> => {
    if (!sessionId) return null;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${sessionBase}/cart_add/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ quantity: 1, ...payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
      // Le WS recevra cart_update → état auto-actualisé
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }));
      return null;
    }
  }, [sessionId, sessionBase, getAuthHeaders]);

  const updateItem = useCallback(async (
    itemId: string,
    updates: { quantity?: number; special_instructions?: string; customizations?: Record<string, any> }
  ): Promise<void> => {
    if (!sessionId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${sessionBase}/cart_update/${itemId}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders]);

  const removeItem = useCallback(async (itemId: string): Promise<void> => {
    if (!sessionId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`${sessionBase}/cart_remove/${itemId}/`, {
        method: 'DELETE',
        headers,
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders]);

  const clearMyItems = useCallback(async (): Promise<void> => {
    if (!sessionId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`${sessionBase}/cart_clear/`, {
        method: 'DELETE',
        headers,
      });
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders]);

  // ── Items groupés par participant ─────────────────────────────────────────

  const itemsByParticipant = state.items.reduce<Record<string, SessionCartItem[]>>(
    (acc, item) => {
      const key = item.participant_name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {}
  );

  const myItems = participantId
    ? state.items.filter(item => item.participant === participantId)
    : [];

  return {
    ...state,
    addItem,
    updateItem,
    removeItem,
    clearMyItems,
    refresh: fetchCart,
    itemsByParticipant,
    myItems,
  };
};