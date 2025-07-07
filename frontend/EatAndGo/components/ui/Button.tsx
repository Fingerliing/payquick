import React from 'react';
import { TouchableOpacity, Text, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
  fullWidth = false,
}) => {
  const getButtonStyle = (): ViewStyle => {
    const baseStyle: ViewStyle = {
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'row',
      opacity: disabled ? 0.6 : 1,
    };

    if (fullWidth) {
      baseStyle.width = '100%';
    }

    // Size styles
    switch (size) {
      case 'small':
        baseStyle.paddingHorizontal = 12;
        baseStyle.paddingVertical = 6;
        baseStyle.minHeight = 32;
        break;
      case 'large':
        baseStyle.paddingHorizontal = 24;
        baseStyle.paddingVertical = 16;
        baseStyle.minHeight = 56;
        break;
      default:
        baseStyle.paddingHorizontal = 16;
        baseStyle.paddingVertical = 12;
        baseStyle.minHeight = 44;
    }

    // Variant styles
    switch (variant) {
      case 'secondary':
        baseStyle.backgroundColor = '#6B7280';
        break;
      case 'outline':
        baseStyle.backgroundColor = 'transparent';
        baseStyle.borderWidth = 1;
        baseStyle.borderColor = '#3B82F6';
        break;
      case 'ghost':
        baseStyle.backgroundColor = 'transparent';
        break;
      default:
        baseStyle.backgroundColor = '#3B82F6';
    }

    return { ...baseStyle, ...style };
  };

  const getTextStyle = (): TextStyle => {
    const baseStyle: TextStyle = {
      fontWeight: '600',
      textAlign: 'center',
    };

    // Size styles
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

    // Variant styles
    switch (variant) {
      case 'outline':
        baseStyle.color = '#3B82F6';
        break;
      case 'ghost':
        baseStyle.color = '#3B82F6';
        break;
      default:
        baseStyle.color = '#FFFFFF';
    }

    return { ...baseStyle, ...textStyle };
  };

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? '#3B82F6' : '#FFFFFF'}
          style={{ marginRight: 8 }}
        />
      )}
      <Text style={getTextStyle()}>{title}</Text>
    </TouchableOpacity>
  );
};