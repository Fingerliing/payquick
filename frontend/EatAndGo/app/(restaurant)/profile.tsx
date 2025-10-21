import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import StripeAccountStatus from '@/components/stripe/StripeAccountStatus';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS 
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

export default function ProfileScreen() {
  const { user, logout, isRestaurateur } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 600 : undefined,
    avatarSize: getResponsiveValue(
      { mobile: 80, tablet: 100, desktop: 120 },
      screenType
    ),
    isTabletLandscape: screenType === 'tablet' && width > 1000,
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            try {
              await logout();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de se déconnecter');
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

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

  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
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

    // Carte profil principal
    profileCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center' as const,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    avatar: {
      width: layoutConfig.avatarSize,
      height: layoutConfig.avatarSize,
      borderRadius: layoutConfig.avatarSize / 2,
      backgroundColor: COLORS.primary,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 3,
      borderColor: COLORS.secondary,
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },

    avatarText: {
      fontSize: getResponsiveValue(
        { mobile: 28, tablet: 36, desktop: 42 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.surface,
    },

    userName: {
      fontSize: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
    },

    userEmail: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },

    roleBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.secondary + '20',
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.secondary + '40',
      gap: getResponsiveValue(SPACING.xs, screenType) / 2,
    },



    roleBadgeText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.secondary,
      fontWeight: '600' as const,
    },

    // Section Stripe
    stripeSection: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    // Carte informations détaillées
    infoCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    sectionTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    infoRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },

    infoRowLast: {
      borderBottomWidth: 0,
    },

    infoLabel: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
      flex: 1,
    },

    infoValue: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.primary,
      fontWeight: '500' as const,
      flex: 2,
      textAlign: 'right' as const,
    },

    statusValue: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '500' as const,
      flex: 2,
      textAlign: 'right' as const,
    },

    // Actions
    actionsSection: {
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    logoutButton: {
      backgroundColor: COLORS.error,
      borderColor: COLORS.error,
    },

    logoutButtonText: {
      color: COLORS.surface,
    },

    // Footer
    footer: {
      alignItems: 'center' as const,
    },

    version: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.light,
      textAlign: 'center' as const,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 18, desktop: 20 },
    screenType
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Profil" />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.scrollContent}>
            
            {/* Carte profil principal */}
            <Card style={styles.profileCard}>
              {/* Avatar */}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(user?.first_name || 'U')}
                </Text>
              </View>
              
              {/* Nom */}
              <Text style={styles.userName}>
                {user?.first_name || 'Utilisateur'}
              </Text>
              
              {/* Email */}
              <Text style={styles.userEmail}>
                {user?.email}
              </Text>

              {/* Badge rôle */}
              {user?.role && (
                <View style={styles.roleBadge}>
                  <Ionicons 
                    name={user.role === 'restaurateur' ? 'restaurant' : 'person'} 
                    size={iconSize} 
                    color={COLORS.secondary} 
                  />
                  <Text style={styles.roleBadgeText}>
                    {user.role === 'restaurateur' ? 'Restaurateur' : 'Client'}
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
                Informations du compte
              </Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>
                  {user?.email}
                </Text>
              </View>

              {getPhone() && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Téléphone</Text>
                  <Text style={styles.infoValue}>
                    {getPhone()}
                  </Text>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Type de compte</Text>
                <Text style={styles.infoValue}>
                  {user?.role === 'restaurateur' ? 'Restaurateur' : 'Client'}
                </Text>
              </View>

              {getSiret() && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>SIRET</Text>
                  <Text style={styles.infoValue}>
                    {getSiret()}
                  </Text>
                </View>
              )}

              {isRestaurateur && (
                <View style={[styles.infoRow, styles.infoRowLast]}>
                  <Text style={styles.infoLabel}>Statut Stripe</Text>
                  <Text style={[
                    styles.statusValue,
                    { color: user?.roles?.has_validated_profile ? COLORS.success : COLORS.warning }
                  ]}>
                    {user?.roles?.has_validated_profile ? 'Validé' : 'En attente'}
                  </Text>
                </View>
              )}
            </Card>

            {/* Actions */}
            <View style={styles.actionsSection}>
              <Button
                title="Déconnexion"
                onPress={handleLogout}
                loading={isLoggingOut}
                fullWidth
                leftIcon="log-out-outline"
                style={styles.logoutButton}
                textStyle={styles.logoutButtonText}
              />
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.version}>
                EatQuickeR v1.0.0
              </Text>
            </View>
            
          </View>
        </View>
      </ScrollView> 
    </SafeAreaView>
  );
}