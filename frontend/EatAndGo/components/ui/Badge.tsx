
import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '@/styles/tokens';

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
  // ✅ COULEURS PAR VARIANTE
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: COLORS.primary_pale,
          textColor: COLORS.primary,
        };
      case 'secondary':
        return {
          backgroundColor: COLORS.secondary_pale,
          textColor: COLORS.secondary_dark,
        };
      case 'success':
        return {
          backgroundColor: '#DCFCE7',
          textColor: COLORS.success,
        };
      case 'warning':
        return {
          backgroundColor: '#FEF3C7',
          textColor: COLORS.warning,
        };
      case 'error':
        return {
          backgroundColor: '#FEE2E2',
          textColor: COLORS.error,
        };
      default:
        return {
          backgroundColor: COLORS.neutral[100],
          textColor: COLORS.neutral[700],
        };
    }
  };

  // ✅ TAILLES RESPONSIVES
  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          paddingHorizontal: SPACING.sm,
          paddingVertical: SPACING.xs,
          fontSize: TYPOGRAPHY.fontSize.xs,
        };
      case 'lg':
        return {
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.sm,
          fontSize: TYPOGRAPHY.fontSize.base,
        };
      default:
        return {
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.xs,
          fontSize: TYPOGRAPHY.fontSize.sm,
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  const containerStyle: ViewStyle = {
    borderRadius: RADIUS.badge,
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