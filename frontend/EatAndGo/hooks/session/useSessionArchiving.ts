/**
 * Hook pour gérer l'archivage automatique des sessions collaboratives
 * 
 * @module useSessionArchiving
 * @description Gère les événements d'archivage, les alertes et les redirections
 */

import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useSessionWebSocket } from './useSessionWebSocket';

// ============================================================================
// TYPES
// ============================================================================

export interface UseSessionArchivingOptions {
  sessionId: string | null;
  onSessionArchived?: (data: SessionArchivedData) => void;
  onTableReleased?: (data: TableReleasedData) => void;
  onSessionCompleted?: (data: SessionCompletedData) => void;
  autoRedirect?: boolean;
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

// ============================================================================
// HOOK PRINCIPAL: useSessionArchiving
// ============================================================================

/**
 * Hook principal pour gérer l'archivage des sessions
 * 
 * Fonctionnalités:
 * - Alerte lors de la fin de session
 * - Alerte de rappel 5 minutes avant archivage
 * - Alerte lors de l'archivage avec redirection optionnelle
 * - Protection contre les alertes multiples
 * - Gestion automatique du nettoyage
 */
export const useSessionArchiving = ({
  sessionId,
  onSessionArchived,
  onTableReleased,
  onSessionCompleted,
  autoRedirect = false,
}: UseSessionArchivingOptions): void => {
  const { on } = useSessionWebSocket(sessionId);
  const hasShownArchivedAlert = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const unsubCompleted = on('session_completed', (data: SessionCompletedData) => {
      const archiveTime = data?.will_archive_in || 1800000;
      const archiveMinutes = Math.floor(archiveTime / 60000);

      if (onSessionCompleted) {
        onSessionCompleted(data);
      }

      Alert.alert(
        '🎉 Session terminée',
        `Merci et à bientôt ! Cette session sera automatiquement archivée dans ${archiveMinutes} minutes.`,
        [{ text: 'OK', style: 'default' }]
      );

      if (archiveTime > 300000) {
        completionTimer.current = setTimeout(() => {
          Alert.alert(
            '⏰ Archivage imminent',
            'Cette session sera archivée dans 5 minutes. Veuillez sauvegarder toutes les informations importantes.',
            [{ text: 'Compris' }]
          );
        }, archiveTime - 300000);
      }
    });

    const unsubArchived = on('session_archived', (data: SessionArchivedData) => {
      if (hasShownArchivedAlert.current) return;
      hasShownArchivedAlert.current = true;

      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
        completionTimer.current = null;
      }

      if (onSessionArchived) {
        onSessionArchived(data);
      }

      if (autoRedirect && data?.redirect_suggested) {
        Alert.alert(
          '🗄️ Session archivée',
          data?.message || 'Cette session a été archivée et n\'est plus accessible. Vous allez être redirigé vers l\'accueil.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (onSessionArchived) onSessionArchived(data);
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        Alert.alert(
          '🗄️ Session archivée',
          data?.message || 'Cette session a été archivée et n\'est plus accessible.',
          [
            {
              text: 'Retour à l\'accueil',
              onPress: () => {
                if (onSessionArchived) onSessionArchived(data);
              },
            },
          ],
          { cancelable: false }
        );
      }
    });

    const unsubTableReleased = on('table_released', (data: TableReleasedData) => {
      if (onTableReleased) {
        onTableReleased(data);
      }
      console.log(`🆓 Table ${data?.table_number} libérée`);
    });

    return () => {
      unsubCompleted();
      unsubArchived();
      unsubTableReleased();
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
      }
    };
  }, [sessionId, on, onSessionArchived, onTableReleased, onSessionCompleted, autoRedirect]);
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