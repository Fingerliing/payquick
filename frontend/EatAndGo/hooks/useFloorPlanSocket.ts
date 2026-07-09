/**
 * useFloorPlanSocket — temps réel du plan de salle via Django Channels.
 *
 * Stratégie :
 *  - WebSocket ws(s)://api.eatquicker.fr/ws/floorplan/{restaurantId}/?token=JWT
 *  - À chaque événement reçu → refetch débouncé (500 ms) de GET /floor-plan/
 *  - Reconnexion avec backoff exponentiel (1s → 30s max)
 *  - Fallback : polling 30s tant que le socket n'est pas ouvert
 *  - Ping applicatif 30s pour maintenir la connexion à travers Caddy
 *
 * Le socket ne transporte AUCUNE donnée métier : c'est un signal de
 * rafraîchissement. La source de vérité reste l'API REST.
 *
 * Usage :
 *   const { isLive, lastEvent } = useFloorPlanSocket(restaurantId, refetchFloorPlan);
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL } from '@/constants/config';
import secureStorage from '@/utils/secureStorage';

// Même clé que AuthContext (STORAGE_KEYS.ACCESS_TOKEN)
const ACCESS_TOKEN_KEY = 'access_token';

// wss://api.eatquicker.fr en prod, ws://<ip-locale>:8000 en dev —
// dérivé de la même source que le client HTTP.
const WS_BASE = API_BASE_URL.replace(/^http/, 'ws');
const RECONNECT_MAX_DELAY_MS = 30_000;
const REFETCH_DEBOUNCE_MS = 500;
const FALLBACK_POLLING_MS = 30_000;
const PING_INTERVAL_MS = 30_000;

export interface FloorPlanSocketEvent {
  type: 'floorplan_update';
  event:
    | 'reservation_created'
    | 'reservation_confirmed'
    | 'reservation_cancelled'
    | 'reservation_seated'
    | 'reservation_no_show'
    | 'reservation_reassigned'
    | 'kitchen_fired'
    | 'table_occupied'
    | 'table_released'
    | 'table_extended'
    | 'layout_changed'
    | 'order_activity'
    | 'update';
  table_id: string | null;
  timestamp: string;
}

export function useFloorPlanSocket(
  restaurantId: string | undefined,
  onRefetch: () => void,
) {
  const [isLive, setIsLive] = useState(false);
  const [lastEvent, setLastEvent] = useState<FloorPlanSocketEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  const debouncedRefetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (isMounted.current) onRefetch();
    }, REFETCH_DEBOUNCE_MS);
  }, [onRefetch]);

  const stopPolling = () => {
    if (pollingTimer.current) {
      clearInterval(pollingTimer.current);
      pollingTimer.current = null;
    }
  };

  const startPolling = useCallback(() => {
    stopPolling();
    pollingTimer.current = setInterval(() => {
      if (isMounted.current) onRefetch();
    }, FALLBACK_POLLING_MS);
  }, [onRefetch]);

  const connect = useCallback(async () => {
    if (!restaurantId || !isMounted.current) return;

    const token = await secureStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;

    // Le middleware JWT côté Channels lit le token en query param
    const url = `${WS_BASE}/ws/floorplan/${restaurantId}/?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMounted.current) return;
      reconnectAttempt.current = 0;
      setIsLive(true);
      stopPolling();
      // Resynchronisation immédiate : des événements ont pu être manqués
      onRefetch();
      // Keep-alive applicatif (Caddy coupe les connexions idle)
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'floorplan_update') {
          setLastEvent(data as FloorPlanSocketEvent);
          debouncedRefetch();
        }
      } catch {
        // message non-JSON → ignorer
      }
    };

    ws.onerror = () => {
      // onclose suivra — la logique de reconnexion vit là-bas
    };

    ws.onclose = (e) => {
      setIsLive(false);
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
      if (!isMounted.current) return;

      // 4001 = token absent, 4003 = token invalide, 4403 = non-owner
      // → ne pas insister, rester en polling (le token sera peut-être
      // rafraîchi plus tard, un re-render relancera connect)
      if (e.code === 4001 || e.code === 4003 || e.code === 4403) {
        startPolling();
        return;
      }

      // Reconnexion avec backoff exponentiel + polling en attendant
      startPolling();
      const delay = Math.min(
        1000 * 2 ** reconnectAttempt.current,
        RECONNECT_MAX_DELAY_MS,
      );
      reconnectAttempt.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };
  }, [restaurantId, onRefetch, debouncedRefetch, startPolling]);

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (pingTimer.current) clearInterval(pingTimer.current);
      stopPolling();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { isLive, lastEvent };
}