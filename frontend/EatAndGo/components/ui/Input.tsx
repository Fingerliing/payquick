import React, { forwardRef, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  findNodeHandle,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

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
  /** Ref du ScrollView parent — permet le scroll automatique au focus */
  scrollRef?: React.RefObject<ScrollView | null>;
  /** Décalage au-dessus du champ une fois scrollé (défaut 16px) */
  scrollOffset?: number;
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
  scrollRef,
  scrollOffset = 16,
  style,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const screenType = useScreenType();
  const internalRef = useRef<TextInput>(null);
  const containerRef = useRef<View>(null);

  const resolvedRef = (ref as React.RefObject<TextInput>) || internalRef;

  const hasError = !!error;

  const handleContainerPress = () => {
    resolvedRef.current?.focus();
  };

  /** Au focus : mesure la position du champ dans le ScrollView et scroll dessus */
  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);

    if (!scrollRef?.current || !containerRef.current) return;

    const scrollNode = findNodeHandle(scrollRef.current);
    if (!scrollNode) return;

    containerRef.current.measureLayout(
      scrollNode,
      (_x, y, _w, height) => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - scrollOffset),
          animated: true,
        });
      },
      () => { /* mesure échouée, on ignore */ },
    );
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  // STYLES RESPONSIVES
  const containerStyle: ViewStyle = {
    width: fullWidth ? '100%' : undefined,
    marginBottom: getResponsiveValue(SPACING.md, screenType),
  };

  const labelStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: hasError ? COLORS.error : COLORS.text.primary,
    marginBottom: getResponsiveValue(SPACING.xs, screenType),
  };

  const inputContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderColor: hasError
      ? COLORS.error
      : isFocused
        ? COLORS.primary
        : COLORS.border.light,
    paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
    paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    minHeight: getResponsiveValue({ mobile: 48, tablet: 52, desktop: 56 }, screenType),
  };

  const textInputStyle: TextStyle = {
    flex: 1,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    color: COLORS.text.primary,
    paddingVertical: 0,
    marginLeft: leftIcon ? getResponsiveValue(SPACING.sm, screenType) : 0,
    marginRight: rightIcon ? getResponsiveValue(SPACING.sm, screenType) : 0,
    ...(style as TextStyle),
  };

  const iconColor = hasError
    ? COLORS.error
    : isFocused
      ? COLORS.primary
      : COLORS.text.light;

  const messageStyle: TextStyle = {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
    marginTop: getResponsiveValue(SPACING.xs, screenType),
    color: hasError ? COLORS.error : COLORS.text.light,
  };

  return (
    <View style={containerStyle} ref={containerRef}>
      {/* Label */}
      {label && variant === 'default' && (
        <Text style={labelStyle}>
          {label}
          {required && <Text style={{ color: COLORS.error }}> *</Text>}
        </Text>
      )}

      {/* Input Container — Pressable sur toute la surface */}
      <Pressable onPress={handleContainerPress} style={inputContainerStyle}>
        {leftIcon && (
          <Ionicons name={leftIcon} size={20} color={iconColor} />
        )}

        <TextInput
          ref={resolvedRef}
          style={textInputStyle}
          placeholderTextColor={COLORS.text.light}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />

        {rightIcon && (
          <TouchableOpacity
            onPress={onRightIconPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={rightIcon} size={20} color={iconColor} />
          </TouchableOpacity>
        )}
      </Pressable>

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