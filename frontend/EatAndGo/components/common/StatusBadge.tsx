import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'compact';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  variant = 'default',
  showIcon = true,
}) => {
  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; backgroundColor: string; icon: string; label: string }> = {
      pending: { color: '#F59E0B', backgroundColor: '#FEF3C7', icon: 'time-outline', label: 'En attente' },
      confirmed: { color: '#3B82F6', backgroundColor: '#DBEAFE', icon: 'checkmark-circle-outline', label: 'Confirmée' },
      preparing: { color: '#8B5CF6', backgroundColor: '#E9D5FF', icon: 'restaurant-outline', label: 'En préparation' },
      ready: { color: '#10B981', backgroundColor: '#D1FAE5', icon: 'checkmark-done-outline', label: 'Prête' },
      delivered: { color: '#059669', backgroundColor: '#D1FAE5', icon: 'checkmark-circle', label: 'Livrée' },
      cancelled: { color: '#EF4444', backgroundColor: '#FEE2E2', icon: 'close-circle-outline', label: 'Annulée' },
      active: { color: '#10B981', backgroundColor: '#D1FAE5', icon: 'checkmark-circle', label: 'Actif' },
      inactive: { color: '#6B7280', backgroundColor: '#F3F4F6', icon: 'pause-circle-outline', label: 'Inactif' },
    };
    return configs[status] || configs.pending;
  };

  const config = getStatusConfig(status);
  
  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: config.backgroundColor,
    paddingHorizontal: variant === 'compact' ? 6 : 8,
    paddingVertical: variant === 'compact' ? 2 : 4,
    borderRadius: variant === 'compact' ? 8 : 12,
    alignSelf: 'flex-start',
  };

  const textStyle: TextStyle = {
    fontSize: variant === 'compact' ? 10 : 12,
    fontWeight: '500',
    color: config.color,
    marginLeft: showIcon ? 4 : 0,
  };

  return (
    <View style={containerStyle}>
      {showIcon && (
        <Ionicons 
          name={config.icon as any} 
          size={variant === 'compact' ? 10 : 12} 
          color={config.color} 
        />
      )}
      <Text style={textStyle}>{config.label}</Text>
    </View>
  );
};