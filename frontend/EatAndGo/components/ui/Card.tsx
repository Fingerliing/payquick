import React, { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  padding?: number;
  margin?: number;
  shadow?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  padding = 16,
  margin = 0,
  shadow = true,
}) => {
  const cardStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding,
    margin,
    ...(shadow && {
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    }),
    ...style,
  };

  return <View style={cardStyle}>{children}</View>;
};