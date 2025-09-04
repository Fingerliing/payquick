import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  loading = false,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  disabled,
  textStyle: textStyleProp,
  ...props
}) => {
  const { isMobile, getSpacing } = useResponsive();
  const isDisabled = disabled || loading;

  // ✅ STYLES RESPONSIVES PAR TAILLE
  const getSizeStyles = () => {
    const paddingH = getSpacing(
      isMobile ? SPACING.md : SPACING.lg,
      SPACING.lg,
      SPACING.xl
    );

    switch (size) {
      case 'sm':
        return {
          paddingVertical: SPACING.sm,
          paddingHorizontal: paddingH * 0.75,
          minHeight: 36,
          ...TYPOGRAPHY.styles.buttonSmall,
        };
      case 'lg':
        return {
          paddingVertical: SPACING.lg,
          paddingHorizontal: paddingH * 1.25,
          minHeight: 56,
          fontSize: 18,
          fontWeight: '600',
        };
      default:
        return {
          paddingVertical: SPACING.md,
          paddingHorizontal: paddingH,
          minHeight: 48,
          ...TYPOGRAPHY.styles.button,
        };
    }
  };

  // ✅ STYLES PAR VARIANTE AVEC COULEURS IMPOSÉES
  const getVariantStyles = () => {
    const baseStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.button,
      ...getSizeStyles(),
    };

    switch (variant) {
      case 'primary':
        return {
          container: {
            ...baseStyle,
            backgroundColor: COLORS.primary,
            ...SHADOWS.sm,
          },
          text: { color: COLORS.text.white },
        };

      case 'secondary':
        return {
          container: {
            ...baseStyle,
            backgroundColor: COLORS.secondary,
            ...SHADOWS.sm,
          },
          text: { color: COLORS.text.primary },
        };

      case 'outline':
        return {
          container: {
            ...baseStyle,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: COLORS.primary,
          },
          text: { color: COLORS.primary },
        };

      case 'ghost':
        return {
          container: {
            ...baseStyle,
            backgroundColor: 'transparent',
          },
          text: { color: COLORS.primary },
        };

      case 'destructive':
        return {
          container: {
            ...baseStyle,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: COLORS.error,
          },
          text: { color: COLORS.error },
        };

      default:
        return {
          container: baseStyle,
          text: { color: COLORS.text.primary },
        };
    }
  };

  const styles = getVariantStyles();
  
  const containerStyle: ViewStyle = {
    ...styles.container,
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? 0.6 : 1,
    ...style,
  };

  const textStyle: TextStyle = {
    ...styles.text,
    marginLeft: leftIcon ? SPACING.sm : 0,
    marginRight: rightIcon ? SPACING.sm : 0,
    ...(textStyleProp || {}),
  };

  return (
    <TouchableOpacity
      style={containerStyle}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {leftIcon && !loading && leftIcon}
      
      {loading ? (
        <ActivityIndicator 
          size="small" 
          color={(textStyle.color as string) || (styles.text.color as string)}
        />
      ) : (
        <>
          <Text style={textStyle}>{title || ''}</Text>
          {rightIcon && rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
};