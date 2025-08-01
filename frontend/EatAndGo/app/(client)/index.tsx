import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  Pressable, 
  TextInput, 
  Modal, 
  Alert,
  StatusBar,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import QRScanner from '@/components/client/QRScanner';

export default function ClientHome() {
  const [showScanner, setShowScanner] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const { user } = useAuth();
  
  const statusBarHeight = Platform.OS === 'ios' ? 47 : StatusBar.currentHeight || 0;

  const handleScanSuccess = (qrData: string) => {
    console.log('QR Code scanné:', qrData);
    processCode(qrData);
    setShowScanner(false);
  };

  const handleManualCodeSubmit = () => {
    if (!accessCode.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code d\'accès valide');
      return;
    }

    processCode(accessCode);
    setShowCodeInput(false);
    setAccessCode('');
  };

  const processCode = (codeData: string) => {
    // Le code peut être soit une URL QR, soit un code simple
    let restaurantId: string | null = null;
    let tableNumber: string | null = null;

    // Essayer de parser comme URL QR d'abord
    const restaurantMatch = codeData.match(/restaurant[\/=](\d+)/i);
    const tableMatch = codeData.match(/table[\/=](\d+)/i);
    
    if (restaurantMatch) {
      restaurantId = restaurantMatch[1];
      tableNumber = tableMatch ? tableMatch[1] : null;
    } else {
      // Si pas une URL, traiter comme code simple
      // Le code pourrait être au format "R123T05" (Restaurant 123, Table 5)
      // ou simplement un identifiant unique
      const simpleCodeMatch = codeData.match(/^R?(\d+)T?(\d+)?$/i);
      if (simpleCodeMatch) {
        restaurantId = simpleCodeMatch[1];
        tableNumber = simpleCodeMatch[2] || null;
      } else if (/^\d+$/.test(codeData.trim())) {
        // Code numérique simple - le backend déterminera restaurant et table
        restaurantId = codeData.trim();
      }
    }
    
    if (restaurantId) {
      // Naviguer vers le menu client
      router.push({
        pathname: `/menu/client/${restaurantId}` as any,
        params: { 
          table: tableNumber,
          code: codeData // Passer le code original pour que le backend puisse le traiter
        }
      });
    } else {
      Alert.alert(
        'Code invalide', 
        'Le code saisi ne correspond pas à un restaurant valide'
      );
    }
  };

  if (showScanner) {
    return (
      <QRScanner
        onScanSuccess={handleScanSuccess}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: statusBarHeight }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.header}>
        <Text style={styles.title}>Eat&Go</Text>
        <Text style={styles.subtitle}>Commandez facilement</Text>
        {user && (
          <Text style={styles.welcome}>
            Bonjour {user.first_name} ! 👋
          </Text>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.scannerCard}>
          <Ionicons name="qr-code-outline" size={80} color="#FF6B35" />
          <Text style={styles.scannerTitle}>Accéder au menu</Text>
          <Text style={styles.scannerDescription}>
            Scannez le QR code de votre table ou entrez le code d'accès
          </Text>
          
          <View style={styles.buttonContainer}>
            <Pressable 
              style={[styles.actionButton, styles.primaryButton]} 
              onPress={() => setShowScanner(true)}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Scanner QR</Text>
            </Pressable>
            
            <Pressable 
              style={[styles.actionButton, styles.secondaryButton]} 
              onPress={() => setShowCodeInput(true)}
            >
              <Ionicons name="keypad" size={20} color="#FF6B35" />
              <Text style={styles.secondaryButtonText}>Entrer le code</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Actions rapides</Text>
          
          <Pressable 
            style={styles.quickActionButton}
            onPress={() => router.push('/(client)/browse')}
          >
            <Ionicons name="restaurant-outline" size={24} color="#666" />
            <Text style={styles.quickActionButtonText}>Parcourir les restaurants</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
          
          <Pressable 
            style={styles.quickActionButton}
            onPress={() => router.push('/(client)/orders')}
          >
            <Ionicons name="receipt-outline" size={24} color="#666" />
            <Text style={styles.quickActionButtonText}>Mes commandes</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </Pressable>
        </View>
      </View>

      {/* Modal pour saisir le code */}
      <Modal
        visible={showCodeInput}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCodeInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Entrer le code d'accès</Text>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setShowCodeInput(false)}
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
              />
              <Text style={styles.inputHint}>
                Entrez le code affiché sur votre table
              </Text>
            </View>
            
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowCodeInput(false)}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </Pressable>
              
              <Pressable
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleManualCodeSubmit}
              >
                <Text style={styles.confirmButtonText}>Valider</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF6B35',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  welcome: {
    fontSize: 16,
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  scannerCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  scannerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  scannerDescription: {
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
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
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
  quickActions: {
    flex: 1,
  },
  quickActionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  quickActionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
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