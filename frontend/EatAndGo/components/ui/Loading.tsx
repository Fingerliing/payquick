import React from 'react';
import { View, ActivityIndicator, Text, ViewStyle, TextStyle } from 'react-native';
import { useAppTheme } from '@/utils/designSystem';

interface LoadingProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  style?: ViewStyle;
  fullScreen?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({
  size = 'large',
  color,
  text,
  style,
  fullScreen = false,
}) => {
  const { colors } = useAppTheme();

  const containerStyle: ViewStyle = {
    justifyContent: 'center',
    alignItems: 'center',
    ...(fullScreen && {
      flex: 1,
      backgroundColor: colors.overlay,
    }),
    ...style,
  };

  const textStyle: TextStyle = {
    marginTop: 8,
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
  };

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={size} color={color ?? colors.primary} />
      {text && <Text style={textStyle}>{text}</Text>}
    </View>
  );
};