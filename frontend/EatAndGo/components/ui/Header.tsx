import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ViewStyle,
  Animated,
  Platform,
  StyleSheet,
  Modal,
  FlatList,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SystemBars } from 'react-native-edge-to-edge';
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
//
// Exportée : les écrans qui affichent un bandeau accolé au Header (bandeau
// Kanban des commandes, etc.) doivent utiliser EXACTEMENT le même fond.
// Passer par `colors.primary` donne l'indigo vif de la palette en dark mode
// et casse la continuité visuelle avec le Header.
export function getHeaderPalette(isDark: boolean) {
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

  // ── Mesure des zones gauche/droite pour le dimensionnement du titre ───
  // Les deux zones ont des largeurs variables (0, 1, 2 ou 3 icônes...).
  // On mesure chacune via onLayout et on applique CHAQUE largeur de son côté
  // (marges asymétriques) : le titre récupère ainsi tout l'espace réellement
  // libre. L'ancienne symétrisation (Math.max des deux côtés) amputait le
  // titre de 2× la zone la plus large — d'où les titres coupés dès 3 icônes.
  const MIN_SIDE = 52;
  const [sideWidths, setSideWidths] = useState({ left: MIN_SIDE, right: MIN_SIDE });
  // Hauteur réelle du CONTENU du bloc titre (le conteneur `centerAbsolute` est
  // étiré top:0/bottom:0, donc le mesurer renverrait la hauteur de la rangée
  // → boucle infinie de croissance. On mesure `centerInner`, dimensionné par
  // son contenu.)
  const [titleHeight, setTitleHeight] = useState(0);
  // Largeur totale de la rangée (pour savoir si le titre tient centré).
  const [rowWidth, setRowWidth] = useState(0);
  // Largeur NATURELLE du titre sur une seule ligne, mesurée hors contrainte
  // via un texte fantôme (voir plus bas). Aucune boucle possible : elle ne
  // dépend que de `title` et `fs`, jamais du layout du header.
  const [naturalTitleWidth, setNaturalTitleWidth] = useState(0);

  const handleLeftLayout = (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setSideWidths((prev) => (prev.left === w ? prev : { ...prev, left: w }));
  };
  const handleRightLayout = (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setSideWidths((prev) => (prev.right === w ? prev : { ...prev, right: w }));
  };

  const handleTitleLayout = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    // Seuil de 1px : neutralise les micro-oscillations d'arrondi qui
    // relanceraient un cycle de layout.
    setTitleHeight((prev) => (Math.abs(prev - h) <= 1 ? prev : h));
  };

  const handleRowLayout = (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setRowWidth((prev) => (prev === w ? prev : w));
  };

  const handleGhostLayout = (e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setNaturalTitleWidth((prev) => (Math.abs(prev - w) <= 1 ? prev : w));
  };

  const TITLE_GAP = 8;
  const padH = screenType === 'mobile' ? 12 : 20;

  // Deux stratégies de marges :
  //  • SYMÉTRIQUE (défaut) — même marge des deux côtés = titre pile au centre
  //    de l'écran. C'est le rendu voulu.
  //  • ASYMÉTRIQUE (repli) — chaque côté réserve seulement sa propre largeur,
  //    ce qui libère l'espace de la zone vide. Légèrement décentré, mais le
  //    titre reste entier.
  // On choisit la seconde UNIQUEMENT si la première ne suffit pas.
  // ⚠ `padH` DOIT être inclus dans les marges : dans Yoga, un enfant en
  // position absolue est positionné par rapport à la PADDING BOX du parent —
  // le paddingHorizontal de la rangée n'est pas déduit des offsets left/right.
  // Sans lui, le titre empiétait de (padH − TITLE_GAP) sur la zone d'icônes.
  const symMargin  = padH + Math.max(sideWidths.left, sideWidths.right, MIN_SIDE) + TITLE_GAP;
  const asymLeft   = padH + Math.max(sideWidths.left,  MIN_SIDE) + TITLE_GAP;
  const asymRight  = padH + Math.max(sideWidths.right, MIN_SIDE) + TITLE_GAP;

  // Nombre de lignes réellement exploitables pour le titre. Un mot unique ne
  // peut PAS être coupé : lui accorder 2 lignes surestimait la place
  // disponible, le centrage était conservé à tort et le titre finissait
  // rétréci ou tronqué (cas « EatQuickeR »).
  const canWrap = /\s/.test(title.trim());
  const allowedLines = subtitle || !canWrap ? 1 : 2;
  // Largeur exploitable si on garde le centrage symétrique. `padH` est déjà
  // compris dans `symMargin`, on ne le retire pas une seconde fois.
  const centeredWidth = rowWidth - 2 * symMargin;
  // 0.92 : marge de sécurité, un retour à la ligne se fait sur un espace donc
  // la 2e ligne n'est jamais remplie à 100 %.
  const fitsCentered =
    rowWidth === 0 ||
    naturalTitleWidth === 0 ||
    naturalTitleWidth <= centeredWidth * allowedLines * 0.92;

  const leftMargin  = fitsCentered ? symMargin : asymLeft;
  const rightMargin = fitsCentered ? symMargin : asymRight;

  // Nombre total d'icônes affichées — sert à pré-réduire la police avant même
  // que le texte ne déborde.
  const iconCount =
    (showBackButton || leftIcon ? 1 : 0) +
    (showLogout ? 1 : 0) +
    (showLanguageSwitcher ? 1 : 0) +
    (showThemeSwitcher ? 1 : 0) +
    (rightActions && rightActions.length > 0 ? rightActions.length : rightIcon ? 1 : 0);

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
  const baseFs = screenType === 'desktop' ? 22 : screenType === 'tablet' ? 20 : 18;
  // Pré-réduction déterministe : `adjustsFontSizeToFit` seul est instable sur
  // Android quand le texte wrappe. On anticipe selon longueur du titre + coût
  // de chaque icône (≈6 caractères d'espace perdu par bouton).
  const pressure = title.length + iconCount * 6;
  const fs = pressure > 34 ? baseFs - 3 : pressure > 26 ? baseFs - 2 : baseFs;

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
      {/*
        Icônes système (heure, batterie…) en blanc — fond du header sombre.
        Ne cible QUE la status bar : la nav bar reste pilotée par le
        SystemBarsManager du root (suivi du thème). Empilé au montage,
        restauré au démontage — pas d'écrasement global comme le StatusBar RN.
      */}
      <SystemBars style={{ statusBar: 'light' }} />

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
              // minHeight (et non height) : le header s'agrandit si le titre
              // passe sur 2 lignes. titleHeight est mesuré séparément car le
              // bloc titre est en position absolue.
              minHeight: Math.max(headerHeight, titleHeight + 12),
              paddingHorizontal: padH,
            },
          ]}
          onLayout={handleRowLayout}
        >
          {/* Texte fantôme : mesure la largeur naturelle du titre sur UNE ligne,
              sans contrainte de largeur (conteneur volontairement très large).
              Invisible (opacity 0), en position absolue → aucun impact sur le
              layout ni sur la hauteur du parent. Sert uniquement à décider si
              le centrage symétrique est tenable. */}
          <View
            style={styles.ghostBox}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              numberOfLines={1}
              style={[styles.title, styles.ghostText, { fontSize: fs }]}
              onLayout={handleGhostLayout}
            >
              {title}
            </Text>
          </View>

          {/* Gauche */}
          <View style={styles.side} onLayout={handleLeftLayout}>
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

          {/* Centre : positionné en absolu entre les deux zones d'icônes.
              `leftMargin`/`rightMargin` = largeur mesurée de CHAQUE côté → le
              titre exploite tout l'espace libre et n'est jamais amputé par le
              nombre d'icônes. 2 lignes autorisées (si pas de sous-titre) +
              réduction automatique de police : un titre n'est jamais tronqué.
              pointerEvents="none" laisse passer les taps vers les boutons en dessous. */}
          <View
            style={[styles.centerAbsolute, { left: leftMargin, right: rightMargin }]}
            pointerEvents="none"
          >
            {/* Wrapper interne : hauteur = celle du texte (le parent, lui, est
                étiré sur toute la rangée). C'est lui qu'on mesure. */}
            <View style={styles.centerInner} onLayout={handleTitleLayout}>
              <Animated.Text
                numberOfLines={subtitle ? 1 : 2}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                ellipsizeMode="tail"
                accessibilityRole="header"
                style={[
                  styles.title,
                  {
                    fontSize: fs,
                    lineHeight: Math.round(fs * 1.18),
                    opacity: titleOpacity,
                    transform: [{ translateY: titleY }],
                  },
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
          </View>

          {/* Droite : ordre = langue → thème → autres actions/icon → logout/right */}
          <View style={[styles.side, styles.sideRight]} onLayout={handleRightLayout}>
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
      position: 'relative',
    },
    side: {
      minWidth: 52,
      // flexDirection 'row' indispensable : la valeur par défaut de React
      // Native est 'column', donc deux icônes à gauche (ex. notifications +
      // déconnexion) s'empilaient verticalement et débordaient du header.
      // `sideRight` avait déjà row + gap, d'où l'asymétrie de comportement.
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 6,
    },
    sideRight: {
      // 'center' et non 'flex-end' : en flexDirection 'row', alignItems agit
      // sur l'axe VERTICAL. 'flex-end' collait les icônes de droite en bas,
      // désalignées par rapport à celles de gauche dès que le header grandit
      // (titre sur 2 lignes). Le cadrage horizontal est géré par
      // justifyContent ci-dessous.
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
      // Le côté droit doit pouvoir s'étendre quand on a 2-3 boutons (langue + thème + action)
      minWidth: 52,
      flexShrink: 0,
    },
    // Conservé pour compat éventuelle (non utilisé par le Header lui-même,
    // le titre utilise désormais `centerAbsolute` ci-dessous).
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    // Zone titre : `left`/`right` sont fournis dynamiquement en inline style
    // (= largeur mesurée de la zone du même côté). Le titre occupe donc tout
    // l'espace disponible entre les icônes.
    centerAbsolute: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Boîte de mesure hors écran : largeur volontairement énorme pour que le
    // texte fantôme ne soit jamais contraint et rende sa largeur réelle.
    ghostBox: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: 4000,
      opacity: 0,
    },
    ghostText: {
      width: 'auto',
      alignSelf: 'flex-start',
      textAlign: 'left',
    },
    // Dimensionné par son contenu en hauteur (pleine largeur) → mesure stable.
    centerInner: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontWeight: '800',
      color: palette.text,
      textAlign: 'center',
      // 0.8 gonflait inutilement la largeur des titres longs.
      letterSpacing: 0.3,
      width: '100%',
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