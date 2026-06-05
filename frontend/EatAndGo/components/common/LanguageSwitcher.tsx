import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useAppTheme,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  makeShadows,
  getResponsiveValue,
  useScreenType,
  type AppColors,
} from '@/utils/designSystem';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';

type Variant = 'row' | 'button';
type ScreenType = 'mobile' | 'tablet' | 'desktop';

interface LanguageSwitcherProps {
  variant?: Variant;
  /** Override du label de la ligne (variant="row"). */
  label?: string;
  /** Style additionnel sur le conteneur. */
  style?: any;
  /** Désactive le composant. */
  disabled?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'row',
  label,
  style,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { language, languageInfo, setLanguage, isLoading } = useLanguage();

  const [open, setOpen] = useState(false);

  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const styles = useMemo(
    () => createStyles(colors, screenType, shadows),
    [colors, screenType, shadows],
  );

  const handleSelect = async (code: LanguageCode) => {
    setOpen(false);
    if (code === language) return;
    try {
      await setLanguage(code);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[LanguageSwitcher] setLanguage failed', e);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Bouton de déclenchement
  // ────────────────────────────────────────────────────────────────────────
  const trigger =
    variant === 'button' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.language')}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled || isLoading}
        style={({ pressed }) => [
          styles.buttonTrigger,
          pressed && styles.pressed,
          (disabled || isLoading) && styles.disabled,
          style,
        ]}
      >
        <Text style={styles.buttonFlag}>{languageInfo.flag}</Text>
        <Text style={styles.buttonCode}>{language.toUpperCase()}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.text.secondary} />
      </Pressable>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.language')}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled || isLoading}
        style={({ pressed }) => [
          styles.rowTrigger,
          pressed && styles.pressed,
          (disabled || isLoading) && styles.disabled,
          style,
        ]}
      >
        <View style={styles.rowLeft}>
          <Ionicons name="language" size={20} color={colors.primary} />
          <Text style={styles.rowLabel}>{label ?? t('profile.language')}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowFlag}>{languageInfo.flag}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>
            {languageInfo.nativeLabel}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.text.light} />
        </View>
      </Pressable>
    );

  return (
    <>
      {trigger}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              {
                paddingBottom:
                  Math.max(insets.bottom, getResponsiveValue(SPACING.lg, screenType)) +
                  getResponsiveValue(SPACING.md, screenType),
              },
            ]}
            onPress={() => {
              /* avale les taps pour ne pas fermer la sheet */
            }}
          >
            {/* Poignée */}
            <View style={styles.handle} />

            {/* En-tête */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('profile.language')}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            {/* Liste */}
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
                      styles.langRow,
                      active && styles.langRowActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.langFlag}>{item.flag}</Text>
                    <View style={styles.langTextWrap}>
                      <Text
                        style={[styles.langNative, active && styles.langNativeActive]}
                        numberOfLines={1}
                      >
                        {item.nativeLabel}
                      </Text>
                      <Text style={styles.langLabel} numberOfLines={1}>
                        {item.label}
                        {item.rtl ? ' · RTL' : ''}
                      </Text>
                    </View>
                    {active && (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.secondary}
                      />
                    )}
                  </Pressable>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────
const createStyles = (
  colors: AppColors,
  screenType: ScreenType,
  shadows: ReturnType<typeof makeShadows>,
) =>
  StyleSheet.create({
    // ── Trigger variant="row" ──────────────────────────────────────────
    rowTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
      flexShrink: 1,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      flexShrink: 0,
    },
    rowLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.primary,
    },
    rowFlag: { fontSize: 20 },
    rowValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      maxWidth: 140,
    },

    // ── Trigger variant="button" ───────────────────────────────────────
    buttonTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    buttonFlag: { fontSize: 16 },
    buttonCode: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },

    pressed:  { opacity: 0.7 },
    disabled: { opacity: 0.5 },

    // ── Sheet modale ───────────────────────────────────────────────────
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
      ...shadows.lg,
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

    // ── Lignes de langue ───────────────────────────────────────────────
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
    langTextWrap: { flex: 1 },
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

export default LanguageSwitcher;
