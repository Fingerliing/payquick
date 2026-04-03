/**
 * Hook pour gérer la fin et l'archivage des sessions collaboratives.
 *
 * Retourne `expiredAlert` + `dismissExpiredAlert` au lieu d'afficher
 * un Alert.alert natif. Le composant appelant est responsable de rendre
 * l'AlertWithAction et de déclencher la redirection.
 *
 * `session_completed` ET `session_archived` déclenchent tous les deux
 * l'alerte (garde interne pour éviter le double-déclenchement).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionWebSocket } from './useSessionWebSocket';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionExpiredAlert {
  title: string;
  message: string;
}

export interface UseSessionArchivingOptions {
  sessionId: string | null;
  onSessionArchived?: (data: SessionArchivedData) => void;
  onTableReleased?: (data: TableReleasedData) => void;
  onSessionCompleted?: (data: SessionCompletedData) => void;
}

export interface SessionCompletedData {
  will_archive_in?: number;
  message?: string;
  timestamp?: string;
}

export interface SessionArchivedData {
  session_id: string;
  message?: string;
  reason?: string;
  redirect_suggested?: boolean;
  timestamp?: string;
}

export interface TableReleasedData {
  table_id: string;
  table_number: string;
  message?: string;
  timestamp?: string;
}

export interface UseSessionArchivingReturn {
  /** Non-null quand la session vient de se terminer ou d'être archivée. */
  expiredAlert: SessionExpiredAlert | null;
  /** À appeler après acquittement de l'alerte (avant redirection). */
  dismissExpiredAlert: () => void;
}

// ============================================================================
// HOOK PRINCIPAL: useSessionArchiving
// ============================================================================

export const useSessionArchiving = ({
  sessionId,
  onSessionArchived,
  onTableReleased,
  onSessionCompleted,
}: UseSessionArchivingOptions): UseSessionArchivingReturn => {
  const { on } = useSessionWebSocket(sessionId);
  const [expiredAlert, setExpiredAlert] = useState<SessionExpiredAlert | null>(null);
  const hasShownAlert = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    hasShownAlert.current = false;

    const unsubCompleted = on('session_completed', (data: SessionCompletedData) => {
      if (hasShownAlert.current) return;
      hasShownAlert.current = true;
      onSessionCompleted?.(data);
      setExpiredAlert({
        title: '⏰ Session terminée',
        message: data?.message ?? 'La session a été clôturée par le restaurant.',
      });
    });

    const unsubArchived = on('session_archived', (data: SessionArchivedData) => {
      if (hasShownAlert.current) return;
      hasShownAlert.current = true;
      onSessionArchived?.(data);
      setExpiredAlert({
        title: '⏰ Session expirée',
        message: data?.message ?? "Cette session n'est plus accessible.",
      });
    });

    const unsubTableReleased = on('table_released', (data: TableReleasedData) => {
      onTableReleased?.(data);
      console.log(`🆓 Table ${data?.table_number} libérée`);
    });

    return () => {
      unsubCompleted();
      unsubArchived();
      unsubTableReleased();
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissExpiredAlert = () => {
    setExpiredAlert(null);
    hasShownAlert.current = false;
  };

  return { expiredAlert, dismissExpiredAlert };
};

// ============================================================================
// HOOK: useSessionArchiveCountdown
// ============================================================================

const ARCHIVE_DELAY_MS = 5 * 60 * 1000;

/**
 * Surveille le compte à rebours avant archivage d'une session completed.
 *
 * Deux sources :
 *   1. API au montage — si la session est déjà completed
 *   2. WebSocket — events session_completed / session_archived en temps réel
 */
export const useSessionArchiveCountdown = (sessionId: string | null) => {
  const [timeUntilArchive, setTimeUntilArchive] = useState<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const { on } = useSessionWebSocket(sessionId);
  const countdownInterval = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);

  const startCountdown = (remainingMs: number) => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
    }
    setTimeUntilArchive(remainingMs);
    setIsCompleted(true);
    if (remainingMs <= 0) return;

    countdownInterval.current = setInterval(() => {
      setTimeUntilArchive((prev) => {
        if (prev === null || prev <= 1000) {
          if (countdownInterval.current) clearInterval(countdownInterval.current);
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
  };

  // ── 1. Init depuis l'API ────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    initializedRef.current = false;
    let cancelled = false;

    const initFromApi = async () => {
      try {
        const session = await collaborativeSessionService.getSession(sessionId);
        if (cancelled || initializedRef.current) return;

        if (session.status === 'completed' && session.completed_at) {
          initializedRef.current = true;
          const completedAt = new Date(session.completed_at).getTime();
          const remaining = Math.max(0, completedAt + ARCHIVE_DELAY_MS - Date.now());
          startCountdown(remaining);
        }
      } catch (error: any) {
        if (cancelled) return;
        const status = error?.status ?? error?.response?.status;
        if (status === 404) {
          initializedRef.current = true;
          setIsArchived(true);
          setTimeUntilArchive(0);
        }
      }
    };

    initFromApi();
    return () => { cancelled = true; };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. WebSocket ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const unsubCompleted = on('session_completed', (data: SessionCompletedData) => {
      initializedRef.current = true;
      startCountdown(data?.will_archive_in || ARCHIVE_DELAY_MS);
    });

    const unsubArchived = on('session_archived', () => {
      initializedRef.current = true;
      setIsArchived(true);
      setTimeUntilArchive(0);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    });

    return () => {
      unsubCompleted();
      unsubArchived();
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, [sessionId, on]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, []);

  return {
    timeUntilArchive,
    isCompleted,
    isArchived,
    formattedTime: timeUntilArchive !== null && timeUntilArchive > 0
      ? formatMilliseconds(timeUntilArchive)
      : null,
  };
};

// ============================================================================
// HOOK: useInactivityWarning
// ============================================================================

/**
 * Seuils d'inactivité (doivent correspondre au backend).
 * `auto_complete_inactive_sessions` complète les sessions
 * dont updated_at > 15 min (Celery Beat, toutes les 5 min).
 */
const INACTIVITY_AUTO_COMPLETE_MS = 15 * 60 * 1000;
const INACTIVITY_WARNING_BEFORE_MS = 5 * 60 * 1000;

/**
 * Avertit l'utilisateur qu'une session active va être auto-complétée
 * pour inactivité.
 *
 * Interroge l'API pour obtenir `updated_at`, puis calcule le temps restant.
 * Rafraîchit toutes les 60 s pour rester synchronisé avec le serveur.
 *
 * ⚠️  Nécessite `updated_at` dans CollaborativeSessionSerializer.
 *     Fallback sur `created_at` si absent.
 */
export const useInactivityWarning = (sessionId: string | null) => {
  const [showWarning, setShowWarning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const lastUpdatedAtRef = useRef<number | null>(null);
  const isActiveRef = useRef(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchUpdatedAt = useCallback(async () => {
    if (!sessionId) return;
    try {
      const session = await collaborativeSessionService.getSession(sessionId);
      const isTrackable = ['active', 'locked'].includes(session.status);
      isActiveRef.current = isTrackable;

      if (!isTrackable) {
        setShowWarning(false);
        setIsExpired(false);
        setRemainingMs(null);
        return;
      }

      // updated_at si présent dans le serializer, sinon fallback created_at
      const timestamp = session.updated_at ?? session.created_at;
      if (timestamp) {
        lastUpdatedAtRef.current = new Date(timestamp).getTime();
      }
    } catch {
      isActiveRef.current = false;
      setShowWarning(false);
      setIsExpired(false);
      setRemainingMs(null);
    }
  }, [sessionId]);

  // ── Init + refresh périodique (60 s) ────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setShowWarning(false);
      setIsExpired(false);
      setRemainingMs(null);
      return;
    }

    fetchUpdatedAt();
    refreshRef.current = setInterval(fetchUpdatedAt, 60_000);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [sessionId, fetchUpdatedAt]);

  // ── Tick chaque seconde ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    tickRef.current = setInterval(() => {
      if (!lastUpdatedAtRef.current || !isActiveRef.current) {
        setShowWarning(false);
        return;
      }

      const elapsed = Date.now() - lastUpdatedAtRef.current;
      const remaining = INACTIVITY_AUTO_COMPLETE_MS - elapsed;

      if (remaining <= 0) {
        // Countdown expiré — garder le warning visible ET signaler l'expiration
        // pour que le composant appelant puisse déclencher une redirection
        // (fallback si Celery Beat n'a pas auto-complété la session)
        setShowWarning(true);
        setIsExpired(true);
        setRemainingMs(0);
      } else if (remaining <= INACTIVITY_WARNING_BEFORE_MS) {
        setShowWarning(true);
        setRemainingMs(remaining);
      } else {
        setShowWarning(false);
        setRemainingMs(remaining);
      }
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [sessionId]);

  return {
    showInactivityWarning: showWarning,
    /** true quand le seuil de 15 min est dépassé côté client */
    isInactivityExpired: isExpired,
    inactivityRemainingMs: remainingMs,
    inactivityFormattedTime: remainingMs !== null && remainingMs > 0
      ? formatMilliseconds(remainingMs)
      : null,
  };
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formater les millisecondes en format lisible
 * @example formatMilliseconds(125000) => "2m 5s"
 */
export function formatMilliseconds(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}