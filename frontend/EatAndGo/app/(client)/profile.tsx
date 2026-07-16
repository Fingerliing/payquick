import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useClientOrders } from '@/hooks/client/useClientOrders';
import { legalService } from '@/services/legalService';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { DownloadMyDataButton } from '@/components/legal/DownloadMyDataButton';
import { AlertWithAction } from '@/components/ui/Alert';
import { ThemeSwitcher } from '@/components/common/ThemeSwitcher';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import {
  useAppTheme,
  makeShadows,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  useScreenType,
  getResponsiveValue,
  type AppColors,
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

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
  screenType: ScreenType;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <Pressable
      style={({ pressed }) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingVertical: getResponsiveValue(SPACING.md, screenType),
        paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border.light,
        minHeight: getResponsiveValue(
          { mobile: 48, tablet: 52, desktop: 56 },
          screenType
        ),
        opacity: comingSoon ? 0.45 : pressed ? 0.7 : 1,
        backgroundColor: pressed && !comingSoon ? colors.border.light + '30' : 'transparent',
      })}
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
    >
      {/* Icône */}
      <Ionicons
        name={icon}
        size={getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType)}
        color={colors.primary}
        style={{ marginRight: 6 }}
      />

      {/* Titre */}
      <Text
        style={{
          flex: 1,
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
          color: colors.text.primary,
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
            backgroundColor: colors.secondary,
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
              color: colors.primary,
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
            backgroundColor: colors.border.light,
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
              color: colors.text.secondary,
            }}
          >
            {t('common.comingSoon')}
          </Text>
        </View>
      )}

      {/* Chevron */}
      <Ionicons
        name="chevron-forward"
        size={getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType)}
        color={colors.text.light}
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
  screenType: ScreenType;
}) {
  const { colors, isDark } = useAppTheme();
  return (
    <Text
      style={{
        fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
        fontWeight: TYPOGRAPHY.fontWeight.bold,
        // En dark, on passe en or chaud pour rappeler l'identité du logo
        // sur des éléments importants (titres de section, accents).
        color: isDark ? colors.text.golden : colors.text.primary,
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
  screenType: ScreenType;
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
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { user, logout, isClient, updateProfile } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();

  // useClientOrders auto-fetches on mount
  const { isLoading: ordersLoading, pagination } = useClientOrders();

  const [showLogoutAlert, setShowLogoutAlert] = useState(false);

  // ── Suppression de compte (App Store Guideline 5.1.1(v) / RGPD art. 17) ──
  // Suppression définitive avec période d'annulation de 30 jours (l'API
  // désactive le compte immédiatement ; se reconnecter avant l'échéance
  // annule la demande).
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const performDeleteAccount = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await legalService.requestAccountDeletion();
      setShowDeleteAlert(false);
      await logout();
      router.replace('/(auth)/login');
    } catch (error: any) {
      setShowDeleteAlert(false);
      const backendMessage =
        error?.response?.data?.message || error?.response?.data?.error;
      setDeleteError(
        backendMessage ||
          t('profile.deleteAccountError', 'Impossible de supprimer le compte. Réessayez.'),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Édition du nom ────────────────────────────────────────────────────────
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);

  const openEditNameModal = () => {
    setNameInput(user?.first_name || '');
    setNameError(null);
    setShowEditNameModal(true);
  };

  const closeEditNameModal = () => {
    if (isSavingName) return; // évite de fermer pendant l'enregistrement
    setShowEditNameModal(false);
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();

    if (trimmed.length < 2) {
      setNameError(t('profile.editName.tooShort'));
      return;
    }
    if (trimmed.length > 30) {
      setNameError(t('profile.editName.tooLong'));
      return;
    }

    // Pas de changement réel → on ferme simplement
    if (trimmed === user?.first_name) {
      setShowEditNameModal(false);
      return;
    }

    setNameError(null);
    setIsSavingName(true);
    try {
      await updateProfile(trimmed);
      setShowEditNameModal(false);
    } catch (error: any) {
      setNameError(error?.message || t('profile.editName.error'));
    } finally {
      setIsSavingName(false);
    }
  };

  const shadows = useMemo(() => makeShadows(colors), [colors]);

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
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header
          title={t('profile.title')}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
          showLanguageSwitcher
          showThemeSwitcher
        />
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
            color={colors.text.light}
            style={{ marginBottom: getResponsiveValue(SPACING.xl, screenType) }}
          />
          <Text
            style={{
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
              color: colors.text.secondary,
              textAlign: 'center',
              marginBottom: getResponsiveValue(SPACING['2xl'], screenType),
              lineHeight: getResponsiveValue({ mobile: 22, tablet: 26, desktop: 28 }, screenType),
              maxWidth: 360,
            }}
          >
            {t('profile.signInPrompt')}
          </Text>
          <Button
            title={t('auth.signIn')}
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
  const ordersLabel = ordersLoading
    ? '…'
    : t('order.count', { count: pagination.total });

  // ── Authenticated ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header
        title={t('profile.title')}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        showLanguageSwitcher
        showThemeSwitcher
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
                backgroundColor: colors.primary,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 3,
                borderColor: colors.secondary,
                flexShrink: 0,
                ...shadows.goldenGlow,
              }}
            >
              <Text
                style={{
                  fontSize: getResponsiveValue({ mobile: 28, tablet: 36, desktop: 44 }, screenType),
                  color: colors.text.inverse,
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
              {/* Nom + bouton d'édition */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 2,
                  justifyContent: layoutConfig.isTabletOrLarger ? 'flex-start' : 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: getResponsiveValue({ mobile: 22, tablet: 26, desktop: 30 }, screenType),
                    fontWeight: TYPOGRAPHY.fontWeight.bold,
                    color: colors.text.primary,
                    textAlign: layoutConfig.isTabletOrLarger ? 'left' : 'center',
                  }}
                >
                  {user.first_name || t('profile.defaultName')}
                </Text>
                <Pressable
                  onPress={openEditNameModal}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.6 : 1,
                    padding: 4,
                  })}
                >
                  <Ionicons
                    name="pencil"
                    size={getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType)}
                    color={colors.text.secondary}
                  />
                </Pressable>
              </View>

              {/* Email */}
              <Text
                style={{
                  fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 17 }, screenType),
                  color: colors.text.secondary,
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
                  color={colors.success}
                  screenType={screenType}
                >
                  {t('profile.verified')}
                </PillBadge>

                <PillBadge
                  icon="receipt"
                  iconSize={13}
                  color={isDark ? colors.secondary : colors.primary}
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
                <SectionTitle title={t('profile.myActions')} screenType={screenType} />
                <ActionItem
                  icon="receipt-outline"
                  title={t('nav.orders')}
                  onPress={() => router.push('/(client)/orders')}
                  badge={pagination.total > 0 ? pagination.total.toString() : undefined}
                  screenType={screenType}
                />
                <ActionItem
                  icon="notifications-outline"
                  title={t('profile.notifications')}
                  onPress={() => router.push('/notifications/NotificationPreferences')}
                  screenType={screenType}
                />
                <ActionItem
                  icon="card-outline"
                  title={t('profile.paymentMethods')}
                  onPress={() => {}}
                  comingSoon
                  screenType={screenType}
                />
                <ActionItem
                  icon="settings-outline"
                  title={t('nav.settings')}
                  onPress={() => {}}
                  isLast
                  comingSoon
                  screenType={screenType}
                />
              </Card>

              {/* ────────────────────────────────────────────────────────────
                  PRÉFÉRENCES — Thème et Langue
                  Section ajoutée lors de la phase i18n + dark mode.
              ──────────────────────────────────────────────────────────── */}
              <Card padding="card" style={{ marginBottom: layoutConfig.cardSpacing }}>
                <SectionTitle title={t('profile.preferences')} screenType={screenType} />

                {/* Apparence (thème) */}
                <View
                  style={{
                    paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
                    paddingBottom: getResponsiveValue(SPACING.md, screenType),
                  }}
                >
                  <Text
                    style={{
                      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
                      fontWeight: TYPOGRAPHY.fontWeight.medium,
                      color: colors.text.secondary,
                      marginBottom: getResponsiveValue(SPACING.xs, screenType),
                    }}
                  >
                    {t('profile.appearance')}
                  </Text>
                  <ThemeSwitcher variant="segmented" />
                </View>

                {/* Séparateur */}
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border.light,
                    marginVertical: getResponsiveValue(SPACING.xs, screenType),
                  }}
                />

                {/* Langue */}
                <View
                  style={{
                    paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
                    paddingTop: getResponsiveValue(SPACING.md, screenType),
                  }}
                >
                  <LanguageSwitcher variant="row" />
                </View>
              </Card>

              <Card padding="card" style={{ marginBottom: layoutConfig.cardSpacing }}>
                <SectionTitle title={t('profile.information')} screenType={screenType} />
                <ActionItem
                  icon="document-text-outline"
                  title={t('profile.terms')}
                  onPress={() => router.push('/(legal)/terms')}
                  screenType={screenType}
                />
                <ActionItem
                  icon="shield-outline"
                  title={t('profile.privacy')}
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
                <SectionTitle title={t('profile.support')} screenType={screenType} />
                <ActionItem
                  icon="help-circle-outline"
                  title={t('profile.helpFaq')}
                  onPress={() => {}}
                  comingSoon
                  screenType={screenType}
                />
                <ActionItem
                  icon="mail-outline"
                  title={t('profile.contactUs')}
                  onPress={() => {}}
                  isLast
                  comingSoon
                  screenType={screenType}
                />
              </Card>

              <Card padding="card" style={{ marginBottom: layoutConfig.cardSpacing }}>
                <SectionTitle title={t('profile.personalData')} screenType={screenType} />
                <View style={{ paddingHorizontal: getResponsiveValue(SPACING.sm, screenType) }}>
                  <DownloadMyDataButton />
                </View>
              </Card>

              <Button
                title={t('auth.signOut')}
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

              {/* Suppression de compte — requise par la Guideline 5.1.1(v) */}
              <Button
                title={t('profile.deleteAccount', 'Supprimer mon compte')}
                onPress={() => setShowDeleteAlert(true)}
                variant="outline"
                fullWidth
                leftIcon={
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                }
                style={{
                  marginTop: getResponsiveValue(SPACING.sm, screenType),
                  minHeight: getResponsiveValue(
                    { mobile: 48, tablet: 52, desktop: 56 },
                    screenType
                  ),
                  borderColor: colors.error,
                }}
                textStyle={{ color: colors.error }}
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
            backgroundColor: colors.overlay,
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
              title={t('auth.signOut')}
              message={t('profile.logoutConfirm')}
              onDismiss={() => setShowLogoutAlert(false)}
              autoDismiss={false}
              primaryButton={{
                text: t('auth.signOut'),
                onPress: () => {
                  logout();
                  setShowLogoutAlert(false);
                },
                variant: 'danger',
              }}
              secondaryButton={{
                text: t('common.cancel'),
                onPress: () => setShowLogoutAlert(false),
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Modal suppression de compte (Guideline 5.1.1(v)) ───────────── */}
      <Modal
        transparent
        visible={showDeleteAlert}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !isDeleting && setShowDeleteAlert(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.overlay,
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
              variant="error"
              title={t('profile.deleteAccountConfirmTitle', 'Supprimer votre compte ?')}
              message={t(
                'profile.deleteAccountConfirmMessage',
                'Votre compte et toutes vos données personnelles seront définitivement supprimés. Vous disposez de 30 jours pour annuler en vous reconnectant ; passé ce délai, la suppression est irréversible.',
              )}
              onDismiss={() => !isDeleting && setShowDeleteAlert(false)}
              autoDismiss={false}
              primaryButton={{
                text: t('profile.deleteAccount', 'Supprimer mon compte'),
                onPress: performDeleteAccount,
                variant: 'danger',
              }}
              secondaryButton={{
                text: t('common.cancel'),
                onPress: () => !isDeleting && setShowDeleteAlert(false),
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Modal erreur suppression de compte ─────────────────────────── */}
      <Modal
        transparent
        visible={deleteError != null}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setDeleteError(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.overlay,
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
              variant="error"
              title={t('common.error')}
              message={deleteError ?? ''}
              onDismiss={() => setDeleteError(null)}
              autoDismiss={false}
              primaryButton={{
                text: t('common.ok'),
                onPress: () => setDeleteError(null),
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Modal édition du nom ───────────────────────────────────────── */}
      <Modal
        transparent
        visible={showEditNameModal}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeEditNameModal}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.overlay,
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
              <Card padding="card">
                <Text
                  style={{
                    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
                    fontWeight: TYPOGRAPHY.fontWeight.bold,
                    color: colors.text.primary,
                    marginBottom: getResponsiveValue(SPACING.md, screenType),
                  }}
                >
                  {t('profile.editName.title')}
                </Text>

                <TextInput
                  value={nameInput}
                  onChangeText={(text) => {
                    setNameInput(text);
                    if (nameError) setNameError(null);
                  }}
                  placeholder={t('profile.editName.placeholder')}
                  placeholderTextColor={colors.text.secondary + '80'}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={30}
                  editable={!isSavingName}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                  style={{
                    borderWidth: 1,
                    borderColor: nameError ? colors.error : colors.border.light,
                    borderRadius: BORDER_RADIUS.md,
                    paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
                    paddingVertical: getResponsiveValue(SPACING.sm, screenType),
                    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
                    color: colors.text.primary,
                    backgroundColor: colors.background,
                  }}
                />

                {nameError && (
                  <Text
                    style={{
                      color: colors.error,
                      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
                      marginTop: getResponsiveValue(SPACING.xs, screenType),
                    }}
                  >
                    {nameError}
                  </Text>
                )}

                <View
                  style={{
                    flexDirection: 'row',
                    gap: getResponsiveValue(SPACING.sm, screenType),
                    marginTop: getResponsiveValue(SPACING.lg, screenType),
                  }}
                >
                  <Button
                    title={t('common.cancel')}
                    onPress={closeEditNameModal}
                    variant="secondary"
                    fullWidth
                    disabled={isSavingName}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title={t('common.save')}
                    onPress={handleSaveName}
                    variant="primary"
                    fullWidth
                    loading={isSavingName}
                    disabled={isSavingName || nameInput.trim().length < 2}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <LegalFooter />
    </View>
  );
}