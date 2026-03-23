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

import { useEffect, useRef, useState } from 'react';
import { useSessionWebSocket } from './useSessionWebSocket';

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
  // Empêche le double-déclenchement (WS peut émettre completed puis archived)
  const hasShownAlert = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    // Réinitialiser la garde à chaque changement de session
    hasShownAlert.current = false;

    // ── session_completed : clôture volontaire par l'hôte ──────────────────
    const unsubCompleted = on('session_completed', (data: SessionCompletedData) => {
      if (hasShownAlert.current) return;
      hasShownAlert.current = true;

      onSessionCompleted?.(data);

      setExpiredAlert({
        title: '⏰ Session terminée',
        message: data?.message ?? 'La session a été clôturée par le restaurant.',
      });
    });

    // ── session_archived : archivage définitif (Celery ou manuel) ──────────
    const unsubArchived = on('session_archived', (data: SessionArchivedData) => {
      if (hasShownAlert.current) return;
      hasShownAlert.current = true;

      onSessionArchived?.(data);

      setExpiredAlert({
        title: '⏰ Session expirée',
        message: data?.message ?? "Cette session n'est plus accessible.",
      });
    });

    // ── table_released : callback optionnel, pas d'alerte générique ─────────
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

/**
 * Hook pour surveiller le compte à rebours avant archivage
 * 
 * @returns {Object} État du compte à rebours
 * - timeUntilArchive: Temps restant en millisecondes
 * - isCompleted: Si la session est terminée
 * - isArchived: Si la session est archivée
 * - formattedTime: Temps formaté (ex: "28m 45s")
 */
export const useSessionArchiveCountdown = (sessionId: string | null) => {
  const [timeUntilArchive, setTimeUntilArchive] = useState<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const { on } = useSessionWebSocket(sessionId);
  const countdownInterval = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const unsubCompleted = on('session_completed', (data: SessionCompletedData) => {
      const archiveTime = data?.will_archive_in || 1800000;
      setTimeUntilArchive(archiveTime);
      setIsCompleted(true);

      countdownInterval.current = setInterval(() => {
        setTimeUntilArchive((prev) => {
          if (prev === null || prev <= 1000) {
            if (countdownInterval.current) {
              clearInterval(countdownInterval.current);
            }
            return 0;
          }
          return prev - 1000;
        });
      }, 1000);
    });

    const unsubArchived = on('session_archived', () => {
      setIsArchived(true);
      setTimeUntilArchive(0);
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
    });

    return () => {
      unsubCompleted();
      unsubArchived();
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
    };
  }, [sessionId, on]);

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