import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  markLegalAsRead,
  checkLegalUpdates,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  markConsentPendingSync,
  markConsentSynced,
} from '@/utils/legalNotifications';
import { useLegalAcceptance } from '@/contexts/LegalAcceptanceContext';
import { useAuth } from '@/contexts/AuthContext';
import { legalService } from '@/services/legalService';
import { COLORS, BORDER_RADIUS, SHADOWS, TYPOGRAPHY } from '@/utils/designSystem';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function FirstLaunchLegalModal() {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const { isAuthenticated } = useAuth();
  const {
    termsAccepted,
    privacyAccepted,
    setTermsAccepted,
    setPrivacyAccepted,
    acceptTerms,
    acceptPrivacy,
    resetAcceptances,
    isLoading,
  } = useLegalAcceptance();

  useEffect(() => {
    if (!isLoading) {
      console.log('📋 Modal - Vérification CGU...');
      checkIfNeedsAcceptance();
    }
  }, [isLoading]);

  // Afficher/masquer la modal en fonction de la route et de l'état shouldShow
  useEffect(() => {
    // Extraire le chemin de base sans les paramètres de requête
    const basePath = pathname?.split('?')[0] ?? '';
    const onLegalRoute = basePath.startsWith('/(legal)/terms') || basePath.startsWith('/(legal)/privacy');
    if (onLegalRoute) {
      // Pendant la lecture d'un document, masquer la modal
      setVisible(false);
      return;
    }
    if (shouldShow) {
      setVisible(true);
    }
  }, [pathname, shouldShow]);

  const checkIfNeedsAcceptance = async () => {
    try {
      const needsUpdate = await checkLegalUpdates();
      console.log('📋 Modal - Affichage nécessaire:', needsUpdate);
      setShouldShow(needsUpdate);
    } catch (error) {
      console.error('❌ Modal CGU - Erreur:', error);
      setShouldShow(true);
    }
  };

  const openTerms = () => {
    console.log('📄 Ouverture des CGU');
    setVisible(false);
    router.push('/(legal)/terms');
  };

  const openPrivacy = () => {
    console.log('🛡️ Ouverture de la politique');
    setVisible(false);
    router.push('/(legal)/privacy');
  };

  // Toggle direct des checkboxes
  const toggleTermsAccepted = async () => {
    if (termsAccepted) {
      // Si déjà accepté, on décoche (reset)
      setTermsAccepted(false);
    } else {
      // Sinon on accepte
      await acceptTerms();
    }
  };

  const togglePrivacyAccepted = async () => {
    if (privacyAccepted) {
      setPrivacyAccepted(false);
    } else {
      await acceptPrivacy();
    }
  };

  // ── Envoi du consentement au backend (preuve RGPD) ─────────────────────────
  const syncConsentToBackend = async (): Promise<boolean> => {
    try {
      await legalService.recordConsent({
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: CURRENT_PRIVACY_VERSION,
        consent_date: new Date().toISOString(),
      });
      console.log('✅ Consentement enregistré côté serveur');
      await markConsentSynced();
      return true;
    } catch (error) {
      console.warn('⚠️ Impossible d\'enregistrer le consentement côté serveur:', error);
      return false;
    }
  };

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted) {
      return;
    }

    try {
      console.log('💾 Utilisateur accepte les CGU définitivement');

      // 1. Stockage local (toujours)
      await markLegalAsRead();

      // 2. Envoi au backend (preuve RGPD)
      if (isAuthenticated) {
        const synced = await syncConsentToBackend();
        if (!synced) {
          // Échec réseau : poser un flag pour re-tenter au prochain login/refresh
          await markConsentPendingSync();
          console.log('📌 Consentement marqué pour synchro ultérieure');
        }
      } else {
        // Utilisateur non connecté : la synchro se fera automatiquement au login
        await markConsentPendingSync();
        console.log('📌 Utilisateur non authentifié — synchro différée au login');
      }

      // 3. Réinitialiser les acceptations pour un nouveau cycle au prochain lancement
      await resetAcceptances();

      console.log('✅ Acceptation enregistrée');
      setShouldShow(false);
      setVisible(false);
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
    }
  };

  const canAccept = termsAccepted && privacyAccepted;

  if (!visible || isLoading) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Bienvenue sur EatQuickeR</Text>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <ScrollView 
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.description}>
                Pour continuer, veuillez accepter nos documents légaux.
              </Text>

              {/* CGU Section */}
              <View style={styles.documentSection}>
                <View style={styles.documentHeader}>
                  <Ionicons name="document-text" size={22} color={COLORS.primary} />
                  <Text style={styles.documentName}>Conditions Générales d'Utilisation</Text>
                </View>
                
                <TouchableOpacity 
                  style={styles.viewDocumentButton}
                  onPress={openTerms}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.viewDocumentText}>Consulter le document</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                </TouchableOpacity>

                {/* Checkbox cliquable directement */}
                <TouchableOpacity 
                  style={styles.checkboxRow}
                  onPress={toggleTermsAccepted}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                    {termsAccepted && (
                      <Ionicons name="checkmark" size={18} color={COLORS.text.inverse} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    J'accepte les Conditions Générales d'Utilisation
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Privacy Section */}
              <View style={styles.documentSection}>
                <View style={styles.documentHeader}>
                  <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
                  <Text style={styles.documentName}>Politique de Confidentialité</Text>
                </View>
                
                <TouchableOpacity 
                  style={styles.viewDocumentButton}
                  onPress={openPrivacy}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.viewDocumentText}>Consulter le document</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
                </TouchableOpacity>

                {/* Checkbox cliquable directement */}
                <TouchableOpacity 
                  style={styles.checkboxRow}
                  onPress={togglePrivacyAccepted}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                    {privacyAccepted && (
                      <Ionicons name="checkmark" size={18} color={COLORS.text.inverse} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    J'accepte la Politique de Confidentialité
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Help text */}
              <View style={styles.helpBox}>
                <Ionicons name="information-circle" size={20} color={COLORS.text.secondary} />
                <Text style={styles.helpText}>
                  Vous pouvez consulter les documents avant de les accepter en cliquant sur "Consulter le document"
                </Text>
              </View>
            </ScrollView>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.acceptButton, !canAccept && styles.acceptButtonDisabled]}
              onPress={handleAccept}
              disabled={!canAccept}
              activeOpacity={0.8}
            >
              <Text style={[styles.acceptButtonText, !canAccept && styles.acceptButtonTextDisabled]}>
                {canAccept ? 'Continuer' : 'Acceptez les deux documents'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    minHeight: SCREEN_HEIGHT * 0.7,
    maxHeight: SCREEN_HEIGHT - 40,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS['3xl'],
    overflow: 'hidden',
    ...SHADOWS.xl,
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
    backgroundColor: COLORS.surface,
  },
  title: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    minHeight: 400,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
  },
  description: {
    fontSize: 15,
    color: COLORS.text.secondary,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  documentSection: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.xl,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  documentName: {
    flex: 1,
    fontSize: 16,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  viewDocumentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginBottom: 12,
    gap: 8,
  },
  viewDocumentText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border.dark,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxLabel: {
    fontSize: 15,
    color: COLORS.text.primary,
    flex: 1,
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.border.light,
    padding: 12,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: 8,
  },
  helpText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  footer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    backgroundColor: COLORS.surface,
  },
  acceptButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    ...SHADOWS.button,
  },
  acceptButtonDisabled: {
    backgroundColor: COLORS.border.default,
    ...Platform.select({
      ios: {
        shadowOpacity: 0,
      },
      android: {
        elevation: 0,
      },
    }),
  },
  acceptButtonText: {
    color: COLORS.text.inverse,
    fontSize: 16,
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },
  acceptButtonTextDisabled: {
    color: COLORS.text.light,
  },
});