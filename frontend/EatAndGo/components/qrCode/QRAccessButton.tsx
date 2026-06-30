import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  Vibration,
  ViewStyle,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import QRScanner from '@/components/client/QRScanner';
import { QRSessionUtils } from '@/utils/qrSessionUtils';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';
import { Alert as UIAlert } from '@/components/ui/Alert';
import { SessionJoinModal } from '@/components/session/SessionJoinModal';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';
import { restaurantService } from '@/services/restaurantService';

interface QRAccessButtonsProps {
  onSuccess?: (restaurantId: number, tableNumber: string, code: string) => void;
  title?: string;
  description?: string;
  scanButtonText?: string;
  codeButtonText?: string;
  compact?: boolean;
  vertical?: boolean;
  containerStyle?: ViewStyle;
}

export const QRAccessButtons: React.FC<QRAccessButtonsProps> = ({
  onSuccess,
  title,
  description,
  scanButtonText,
  codeButtonText,
  compact = false,
  vertical = false,
  containerStyle,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const { isAuthenticated } = useAuth();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [showScanner, setShowScanner] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [scannedData, setScannedData] = useState<{
    restaurantId: number;
    tableNumber: string;
    code: string;
  } | null>(null);
  const [activeSession, setActiveSession] = useState<any>(null);

  const [showAccountChoice, setShowAccountChoice] = useState(false);
  const [pendingTableNav, setPendingTableNav] = useState<{
    restaurantId: number;
    tableNumber: string;
    code: string;
  } | null>(null);

  const [codeError, setCodeError] = useState<string | null>(null);
  const [modalInputError, setModalInputError] = useState<string | null>(null);

  // Fallback i18n pour les props non fournies
  const resolvedTitle = title ?? t('qrAccess.title');
  const resolvedDescription = description ?? t('qrAccess.description');
  const resolvedScanText = scanButtonText ?? t('qrAccess.scanButton');
  const resolvedCodeText = codeButtonText ?? t('qrAccess.codeButton');

  const iconSize = getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType);
  const fontSize = {
    title: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    description: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    button: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
  };

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleScanSuccess = (qrData: string) => {
    if (Platform.OS === 'ios') {
      Vibration.vibrate(100);
    } else {
      Vibration.vibrate(50);
    }
    setShowScanner(false);
    processCode(qrData);
  };

  const handleScanClose = () => setShowScanner(false);

  const handleManualCodeSubmit = async () => {
    if (!accessCode.trim()) {
      setModalInputError(t('qrAccess.emptyCode'));
      return;
    }
    setModalInputError(null);
    await processCode(accessCode.trim());
  };

  const navigateToMenu = (params: {
    restaurantId: number;
    tableNumber: string;
    code: string;
  }) => {
    const { restaurantId, tableNumber, code } = params;

    if (onSuccess) {
      onSuccess(restaurantId, tableNumber, code);
      return;
    }

    if (!isAuthenticated) {
      setPendingTableNav({ restaurantId, tableNumber, code });
      setShowAccountChoice(true);
      return;
    }

    pushToMenu({ restaurantId, tableNumber, code });
  };

  const pushToMenu = (params: {
    restaurantId: number;
    tableNumber: string;
    code: string;
  }) => {
    const { restaurantId, tableNumber, code } = params;
    router.push({
      pathname: `/menu/client/${restaurantId}` as any,
      params: {
        code,
        restaurantId: restaurantId.toString(),
        tableNumber,
        fromQR: '1',
      },
    });
  };

  const handleAccountChoiceGuest = () => {
    setShowAccountChoice(false);
    if (pendingTableNav) {
      const target = pendingTableNav;
      setPendingTableNav(null);
      pushToMenu(target);
    }
  };

  const handleAccountChoiceLogin = () => {
    if (!pendingTableNav) {
      setShowAccountChoice(false);
      return;
    }
    setShowAccountChoice(false);
    const menuPath = `/menu/client/${pendingTableNav.restaurantId}`;
    const nav = pendingTableNav;
    setPendingTableNav(null);
    router.push({
      pathname: '/(auth)/login' as any,
      params: {
        returnTo: menuPath,
        returnToTableNumber: nav.tableNumber,
        returnToCode: nav.code,
        returnToFromQR: '1',
      },
    });
  };

  const handleAccountChoiceRegister = () => {
    if (!pendingTableNav) {
      setShowAccountChoice(false);
      return;
    }
    setShowAccountChoice(false);
    const menuPath = `/menu/client/${pendingTableNav.restaurantId}`;
    const nav = pendingTableNav;
    setPendingTableNav(null);
    router.push({
      pathname: '/(auth)/register' as any,
      params: {
        returnTo: menuPath,
        returnToTableNumber: nav.tableNumber,
        returnToCode: nav.code,
        returnToFromQR: '1',
      },
    });
  };

  const processCode = async (codeData: string): Promise<void> => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const trimmed = codeData.trim();

      // Cas 1 : share_code de session collaborative
      if (/^[A-Z0-9]{6}$/i.test(trimmed)) {
        try {
          const session = await collaborativeSessionService.getSessionByCode(
            trimmed.toUpperCase(),
          );
          if (session) {
            const restaurantId =
              typeof session.restaurant === 'number'
                ? session.restaurant
                : parseInt(session.restaurant as any);

            await QRSessionUtils.saveSession({
              restaurantId: restaurantId.toString(),
              restaurantName: session.restaurant_name,
              tableNumber: session.table_number,
              originalCode: trimmed.toUpperCase(),
              timestamp: Date.now(),
            });

            setShowCodeInput(false);
            setAccessCode('');
            setActiveSession(session);
            setScannedData({
              restaurantId,
              tableNumber: session.table_number,
              code: trimmed.toUpperCase(),
            });
            setShowSessionModal(true);
            return;
          }
        } catch {
          // Pas une session connue → on essaie comme QR de table classique
        }
      }

      // Cas 2 : code de table
      const sessionData = await QRSessionUtils.createSessionFromCode(trimmed);

      if (!sessionData) {
        throw new Error(t('qrAccess.errors.notFound'));
      }

      const restaurantId = parseInt(sessionData.restaurantId);
      const tableNumber = sessionData.tableNumber || '';

      try {
        await restaurantService.getPublicRestaurant(restaurantId.toString());
      } catch (err: any) {
        const code = err?.code ?? err?.response?.status ?? err?.status;
        throw new Error(
          code === 404
            ? t('qrAccess.errors.restaurantNotFound')
            : t('qrAccess.errors.serverUnavailable'),
        );
      }

      setShowCodeInput(false);
      setAccessCode('');

      navigateToMenu({
        restaurantId,
        tableNumber,
        code: sessionData.originalCode,
      });
    } catch (error: any) {
      const msg = error?.message ?? t('qrAccess.errors.notFound');
      setShowCodeInput(false);
      setAccessCode('');
      setModalInputError(null);
      setCodeError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Handlers SessionJoinModal ────────────────────────────────────────────

  const handleSessionCreated = (session: any) => {
    setShowSessionModal(false);
    if (onSuccess && scannedData) {
      onSuccess(scannedData.restaurantId, scannedData.tableNumber, scannedData.code);
    } else if (scannedData) {
      router.push({
        pathname: `/menu/client/${scannedData.restaurantId}` as any,
        params: {
          code: scannedData.code,
          restaurantId: scannedData.restaurantId.toString(),
          tableNumber: scannedData.tableNumber,
          sessionId: session.id,
        },
      });
    }
  };

  const handleSessionJoined = (session: any) => {
    setShowSessionModal(false);
    if (onSuccess && scannedData) {
      onSuccess(scannedData.restaurantId, scannedData.tableNumber, scannedData.code);
    } else if (scannedData) {
      router.push({
        pathname: `/menu/client/${scannedData.restaurantId}` as any,
        params: {
          code: scannedData.code,
          restaurantId: scannedData.restaurantId.toString(),
          tableNumber: scannedData.tableNumber,
          sessionId: session.id,
        },
      });
    }
  };

  const handleOrderAlone = () => {
    setShowSessionModal(false);
    if (onSuccess && scannedData) {
      onSuccess(scannedData.restaurantId, scannedData.tableNumber, scannedData.code);
    } else if (scannedData) {
      router.push({
        pathname: `/menu/client/${scannedData.restaurantId}` as any,
        params: {
          code: scannedData.code,
          restaurantId: scannedData.restaurantId.toString(),
          tableNumber: scannedData.tableNumber,
          soloMode: 'true',
        },
      });
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (showScanner) {
    return (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleScanClose}
      >
        <View style={{ flex: 1 }}>
          <QRScanner onScanSuccess={handleScanSuccess} onClose={handleScanClose} />
        </View>
      </Modal>
    );
  }

  return (
    <View style={[compact ? styles.compactContainer : styles.container, containerStyle]}>
      {!compact && (
        <View style={styles.header}>
          <Text style={[styles.title, { fontSize: fontSize.title }]}>{resolvedTitle}</Text>
          <Text style={[styles.description, { fontSize: fontSize.description }]}>
            {resolvedDescription}
          </Text>
        </View>
      )}

      <View style={vertical ? styles.buttonsVertical : styles.buttonsHorizontal}>
        {/* Bouton PRIMARY (scan) — indigo en dark, navy en light, ombre, accent or */}
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, vertical && styles.buttonVertical]}
          onPress={() => setShowScanner(true)}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          <Ionicons name="qr-code-outline" size={iconSize} color={colors.secondary} />
          <Text
            style={[styles.buttonText, { fontSize: fontSize.button }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {resolvedScanText}
          </Text>
        </TouchableOpacity>

        {/* Bouton SECONDARY (code) — fond teinté primary pour rester visible en dark */}
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, vertical && styles.buttonVertical]}
          onPress={() => setShowCodeInput(true)}
          disabled={isProcessing}
          activeOpacity={0.85}
        >
          <Ionicons name="keypad-outline" size={iconSize} color={colors.primary} />
          <Text
            style={[styles.buttonTextSecondary, { fontSize: fontSize.button }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {resolvedCodeText}
          </Text>
        </TouchableOpacity>
      </View>

      {codeError && (
        <UIAlert
          variant="error"
          title={t('qrAccess.invalidCodeTitle')}
          message={codeError}
          autoDismiss
          autoDismissDuration={6000}
          onDismiss={() => setCodeError(null)}
        />
      )}

      {/* Modal de saisie manuelle */}
      <Modal
        visible={showCodeInput}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCodeInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('qrAccess.modal.title')}</Text>
            <Text style={styles.modalDescription}>{t('qrAccess.modal.description')}</Text>

            <TextInput
              style={[styles.input, modalInputError ? styles.inputError : null]}
              value={accessCode}
              onChangeText={(text) => {
                setAccessCode(text);
                if (modalInputError) setModalInputError(null);
              }}
              placeholder={t('qrAccess.modal.placeholder')}
              placeholderTextColor={colors.text.light}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
              autoFocus
              editable={!isProcessing}
              returnKeyType="go"
              onSubmitEditing={handleManualCodeSubmit}
            />

            {modalInputError && (
              <UIAlert variant="error" message={modalInputError} autoDismiss={false} showIcon />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowCodeInput(false);
                  setAccessCode('');
                  setModalInputError(null);
                }}
                disabled={isProcessing}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleManualCodeSubmit}
                disabled={isProcessing || !accessCode.trim()}
              >
                <Text style={styles.confirmButtonText}>
                  {isProcessing ? t('qrAccess.modal.verifying') : t('qrAccess.modal.confirm')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de session collaborative */}
      {showSessionModal && scannedData && (
        <SessionJoinModal
          visible={showSessionModal}
          onClose={() => {
            setShowSessionModal(false);
            setScannedData(null);
            setActiveSession(null);
          }}
          restaurantId={scannedData.restaurantId}
          tableNumber={scannedData.tableNumber}
          activeSession={activeSession}
          onSessionCreated={handleSessionCreated}
          onSessionJoined={handleSessionJoined}
          onOrderAlone={handleOrderAlone}
        />
      )}

      {/* Modal "Souhaitez-vous utiliser un compte ?" */}
      <Modal
        visible={showAccountChoice}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={handleAccountChoiceGuest}
      >
        <View style={styles.accountChoiceOverlay}>
          <View style={styles.accountChoiceSheet}>
            <View style={styles.accountChoiceHandle} />

            <ScrollView
              contentContainerStyle={styles.accountChoiceContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.accountChoiceTitle}>{t('qrAccess.account.title')}</Text>
              <Text style={styles.accountChoiceHint}>{t('qrAccess.account.hint')}</Text>

              <TouchableOpacity
                style={styles.accountChoiceOption}
                onPress={handleAccountChoiceLogin}
                activeOpacity={0.85}
              >
                <View style={styles.accountChoiceIcon}>
                  <Ionicons name="log-in-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.accountChoiceOptionContent}>
                  <Text style={styles.accountChoiceOptionTitle}>
                    {t('qrAccess.account.login.title')}
                  </Text>
                  <Text style={styles.accountChoiceOptionDesc}>
                    {t('qrAccess.account.login.desc')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.text.secondary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.accountChoiceOption}
                onPress={handleAccountChoiceRegister}
                activeOpacity={0.85}
              >
                <View style={styles.accountChoiceIcon}>
                  <Ionicons name="person-add-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.accountChoiceOptionContent}>
                  <Text style={styles.accountChoiceOptionTitle}>
                    {t('qrAccess.account.register.title')}
                  </Text>
                  <Text style={styles.accountChoiceOptionDesc}>
                    {t('qrAccess.account.register.desc')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={colors.text.secondary} />
              </TouchableOpacity>

              <View style={styles.accountChoiceDivider}>
                <View style={styles.accountChoiceDividerLine} />
                <Text style={styles.accountChoiceDividerText}>{t('qrAccess.account.or')}</Text>
                <View style={styles.accountChoiceDividerLine} />
              </View>

              <TouchableOpacity
                style={styles.accountChoiceGuestButton}
                onPress={handleAccountChoiceGuest}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="walk-outline"
                  size={22}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.accountChoiceGuestButtonText}>
                  {t('qrAccess.account.guestCta')}
                </Text>
              </TouchableOpacity>

              <Text style={styles.accountChoiceGuestHint}>
                {t('qrAccess.account.guestHint')}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// =============================================================================
// STYLES — fabrique theme-aware
// =============================================================================
const makeStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: { padding: SPACING.lg.mobile },
    compactContainer: { padding: SPACING.sm.mobile },

    header: { marginBottom: SPACING.lg.mobile },

    title: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      // Titre en or chaud en dark pour ressortir clairement,
      // navy/text.primary en light
      color: isDark ? colors.text.golden : colors.text.primary,
      marginBottom: SPACING.xs.mobile,
      textAlign: 'center',
    },
    description: {
      color: colors.text.secondary,
      textAlign: 'center',
    },

    buttonsHorizontal: {
      flexDirection: 'row',
      gap: SPACING.sm.mobile,
      width: '100%',
    },
    buttonsVertical: {
      flexDirection: 'column',
      gap: SPACING.md.mobile,
    },

    button: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.md.mobile,
      paddingHorizontal: SPACING.sm.mobile,
      borderRadius: BORDER_RADIUS.lg,
      gap: SPACING.xs.mobile,
      minHeight: 52,
    },
    buttonVertical: { flex: 0 },

    // PRIMARY — navy en light, indigo lumineux en dark + ombre prononcée
    // + bordure or subtile en dark pour faire ressortir du fond sombre
    primaryButton: {
      backgroundColor: colors.primary,
      ...shadows.md,
      ...(isDark
        ? {
            borderWidth: 1,
            borderColor: colors.secondary + '40', // 25% d'or
          }
        : {}),
    },

    // SECONDARY — fond teinté primary (au lieu de surface) pour rester
    // BIEN visible sur fond sombre, où surface=navy quasi-noir confondait
    // le bouton avec le background.
    secondaryButton: {
      backgroundColor: colors.variants.primary[50],
      borderWidth: 2,
      borderColor: colors.primary,
    },

    buttonText: {
      color: colors.text.inverse,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      flexShrink: 1,
      textAlign: 'center',
      letterSpacing: 0.3,
    },
    buttonTextSecondary: {
      color: colors.primary,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      flexShrink: 1,
      textAlign: 'center',
      letterSpacing: 0.3,
    },

    // ── Modal de saisie ─────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.lg.mobile,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: SPACING.xl.mobile,
      width: '100%',
      maxWidth: 400,
      ...shadows.lg,
      // Touche or subtile sur la bordure en dark
      ...(isDark
        ? {
            borderWidth: 1,
            borderColor: 'rgba(212, 175, 55, 0.12)',
          }
        : {}),
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: SPACING.sm.mobile,
      textAlign: 'center',
    },
    modalDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: SPACING.lg.mobile,
      textAlign: 'center',
      lineHeight: 20,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md.mobile,
      fontSize: 22,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      textAlign: 'center',
      letterSpacing: 2,
      marginBottom: SPACING.md.mobile,
      color: colors.text.primary,
      backgroundColor: colors.background,
    },
    inputError: {
      borderColor: colors.error,
      borderWidth: 2,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: SPACING.md.mobile,
      marginTop: SPACING.sm.mobile,
    },
    modalButton: {
      flex: 1,
      padding: SPACING.md.mobile,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      minHeight: 48,
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: colors.variants.secondary[100],
    },
    confirmButton: {
      backgroundColor: colors.primary,
    },
    cancelButtonText: {
      color: colors.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    confirmButtonText: {
      color: colors.text.inverse,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    // ── AccountChoice modal ─────────────────────────────────────────────
    accountChoiceOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    accountChoiceSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: SPACING.lg.mobile,
      paddingTop: SPACING.sm.mobile,
      paddingBottom: Platform.OS === 'ios' ? SPACING.xl.mobile : SPACING.lg.mobile,
      maxHeight: '92%',
    },
    accountChoiceHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border.default,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: SPACING.sm.mobile,
    },
    accountChoiceContent: {
      paddingBottom: SPACING.lg.mobile,
    },
    accountChoiceTitle: {
      fontSize: 18,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      textAlign: 'center',
      marginTop: SPACING.sm.mobile,
      marginBottom: SPACING.xs.mobile,
    },
    accountChoiceHint: {
      fontSize: 13,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: SPACING.lg.mobile,
    },
    accountChoiceOption: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md.mobile,
      marginBottom: SPACING.sm.mobile,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    accountChoiceIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '15',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: SPACING.md.mobile,
    },
    accountChoiceOptionContent: { flex: 1 },
    accountChoiceOptionTitle: {
      fontSize: 15,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: 2,
    },
    accountChoiceOptionDesc: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    accountChoiceDivider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: SPACING.md.mobile,
    },
    accountChoiceDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border.light,
    },
    accountChoiceDividerText: {
      marginHorizontal: SPACING.md.mobile,
      fontSize: 13,
      color: colors.text.secondary,
    },
    accountChoiceGuestButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '10',
      borderRadius: BORDER_RADIUS.md,
      padding: SPACING.md.mobile,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    accountChoiceGuestButtonText: {
      fontSize: 15,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.primary,
    },
    accountChoiceGuestHint: {
      fontSize: 12,
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: SPACING.sm.mobile,
      fontStyle: 'italic',
      lineHeight: 18,
    },
  });
};