import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useClientOrders } from '@/hooks/client/useClientOrders';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { DownloadMyDataButton } from '@/components/legal/DownloadMyDataButton';
import { AlertWithAction } from '@/components/ui/Alert';
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

// =============================================================================
// ACTION ITEM — structure plate, 0 View intermédiaire
//
// Pressable (row)
//   ├── Ionicons (icon, fixe)
//   ├── Text (flex:1, titre)
//   ├── View? (badge, fixe)
//   └── Ionicons (chevron, fixe)
// =============================================================================

function ActionItem({
  icon,
  title,
  onPress,
  isLast = false,
  badge,
  comingSoon = false,
  screenType,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  onPress: () => void;
  isLast?: boolean;
  badge?: string;
  comingSoon?: boolean;
  screenType: 'mobile' | 'tablet' | 'desktop';
}) {
  return (
    <Pressable
      style={({ pressed }) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingVertical: getResponsiveValue(SPACING.md, screenType),
        paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: COLORS.border.light,
        minHeight: getResponsiveValue(
          { mobile: 48, tablet: 52, desktop: 56 },
          screenType
        ),
        opacity: comingSoon ? 0.45 : pressed ? 0.7 : 1,
        backgroundColor: pressed && !comingSoon ? COLORS.border.light + '30' : 'transparent',
      })}
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
    >
      {/* Icône */}
      <Ionicons
        name={icon}
        size={getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType)}
        color={COLORS.primary}
        style={{ marginRight: 6 }}
      />

      {/* Titre */}
      <Text
        style={{
          flex: 1,
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
          color: COLORS.text.primary,
          fontWeight: TYPOGRAPHY.fontWeight.medium,
          marginRight: 4,
        }}
      >
        {title}
      </Text>

      {/* Badge (optionnel) */}
      {badge != null && (
        <View
          style={{
            backgroundColor: COLORS.secondary,
            paddingHorizontal: 5,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.full,
            marginRight: 4,
          }}
        >
          <Text
            style={{
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
              fontWeight: TYPOGRAPHY.fontWeight.bold,
              color: COLORS.primary,
            }}
          >
            {badge}
          </Text>
        </View>
      )}

      {/* Bientôt (optionnel) */}
      {comingSoon && (
        <View
          style={{
            backgroundColor: COLORS.border.light,
            paddingHorizontal: 5,
            paddingVertical: 2,
            borderRadius: BORDER_RADIUS.full,
            marginRight: 4,
          }}
        >
          <Text
            style={{
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
              fontWeight: TYPOGRAPHY.fontWeight.semibold,
              color: COLORS.text.secondary,
            }}
          >
            Bientôt
          </Text>
        </View>
      )}

      {/* Chevron */}
      <Ionicons
        name="chevron-forward"
        size={getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType)}
        color={COLORS.text.light}
      />
    </Pressable>
  );
}

// =============================================================================
// SECTION TITLE
// =============================================================================

function SectionTitle({
  title,
  screenType,
}: {
  title: string;
  screenType: 'mobile' | 'tablet' | 'desktop';
}) {
  return (
    <Text
      style={{
        fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
        fontWeight: TYPOGRAPHY.fontWeight.bold,
        color: COLORS.text.primary,
        marginBottom: getResponsiveValue(SPACING.md, screenType),
        paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
        letterSpacing: -0.3,
      }}
    >
      {title}
    </Text>
  );
}

// =============================================================================
// PILL BADGE — réutilisable pour la carte profil
// =============================================================================

function PillBadge({
  icon,
  iconSize = 14,
  color,
  bgOpacity = '18',
  borderOpacity = '30',
  children,
  screenType,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  color: string;
  bgOpacity?: string;
  borderOpacity?: string;
  children: React.ReactNode;
  screenType: 'mobile' | 'tablet' | 'desktop';
}) {
  return (
    <View
      style={{
        backgroundColor: color + bgOpacity,
        paddingHorizontal: getResponsiveValue(
          { mobile: 8, tablet: 10, desktop: 12 },
          screenType
        ),
        paddingVertical: 4,
        borderRadius: BORDER_RADIUS.full,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: color + borderOpacity,
      }}
    >
      <Ionicons name={icon} size={iconSize} color={color} />
      <Text
        style={{
          fontSize: getResponsiveValue(
            { mobile: 12, tablet: 13, desktop: 14 },
            screenType
          ),
          color,
          fontWeight: TYPOGRAPHY.fontWeight.semibold,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

// =============================================================================
// MAIN SCREEN
// =============================================================================

export default function ClientProfileScreen() {
  const { user, logout, isClient } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();

  // useClientOrders auto-fetches on mount
  const { isLoading: ordersLoading, pagination } = useClientOrders();

  const [showLogoutAlert, setShowLogoutAlert] = useState(false);

  // ── Layout config ─────────────────────────────────────────────────────────
  const layoutConfig = useMemo(() => {
    const isTabletOrLarger = screenType !== 'mobile';
    const isDesktop = screenType === 'desktop';

    return {
      containerPadding: getResponsiveValue(SPACING.container, screenType),
      maxContentWidth: isDesktop ? 900 : isTabletOrLarger ? 720 : undefined,
      avatarSize: getResponsiveValue(
        { mobile: 80, tablet: 100, desktop: 120 },
        screenType
      ),
      cardSpacing: getResponsiveValue(SPACING.lg, screenType),
      isTabletOrLarger,
      isDesktop,
      useTwoColumns: isTabletOrLarger,
    };
  }, [screenType, width]);

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!isClient || !user) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <Header title="Profil" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: getResponsiveValue(SPACING['2xl'], screenType),
          }}
        >
          <Ionicons
            name="person-circle-outline"
            size={getResponsiveValue({ mobile: 72, tablet: 96, desktop: 120 }, screenType)}
            color={COLORS.text.light}
            style={{ marginBottom: getResponsiveValue(SPACING.xl, screenType) }}
          />
          <Text
            style={{
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
              color: COLORS.text.secondary,
              textAlign: 'center',
              marginBottom: getResponsiveValue(SPACING['2xl'], screenType),
              lineHeight: getResponsiveValue({ mobile: 22, tablet: 26, desktop: 28 }, screenType),
              maxWidth: 360,
            }}
          >
            Connectez-vous pour accéder à votre profil
          </Text>
          <Button
            title="Se connecter"
            onPress={() => router.replace('/(auth)/login')}
            variant="primary"
            fullWidth
            style={{ maxWidth: 300 }}
          />
        </View>
      </View>
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const totalOrders = ordersLoading ? '…' : pagination.total;
  const ordersLabel = `${totalOrders} commande${pagination.total !== 1 ? 's' : ''}`;

  // ── Authenticated ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header
        title="Profil"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 20) + 20,
        }}
      >
        <View
          style={{
            maxWidth: layoutConfig.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
            padding: layoutConfig.containerPadding,
          }}
        >
          {/* ────────────────────────────────────────────────────────────────
              PROFILE CARD
              Mobile  : colonne (avatar → nom → email → badges)
              Tablet+ : row    (avatar | nom + email + badges)
          ──────────────────────────────────────────────────────────────── */}
          <Card
            style={{
              marginBottom: layoutConfig.cardSpacing,
              padding: getResponsiveValue(SPACING.lg, screenType),
              flexDirection: layoutConfig.isTabletOrLarger ? 'row' : 'column',
              alignItems: 'center',
              gap: getResponsiveValue(SPACING.lg, screenType),
            }}
          >
            {/* Avatar */}
            <View
              style={{
                width: layoutConfig.avatarSize,
                height: layoutConfig.avatarSize,
                borderRadius: layoutConfig.avatarSize / 2,
                backgroundColor: COLORS.primary,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 3,
                borderColor: COLORS.secondary,
                flexShrink: 0,
                ...SHADOWS.goldenGlow,
              }}
            >
              <Text
                style={{
                  fontSize: getResponsiveValue({ mobile: 28, tablet: 36, desktop: 44 }, screenType),
                  color: COLORS.text.inverse,
                  fontWeight: TYPOGRAPHY.fontWeight.bold,
                }}
              >
                {user.first_name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>

            {/* Info — flexShrink: 1 pour que les longs emails wrappent sans déborder */}
            <View
              style={{
                flex: layoutConfig.isTabletOrLarger ? 1 : undefined,
                flexShrink: 1,
                alignItems: layoutConfig.isTabletOrLarger ? 'flex-start' : 'center',
                width: layoutConfig.isTabletOrLarger ? undefined : '100%',
              }}
            >
              {/* Nom */}
              <Text
                style={{
                  fontSize: getResponsiveValue({ mobile: 22, tablet: 26, desktop: 30 }, screenType),
                  fontWeight: TYPOGRAPHY.fontWeight.bold,
                  color: COLORS.text.primary,
                  marginBottom: 2,
                  textAlign: layoutConfig.isTabletOrLarger ? 'left' : 'center',
                }}
              >
                {user.first_name || 'Utilisateur'}
              </Text>

              {/* Email */}
              <Text
                style={{
                  fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 17 }, screenType),
                  color: COLORS.text.secondary,
                  marginBottom: getResponsiveValue(SPACING.sm, screenType),
                  textAlign: layoutConfig.isTabletOrLarger ? 'left' : 'center',
                }}
              >
                {user.email}
              </Text>

              {/* Badges — flexWrap pour passer à la ligne si écran trop étroit,
                  chaque pill est un bloc atomique donc pas de coupure mid-word */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: getResponsiveValue(SPACING.xs, screenType),
                  rowGap: getResponsiveValue(SPACING.xs, screenType),
                }}
              >
                <PillBadge
                  icon="checkmark-circle"
                  iconSize={14}
                  color={COLORS.success}
                  screenType={screenType}
                >
                  Vérifié
                </PillBadge>

                <PillBadge
                  icon="receipt"
                  iconSize={13}
                  color={COLORS.primary}
                  bgOpacity="10"
                  borderOpacity="20"
                  screenType={screenType}
                >
                  {ordersLabel}
                </PillBadge>
              </View>
            </View>
          </Card>

          {/* ────────────────────────────────────────────────────────────────
              ACTION CARDS
              Mobile  : empilées
              Tablet+ : 2 colonnes côte à côte
          ──────────────────────────────────────────────────────────────── */}
          <View
            style={{
              flexDirection: layoutConfig.useTwoColumns ? 'row' : 'column',
              gap: layoutConfig.cardSpacing,
              alignItems: layoutConfig.useTwoColumns ? 'flex-start' : 'stretch',
            }}
          >
            {/* Colonne gauche */}
            <View style={{ flex: layoutConfig.useTwoColumns ? 1 : undefined }}>
              <Card padding="card" style={{ marginBottom: layoutConfig.cardSpacing }}>
                <SectionTitle title="Mes actions" screenType={screenType} />
                <ActionItem
                  icon="receipt-outline"
                  title="Mes commandes"
                  onPress={() => router.push('/(client)/orders')}
                  badge={pagination.total > 0 ? pagination.total.toString() : undefined}
                  screenType={screenType}
                />
                <ActionItem
                  icon="notifications-outline"
                  title="Notifications"
                  onPress={() => router.push('/notifications/NotificationPreferences')}
                  screenType={screenType}
                />
                <ActionItem
                  icon="card-outline"
                  title="Paiement"
                  onPress={() => {}}
                  comingSoon
                  screenType={screenType}
                />
                <ActionItem
                  icon="settings-outline"
                  title="Paramètres"
                  onPress={() => {}}
                  isLast
                  comingSoon
                  screenType={screenType}
                />
              </Card>

              <Card padding="card" style={{ marginBottom: layoutConfig.cardSpacing }}>
                <SectionTitle title="Informations" screenType={screenType} />
                <ActionItem
                  icon="document-text-outline"
                  title="Conditions d'utilisation"
                  onPress={() => router.push('/(legal)/terms')}
                  screenType={screenType}
                />
                <ActionItem
                  icon="shield-outline"
                  title="Politique de confidentialité"
                  onPress={() => router.push('/(legal)/privacy')}
                  isLast
                  screenType={screenType}
                />
              </Card>
            </View>

            {/* Colonne droite */}
            <View
              style={{
                flex: layoutConfig.useTwoColumns ? 1 : undefined,
                minWidth: layoutConfig.useTwoColumns ? 260 : undefined,
              }}
            >
              <Card padding="card" style={{ marginBottom: layoutConfig.cardSpacing }}>
                <SectionTitle title="Support" screenType={screenType} />
                <ActionItem
                  icon="help-circle-outline"
                  title="Aide et FAQ"
                  onPress={() => {}}
                  comingSoon
                  screenType={screenType}
                />
                <ActionItem
                  icon="mail-outline"
                  title="Nous contacter"
                  onPress={() => {}}
                  isLast
                  comingSoon
                  screenType={screenType}
                />
              </Card>

              <Card padding="card" style={{ marginBottom: layoutConfig.cardSpacing }}>
                <SectionTitle title="Données personnelles" screenType={screenType} />
                <View style={{ paddingHorizontal: getResponsiveValue(SPACING.sm, screenType) }}>
                  <DownloadMyDataButton />
                </View>
              </Card>

              <Button
                title="Se déconnecter"
                onPress={() => setShowLogoutAlert(true)}
                variant="destructive"
                fullWidth
                style={{
                  minHeight: getResponsiveValue(
                    { mobile: 48, tablet: 52, desktop: 56 },
                    screenType
                  ),
                }}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Modal déconnexion ──────────────────────────────────────────── */}
      <Modal
        transparent
        visible={showLogoutAlert}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowLogoutAlert(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: getResponsiveValue(SPACING.xl, screenType),
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: getResponsiveValue(
                { mobile: 360, tablet: 420, desktop: 460 },
                screenType
              ),
            }}
          >
            <AlertWithAction
              variant="warning"
              title="Déconnexion"
              message="Êtes-vous sûr de vouloir vous déconnecter ?"
              onDismiss={() => setShowLogoutAlert(false)}
              autoDismiss={false}
              primaryButton={{
                text: 'Déconnexion',
                onPress: () => {
                  logout();
                  setShowLogoutAlert(false);
                },
                variant: 'danger',
              }}
              secondaryButton={{
                text: 'Annuler',
                onPress: () => setShowLogoutAlert(false),
              }}
            />
          </View>
        </View>
      </Modal>

      <LegalFooter />
    </View>
  );
}