import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

// Hooks
import { useCollaborativeSession } from '@/hooks/session/useCollaborativeSession';
import { useSessionArchiving } from '@/hooks/session/useSessionArchiving';
import { useSessionEvents } from '@/hooks/session/useSessionEvents';
import { useSessionNotifications } from '@/components/session/SessionNotifications';

// Composants
import { SessionArchiveWarning } from '@/components/session/SessionArchiveWarning';
import { SessionOrdersView } from '@/components/session/SessionOrdersView';
import { SessionQRCodeModal, SessionCodeDisplay } from '@/components/session/SessionQRCodeModal';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionDashboardProps {
  sessionId: string;
  onLeaveSession?: () => void;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  sessionId,
  onLeaveSession,
}) => {
  const [showQRModal, setShowQRModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Hooks de gestion de session
  const {
    session,
    currentParticipant,
    isHost,
    canManage,
    loading,
    error,
    lockSession,
    unlockSession,
    completeSession,
    leaveSession,
    refresh,
    isActive,
    isLocked,
    isCompleted,
  } = useCollaborativeSession({ sessionId });

  // Écoute des événements de session
  const { sessionData, participants, orders, isConnected } = useSessionEvents(sessionId);

  // Notifications automatiques
  useSessionNotifications(sessionId);

  // Gestion de l'archivage
  useSessionArchiving({
    sessionId,
    autoRedirect: true,
    onSessionArchived: (data) => {
      Alert.alert('Session archivée', data.message || 'Cette session a été archivée', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/dashboard') },
      ]);
    },
    onTableReleased: (data) => {
      console.log(`Table ${data.table_number} libérée`);
    },
  });

  // Rafraîchir les données
  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Gérer le verrouillage
  const handleLock = async () => {
    Alert.alert(
      'Verrouiller la session',
      'Les participants ne pourront plus rejoindre cette session',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Verrouiller',
          style: 'destructive',
          onPress: async () => {
            try {
              await lockSession();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            }
          },
        },
      ]
    );
  };

  // Gérer le déverrouillage
  const handleUnlock = async () => {
    try {
      await unlockSession();
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  // Terminer la session
  const handleComplete = async () => {
    Alert.alert(
      'Terminer la session',
      'Êtes-vous sûr ? Cette action marquera la fin du repas.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer',
          style: 'destructive',
          onPress: async () => {
            try {
              await completeSession();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            }
          },
        },
      ]
    );
  };

  // Quitter la session
  const handleLeave = async () => {
    Alert.alert(
      'Quitter la session',
      isHost
        ? 'Vous êtes l\'hôte. Si vous quittez, la session continuera sans vous.'
        : 'Êtes-vous sûr de vouloir quitter cette session ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Quitter',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveSession();
              onLeaveSession?.();
              router.replace('/(tabs)/dashboard');
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            }
          },
        },
      ]
    );
  };

  if (loading && !session) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Chargement de la session...</Text>
      </View>
    );
  }

  if (error || !session) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#F44336" />
        <Text style={styles.errorTitle}>Erreur</Text>
        <Text style={styles.errorMessage}>
          {error?.message || 'Impossible de charger la session'}
        </Text>
        <Button 
          title="Retour" 
          onPress={() => router.back()}
          variant="primary"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Bandeau d'archivage */}
      <SessionArchiveWarning sessionId={sessionId} />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* En-tête de session */}
        <Card style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerInfo}>
              <Text style={styles.restaurantName}>{session.restaurant_name}</Text>
              <Text style={styles.tableName}>Table {session.table_number}</Text>
            </View>
            <View style={styles.statusContainer}>
              <Badge
                text={isActive ? 'Active' : isLocked ? 'Verrouillée' : 'Terminée'}
                variant={isActive ? 'success' : isLocked ? 'warning' : 'default'}
                size="md"
              />
              {isHost && (
                <Badge 
                  text="Hôte" 
                  variant="warning" 
                  size="sm"
                />
              )}
            </View>
          </View>

          {/* Code de session */}
          <SessionCodeDisplay
            shareCode={session.share_code}
            onPress={() => setShowQRModal(true)}
          />

          {/* Statistiques */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={20} color="#666" />
              <Text style={styles.statValue}>{session.participant_count}</Text>
              <Text style={styles.statLabel}>Participants</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="receipt" size={20} color="#666" />
              <Text style={styles.statValue}>{orders.length}</Text>
              <Text style={styles.statLabel}>Commandes</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="cash" size={20} color="#666" />
              <Text style={styles.statValue}>{session.total_amount.toFixed(2)}€</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </Card>

        {/* Actions de l'hôte */}
        {canManage && isActive && (
          <Card style={styles.actionsCard}>
            <Text style={styles.actionsTitle}>Actions de l'hôte</Text>
            <View style={styles.actionsRow}>
              {!isLocked ? (
                <Button
                  title="Verrouiller"
                  onPress={handleLock}
                  variant="outline"
                  size="md"
                  leftIcon={<Ionicons name="lock-closed" size={18} color="#FF9800" />}
                  style={styles.actionButton}
                />
              ) : (
                <Button
                  title="Déverrouiller"
                  onPress={handleUnlock}
                  variant="outline"
                  size="md"
                  leftIcon={<Ionicons name="lock-open" size={18} color="#4CAF50" />}
                  style={styles.actionButton}
                />
              )}
              <Button
                title="Terminer"
                onPress={handleComplete}
                variant="primary"
                size="md"
                leftIcon={<Ionicons name="checkmark-done" size={18} color="#FFF" />}
                style={styles.actionButton}
              />
            </View>
          </Card>
        )}

        {/* Liste des participants */}
        <Card style={styles.participantsCard}>
          <Text style={styles.sectionTitle}>Participants ({participants.length})</Text>
          {participants.map((participant) => (
            <View key={participant.id} style={styles.participantRow}>
              <View style={styles.participantAvatar}>
                <Text style={styles.participantInitial}>
                  {participant.display_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.participantInfo}>
                <Text style={styles.participantName}>{participant.display_name}</Text>
                <Text style={styles.participantStats}>
                  {participant.orders_count} commande(s) • {participant.total_spent.toFixed(2)}€
                </Text>
              </View>
              {participant.is_host && (
                <Badge 
                  text="Hôte" 
                  variant="warning" 
                  size="sm"
                />
              )}
            </View>
          ))}
        </Card>

        {/* Vue des commandes */}
        <SessionOrdersView
          sessionId={sessionId}
          currentParticipantId={currentParticipant?.id}
          onOrderPress={(order) => {
            // Navigation vers les détails de commande
            router.push(`/order/${order.id}`);
          }}
        />

        {/* Bouton quitter */}
        <View style={styles.leaveContainer}>
          <Button 
            title="Quitter la session"
            onPress={handleLeave} 
            variant="destructive"
            size="md"
            leftIcon={<Ionicons name="exit-outline" size={20} color="#F44336" />}
            style={styles.leaveButton}
          />
        </View>
      </ScrollView>

      {/* Modal QR Code */}
      <SessionQRCodeModal
        visible={showQRModal}
        onClose={() => setShowQRModal(false)}
        shareCode={session.share_code}
        restaurantName={session.restaurant_name}
        tableNumber={session.table_number}
        sessionType={session.session_type}
      />
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

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
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8F9FA',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  headerCard: {
    margin: 16,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerInfo: {
    flex: 1,
  },
  restaurantName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginBottom: 4,
  },
  tableName: {
    fontSize: 16,
    color: '#666',
  },
  statusContainer: {
    gap: 8,
    alignItems: 'flex-end',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E2A78',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  actionsCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E2A78',
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  participantsCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E2A78',
    marginBottom: 16,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E2A78',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E2A78',
    marginBottom: 2,
  },
  participantStats: {
    fontSize: 12,
    color: '#666',
  },
  leaveContainer: {
    padding: 16,
  },
  leaveButton: {
    width: '100%',
  },
});

export default SessionDashboard;