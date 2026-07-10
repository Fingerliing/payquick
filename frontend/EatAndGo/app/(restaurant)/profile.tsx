import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { legalService } from '@/services/legalService';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import StripeAccountStatus from '@/components/stripe/StripeAccountStatus';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

/** ---------- Utilitaires alertes (bannières empilables) ---------- */
type AlertItem = {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
};

const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const pushAlert = useCallback(
    (variant: AlertItem['variant'], title: string | undefined, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts(prev => [{ id, variant, title, message }, ...prev]);
    },
    []
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return { alerts, pushAlert, dismissAlert };
};

const APP_VERSION = '1.0.0';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { user, logout, isRestaurateur } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { alerts, pushAlert, dismissAlert } = useAlerts();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Configuration responsive
  const layoutConfig = useMemo(() => ({
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 600 : undefined,
    avatarSize: getResponsiveValue(
      { mobile: 80, tablet: 100, desktop: 120 },
      screenType,
    ),
    isTabletLandscape: screenType === 'tablet' && width > 1000,
  }), [screenType, width]);

  const performLogout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch (error) {
      pushAlert('error', t('common.error'), t('restaurantProfile.feedback.logoutFailed'));
    } finally {
      setIsLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  }, [logout, pushAlert, t]);

  const handleLogout = useCallback(() => {
    setLogoutConfirmOpen(true);
  }, []);

  // ── Suppression de compte (App Store Guideline 5.1.1(v) / RGPD art. 17) ──
  // Suppression définitive avec période d'annulation de 30 jours (l'API
  // désactive le compte immédiatement ; se reconnecter avant l'échéance
  // annule la demande).
  const performDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    try {
      await legalService.requestAccountDeletion();
      setDeleteConfirmOpen(false);
      await logout();
      router.replace('/(auth)/login');
    } catch (error: any) {
      setDeleteConfirmOpen(false);
      const backendMessage =
        error?.response?.data?.message || error?.response?.data?.error;
      pushAlert(
        'error',
        t('common.error'),
        backendMessage || t('profile.deleteAccountError'),
      );
    } finally {
      setIsDeleting(false);
    }
  }, [logout, pushAlert, t]);

  const handleDeleteAccount = useCallback(() => {
    setDeleteConfirmOpen(true);
  }, []);

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const words = name.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const getPhone = () => {
    if (user?.profile?.type === 'client') {
      return (user.profile as any).phone;
    }
    if (user?.profile?.type === 'restaurateur') {
      return (user.profile as any).telephone;
    }
    return null;
  };

  const getSiret = () => {
    if (user?.profile?.type === 'restaurateur') {
      return (user.profile as any).siret;
    }
    return null;
  };

  // Styles theme-aware mémoizés
  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType, layoutConfig),
    [colors, isDark, screenType, layoutConfig],
  );

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 18, desktop: 20 },
    screenType,
  );

  return (
    <View style={styles.container}>
      <Header
        title={t('restaurantNav.profile')}
        showLanguageSwitcher
        showThemeSwitcher
      />

      {/* Bannières d'alertes (success / error / info / warning) */}
      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map(a => (
            <InlineAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id)}
            />
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.scrollContent}>

            {/* Carte profil principal */}
            <Card style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(user?.first_name || 'U')}
                </Text>
              </View>

              <Text style={styles.userName}>
                {user?.first_name || t('restaurantProfile.fallbackUserName')}
              </Text>

              <Text style={styles.userEmail}>
                {user?.email}
              </Text>

              {user?.role && (
                <View style={styles.roleBadge}>
                  <Ionicons
                    name={user.role === 'restaurateur' ? 'restaurant' : 'person'}
                    size={iconSize}
                    color={colors.secondary}
                  />
                  <Text style={styles.roleBadgeText}>
                    {user.role === 'restaurateur'
                      ? t('restaurantProfile.role.restaurateur')
                      : t('restaurantProfile.role.client')}
                  </Text>
                </View>
              )}
            </Card>

            {/* Section Stripe pour les restaurateurs */}
            {isRestaurateur && (
              <View style={styles.stripeSection}>
                <StripeAccountStatus />
              </View>
            )}

            {/* Informations détaillées */}
            <Card style={styles.infoCard}>
              <Text style={styles.sectionTitle}>
                {t('restaurantProfile.accountInfo')}
              </Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('restaurantProfile.email')}</Text>
                <Text style={styles.infoValue}>{user?.email}</Text>
              </View>

              {getPhone() && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t('restaurantProfile.phone')}</Text>
                  <Text style={styles.infoValue}>{getPhone()}</Text>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('restaurantProfile.accountType')}</Text>
                <Text style={styles.infoValue}>
                  {user?.role === 'restaurateur'
                    ? t('restaurantProfile.role.restaurateur')
                    : t('restaurantProfile.role.client')}
                </Text>
              </View>

              {getSiret() && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t('restaurantProfile.siret')}</Text>
                  <Text style={styles.infoValue}>{getSiret()}</Text>
                </View>
              )}

              {isRestaurateur && (
                <View style={[styles.infoRow, styles.infoRowLast]}>
                  <Text style={styles.infoLabel}>{t('restaurantProfile.stripeStatus')}</Text>
                  <Text
                    style={[
                      styles.statusValue,
                      {
                        color: user?.roles?.has_validated_profile
                          ? colors.success
                          : colors.warning,
                      },
                    ]}
                  >
                    {user?.roles?.has_validated_profile
                      ? t('restaurantProfile.stripeValidated')
                      : t('restaurantProfile.stripePending')}
                  </Text>
                </View>
              )}
            </Card>

            <View style={styles.actionsSection}>
              <Button
                title={t('restaurantProfile.logout')}
                onPress={handleLogout}
                loading={isLoggingOut}
                fullWidth
                leftIcon={
                  <Ionicons name="log-out-outline" size={20} color={colors.text.inverse} />
                }
                style={styles.logoutButton}
                textStyle={styles.logoutButtonText}
              />

              {/* Suppression de compte — requise par la Guideline 5.1.1(v) */}
              <Button
                title={t('profile.deleteAccount')}
                onPress={handleDeleteAccount}
                loading={isDeleting}
                fullWidth
                leftIcon={
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                }
                style={styles.deleteAccountButton}
                textStyle={styles.deleteAccountButtonText}
              />
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.version}>
                EatQuickeR v{APP_VERSION}
              </Text>
            </View>

          </View>
        </View>
      </ScrollView>

      {/* Confirmation de déconnexion */}
      {logoutConfirmOpen && (
        <View style={styles.confirmContainer}>
          <AlertWithAction
            variant="warning"
            title={t('restaurantProfile.logoutConfirmTitle')}
            message={t('restaurantProfile.logoutConfirmMessage')}
            secondaryButton={{
              text: t('common.cancel'),
              onPress: () => setLogoutConfirmOpen(false),
            }}
            primaryButton={{
              text: t('restaurantProfile.logout'),
              onPress: performLogout,
              variant: 'danger',
            }}
          />
        </View>
      )}

      {/* Confirmation de suppression de compte */}
      {deleteConfirmOpen && (
        <View style={styles.confirmContainer}>
          <AlertWithAction
            variant="error"
            title={t('profile.deleteAccountConfirmTitle')}
            message={t('profile.deleteAccountConfirmMessage')}
            secondaryButton={{
              text: t('common.cancel'),
              onPress: () => setDeleteConfirmOpen(false),
            }}
            primaryButton={{
              text: t('profile.deleteAccount'),
              onPress: performDeleteAccount,
              variant: 'danger',
            }}
          />
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ScreenType,
  layoutConfig: { containerPadding: number; maxContentWidth?: number; avatarSize: number },
) => {
  return {
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    content: {
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    scrollContent: {
      padding: layoutConfig.containerPadding,
      paddingBottom: getResponsiveValue(SPACING['2xl'], screenType),
    },

    profileCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center' as const,
      shadowColor: colors.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    avatar: {
      width: layoutConfig.avatarSize,
      height: layoutConfig.avatarSize,
      borderRadius: layoutConfig.avatarSize / 2,
      backgroundColor: colors.primary,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 3,
      borderColor: colors.secondary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },

    avatarText: {
      fontSize: getResponsiveValue(
        { mobile: 28, tablet: 36, desktop: 42 },
        screenType,
      ),
      fontWeight: '700' as const,
      color: colors.text.inverse,
    },

    userName: {
      fontSize: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType,
      ),
      fontWeight: '700' as const,
      // En dark, titre du nom en or chaud pour l'effet "premium" cohérent
      color: isDark ? colors.text.golden : colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
    },

    userEmail: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType,
      ),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },

    roleBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: colors.secondary + '20',
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.secondary + '40',
      gap: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    roleBadgeText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      color: colors.secondary,
      fontWeight: '600' as const,
    },

    stripeSection: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    infoCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: colors.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border.light,
    },

    sectionTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType,
      ),
      fontWeight: '600' as const,
      // Titres de section en or chaud en dark (continuité de la migration client)
      color: isDark ? colors.text.golden : colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    infoRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },

    infoRowLast: {
      borderBottomWidth: 0,
    },

    infoLabel: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      color: colors.text.secondary,
      flex: 1,
    },

    infoValue: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      color: colors.text.primary,
      fontWeight: '500' as const,
      flex: 2,
      textAlign: 'right' as const,
    },

    statusValue: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      fontWeight: '500' as const,
      flex: 2,
      textAlign: 'right' as const,
    },

    actionsSection: {
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    logoutButton: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },

    logoutButtonText: {
      color: colors.text.inverse,
    },

    deleteAccountButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.error,
    },

    deleteAccountButtonText: {
      color: colors.error,
    },

    footer: {
      alignItems: 'center' as const,
    },

    version: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType,
      ),
      color: colors.text.light,
      textAlign: 'center' as const,
    },

    alertsContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
    },

    confirmContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
    },
  };
};