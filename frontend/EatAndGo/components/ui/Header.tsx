import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ViewStyle,
  Animated,
  Platform,
  StyleSheet,
  StatusBar,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  useScreenType,
  COMPONENT_CONSTANTS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  makeShadows,
  getResponsiveValue,
} from '@/utils/designSystem';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';

// ─── Palette du Header selon le thème ─────────────────────────────────────
//
// L'identité de marque (navy + or) est conservée DANS LES DEUX MODES, c'est
// la signature EatQuickeR. Seules quelques nuances s'adaptent :
//  - LIGHT : navy classique du logo (#1E2A78), header très visible sur l'app claire
//  - DARK  : navy plus profond pour s'harmoniser au fond quasi-noir et éviter
//            l'effet "bandeau bleu vif posé sur fond noir"
// L'or D4AF37 reste identique : c'est notre accent universel.
function getHeaderPalette(isDark: boolean) {
  if (isDark) {
    return {
      bg: '#0F1528',          // navy très profond = colors.surface du dark
      surface: '#1A2347',     // boutons icône légèrement plus clairs
      border: '#2A375C',      // séparateurs subtils
      accent: '#D4AF37',      // or signature
      accentMuted: '#D4AF3722',
      text: '#F2EBD5',        // blanc cassé chaud (cohérent avec colors.text.primary du dark)
      textSub: 'rgba(242, 235, 213, 0.55)',
      badgeBg: '#D4AF37',
      badgeText: '#0F1528',
    };
  }
  return {
    bg: '#1E2A78',           // navy classique du logo
    surface: '#2938A3',      // bleu accent pour les boutons icône
    border: '#3B4695',       // séparateurs
    accent: '#D4AF37',       // or signature
    accentMuted: '#D4AF3722',
    text: '#FFFFFF',         // blanc pur sur fond navy
    textSub: 'rgba(255,255,255,0.55)',
    badgeBg: '#D4AF37',
    badgeText: '#111111',
  };
}

type HeaderPalette = ReturnType<typeof getHeaderPalette>;

interface RightAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  badge?: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightBadge?: string;
  rightActions?: RightAction[];
  onLeftPress?: () => void;
  onRightPress?: () => void;
  backgroundColor?: string;
  includeSafeArea?: boolean;
  showLogout?: boolean;
  logoutPosition?: 'left' | 'right';
  /** Affiche le bouton de switch de thème (clair/sombre) dans la zone droite. */
  showThemeSwitcher?: boolean;
  /** Affiche le bouton de switch de langue (drapeau + code) dans la zone droite. */
  showLanguageSwitcher?: boolean;
}

export const Header: React.FC<HeaderProps> = (props) => {
  const { logout } = useAuth();
  const { isDark } = useAppTheme();
  const palette = useMemo(() => getHeaderPalette(isDark), [isDark]);

  const {
    title,
    subtitle,
    showBackButton = false,
    leftIcon,
    rightIcon,
    rightBadge,
    rightActions,
    onLeftPress,
    onRightPress,
    backgroundColor,
    includeSafeArea = true,
    showLogout = false,
    logoutPosition = 'right',
    showThemeSwitcher = false,
    showLanguageSwitcher = false,
  } = props;

  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const headerHeight = COMPONENT_CONSTANTS.headerHeight[screenType];

  // ── Animations ────────────────────────────────────────────────────────
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY       = useRef(new Animated.Value(10)).current;
  const accentWidth  = useRef(new Animated.Value(0)).current;
  const headerScale  = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    titleOpacity.setValue(0);
    titleY.setValue(10);
    accentWidth.setValue(0);
    headerScale.setValue(0.98);

    Animated.parallel([
      Animated.spring(headerScale, {
        toValue: 1,
        tension: 120,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(40),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.spring(titleY, {
            toValue: 0,
            tension: 140,
            friction: 12,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(accentWidth, {
          toValue: 1,
          duration: 450,
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  }, [title]);

  const handleLeftPress = () => {
    if (onLeftPress) onLeftPress();
    else if (showBackButton) router.back();
  };

  const resolvedBg = backgroundColor ?? palette.bg;
  const fs = screenType === 'desktop' ? 22 : screenType === 'tablet' ? 20 : 18;

  const shadowStyle: ViewStyle = Platform.select({
    ios: {
      shadowColor: palette.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.35 : 0.2,
      shadowRadius: 14,
    },
    android: { elevation: 12 },
  }) ?? {};

  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <>
      {/* Icônes système (heure, batterie…) toujours en blanc — fond du header sombre */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={resolvedBg}
        translucent={false}
      />

      {includeSafeArea && insets.top > 0 && (
        <View style={{ height: insets.top, backgroundColor: resolvedBg }} />
      )}

      <Animated.View
        style={[
          { backgroundColor: resolvedBg, zIndex: 20, ...shadowStyle },
          { transform: [{ scaleY: headerScale }] },
        ]}
      >
        <View
          style={[
            styles.row,
            {
              height: headerHeight,
              paddingHorizontal: screenType === 'mobile' ? 12 : 20,
            },
          ]}
        >
          {/* Gauche */}
          <View style={styles.side}>
            {(showBackButton || leftIcon) && (
              <IconButton
                icon={(leftIcon || 'arrow-back') as keyof typeof Ionicons.glyphMap}
                onPress={handleLeftPress}
                palette={palette}
              />
            )}
            {showLogout && logoutPosition === 'left' && (
              <IconButton icon="log-out-outline" onPress={logout} palette={palette} />
            )}
          </View>

          {/* Centre */}
          <View style={styles.center}>
            <Animated.Text
              numberOfLines={1}
              accessibilityRole="header"
              style={[
                styles.title,
                { fontSize: fs, opacity: titleOpacity, transform: [{ translateY: titleY }] },
              ]}
            >
              {title}
            </Animated.Text>
            {!!subtitle && (
              <Animated.Text numberOfLines={1} style={[styles.subtitle, { opacity: titleOpacity }]}>
                {subtitle}
              </Animated.Text>
            )}
          </View>

          {/* Droite : ordre = langue → thème → autres actions/icon → logout/right */}
          <View style={[styles.side, styles.sideRight]}>
            {showLanguageSwitcher && <HeaderLanguageButton palette={palette} />}
            {showThemeSwitcher && <HeaderThemeButton palette={palette} />}
            {showLogout && logoutPosition === 'right' && (
              <IconButton icon="log-out-outline" onPress={logout} palette={palette} />
            )}
            {rightActions && rightActions.length > 0
              ? rightActions.map((action, i) => (
                  <IconButton
                    key={i}
                    icon={action.icon}
                    onPress={action.onPress}
                    disabled={action.disabled || action.loading}
                    badge={action.badge}
                    palette={palette}
                  />
                ))
              : rightIcon
              ? <IconButton icon={rightIcon} onPress={onRightPress} badge={rightBadge} palette={palette} />
              : null}
          </View>
        </View>

        {/* ── Barre d'accent dorée animée ──────────────────────────────── */}
        <View style={styles.accentTrack}>
          <Animated.View
            style={[
              styles.accentBar,
              {
                width: accentWidth.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </Animated.View>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// IconButton — bouton 40x40 navy avec spring au press
// ─────────────────────────────────────────────────────────────────────────
const IconButton: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: (() => void) | (() => Promise<void>);
  disabled?: boolean;
  badge?: string;
  palette: HeaderPalette;
  iconColor?: string;
}> = ({ icon, onPress, disabled, badge, palette, iconColor }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.82, tension: 220, friction: 8, useNativeDriver: true }).start();

  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 220, friction: 8, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      style={[
        {
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.border,
        },
        disabled && { opacity: 0.35 },
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={icon} size={21} color={iconColor ?? palette.text} />
      </Animated.View>
      {badge && (
        <View
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            backgroundColor: palette.badgeBg,
            borderRadius: 7,
            minWidth: 14,
            height: 14,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 3,
            borderWidth: 1.5,
            borderColor: palette.bg,
          }}
        >
          <Text style={{ color: palette.badgeText, fontSize: 9, fontWeight: '800' }}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// HeaderThemeButton — toggle direct light ↔ dark
//
// Affiche l'icône de LA DESTINATION (moon en light, sun en dark) — c'est ce
// que va devenir l'app au tap, pas l'état actuel. L'icône est en or pour
// signaler que c'est un contrôle "premium" lié à l'identité visuelle.
// ─────────────────────────────────────────────────────────────────────────
const HeaderThemeButton: React.FC<{ palette: HeaderPalette }> = ({ palette }) => {
  const { isDark, toggle, isLoading } = useTheme();

  return (
    <IconButton
      icon={isDark ? 'sunny' : 'moon'}
      onPress={() => toggle()}
      disabled={isLoading}
      palette={palette}
      // L'icône en or doré sur le fond navy crée un petit accent "couronne"
      iconColor={palette.accent}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────
// HeaderLanguageButton — affiche le drapeau + code et ouvre une modal de
// sélection. Le bouton est cohérent avec le style des IconButton mais un
// peu plus large pour loger le code 2 lettres.
// ─────────────────────────────────────────────────────────────────────────
const HeaderLanguageButton: React.FC<{ palette: HeaderPalette }> = ({ palette }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { language, languageInfo, setLanguage, isLoading } = useLanguage();
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  const [open, setOpen] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.86, tension: 220, friction: 8, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 220, friction: 8, useNativeDriver: true }).start();

  const handleSelect = async (code: LanguageCode) => {
    setOpen(false);
    if (code === language) return;
    try {
      await setLanguage(code);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[HeaderLanguageButton] setLanguage failed', e);
    }
  };

  const modalStyles = useMemo(() => createModalStyles(colors, screenType), [colors, screenType]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.language')}
        disabled={isLoading}
        onPress={() => setOpen(true)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          {
            height: 40,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            borderRadius: 12,
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.border,
          },
          isLoading && { opacity: 0.35 },
        ]}
      >
        <Animated.View style={{ transform: [{ scale }], flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 16 }}>{languageInfo.flag}</Text>
          <Text style={{ color: palette.text, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>
            {language.toUpperCase()}
          </Text>
        </Animated.View>
      </Pressable>

      {/* Modal de sélection — utilise les couleurs du thème principal */}
      <Modal
        visible={open}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={modalStyles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              modalStyles.sheet,
              shadows.lg,
              {
                paddingBottom:
                  Math.max(insets.bottom, getResponsiveValue(SPACING.lg, screenType)) +
                  getResponsiveValue(SPACING.md, screenType),
              },
            ]}
            onPress={() => {
              /* avale les taps pour ne pas fermer */
            }}
          >
            <View style={modalStyles.handle} />

            <View style={modalStyles.sheetHeader}>
              <Text style={modalStyles.sheetTitle}>{t('profile.language')}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <FlatList
              data={SUPPORTED_LANGUAGES as unknown as typeof SUPPORTED_LANGUAGES[number][]}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = item.code === language;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => handleSelect(item.code as LanguageCode)}
                    style={({ pressed }) => [
                      modalStyles.langRow,
                      active && modalStyles.langRowActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={modalStyles.langFlag}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[modalStyles.langNative, active && modalStyles.langNativeActive]}
                        numberOfLines={1}
                      >
                        {item.nativeLabel}
                      </Text>
                      <Text style={modalStyles.langLabel} numberOfLines={1}>
                        {item.label}
                        {item.rtl ? ' · RTL' : ''}
                      </Text>
                    </View>
                    {active && (
                      <Ionicons name="checkmark-circle" size={22} color={colors.secondary} />
                    )}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={modalStyles.separator} />}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

// ─── Styles dynamiques pour la modal langue ───────────────────────────────
const createModalStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  screenType: 'mobile' | 'tablet' | 'desktop',
) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      maxHeight: '85%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.default,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.light,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    sheetTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
    },
    langRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.lg,
    },
    langRowActive: {
      backgroundColor: colors.goldenSurface,
    },
    langFlag: { fontSize: 28 },
    langNative: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    langNativeActive: {
      color: colors.secondary,
    },
    langLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginTop: 2,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border.light,
      marginHorizontal: getResponsiveValue(SPACING.sm, screenType),
    },
  });

// ─── Styles statiques du Header (dépendent de la palette) ─────────────────
const createStyles = (palette: HeaderPalette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    side: {
      width: 52,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    sideRight: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
      // Le côté droit doit pouvoir s'étendre quand on a 2-3 boutons (langue + thème + action)
      width: 'auto',
      flexShrink: 0,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    title: {
      fontWeight: '800',
      color: palette.text,
      textAlign: 'center',
      letterSpacing: 0.8,
    },
    subtitle: {
      marginTop: 3,
      fontSize: 11,
      fontWeight: '500',
      color: palette.textSub,
      textAlign: 'center',
      letterSpacing: 0.4,
    },
    accentTrack: {
      height: 2,
      backgroundColor: palette.border,
      overflow: 'hidden',
    },
    accentBar: {
      height: '100%',
      backgroundColor: palette.accent,
      ...Platform.select({
        ios: {
          shadowColor: palette.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 6,
        },
      }),
    },
  });