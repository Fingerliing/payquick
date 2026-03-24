// frontend/EatAndGo/hooks/useUnpaidOrderGuard.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface UnpaidOrder {
  id: number;
  order_number: string;
  total_amount: string;
  restaurant_name: string;
  payment_status: string;
}

export interface UnpaidOrderGuard {
  /** true si au moins une commande active est impayée */
  hasUnpaid: boolean;
  /** Nombre de commandes impayées */
  unpaidCount: number;
  /** Liste des commandes impayées (max 5) */
  unpaidOrders: UnpaidOrder[];
  /** Chargement en cours */
  isLoading: boolean;
  /** Forcer un re-check */
  refresh: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000; // 30s

export function useUnpaidOrderGuard(): UnpaidOrderGuard {
  const { user, isAuthenticated } = useAuth();
  const [hasUnpaid, setHasUnpaid] = useState(false);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [unpaidOrders, setUnpaidOrders] = useState<UnpaidOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    if (!isAuthenticated) {
      setHasUnpaid(false);
      setUnpaidCount(0);
      setUnpaidOrders([]);
      return;
    }

    try {
      setIsLoading(true);
      const data: any = await apiClient.get('/api/v1/orders/has-unpaid/');
      setHasUnpaid(!!data.has_unpaid);
      setUnpaidCount(data.unpaid_count ?? 0);
      setUnpaidOrders(data.unpaid_orders ?? []);
    } catch (err) {
      console.warn('[UnpaidOrderGuard] Erreur vérification:', err);
      // En cas d'erreur réseau, on ne bloque pas la navigation
      setHasUnpaid(false);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Check au focus de l'écran
  useFocusEffect(
    useCallback(() => {
      check();
    }, [check])
  );

  // Polling toutes les 30s
  useEffect(() => {
    if (!isAuthenticated) return;

    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, check]);

  return {
    hasUnpaid,
    unpaidCount,
    unpaidOrders,
    isLoading,
    refresh: check,
  };
}
