import React from 'react';
import { View, ActivityIndicator, Text, ViewStyle, TextStyle } from 'react-native';

interface LoadingProps {
  size?: 'small' | 'large';
  color?: string;
  text?: string;
  style?: ViewStyle;
  fullScreen?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({
  size = 'large',
  color = '#3B82F6',
  text,
  style,
  fullScreen = false,
}) => {
  const containerStyle: ViewStyle = {
    justifyContent: 'center',
    alignItems: 'center',
    ...(fullScreen && {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
    }),
    ...style,
  };

  const textStyle: TextStyle = {
    marginTop: 8,
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  };

  return (
    <View style={containerStyle}>
      <ActivityIndicator size={size} color={color} />
      {text && <Text style={textStyle}>{text}</Text>}
    </View>
  );
};