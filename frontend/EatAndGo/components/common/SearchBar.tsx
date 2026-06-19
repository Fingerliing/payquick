import React, { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ViewStyle,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  BORDER_RADIUS,
  TYPOGRAPHY,
  SPACING,
  type AppColors,
} from '@/utils/designSystem';

interface SearchBarProps {
  /** Si non fourni, utilise `t('common.search')`. */
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSearch?: () => void;
  onFilter?: () => void;
  style?: ViewStyle;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder,
  value,
  onChangeText,
  onSearch,
  onFilter,
  style,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const [isFocused, setIsFocused] = useState(false);

  // useMemo avec deps explicites (colors, isDark, isFocused, screenType) pour
  // éviter le bug de cache de Pressable/TextInput sur RN lors d'un toggle.
  const styles = useMemo(
    () => makeStyles(colors, isDark, isFocused, screenType),
    [colors, isDark, isFocused, screenType],
  );

  const effectivePlaceholder = placeholder ?? t('common.search');

  return (
    <View style={[styles.container, style]}>
      <Ionicons name="search-outline" size={20} color={colors.text.secondary} />

      <TextInput
        style={styles.input}
        placeholder={effectivePlaceholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onSubmitEditing={onSearch}
        placeholderTextColor={colors.text.light}
        returnKeyType="search"
      />

      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="close-circle"
            size={20}
            color={colors.text.secondary}
          />
        </TouchableOpacity>
      )}

      {onFilter && (
        <TouchableOpacity
          onPress={onFilter}
          style={styles.filterButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={colors.text.secondary}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// STYLES (fabrique theme-aware)
// ──────────────────────────────────────────────────────────────────────────
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  isFocused: boolean,
  screenType: ReturnType<typeof useScreenType>,
) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderWidth: 1,
      // Au focus, accent primary navy ; sinon, hairline or subtile en dark,
      // bordure neutre en light. Cohérent avec la convention TabBar/Card.
      borderColor: isFocused
        ? colors.primary
        : (isDark ? 'rgba(212, 175, 55, 0.15)' : colors.border.default),
    },
    input: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.primary,
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
      // Android : reset du padding interne natif pour l'alignement vertical
      paddingVertical: 0,
    },
    filterButton: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
  });