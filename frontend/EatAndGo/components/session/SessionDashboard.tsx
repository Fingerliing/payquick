import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
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
import { Alert, AlertWithAction } from '@/components/ui/Alert';
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

  // ── Alertes déclaratives ────────────────────────────────────────────────
  // Notification : nouveau participant en attente
  const [newPendingName, setNewPendingName] = useState<string | null>(null);
  // Session archivée (message + redirect au dismiss)
  const [archivedMessage, setArchivedMessage] = useState<string | null>(null);
  // Confirmations
  const [lockConfirmVisible, setLockConfirmVisible] = useState(false);
  const [completeConfirmVisible, setCompleteConfirmVisible] = useState(false);
  const [leaveConfirmVisible, setLeaveConfirmVisible] = useState(false);
  // Erreurs
  const [lockError, setLockError] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);

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
    approveParticipant,
    rejectParticipant,
    refresh,
    isActive,
    isLocked,
    isCompleted,
  } = useCollaborativeSession({ sessionId });

  // Écoute des événements de session
  const { sessionData, participants, orders, isConnected } = useSessionEvents(sessionId);

  // Fusionner les participants WebSocket avec ceux de la session API
  const allParticipants = participants.length > 0
  ? participants
  : (session?.participants ?? []);

  const pendingParticipants = allParticipants.filter(p => p.status === 'pending');

  const prevPendingCountRef = useRef(0);

  useEffect(() => {
    const currentCount = pendingParticipants.length;
    if (currentCount > prevPendingCountRef.current) {
      const newest = pendingParticipants[currentCount - 1];
      setNewPendingName(newest?.display_name || 'Quelqu\'un');
    }
    prevPendingCountRef.current = currentCount;
  }, [pendingParticipants.length]);

  // Notifications automatiques
  useSessionNotifications(sessionId);

  // Gestion de l'archivage
  useSessionArchiving({
    sessionId,
    autoRedirect: true,
    onSessionArchived: (data) => {
      setArchivedMessage(data.message || 'Cette session a été archivée.');
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
  const handleLock = () => {
    setLockError(null);
    setLockConfirmVisible(true);
  };

  const handleConfirmLock = async () => {
    setLockConfirmVisible(false);
    try {
      await lockSession();
    } catch (error: any) {
      setLockError(error.message ?? 'Impossible de verrouiller la session.');
    }
  };

  // Gérer le déverrouillage
  const handleUnlock = async () => {
    setUnlockError(null);
    try {
      await unlockSession();
    } catch (error: any) {
      setUnlockError(error.message ?? 'Impossible de déverrouiller la session.');
    }
  };

  // Terminer la session
  const handleComplete = () => {
    setCompleteError(null);
    setCompleteConfirmVisible(true);
  };

  const handleConfirmComplete = async () => {
    setCompleteConfirmVisible(false);
    try {
      await completeSession();
    } catch (error: any) {
      setCompleteError(error.message ?? 'Impossible de terminer la session.');
    }
  };

  // Quitter la session
  const handleLeave = () => {
    setLeaveError(null);
    setLeaveConfirmVisible(true);
  };

  const handleConfirmLeave = async () => {
    setLeaveConfirmVisible(false);
    try {
      await leaveSession();
      onLeaveSession?.();
      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      setLeaveError(error.message ?? 'Impossible de quitter la session.');
    }
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

        {/* Participants en attente d'approbation */}
        {isHost && pendingParticipants.length > 0 && (
          <Card style={styles.pendingCard}>
            <Text style={styles.pendingCardTitle}>
              ⏳ En attente d'approbation ({pendingParticipants.length})
            </Text>
            {pendingParticipants.map(participant => (
              <View key={participant.id} style={styles.pendingParticipantRow}>
                <View style={styles.pendingParticipantInfo}>
                  <Ionicons name="person-outline" size={18} color="#666" />
                  <Text style={styles.pendingParticipantName}>
                    {participant.display_name}
                  </Text>
                </View>
                <View style={styles.pendingActions}>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={() => approveParticipant(participant.id)}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.approveBtnText}>Accepter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => rejectParticipant(participant.id)}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          }
        </Card>
        )}

        {/* Vue des commandes */}
        <SessionOrdersView
          sessionId={sessionId}
          currentParticipantId={currentParticipant?.id}
          onOrderPress={(order) => {
            // Navigation vers les détails de commande
            router.push(`/order/${order.id}`);
          }}
        />

        {/* ── Alertes inline ───────────────────────────────────────────────── */}
        <View style={styles.alertsContainer}>

          {/* Nouvelle demande de participation */}
          {newPendingName && (
            <AlertWithAction
              variant="info"
              title="🔔 Nouvelle demande"
              message={`${newPendingName} souhaite rejoindre la session.`}
              autoDismiss={false}
              primaryButton={{
                text: 'Voir les demandes',
                variant: 'primary',
                onPress: () => setNewPendingName(null),
              }}
              secondaryButton={{
                text: 'Ignorer',
                onPress: () => setNewPendingName(null),
              }}
            />
          )}

          {/* Session archivée */}
          {archivedMessage && (
            <AlertWithAction
              variant="warning"
              title="Session archivée"
              message={archivedMessage}
              autoDismiss={false}
              primaryButton={{
                text: 'OK',
                variant: 'primary',
                onPress: () => {
                  setArchivedMessage(null);
                  router.replace('/(tabs)/dashboard');
                },
              }}
            />
          )}

          {/* Confirmation verrouillage */}
          {lockConfirmVisible && (
            <AlertWithAction
              variant="warning"
              title="Verrouiller la session ?"
              message="Les participants ne pourront plus rejoindre cette session."
              autoDismiss={false}
              primaryButton={{
                text: 'Verrouiller',
                variant: 'danger',
                onPress: handleConfirmLock,
              }}
              secondaryButton={{
                text: 'Annuler',
                onPress: () => setLockConfirmVisible(false),
              }}
            />
          )}

          {/* Erreur verrouillage / déverrouillage */}
          {lockError && (
            <Alert
              variant="error"
              title="Erreur"
              message={lockError}
              autoDismiss
              autoDismissDuration={5000}
              onDismiss={() => setLockError(null)}
            />
          )}
          {unlockError && (
            <Alert
              variant="error"
              title="Erreur"
              message={unlockError}
              autoDismiss
              autoDismissDuration={5000}
              onDismiss={() => setUnlockError(null)}
            />
          )}

          {/* Confirmation terminer */}
          {completeConfirmVisible && (
            <AlertWithAction
              variant="warning"
              title="Terminer la session ?"
              message="Cette action marquera la fin du repas pour tous les participants."
              autoDismiss={false}
              primaryButton={{
                text: 'Terminer',
                variant: 'danger',
                onPress: handleConfirmComplete,
              }}
              secondaryButton={{
                text: 'Annuler',
                onPress: () => setCompleteConfirmVisible(false),
              }}
            />
          )}

          {/* Erreur terminer */}
          {completeError && (
            <Alert
              variant="error"
              title="Erreur"
              message={completeError}
              autoDismiss
              autoDismissDuration={5000}
              onDismiss={() => setCompleteError(null)}
            />
          )}

          {/* Confirmation quitter */}
          {leaveConfirmVisible && (
            <AlertWithAction
              variant={isHost ? 'info' : 'warning'}
              title="Quitter la session ?"
              message={
                isHost
                  ? "Vous êtes l'hôte. Si vous quittez, la session continuera sans vous."
                  : 'Êtes-vous sûr de vouloir quitter cette session ?'
              }
              autoDismiss={false}
              primaryButton={{
                text: 'Quitter',
                variant: 'danger',
                onPress: handleConfirmLeave,
              }}
              secondaryButton={{
                text: 'Annuler',
                onPress: () => setLeaveConfirmVisible(false),
              }}
            />
          )}

          {/* Erreur quitter */}
          {leaveError && (
            <Alert
              variant="error"
              title="Erreur"
              message={leaveError}
              autoDismiss
              autoDismissDuration={5000}
              onDismiss={() => setLeaveError(null)}
            />
          )}
        </View>

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
  alertsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  pendingCard: {
    margin: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FF9800',
    backgroundColor: '#FFF8E1',
  },
  pendingCardTitle: {
    fontSize: 15,
    fontWeight: 'bold' as const,
    color: '#E65100',
    marginBottom: 12,
  },
  pendingParticipantRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#FFE0B2',
  },
  pendingParticipantInfo: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    flex: 1,
  },
  pendingParticipantName: {
    fontSize: 15,
    color: '#333',
  },
  pendingActions: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  approveBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600' as const,
  },
  rejectBtn: {
    backgroundColor: '#F44336',
    padding: 6,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});

export default SessionDashboard;