import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Vibration
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import QRScanner from '@/components/client/QRScanner';

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
      let restaurantId: string | null = null;
      let tableNumber: string | null = null;
      let parsedSuccessfully = false;

      // 1. Essayer de parser comme URL QR complète
      try {
        const url = new URL(codeData);
        const searchParams = url.searchParams;
        
        restaurantId = searchParams.get('restaurant') || searchParams.get('r');
        tableNumber = searchParams.get('table') || searchParams.get('t');
        
        if (restaurantId) {
          parsedSuccessfully = true;
        }
      } catch {
        // Pas une URL valide, continuer avec d'autres formats
      }

      // 2. Essayer les patterns dans l'URL path
      if (!parsedSuccessfully) {
        const restaurantMatch = codeData.match(/(?:restaurant|r)[\/=](\d+)/i);
        const tableMatch = codeData.match(/(?:table|t)[\/=](\d+)/i);
        
        if (restaurantMatch) {
          restaurantId = restaurantMatch[1];
          tableNumber = tableMatch ? tableMatch[1] : null;
          parsedSuccessfully = true;
        }
      }

      // 3. Essayer les formats de codes simples
      if (!parsedSuccessfully) {
        // Format: R123T05 (Restaurant 123, Table 5)
        const formatRTMatch = codeData.match(/^R(\d+)T(\d+)$/i);
        if (formatRTMatch) {
          restaurantId = formatRTMatch[1];
          tableNumber = formatRTMatch[2];
          parsedSuccessfully = true;
        }
        
        // Format: R123 (Restaurant 123 seulement)
        if (!parsedSuccessfully) {
          const formatRMatch = codeData.match(/^R(\d+)$/i);
          if (formatRMatch) {
            restaurantId = formatRMatch[1];
            parsedSuccessfully = true;
          }
        }
        
        // Format: Code numérique simple
        if (!parsedSuccessfully && /^\d+$/.test(codeData)) {
          restaurantId = codeData;
          parsedSuccessfully = true;
        }
      }
      
      if (parsedSuccessfully && restaurantId) {
        if (onSuccess) {
          // Callback personnalisé
          onSuccess(restaurantId, tableNumber || undefined, codeData);
        } else {
          // Navigation par défaut
          const params: Record<string, string> = {
            code: codeData
          };
          
          if (tableNumber) {
            params.tableNumber = tableNumber;
          }

          router.push({
            pathname: `/menu/client/${restaurantId}` as any,
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
          <Ionicons name="qr-code-outline" size={80} color="#FF6B35" />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </>
      )}
      
      <View style={[
        styles.buttonContainer, 
        vertical && styles.buttonContainerVertical
      ]}>
        <Pressable 
          style={[
            styles.actionButton, 
            styles.primaryButton,
            vertical && styles.actionButtonVertical
          ]} 
          onPress={() => setShowScanner(true)}
          disabled={isProcessing}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>{scanButtonText}</Text>
        </Pressable>
        
        <Pressable 
          style={[
            styles.actionButton, 
            styles.secondaryButton,
            vertical && styles.actionButtonVertical
          ]} 
          onPress={() => setShowCodeInput(true)}
          disabled={isProcessing}
        >
          <Ionicons name="keypad" size={20} color="#FF6B35" />
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
              >
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Code d'accès</Text>
              <TextInput
                style={styles.textInput}
                value={accessCode}
                onChangeText={setAccessCode}
                placeholder="Ex: 123456 ou R123T05"
                autoCapitalize="characters"
                autoFocus
                editable={!isProcessing}
              />
              <Text style={styles.inputHint}>
                Entrez le code affiché sur votre table
              </Text>
            </View>
            
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowCodeInput(false)}
                disabled={isProcessing}
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  compactContainer: {
    padding: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  buttonContainerVertical: {
    flexDirection: 'column',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  actionButtonVertical: {
    flex: 0,
    width: '100%',
  },
  primaryButton: {
    backgroundColor: '#FF6B35',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCloseButton: {
    padding: 4,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  inputHint: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  confirmButton: {
    backgroundColor: '#FF6B35',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});