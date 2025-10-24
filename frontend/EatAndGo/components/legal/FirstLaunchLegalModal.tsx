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
import { useRouter } from 'expo-router';
import { markLegalAsRead, checkLegalUpdates } from '@/utils/legalNotifications';

export function FirstLaunchLegalModal({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      checkIfNeedsAcceptance();
    } else {
      setVisible(false);
    }
  }, [isAuthenticated]);

  const checkIfNeedsAcceptance = async () => {
    const needsUpdate = await checkLegalUpdates();
    console.log('📋 Modal - Affichage nécessaire:', needsUpdate);
    setVisible(needsUpdate);
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

    try {
      console.log('💾 Utilisateur accepte les CGU');
      
      // ⭐ CRUCIAL : Enregistrer l'acceptation
      await markLegalAsRead();
      
      console.log('✅ Acceptation enregistrée - fermeture modal');
      setVisible(false);
    } catch (error) {
      console.error('Erreur lors de l\'acceptation:', error);
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
            <View style={styles.header}>
              <Text style={styles.title}>Bienvenue sur EatQuicker</Text>
            </View>

            <ScrollView 
              style={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.content}>
                <Text style={styles.description}>
                  Pour continuer, veuillez accepter nos conditions d'utilisation.
                  Vous pouvez les consulter en cliquant sur les liens ci-dessous.
                </Text>

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

                {/* Boutons de consultation rapide */}
                <View style={styles.quickLinksContainer}>
                  <Text style={styles.quickLinksTitle}>Consultez nos documents :</Text>
                  <View style={styles.quickLinksButtons}>
                    <TouchableOpacity 
                      style={styles.quickLinkButton}
                      onPress={openTerms}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="document-text-outline" size={20} color="#2563EB" />
                      <Text style={styles.quickLinkText}>Voir les CGU</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.quickLinkButton}
                      onPress={openPrivacy}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="shield-checkmark-outline" size={20} color="#2563EB" />
                      <Text style={styles.quickLinkText}>Voir la politique</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.disclaimer}>
                  En acceptant, vous confirmez avoir pris connaissance de ces documents.
                </Text>
              </View>
            </ScrollView>

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
                <Text style={styles.acceptButtonText}>
                  {canAccept ? 'Continuer' : 'Acceptez les conditions pour continuer'}
                </Text>
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
    fontSize: 22,
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
  quickLinksContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  quickLinksTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  quickLinksButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  quickLinkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickLinkText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563EB',
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