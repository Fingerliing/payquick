
import React from 'react';
import { View, ViewStyle, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

interface CardProps extends TouchableOpacityProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: keyof typeof SPACING | number;
  style?: ViewStyle;
  pressable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  style,
  pressable = false,
  ...props
}) => {
  const { getSpacing } = useResponsive();
  
  const paddingValue = typeof padding === 'number' 
    ? padding 
    : (() => {
        const spacingValue = SPACING[padding];
        if (typeof spacingValue === 'number') {
          return getSpacing(spacingValue, spacingValue * 1.25);
        } else {
          // Handle responsive object case (container, section)
          return getSpacing(
            spacingValue.mobile, 
            spacingValue.tablet, 
            spacingValue.desktop
          );
        }
      })();

  // ✅ STYLES PAR VARIANTE
  const getVariantStyles = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: RADIUS.card,
      padding: paddingValue,
    };

    switch (variant) {
      case 'elevated':
        return {
          ...baseStyle,
          backgroundColor: COLORS.surface.elevated,
          ...SHADOWS.md,
        };

      case 'outlined':
        return {
          ...baseStyle,
          backgroundColor: COLORS.surface.primary,
          borderWidth: 1,
          borderColor: COLORS.border.light,
        };

      default:
        return {
          ...baseStyle,
          backgroundColor: COLORS.surface.primary,
          ...SHADOWS.sm,
        };
    }
  };

  const cardStyle: ViewStyle = {
    ...getVariantStyles(),
    ...style,
  };

  if (pressable) {
    return (
      <TouchableOpacity 
        style={cardStyle} 
        activeOpacity={0.95}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};