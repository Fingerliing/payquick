import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { collaborativeSessionService, CollaborativeSession } from '@/services/collaborativeSessionService';
import { useSession } from '@/contexts/SessionContext';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';
import { Alert } from '@/components/ui/Alert';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertState {
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  /** Callback exécuté APRÈS la disparition de l'alerte */
  onDismiss?: () => void;
}

interface SessionJoinModalProps {
  visible: boolean;
  onClose: () => void;
  restaurantId: number;
  tableNumber: string;
  tableId?: number;
  onSessionCreated?: (session: CollaborativeSession) => void;
  onSessionJoined?: (session: CollaborativeSession) => void;
  onOrderAlone?: () => void;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export const SessionJoinModal: React.FC<SessionJoinModalProps> = ({
  visible,
  onClose,
  restaurantId,
  tableNumber,
  tableId,
  onSessionCreated,
  onSessionJoined,
  onOrderAlone,
}) => {
  // ── SessionContext : persiste participantId en mémoire React après création ─
  const { createSession: ctxCreateSession } = useSession();

  const [loading, setLoading] = useState(false);
  const [existingSession, setExistingSession] = useState<CollaborativeSession | null>(null);
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'pending'>('choose');
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<CollaborativeSession | null>(null);

  // ── WebSocket branché sur la session en cours d'approbation ───────────────
  // Null tant que l'invité n'est pas en mode pending → pas de connexion inutile
  const { on: onWsEvent } = useSessionWebSocket(
    mode === 'pending' ? pendingSessionId : null
  );

  // Ref pour éviter de déclencher l'approbation deux fois (WS + polling)
  const approvalHandledRef = useRef(false);

  // États formulaire — création
  const [hostName, setHostName] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('10');
  const [requireApproval, setRequireApproval] = useState(false);
  const [sessionType, setSessionType] = useState<'collaborative' | 'individual'>('collaborative');

  // États formulaire — rejoindre
  const [shareCode, setShareCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [sessionPreview, setSessionPreview] = useState<CollaborativeSession | null>(null);

  // ── Alerte centralisée ────────────────────────────────────────────────────
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  // Raccourcis pour afficher une alerte
  const showAlert = (state: AlertState) => setAlertState(state);
  const dismissAlert = () => setAlertState(null);

  // ---------------------------------------------------------------------------
  // Vérification session existante à l'ouverture
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (visible) {
      checkExistingSession();
    }
  }, [visible]);

  const checkExistingSession = async () => {
    try {
      const session = await collaborativeSessionService.checkActiveSession(
        restaurantId,
        tableNumber
      );
      setExistingSession(session);
    } catch {
      setExistingSession(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleOrderAlone = async () => {
    try {
      await AsyncStorage.setItem('orderMode', 'solo');
      await AsyncStorage.setItem('currentRestaurantId', restaurantId.toString());
      await AsyncStorage.setItem('currentTableNumber', tableNumber);
      onOrderAlone?.();
      onClose();
    } catch (error) {
      showAlert({
        variant: 'error',
        title: 'Erreur',
        message: 'Impossible de démarrer la commande solo.',
      });
    }
  };

  const handleCreateSession = async () => {
    if (!hostName.trim()) {
      showAlert({
        variant: 'warning',
        title: 'Champ requis',
        message: 'Veuillez entrer votre nom pour créer la session.',
      });
      return;
    }

    setLoading(true);
    try {
      // ✅ Via SessionContext pour que participantId soit persisté en mémoire
      // dès la création — sans ça, isHost=false au premier rendu du menu.
      const session = await ctxCreateSession({
        restaurant_id: restaurantId,
        table_number: tableNumber,
        table_id: tableId,
        host_name: hostName,
        session_type: sessionType,
        max_participants: parseInt(maxParticipants, 10) || 10,
        require_approval: requireApproval,
      });

      // ✅ Succès — callback déclenché après fermeture de l'alerte
      showAlert({
        variant: 'success',
        title: 'Session créée !',
        message: `Partagez le code ${session.share_code} avec vos amis.`,
        onDismiss: () => {
          onSessionCreated?.(session);
          onClose();
        },
      });
    } catch (error: any) {
      showAlert({
        variant: 'error',
        title: 'Erreur',
        message: error.message || 'Impossible de créer la session.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewSession = async () => {
    if (shareCode.length !== 6) {
      showAlert({
        variant: 'warning',
        title: 'Code invalide',
        message: 'Le code doit contenir exactement 6 caractères.',
      });
      return;
    }

    setLoading(true);
    try {
      const session = await collaborativeSessionService.getSessionByCode(
        shareCode.toUpperCase()
      );
      setSessionPreview(session);
    } catch (error: any) {
      showAlert({
        variant: 'error',
        title: 'Code introuvable',
        message: 'Aucune session active ne correspond à ce code.',
      });
      setSessionPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!guestName.trim()) {
      showAlert({
        variant: 'warning',
        title: 'Champ requis',
        message: 'Veuillez entrer votre nom pour rejoindre la session.',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await collaborativeSessionService.joinSession({
        share_code: shareCode.toUpperCase(),
        guest_name: guestName,
      });

      if (result.requires_approval) {
        // ⏳ En attente d'approbation
        setMode('pending');
        setPendingParticipantId(result.participant_id);
        setPendingSessionId(result.session.id); // ✅ déclenche le WebSocket + le polling
        setPendingSession(result.session);
      } else {
        // ✅ Accès direct
        showAlert({
          variant: 'success',
          title: 'Bienvenue !',
          message: 'Vous avez rejoint la session avec succès.',
          onDismiss: () => {
            onSessionJoined?.(result.session);
            onClose();
          },
        });
      }
    } catch (error: any) {
      showAlert({
        variant: 'error',
        title: 'Erreur',
        message: error.message || 'Impossible de rejoindre la session.',
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Approbation instantanée via WebSocket (primaire)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mode !== 'pending' || !pendingParticipantId || !pendingSessionId) return;

    approvalHandledRef.current = false; // reset à chaque entrée en mode pending
    console.log('[MODAL-PENDING] 🔌 WS listener enregistré pour session:', pendingSessionId);

    const unsubApproved = onWsEvent('participant_approved', async (participant: any) => {
      console.log('[MODAL-PENDING] ✅ participant_approved reçu:', participant?.id, '(attendu:', pendingParticipantId, ')');
      // Vérifier que c'est bien notre participant
      if (participant?.id !== pendingParticipantId) return;
      if (approvalHandledRef.current) return;
      approvalHandledRef.current = true;

      try {
        // Récupérer la session à jour pour passer l'objet complet au callback
        const session = await collaborativeSessionService.getSession(pendingSessionId);
        showAlert({
          variant: 'success',
          title: '✅ Accepté !',
          message: "L'hôte vous a accepté dans la session.",
          onDismiss: () => {
            onSessionJoined?.(session);
            onClose();
          },
        });
      } catch {
        // Fallback minimal si le fetch échoue — on utilise la session en cache
        if (pendingSession) {
          onSessionJoined?.(pendingSession);
          onClose();
        }
      }
    });

    // Écouter aussi le rejet via session_update (participant removed)
    const unsubUpdate = onWsEvent('session_update', (data: any) => {
      if (data?.event !== 'participant_removed') return;
      if (data?.data?.participant?.id !== pendingParticipantId) return;
      if (approvalHandledRef.current) return;
      approvalHandledRef.current = true;

      showAlert({
        variant: 'error',
        title: '❌ Refusé',
        message: "L'hôte a refusé votre demande.",
        onDismiss: () => setMode('choose'),
      });
    });

    return () => {
      unsubApproved();
      unsubUpdate();
    };
  }, [mode, pendingParticipantId, pendingSessionId, onWsEvent]);

  // ---------------------------------------------------------------------------
  // Polling approbation (fallback si WebSocket indisponible)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mode !== 'pending' || !pendingParticipantId || !pendingSessionId) return;

    // Intervalle allongé à 10s car le WebSocket prend le relai en temps réel
    const interval = setInterval(async () => {
      if (approvalHandledRef.current) {
        clearInterval(interval);
        return;
      }

      try {
        const session = await collaborativeSessionService.getSession(pendingSessionId);
        const me = session.participants?.find((p: any) => p.id === pendingParticipantId);

        if (me?.status === 'active') {
          if (approvalHandledRef.current) return;
          approvalHandledRef.current = true;
          clearInterval(interval);
          showAlert({
            variant: 'success',
            title: '✅ Accepté !',
            message: "L'hôte vous a accepté dans la session.",
            onDismiss: () => {
              onSessionJoined?.(session);
              onClose();
            },
          });
        } else if (me?.status === 'removed') {
          if (approvalHandledRef.current) return;
          approvalHandledRef.current = true;
          clearInterval(interval);
          showAlert({
            variant: 'error',
            title: '❌ Refusé',
            message: "L'hôte a refusé votre demande.",
            onDismiss: () => setMode('choose'),
          });
        }
      } catch {
        // Ignorer les erreurs réseau temporaires
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [mode, pendingParticipantId, pendingSessionId]);

  // ---------------------------------------------------------------------------
  // Renders des différents modes
  // ---------------------------------------------------------------------------

  const renderChooseMode = () => (
    <View style={styles.modeContainer}>
      <Text style={styles.title}>Commander sur cette table</Text>
      <Text style={styles.subtitle}>Choisissez comment vous souhaitez commander</Text>

      {existingSession && (
        <TouchableOpacity
          style={[styles.optionCard, { borderWidth: 2, borderColor: '#4CAF50', backgroundColor: '#F1F8E9' }]}
          onPress={() => setMode('join')}
        >
          <View style={[styles.optionIcon, { backgroundColor: '#C8E6C9' }]}>
            <Ionicons name="enter" size={32} color="#2E7D32" />
          </View>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, { color: '#2E7D32' }]}>
              Rejoindre la session en cours
            </Text>
            <Text style={styles.optionDescription}>
              Code : {existingSession.share_code} · {existingSession.participant_count} participant(s)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#2E7D32" />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.optionCard} onPress={() => setMode('create')}>
        <View style={styles.optionIcon}>
          <Ionicons name="people" size={32} color="#1E2A78" />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>Créer une session de groupe</Text>
          <Text style={styles.optionDescription}>
            Commandez avec vos amis et divisez l'addition facilement
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#666" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={() => setMode('join')}>
        <View style={styles.optionIcon}>
          <Ionicons name="enter" size={32} color="#1E2A78" />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>Rejoindre une session</Text>
          <Text style={styles.optionDescription}>Entrez le code partagé par votre groupe</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#666" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.soloButton} onPress={handleOrderAlone}>
        <Text style={styles.soloButtonText}>Commander seul(e)</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCreateMode = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.title}>Créer une session de groupe</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Votre nom *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Jean"
          value={hostName}
          onChangeText={setHostName}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Type de session</Text>
        <View style={styles.radioGroup}>
          <TouchableOpacity
            style={[styles.radioOption, sessionType === 'collaborative' && styles.radioOptionActive]}
            onPress={() => setSessionType('collaborative')}
          >
            <Text style={[styles.radioText, sessionType === 'collaborative' && styles.radioTextActive]}>
              Collaborative
            </Text>
            <Text style={styles.radioDescription}>Tout le monde voit les commandes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.radioOption, sessionType === 'individual' && styles.radioOptionActive]}
            onPress={() => setSessionType('individual')}
          >
            <Text style={[styles.radioText, sessionType === 'individual' && styles.radioTextActive]}>
              Individuelle
            </Text>
            <Text style={styles.radioDescription}>Chacun commande séparément</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Nombre maximum de participants</Text>
        <TextInput
          style={styles.input}
          placeholder="10"
          value={maxParticipants}
          onChangeText={setMaxParticipants}
          keyboardType="number-pad"
        />
      </View>

      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => setRequireApproval(!requireApproval)}
      >
        <View style={[styles.checkbox, requireApproval && styles.checkboxActive]}>
          {requireApproval && <Ionicons name="checkmark" size={18} color="#FFF" />}
        </View>
        <Text style={styles.checkboxLabel}>Approuver manuellement les nouveaux participants</Text>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('choose')}>
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleCreateSession}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : (
            <Text style={styles.primaryButtonText}>Créer la session</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderJoinMode = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.title}>Rejoindre une session</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Code de session *</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, styles.codeInput, { flex: 1 }]}
            placeholder="ABC123"
            value={shareCode}
            onChangeText={(text) => setShareCode(text.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
          />
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { flex: 0, paddingHorizontal: 20 },
              (loading || shareCode.length !== 6) && styles.buttonDisabled,
            ]}
            onPress={handlePreviewSession}
            disabled={loading || shareCode.length !== 6}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.primaryButtonText}>Vérifier</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {sessionPreview && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="information-circle" size={24} color="#1E2A78" />
            <Text style={styles.previewTitle}>Informations de la session</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>Hôte:</Text>
            <Text style={styles.previewValue}>{sessionPreview.host_name}</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>Participants:</Text>
            <Text style={styles.previewValue}>
              {sessionPreview.participant_count} / {sessionPreview.max_participants}
            </Text>
          </View>
          {!sessionPreview.can_join && (
            <Text style={styles.warningText}>⚠️ Cette session est pleine ou verrouillée</Text>
          )}
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Votre nom *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Marie"
          value={guestName}
          onChangeText={setGuestName}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('choose')}>
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (loading || !sessionPreview || !sessionPreview.can_join) && styles.buttonDisabled,
          ]}
          onPress={handleJoinSession}
          disabled={loading || !sessionPreview || !sessionPreview.can_join}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : (
            <Text style={styles.primaryButtonText}>Rejoindre</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderPendingMode = () => (
    <View style={styles.pendingContainer}>
      <ActivityIndicator size="large" color="#1E2A78" />
      <Text style={styles.pendingTitle}>En attente d'approbation</Text>
      <Text style={styles.pendingSubtitle}>
        L'hôte de la session doit valider votre demande.{'\n'}
        Vous serez automatiquement redirigé une fois accepté.
      </Text>
      <View style={styles.pendingCodeBox}>
        <Text style={styles.pendingCodeLabel}>Code de session</Text>
        <Text style={styles.pendingCode}>{shareCode}</Text>
      </View>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => {
          setMode('choose');
          setPendingParticipantId(null);
          setPendingSession(null);
        }}
      >
        <Text style={styles.secondaryButtonText}>Annuler</Text>
      </TouchableOpacity>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Rendu principal
  // ---------------------------------------------------------------------------

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>

          {/* ── Alerte centralisée ── */}
          {alertState && (
            <Alert
              variant={alertState.variant}
              title={alertState.title}
              message={alertState.message}
              autoDismiss
              autoDismissDuration={4000}
              onDismiss={() => {
                dismissAlert();
                alertState.onDismiss?.();
              }}
            />
          )}

          {mode === 'choose'  && renderChooseMode()}
          {mode === 'create'  && renderCreateMode()}
          {mode === 'join'    && renderJoinMode()}
          {mode === 'pending' && renderPendingMode()}
        </View>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  modeContainer: {
    paddingVertical: 20,
  },
  formContainer: {
    paddingVertical: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E2A78',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
  },
  soloButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  soloButtonText: {
    fontSize: 16,
    color: '#999',
    textDecorationLine: 'underline',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  codeInput: {
    letterSpacing: 4,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  radioOption: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    backgroundColor: '#F8F9FA',
  },
  radioOptionActive: {
    borderColor: '#1E2A78',
    backgroundColor: '#E8EAF6',
  },
  radioText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  radioTextActive: {
    color: '#1E2A78',
  },
  radioDescription: {
    fontSize: 12,
    color: '#999',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#DDD',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#1E2A78',
    borderColor: '#1E2A78',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1E2A78',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  previewCard: {
    backgroundColor: '#F0F4FF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E2A78',
  },
  previewInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 14,
    color: '#666',
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  warningText: {
    fontSize: 14,
    color: '#D97706',
    marginTop: 8,
  },
  pendingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  pendingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginTop: 16,
    marginBottom: 8,
  },
  pendingSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  pendingCodeBox: {
    backgroundColor: '#F0F4FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  pendingCodeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  pendingCode: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E2A78',
    letterSpacing: 4,
  },
});