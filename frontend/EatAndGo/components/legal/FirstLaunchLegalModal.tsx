import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

const LEGAL_VERSION = '1.0.0';
const STORAGE_KEY = 'legal_acceptance';

interface LegalAcceptance {
  version: string;
  acceptedAt: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export function FirstLaunchLegalModal() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [hasReadPrivacy, setHasReadPrivacy] = useState(false);

  useEffect(() => {
    checkLegalAcceptance();
  }, []);

  const checkLegalAcceptance = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setVisible(true);
        return;
      }

      const acceptance: LegalAcceptance = JSON.parse(stored);
      
      // Vérifier si la version a changé
      if (acceptance.version !== LEGAL_VERSION) {
        setVisible(true);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification:', error);
      setVisible(true);
    }
  };

  const handleReadTerms = () => {
    setHasReadTerms(true);
    router.push('/(legal)/terms');
  };

  const handleReadPrivacy = () => {
    setHasReadPrivacy(true);
    router.push('/(legal)/privacy');
  };

  const handleAccept = async () => {
    if (!hasReadTerms || !hasReadPrivacy) {
      alert('Veuillez lire les deux documents avant d\'accepter');
      return;
    }

    const acceptance: LegalAcceptance = {
      version: LEGAL_VERSION,
      acceptedAt: new Date().toISOString(),
      termsAccepted: true,
      privacyAccepted: true,
    };

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(acceptance));
      setVisible(false);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
    }
  };

  const canAccept = hasReadTerms && hasReadPrivacy;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <SafeAreaView style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* En-tête */}
            <View style={styles.header}>
              <Ionicons name="shield-checkmark" size={48} color="#1E40AF" />
              <Text style={styles.title}>Bienvenue sur Eat&Go ! 🍽️</Text>
              <Text style={styles.subtitle}>
                Avant de commencer, veuillez prendre connaissance de nos
                conditions et de notre politique de confidentialité.
              </Text>
            </View>

            {/* Documents à lire */}
            <View style={styles.documentsContainer}>
              {/* CGU */}
              <TouchableOpacity
                style={[
                  styles.documentItem,
                  hasReadTerms && styles.documentItemRead,
                ]}
                onPress={handleReadTerms}
              >
                <View style={styles.documentIcon}>
                  <Ionicons
                    name={hasReadTerms ? "checkmark-circle" : "document-text"}
                    size={28}
                    color={hasReadTerms ? "#10B981" : "#6B7280"}
                  />
                </View>
                <View style={styles.documentInfo}>
                  <Text style={styles.documentTitle}>
                    Conditions Générales d'Utilisation
                  </Text>
                  <Text style={styles.documentDescription}>
                    Vos droits et obligations lors de l'utilisation d'Eat&Go
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Politique de confidentialité */}
              <TouchableOpacity
                style={[
                  styles.documentItem,
                  hasReadPrivacy && styles.documentItemRead,
                ]}
                onPress={handleReadPrivacy}
              >
                <View style={styles.documentIcon}>
                  <Ionicons
                    name={hasReadPrivacy ? "checkmark-circle" : "shield"}
                    size={28}
                    color={hasReadPrivacy ? "#10B981" : "#6B7280"}
                  />
                </View>
                <View style={styles.documentInfo}>
                  <Text style={styles.documentTitle}>
                    Politique de Confidentialité
                  </Text>
                  <Text style={styles.documentDescription}>
                    Comment nous protégeons vos données personnelles
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Message de progression */}
            {!canAccept && (
              <View style={styles.progressMessage}>
                <Ionicons name="information-circle" size={20} color="#F59E0B" />
                <Text style={styles.progressText}>
                  Veuillez consulter les deux documents avant de continuer
                </Text>
              </View>
            )}

            {/* Boutons */}
            <View style={styles.buttonsContainer}>
              <TouchableOpacity
                style={[
                  styles.acceptButton,
                  !canAccept && styles.acceptButtonDisabled,
                ]}
                onPress={handleAccept}
                disabled={!canAccept}
              >
                <Ionicons 
                  name="checkmark-circle" 
                  size={24} 
                  color="#FFFFFF" 
                />
                <Text style={styles.acceptButtonText}>
                  J'accepte les conditions
                </Text>
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                En acceptant, vous confirmez avoir lu et compris les conditions
                d'utilisation et la politique de confidentialité.
              </Text>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  documentsContainer: {
    padding: 20,
    gap: 16,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  documentItemRead: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  documentIcon: {
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  documentDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  progressMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 8,
    gap: 8,
  },
  progressText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  buttonsContainer: {
    padding: 20,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
});