import React, { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/styles/tokens/colors';
import { TYPOGRAPHY } from '@/styles/tokens/typography';
import { SPACING } from '@/styles/tokens/spacing';
import { RADIUS } from '@/styles/tokens/radius';
import { useResponsive } from '@/utils/responsive';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  helperText?: string;
  required?: boolean;
  fullWidth?: boolean;
  variant?: 'default' | 'floating';
}

export const Input = forwardRef<TextInput, InputProps>(({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  helperText,
  required = false,
  fullWidth = true,
  variant = 'default',
  style,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const { getSpacing, getFontSize } = useResponsive();
  
  const hasError = !!error;
  const hasValue = !!props.value || !!props.defaultValue;

  // ✅ STYLES RESPONSIVES
  const containerStyle: ViewStyle = {
    width: fullWidth ? '100%' : undefined,
    marginBottom: getSpacing(SPACING.md, SPACING.lg),
  };

  const labelStyle: TextStyle = {
    fontSize: getFontSize(14, 15, 16),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: hasError ? COLORS.error : COLORS.text.primary,
    marginBottom: getSpacing(SPACING.xs, SPACING.sm),
  };

  const inputContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.input,
    backgroundColor: COLORS.surface.primary,
    borderColor: hasError 
      ? COLORS.error 
      : isFocused 
        ? COLORS.primary 
        : COLORS.border.light,
    paddingHorizontal: getSpacing(SPACING.md, SPACING.lg),
    paddingVertical: getSpacing(SPACING.sm, SPACING.md),
    minHeight: getSpacing(48, 52, 56),
  };

  const textInputStyle: TextStyle = {
    flex: 1,
    fontSize: getFontSize(16, 17, 18),
    color: COLORS.text.primary,
    paddingVertical: 0,
    marginLeft: leftIcon ? SPACING.sm : 0,
    marginRight: rightIcon ? SPACING.sm : 0,
    ...(style as TextStyle),
  };

  const iconColor = hasError 
    ? COLORS.error 
    : isFocused 
      ? COLORS.primary 
      : COLORS.text.tertiary;

  const messageStyle: TextStyle = {
    fontSize: getFontSize(12, 13, 14),
    marginTop: SPACING.xs,
    color: hasError ? COLORS.error : COLORS.text.tertiary,
  };

  return (
    <View style={containerStyle}>
      {/* Label */}
      {label && variant === 'default' && (
        <Text style={labelStyle}>
          {label}
          {required && <Text style={{ color: COLORS.error }}> *</Text>}
        </Text>
      )}

      {/* Input Container */}
      <View style={inputContainerStyle}>
        {leftIcon && (
          <Ionicons name={leftIcon} size={20} color={iconColor} />
        )}

        <TextInput
          ref={ref}
          style={textInputStyle}
          placeholderTextColor={COLORS.text.white}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />

        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress}>
            <Ionicons name={rightIcon} size={20} color={iconColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Error / Helper Text */}
      {(error || helperText) && (
        <Text style={messageStyle}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
});

Input.displayName = 'Input';
