/**
 * Composant visuel pour afficher un bandeau d'avertissement d'archivage
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSessionArchiveCountdown } from '@/hooks/session/useSessionArchiving';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionArchiveWarningProps {
  sessionId: string | null;
}

// ============================================================================
// COMPOSANT: SessionArchiveWarning
// ============================================================================

/**
 * Composant pour afficher un bandeau d'avertissement d'archivage
 * 
 * Affiche un bandeau coloré selon l'état de la session :
 * - Orange : Plus de 5 minutes restantes avant archivage
 * - Rouge : Moins de 5 minutes restantes (urgent)
 * - Gris : Session archivée
 * 
 * @example
 * ```tsx
 * <SessionArchiveWarning sessionId={sessionId} />
 * ```
 */
export const SessionArchiveWarning: React.FC<SessionArchiveWarningProps> = ({ sessionId }) => {
  const { formattedTime, isCompleted, isArchived, timeUntilArchive } = useSessionArchiveCountdown(sessionId);

  if (isArchived) {
    return (
      <View style={[styles.warningBanner, styles.archivedBanner]}>
        <Ionicons name="archive" size={20} color="#FFF" />
        <Text style={styles.warningText}>Cette session a été archivée</Text>
      </View>
    );
  }

  if (isCompleted && formattedTime) {
    const isUrgent = timeUntilArchive !== null && timeUntilArchive < 300000;

    return (
      <View style={[styles.warningBanner, isUrgent ? styles.urgentBanner : styles.completedBanner]}>
        <Ionicons name="time" size={20} color="#FFF" />
        <Text style={styles.warningText}>
          {isUrgent ? '⚠️ ' : ''}Archivage dans {formattedTime}
        </Text>
      </View>
    );
  }

  return null;
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 8,
  },
  completedBanner: {
    backgroundColor: '#FF9800',
  },
  urgentBanner: {
    backgroundColor: '#F44336',
  },
  archivedBanner: {
    backgroundColor: '#757575',
  },
  warningText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});