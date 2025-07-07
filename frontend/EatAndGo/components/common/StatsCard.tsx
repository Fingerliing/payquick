import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../ui/Card';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: string;
  style?: ViewStyle;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendValue,
  color = '#3B82F6',
  style,
}) => {
  const getTrendConfig = () => {
    switch (trend) {
      case 'up':
        return { icon: 'trending-up', color: '#10B981' };
      case 'down':
        return { icon: 'trending-down', color: '#EF4444' };
      default:
        return { icon: 'remove', color: '#6B7280' };
    }
  };

  const trendConfig = getTrendConfig();

  const containerStyle: ViewStyle = {
    ...style,
  };

  const headerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  };

  const titleStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  };

  const valueStyle: TextStyle = {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  };

  const subtitleStyle: TextStyle = {
    fontSize: 12,
    color: '#9CA3AF',
  };

  const trendStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  };

  const trendTextStyle: TextStyle = {
    fontSize: 12,
    color: trendConfig.color,
    fontWeight: '500',
    marginLeft: 2,
  };

  return (
    <Card style={containerStyle}>
      <View style={headerStyle}>
        <Text style={titleStyle}>{title}</Text>
        {icon && (
          <View style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: color + '20',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name={icon as any} size={16} color={color} />
          </View>
        )}
      </View>

      <Text style={valueStyle}>{value}</Text>
      
      {subtitle && <Text style={subtitleStyle}>{subtitle}</Text>}
      
      {trend && trendValue && (
        <View style={trendStyle}>
          <Ionicons name={trendConfig.icon as any} size={12} color={trendConfig.color} />
          <Text style={trendTextStyle}>{trendValue}</Text>
        </View>
      )}
    </Card>
  );
};
