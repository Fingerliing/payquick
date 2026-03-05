import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ViewStyle,
  Animated,
  Platform,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, useScreenType, COMPONENT_CONSTANTS } from '@/utils/designSystem';
import { useAuth } from '@/contexts/AuthContext';

// ─── Palette charte graphique ──────────────────────────────────────────────────
const DARK = {
  bg: '#1E2A78',           // Bleu principal de la charte
  surface: '#2938A3',      // Bleu accent (primary_accent) pour les boutons
  border: '#3B4695',       // Bleu clair (primary_light) pour les séparateurs
  accent: '#D4AF37',       // Or classique (secondary) — accent principal
  accentMuted: '#D4AF3722',
  text: '#FFFFFF',         // Blanc pur sur fond bleu
  textSub: 'rgba(255,255,255,0.55)', // Blanc semi-transparent pour le sous-titre
  badgeBg: '#D4AF37',      // Badge en or
};

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
}

export const Header: React.FC<HeaderProps> = (props) => {
  const { logout } = useAuth();
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
  } = props;

  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const headerHeight = COMPONENT_CONSTANTS.headerHeight[screenType];

  // ── Animations ────────────────────────────────────────────────────────────
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
      // Léger pop-in du header au montage
      Animated.spring(headerScale, {
        toValue: 1,
        tension: 120,
        friction: 10,
        useNativeDriver: true,
      }),
      // Titre slide-up + fade
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
      // Barre dorée qui s'étire de gauche à droite
      Animated.sequence([
        Animated.delay(120),
        Animated.timing(accentWidth, {
          toValue: 1,
          duration: 450,
          useNativeDriver: false, // width ne supporte pas nativeDriver
        }),
      ]),
    ]).start();
  }, [title]);

  const handleLeftPress = () => {
    if (onLeftPress) onLeftPress();
    else if (showBackButton) router.back();
  };

  const resolvedBg = backgroundColor ?? DARK.bg;
  const fs = screenType === 'desktop' ? 22 : screenType === 'tablet' ? 20 : 18;

  const shadowStyle: ViewStyle = Platform.select({
    ios: {
      shadowColor: DARK.accent,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 14,
    },
    android: { elevation: 12 },
  }) ?? {};

  return (
    <>
      {/* Icônes système (heure, batterie…) en blanc sur fond sombre */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={resolvedBg}
        translucent={false}
      />

      {/*
        Zone safe area séparée : elle reçoit le fond sombre pour
        colorier derrière la status bar SANS contenir de contenu.
        Ainsi le header lui-même n'est jamais décalé ni caché.
      */}
      {includeSafeArea && insets.top > 0 && (
        <View style={{ height: insets.top, backgroundColor: resolvedBg }} />
      )}

    <Animated.View style={[{ backgroundColor: resolvedBg, zIndex: 20, ...shadowStyle }, { transform: [{ scaleY: headerScale }] }]}>

      {/* ── Ligne principale ──────────────────────────────────────────── */}
      <View style={[styles.row, { height: headerHeight, paddingHorizontal: screenType === 'mobile' ? 12 : 20 }]}>

        {/* Gauche */}
        <View style={styles.side}>
          {(showBackButton || leftIcon) && (
            <IconButton
              icon={(leftIcon || 'arrow-back') as keyof typeof Ionicons.glyphMap}
              onPress={handleLeftPress}
            />
          )}
          {showLogout && logoutPosition === 'left' && (
            <IconButton icon="log-out-outline" onPress={logout} />
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

        {/* Droite */}
        <View style={[styles.side, styles.sideRight]}>
          {showLogout && logoutPosition === 'right' && (
            <IconButton icon="log-out-outline" onPress={logout} />
          )}
          {rightActions && rightActions.length > 0
            ? rightActions.map((action, i) => (
                <IconButton
                  key={i}
                  icon={action.icon}
                  onPress={action.onPress}
                  disabled={action.disabled || action.loading}
                  badge={action.badge}
                />
              ))
            : rightIcon
            ? <IconButton icon={rightIcon} onPress={onRightPress} badge={rightBadge} />
            : null}
        </View>
      </View>

      {/* ── Barre d'accent dorée animée ───────────────────────────────── */}
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

// ─── Bouton icône avec spring au press ────────────────────────────────────────
const IconButton: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: (() => void) | (() => Promise<void>);
  disabled?: boolean;
  badge?: string;
}> = ({ icon, onPress, disabled, badge }) => {
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
      style={[styles.iconBtn, disabled && { opacity: 0.35 }]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={icon} size={21} color={DARK.text} />
      </Animated.View>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
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
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontWeight: '800',
    color: DARK.text,
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '500',
    color: DARK.textSub,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: DARK.surface,
    borderWidth: 1,
    borderColor: DARK.border,
  },
  badge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: DARK.badgeBg,
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: DARK.bg,
  },
  badgeText: {
    color: '#111',
    fontSize: 9,
    fontWeight: '800',
  },
  accentTrack: {
    height: 2,
    backgroundColor: DARK.border,
    overflow: 'hidden',
  },
  accentBar: {
    height: '100%',
    backgroundColor: DARK.accent,
    // Halo lumineux sous iOS
    ...Platform.select({
      ios: {
        shadowColor: DARK.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 6,
      },
    }),
  },
});