import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import QRScanner from '@/components/client/QRScanner';
import { QRSessionUtils } from '@/utils/qrSessionUtils';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
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
  title = 'Scanner le QR code de votre table',
  description = 'Ou entrez le code manuellement',
  scanButtonText = 'Scanner QR code',
  codeButtonText = 'Saisir le code',
  compact = false,
  vertical = false,
  containerStyle,
}) => {
  const screenType = useScreenType();
  const [showScanner, setShowScanner] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // États pour la session collaborative
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [scannedData, setScannedData] = useState<{
    restaurantId: number;
    tableNumber: string;
    code: string;
  } | null>(null);

  // Hook pour vérifier s'il existe une session active
  const [activeSession, setActiveSession] = useState<any>(null);

  // Erreur affichée dans la vue principale (après fermeture du modal)
  const [codeError, setCodeError] = useState<string | null>(null);
  // Erreur affichée à l'intérieur du modal de saisie
  const [modalInputError, setModalInputError] = useState<string | null>(null);

  const iconSize = getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType);
  const fontSize = {
    title: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    description: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    button: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
  };

  const handleScanSuccess = (qrData: string) => {
    
    // Vibration pour feedback utilisateur
    if (Platform.OS === 'ios') {
      Vibration.vibrate(100);
    } else {
      Vibration.vibrate(50);
    }
    
    setShowScanner(false);
    processCode(qrData);
  };

  const handleScanClose = () => {
    setShowScanner(false);
  };

  const handleManualCodeSubmit = async () => {
    if (!accessCode.trim()) {
      setModalInputError('Veuillez entrer un code valide.');
      return;
    }
    setModalInputError(null);
    await processCode(accessCode.trim());
  };

  const processCode = async (codeData: string): Promise<void> => {
    if (isProcessing) return;
    setIsProcessing(true);
  
    try {
      const trimmed = codeData.trim();
  
      // Détecter un share code de session (6 caractères alphanumériques)
      if (/^[A-Z0-9]{6}$/i.test(trimmed)) {
        try {
          const session = await collaborativeSessionService.getSessionByCode(
            trimmed.toUpperCase()
          );
          if (session) {
            const restaurantId = typeof session.restaurant === 'number'
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
            setActiveSession(null);
            setScannedData({
              restaurantId,
              tableNumber: session.table_number,
              code: trimmed.toUpperCase(),
            });
            setShowSessionModal(true);
            return;
          }
        } catch {
          // Pas une session connue, on essaie comme QR de table
        }
      }
  
      // Essayer comme QR de table (R123T05, URL, etc.)
      const sessionData = await QRSessionUtils.createSessionFromCode(trimmed);
  
      if (sessionData) {
        const restaurantId = parseInt(sessionData.restaurantId);
        const tableNumber = sessionData.tableNumber || '';

        // 1. Vérifier que le restaurant existe.
        //    L'apiClient émet une ApiError plain object { code, message, details }
        //    sans propriété `response`, donc on lit err.code directement.
        try {
          await restaurantService.getPublicRestaurant(restaurantId.toString());
        } catch (err: any) {
          const code = err?.code ?? err?.response?.status ?? err?.status;
          throw new Error(
            code === 404
              ? "Ce code ne correspond à aucun restaurant enregistré. Vérifiez le QR code."
              : "Impossible de vérifier ce restaurant. Vérifiez votre connexion et réessayez."
          );
        }

        // 2. Récupérer une éventuelle session active sur cette table
        const foundSession = await collaborativeSessionService.checkActiveSession(
          restaurantId,
          tableNumber
        );

        setActiveSession(foundSession ?? null);
        setScannedData({ restaurantId, tableNumber, code: sessionData.originalCode });
        setShowCodeInput(false);
        setAccessCode('');
        setShowSessionModal(true);
      } else {
        throw new Error('Ce code ne correspond à aucun restaurant ni table. Vérifiez le code ou scannez le QR code.');
      }
  
    } catch (error: any) {
      const msg = error?.message ?? 'Ce code ne correspond à aucun restaurant ni table. Vérifiez le code ou scannez le QR code.';
      setShowCodeInput(false);
      setAccessCode('');
      setModalInputError(null);
      setCodeError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSessionCreated = (session: any) => {
    setShowSessionModal(false);
    
    if (onSuccess && scannedData) {
      onSuccess(scannedData.restaurantId, scannedData.tableNumber, scannedData.code);
    } else if (scannedData) {
      // Navigation par défaut vers le menu avec les paramètres de session
      router.push({
        pathname: `/menu/client/${scannedData.restaurantId}` as any,
        params: {
          code: scannedData.code,
          restaurantId: scannedData.restaurantId.toString(),
          tableNumber: scannedData.tableNumber,
          sessionId: session.id,
        }
      });
    }
  };

  const handleSessionJoined = (session: any) => {
    setShowSessionModal(false);
    
    if (onSuccess && scannedData) {
      onSuccess(scannedData.restaurantId, scannedData.tableNumber, scannedData.code);
    } else if (scannedData) {
      // Navigation par défaut vers le menu avec les paramètres de session
      router.push({
        pathname: `/menu/client/${scannedData.restaurantId}` as any,
        params: {
          code: scannedData.code,
          restaurantId: scannedData.restaurantId.toString(),
          tableNumber: scannedData.tableNumber,
          sessionId: session.id,
        }
      });
    }
  };

  const handleOrderAlone = () => {
    setShowSessionModal(false);
    
    if (onSuccess && scannedData) {
      onSuccess(scannedData.restaurantId, scannedData.tableNumber, scannedData.code);
    } else if (scannedData) {
      // Navigation vers le menu SANS sessionId (mode solo)
      router.push({
        pathname: `/menu/client/${scannedData.restaurantId}` as any,
        params: {
          code: scannedData.code,
          restaurantId: scannedData.restaurantId.toString(),
          tableNumber: scannedData.tableNumber,
          // PAS de sessionId = mode solo
          soloMode: 'true', // Indicateur optionnel pour l'écran de menu
        }
      });
    }
  };

  if (showScanner) {
    return (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleScanClose}
      >
        <View style={{ flex: 1 }}>
          <QRScanner
            onScanSuccess={handleScanSuccess}
            onClose={handleScanClose}
          />
        </View>
      </Modal>
    );
  }

  return (
    <View style={[compact ? styles.compactContainer : styles.container, containerStyle]}>
      {!compact && (
        <View style={styles.header}>
          <Text style={[styles.title, { fontSize: fontSize.title }]}>
            {title}
          </Text>
          <Text style={[styles.description, { fontSize: fontSize.description }]}>
            {description}
          </Text>
        </View>
      )}

      <View style={vertical ? styles.buttonsVertical : styles.buttonsHorizontal}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, vertical && styles.buttonVertical]}
          onPress={() => setShowScanner(true)}
          disabled={isProcessing}
        >
          <Ionicons name="qr-code-outline" size={iconSize} color={COLORS.text.inverse} />
          <Text 
            style={[styles.buttonText, { fontSize: fontSize.button }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {scanButtonText}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, vertical && styles.buttonVertical]}
          onPress={() => setShowCodeInput(true)}
          disabled={isProcessing}
        >
          <Ionicons name="keypad-outline" size={iconSize} color={COLORS.primary} />
          <Text 
            style={[styles.buttonTextSecondary, { fontSize: fontSize.button }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {codeButtonText}
          </Text>
        </TouchableOpacity>
      </View>

      {codeError && (
        <UIAlert
          variant="error"
          title="Code invalide"
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
            <Text style={styles.modalTitle}>Entrer le code de table</Text>
            <Text style={styles.modalDescription}>
              Saisissez le code à 6 chiffres affiché sur votre table
            </Text>

            <TextInput
              style={[styles.input, modalInputError ? styles.inputError : null]}
              value={accessCode}
              onChangeText={(t) => {
                setAccessCode(t);
                if (modalInputError) setModalInputError(null);
              }}
              placeholder="Ex: ABC123"
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />

            {modalInputError && (
              <UIAlert
                variant="error"
                message={modalInputError}
                autoDismiss={false}
                showIcon
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowCodeInput(false);
                  setAccessCode('');
                }}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleManualCodeSubmit}
              >
                <Text style={styles.confirmButtonText}>Valider</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: SPACING.lg.mobile, // Note: utiliser getResponsiveValue dans le composant pour vraie responsivité
  },
  compactContainer: {
    padding: SPACING.sm.mobile,
  },
  header: {
    marginBottom: SPACING.lg.mobile,
  },
  title: {
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.xs.mobile,
    textAlign: 'center',
  },
  description: {
    color: COLORS.text.secondary,
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
    minHeight: 48,
  },
  buttonVertical: {
    flex: 0,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  buttonText: {
    color: COLORS.text.inverse,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    flexShrink: 1,
    textAlign: 'center',
  },
  buttonTextSecondary: {
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    flexShrink: 1,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg.mobile,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl.mobile,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm.mobile,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: SPACING.lg.mobile,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md.mobile,
    fontSize: 24,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: SPACING.lg.mobile,
  },
  inputError: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md.mobile,
  },
  modalButton: {
    flex: 1,
    padding: SPACING.md.mobile,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.variants.secondary[100],
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    color: COLORS.text.secondary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  confirmButtonText: {
    color: COLORS.text.inverse,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
});