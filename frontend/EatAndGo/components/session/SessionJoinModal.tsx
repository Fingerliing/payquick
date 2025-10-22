import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collaborativeSessionService, CollaborativeSession } from '@/services/collaborativeSessionService';

interface SessionJoinModalProps {
  visible: boolean;
  onClose: () => void;
  restaurantId: number;
  tableNumber: string;
  tableId?: number;
  onSessionCreated?: (session: CollaborativeSession) => void;
  onSessionJoined?: (session: CollaborativeSession) => void;
}

export const SessionJoinModal: React.FC<SessionJoinModalProps> = ({
  visible,
  onClose,
  restaurantId,
  tableNumber,
  tableId,
  onSessionCreated,
  onSessionJoined,
}) => {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [loading, setLoading] = useState(false);
  const [existingSession, setExistingSession] = useState<CollaborativeSession | null>(null);

  // États pour créer une session
  const [hostName, setHostName] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('10');
  const [requireApproval, setRequireApproval] = useState(false);
  const [sessionType, setSessionType] = useState<'collaborative' | 'individual'>('collaborative');

  // États pour rejoindre une session
  const [shareCode, setShareCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [sessionPreview, setSessionPreview] = useState<CollaborativeSession | null>(null);

  useEffect(() => {
    if (visible) {
      checkExistingSession();
    }
  }, [visible, restaurantId, tableNumber]);

  const checkExistingSession = async () => {
    try {
      const session = await collaborativeSessionService.checkActiveSession(
        restaurantId,
        tableNumber
      );
      setExistingSession(session);
      
      if (session) {
        // S'il y a une session active, proposer de la rejoindre
        Alert.alert(
          'Session active détectée',
          `Une session existe déjà pour cette table (Code: ${session.share_code}). Voulez-vous la rejoindre ?`,
          [
            { text: 'Non, commander seul', onPress: () => onClose() },
            { 
              text: 'Rejoindre', 
              onPress: () => {
                setShareCode(session.share_code);
                setMode('join');
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error checking session:', error);
    }
  };

  const handleCreateSession = async () => {
    if (!hostName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer votre nom');
      return;
    }

    setLoading(true);
    try {
      const session = await collaborativeSessionService.createSession({
        restaurant_id: restaurantId,
        table_number: tableNumber,
        table_id: tableId,
        host_name: hostName,
        max_participants: parseInt(maxParticipants),
        require_approval: requireApproval,
        session_type: sessionType,
        split_payment_enabled: true,
      });

      Alert.alert(
        'Session créée !',
        `Partagez le code ${session.share_code} avec vos amis pour qu'ils rejoignent la session.`,
        [{ text: 'OK', onPress: () => {
          onSessionCreated?.(session);
          onClose();
        }}]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de créer la session');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewSession = async () => {
    if (shareCode.length !== 6) {
      Alert.alert('Erreur', 'Le code doit contenir 6 caractères');
      return;
    }

    setLoading(true);
    try {
      const session = await collaborativeSessionService.getSessionByCode(
        shareCode.toUpperCase()
      );
      setSessionPreview(session);
    } catch (error: any) {
      Alert.alert('Erreur', 'Code de session invalide');
      setSessionPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async () => {
    if (!guestName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer votre nom');
      return;
    }

    setLoading(true);
    try {
      const result = await collaborativeSessionService.joinSession({
        share_code: shareCode.toUpperCase(),
        guest_name: guestName,
      });

      const message = result.requires_approval
        ? 'Demande envoyée ! En attente de l\'approbation de l\'hôte.'
        : 'Vous avez rejoint la session avec succès !';

      Alert.alert('Succès', message, [
        { text: 'OK', onPress: () => {
          onSessionJoined?.(result.session);
          onClose();
        }}
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de rejoindre la session');
    } finally {
      setLoading(false);
    }
  };

  const renderChooseMode = () => (
    <View style={styles.modeContainer}>
      <Text style={styles.title}>Commander sur cette table</Text>
      <Text style={styles.subtitle}>
        Choisissez comment vous souhaitez commander
      </Text>

      <TouchableOpacity
        style={styles.optionCard}
        onPress={() => setMode('create')}
      >
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

      <TouchableOpacity
        style={styles.optionCard}
        onPress={() => setMode('join')}
      >
        <View style={styles.optionIcon}>
          <Ionicons name="enter" size={32} color="#1E2A78" />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>Rejoindre une session</Text>
          <Text style={styles.optionDescription}>
            Entrez le code partagé par votre groupe
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#666" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.soloButton}
        onPress={onClose}
      >
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
            style={[
              styles.radioOption,
              sessionType === 'collaborative' && styles.radioOptionActive
            ]}
            onPress={() => setSessionType('collaborative')}
          >
            <Text style={[
              styles.radioText,
              sessionType === 'collaborative' && styles.radioTextActive
            ]}>
              Collaborative
            </Text>
            <Text style={styles.radioDescription}>
              Tout le monde voit les commandes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.radioOption,
              sessionType === 'individual' && styles.radioOptionActive
            ]}
            onPress={() => setSessionType('individual')}
          >
            <Text style={[
              styles.radioText,
              sessionType === 'individual' && styles.radioTextActive
            ]}>
              Individuelle
            </Text>
            <Text style={styles.radioDescription}>
              Chacun commande séparément
            </Text>
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
        <Text style={styles.checkboxLabel}>
          Approuver manuellement les nouveaux participants
        </Text>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setMode('choose')}
        >
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleCreateSession}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
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
        <TextInput
          style={[styles.input, styles.codeInput]}
          placeholder="ABC123"
          value={shareCode}
          onChangeText={(text) => setShareCode(text.toUpperCase())}
          maxLength={6}
          autoCapitalize="characters"
          onBlur={handlePreviewSession}
        />
      </View>

      {sessionPreview && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="information-circle" size={24} color="#1E2A78" />
            <Text style={styles.previewTitle}>Aperçu de la session</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>Restaurant:</Text>
            <Text style={styles.previewValue}>{sessionPreview.restaurant_name}</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>Table:</Text>
            <Text style={styles.previewValue}>{sessionPreview.table_number}</Text>
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
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setMode('choose')}
        >
          <Text style={styles.secondaryButtonText}>Retour</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (loading || !sessionPreview || !sessionPreview.can_join) && styles.buttonDisabled
          ]}
          onPress={handleJoinSession}
          disabled={loading || !sessionPreview || !sessionPreview.can_join}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Rejoindre</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>

          {mode === 'choose' && renderChooseMode()}
          {mode === 'create' && renderCreateMode()}
          {mode === 'join' && renderJoinMode()}
        </View>
      </View>
    </Modal>
  );
};

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
    marginTop: 16,
    padding: 16,
    alignItems: 'center',
  },
  soloButtonText: {
    fontSize: 16,
    color: '#1E2A78',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  codeInput: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 4,
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  radioOptionActive: {
    borderColor: '#1E2A78',
    backgroundColor: '#E8EAF6',
  },
  radioText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  radioTextActive: {
    color: '#1E2A78',
  },
  radioDescription: {
    fontSize: 14,
    color: '#999',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#1E2A78',
    borderColor: '#1E2A78',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  previewCard: {
    backgroundColor: '#E8EAF6',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E2A78',
    marginLeft: 8,
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
    color: '#1E2A78',
  },
  warningText: {
    color: '#F44336',
    fontSize: 14,
    marginTop: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#1E2A78',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  secondaryButtonText: {
    color: '#1E2A78',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});