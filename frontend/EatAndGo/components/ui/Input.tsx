import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  disabled?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
}

export const Input: React.FC<InputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  error,
  disabled = false,
  multiline = false,
  numberOfLines = 1,
  style,
  inputStyle,
  leftIcon,
  rightIcon,
  onRightIconPress,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const containerStyle: ViewStyle = {
    marginBottom: 16,
    ...style,
  };

  const inputContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: error ? '#EF4444' : isFocused ? '#3B82F6' : '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: disabled ? '#F9FAFB' : '#FFFFFF',
    minHeight: multiline ? 80 : 44,
  };

  const textInputStyle: TextStyle = {
    flex: 1,
    fontSize: 16,
    color: disabled ? '#9CA3AF' : '#111827',
    paddingVertical: multiline ? 12 : 0,
    ...inputStyle,
  };

  const labelStyle: TextStyle = {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  };

  const errorStyle: TextStyle = {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  };

  return (
    <View style={containerStyle}>
      {label && <Text style={labelStyle}>{label}</Text>}
      
      <View style={inputContainerStyle}>
        {leftIcon && (
          <Ionicons
            name={leftIcon as any}
            size={20}
            color="#6B7280"
            style={{ marginRight: 8 }}
          />
        )}
        
        <TextInput
          style={textInputStyle}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={!disabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholderTextColor="#9CA3AF"
        />
        
        {secureTextEntry && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>
        )}
        
        {rightIcon && !secureTextEntry && (
          <TouchableOpacity onPress={onRightIconPress}>
            <Ionicons
              name={rightIcon as any}
              size={20}
              color="#6B7280"
              style={{ marginLeft: 8 }}
            />
          </TouchableOpacity>
        )}
      </View>
      
      {error && <Text style={errorStyle}>{error}</Text>}
    </View>
  );
};