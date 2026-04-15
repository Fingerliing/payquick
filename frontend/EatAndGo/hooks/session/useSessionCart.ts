/**
 * Hook pour gérer le panier partagé en temps réel lors d'une session collaborative. 
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import secureStorage from '@/utils/secureStorage';
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
  /** Appelé quand l'hôte passe la session en mode paiement */
  onPaymentRequested?: () => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────

function computeSummary(items: SessionCartItem[]) {
  const total = items.reduce((acc, i) => acc + parseFloat(i.total_price || '0'), 0);
  const items_count = items.reduce((acc, i) => acc + i.quantity, 0);
  return { total: Math.round(total * 100) / 100, items_count };
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export const useSessionCart = ({
  sessionId,
  participantId,
  enabled = true,
  onPaymentRequested,
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
  // Ref stable pour éviter de recréer connectWebSocket à chaque render
  const onPaymentRequestedRef = useRef(onPaymentRequested);
  useEffect(() => { onPaymentRequestedRef.current = onPaymentRequested; }, [onPaymentRequested]);

  // ── Helpers HTTP ────────────────────────────────────────────────────────

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const token = await secureStorage.getItem('access_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // Identification guest : le backend résout le participant via ce header
    // quand aucun JWT n'est présent (chemin 2 dans _get_current_participant).
    if (participantId) (headers as Record<string, string>)['X-Participant-ID'] = participantId;
    return headers;
  }, [participantId]);

  const sessionBase = `${API_URL}/api/v1/collaborative-sessions/${sessionId}`;

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

    const token = await secureStorage.getItem('access_token');
    const wsProtocol = API_URL.startsWith('https') ? 'wss:' : 'ws:';
    const baseHost = API_URL.replace(/^https?:\/\//, '');
    let wsUrl = `${wsProtocol}//${baseHost}/ws/session/${sessionId}/`;
    if (token) wsUrl += `?token=${encodeURIComponent(token)}`;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setState(prev => ({ ...prev, isConnected: true }));
    };

    ws.onmessage = (event) => {
      console.log('🛒 WS message reçu:', event.data.substring(0, 150));
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

        // Paiement initié par l'hôte → rediriger les membres
        if (data.type === 'session_update' && data.event === 'payment') {
          onPaymentRequestedRef.current?.();
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
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sessionId, enabled]);

  // ── Actions REST ─────────────────────────────────────────────────────────

  const addItem = useCallback(async (payload: AddCartItemPayload): Promise<SessionCartItem | null> => {
    if (!sessionId) return null;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticItem: SessionCartItem = {
      id:                   optimisticId,
      participant:          participantId ?? '',
      participant_name:     'Vous',
      menu_item:            payload.menu_item,
      menu_item_name:       '',
      menu_item_price:      '0.00',
      quantity:             payload.quantity ?? 1,
      special_instructions: payload.special_instructions ?? '',
      customizations:       payload.customizations ?? {},
      total_price:          '0.00',
      added_at:             new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    };
  
    // Mise à jour optimiste via callback fonctionnel (pas de stale closure)
    setState(s => {
      const next = [...s.items, optimisticItem];
      return { ...s, items: next, ...computeSummary(next) };
    });
  
    try {
      const headers = await getAuthHeaders();
    
      const res = await fetch(`${sessionBase}/cart_add/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ quantity: 1, ...payload }),
      });
    
      const responseText = await res.text();
    
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${responseText}`);
      return JSON.parse(responseText);
    } catch (err: any) {
      console.error('🛒 cart_add → ERREUR:', err.message);
      // Rollback : retirer l'item optimiste
      setState(s => {
        const rolled = s.items.filter(i => i.id !== optimisticId);
        return { ...s, items: rolled, ...computeSummary(rolled), error: err.message };
      });
      return null;
    }
    // ✅ state.items retiré des dépendances : on utilise le callback fonctionnel
  }, [sessionId, sessionBase, getAuthHeaders, participantId]);

  const updateItem = useCallback(async (
    itemId: string,
    updates: { quantity?: number; special_instructions?: string; customizations?: Record<string, any> }
  ): Promise<void> => {
    if (!sessionId) return;

    // Snapshot pour rollback
    let prevItems: SessionCartItem[] = [];
    setState(s => {
      prevItems = s.items;
      const optimisticItems = s.items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      return { ...s, items: optimisticItems, ...computeSummary(optimisticItems) };
    });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${sessionBase}/cart_update/${itemId}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates),
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      setState(s => ({ ...s, items: prevItems, ...computeSummary(prevItems), error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders]);

  const removeItem = useCallback(async (itemId: string): Promise<void> => {
    if (!sessionId) return;

    let prevItems: SessionCartItem[] = [];
    setState(s => {
      prevItems = s.items;
      const optimisticItems = s.items.filter(i => i.id !== itemId);
      return { ...s, items: optimisticItems, ...computeSummary(optimisticItems) };
    });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${sessionBase}/cart_remove/${itemId}/`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      setState(s => ({ ...s, items: prevItems, ...computeSummary(prevItems), error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders]);

  const clearMyItems = useCallback(async (): Promise<void> => {
    if (!sessionId) return;

    let prevItems: SessionCartItem[] = [];
    setState(s => {
      prevItems = s.items;
      const optimisticItems = participantId
        ? s.items.filter(i => i.participant !== participantId)
        : [];
      return { ...s, items: optimisticItems, ...computeSummary(optimisticItems) };
    });

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${sessionBase}/cart_clear/`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      setState(s => ({ ...s, items: prevItems, ...computeSummary(prevItems), error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders, participantId]);

  // ── Items groupés par participant ─────────────────────────────────────────

  const itemsByParticipant = useMemo(() =>
    state.items.reduce<Record<string, SessionCartItem[]>>(
      (acc, item) => {
        const key = item.participant_name;
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      {}
    ),
    [state.items]
  );

  const myItems = useMemo(() =>
    participantId
      ? state.items.filter(item => item.participant === participantId)
      : [],
    [state.items, participantId]
  );

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