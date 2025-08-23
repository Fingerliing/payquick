import React from 'react';
import { View, Text } from 'react-native';
import { COLORS, COMPONENT_STYLES, useScreenType, getResponsiveValue, TYPOGRAPHY } from '@/utils/designSystem';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const screenType = useScreenType();
  
  const statusConfig: Record<string, { label: string; style: keyof typeof COMPONENT_STYLES.statusBadge }> = {
    pending: { label: 'En attente', style: 'pending' },
    confirmed: { label: 'Confirmée', style: 'confirmed' },
    preparing: { label: 'En préparation', style: 'preparing' },
    ready: { label: 'Prête', style: 'ready' },
    served: { label: 'Servie', style: 'served' },
    cancelled: { label: 'Annulée', style: 'cancelled' },
  };
  
  const config = statusConfig[status] || statusConfig.pending;
  
  const textColorMap: Record<string, string> = {
    pending: COLORS.variants.secondary[700],
    confirmed: COLORS.variants.primary[700],
    preparing: '#92400E',
    ready: '#065F46',
    served: '#065F46',
    cancelled: '#991B1B',
  };
  
  return (
    <View style={[
      COMPONENT_STYLES.statusBadge.base,
      COMPONENT_STYLES.statusBadge[config.style],
    ]}>
      <Text style={{
        fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        color: textColorMap[status] || textColorMap.pending,
      }}>
        {config.label}
      </Text>
    </View>
  );
};