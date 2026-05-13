/**
 * Hook pour gérer le panier partagé en temps réel lors d'une session collaborative.
 *
 * Détection de session morte (mai 2026) :
 * Si le backend renvoie 404 avec "No CollaborativeTableSession matches" sur
 * un fetch/action, ou si le WebSocket se ferme avec un code suggérant une
 * session inexistante, le hook se met en mode "expired" :
 *   - arrête toute reconnexion WebSocket
 *   - figige l'état (items vides, isConnected: false, error: "Session expirée")
 *   - rejette toute action REST ultérieure (addItem/updateItem/...) en silence
 *   - appelle `onSessionGone` UNE seule fois pour que l'appelant purge le
 *     sessionId stocké côté UI (sinon le hook serait re-instancié avec le
 *     même id mort au prochain render).
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
  /** True si la session n'existe plus côté backend (404). Sticky. */
  isExpired: boolean;
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
  /**
   * Appelé UNE SEULE FOIS quand le hook détecte que la session n'existe plus
   * côté backend (404 sur fetch/action). L'appelant doit utiliser ce signal
   * pour purger le sessionId stocké côté UI/contexte, sinon le hook reste
   * en mode dormant indéfiniment.
   */
  onSessionGone?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function computeSummary(items: SessionCartItem[]) {
  const total = items.reduce((acc, i) => acc + parseFloat(i.total_price || '0'), 0);
  const items_count = items.reduce((acc, i) => acc + i.quantity, 0);
  return { total: Math.round(total * 100) / 100, items_count };
}

/**
 * Détecte si une réponse HTTP (statut + corps) correspond à une session morte
 * (la session n'existe plus côté backend : 404 avec message DRF de DoesNotExist).
 */
function isSessionGoneResponse(status: number, body: string): boolean {
  if (status !== 404) return false;
  // Le backend renvoie typiquement :
  //   {"detail":"No CollaborativeTableSession matches the given query."}
  // ou plus largement n'importe quel DoesNotExist sur cette ressource.
  if (!body) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes('collaborativetablesession') ||
    lower.includes('session') && lower.includes('matches')
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export const useSessionCart = ({
  sessionId,
  participantId,
  enabled = true,
  onPaymentRequested,
  onSessionGone,
}: UseSessionCartOptions) => {

  const [state, setState] = useState<SessionCartState>({
    items: [],
    total: 0,
    items_count: 0,
    isLoading: false,
    isConnected: false,
    error: null,
    isExpired: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT = 5;

  // Drapeau "session morte" : sticky pour la durée de vie du hook avec cet ID
  const isExpiredRef = useRef(false);
  const sessionGoneNotifiedRef = useRef(false);

  // Refs stables pour callbacks (évite de recréer connectWebSocket à chaque render)
  const onPaymentRequestedRef = useRef(onPaymentRequested);
  useEffect(() => { onPaymentRequestedRef.current = onPaymentRequested; }, [onPaymentRequested]);
  const onSessionGoneRef = useRef(onSessionGone);
  useEffect(() => { onSessionGoneRef.current = onSessionGone; }, [onSessionGone]);

  /** Marque la session comme morte et notifie l'appelant (idempotent). */
  const markSessionGone = useCallback((reason: string) => {
    if (isExpiredRef.current) return;
    isExpiredRef.current = true;

    // Couper proprement le WebSocket et stopper les reconnexions
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      items: [],
      total: 0,
      items_count: 0,
      isLoading: false,
      isConnected: false,
      isExpired: true,
      error: 'Session expirée',
    }));

    if (!sessionGoneNotifiedRef.current) {
      sessionGoneNotifiedRef.current = true;
      console.warn(`🛒 SessionCart: session ${sessionId} marquée comme morte (${reason})`);
      try { onSessionGoneRef.current?.(); } catch (e) { console.error(e); }
    }
  }, [sessionId]);

  // Réinitialiser les drapeaux quand sessionId change (nouvelle session = nouveau hook)
  useEffect(() => {
    isExpiredRef.current = false;
    sessionGoneNotifiedRef.current = false;
    reconnectAttemptsRef.current = 0;
    setState({
      items: [],
      total: 0,
      items_count: 0,
      isLoading: false,
      isConnected: false,
      error: null,
      isExpired: false,
    });
  }, [sessionId]);

  // ── Helpers HTTP ────────────────────────────────────────────────────────

  const getAuthHeaders = useCallback(async (): Promise<HeadersInit> => {
    const token = await secureStorage.getItem('access_token');
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (participantId) (headers as Record<string, string>)['X-Participant-ID'] = participantId;
    return headers;
  }, [participantId]);

  const sessionBase = `${API_URL}/api/v1/collaborative-sessions/${sessionId}`;

  // ── Charger le panier via REST (snapshot initial) ───────────────────────

  const fetchCart = useCallback(async () => {
    if (!sessionId || isExpiredRef.current) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${sessionBase}/cart/`, { headers });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (isSessionGoneResponse(res.status, body)) {
          markSessionGone(`fetchCart 404: ${body.slice(0, 80)}`);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }

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
  }, [sessionId, sessionBase, getAuthHeaders, markSessionGone]);

  // ── Connexion WebSocket ─────────────────────────────────────────────────

  const connectWebSocket = useCallback(async () => {
    if (!sessionId || !enabled || isExpiredRef.current) return;

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
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'cart_state' || data.type === 'cart_update') {
          setState(prev => ({
            ...prev,
            items: data.items,
            total: data.total,
            items_count: data.items_count,
          }));
        }

        if (data.type === 'session_update' && data.event === 'payment') {
          onPaymentRequestedRef.current?.();
        }

        // Le backend peut envoyer un signal explicite de session terminée
        if (data.type === 'session_gone' || data.type === 'session_closed') {
          markSessionGone(`WS message ${data.type}`);
        }
      } catch (e) {
        console.error('🛒 SessionCart WS: Parse error', e);
      }
    };

    ws.onerror = (e) => {
      // Pas de log spammé en cas de session morte
      if (isExpiredRef.current) return;
      console.error('🛒 SessionCart WS: Error', e);
      setState(prev => ({ ...prev, isConnected: false }));
    };

    ws.onclose = (e) => {
      setState(prev => ({ ...prev, isConnected: false }));

      // Codes de close personnalisés indiquant que la session n'existe plus
      // (4404 = "session not found" si le backend l'implémente).
      if (e.code === 4404 || e.code === 4001 || e.code === 4003) {
        markSessionGone(`WS close code ${e.code}`);
        return;
      }

      if (isExpiredRef.current) return;

      // Si l'API a déjà répondu 404 entre-temps, ne pas relancer
      if (!e.wasClean && enabled && reconnectAttemptsRef.current < MAX_RECONNECT) {
        const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      } else if (reconnectAttemptsRef.current >= MAX_RECONNECT) {
        // Après MAX_RECONNECT échecs consécutifs sans aucun message reçu,
        // on considère la session comme morte par sécurité (le backend peut
        // rejeter au handshake sans send de close code propre).
        markSessionGone('max reconnect attempts reached');
      }
    };
  }, [sessionId, enabled, markSessionGone]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, enabled]);

  // ── Actions REST ─────────────────────────────────────────────────────────

  const addItem = useCallback(async (payload: AddCartItemPayload): Promise<SessionCartItem | null> => {
    if (!sessionId || isExpiredRef.current) return null;

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

      if (!res.ok) {
        if (isSessionGoneResponse(res.status, responseText)) {
          markSessionGone(`cart_add 404: ${responseText.slice(0, 80)}`);
          return null;
        }
        throw new Error(`HTTP ${res.status}: ${responseText}`);
      }
      return JSON.parse(responseText);
    } catch (err: any) {
      console.error('🛒 cart_add → ERREUR:', err.message);
      setState(s => {
        const rolled = s.items.filter(i => i.id !== optimisticId);
        return { ...s, items: rolled, ...computeSummary(rolled), error: err.message };
      });
      return null;
    }
  }, [sessionId, sessionBase, getAuthHeaders, participantId, markSessionGone]);

  const updateItem = useCallback(async (
    itemId: string,
    updates: { quantity?: number; special_instructions?: string; customizations?: Record<string, any> }
  ): Promise<void> => {
    if (!sessionId || isExpiredRef.current) return;

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
      if (!res.ok && res.status !== 204) {
        const body = await res.text().catch(() => '');
        if (isSessionGoneResponse(res.status, body)) {
          markSessionGone(`cart_update 404: ${body.slice(0, 80)}`);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setState(s => ({ ...s, items: prevItems, ...computeSummary(prevItems), error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders, markSessionGone]);

  const removeItem = useCallback(async (itemId: string): Promise<void> => {
    if (!sessionId || isExpiredRef.current) return;

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
      if (!res.ok && res.status !== 204) {
        const body = await res.text().catch(() => '');
        if (isSessionGoneResponse(res.status, body)) {
          markSessionGone(`cart_remove 404: ${body.slice(0, 80)}`);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setState(s => ({ ...s, items: prevItems, ...computeSummary(prevItems), error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders, markSessionGone]);

  const clearMyItems = useCallback(async (): Promise<void> => {
    if (!sessionId || isExpiredRef.current) return;

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
      if (!res.ok && res.status !== 204) {
        const body = await res.text().catch(() => '');
        if (isSessionGoneResponse(res.status, body)) {
          markSessionGone(`cart_clear 404: ${body.slice(0, 80)}`);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setState(s => ({ ...s, items: prevItems, ...computeSummary(prevItems), error: err.message }));
    }
  }, [sessionId, sessionBase, getAuthHeaders, participantId, markSessionGone]);

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