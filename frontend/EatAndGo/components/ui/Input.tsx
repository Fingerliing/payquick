import React, { forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/config';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  containerStyle?: ViewStyle;
  fullWidth?: boolean;
  required?: boolean;
  helperText?: string;
}

export const Input = forwardRef<TextInput, InputProps>(({
  label,
  error,
  leftIcon,
  containerStyle,
  fullWidth = true,
  required = false,
  helperText,
  style,
  ...textInputProps
}, ref) => {
  const hasError = !!error;

  // Styles avec support des icônes
  const containerStyle_: ViewStyle = {
    width: fullWidth ? '100%' : undefined,
    marginBottom: 16,
    ...containerStyle,
  };

  const labelStyle: TextStyle = {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.primary,
    marginBottom: 6,
  };

  const inputContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderColor: hasError ? COLORS.error : '#D1D5DB',
    minHeight: 48,
  };

  const textInputStyle: TextStyle = {
    flex: 1,
    fontSize: 16,
    color: COLORS.text.primary,
    paddingVertical: 0,
    marginLeft: leftIcon ? 8 : 0,
    ...(style as TextStyle),
  };

  const errorStyle: TextStyle = {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
  };

  const helperStyle: TextStyle = {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 4,
  };

  return (
    <View style={containerStyle_}>
      {/* Label */}
      {label && (
        <Text style={labelStyle}>
          {label}
          {required && <Text style={{ color: COLORS.error }}> *</Text>}
        </Text>
      )}

      {/* Input Container avec icône */}
      <View style={inputContainerStyle}>
        {/* Left Icon */}
        {leftIcon && (
          <Ionicons 
            name={leftIcon} 
            size={20} 
            color={hasError ? COLORS.error : COLORS.text.secondary}
          />
        )}

        {/* Text Input */}
        <TextInput
          ref={ref}
          style={textInputStyle}
          placeholderTextColor={COLORS.text.light || '#9CA3AF'}
          editable={true}
          selectTextOnFocus={false}
          {...textInputProps}
        />
      </View>

      {/* Error */}
      {hasError && (
        <Text style={errorStyle}>{error}</Text>
      )}

      {/* Helper Text */}
      {!hasError && helperText && (
        <Text style={helperStyle}>{helperText}</Text>
      )}
    </View>
  );
});

Input.displayName = 'Input';