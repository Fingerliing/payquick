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
import { 
  COLORS, 
  TYPOGRAPHY, 
  SPACING, 
  BORDER_RADIUS, 
  SHADOWS,
  useScreenType,
  getResponsiveValue 
} from '@/utils/designSystem';

interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title?: string;
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
  const screenType = useScreenType();
  const isDisabled = disabled || loading;

  // Fonction pour sécuriser le texte
  const safeText = (text: any): string => {
    if (!text) return '';
    if (typeof text === 'string') return text;
    if (typeof text === 'number') return text.toString();
    return String(text);
  };

  // STYLES RESPONSIFVE PAR TAILLE
  const getSizeStyles = () => {
    const basePadding = getResponsiveValue(SPACING.lg, screenType);

    switch (size) {
      case 'sm':
        return {
          paddingVertical: getResponsiveValue(SPACING.sm, screenType),
          paddingHorizontal: basePadding * 0.75,
          minHeight: 36,
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
          fontWeight: TYPOGRAPHY.fontWeight.semibold,
        };
      case 'lg':
        return {
          paddingVertical: getResponsiveValue(SPACING.lg, screenType),
          paddingHorizontal: basePadding * 1.25,
          minHeight: 56,
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
          fontWeight: TYPOGRAPHY.fontWeight.semibold,
        };
      default:
        return {
          paddingVertical: getResponsiveValue(SPACING.md, screenType),
          paddingHorizontal: basePadding,
          minHeight: 48,
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
          fontWeight: TYPOGRAPHY.fontWeight.semibold,
        };
    }
  };

  // STYLES PAR VARIANTE
  const getVariantStyles = () => {
    const sizeStyles = getSizeStyles();
    const baseStyle: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: sizeStyles.paddingVertical,
      paddingHorizontal: sizeStyles.paddingHorizontal,
      minHeight: sizeStyles.minHeight,
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
            color: COLORS.text.inverse,
            fontSize: sizeStyles.fontSize,
            fontWeight: sizeStyles.fontWeight,
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
            color: COLORS.text.primary,
            fontSize: sizeStyles.fontSize,
            fontWeight: sizeStyles.fontWeight,
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
            fontSize: sizeStyles.fontSize,
            fontWeight: sizeStyles.fontWeight,
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
            fontSize: sizeStyles.fontSize,
            fontWeight: sizeStyles.fontWeight,
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
            fontSize: sizeStyles.fontSize,
            fontWeight: sizeStyles.fontWeight,
          },
        };

      default:
        return {
          container: baseStyle,
          text: { 
            color: COLORS.text.primary,
            fontSize: sizeStyles.fontSize,
            fontWeight: sizeStyles.fontWeight,
          },
        };
    }
  };

  const styles = getVariantStyles();
  const spacingSm = getResponsiveValue(SPACING.sm, screenType);
  
  const containerStyle: ViewStyle = {
    ...styles.container,
    width: fullWidth ? '100%' : undefined,
    opacity: isDisabled ? 0.6 : 1,
    ...style,
  };

  const textStyle: TextStyle = {
    ...styles.text,
    marginLeft: leftIcon ? spacingSm : 0,
    marginRight: rightIcon ? spacingSm : 0,
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
          <View style={{ marginRight: title ? spacingSm : 0 }}>
            {leftIcon}
          </View>
        )}
        
        {title && (
          <Text style={textStyle}>
            {safeText(title)}
          </Text>
        )}
        
        {rightIcon && (
          <View style={{ marginLeft: title ? spacingSm : 0 }}>
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