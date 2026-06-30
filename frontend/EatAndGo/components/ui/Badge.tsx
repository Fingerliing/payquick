import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import {
  useAppTheme,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

interface BadgeProps {
  text: string;
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  text,
  variant = 'default',
  size = 'md',
  style,
}) => {
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();

  // COULEURS PAR VARIANTE
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: colors.variants.primary[100],
          textColor: isDark ? colors.variants.primary[800] : colors.primary,
        };
      case 'secondary':
        return {
          backgroundColor: colors.variants.secondary[100],
          textColor: colors.variants.secondary[700],
        };
      case 'success':
        return {
          backgroundColor: isDark ? '#0F2E20' : '#DCFCE7',
          textColor: colors.success,
        };
      case 'warning':
        return {
          backgroundColor: colors.variants.secondary[200],
          textColor: colors.warning,
        };
      case 'error':
        return {
          backgroundColor: isDark ? '#3A1418' : '#FEE2E2',
          textColor: colors.error,
        };
      default:
        return {
          backgroundColor: colors.border.light,
          textColor: colors.text.secondary,
        };
    }
  };

  // TAILLES RESPONSIVES
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
          paddingVertical: getResponsiveValue(SPACING.xs, screenType),
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
        };
      case 'lg':
        return {
          paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
          paddingVertical: getResponsiveValue(SPACING.sm, screenType),
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
        };
      default:
        return {
          paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
          paddingVertical: getResponsiveValue(SPACING.xs, screenType),
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  const containerStyle: ViewStyle = {
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: variantStyles.backgroundColor,
    paddingHorizontal: sizeStyles.paddingHorizontal,
    paddingVertical: sizeStyles.paddingVertical,
    alignSelf: 'flex-start',
    ...style,
  };

  const textStyle: TextStyle = {
    fontSize: sizeStyles.fontSize,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: variantStyles.textColor,
    textAlign: 'center',
  };

  return (
    <View style={containerStyle}>
      <Text style={textStyle}>{text}</Text>
    </View>
  );
};