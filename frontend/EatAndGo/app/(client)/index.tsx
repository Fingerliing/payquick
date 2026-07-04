import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StatusBar,
  Platform,
  useWindowDimensions,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { NotificationBadge } from '@/components/common/NotificationBadge';
import { HeaderActionsBar } from '@/components/common/HeaderActions';
import { Alert, AlertWithAction } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';
import type { CollaborativeSession } from '@/contexts/SessionContext';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';
import { useSessionArchiveCountdown, useInactivityWarning } from '@/hooks/session/useSessionArchiving';
import { SessionArchiveWarning } from '@/components/session/SessionArchiveWarning';
import { QRSessionUtils } from '@/utils/qrSessionUtils';

// =============================================================================
// CONSTANTES DESIGN
// =============================================================================
// Indigo "rejoindre session" — stable dans les 2 modes, joue un rôle d'accent
// neutre qui ne se confond ni avec le primary (navy/indigo selon thème) ni
// avec le secondary (or). Identifie visuellement les actions de socialisation.
const SESSION_INDIGO = '#6366F1';

// Vert très sombre du bandeau "session active" — bien lisible en light comme
// en dark, c'est notre indicateur visuel "vous êtes dans une session vivante".
const SESSION_ACTIVE_BG = '#0F4C2A';

// Format de prix simple — peut évoluer vers Intl.NumberFormat localisé
const formatPrice = (amount: number): string => `${Number(amount).toFixed(2)} €`;

// =============================================================================
// POLLER D'APPROBATION (inchangé sur le fond)
// =============================================================================

const PendingApprovalPoller: React.FC<{
  sessionId: string;
  participantId: string;
  onApproved: (session: CollaborativeSession) => void;
  onRejected: () => void;
}> = ({ sessionId, participantId, onApproved, onRejected }) => {
  const handledRef = useRef(false);
  const { on: onWsEvent } = useSessionWebSocket(sessionId);

  useEffect(() => {
    handledRef.current = false;

    const unsubApproved = onWsEvent('participant_approved', async (participant: any) => {
      if (participantId && participant?.id !== participantId) return;
      if (handledRef.current) return;
      handledRef.current = true;

      try {
        const session = await collaborativeSessionService.getSession(sessionId);
        onApproved(session);
      } catch {
        handledRef.current = false;
      }
    });

    const unsubUpdate = onWsEvent('session_update', (data: any) => {
      if (data?.event !== 'participant_removed') return;
      if (participantId && data?.data?.participant?.id !== participantId) return;
      if (handledRef.current) return;
      handledRef.current = true;
      onRejected();
    });

    return () => {
      unsubApproved();
      unsubUpdate();
    };
  }, [sessionId, participantId, onWsEvent, onApproved, onRejected]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (handledRef.current) {
        clearInterval(interval);
        return;
      }
      try {
        const session = await collaborativeSessionService.getSession(sessionId);
        const me = participantId
          ? session.participants?.find((p: any) => p.id === participantId)
          : session.participants?.find(
              (p: any) => !p.is_host && (p.status === 'active' || p.status === 'removed'),
            );

        if (me?.status === 'active') {
          if (handledRef.current) return;
          handledRef.current = true;
          clearInterval(interval);
          onApproved(session);
        } else if (me?.status === 'removed') {
          if (handledRef.current) return;
          handledRef.current = true;
          clearInterval(interval);
          onRejected();
        }
      } catch {
        /* ignore */
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [sessionId, participantId, onApproved, onRejected]);

  return null;
};

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function ClientHome() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  const { user } = useAuth();
  const {
    session,
    participantId,
    isHost,
    isSessionInitialized,
    leaveSession,
    clearSession,
    refreshSession,
    joinSession,
    activatePendingSession,
  } = useSession();
  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [isExiting, setIsExiting] = useState(false);

  const [serverSession, setServerSession] = useState<CollaborativeSession | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);

  const [exitAlertVisible, setExitAlertVisible] = useState(false);
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isJoiningByCode, setIsJoiningByCode] = useState(false);
  const codeInputRef = useRef<TextInput>(null);

  const [pendingApproval, setPendingApproval] = useState<{
    sessionId: string;
    participantId: string;
    session: CollaborativeSession;
  } | null>(null);
  const [pendingModalVisible, setPendingModalVisible] = useState(false);

  const hasActiveSession =
    isSessionInitialized &&
    session !== null &&
    ['active', 'locked'].includes(session.status);

  const hasCompletedSession =
    isSessionInitialized && session !== null && session.status === 'completed';

  // ─ Auto-clear sessions terminées
  useEffect(() => {
    if (session && ['completed', 'cancelled', 'payment'].includes(session.status)) {
      clearSession();
    }
  }, [session?.status, clearSession]);

  const { isArchived: isSessionArchived, timeUntilArchive } = useSessionArchiveCountdown(
    session?.id ?? null,
  );

  const { on: onSessionWs } = useSessionWebSocket(session?.id ?? null);

  useEffect(() => {
    if (!session?.id) return;
    const unsubCompleted = onSessionWs('session_completed', () => clearSession());
    const unsubArchived = onSessionWs('session_archived', () => clearSession());
    return () => {
      unsubCompleted();
      unsubArchived();
    };
  }, [session?.id, onSessionWs, clearSession]);

  const { showInactivityWarning, inactivityFormattedTime } = useInactivityWarning(
    hasActiveSession ? session?.id ?? null : null,
  );

  useEffect(() => {
    if (isSessionArchived) clearSession();
  }, [isSessionArchived, clearSession]);

  useEffect(() => {
    if (timeUntilArchive !== null && timeUntilArchive <= 0) clearSession();
  }, [timeUntilArchive, clearSession]);

  const refreshSessionRef = useRef(refreshSession);
  refreshSessionRef.current = refreshSession;
  const clearSessionRef = useRef(clearSession);
  clearSessionRef.current = clearSession;

  useFocusEffect(
    React.useCallback(() => {
      if (isSessionInitialized && session) {
        collaborativeSessionService
          .getSession(session.id)
          .then((serverSession) => {
            if (['completed', 'cancelled', 'payment'].includes(serverSession.status)) {
              clearSessionRef.current();
            } else {
              refreshSessionRef.current().catch(() => {});
            }
          })
          .catch((error: any) => {
            const status = error?.status ?? error?.response?.status;
            if (status === 404) clearSessionRef.current();
          });
      }

      if (isSessionInitialized && !session && user) {
        checkServerForActiveSession();
      }
    }, [isSessionInitialized, session?.id ?? null, user?.id ?? null]),
  );

  const checkServerForActiveSession = async () => {
    setIsCheckingServer(true);
    try {
      const sessions = await collaborativeSessionService.getMyActiveSessions();
      const INACTIVITY_THRESHOLD_MS = 15 * 60 * 1000;
      const now = Date.now();

      const active = sessions?.find((s: CollaborativeSession) => {
        if (!['active', 'locked'].includes(s.status)) return false;
        const lastActivity = s.updated_at ?? s.created_at;
        if (lastActivity) {
          const age = now - new Date(lastActivity).getTime();
          if (age > INACTIVITY_THRESHOLD_MS) return false;
        }
        return true;
      });
      setServerSession(active ?? null);
    } catch {
      setServerSession(null);
    } finally {
      setIsCheckingServer(false);
    }
  };

  const handleResumeSession = () => {
    if (!session) return;
    router.push({
      pathname: `/menu/client/${session.restaurant}` as any,
      params: {
        restaurantId: session.restaurant.toString(),
        tableNumber: session.table_number,
        sessionId: session.id,
        code: session.share_code,
      },
    });
  };

  const handleRejoinServerSession = async () => {
    if (!serverSession) return;
    setRejoinError(null);
    setIsRejoining(true);
    try {
      const result = await joinSession({ share_code: serverSession.share_code });
      setServerSession(null);

      if (result.requires_approval) {
        setPendingApproval({
          sessionId: result.session.id,
          participantId: result.participant_id ?? (result as any).participantId,
          session: result.session,
        });
        setPendingModalVisible(true);
        return;
      }

      router.push({
        pathname: `/menu/client/${serverSession.restaurant}` as any,
        params: {
          restaurantId: serverSession.restaurant.toString(),
          tableNumber: serverSession.table_number,
          sessionId: serverSession.id,
          code: serverSession.share_code,
        },
      });
    } catch (error: any) {
      setServerSession(null);
      setRejoinError(error?.message ?? t('session.errors.maybeGone'));
    } finally {
      setIsRejoining(false);
    }
  };

  const handleDismissServerSession = async () => {
    if (!serverSession) {
      setServerSession(null);
      setRejoinError(null);
      return;
    }

    setIsRejoining(true);
    try {
      const result = await joinSession({ share_code: serverSession.share_code });
      if (!result.requires_approval) {
        await leaveSession();
      }
    } catch (error) {
      console.warn('[ClientHome] Dismiss server session error, forcing clear:', error);
      await clearSession();
    } finally {
      setServerSession(null);
      setRejoinError(null);
      setIsRejoining(false);
    }
  };

  const handleExitSession = () => {
    if (!session) return;
    setExitAlertVisible(true);
  };

  const handleConfirmExit = async () => {
    if (!session) return;
    setExitAlertVisible(false);
    setIsExiting(true);
    try {
      if (isHost) {
        await collaborativeSessionService.sessionAction(session.id, 'cancel');
        await clearSession();
      } else {
        await leaveSession();
      }
    } catch (error) {
      console.warn('[ClientHome] Exit error, forcing local clear:', error);
      await clearSession();
    } finally {
      setIsExiting(false);
    }
  };

  const handleOpenCodeModal = () => {
    setShareCode('');
    setCodeError(null);
    setCodeModalVisible(true);
    setTimeout(() => codeInputRef.current?.focus(), 200);
  };

  const handleCloseCodeModal = () => {
    Keyboard.dismiss();
    setCodeModalVisible(false);
    setShareCode('');
    setCodeError(null);
  };

  const handleJoinByCode = async () => {
    const trimmed = shareCode.trim().toUpperCase();
    if (!trimmed) {
      setCodeError(t('session.errors.emptyCode'));
      return;
    }
    setCodeError(null);
    setIsJoiningByCode(true);
    try {
      const found = await collaborativeSessionService.getSessionByCode(trimmed);
      if (!found) {
        setCodeError(t('session.errors.notFound'));
        return;
      }
      if (!['active', 'locked'].includes(found.status)) {
        setCodeError(t('session.errors.inactive'));
        return;
      }

      const result = await joinSession({ share_code: trimmed });
      handleCloseCodeModal();

      if (result.requires_approval) {
        setPendingApproval({
          sessionId: result.session.id,
          participantId: result.participant_id ?? (result as any).participantId,
          session: result.session,
        });
        setPendingModalVisible(true);
        return;
      }

      await QRSessionUtils.saveSession({
        restaurantId: found.restaurant.toString(),
        restaurantName: found.restaurant_name,
        tableNumber: found.table_number,
        originalCode: trimmed,
        timestamp: Date.now(),
      });

      router.push({
        pathname: `/menu/client/${found.restaurant}` as any,
        params: {
          restaurantId: found.restaurant.toString(),
          tableNumber: found.table_number,
          sessionId: found.id,
          code: trimmed,
        },
      });
    } catch (error: any) {
      const details = error?.response?.data?.details?.share_code?.[0];
      const detail = error?.response?.data?.detail;
      const msg = details ?? detail ?? error?.message;
      const isNotFound =
        msg?.toLowerCase().includes('invalide') || msg?.toLowerCase().includes('invalid');
      setCodeError(
        isNotFound
          ? t('session.errors.invalidCode')
          : msg ?? t('session.errors.joinFailed'),
      );
    } finally {
      setIsJoiningByCode(false);
    }
  };

  const handleApproved = useCallback(
    (approvedSession: CollaborativeSession) => {
      setPendingModalVisible(false);
      const pending = pendingApproval;
      setPendingApproval(null);
      if (!pending) return;

      activatePendingSession(approvedSession, pending.participantId);

      router.push({
        pathname: `/menu/client/${approvedSession.restaurant}` as any,
        params: {
          restaurantId: approvedSession.restaurant.toString(),
          tableNumber: approvedSession.table_number,
          sessionId: approvedSession.id,
          code: approvedSession.share_code,
        },
      });
    },
    [pendingApproval, activatePendingSession],
  );

  const handleRejected = useCallback(() => {
    setPendingModalVisible(false);
    setPendingApproval(null);
    setRejoinError(t('session.errors.rejected'));
  }, [t]);

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════

  const layoutConfig = useMemo(
    () => ({
      containerPadding: getResponsiveValue(SPACING.container, screenType),
      contentMaxWidth:
        screenType === 'desktop' ? 700 : screenType === 'tablet' ? 600 : undefined,
      shouldUseGrid: (screenType === 'tablet' && width > 900) || screenType === 'desktop',
    }),
    [screenType, width],
  );

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES — mémoizés avec deps explicites sur [colors, isDark, ...]
  // pour que React détecte le changement de thème et propage aux enfants.
  // Sans useMemo, les Pressable avec callback style={({ pressed }) => ...}
  // peuvent garder leur ancien rendu (optimisation interne RN).
  // ═══════════════════════════════════════════════════════════════════════

  const viewStyles = useMemo(() => ({
    container: { flex: 1, backgroundColor: colors.background },

    scrollContainer: {
      flexGrow: 1,
      paddingTop: insets.top,
      paddingBottom: Math.max(insets.bottom, 20),
    },

    headerRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.md, screenType),
    },

    headerPlaceholder: { width: 44 },

    notificationBadgeContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.full,
      padding: getResponsiveValue(SPACING.xs, screenType),
      ...shadows.sm,
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    header: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      paddingBottom: getResponsiveValue(SPACING.lg, screenType),
      alignItems: 'center' as const,
      maxWidth: layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    decorativeBadge: {
      position: 'absolute' as const,
      top: getResponsiveValue({ mobile: -8, tablet: -10, desktop: -12 }, screenType),
      right: getResponsiveValue({ mobile: -8, tablet: -10, desktop: -12 }, screenType),
      width: getResponsiveValue({ mobile: 60, tablet: 70, desktop: 80 }, screenType),
      height: getResponsiveValue({ mobile: 60, tablet: 70, desktop: 80 }, screenType),
      borderRadius: 999,
      backgroundColor: colors.variants.secondary[50],
      opacity: isDark ? 0.25 : 0.4,
    },

    titleContainer: {
      position: 'relative' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    // ── BANDEAU SESSION LOCALE (vert vif — identitaire, stable) ─────────
    sessionBannerWrapper: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      maxWidth: layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    sessionBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: SESSION_ACTIVE_BG,
      borderRadius: BORDER_RADIUS.xl,
      paddingVertical: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      paddingLeft: getResponsiveValue(SPACING.lg, screenType),
      paddingRight: 8,
      borderWidth: 1.5,
      borderColor: colors.success + '60',
      ...shadows.md,
      overflow: 'hidden' as const,
    },

    sessionBannerPulse: {
      position: 'absolute' as const,
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: colors.success,
      opacity: 0.06,
      borderRadius: BORDER_RADIUS.xl,
    },

    sessionBannerIconContainer: {
      width: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      height: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      borderRadius: 99,
      backgroundColor: colors.success + '25',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: colors.success + '40',
      flexShrink: 0,
    },

    sessionBannerTextContainer: { flex: 1 },

    sessionBannerActions: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginLeft: 8,
      flexShrink: 0,
    },

    sessionBannerContinueBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.success + '30',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    sessionBannerExitBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255,80,80,0.15)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    sessionBannerSkeleton: {
      height: getResponsiveValue({ mobile: 68, tablet: 78, desktop: 86 }, screenType),
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.surface,
      marginHorizontal: layoutConfig.containerPadding,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      maxWidth: layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    // ── BANDEAU SESSION RETROUVÉE (navy + or — identitaire, theme-aware) ─
    serverSessionBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      // En light, on garde le navy profond du logo pour le contraste premium.
      // En dark, on s'aligne sur le surface du thème (navy quasi-noir).
      backgroundColor: isDark ? colors.surface : '#1A2E4A',
      borderRadius: BORDER_RADIUS.xl,
      paddingVertical: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      paddingLeft: getResponsiveValue(SPACING.lg, screenType),
      paddingRight: 8,
      borderWidth: 1.5,
      borderColor: colors.secondary + '60',
      ...shadows.md,
      overflow: 'hidden' as const,
    },

    serverSessionPulse: {
      position: 'absolute' as const,
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: colors.secondary,
      opacity: 0.05,
      borderRadius: BORDER_RADIUS.xl,
    },

    serverSessionIconContainer: {
      width: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      height: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      borderRadius: 99,
      backgroundColor: colors.secondary + '25',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: colors.secondary + '40',
      flexShrink: 0,
    },

    serverSessionRejoinBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.secondary + '30',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    serverSessionDismissBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    // ── MODAL REJOINDRE PAR CODE ─────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' as const,
    },

    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: Math.max(insets.bottom + 16, 32),
      ...shadows.lg,
    },

    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.default,
      alignSelf: 'center' as const,
      marginBottom: 20,
    },

    modalTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '700' as const,
      color: colors.text.primary,
      marginBottom: 6,
    },

    modalSubtitle: {
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      color: colors.text.secondary,
      marginBottom: 24,
      lineHeight: 20,
    },

    codeInputWrapper: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      borderColor: colors.border.light,
      paddingHorizontal: 16,
      marginBottom: 8,
    },

    codeInputWrapperFocused: {
      borderColor: colors.primary,
    },

    codeInput: {
      flex: 1,
      height: 52,
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '700' as const,
      color: colors.text.primary,
      letterSpacing: 3,
      paddingLeft: 8,
    },

    codeError: {
      fontSize: 13,
      color: colors.error,
      marginBottom: 16,
      marginLeft: 4,
    },

    joinButton: {
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.lg,
      height: 52,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginTop: 8,
      ...shadows.sm,
    },

    joinButtonDisabled: { opacity: 0.6 },

    pendingModalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: Math.max(insets.bottom + 16, 32),
      alignItems: 'center' as const,
      ...shadows.lg,
    },

    pendingCodeBox: {
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderWidth: 1.5,
      borderColor: colors.border.light,
      alignItems: 'center' as const,
      marginTop: 24,
      marginBottom: 8,
    },

    content: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      maxWidth: layoutConfig.shouldUseGrid ? 1200 : layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    qrSection: {
      marginBottom: getResponsiveValue(
        { mobile: SPACING['2xl'].mobile, tablet: SPACING.xl.tablet, desktop: SPACING['2xl'].desktop },
        screenType,
      ),
    },

    quickActions: { flex: layoutConfig.shouldUseGrid ? 1 : undefined },

    sectionTitle: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    sectionTitleLine: {
      flex: 1,
      height: 2,
      backgroundColor: colors.border.golden,
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
      opacity: isDark ? 0.5 : 0.3,
    },

    quickActionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      backgroundColor: colors.surface,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.xl,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      minHeight: getResponsiveValue({ mobile: 70, tablet: 84, desktop: 96 }, screenType),
      borderWidth: 1.5,
      borderColor: colors.border.light,
      ...shadows.md,
      overflow: 'hidden' as const,
    },

    quickActionGradient: {
      position: 'absolute' as const,
      top: 0, right: 0,
      width: '40%' as const,
      height: '100%' as const,
      opacity: 0.05,
    },

    quickActionIconContainer: {
      width: getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType),
      height: getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
    },

    quickActionContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
    },

    quickActionTextContainer: { flex: 1 },

    chevronContainer: {
      width: getResponsiveValue({ mobile: 28, tablet: 32, desktop: 36 }, screenType),
      height: getResponsiveValue({ mobile: 28, tablet: 32, desktop: 36 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      backgroundColor: colors.background,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    gridLayout: {
      flexDirection: layoutConfig.shouldUseGrid ? 'row' as const : 'column' as const,
      gap: layoutConfig.shouldUseGrid
        ? getResponsiveValue({ mobile: SPACING.xl.mobile, tablet: SPACING['2xl'].tablet, desktop: SPACING['3xl'].desktop }, screenType)
        : 0,
      alignItems: layoutConfig.shouldUseGrid ? 'flex-start' as const : 'stretch' as const,
    },

    gridColumn: {
      flex: 1,
      minWidth: layoutConfig.shouldUseGrid ? '45%' as const : undefined,
      maxWidth: layoutConfig.shouldUseGrid ? '50%' as const : undefined,
    },

    welcomeCard: {
      backgroundColor: colors.goldenSurface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderWidth: 1,
      borderColor: colors.border.golden,
      marginBottom: getResponsiveValue(
        { mobile: SPACING.lg.mobile, tablet: SPACING.xl.tablet, desktop: SPACING.xl.desktop },
        screenType,
      ),
      ...shadows.sm,
      maxWidth: screenType === 'tablet' ? 500 : undefined,
      alignSelf: 'center' as const,
      width: screenType === 'tablet' ? '100%' as const : undefined,
    },

    // ── Session terminée (vert clair en light, vert sombre teinté en dark) ─
    completedSessionCard: {
      backgroundColor: isDark ? 'rgba(46, 125, 50, 0.12)' : '#F1F8E9',
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(46, 125, 50, 0.35)' : '#A5D6A7',
      padding: getResponsiveValue(SPACING.lg, screenType),
      ...shadows.sm,
    },
    completedSessionHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginBottom: 12,
    },
    completedParticipantRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 4,
    },
    completedSessionFooter: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(46, 125, 50, 0.25)' : '#C8E6C9',
    },
    completedSessionCloseBtn: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.md,
    },
  }), [colors, isDark, layoutConfig, shadows, insets.top, insets.bottom, screenType]);

  // Couleur du titre "Session terminée" — vert qui ressort dans les 2 modes
  const SESSION_COMPLETED_GREEN = isDark ? '#81C784' : '#2E7D32';

  const textStyles = useMemo(() => ({
    logo: {
      fontSize: getResponsiveValue({ mobile: 32, tablet: 40, desktop: 48 }, screenType),
      color: colors.primary,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
      textAlign: 'center' as const,
    },
    logoAccent: { color: colors.secondary },
    subtitle: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      color: colors.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
      fontWeight: '400' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    welcome: {
      fontSize: getResponsiveValue({ mobile: 15, tablet: 17, desktop: 19 }, screenType),
      color: colors.text.primary,
      textAlign: 'center' as const,
      fontWeight: '600' as const,
    },
    welcomeSubtext: {
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      color: colors.text.secondary,
      textAlign: 'center' as const,
      marginTop: 4,
    },
    quickActionsTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 22, desktop: 26 }, screenType),
      fontWeight: '700' as const,
      // Titre de section en or chaud en dark (consistent avec profile.tsx)
      color: isDark ? colors.text.golden : colors.text.primary,
    },
    quickActionButtonText: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      color: colors.text.primary,
      fontWeight: '600' as const,
      marginBottom: 2,
    },
    quickActionSubtext: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: colors.text.secondary,
      fontWeight: '400' as const,
    },
    sessionBannerTitle: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '700' as const,
      color: '#FFFFFF',
      marginBottom: 2,
    },
    sessionBannerMeta: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 12, desktop: 13 }, screenType),
      color: colors.success,
      fontWeight: '500' as const,
    },
    sessionBannerCta: {
      fontSize: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
      color: 'rgba(255,255,255,0.45)',
      marginTop: 2,
    },
    serverBannerMeta: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 12, desktop: 13 }, screenType),
      color: colors.secondary,
      fontWeight: '500' as const,
    },
    serverBannerCta: {
      fontSize: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
      color: 'rgba(255,255,255,0.45)',
      marginTop: 2,
    },
    completedSessionTitle: {
      fontSize: getResponsiveValue({ mobile: 15, tablet: 16, desktop: 17 }, screenType),
      fontWeight: '700' as const,
      color: SESSION_COMPLETED_GREEN,
      flex: 1,
    },
    completedSessionTable: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 13 }, screenType),
      color: colors.text.secondary,
    },
    completedSessionSubtitle: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 13 }, screenType),
      fontWeight: '600' as const,
      color: colors.text.secondary,
      marginBottom: 8,
    },
    completedParticipantName: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 15 }, screenType),
      color: colors.text.primary,
    },
    completedParticipantAmount: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 15 }, screenType),
      fontWeight: '600' as const,
      color: colors.primary,
    },
    completedSessionTotal: {
      fontSize: getResponsiveValue({ mobile: 15, tablet: 16, desktop: 16 }, screenType),
      fontWeight: '700' as const,
      color: colors.primary,
    },
    completedSessionCloseBtnText: {
      color: colors.text.inverse,
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 14 }, screenType),
      fontWeight: '600' as const,
    },
    modalJoinBtn: {
      fontSize: getResponsiveValue({ mobile: 15, tablet: 16, desktop: 17 }, screenType),
      fontWeight: '700' as const,
      color: colors.text.inverse,
    },
  }), [colors, isDark, screenType, SESSION_COMPLETED_GREEN]);

  const iconSize = getResponsiveValue({ mobile: 26, tablet: 30, desktop: 34 }, screenType);
  const chevronSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);
  const notificationIconSize = getResponsiveValue({ mobile: 24, tablet: 26, desktop: 28 }, screenType);
  const sessionIconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 26 }, screenType);

  // Labels de statut de session (i18n)
  const statusLabel: Record<string, string> = {
    active: t('session.status.active'),
    locked: t('session.status.locked'),
    payment: t('session.status.payment'),
  };

  // En dark, on adapte les iconBg des actions rapides : les pastels clairs
  // (#ECFDF5, etc.) deviennent des fonds sombres teintés de la couleur de
  // l'accent pour rester cohérents avec le thème.
  // Mémoizé pour propager les changements de thème aux Pressable enfants.
  const quickActions = useMemo(() => [
    ...(!hasActiveSession && !hasCompletedSession && !serverSession
      ? [{
          id: 'join-session',
          icon: 'people-outline',
          title: t('home.actions.joinSession.title'),
          subtitle: t('home.actions.joinSession.subtitle'),
          route: null,
          iconBg: isDark ? 'rgba(99, 102, 241, 0.18)' : '#EEF2FF',
          iconColor: SESSION_INDIGO,
          onPress: handleOpenCodeModal,
        }]
      : []),
    {
      id: 'restaurants',
      icon: 'restaurant-outline',
      title: t('home.actions.discoverRestaurants.title', 'Restaurants partenaires'),
      subtitle: t('home.actions.discoverRestaurants.subtitle', 'Parcourez et trouvez autour de vous'),
      route: '/restaurant/directory',
      iconBg: isDark ? 'rgba(30, 42, 120, 0.18)' : colors.variants.primary[50],
      iconColor: colors.primary,
      onPress: () => router.push('/restaurant/directory' as any),
    },
    {
      id: 'orders',
      icon: 'receipt-outline',
      title: t('home.actions.myOrders.title'),
      subtitle: t('home.actions.myOrders.subtitle'),
      route: '/(client)/orders',
      iconBg: isDark ? 'rgba(212, 175, 55, 0.15)' : colors.variants.secondary[50],
      iconColor: colors.secondary,
      onPress: () => router.push('/(client)/orders' as any),
    },
    {
      id: 'cart',
      icon: 'bag-outline',
      title: t('home.actions.myCart.title'),
      subtitle: t('home.actions.myCart.subtitle'),
      route: '/(client)/cart',
      iconBg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
      iconColor: colors.success,
      onPress: () => router.push('/(client)/cart' as any),
    },
  ], [colors, isDark, t, hasActiveSession, hasCompletedSession, serverSession]);

  // ═══════════════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <View style={viewStyles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
        translucent={false}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={viewStyles.scrollContainer}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* Header actions : langue + thème + notifications */}
        <View style={viewStyles.headerRow}>
          <View style={viewStyles.headerPlaceholder} />
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <HeaderActionsBar />
            <View style={viewStyles.notificationBadgeContainer}>
              <NotificationBadge size={notificationIconSize} color={colors.primary} />
            </View>
          </View>
        </View>

        <View style={viewStyles.header}>
          <View style={viewStyles.titleContainer}>
            <View style={viewStyles.decorativeBadge} />
            <Text style={textStyles.logo}>
              Eat<Text style={textStyles.logoAccent}></Text>QuickeR
            </Text>
            <Text style={textStyles.subtitle}>{t('home.subtitle')}</Text>
          </View>

          {user && (
            <View style={viewStyles.welcomeCard}>
              <Text style={textStyles.welcome}>
                {t('home.welcome', { name: user.first_name || user.username })}
              </Text>
              <Text style={textStyles.welcomeSubtext}>
                {t('home.welcomeSubtext')}
              </Text>
            </View>
          )}
        </View>

        {/* Skeleton pendant init */}
        {!isSessionInitialized && (
          <View style={viewStyles.sessionBannerSkeleton}>
            <ActivityIndicator size="small" color={colors.text.light} />
          </View>
        )}

        {/* 1️⃣  Session locale active */}
        {hasActiveSession && session && (
          <View style={viewStyles.sessionBannerWrapper}>
            <View style={viewStyles.sessionBanner}>
              <View style={viewStyles.sessionBannerPulse} />

              <View style={viewStyles.sessionBannerIconContainer}>
                {isExiting ? (
                  <ActivityIndicator size="small" color={colors.success} />
                ) : (
                  <Ionicons name="people" size={sessionIconSize} color={colors.success} />
                )}
              </View>

              <Pressable
                style={viewStyles.sessionBannerTextContainer}
                onPress={handleResumeSession}
                disabled={isExiting}
              >
                <Text style={textStyles.sessionBannerTitle} numberOfLines={1}>
                  {t('session.tableLabel', {
                    name: session.restaurant_name,
                    table: session.table_number,
                  })}
                </Text>
                <Text style={textStyles.sessionBannerMeta}>
                  ● {statusLabel[session.status] ?? session.status}
                  {'  '}·{'  '}
                  {t('session.participants', { count: session.participant_count })}
                </Text>
                <Text style={textStyles.sessionBannerCta}>{t('session.bannerCta')}</Text>
              </Pressable>

              <View style={viewStyles.sessionBannerActions}>
                <Pressable
                  style={viewStyles.sessionBannerContinueBtn}
                  onPress={handleResumeSession}
                  disabled={isExiting}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.success} />
                </Pressable>
                <Pressable
                  style={viewStyles.sessionBannerExitBtn}
                  onPress={handleExitSession}
                  disabled={isExiting}
                >
                  <Ionicons
                    name={isHost ? 'close-circle-outline' : 'exit-outline'}
                    size={16}
                    color="#FF6B6B"
                  />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Avertissement inactivité */}
        {hasActiveSession && showInactivityWarning && inactivityFormattedTime && (
          <View style={viewStyles.sessionBannerWrapper}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FF9800',
                borderRadius: BORDER_RADIUS.lg,
                paddingVertical: 10,
                paddingHorizontal: 16,
                gap: 8,
              }}
            >
              <Ionicons name="time-outline" size={18} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '600' }}>
                {t('session.inactivityWarning', { time: inactivityFormattedTime })}
              </Text>
            </View>
          </View>
        )}

        {/* 2️⃣  Session retrouvée serveur */}
        {!hasActiveSession && serverSession && (
          <View style={viewStyles.sessionBannerWrapper}>
            <View style={viewStyles.serverSessionBanner}>
              <View style={viewStyles.serverSessionPulse} />

              <View style={viewStyles.serverSessionIconContainer}>
                {isRejoining ? (
                  <ActivityIndicator size="small" color={colors.secondary} />
                ) : (
                  <Ionicons name="refresh-circle-outline" size={sessionIconSize} color={colors.secondary} />
                )}
              </View>

              <Pressable
                style={viewStyles.sessionBannerTextContainer}
                onPress={handleRejoinServerSession}
                disabled={isRejoining}
              >
                <Text style={textStyles.sessionBannerTitle} numberOfLines={1}>
                  {t('session.tableLabel', {
                    name: serverSession.restaurant_name,
                    table: serverSession.table_number,
                  })}
                </Text>
                <Text style={textStyles.serverBannerMeta}>
                  ● {t('session.foundLabel')}
                  {'  '}·{'  '}
                  {t('session.participants', { count: serverSession.participant_count })}
                </Text>
                <Text style={textStyles.serverBannerCta}>{t('session.foundCta')}</Text>
              </Pressable>

              <View style={viewStyles.sessionBannerActions}>
                <Pressable
                  style={viewStyles.serverSessionRejoinBtn}
                  onPress={handleRejoinServerSession}
                  disabled={isRejoining}
                >
                  <Ionicons name="arrow-forward" size={16} color={colors.secondary} />
                </Pressable>
                <Pressable
                  style={viewStyles.serverSessionDismissBtn}
                  onPress={handleDismissServerSession}
                  disabled={isRejoining}
                >
                  {isRejoining ? (
                    <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                  ) : (
                    <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* 3️⃣  Alerte erreur rejoindre */}
        {rejoinError && (
          <View style={viewStyles.sessionBannerWrapper}>
            <Alert
              variant="error"
              title={t('session.errors.joinTitle')}
              message={rejoinError}
              autoDismiss
              autoDismissDuration={5000}
              onDismiss={() => setRejoinError(null)}
            />
          </View>
        )}

        {/* 4️⃣  Confirmation quitter / terminer */}
        {exitAlertVisible && session && (
          <View style={viewStyles.sessionBannerWrapper}>
            <AlertWithAction
              variant={isHost ? 'warning' : 'info'}
              title={isHost ? t('session.exit.titleHost') : t('session.exit.titleMember')}
              message={isHost ? t('session.exit.messageHost') : t('session.exit.messageMember')}
              autoDismiss={false}
              primaryButton={{
                text: isHost ? t('session.exit.ctaHost') : t('session.exit.ctaMember'),
                variant: 'danger',
                onPress: handleConfirmExit,
              }}
              secondaryButton={{
                text: t('common.cancel'),
                onPress: () => setExitAlertVisible(false),
              }}
            />
          </View>
        )}

        {/* 5️⃣  Session terminée */}
        {hasCompletedSession && session && (
          <View style={viewStyles.sessionBannerWrapper}>
            <View style={viewStyles.completedSessionCard}>
              <SessionArchiveWarning sessionId={session.id} />

              <View style={viewStyles.completedSessionHeader}>
                <Ionicons name="checkmark-circle" size={20} color={SESSION_COMPLETED_GREEN} />
                <Text style={textStyles.completedSessionTitle}>{t('session.completed.title')}</Text>
                <Text style={textStyles.completedSessionTable}>
                  {t('session.tableLabel', {
                    name: session.restaurant_name,
                    table: session.table_number,
                  })}
                </Text>
              </View>

              <Text style={textStyles.completedSessionSubtitle}>
                {t('session.completed.participantsLabel', {
                  count: session.participants?.filter((p) => p.status === 'active').length ?? 0,
                })}
              </Text>
              {session.participants
                ?.filter((p) => p.status === 'active')
                .map((p) => (
                  <View key={p.id} style={viewStyles.completedParticipantRow}>
                    <Text style={textStyles.completedParticipantName}>
                      {p.is_host ? '👑 ' : ''}
                      {p.display_name}
                    </Text>
                    <Text style={textStyles.completedParticipantAmount}>
                      {formatPrice(Number(p.total_spent))}
                    </Text>
                  </View>
                ))}

              <View style={viewStyles.completedSessionFooter}>
                <Text style={textStyles.completedSessionTotal}>
                  {t('session.completed.totalLabel', {
                    amount: formatPrice(Number(session.total_amount)),
                  })}
                </Text>
                <TouchableOpacity style={viewStyles.completedSessionCloseBtn} onPress={clearSession}>
                  <Text style={textStyles.completedSessionCloseBtnText}>
                    {t('session.completed.close')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={viewStyles.content}>
          <View style={layoutConfig.shouldUseGrid ? viewStyles.gridLayout : undefined}>
            <View
              style={[
                viewStyles.qrSection,
                layoutConfig.shouldUseGrid ? viewStyles.gridColumn : undefined,
              ]}
            >
              <QRAccessButtons />
            </View>

            <View
              style={[
                viewStyles.quickActions,
                layoutConfig.shouldUseGrid ? viewStyles.gridColumn : undefined,
              ]}
            >
              <View style={viewStyles.sectionTitle}>
                <Text style={textStyles.quickActionsTitle}>{t('home.quickActions')}</Text>
                <View style={viewStyles.sectionTitleLine} />
              </View>

              {quickActions.map((action) => (
                <Pressable
                  key={`${action.id}-${isDark ? 'd' : 'l'}`}
                  style={viewStyles.quickActionButton}
                  onPress={action.onPress}
                  android_ripple={{ color: colors.primary + '15', borderless: false }}
                >
                  <View style={[viewStyles.quickActionGradient, { backgroundColor: action.iconColor }]} />
                  <View style={viewStyles.quickActionContent}>
                    <View
                      style={[
                        viewStyles.quickActionIconContainer,
                        { backgroundColor: action.iconBg },
                      ]}
                    >
                      <Ionicons name={action.icon as any} size={iconSize} color={action.iconColor} />
                    </View>
                    <View style={viewStyles.quickActionTextContainer}>
                      <Text style={textStyles.quickActionButtonText}>{action.title}</Text>
                      <Text style={textStyles.quickActionSubtext}>{action.subtitle}</Text>
                    </View>
                  </View>
                  <View style={viewStyles.chevronContainer}>
                    <Ionicons name="chevron-forward" size={chevronSize} color={colors.text.secondary} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* MODAL : REJOINDRE PAR CODE */}
      <Modal
        visible={codeModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={handleCloseCodeModal}
      >
        <TouchableWithoutFeedback onPress={handleCloseCodeModal}>
          <View style={viewStyles.modalOverlay}>
            <KeyboardAvoidingView
              style={{ flex: 1, justifyContent: 'flex-end' }}
              behavior="padding"
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={viewStyles.modalSheet}>
                  <View style={viewStyles.modalHandle} />

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Ionicons name="people" size={22} color={SESSION_INDIGO} style={{ marginRight: 8 }} />
                    <Text style={viewStyles.modalTitle}>{t('session.codeModal.title')}</Text>
                  </View>
                  <Text style={viewStyles.modalSubtitle}>
                    {t('session.codeModal.description')}
                  </Text>

                  <View style={[viewStyles.codeInputWrapper]}>
                    <Ionicons name="keypad-outline" size={20} color={colors.text.secondary} />
                    <TextInput
                      ref={codeInputRef}
                      style={viewStyles.codeInput}
                      placeholder={t('session.codeModal.placeholder')}
                      placeholderTextColor={colors.text.secondary + '80'}
                      value={shareCode}
                      onChangeText={(t) => {
                        setShareCode(t.toUpperCase());
                        setCodeError(null);
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={12}
                      returnKeyType="go"
                      onSubmitEditing={handleJoinByCode}
                    />
                    {shareCode.length > 0 && (
                      <Pressable onPress={() => setShareCode('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
                      </Pressable>
                    )}
                  </View>

                  {codeError && <Text style={viewStyles.codeError}>{codeError}</Text>}

                  <Pressable
                    style={[
                      viewStyles.joinButton,
                      (isJoiningByCode || !shareCode.trim()) && viewStyles.joinButtonDisabled,
                    ]}
                    onPress={handleJoinByCode}
                    disabled={isJoiningByCode || !shareCode.trim()}
                  >
                    {isJoiningByCode ? (
                      <ActivityIndicator size="small" color={colors.text.inverse} />
                    ) : (
                      <Text style={textStyles.modalJoinBtn}>{t('session.codeModal.cta')}</Text>
                    )}
                  </Pressable>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL : EN ATTENTE D'APPROBATION */}
      <Modal
        visible={pendingModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {/* Bloquer fermeture accidentelle */}}
      >
        <View style={viewStyles.modalOverlay}>
          <View style={viewStyles.pendingModalSheet}>
            <View style={viewStyles.modalHandle} />

            <ActivityIndicator size="large" color={SESSION_INDIGO} style={{ marginBottom: 16 }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons name="time-outline" size={22} color={SESSION_INDIGO} style={{ marginRight: 8 }} />
              <Text style={viewStyles.modalTitle}>{t('session.pending.title')}</Text>
            </View>

            <Text style={[viewStyles.modalSubtitle, { textAlign: 'center' }]}>
              {t('session.pending.description')}
            </Text>

            {pendingApproval && (
              <>
                <View style={viewStyles.pendingCodeBox}>
                  <Text style={{ fontSize: 11, color: colors.text.secondary, marginBottom: 4 }}>
                    {t('session.pending.codeLabel')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: '800',
                      color: colors.primary,
                      letterSpacing: 4,
                    }}
                  >
                    {pendingApproval.session.share_code}
                  </Text>
                </View>

                <PendingApprovalPoller
                  sessionId={pendingApproval.sessionId}
                  participantId={pendingApproval.participantId}
                  onApproved={handleApproved}
                  onRejected={handleRejected}
                />
              </>
            )}

            <TouchableOpacity
              style={{ marginTop: 16, padding: 12 }}
              onPress={() => {
                setPendingModalVisible(false);
                setPendingApproval(null);
              }}
            >
              <Text style={{ color: colors.text.secondary, textAlign: 'center', fontSize: 14 }}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}