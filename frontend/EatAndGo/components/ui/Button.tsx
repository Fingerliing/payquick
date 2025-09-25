import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
  View,
} from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title?: string; // Rendre optionnel au cas où il y a seulement des icônes
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

  // Fonction pour sécuriser le texte
  const safeText = (text: any): string => {
    if (!text) return '';
    if (typeof text === 'string') return text;
    if (typeof text === 'number') return text.toString();
    return String(text);
  };

  // STYLES RESPONSIFS PAR TAILLE
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
          fontSize: 14,
          fontWeight: '600' as const,
        };
      case 'lg':
        return {
          paddingVertical: SPACING.lg,
          paddingHorizontal: paddingH * 1.25,
          minHeight: 56,
          fontSize: 18,
          fontWeight: '600' as const,
        };
      default:
        return {
          paddingVertical: SPACING.md,
          paddingHorizontal: paddingH,
          minHeight: 48,
          fontSize: 16,
          fontWeight: '600' as const,
        };
    }
  };

  // STYLES PAR VARIANTE
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
          text: { 
            color: COLORS.text.white || '#FFFFFF',
            fontSize: getSizeStyles().fontSize,
            fontWeight: getSizeStyles().fontWeight,
          },
        };

      case 'secondary':
        return {
          container: {
            ...baseStyle,
            backgroundColor: COLORS.secondary,
            ...SHADOWS.sm,
          },
          text: { 
            color: COLORS.text.primary || '#000000',
            fontSize: getSizeStyles().fontSize,
            fontWeight: getSizeStyles().fontWeight,
          },
        };

      case 'outline':
        return {
          container: {
            ...baseStyle,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: COLORS.primary,
          },
          text: { 
            color: COLORS.primary,
            fontSize: getSizeStyles().fontSize,
            fontWeight: getSizeStyles().fontWeight,
          },
        };

      case 'ghost':
        return {
          container: {
            ...baseStyle,
            backgroundColor: 'transparent',
          },
          text: { 
            color: COLORS.primary,
            fontSize: getSizeStyles().fontSize,
            fontWeight: getSizeStyles().fontWeight,
          },
        };

      case 'destructive':
        return {
          container: {
            ...baseStyle,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: COLORS.error,
          },
          text: { 
            color: COLORS.error,
            fontSize: getSizeStyles().fontSize,
            fontWeight: getSizeStyles().fontWeight,
          },
        };

      default:
        return {
          container: baseStyle,
          text: { 
            color: COLORS.text.primary || '#000000',
            fontSize: getSizeStyles().fontSize,
            fontWeight: getSizeStyles().fontWeight,
          },
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

  // Fonction pour rendre le contenu du bouton de manière sécurisée
  const renderContent = () => {
    if (loading) {
      return (
        <ActivityIndicator 
          size="small" 
          color={styles.text.color}
        />
      );
    }

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {leftIcon && (
          <View style={{ marginRight: title ? SPACING.sm : 0 }}>
            {leftIcon}
          </View>
        )}
        
        {title && (
          <Text style={textStyle}>
            {safeText(title)}
          </Text>
        )}
        
        {rightIcon && (
          <View style={{ marginLeft: title ? SPACING.sm : 0 }}>
            {rightIcon}
          </View>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={containerStyle}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};