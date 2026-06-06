import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useTranslation } from 'react-i18next';

import {
  collaborativeSessionService,
  CollaborativeSession,
} from '@/services/collaborativeSessionService';
import { useSession } from '@/contexts/SessionContext';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';
import { Alert } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  type AppColors,
} from '@/utils/designSystem';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertState {
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  onDismiss?: () => void;
}

interface SessionJoinModalProps {
  visible: boolean;
  onClose: () => void;
  restaurantId: number;
  tableNumber: string;
  tableId?: number;
  activeSession?: CollaborativeSession | null;
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
  activeSession,
  onSessionCreated,
  onSessionJoined,
  onOrderAlone,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const {
    createSession: ctxCreateSession,
    joinSession: ctxJoinSession,
    activatePendingSession,
  } = useSession();

  const [loading, setLoading] = useState(false);
  const [existingSession, setExistingSession] = useState<CollaborativeSession | null>(
    activeSession ?? null,
  );
  const [mode, setMode] = useState<'choose' | 'create' | 'join' | 'pending'>('choose');
  const [pendingParticipantId, setPendingParticipantId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingSession, setPendingSession] = useState<CollaborativeSession | null>(null);

  const { on: onWsEvent } = useSessionWebSocket(
    mode === 'pending' ? pendingSessionId : null,
  );

  const approvalHandledRef = useRef(false);

  // Formulaire création
  const [hostName, setHostName] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('10');
  const [requireApproval, setRequireApproval] = useState(false);
  const [sessionType, setSessionType] = useState<'collaborative' | 'individual'>(
    'collaborative',
  );

  // Formulaire rejoindre
  const [shareCode, setShareCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [sessionPreview, setSessionPreview] = useState<CollaborativeSession | null>(null);

  // Alerte centralisée
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const showAlert = (state: AlertState) => setAlertState(state);
  const dismissAlert = () => setAlertState(null);

  // ---------------------------------------------------------------------------
  // Vérification session existante
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (visible) {
      if (activeSession !== undefined) {
        setExistingSession(activeSession ?? null);
      } else {
        checkExistingSession();
      }
    }
  }, [visible]);

  const checkExistingSession = async () => {
    try {
      const session = await collaborativeSessionService.checkActiveSession(
        restaurantId,
        tableNumber,
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
    } catch {
      showAlert({
        variant: 'error',
        title: t('common.error'),
        message: t('session.joinModal.feedback.soloError'),
      });
    }
  };

  const handleCreateSession = async () => {
    if (!hostName.trim()) {
      showAlert({
        variant: 'warning',
        title: t('session.joinModal.feedback.fieldRequired'),
        message: t('session.joinModal.feedback.nameRequiredHost'),
      });
      return;
    }

    setLoading(true);
    try {
      const session = await ctxCreateSession({
        restaurant_id: restaurantId,
        table_number: tableNumber,
        table_id: tableId,
        host_name: hostName,
        session_type: sessionType,
        max_participants: parseInt(maxParticipants, 10) || 10,
        require_approval: requireApproval,
      });

      showAlert({
        variant: 'success',
        title: t('session.joinModal.feedback.sessionCreated'),
        message: t('session.joinModal.feedback.sessionCreatedDesc', {
          code: session.share_code,
        }),
        onDismiss: () => {
          onSessionCreated?.(session);
          onClose();
        },
      });
    } catch (error: any) {
      showAlert({
        variant: 'error',
        title: t('common.error'),
        message: error.message || t('session.joinModal.feedback.sessionCreateError'),
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewSession = async () => {
    if (shareCode.length !== 6) {
      showAlert({
        variant: 'warning',
        title: t('session.joinModal.feedback.invalidCode'),
        message: t('session.joinModal.feedback.invalidCodeDesc'),
      });
      return;
    }

    setLoading(true);
    try {
      const session = await collaborativeSessionService.getSessionByCode(
        shareCode.toUpperCase(),
      );
      setSessionPreview(session);
    } catch {
      showAlert({
        variant: 'error',
        title: t('session.joinModal.feedback.codeNotFound'),
        message: t('session.joinModal.feedback.codeNotFoundDesc'),
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
        title: t('session.joinModal.feedback.fieldRequired'),
        message: t('session.joinModal.feedback.nameRequiredGuest'),
      });
      return;
    }

    setLoading(true);
    try {
      const result = await ctxJoinSession({
        share_code: shareCode.toUpperCase(),
        guest_name: guestName,
      });

      if (result.requires_approval) {
        setMode('pending');
        setPendingParticipantId(result.participant_id);
        setPendingSessionId(result.session.id);
        setPendingSession(result.session);
      } else {
        showAlert({
          variant: 'success',
          title: t('session.joinModal.feedback.welcome'),
          message: t('session.joinModal.feedback.welcomeDesc'),
          onDismiss: () => {
            onSessionJoined?.(result.session);
            onClose();
          },
        });
      }
    } catch (error: any) {
      showAlert({
        variant: 'error',
        title: t('common.error'),
        message: error.message || t('session.joinModal.feedback.joinError'),
      });
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Approbation WebSocket
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mode !== 'pending' || !pendingParticipantId || !pendingSessionId) return;

    approvalHandledRef.current = false;

    const unsubApproved = onWsEvent('participant_approved', async (participant: any) => {
      if (participant?.id !== pendingParticipantId) return;
      if (approvalHandledRef.current) return;
      approvalHandledRef.current = true;

      try {
        const session = await collaborativeSessionService.getSession(pendingSessionId);
        if (pendingParticipantId) {
          await activatePendingSession(session, pendingParticipantId);
        }
        showAlert({
          variant: 'success',
          title: t('session.joinModal.feedback.approved'),
          message: t('session.joinModal.feedback.approvedDesc'),
          onDismiss: () => {
            onSessionJoined?.(session);
            onClose();
          },
        });
      } catch {
        if (pendingSession && pendingParticipantId) {
          await activatePendingSession(pendingSession, pendingParticipantId);
          onSessionJoined?.(pendingSession);
          onClose();
        }
      }
    });

    const unsubUpdate = onWsEvent('session_update', (data: any) => {
      if (data?.event !== 'participant_removed') return;
      if (data?.data?.participant?.id !== pendingParticipantId) return;
      if (approvalHandledRef.current) return;
      approvalHandledRef.current = true;

      showAlert({
        variant: 'error',
        title: t('session.joinModal.feedback.rejected'),
        message: t('session.joinModal.feedback.rejectedDesc'),
        onDismiss: () => setMode('choose'),
      });
    });

    return () => {
      unsubApproved();
      unsubUpdate();
    };
  }, [mode, pendingParticipantId, pendingSessionId, onWsEvent]);

  // ---------------------------------------------------------------------------
  // Polling approbation (fallback)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (mode !== 'pending' || !pendingParticipantId || !pendingSessionId) return;

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
          if (pendingParticipantId) {
            await activatePendingSession(session, pendingParticipantId);
          }
          showAlert({
            variant: 'success',
            title: t('session.joinModal.feedback.approved'),
            message: t('session.joinModal.feedback.approvedDesc'),
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
            title: t('session.joinModal.feedback.rejected'),
            message: t('session.joinModal.feedback.rejectedDesc'),
            onDismiss: () => setMode('choose'),
          });
        }
      } catch {
        // ignore
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [mode, pendingParticipantId, pendingSessionId]);

  // ---------------------------------------------------------------------------
  // Render modes
  // ---------------------------------------------------------------------------

  const renderChooseMode = () => (
    <View style={styles.modeContainer}>
      <Text style={styles.title}>{t('session.joinModal.chooseTitle')}</Text>
      <Text style={styles.subtitle}>{t('session.joinModal.chooseSubtitle')}</Text>

      {existingSession && (
        <TouchableOpacity
          style={[styles.optionCard, styles.optionCardHighlight]}
          onPress={() => setMode('join')}
        >
          <View style={[styles.optionIcon, styles.optionIconHighlight]}>
            <Ionicons name="enter" size={32} color={styles.optionTitleHighlight.color as string} />
          </View>
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, styles.optionTitleHighlight]}>
              {t('session.joinModal.rejoinExisting.title')}
            </Text>
            <Text style={styles.optionDescription}>
              {t('session.joinModal.rejoinExisting.subtitle', {
                code: existingSession.share_code,
                count: existingSession.participant_count,
              })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={styles.optionTitleHighlight.color as string} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.optionCard} onPress={() => setMode('create')}>
        <View style={styles.optionIcon}>
          <Ionicons name="people" size={32} color={colors.primary} />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>
            {t('session.joinModal.createGroup.title')}
          </Text>
          <Text style={styles.optionDescription}>
            {t('session.joinModal.createGroup.description')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.text.secondary} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.optionCard} onPress={() => setMode('join')}>
        <View style={styles.optionIcon}>
          <Ionicons name="enter" size={32} color={colors.primary} />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>
            {t('session.joinModal.joinGroup.title')}
          </Text>
          <Text style={styles.optionDescription}>
            {t('session.joinModal.joinGroup.description')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color={colors.text.secondary} />
      </TouchableOpacity>

      <View style={styles.soloDivider}>
        <View style={styles.soloDividerLine} />
        <Text style={styles.soloDividerText}>{t('qrAccess.account.or')}</Text>
        <View style={styles.soloDividerLine} />
      </View>

      <TouchableOpacity style={styles.soloButton} onPress={handleOrderAlone} activeOpacity={0.8}>
        <Ionicons name="person" size={22} color={colors.primary} />
        <Text style={styles.soloButtonText}>{t('session.joinModal.orderAlone')}</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderCreateMode = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.title}>{t('session.joinModal.createTitle')}</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('session.joinModal.hostNameLabel')} *</Text>
        <TextInput
          style={styles.input}
          placeholder={t('session.joinModal.hostNamePlaceholder')}
          placeholderTextColor={colors.text.light}
          value={hostName}
          onChangeText={setHostName}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('session.joinModal.sessionTypeLabel')}</Text>
        <View style={styles.radioGroup}>
          <TouchableOpacity
            style={[
              styles.radioOption,
              sessionType === 'collaborative' && styles.radioOptionActive,
            ]}
            onPress={() => setSessionType('collaborative')}
          >
            <Text
              style={[
                styles.radioText,
                sessionType === 'collaborative' && styles.radioTextActive,
              ]}
            >
              {t('session.joinModal.sessionType.collaborative.title')}
            </Text>
            <Text style={styles.radioDescription}>
              {t('session.joinModal.sessionType.collaborative.desc')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.radioOption,
              sessionType === 'individual' && styles.radioOptionActive,
            ]}
            onPress={() => setSessionType('individual')}
          >
            <Text
              style={[
                styles.radioText,
                sessionType === 'individual' && styles.radioTextActive,
              ]}
            >
              {t('session.joinModal.sessionType.individual.title')}
            </Text>
            <Text style={styles.radioDescription}>
              {t('session.joinModal.sessionType.individual.desc')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('session.joinModal.maxParticipantsLabel')}</Text>
        <TextInput
          style={styles.input}
          placeholder="10"
          placeholderTextColor={colors.text.light}
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
          {requireApproval && <Ionicons name="checkmark" size={18} color={colors.text.inverse} />}
        </View>
        <Text style={styles.checkboxLabel}>
          {t('session.joinModal.requireApprovalLabel')}
        </Text>
      </TouchableOpacity>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('choose')}>
          <Text style={styles.secondaryButtonText}>{t('session.joinModal.back')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleCreateSession}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('session.joinModal.createCta')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderJoinMode = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.title}>{t('session.joinModal.joinTitle')}</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('session.joinModal.codeLabel')} *</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, styles.codeInput, { flex: 1 }]}
            placeholder={t('session.joinModal.codePlaceholder')}
            placeholderTextColor={colors.text.light}
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
            {loading ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('session.joinModal.verifyCta')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {sessionPreview && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Ionicons name="information-circle" size={24} color={colors.primary} />
            <Text style={styles.previewTitle}>{t('session.joinModal.previewTitle')}</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>{t('session.joinModal.previewHost')}</Text>
            <Text style={styles.previewValue}>{sessionPreview.host_name}</Text>
          </View>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>{t('session.joinModal.previewParticipants')}</Text>
            <Text style={styles.previewValue}>
              {sessionPreview.participant_count} / {sessionPreview.max_participants}
            </Text>
          </View>
          {!sessionPreview.can_join && (
            <Text style={styles.warningText}>
              {t('session.joinModal.sessionFullOrLocked')}
            </Text>
          )}
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t('session.joinModal.guestNameLabel')} *</Text>
        <TextInput
          style={styles.input}
          placeholder={t('session.joinModal.guestNamePlaceholder')}
          placeholderTextColor={colors.text.light}
          value={guestName}
          onChangeText={setGuestName}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('choose')}>
          <Text style={styles.secondaryButtonText}>{t('session.joinModal.back')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (loading || !sessionPreview || !sessionPreview.can_join) && styles.buttonDisabled,
          ]}
          onPress={handleJoinSession}
          disabled={loading || !sessionPreview || !sessionPreview.can_join}
        >
          {loading ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('session.joinModal.joinCta')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderPendingMode = () => (
    <View style={styles.pendingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.pendingTitle}>{t('session.pending.title')}</Text>
      <Text style={styles.pendingSubtitle}>
        {t('session.joinModal.pendingDescription')}
      </Text>
      <View style={styles.pendingCodeBox}>
        <Text style={styles.pendingCodeLabel}>{t('session.pending.codeLabel')}</Text>
        <Text style={styles.pendingCode}>{shareCode}</Text>
      </View>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => {
          setMode('choose');
          setPendingParticipantId(null);
          setPendingSessionId(null);
          setPendingSession(null);
        }}
      >
        <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
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
            <Ionicons name="close" size={28} color={colors.text.secondary} />
          </TouchableOpacity>

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

          {mode === 'choose' && renderChooseMode()}
          {mode === 'create' && renderCreateMode()}
          {mode === 'join' && renderJoinMode()}
          {mode === 'pending' && renderPendingMode()}
        </View>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Styles (fabrique theme-aware)
// ---------------------------------------------------------------------------

const makeStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);

  // Couleur verte pour la "session existante" — vert sombre stable qui se lit
  // dans les 2 modes (utilisé aussi dans index.tsx pour le bandeau session locale)
  const sessionGreen = isDark ? '#81C784' : '#2E7D32';
  const sessionGreenBg = isDark ? 'rgba(46, 125, 50, 0.15)' : '#F1F8E9';
  const sessionGreenBorder = isDark ? 'rgba(46, 125, 50, 0.4)' : '#A5D6A7';
  const sessionGreenIconBg = isDark ? 'rgba(46, 125, 50, 0.25)' : '#C8E6C9';

  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 40,
      maxHeight: '90%',
      // Touche or subtile en dark
      ...(isDark
        ? {
            borderTopWidth: 1,
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(212, 175, 55, 0.12)',
          }
        : {}),
    },
    closeButton: { alignSelf: 'flex-end', padding: 8 },
    modeContainer: { paddingVertical: 20 },
    formContainer: { paddingVertical: 20 },

    title: {
      fontSize: 24,
      fontWeight: 'bold',
      // Titre en or chaud en dark — cohérent avec le reste de la migration
      color: isDark ? colors.text.golden : colors.primary,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.text.secondary,
      marginBottom: 24,
    },

    // ── Option cards ───────────────────────────────────────────────────
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background : '#F8F9FA',
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    optionCardHighlight: {
      borderWidth: 2,
      borderColor: sessionGreenBorder,
      backgroundColor: sessionGreenBg,
    },
    optionIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#E8EAF6',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    optionIconHighlight: {
      backgroundColor: sessionGreenIconBg,
    },
    optionContent: { flex: 1 },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    optionTitleHighlight: {
      color: sessionGreen,
    },
    optionDescription: {
      fontSize: 14,
      color: colors.text.secondary,
    },

    // ── Solo divider + button ──────────────────────────────────────────
    soloDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 16,
    },
    soloDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border.light,
    },
    soloDividerText: {
      marginHorizontal: 12,
      fontSize: 14,
      color: colors.text.secondary,
    },
    soloButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#E8EAF6',
      borderWidth: 2,
      borderColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 20,
      gap: 10,
      marginBottom: 8,
    },
    soloButtonText: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.primary,
      flex: 1,
      textAlign: 'center',
    },

    // ── Form inputs ────────────────────────────────────────────────────
    inputGroup: { marginBottom: 16 },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text.primary,
      backgroundColor: colors.background,
    },
    codeInput: {
      letterSpacing: 4,
      textAlign: 'center',
      fontWeight: 'bold',
    },

    // ── Radio (session type) ───────────────────────────────────────────
    radioGroup: { flexDirection: 'row', gap: 12 },
    radioOption: {
      flex: 1,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.default,
      backgroundColor: colors.background,
    },
    radioOptionActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#E8EAF6',
    },
    radioText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 4,
    },
    radioTextActive: {
      color: colors.primary,
    },
    radioDescription: {
      fontSize: 12,
      color: colors.text.light,
    },

    // ── Checkbox ───────────────────────────────────────────────────────
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
      borderColor: colors.border.default,
      marginRight: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
    },

    // ── Buttons ────────────────────────────────────────────────────────
    buttonContainer: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
      marginBottom: 20,
    },
    primaryButton: {
      flex: 1,
      backgroundColor: colors.primary,
      padding: 14,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
    },
    primaryButtonText: {
      color: colors.text.inverse,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      flex: 1,
      padding: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      fontSize: 16,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    buttonDisabled: { opacity: 0.5 },

    // ── Preview card ───────────────────────────────────────────────────
    previewCard: {
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : '#F0F4FF',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
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
      color: colors.primary,
    },
    previewInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    previewLabel: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    previewValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    warningText: {
      fontSize: 14,
      color: colors.warning,
      marginTop: 8,
    },

    // ── Pending ────────────────────────────────────────────────────────
    pendingContainer: {
      paddingVertical: 32,
      alignItems: 'center',
    },
    pendingTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text.golden : colors.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    pendingSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    pendingCodeBox: {
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : '#F0F4FF',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 24,
      width: '100%',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
    },
    pendingCodeLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    pendingCode: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.primary,
      letterSpacing: 4,
    },
  });
};