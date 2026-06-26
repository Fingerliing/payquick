/**
 * AuthGateModal
 *
 * Modale affichée au moment où un utilisateur non authentifié tente de
 * passer commande. Propose trois choix :
 *
 *  1. Se connecter       → /(auth)/login?returnTo=<path>
 *  2. Créer un compte    → /(auth)/register?returnTo=<path>
 *  3. Continuer en invité → /order/guest-checkout (avec params)
 *
 * Cette modale n'est PAS un blocage : l'utilisateur a déjà vu le menu, ajouté
 * des items au panier, et choisi de commander. Elle apparaît uniquement
 * comme étape ultime avant le paiement.
 *
 * Le panier (local ou session collaborative) est conservé dans tous les cas :
 * l'utilisateur ne perd rien s'il choisit de se connecter ou créer un compte.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  type AppColors,
  BORDER_RADIUS,
  SHADOWS,
} from '@/utils/designSystem';

export interface AuthGateModalProps {
  visible: boolean;
  onClose: () => void;

  /**
   * Chemin (relatif Expo Router) vers lequel rediriger après login/register
   * réussi. Typiquement le chemin actuel (`/order/checkout` ou
   * `/menu/client/[id]`).
   */
  returnTo: string;

  /**
   * Paramètres à passer à `/order/guest-checkout` quand l'utilisateur choisit
   * "Continuer en invité". On y reflète le restaurantId, tableNumber, etc.
   */
  guestCheckoutParams?: Record<string, string | undefined>;

  /**
   * Permettre la commande en invité ? Mettre à `false` désactive le 3ᵉ choix
   * (utile par ex. dans certains contextes où l'invité n'est pas autorisé).
   * Par défaut : `true`.
   */
  allowGuest?: boolean;

  /**
   * Texte d'introduction personnalisé. Par défaut : un message neutre (i18n).
   */
  title?: string;
  subtitle?: string;
}

export const AuthGateModal: React.FC<AuthGateModalProps> = ({
  visible,
  onClose,
  returnTo,
  guestCheckoutParams,
  allowGuest = true,
  title,
  subtitle,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Défauts traduits (impossible d'appeler t() dans les valeurs par défaut
  // des props car le hook n'est dispo que dans le corps du composant).
  const titleText = title ?? t('checkout.authGate.titleSolo');
  const subtitleText = subtitle ?? t('checkout.authGate.subtitleSolo');

  const handleLogin = () => {
    onClose();
    router.push({
      pathname: '/(auth)/login' as any,
      params: { returnTo },
    });
  };

  const handleRegister = () => {
    onClose();
    router.push({
      pathname: '/(auth)/register' as any,
      params: { returnTo },
    });
  };

  const handleGuest = () => {
    onClose();

    // Filtrer les params undefined avant de les passer au router
    const cleanedParams: Record<string, string> = {};
    if (guestCheckoutParams) {
      Object.entries(guestCheckoutParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          cleanedParams[key] = String(value);
        }
      });
    }

    router.push({
      pathname: '/order/guest-checkout' as any,
      params: cleanedParams,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Poignée de modal style iOS */}
          <View style={styles.handle} />

          {/* Header avec close */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.title}>{titleText}</Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>

            {/* Option 1 : Se connecter (recommandée si compte existant) */}
            <TouchableOpacity
              style={[styles.optionCard, styles.optionCardPrimary]}
              onPress={handleLogin}
              activeOpacity={0.85}
            >
              <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                <Ionicons name="log-in-outline" size={28} color={colors.text.inverse} />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, styles.optionTitlePrimary]}>
                  {t('authGate.login')}
                </Text>
                <Text style={[styles.optionDescription, styles.optionDescriptionPrimary]}>
                  {t('authGate.loginDesc')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.text.inverse} />
            </TouchableOpacity>

            {/* Option 2 : Créer un compte */}
            <TouchableOpacity
              style={styles.optionCard}
              onPress={handleRegister}
              activeOpacity={0.85}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="person-add-outline" size={28} color={colors.primary} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{t('authGate.register')}</Text>
                <Text style={styles.optionDescription}>
                  {t('authGate.registerDesc')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.text.secondary} />
            </TouchableOpacity>

            {/* Séparateur visuel */}
            {allowGuest && (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('common.or')}</Text>
                <View style={styles.dividerLine} />
              </View>
            )}

            {/* Option 3 : Continuer en invité */}
            {allowGuest && (
              <TouchableOpacity
                style={styles.guestButton}
                onPress={handleGuest}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="walk-outline"
                  size={22}
                  color={colors.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.guestButtonText}>{t('authGate.guest')}</Text>
              </TouchableOpacity>
            )}

            {allowGuest && (
              <Text style={styles.guestHint}>
                {t('authGate.guestHint')}
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// =============================================================================
// STYLES
// =============================================================================

const createStyles = (COLORS: AppColors, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: COLORS.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: Platform.OS === 'ios' ? 40 : 24,
      maxHeight: '92%',
      ...((SHADOWS as any)?.lg || {}),
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      backgroundColor: COLORS.border.default,
      borderRadius: 2,
      marginTop: 10,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    closeButton: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: COLORS.text.primary,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: COLORS.text.secondary,
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 20,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.background,
      padding: 16,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: COLORS.border.default,
    },
    optionCardPrimary: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    optionIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    optionIconPrimary: {
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    optionTitlePrimary: {
      color: COLORS.text.inverse,
    },
    optionDescription: {
      fontSize: 13,
      color: COLORS.text.secondary,
      lineHeight: 18,
    },
    optionDescriptionPrimary: {
      color: 'rgba(255, 255, 255, 0.85)',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 16,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: COLORS.border.default,
    },
    dividerText: {
      // Le design system expose `light` (gris clair) pour cet usage,
      // pas `tertiary` qui n'existe pas dans le type COLORS.text.
      color: COLORS.text.light,
      fontSize: 13,
      marginHorizontal: 12,
      fontWeight: '500',
    },
    guestButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.surface,
      borderWidth: 1.5,
      borderColor: COLORS.primary,
      padding: 14,
      borderRadius: BORDER_RADIUS.lg,
    },
    guestButtonText: {
      color: COLORS.primary,
      fontWeight: '600',
      fontSize: 15,
    },
    guestHint: {
      fontSize: 12,
      color: COLORS.text.light,
      textAlign: 'center',
      marginTop: 12,
      lineHeight: 17,
      fontStyle: 'italic',
    },
  });

export default AuthGateModal;