import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from 'react-native';
import { COLORS } from '@/constants/config';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  loading = false,
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  // Styles de base
  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      paddingHorizontal: 16,
    };

    // Tailles
    switch (size) {
      case 'small':
        baseStyle.paddingVertical = 8;
        break;
      case 'large':
        baseStyle.paddingVertical = 16;
        break;
      default:
        baseStyle.paddingVertical = 12;
    }

    // Largeur
    if (fullWidth) {
      baseStyle.width = '100%';
    }

    // Variantes
    switch (variant) {
      case 'secondary':
        baseStyle.backgroundColor = COLORS.text.secondary;
        break;
      case 'outline':
        baseStyle.backgroundColor = 'transparent';
        baseStyle.borderWidth = 1;
        baseStyle.borderColor = COLORS.primary;
        break;
      default:
        baseStyle.backgroundColor = COLORS.primary;
    }

    // État désactivé
    if (isDisabled) {
      baseStyle.opacity = 0.6;
    }

    return { ...baseStyle, ...(style || {}) };
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontWeight: '600',
    };

    // Tailles de texte
    switch (size) {
      case 'small':
        baseStyle.fontSize = 14;
        break;
      case 'large':
        baseStyle.fontSize = 18;
        break;
      default:
        baseStyle.fontSize = 16;
    }

    // Couleurs selon la variante
    switch (variant) {
      case 'outline':
        baseStyle.color = COLORS.primary;
        break;
      default:
        baseStyle.color = COLORS.surface;
    }

    return baseStyle;
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {leftIcon && !loading && leftIcon}
      
      {loading ? (
        <ActivityIndicator 
          size="small" 
          color={variant === 'outline' ? COLORS.primary : COLORS.surface}
        />
      ) : (
        <>
          <Text style={getTextStyle()}>{title}</Text>
          {rightIcon && rightIcon}
        </>
      )}
    </TouchableOpacity>
  );
}