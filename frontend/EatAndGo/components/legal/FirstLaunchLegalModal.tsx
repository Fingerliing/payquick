import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { markLegalAsRead } from '@/utils/legalNotifications';

const LEGAL_VERSION = '1.0.0';
const STORAGE_KEY = 'legal_acceptance';

interface LegalAcceptance {
  version: string;
  acceptedAt: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

interface FirstLaunchLegalModalProps {
  isAuthenticated?: boolean;
}

export function FirstLaunchLegalModal({ isAuthenticated = false }: FirstLaunchLegalModalProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      checkLegalAcceptance();
    } else {
      setVisible(false);
    }
  }, [isAuthenticated]);

  const checkLegalAcceptance = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) {
        console.log('📋 Aucune acceptation CGU trouvée - affichage modal');
        setVisible(true);
        return;
      }

      const acceptance: LegalAcceptance = JSON.parse(stored);
      
      if (acceptance.version !== LEGAL_VERSION) {
        console.log('📋 Version CGU obsolète - affichage modal');
        setVisible(true);
      } else {
        console.log('✅ CGU déjà acceptées - version à jour');
      }
    } catch (error) {
      console.error('Erreur lors de la vérification:', error);
      setVisible(true);
    }
  };

  const openTerms = () => {
    router.push('/(legal)/terms');
  };

  const openPrivacy = () => {
    router.push('/(legal)/privacy');
  };

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted) {
      return;
    }

    const acceptance: LegalAcceptance = {
      version: LEGAL_VERSION,
      acceptedAt: new Date().toISOString(),
      termsAccepted: true,
      privacyAccepted: true,
    };

    try {
      console.log('💾 Enregistrement de l\'acceptation des CGU');
      
      // Enregistrement dans le système de FirstLaunchLegalModal
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(acceptance));
      
      // Enregistrement dans le système legalNotifications
      await markLegalAsRead();
      
      console.log('✅ Acceptation enregistrée dans les deux systèmes');
      setVisible(false);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
    }
  };

  const canAccept = termsAccepted && privacyAccepted;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {}}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.modalContent}>
            {/* En-tête */}
            <View style={styles.header}>
              <Text style={styles.title}>Conditions d'utilisation</Text>
            </View>

            <ScrollView 
              style={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.content}>
                <Text style={styles.description}>
                  Veuillez lire et accepter les conditions suivantes pour
                  continuer à utiliser EatQuicker.
                </Text>

                {/* Checkboxes */}
                <View style={styles.checkboxContainer}>
                  {/* CGU */}
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setTermsAccepted(!termsAccepted)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.checkbox,
                      termsAccepted && styles.checkboxChecked
                    ]}>
                      {termsAccepted && (
                        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                      )}
                    </View>
                    <View style={styles.checkboxTextContainer}>
                      <Text style={styles.checkboxLabel}>
                        J'accepte les{' '}
                        <Text 
                          style={styles.link}
                          onPress={(e) => {
                            e.stopPropagation();
                            openTerms();
                          }}
                        >
                          Conditions Générales d'Utilisation
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Politique de confidentialité */}
                  <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setPrivacyAccepted(!privacyAccepted)}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      styles.checkbox,
                      privacyAccepted && styles.checkboxChecked
                    ]}>
                      {privacyAccepted && (
                        <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                      )}
                    </View>
                    <View style={styles.checkboxTextContainer}>
                      <Text style={styles.checkboxLabel}>
                        J'accepte la{' '}
                        <Text 
                          style={styles.link}
                          onPress={(e) => {
                            e.stopPropagation();
                            openPrivacy();
                          }}
                        >
                          Politique de Confidentialité
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                <Text style={styles.disclaimer}>
                  En continuant, vous confirmez avoir lu et compris ces documents.
                </Text>
              </View>
            </ScrollView>

            {/* Bouton fixe en bas */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.acceptButton,
                  !canAccept && styles.acceptButtonDisabled,
                ]}
                onPress={handleAccept}
                disabled={!canAccept}
                activeOpacity={0.8}
              >
                <Text style={styles.acceptButtonText}>Continuer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  safeArea: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalContent: {
    flex: 1,
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 24,
  },
  checkboxContainer: {
    gap: 16,
    marginBottom: 24,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  link: {
    color: '#2563EB',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  disclaimer: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  acceptButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});