import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
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
import { useActiveTableSession } from '@/hooks/session/useCollaborativeSession';
import { SessionJoinModal } from '@/components/session/SessionJoinModal';

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
  const { activeSession, loading: checkingSession } = useActiveTableSession(
    scannedData?.restaurantId,
    scannedData?.tableNumber
  );

  // Quand on a scanné un code et vérifié les sessions
  useEffect(() => {
    if (scannedData && !checkingSession) {
      // Afficher le modal de session (créer ou rejoindre)
      setShowSessionModal(true);
    }
  }, [scannedData, checkingSession]);

  const iconSize = getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType);
  const fontSize = {
    title: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    description: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    button: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
  };

  const handleScanSuccess = (qrData: string) => {
    console.log('QR Code scanné:', qrData);
    
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

  const handleManualCodeSubmit = () => {
    if (!accessCode.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code d\'accès valide');
      return;
    }

    processCode(accessCode.trim());
    setShowCodeInput(false);
    setAccessCode('');
  };

  const processCode = async (codeData: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      // Utiliser les utilitaires QR pour parser et sauvegarder
      const sessionData = await QRSessionUtils.createSessionFromCode(codeData);
      
      if (sessionData) {
        console.log('📋 Processed QR/Code successfully:', sessionData);

        // Stocker les données pour vérification de session
        setScannedData({
          restaurantId: parseInt(sessionData.restaurantId),
          tableNumber: sessionData.tableNumber || '',
          code: sessionData.originalCode,
        });
      } else {
        throw new Error('Format de code non reconnu');
      }
      
    } catch (error) {
      console.error('Erreur traitement code:', error);
      Alert.alert(
        'Code invalide', 
        'Le code saisi ne correspond pas à un format valide. Vérifiez le code ou scannez le QR code.',
        [
          { text: 'Réessayer', onPress: () => setShowCodeInput(true) },
          { text: 'Scanner QR', onPress: () => setShowScanner(true) },
          { text: 'OK', style: 'cancel' }
        ]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSessionCreated = (session: any) => {
    console.log('✅ Session créée:', session);
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
    console.log('✅ Session rejointe:', session);
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
              style={styles.input}
              value={accessCode}
              onChangeText={setAccessCode}
              placeholder="Ex: ABC123"
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />

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
          }}
          restaurantId={scannedData.restaurantId}
          tableNumber={scannedData.tableNumber}
          onSessionCreated={handleSessionCreated}
          onSessionJoined={handleSessionJoined}
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