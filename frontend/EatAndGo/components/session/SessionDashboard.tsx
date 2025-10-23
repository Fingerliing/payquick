import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  RefreshControl,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collaborativeSessionService,
  CollaborativeSession,
  SessionParticipant,
} from '@/services/collaborativeSessionService';
import { useSessionArchiving } from '@/hooks/session/useSessionArchiving';
import { SessionArchiveWarning } from '@/components/session/SessionArchiveWarning';
import { useSessionNotifications } from '@/components/session/SessionNotifications';

interface SessionDashboardProps {
  sessionId: string;
  onLeave?: () => void;
  onSessionCompleted?: () => void;
  onSessionArchived?: () => void;
  navigation?: any; // Pour la navigation React Navigation
}

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  sessionId,
  onLeave,
  onSessionCompleted,
  onSessionArchived,
  navigation,
}) => {
  const [session, setSession] = useState<CollaborativeSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Activer les notifications de session
  useSessionNotifications(sessionId);

  // Gérer l'archivage avec redirection automatique
  useSessionArchiving({
    sessionId,
    autoRedirect: true,
    onSessionArchived: (data) => {
      console.log('🗄️ Session archivée:', data);
      
      // Callback personnalisé
      if (onSessionArchived) {
        onSessionArchived();
      }

      // Redirection vers l'accueil après un court délai
      setTimeout(() => {
        if (navigation) {
          navigation.replace('Home');
        }
      }, 2000);
    },
    onTableReleased: (data) => {
      console.log('🆓 Table libérée:', data.table_number);
    },
    onSessionCompleted: (data) => {
      console.log('✅ Session terminée');
      
      if (onSessionCompleted) {
        onSessionCompleted();
      }
    },
  });

  useEffect(() => {
    loadSession();
    
    // Rafraîchir toutes les 10 secondes
    const interval = setInterval(loadSession, 10000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const data = await collaborativeSessionService.getSession(sessionId);
      setSession(data);
    } catch (error: any) {
      console.error('Error loading session:', error);
      
      // Si la session n'existe plus (404), elle a probablement été archivée
      if (error?.response?.status === 404) {
        Alert.alert(
          'Session introuvable',
          'Cette session a été archivée ou n\'existe plus.',
          [
            {
              text: 'Retour à l\'accueil',
              onPress: () => {
                if (navigation) {
                  navigation.replace('Home');
                } else if (onSessionArchived) {
                  onSessionArchived();
                }
              },
            },
          ],
          { cancelable: false }
        );
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSession();
    setRefreshing(false);
  };

  const handleLockSession = async () => {
    if (!session) return;

    Alert.alert(
      'Verrouiller la session',
      'Plus aucun nouveau participant ne pourra rejoindre la session.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Verrouiller',
          style: 'destructive',
          onPress: async () => {
            try {
              await collaborativeSessionService.sessionAction(sessionId, 'lock');
              await loadSession();
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de verrouiller la session');
            }
          },
        },
      ]
    );
  };

  const handleUnlockSession = async () => {
    if (!session) return;

    try {
      await collaborativeSessionService.sessionAction(sessionId, 'unlock');
      await loadSession();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de déverrouiller la session');
    }
  };

  const handleCompleteSession = async () => {
    if (!session) return;

    Alert.alert(
      'Terminer la session',
      'Cette action va terminer la session pour tous les participants. La session sera archivée automatiquement dans 30 minutes.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer',
          style: 'destructive',
          onPress: async () => {
            try {
              await collaborativeSessionService.sessionAction(sessionId, 'complete');
              
              if (onSessionCompleted) {
                onSessionCompleted();
              }

              Alert.alert(
                'Session terminée',
                'La session sera archivée automatiquement dans 30 minutes. Vous recevrez une notification avant l\'archivage.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de terminer la session');
            }
          },
        },
      ]
    );
  };

  const handleLeaveSession = async () => {
    Alert.alert(
      'Quitter la session',
      'Êtes-vous sûr de vouloir quitter cette session ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: async () => {
            try {
              await collaborativeSessionService.leaveSession(sessionId);
              if (onLeave) {
                onLeave();
              }
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de quitter la session');
            }
          },
        },
      ]
    );
  };

  const handleShareSession = async () => {
    if (!session) return;

    const message = `🍽️ Rejoins notre table au restaurant !\n\nRestaurant: ${session.restaurant_name}\nTable: ${session.table_number}\n\nCode de session: ${session.share_code}`;

    try {
      await Share.share({
        message,
        title: 'Rejoins notre table',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4CAF50';
      case 'locked': return '#FF9800';
      case 'completed': return '#2196F3';
      case 'payment': return '#9C27B0';
      case 'cancelled': return '#F44336';
      default: return '#666';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: 'Active',
      locked: 'Verrouillée',
      payment: 'Paiement',
      completed: 'Terminée',
      cancelled: 'Annulée',
    };
    return labels[status] || status;
  };

  if (!session) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  const isHost = session.participants.some(p => p.is_host);
  const canManageSession = isHost && session.status !== 'completed' && session.status !== 'cancelled';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Bandeau d'avertissement d'archivage */}
      <SessionArchiveWarning sessionId={sessionId} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.restaurantInfo}>
            <Ionicons name="restaurant" size={24} color="#1E2A78" />
            <View style={styles.restaurantDetails}>
              <Text style={styles.restaurantName}>{session.restaurant_name}</Text>
              <Text style={styles.tableNumber}>Table {session.table_number}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(session.status) }]}>
            <Text style={styles.statusText}>{getStatusLabel(session.status)}</Text>
          </View>
        </View>

        <View style={styles.sessionCode}>
          <Ionicons name="qr-code" size={20} color="#666" />
          <Text style={styles.codeLabel}>Code:</Text>
          <Text style={styles.code}>{session.share_code}</Text>
          <TouchableOpacity onPress={handleShareSession} style={styles.shareButton}>
            <Ionicons name="share-social" size={20} color="#1E2A78" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Ionicons name="people" size={24} color="#1E2A78" />
          <Text style={styles.statValue}>{session.participants.length}</Text>
          <Text style={styles.statLabel}>Participants</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="receipt" size={24} color="#1E2A78" />
          <Text style={styles.statValue}>{session.total_orders_count}</Text>
          <Text style={styles.statLabel}>Commandes</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="cash" size={24} color="#1E2A78" />
          <Text style={styles.statValue}>{session.total_amount.toFixed(2)}€</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Participants */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Participants</Text>
        {session.participants.map((participant) => (
          <View key={participant.id} style={styles.participantCard}>
            <View style={styles.participantAvatar}>
              <Text style={styles.participantInitial}>
                {participant.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.participantInfo}>
              <View style={styles.participantNameRow}>
                <Text style={styles.participantName}>{participant.display_name}</Text>
                {participant.is_host && (
                  <View style={styles.hostBadge}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.hostBadgeText}>Hôte</Text>
                  </View>
                )}
              </View>
              <Text style={styles.participantStats}>
                {participant.orders_count} commande(s) • {participant.total_spent.toFixed(2)}€
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {canManageSession && (
          <>
            {session.status === 'active' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.lockButton]}
                onPress={handleLockSession}
              >
                <Ionicons name="lock-closed" size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Verrouiller</Text>
              </TouchableOpacity>
            )}

            {session.status === 'locked' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.unlockButton]}
                onPress={handleUnlockSession}
              >
                <Ionicons name="lock-open" size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Déverrouiller</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionButton, styles.completeButton]}
              onPress={handleCompleteSession}
            >
              <Ionicons name="checkmark-done" size={20} color="#FFF" />
              <Text style={styles.actionButtonText}>Terminer</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.actionButton, styles.leaveButton]}
          onPress={handleLeaveSession}
        >
          <Ionicons name="exit" size={20} color="#FFF" />
          <Text style={styles.actionButtonText}>Quitter</Text>
        </TouchableOpacity>
      </View>

      {/* Info d'archivage pour les sessions terminées */}
      {session.status === 'completed' && (
        <View style={styles.archiveInfo}>
          <Ionicons name="information-circle" size={20} color="#1E2A78" />
          <Text style={styles.archiveInfoText}>
            Cette session sera automatiquement archivée 30 minutes après sa fin.
            Vous recevrez une notification avant l'archivage.
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#FFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  restaurantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  restaurantDetails: {
    marginLeft: 12,
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E2A78',
  },
  tableNumber: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  codeLabel: {
    fontSize: 14,
    color: '#666',
  },
  code: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E2A78',
    letterSpacing: 2,
    flex: 1,
  },
  shareButton: {
    padding: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFF',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginBottom: 16,
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  participantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E2A78',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  participantInfo: {
    flex: 1,
  },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E2A78',
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#856404',
  },
  participantStats: {
    fontSize: 12,
    color: '#666',
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  lockButton: {
    backgroundColor: '#FF9800',
  },
  unlockButton: {
    backgroundColor: '#4CAF50',
  },
  completeButton: {
    backgroundColor: '#2196F3',
  },
  leaveButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  archiveInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8EAF6',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    gap: 12,
  },
  archiveInfoText: {
    flex: 1,
    fontSize: 14,
    color: '#1E2A78',
    lineHeight: 20,
  },
});