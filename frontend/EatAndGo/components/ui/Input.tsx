import React, { useState, forwardRef } from 'react';
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
import { COLORS } from '@/constants/config';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle; // Changé de ViewStyle à TextStyle
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
  fullWidth?: boolean;
  required?: boolean;
  helperText?: string;
  style?: ViewStyle; // Pour le style du container principal
}

export const Input = forwardRef<TextInput, InputProps>(({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  inputStyle,
  labelStyle,
  errorStyle,
  fullWidth = true,
  required = false,
  helperText,
  secureTextEntry,
  style,
  ...textInputProps
}, ref) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(!secureTextEntry);
  const [isFocused, setIsFocused] = useState(false);

  const hasError = !!error;
  const showPasswordToggle = secureTextEntry;

  // Styles de base
  const containerBaseStyle: ViewStyle = {
    width: fullWidth ? '100%' : undefined,
    marginBottom: 16,
    ...style, // Style du conteneur principal
    ...containerStyle, // Style supplémentaire du conteneur
  };

  const labelBaseStyle: TextStyle = {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text.primary,
    marginBottom: 6,
    ...labelStyle,
  };

  const inputContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderColor: hasError 
      ? COLORS.error 
      : isFocused 
        ? COLORS.primary 
        : '#D1D5DB',
    shadowColor: isFocused ? COLORS.primary : 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: isFocused ? 2 : 0,
  };

  const textInputStyle: TextStyle = {
    flex: 1,
    fontSize: 16,
    color: COLORS.text.primary,
    paddingVertical: 0, // Reset padding pour Android
    marginLeft: leftIcon ? 8 : 0,
    marginRight: (rightIcon || showPasswordToggle) ? 8 : 0,
    ...inputStyle,
  };

  const errorTextStyle: TextStyle = {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
    ...errorStyle,
  };

  const helperTextStyle: TextStyle = {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 4,
  };

  const iconColor = hasError 
    ? COLORS.error 
    : isFocused 
      ? COLORS.primary 
      : COLORS.text.secondary;

  const handlePasswordToggle = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  return (
    <View style={containerBaseStyle}>
      {/* Label */}
      {label && (
        <Text style={labelBaseStyle}>
          {label}
          {required && <Text style={{ color: COLORS.error }}> *</Text>}
        </Text>
      )}

      {/* Input Container */}
      <View style={inputContainerStyle}>
        {/* Left Icon */}
        {leftIcon && (
          <Ionicons 
            name={leftIcon} 
            size={20} 
            color={iconColor}
          />
        )}

        {/* Text Input */}
        <TextInput
          ref={ref}
          style={textInputStyle}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholderTextColor={COLORS.text.light}
          {...textInputProps}
        />

        {/* Password Toggle */}
        {showPasswordToggle && (
          <TouchableOpacity 
            onPress={handlePasswordToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons 
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'} 
              size={20} 
              color={iconColor}
            />
          </TouchableOpacity>
        )}

        {/* Right Icon */}
        {rightIcon && !showPasswordToggle && (
          <TouchableOpacity 
            onPress={onRightIconPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons 
              name={rightIcon} 
              size={20} 
              color={iconColor}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Error Message */}
      {hasError && (
        <Text style={errorTextStyle}>{error}</Text>
      )}

      {/* Helper Text */}
      {!hasError && helperText && (
        <Text style={helperTextStyle}>{helperText}</Text>
      )}
    </View>
  );
});

Input.displayName = 'Input';
