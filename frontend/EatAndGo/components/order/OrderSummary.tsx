import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { OrderSummary as OrderSummaryType } from '@/types/order';
import { Card } from '@/components/ui/Card';

interface OrderSummaryProps {
  summary: OrderSummaryType;
  style?: ViewStyle;
}

export const OrderSummary: React.FC<OrderSummaryProps> = ({ summary, style }) => {
  const containerStyle: ViewStyle = {
    ...style,
  };

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  };

  const labelStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
  };

  const valueStyle: TextStyle = {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  };

  const totalRowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
  };

  const totalLabelStyle: TextStyle = {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  };

  const totalValueStyle: TextStyle = {
    fontSize: 18,
    color: '#111827',
    fontWeight: '700',
  };

  return (
    <Card style={containerStyle}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
        Résumé de la commande
      </Text>

      <View style={rowStyle}>
        <Text style={labelStyle}>Sous-total</Text>
        <Text style={valueStyle}>{summary.subtotal.toFixed(2)} €</Text>
      </View>

      {summary.discount > 0 && (
        <View style={rowStyle}>
          <Text style={labelStyle}>Remise</Text>
          <Text style={[valueStyle, { color: '#10B981' }]}>
            -{summary.discount.toFixed(2)} €
          </Text>
        </View>
      )}

      <View style={rowStyle}>
        <Text style={labelStyle}>Taxes</Text>
        <Text style={valueStyle}>{summary.tax.toFixed(2)} €</Text>
      </View>

      {summary.deliveryFee > 0 && (
        <View style={rowStyle}>
          <Text style={labelStyle}>Frais de livraison</Text>
          <Text style={valueStyle}>{summary.deliveryFee.toFixed(2)} €</Text>
        </View>
      )}

      <View style={totalRowStyle}>
        <Text style={totalLabelStyle}>Total</Text>
        <Text style={totalValueStyle}>{summary.total.toFixed(2)} €</Text>
      </View>
    </Card>
  );
};