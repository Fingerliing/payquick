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
import { markLegalAsRead, checkLegalUpdates } from '@/utils/legalNotifications';
import { useLegalAcceptance } from '@/contexts/LegalAcceptanceContext';
import { COLORS, BORDER_RADIUS, SHADOWS, TYPOGRAPHY } from '@/utils/designSystem';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Clés de stockage pour les acceptations temporaires
const TERMS_ACCEPTED_KEY = '@legal_terms_temp_accepted';
const PRIVACY_ACCEPTED_KEY = '@legal_privacy_temp_accepted';

export function FirstLaunchLegalModal() {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  // Indique si nous sommes en train de naviguer vers un document
  const isNavigatingRef = useRef(false);
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
    // Si nous venons de déclencher une navigation, ne pas réafficher immédiatement
    if (isNavigatingRef.current) {
      return;
    }
    if (shouldShow) {
      setVisible(true);
    }
  }, [pathname, shouldShow]);

  // Réinitialiser le flag de navigation après un changement de route
  useEffect(() => {
    isNavigatingRef.current = false;
  }, [pathname]);

  const checkIfNeedsAcceptance = async () => {
    try {
      const needsUpdate = await checkLegalUpdates();
      console.log('📋 Modal - Affichage nécessaire:', needsUpdate);
      // Mettre à jour uniquement l'état shouldShow. L'affichage de la modal est géré ailleurs.
      setShouldShow(needsUpdate);
    } catch (error) {
      console.error('❌ Modal CGU - Erreur:', error);
      setShouldShow(true);
    }
  };

  const openTerms = () => {
    console.log('📄 Ouverture des CGU');
    // Marquer le début d'une navigation vers un document pour éviter un clignotement
    isNavigatingRef.current = true;
    // Cacher temporairement la modal pour la lecture
    setVisible(false);
    router.push('/(legal)/terms?fromModal=true');
  };

  const openPrivacy = () => {
    console.log('🛡️ Ouverture de la politique');
    // Marquer le début d'une navigation vers un document pour éviter un clignotement
    isNavigatingRef.current = true;
    // Cacher temporairement la modal pour la lecture
    setVisible(false);
    router.push('/(legal)/privacy?fromModal=true');
  };

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted) {
      return;
    }

    try {
      console.log('💾 Utilisateur accepte les CGU définitivement');
      await markLegalAsRead();

      // Réinitialiser les acceptations pour un nouveau cycle au prochain lancement
      await resetAcceptances();

      console.log('✅ Acceptation enregistrée');
      // Ne plus afficher la modal tant que l'utilisateur a validé
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
                Pour continuer, veuillez lire et accepter nos documents légaux.
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

                {/* Checkbox - lecture seule, géré par le Context */}
                <View style={styles.checkboxRow}>
                  <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                    {termsAccepted && (
                      <Ionicons name="checkmark" size={18} color={COLORS.text.inverse} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    {termsAccepted ? '✓ CGU acceptées' : 'En attente d\'acceptation'}
                  </Text>
                </View>
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

                {/* Checkbox - lecture seule, géré par le Context */}
                <View style={styles.checkboxRow}>
                  <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                    {privacyAccepted && (
                      <Ionicons name="checkmark" size={18} color={COLORS.text.inverse} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    {privacyAccepted ? '✓ Politique acceptée' : 'En attente d\'acceptation'}
                  </Text>
                </View>
              </View>

              {/* Help text */}
              <View style={styles.helpBox}>
                <Ionicons name="information-circle" size={20} color={COLORS.text.secondary} />
                <Text style={styles.helpText}>
                  Consultez et acceptez chaque document en cliquant sur "Consulter le document"
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