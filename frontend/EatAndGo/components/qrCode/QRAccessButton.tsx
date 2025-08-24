import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Vibration,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { QRSessionUtils } from '@/utils/qrSessionUtils';
import QRScanner from '@/components/client/QRScanner';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS 
} from '@/utils/designSystem';

interface QRAccessButtonsProps {
  /** Titre affiché au-dessus des boutons */
  title?: string;
  /** Description affichée sous le titre */
  description?: string;
  /** Style personnalisé pour le conteneur */
  containerStyle?: any;
  /** Si true, affiche les boutons en colonne plutôt qu'en ligne */
  vertical?: boolean;
  /** Callback appelé après un scan/code réussi */
  onSuccess?: (restaurantId: string, tableNumber?: string, originalCode?: string) => void;
  /** Si true, affiche une version compacte sans icône et titre */
  compact?: boolean;
  /** Texte personnalisé pour le bouton scanner */
  scanButtonText?: string;
  /** Texte personnalisé pour le bouton code */
  codeButtonText?: string;
}

export const QRAccessButtons: React.FC<QRAccessButtonsProps> = ({
  title = "Accéder au menu",
  description = "Scannez le QR code de votre table ou entrez le code d'accès",
  containerStyle,
  vertical = false,
  onSuccess,
  compact = false,
  scanButtonText = "Scanner QR",
  codeButtonText = "Entrer le code"
}) => {
  const [showScanner, setShowScanner] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    modalMaxWidth: getResponsiveValue(
      { mobile: width * 0.9, tablet: 480, desktop: 520 },
      screenType
    ),
    buttonLayout: vertical || screenType === 'mobile' ? 'vertical' : 'horizontal',
  };

  const styles = {
    // Container principal
    container: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: compact ? getResponsiveValue(SPACING.md, screenType) : getResponsiveValue(SPACING.xl, screenType),
      alignItems: 'center' as const,
      marginBottom: compact ? 0 : getResponsiveValue(SPACING.lg, screenType),
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    compactContainer: {
      padding: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center' as const,
      backgroundColor: 'transparent',
      shadowOpacity: 0,
      elevation: 0,
      borderWidth: 0,
    },

    // Icône et textes
    icon: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    title: {
      fontSize: getResponsiveValue(
        { mobile: 20, tablet: 24, desktop: 28 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
    },

    description: {
      fontSize: getResponsiveValue(
        { mobile: 15, tablet: 16, desktop: 17 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
    },

    // Conteneur des boutons
    buttonContainer: {
      flexDirection: layoutConfig.buttonLayout === 'vertical' ? 'column' as const : 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      width: '100%' as const,
    },

    // Boutons d'action
    actionButton: {
      flex: layoutConfig.buttonLayout === 'horizontal' ? 1 : 0,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      gap: getResponsiveValue(SPACING.xs, screenType),
      minHeight: getResponsiveValue(
        { mobile: 50, tablet: 56, desktop: 60 },
        screenType
      ),
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },

    primaryButton: {
      backgroundColor: COLORS.secondary,
    },

    secondaryButton: {
      backgroundColor: COLORS.surface,
      borderWidth: 2,
      borderColor: COLORS.secondary,
    },

    buttonDisabled: {
      opacity: 0.6,
    },

    // Textes des boutons
    primaryButtonText: {
      color: COLORS.text.primary,
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      fontWeight: '600' as const,
    },

    secondaryButtonText: {
      color: COLORS.secondary,
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      fontWeight: '600' as const,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: layoutConfig.containerPadding,
      paddingTop: Math.max(layoutConfig.containerPadding, insets.top + 20),
      paddingBottom: Math.max(layoutConfig.containerPadding, insets.bottom + 20),
    },

    modalContent: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.xl, screenType),
      width: '100%' as const,
      maxWidth: layoutConfig.modalMaxWidth,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 16,
    },

    modalHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    modalTitle: {
      fontSize: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },

    modalCloseButton: {
      padding: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: COLORS.background,
    },

    // Input container
    inputContainer: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    inputLabel: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    textInput: {
      borderWidth: 2,
      borderColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.sm, screenType),
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      backgroundColor: COLORS.background,
      color: COLORS.text.primary,
      minHeight: getResponsiveValue(
        { mobile: 50, tablet: 56, desktop: 60 },
        screenType
      ),
    },

    textInputFocused: {
      borderColor: COLORS.primary,
    },

    inputHint: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
    },

    // Actions de modal
    modalActions: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    modalButton: {
      flex: screenType === 'mobile' ? 0 : 1,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center' as const,
      minHeight: getResponsiveValue(
        { mobile: 50, tablet: 56, desktop: 60 },
        screenType
      ),
      justifyContent: 'center' as const,
    },

    cancelButton: {
      backgroundColor: COLORS.background,
      borderWidth: 2,
      borderColor: COLORS.border.default,
    },

    confirmButton: {
      backgroundColor: COLORS.secondary,
    },

    cancelButtonText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.secondary,
    },

    confirmButtonText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
  };

  // Tailles d'icônes responsive
  const iconSizes = {
    main: getResponsiveValue({ mobile: 64, tablet: 80, desktop: 96 }, screenType),
    button: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
    modal: getResponsiveValue({ mobile: 24, tablet: 26, desktop: 28 }, screenType),
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

        if (onSuccess) {
          // Callback personnalisé
          onSuccess(sessionData.restaurantId, sessionData.tableNumber, sessionData.originalCode);
        } else {
          // Navigation par défaut avec les paramètres complets
          const params: Record<string, string> = {
            code: sessionData.originalCode,
            restaurantId: sessionData.restaurantId
          };
          
          if (sessionData.tableNumber) {
            params.tableNumber = sessionData.tableNumber;
          }

          router.push({
            pathname: `/menu/client/${sessionData.restaurantId}` as any,
            params
          });
        }
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
        <>
          <View style={styles.icon}>
            <Ionicons name="qr-code-outline" size={iconSizes.main} color={COLORS.secondary} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </>
      )}
      
      <View style={styles.buttonContainer}>
        <Pressable 
          style={[
            styles.actionButton, 
            styles.primaryButton,
            isProcessing && styles.buttonDisabled
          ]} 
          onPress={() => setShowScanner(true)}
          disabled={isProcessing}
          android_ripple={{ 
            color: COLORS.primary + '20',
            borderless: false 
          }}
        >
          <Ionicons name="camera" size={iconSizes.button} color={COLORS.text.primary} />
          <Text style={styles.primaryButtonText}>{scanButtonText}</Text>
        </Pressable>
        
        <Pressable 
          style={[
            styles.actionButton, 
            styles.secondaryButton,
            isProcessing && styles.buttonDisabled
          ]} 
          onPress={() => setShowCodeInput(true)}
          disabled={isProcessing}
          android_ripple={{ 
            color: COLORS.secondary + '20',
            borderless: false 
          }}
        >
          <Ionicons name="keypad" size={iconSizes.button} color={COLORS.secondary} />
          <Text style={styles.secondaryButtonText}>{codeButtonText}</Text>
        </Pressable>
      </View>

      {/* Modal pour saisir le code */}
      <Modal
        visible={showCodeInput}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !isProcessing && setShowCodeInput(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Entrer le code d'accès</Text>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setShowCodeInput(false)}
                disabled={isProcessing}
                android_ripple={{ 
                  color: COLORS.text.secondary + '20',
                  borderless: true 
                }}
              >
                <Ionicons name="close" size={iconSizes.modal} color={COLORS.text.secondary} />
              </Pressable>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Code d'accès</Text>
              <TextInput
                style={[
                  styles.textInput,
                  // styles.textInputFocused // Peut être ajouté avec un state si nécessaire
                ]}
                value={accessCode}
                onChangeText={setAccessCode}
                placeholder="Ex: 123456, R123T05, ou URL complète"
                placeholderTextColor={COLORS.text.secondary}
                autoCapitalize="characters"
                autoFocus
                editable={!isProcessing}
              />
              <Text style={styles.inputHint}>
                Entrez le code affiché sur votre table ou l'URL complète
              </Text>
            </View>
            
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowCodeInput(false)}
                disabled={isProcessing}
                android_ripple={{ 
                  color: COLORS.text.secondary + '20',
                  borderless: false 
                }}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </Pressable>
              
              <Pressable
                style={[
                  styles.modalButton, 
                  styles.confirmButton,
                  isProcessing && styles.buttonDisabled
                ]}
                onPress={handleManualCodeSubmit}
                disabled={isProcessing}
                android_ripple={{ 
                  color: COLORS.primary + '20',
                  borderless: false 
                }}
              >
                <Text style={styles.confirmButtonText}>
                  {isProcessing ? 'Traitement...' : 'Valider'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};