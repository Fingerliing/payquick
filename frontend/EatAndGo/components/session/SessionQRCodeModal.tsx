import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Share,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Clipboard from 'expo-clipboard';

interface SessionQRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  shareCode: string;
  restaurantName: string;
  tableNumber: string;
  sessionType?: 'collaborative' | 'individual';
}

export const SessionQRCodeModal: React.FC<SessionQRCodeModalProps> = ({
  visible,
  onClose,
  shareCode,
  restaurantName,
  tableNumber,
  sessionType = 'collaborative',
}) => {
  const viewShotRef = useRef<ViewShot>(null);
  const [qrSize] = useState(250);
  const [isCapturing, setIsCapturing] = useState(false);

  // Construire l'URL pour le QR code
  // Pour web : utiliser window.location, pour mobile : utiliser une URL configurée
  const getQRUrl = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return `${window.location.origin}/join/${shareCode}`;
    }
    // Pour mobile, utiliser l'URL de votre app ou deep link
    return `eatandgo://join/${shareCode}`;
  };

  const qrUrl = getQRUrl();

  // Partager le code
  const handleShare = async () => {
    try {
      const message = `🍽️ Rejoins notre table au restaurant !\n\nRestaurant: ${restaurantName}\nTable: ${tableNumber}\n\nCode de session: ${shareCode}\n\nOu scanne ce QR code !`;

      await Share.share({
        message,
        title: 'Rejoins notre table',
      });
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Erreur', 'Impossible de partager le code');
    }
  };

  // Copier le code
  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(shareCode);
      Alert.alert('✅', 'Code copié dans le presse-papier !');
    } catch (error) {
      console.error('Error copying code:', error);
      Alert.alert('Erreur', 'Impossible de copier le code');
    }
  };

  // Télécharger le QR code
  const handleDownload = async () => {
    if (!viewShotRef.current) {
      Alert.alert('Erreur', 'Impossible de capturer le QR code');
      return;
    }

    if (isCapturing) {
      return; // Éviter les appels multiples
    }

    try {
      setIsCapturing(true);

      // Demander la permission sur mobile
      if (Platform.OS !== 'web') {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission refusée',
            'Veuillez autoriser l\'accès à la galerie pour sauvegarder le QR code'
          );
          return;
        }
      }

      // Capturer l'image
      const uri = await viewShotRef.current.capture?.();
      
      if (!uri) {
        throw new Error('Échec de la capture');
      }

      if (Platform.OS === 'web') {
        // Pour le web, télécharger directement
        const link = document.createElement('a');
        link.href = uri;
        link.download = `session-${shareCode}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert('✅', 'QR code téléchargé !');
      } else {
        // Pour mobile, sauvegarder dans la galerie
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('✅', 'QR code sauvegardé dans la galerie !');
      }
    } catch (error) {
      console.error('Error downloading QR code:', error);
      Alert.alert('Erreur', 'Erreur lors de la sauvegarde du QR code');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Partagez la session</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          {/* QR Code Container */}
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1.0 }}
            style={styles.qrContainer}
          >
            <View style={styles.qrCard}>
              {/* Logo ou icône */}
              <View style={styles.logoContainer}>
                <Ionicons name="restaurant" size={32} color="#1E2A78" />
              </View>

              {/* Infos restaurant */}
              <Text style={styles.restaurantName}>{restaurantName}</Text>
              <Text style={styles.tableNumber}>Table {tableNumber}</Text>

              {/* QR Code */}
              <View style={styles.qrWrapper}>
                <QRCode
                  value={qrUrl}
                  size={qrSize}
                  color="#1E2A78"
                  backgroundColor="white"
                />
              </View>

              {/* Code de session */}
              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>Code de session</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.code}>{shareCode}</Text>
                </View>
              </View>

              {/* Instructions */}
              <Text style={styles.instructions}>
                Scannez ce QR code ou entrez le code ci-dessus pour rejoindre
              </Text>
            </View>
          </ViewShot>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCopyCode}
            >
              <Ionicons name="copy-outline" size={24} color="#1E2A78" />
              <Text style={styles.actionText}>Copier</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleShare}
            >
              <Ionicons name="share-social-outline" size={24} color="#1E2A78" />
              <Text style={styles.actionText}>Partager</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, isCapturing && styles.actionButtonDisabled]}
              onPress={handleDownload}
              disabled={isCapturing}
            >
              <Ionicons name="download-outline" size={24} color="#1E2A78" />
              <Text style={styles.actionText}>
                {isCapturing ? '...' : 'Télécharger'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Info supplémentaire */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#1E2A78" />
            <Text style={styles.infoText}>
              {sessionType === 'collaborative'
                ? 'Mode collaboratif : Tous les participants verront les commandes de chacun'
                : 'Mode individuel : Chacun commande séparément'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E2A78',
  },
  closeButton: {
    padding: 4,
  },
  qrContainer: {
    alignItems: 'center',
  },
  qrCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E2A78',
    textAlign: 'center',
    marginBottom: 4,
  },
  tableNumber: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 20,
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  codeBox: {
    backgroundColor: '#E8EAF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  code: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1E2A78',
    letterSpacing: 6,
  },
  instructions: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 16,
  },
  actionButton: {
    alignItems: 'center',
    padding: 8,
    minWidth: 80,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionText: {
    fontSize: 12,
    color: '#1E2A78',
    marginTop: 4,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E8EAF6',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1E2A78',
    lineHeight: 18,
  },
});

// Composant simplifié pour afficher juste le code
export const SessionCodeDisplay: React.FC<{
  shareCode: string;
  onPress?: () => void;
}> = ({ shareCode, onPress }) => {
  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(shareCode);
      Alert.alert('✅', 'Code copié !');
    } catch (error) {
      console.error('Error copying:', error);
    }
  };

  return (
    <TouchableOpacity
      style={codeStyles.container}
      onPress={onPress || handleCopy}
      activeOpacity={0.7}
    >
      <View style={codeStyles.content}>
        <Ionicons name="qr-code" size={32} color="#1E2A78" />
        <View style={codeStyles.textContainer}>
          <Text style={codeStyles.label}>Code de session</Text>
          <Text style={codeStyles.code}>{shareCode}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#666" />
    </TouchableOpacity>
  );
};

const codeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8EAF6',
    padding: 16,
    borderRadius: 12,
    marginVertical: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  code: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E2A78',
    letterSpacing: 4,
  },
});

// Hook pour gérer le QR Code
export const useSessionQRCode = () => {
  const [showQRModal, setShowQRModal] = useState(false);

  const openQRModal = () => setShowQRModal(true);
  const closeQRModal = () => setShowQRModal(false);

  return {
    showQRModal,
    openQRModal,
    closeQRModal,
  };
};