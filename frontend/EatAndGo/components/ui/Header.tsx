import React from 'react';
import { View, Text, TouchableOpacity, StatusBar, ViewStyle, TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface HeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: string;
  rightIcon?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  backgroundColor?: string;
  style?: ViewStyle;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  backgroundColor = '#FFFFFF',
  style,
}) => {
  const insets = useSafeAreaInsets();

  const headerStyle: ViewStyle = {
    backgroundColor,
    paddingTop: insets.top,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...style,
  };

  const titleContainerStyle: ViewStyle = {
    flex: 1,
    alignItems: 'center',
  };

  const titleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  };

  const subtitleStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 2,
  };

  const iconButtonStyle: ViewStyle = {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={backgroundColor} />
      <View style={headerStyle}>
        <View style={iconButtonStyle}>
          {leftIcon && onLeftPress && (
            <TouchableOpacity onPress={onLeftPress}>
              <Ionicons name={leftIcon as any} size={24} color="#111827" />
            </TouchableOpacity>
          )}
        </View>

        <View style={titleContainerStyle}>
          <Text style={titleStyle}>{title}</Text>
          {subtitle && <Text style={subtitleStyle}>{subtitle}</Text>}
        </View>

        <View style={iconButtonStyle}>
          {rightIcon && onRightPress && (
            <TouchableOpacity onPress={onRightPress}>
              <Ionicons name={rightIcon as any} size={24} color="#111827" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </>
  );
};