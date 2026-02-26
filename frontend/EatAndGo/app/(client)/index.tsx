import React, { useState, useRef } from 'react';
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
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { NotificationBadge } from '@/components/common/NotificationBadge';
import { Alert, AlertWithAction } from '@/components/ui/Alert';
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '@/utils/designSystem';
import type { CollaborativeSession } from '@/contexts/SessionContext';

export default function ClientHome() {
  const { user } = useAuth();
  const { session, participantId, isHost, isSessionInitialized, leaveSession, clearSession, refreshSession, joinSession } = useSession();
  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [isExiting, setIsExiting] = useState(false);

  // ── Session retrouvée côté serveur (mais absente du cache local) ──
  const [serverSession, setServerSession] = useState<CollaborativeSession | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);

  // ── Alertes déclaratives ──
  // Confirmation quitter/terminer la session
  const [exitAlertVisible, setExitAlertVisible] = useState(false);
  // Erreur rejoindre la session serveur
  const [rejoinError, setRejoinError] = useState<string | null>(null);

  // ── Modal "Rejoindre par code" ──
  const [codeModalVisible, setCodeModalVisible] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isJoiningByCode, setIsJoiningByCode] = useState(false);
  const codeInputRef = useRef<TextInput>(null);

  const hasActiveSession =
    isSessionInitialized &&
    session !== null &&
    ['active', 'locked', 'payment'].includes(session.status);

  // ── Rafraîchir et chercher une session côté serveur à chaque focus ──
  useFocusEffect(
    React.useCallback(() => {
      // Rafraîchir la session locale si elle existe
      refreshSession().catch(() => {
        // Silencieux si pas de réseau
      });

      // Si pas de session locale et utilisateur authentifié → vérifier le serveur
      if (isSessionInitialized && !session && user) {
        checkServerForActiveSession();
      }
    }, [refreshSession, isSessionInitialized, session, user])
  );

  /**
   * Interroge l'API pour trouver une session active à laquelle l'utilisateur
   * participait — utile après un changement de device ou un clear de cache.
   */
  const checkServerForActiveSession = async () => {
    setIsCheckingServer(true);
    try {
      const sessions = await collaborativeSessionService.getMyActiveSessions();
      const active = sessions?.find((s: CollaborativeSession) =>
        ['active', 'locked', 'payment'].includes(s.status)
      );
      setServerSession(active ?? null);
    } catch {
      // Endpoint optionnel — on ignore silencieusement
      setServerSession(null);
    } finally {
      setIsCheckingServer(false);
    }
  };

  // ── Reprendre la session locale ──
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

  // ── Rejoindre la session retrouvée sur le serveur ──
  const handleRejoinServerSession = async () => {
    if (!serverSession) return;
    setRejoinError(null);
    setIsRejoining(true);
    try {
      await joinSession({ share_code: serverSession.share_code });
      setServerSession(null);
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
      setRejoinError(error?.message ?? "La session n'est peut-être plus disponible.");
    } finally {
      setIsRejoining(false);
    }
  };

  const handleDismissServerSession = () => {
    setServerSession(null);
    setRejoinError(null);
  };

  // ── Quitter / terminer la session locale — ouvre la confirmation ──
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

  // ── Rejoindre par code ──
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
      setCodeError('Veuillez saisir un code de session.');
      return;
    }
    setCodeError(null);
    setIsJoiningByCode(true);
    try {
      // D'abord vérifier que la session existe
      const found = await collaborativeSessionService.getSessionByCode(trimmed);
      if (!found) {
        setCodeError('Aucune session trouvée avec ce code.');
        return;
      }
      if (!['active', 'locked'].includes(found.status)) {
        setCodeError('Cette session n\'est plus active.');
        return;
      }
      // Rejoindre
      await joinSession({ share_code: trimmed });
      handleCloseCodeModal();
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
      const msg = error?.response?.data?.detail ?? error?.message;
      setCodeError(msg ?? 'Impossible de rejoindre cette session.');
    } finally {
      setIsJoiningByCode(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════

  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    contentMaxWidth: screenType === 'desktop' ? 700 : screenType === 'tablet' ? 600 : undefined,
    shouldUseGrid: (screenType === 'tablet' && width > 900) || screenType === 'desktop',
  };

  const viewStyles = {
    container: { flex: 1, backgroundColor: COLORS.background },

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
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.full,
      padding: getResponsiveValue(SPACING.xs, screenType),
      ...SHADOWS.sm,
      borderWidth: 1,
      borderColor: COLORS.border.light,
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
      backgroundColor: COLORS.variants.secondary[50],
      opacity: 0.4,
    },

    titleContainer: {
      position: 'relative' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    // ── BANDEAU SESSION LOCALE ──────────────────────────────────────────
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
      backgroundColor: '#0F4C2A',
      borderRadius: BORDER_RADIUS.xl,
      paddingVertical: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      paddingLeft: getResponsiveValue(SPACING.lg, screenType),
      paddingRight: 8,
      borderWidth: 1.5,
      borderColor: COLORS.success + '60',
      ...SHADOWS.md,
      overflow: 'hidden' as const,
    },

    sessionBannerPulse: {
      position: 'absolute' as const,
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: COLORS.success,
      opacity: 0.06,
      borderRadius: BORDER_RADIUS.xl,
    },

    sessionBannerIconContainer: {
      width: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      height: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      borderRadius: 99,
      backgroundColor: COLORS.success + '25',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: COLORS.success + '40',
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
      backgroundColor: COLORS.success + '30',
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

    // Skeleton pendant le chargement initial
    sessionBannerSkeleton: {
      height: getResponsiveValue({ mobile: 68, tablet: 78, desktop: 86 }, screenType),
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: COLORS.surface,
      marginHorizontal: layoutConfig.containerPadding,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      maxWidth: layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    // ── BANDEAU SESSION RETROUVÉE (serveur) ─────────────────────────────
    serverSessionBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: '#1A2E4A',
      borderRadius: BORDER_RADIUS.xl,
      paddingVertical: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      paddingLeft: getResponsiveValue(SPACING.lg, screenType),
      paddingRight: 8,
      borderWidth: 1.5,
      borderColor: COLORS.secondary + '60',
      ...SHADOWS.md,
      overflow: 'hidden' as const,
    },

    serverSessionPulse: {
      position: 'absolute' as const,
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: COLORS.secondary,
      opacity: 0.05,
      borderRadius: BORDER_RADIUS.xl,
    },

    serverSessionIconContainer: {
      width: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      height: getResponsiveValue({ mobile: 40, tablet: 46, desktop: 52 }, screenType),
      borderRadius: 99,
      backgroundColor: COLORS.secondary + '25',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: COLORS.secondary + '40',
      flexShrink: 0,
    },

    serverSessionRejoinBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: COLORS.secondary + '30',
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
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end' as const,
    },

    modalSheet: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: Math.max(insets.bottom + 16, 32),
      ...SHADOWS.lg,
    },

    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: COLORS.border.light,
      alignSelf: 'center' as const,
      marginBottom: 20,
    },

    modalTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: 6,
    },

    modalSubtitle: {
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      color: COLORS.text.secondary,
      marginBottom: 24,
      lineHeight: 20,
    },

    codeInputWrapper: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      borderColor: COLORS.border.light,
      paddingHorizontal: 16,
      marginBottom: 8,
    },

    codeInputWrapperFocused: {
      borderColor: COLORS.primary,
    },

    codeInput: {
      flex: 1,
      height: 52,
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      letterSpacing: 3,
      paddingLeft: 8,
    },

    codeError: {
      fontSize: 13,
      color: '#FF6B6B',
      marginBottom: 16,
      marginLeft: 4,
    },

    joinButton: {
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      height: 52,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginTop: 8,
      ...SHADOWS.sm,
    },

    joinButtonDisabled: {
      opacity: 0.6,
    },

    // ─────────────────────────────────────────────────────────────────────

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
        screenType
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
      backgroundColor: COLORS.border.golden,
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
      opacity: 0.3,
    },

    quickActionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      backgroundColor: COLORS.surface,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.xl,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      minHeight: getResponsiveValue({ mobile: 70, tablet: 84, desktop: 96 }, screenType),
      borderWidth: 1.5,
      borderColor: COLORS.border.light,
      ...SHADOWS.md,
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
      backgroundColor: COLORS.background,
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
      backgroundColor: COLORS.goldenSurface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      marginBottom: getResponsiveValue(
        { mobile: SPACING.lg.mobile, tablet: SPACING.xl.tablet, desktop: SPACING.xl.desktop },
        screenType
      ),
      ...SHADOWS.sm,
      maxWidth: screenType === 'tablet' ? 500 : undefined,
      alignSelf: 'center' as const,
      width: screenType === 'tablet' ? '100%' as const : undefined,
    },
  };

  const textStyles = {
    logo: {
      fontSize: getResponsiveValue({ mobile: 32, tablet: 40, desktop: 48 }, screenType),
      color: COLORS.primary,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
      textAlign: 'center' as const,
    },
    logoAccent: { color: COLORS.secondary },
    subtitle: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
      fontWeight: '400' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    welcome: {
      fontSize: getResponsiveValue({ mobile: 15, tablet: 17, desktop: 19 }, screenType),
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      fontWeight: '600' as const,
    },
    welcomeSubtext: {
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginTop: 4,
    },
    quickActionsTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 22, desktop: 26 }, screenType),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },
    quickActionButtonText: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      color: COLORS.text.primary,
      fontWeight: '600' as const,
      marginBottom: 2,
    },
    quickActionSubtext: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: COLORS.text.secondary,
      fontWeight: '400' as const,
    },
    // ── Session banners ──
    sessionBannerTitle: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '700' as const,
      color: '#FFFFFF',
      marginBottom: 2,
    },
    sessionBannerMeta: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 12, desktop: 13 }, screenType),
      color: COLORS.success,
      fontWeight: '500' as const,
    },
    sessionBannerCta: {
      fontSize: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
      color: 'rgba(255,255,255,0.45)',
      marginTop: 2,
    },
    serverBannerMeta: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 12, desktop: 13 }, screenType),
      color: COLORS.secondary,
      fontWeight: '500' as const,
    },
    serverBannerCta: {
      fontSize: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
      color: 'rgba(255,255,255,0.45)',
      marginTop: 2,
    },
    modalJoinBtn: {
      fontSize: getResponsiveValue({ mobile: 15, tablet: 16, desktop: 17 }, screenType),
      fontWeight: '700' as const,
      color: '#FFFFFF',
    },
  };

  const iconSize = getResponsiveValue({ mobile: 26, tablet: 30, desktop: 34 }, screenType);
  const chevronSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);
  const notificationIconSize = getResponsiveValue({ mobile: 24, tablet: 26, desktop: 28 }, screenType);
  const sessionIconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 26 }, screenType);

  const statusLabel: Record<string, string> = {
    active: 'En cours',
    locked: 'Verrouillée',
    payment: 'Paiement en attente',
  };

  // Actions rapides — on ajoute "Rejoindre une session" si pas de session active
  const quickActions = [
    {
      id: 'orders',
      icon: 'receipt-outline',
      title: 'Mes commandes',
      subtitle: 'Suivez vos commandes',
      route: '/(client)/orders',
      iconBg: COLORS.variants.secondary[50],
      iconColor: COLORS.secondary,
      onPress: () => router.push('/(client)/orders' as any),
    },
    {
      id: 'cart',
      icon: 'bag-outline',
      title: 'Mon panier',
      subtitle: 'Finalisez votre achat',
      route: '/(client)/cart',
      iconBg: '#ECFDF5',
      iconColor: COLORS.success,
      onPress: () => router.push('/(client)/cart' as any),
    },
    // Raccourci rejoindre une session — visible uniquement si pas de session active/en cours
    ...(!hasActiveSession && !serverSession
      ? [{
          id: 'join-session',
          icon: 'people-outline',
          title: 'Rejoindre une session',
          subtitle: 'Entrez un code de partage',
          route: null,
          iconBg: '#EEF2FF',
          iconColor: '#6366F1',
          onPress: handleOpenCodeModal,
        }]
      : []),
  ];

  // ═══════════════════════════════════════════════════════════════════════
  // RENDU
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <View style={viewStyles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} translucent={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={viewStyles.scrollContainer}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* ── Notifications ── */}
        <View style={viewStyles.headerRow}>
          <View style={viewStyles.headerPlaceholder} />
          <View style={{ flex: 1 }} />
          <View style={viewStyles.notificationBadgeContainer}>
            <NotificationBadge size={notificationIconSize} color={COLORS.primary} />
          </View>
        </View>

        <View style={viewStyles.header}>
          <View style={viewStyles.titleContainer}>
            <View style={viewStyles.decorativeBadge} />
            <Text style={textStyles.logo}>
              Eat<Text style={textStyles.logoAccent}></Text>QuickeR
            </Text>
            <Text style={textStyles.subtitle}>Commandez facilement</Text>
          </View>

          {user && (
            <View style={viewStyles.welcomeCard}>
              <Text style={textStyles.welcome}>
                Bonjour {user.first_name || user.username} ! 👋
              </Text>
              <Text style={textStyles.welcomeSubtext}>
                Prêt(e) à commander aujourd'hui ?
              </Text>
            </View>
          )}
        </View>

        {/* ══════════════════════════════════════════════════════════════
            BANDEAUX SESSION
        ══════════════════════════════════════════════════════════════ */}

        {/* Skeleton pendant init */}
        {!isSessionInitialized && (
          <View style={viewStyles.sessionBannerSkeleton}>
            <ActivityIndicator size="small" color={COLORS.border.light} />
          </View>
        )}

        {/* 1️⃣  Session locale active → reprendre ou quitter */}
        {hasActiveSession && session && (
          <View style={viewStyles.sessionBannerWrapper}>
            <View style={viewStyles.sessionBanner}>
              <View style={viewStyles.sessionBannerPulse} />

              <View style={viewStyles.sessionBannerIconContainer}>
                {isExiting
                  ? <ActivityIndicator size="small" color={COLORS.success} />
                  : <Ionicons name="people" size={sessionIconSize} color={COLORS.success} />
                }
              </View>

              <Pressable
                style={viewStyles.sessionBannerTextContainer}
                onPress={handleResumeSession}
                disabled={isExiting}
              >
                <Text style={textStyles.sessionBannerTitle} numberOfLines={1}>
                  {session.restaurant_name} · Table {session.table_number}
                </Text>
                <Text style={textStyles.sessionBannerMeta}>
                  ● {statusLabel[session.status] ?? session.status}
                  {'  '}·{'  '}
                  {session.participant_count} participant{session.participant_count > 1 ? 's' : ''}
                </Text>
                <Text style={textStyles.sessionBannerCta}>Appuyer pour reprendre</Text>
              </Pressable>

              <View style={viewStyles.sessionBannerActions}>
                <Pressable
                  style={viewStyles.sessionBannerContinueBtn}
                  onPress={handleResumeSession}
                  disabled={isExiting}
                >
                  <Ionicons name="arrow-forward" size={16} color={COLORS.success} />
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

        {/* 2️⃣  Session retrouvée côté serveur (pas de cache local) → rejoindre */}
        {!hasActiveSession && serverSession && (
          <View style={viewStyles.sessionBannerWrapper}>
            <View style={viewStyles.serverSessionBanner}>
              <View style={viewStyles.serverSessionPulse} />

              <View style={viewStyles.serverSessionIconContainer}>
                {isRejoining
                  ? <ActivityIndicator size="small" color={COLORS.secondary} />
                  : <Ionicons name="refresh-circle-outline" size={sessionIconSize} color={COLORS.secondary} />
                }
              </View>

              <Pressable
                style={viewStyles.sessionBannerTextContainer}
                onPress={handleRejoinServerSession}
                disabled={isRejoining}
              >
                <Text style={textStyles.sessionBannerTitle} numberOfLines={1}>
                  {serverSession.restaurant_name} · Table {serverSession.table_number}
                </Text>
                <Text style={textStyles.serverBannerMeta}>
                  ● Session retrouvée
                  {'  '}·{'  '}
                  {serverSession.participant_count} participant{serverSession.participant_count > 1 ? 's' : ''}
                </Text>
                <Text style={textStyles.serverBannerCta}>Appuyer pour rejoindre</Text>
              </Pressable>

              <View style={viewStyles.sessionBannerActions}>
                <Pressable
                  style={viewStyles.serverSessionRejoinBtn}
                  onPress={handleRejoinServerSession}
                  disabled={isRejoining}
                >
                  <Ionicons name="arrow-forward" size={16} color={COLORS.secondary} />
                </Pressable>
                <Pressable
                  style={viewStyles.serverSessionDismissBtn}
                  onPress={handleDismissServerSession}
                  disabled={isRejoining}
                >
                  <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}

        {/* 3️⃣  Alerte erreur rejoindre session serveur */}
        {rejoinError && (
          <View style={viewStyles.sessionBannerWrapper}>
            <Alert
              variant="error"
              title="Impossible de rejoindre"
              message={rejoinError}
              autoDismiss
              autoDismissDuration={5000}
              onDismiss={() => setRejoinError(null)}
            />
          </View>
        )}

        {/* 4️⃣  Confirmation quitter / terminer la session */}
        {exitAlertVisible && session && (
          <View style={viewStyles.sessionBannerWrapper}>
            <AlertWithAction
              variant={isHost ? 'warning' : 'info'}
              title={isHost ? 'Terminer la session ?' : 'Quitter la session ?'}
              message={
                isHost
                  ? "En tant qu'hôte, cela fermera la session pour tous les participants."
                  : 'Vous allez quitter cette session collaborative.'
              }
              autoDismiss={false}
              primaryButton={{
                text: isHost ? 'Terminer' : 'Quitter',
                variant: 'danger',
                onPress: handleConfirmExit,
              }}
              secondaryButton={{
                text: 'Annuler',
                onPress: () => setExitAlertVisible(false),
              }}
            />
          </View>
        )}

        <View style={viewStyles.content}>
          <View style={layoutConfig.shouldUseGrid ? viewStyles.gridLayout : undefined}>
            <View style={[
              viewStyles.qrSection,
              layoutConfig.shouldUseGrid ? viewStyles.gridColumn : undefined,
            ]}>
              <QRAccessButtons />
            </View>

            <View style={[
              viewStyles.quickActions,
              layoutConfig.shouldUseGrid ? viewStyles.gridColumn : undefined,
            ]}>
              <View style={viewStyles.sectionTitle}>
                <Text style={textStyles.quickActionsTitle}>Actions rapides</Text>
                <View style={viewStyles.sectionTitleLine} />
              </View>

              {quickActions.map((action) => (
                <Pressable
                  key={action.id}
                  style={({ pressed }) => [
                    viewStyles.quickActionButton,
                    { transform: [{ scale: pressed ? 0.98 : 1 }], opacity: pressed ? 0.9 : 1 },
                  ]}
                  onPress={action.onPress}
                  android_ripple={{ color: COLORS.primary + '15', borderless: false }}
                >
                  <View style={[viewStyles.quickActionGradient, { backgroundColor: action.iconColor }]} />
                  <View style={viewStyles.quickActionContent}>
                    <View style={[viewStyles.quickActionIconContainer, { backgroundColor: action.iconBg }]}>
                      <Ionicons name={action.icon as any} size={iconSize} color={action.iconColor} />
                    </View>
                    <View style={viewStyles.quickActionTextContainer}>
                      <Text style={textStyles.quickActionButtonText}>{action.title}</Text>
                      <Text style={textStyles.quickActionSubtext}>{action.subtitle}</Text>
                    </View>
                  </View>
                  <View style={viewStyles.chevronContainer}>
                    <Ionicons name="chevron-forward" size={chevronSize} color={COLORS.text.secondary} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════
          MODAL : REJOINDRE PAR CODE
      ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={codeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseCodeModal}
      >
        <TouchableWithoutFeedback onPress={handleCloseCodeModal}>
          <View style={viewStyles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={viewStyles.modalSheet}>
                  <View style={viewStyles.modalHandle} />

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Ionicons name="people" size={22} color="#6366F1" style={{ marginRight: 8 }} />
                    <Text style={viewStyles.modalTitle}>Rejoindre une session</Text>
                  </View>
                  <Text style={viewStyles.modalSubtitle}>
                    Saisissez le code partagé par l'hôte de la table pour rejoindre la session en cours.
                  </Text>

                  <View style={[
                    viewStyles.codeInputWrapper,
                  ]}>
                    <Ionicons name="keypad-outline" size={20} color={COLORS.text.secondary} />
                    <TextInput
                      ref={codeInputRef}
                      style={viewStyles.codeInput}
                      placeholder="EX : ABC123"
                      placeholderTextColor={COLORS.text.secondary + '80'}
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
                        <Ionicons name="close-circle" size={18} color={COLORS.text.secondary} />
                      </Pressable>
                    )}
                  </View>

                  {codeError && (
                    <Text style={viewStyles.codeError}>{codeError}</Text>
                  )}

                  <Pressable
                    style={[
                      viewStyles.joinButton,
                      (isJoiningByCode || !shareCode.trim()) && viewStyles.joinButtonDisabled,
                    ]}
                    onPress={handleJoinByCode}
                    disabled={isJoiningByCode || !shareCode.trim()}
                  >
                    {isJoiningByCode
                      ? <ActivityIndicator size="small" color="#FFFFFF" />
                      : <Text style={textStyles.modalJoinBtn}>Rejoindre la session</Text>
                    }
                  </Pressable>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}