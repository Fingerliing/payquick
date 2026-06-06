/**
 * ThemeSwitcher — Sélecteur de thème binaire (clair / sombre).
 *
 * Variantes :
 *  - "segmented" (défaut) : barre 2 segments [☀ Clair] [🌙 Sombre]
 *  - "compact"            : bouton unique qui toggle light ↔ dark
 *
 * Patterns alignés sur EatQuickeR : useAppTheme() pour les couleurs,
 * tokens TYPOGRAPHY/SPACING/BORDER_RADIUS, i18n via useTranslation.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import {
  useAppTheme,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  getResponsiveValue,
  useScreenType,
  type AppColors,
} from '@/utils/designSystem';
import type { ThemeMode } from '@/contexts/ThemeContext';

type Variant = 'segmented' | 'compact';
type ScreenType = 'mobile' | 'tablet' | 'desktop';

interface ThemeSwitcherProps {
  variant?: Variant;
  style?: any;
  disabled?: boolean;
}

interface OptionDef {
  key: ThemeMode;
  icon: keyof typeof Ionicons.glyphMap;
  i18nKey: string;
}

const OPTIONS: OptionDef[] = [
  { key: 'light', icon: 'sunny-outline', i18nKey: 'theme.light' },
  { key: 'dark',  icon: 'moon-outline',  i18nKey: 'theme.dark' },
];

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  variant = 'segmented',
  style,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const { colors, mode, toggle, setMode, isLoading } = useAppTheme();
  const screenType = useScreenType();

  const styles = useMemo(() => createStyles(colors, screenType), [colors, screenType]);

  // ────────────────────────────────────────────────────────────────────────
  // Variant compact : un bouton qui toggle light ↔ dark
  // ────────────────────────────────────────────────────────────────────────
  if (variant === 'compact') {
    const current = OPTIONS.find((o) => o.key === mode) ?? OPTIONS[0];

    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('theme.title')}: ${t(current.i18nKey)}`}
        disabled={disabled || isLoading}
        onPress={() => toggle()}
        style={({ pressed }) => [
          styles.compactBtn,
          pressed && styles.pressed,
          (disabled || isLoading) && styles.disabled,
          style,
        ]}
      >
        <Ionicons name={current.icon} size={20} color={colors.primary} />
        <Text style={styles.compactLabel}>{t(current.i18nKey)}</Text>
      </Pressable>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Variant segmented : 2 segments
  // ────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.segmented, style]}>
      {OPTIONS.map((opt) => {
        const active = opt.key === mode;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(opt.i18nKey)}
            disabled={disabled || isLoading}
            onPress={() => setMode(opt.key)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && !active && styles.pressed,
              (disabled || isLoading) && styles.disabled,
            ]}
          >
            <Ionicons
              name={opt.icon}
              size={18}
              color={active ? colors.text.inverse : colors.text.secondary}
            />
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
              {t(opt.i18nKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────
const createStyles = (colors: AppColors, screenType: ScreenType) =>
  StyleSheet.create({
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: 2,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
    },
    segmentActive: {
      backgroundColor: colors.primary,
    },
    segmentLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.secondary,
    },
    segmentLabelActive: {
      color: colors.text.inverse,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    compactBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    compactLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.primary,
    },

    pressed:  { opacity: 0.7 },
    disabled: { opacity: 0.5 },
  });

export default ThemeSwitcher;