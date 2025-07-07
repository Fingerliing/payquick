import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionTitle,
  onAction,
  style,
}) => {
  const containerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
    ...style,
  };

  const titleStyle: TextStyle = {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  };

  const descriptionStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  };

  return (
    <View style={containerStyle}>
      <Ionicons name={icon as any} size={64} color="#D1D5DB" />
      <Text style={titleStyle}>{title}</Text>
      <Text style={descriptionStyle}>{description}</Text>
      {actionTitle && onAction && (
        <Button title={actionTitle} onPress={onAction} />
      )}
    </View>
  );
};
