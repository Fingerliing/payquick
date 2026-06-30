import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  type AppColors,
} from '@/utils/designSystem';

// =============================================================================
// Boutons d'action de header utilisables EN STANDALONE — pour les écrans qui
// n'utilisent pas le composant <Header /> (ex: l'accueil scanner QR).
//
// Différence avec leurs équivalents dans Header.tsx : ils s'intègrent sur fond
// d'écran (colors.surface) plutôt que sur le fond navy du Header.
// =============================================================================

const buttonHeight = 40;

// ─────────────────────────────────────────────────────────────────────────────
// THEME BUTTON STANDALONE
// ─────────────────────────────────────────────────────────────────────────────
export const ThemeActionButton: React.FC = () => {
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const { isDark, toggle, isLoading } = useTheme();

  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.86, tension: 220, friction: 8, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, tension: 220, friction: 8, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={() => toggle()}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={isLoading}
      style={[
        {
          width: buttonHeight,
          height: buttonHeight,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border.light,
          ...shadows.sm,
        },
        isLoading && { opacity: 0.35 },
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={isDark ? 'sunny' : 'moon'}
          size={20}
          // Or pour un accent "premium" cohérent avec le bouton du Header
          color={colors.secondary}
        />
      </Animated.View>
    </Pressable>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE BUTTON STANDALONE
// ─────────────────────────────────────────────────────────────────────────────
export const LanguageActionButton: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const { language, languageInfo, setLanguage, isLoading } = useLanguage();
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();

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
      console.warn('[LanguageActionButton] setLanguage failed', e);
    }
  };

  const modalStyles = useMemo(
    () => createModalStyles(colors, screenType),
    [colors, screenType],
  );

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
            height: buttonHeight,
            paddingHorizontal: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            borderRadius: 12,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border.light,
            ...shadows.sm,
          },
          isLoading && { opacity: 0.35 },
        ]}
      >
        <Animated.View
          style={{ transform: [{ scale }], flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontSize: 16 }}>{languageInfo.flag}</Text>
          <Text
            style={{
              color: colors.text.primary,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 0.3,
            }}
          >
            {language.toUpperCase()}
          </Text>
        </Animated.View>
      </Pressable>

      {/* Modal de sélection */}
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
              /* avale les taps */
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

// ─────────────────────────────────────────────────────────────────────────────
// Composant combiné : ThemeActionButton + LanguageActionButton dans une row
// Pratique pour les écrans qui veulent les deux en haut à droite.
// ─────────────────────────────────────────────────────────────────────────────
export const HeaderActionsBar: React.FC<{ style?: any }> = ({ style }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
    <LanguageActionButton />
    <ThemeActionButton />
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Styles modal langue (theme-aware)
// ─────────────────────────────────────────────────────────────────────────────
const createModalStyles = (
  colors: AppColors,
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
