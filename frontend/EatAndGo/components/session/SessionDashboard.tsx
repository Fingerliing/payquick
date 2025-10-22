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

interface SessionDashboardProps {
  sessionId: string;
  onLeave?: () => void;
  onSessionCompleted?: () => void;
}

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  sessionId,
  onLeave,
  onSessionCompleted,
}) => {
  const [session, setSession] = useState<CollaborativeSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSession();
    setRefreshing(false);
  };

  const handleShareCode = async () => {
    if (!session) return;

    try {
      await Share.share({
        message: `Rejoignez notre table au restaurant !\n\nCode de session: ${session.share_code}\n\nTable: ${session.table_number}\nRestaurant: ${session.restaurant_name}`,
        title: 'Rejoignez notre table',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleLockSession = async () => {
    if (!session) return;

    Alert.alert(
      'Verrouiller la session',
      'Plus personne ne pourra rejoindre cette session. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Verrouiller',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await collaborativeSessionService.sessionAction(sessionId, 'lock');
              await loadSession();
              Alert.alert('Succès', 'Session verrouillée');
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleUnlockSession = async () => {
    try {
      setLoading(true);
      await collaborativeSessionService.sessionAction(sessionId, 'unlock');
      await loadSession();
      Alert.alert('Succès', 'Session déverrouillée');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSession = async () => {
    if (!session) return;

    Alert.alert(
      'Terminer la session',
      'Toutes les commandes sont-elles payées ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer',
          onPress: async () => {
            try {
              setLoading(true);
              await collaborativeSessionService.sessionAction(sessionId, 'complete');
              Alert.alert('Session terminée', 'Merci et à bientôt !', [
                { text: 'OK', onPress: onSessionCompleted }
              ]);
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            } finally {
              setLoading(false);
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
              setLoading(true);
              await collaborativeSessionService.leaveSession(sessionId);
              onLeave?.();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleApproveParticipant = async (participantId: string) => {
    try {
      setLoading(true);
      await collaborativeSessionService.participantAction(participantId, 'approve');
      await loadSession();
      Alert.alert('Succès', 'Participant approuvé');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectParticipant = async (participantId: string) => {
    try {
      setLoading(true);
      await collaborativeSessionService.participantAction(participantId, 'reject');
      await loadSession();
      Alert.alert('Succès', 'Participation refusée');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'locked':
        return '#FF9800';
      case 'completed':
        return '#9E9E9E';
      default:
        return '#666';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'locked':
        return 'Verrouillée';
      case 'payment':
        return 'En paiement';
      case 'completed':
        return 'Terminée';
      default:
        return status;
    }
  };

  if (!session) {
    return (
      <View style={styles.container}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  const isHost = session.participants.some(p => p.is_host);
  const pendingParticipants = session.participants.filter(p => p.status === 'pending');

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* En-tête de session */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{session.restaurant_name}</Text>
            <Text style={styles.headerSubtitle}>Table {session.table_number}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(session.status) }]}>
            <Text style={styles.statusText}>{getStatusLabel(session.status)}</Text>
          </View>
        </View>

        {/* Code de partage */}
        <View style={styles.shareCodeCard}>
          <View style={styles.shareCodeContent}>
            <Ionicons name="qr-code" size={40} color="#1E2A78" />
            <View style={styles.shareCodeInfo}>
              <Text style={styles.shareCodeLabel}>Code de session</Text>
              <Text style={styles.shareCode}>{session.share_code}</Text>
            </View>
          </View>
          {session.status === 'active' && (
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShareCode}
            >
              <Ionicons name="share-social" size={20} color="#1E2A78" />
              <Text style={styles.shareButtonText}>Partager</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Statistiques */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={24} color="#1E2A78" />
            <Text style={styles.statValue}>{session.participant_count}</Text>
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
      </View>

      {/* Demandes en attente (pour l'hôte) */}
      {isHost && pendingParticipants.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="time" size={20} color="#FF9800" /> Demandes en attente
          </Text>
          {pendingParticipants.map((participant) => (
            <View key={participant.id} style={styles.pendingCard}>
              <View style={styles.pendingInfo}>
                <Text style={styles.pendingName}>{participant.display_name}</Text>
                <Text style={styles.pendingTime}>
                  {new Date(participant.joined_at).toLocaleTimeString()}
                </Text>
              </View>
              <View style={styles.pendingActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={() => handleApproveParticipant(participant.id)}
                >
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => handleRejectParticipant(participant.id)}
                >
                  <Ionicons name="close" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Liste des participants */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          <Ionicons name="people" size={20} color="#1E2A78" /> Participants
        </Text>
        {session.participants
          .filter(p => p.status === 'active')
          .map((participant) => (
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
      <View style={styles.actionsSection}>
        {isHost && (
          <>
            {session.status === 'active' && (
              <TouchableOpacity
                style={[styles.actionButtonLarge, styles.lockButton]}
                onPress={handleLockSession}
              >
                <Ionicons name="lock-closed" size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Verrouiller la session</Text>
              </TouchableOpacity>
            )}

            {session.status === 'locked' && (
              <TouchableOpacity
                style={[styles.actionButtonLarge, styles.unlockButton]}
                onPress={handleUnlockSession}
              >
                <Ionicons name="lock-open" size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Déverrouiller la session</Text>
              </TouchableOpacity>
            )}

            {(session.status === 'active' || session.status === 'locked') && (
              <TouchableOpacity
                style={[styles.actionButtonLarge, styles.completeButton]}
                onPress={handleCompleteSession}
              >
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.actionButtonText}>Terminer la session</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {!isHost && (
          <TouchableOpacity
            style={[styles.actionButtonLarge, styles.leaveButton]}
            onPress={handleLeaveSession}
          >
            <Ionicons name="exit" size={20} color="#FFF" />
            <Text style={styles.actionButtonText}>Quitter la session</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  shareCodeCard: {
    backgroundColor: '#E8EAF6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  shareCodeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  shareCodeInfo: {
    marginLeft: 16,
    flex: 1,
  },
  shareCodeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  shareCode: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1E2A78',
    letterSpacing: 4,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
  },
  shareButtonText: {
    color: '#1E2A78',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
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
    marginTop: 12,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginBottom: 16,
  },
  pendingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  pendingInfo: {
    flex: 1,
  },
  pendingName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  pendingTime: {
    fontSize: 12,
    color: '#666',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  participantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    marginBottom: 8,
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
    marginBottom: 4,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginRight: 8,
  },
  hostBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E2A78',
  },
  participantStats: {
    fontSize: 12,
    color: '#666',
  },
  actionsSection: {
    padding: 20,
    gap: 12,
  },
  actionButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    gap: 8,
  },
  lockButton: {
    backgroundColor: '#FF9800',
  },
  unlockButton: {
    backgroundColor: '#4CAF50',
  },
  completeButton: {
    backgroundColor: '#1E2A78',
  },
  leaveButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});