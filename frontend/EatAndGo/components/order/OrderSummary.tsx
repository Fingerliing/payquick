import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Card } from '@/components/ui/Card';

// Type pour le résumé de commande (cohérent avec les types backend)
export interface OrderSummary {
  subtotal: string;        // Montant décimal en string (cohérent avec l'API)
  discount?: string;       // Remise optionnelle
  tax_amount: string;      // Taxes (nom cohérent avec OrderDetail.tax_amount)
  total_amount: string;    // Total (nom cohérent avec OrderDetail.total_amount)
}

interface OrderSummaryProps {
  summary: OrderSummary;
  style?: ViewStyle;
}

export const OrderSummary: React.FC<OrderSummaryProps> = ({ summary, style }) => {
  // Helper pour parser et formater les montants
  const formatAmount = (amount: string): string => {
    const num = parseFloat(amount || '0');
    return num.toFixed(2);
  };

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

  // Vérifier s'il y a une remise
  const hasDiscount = summary.discount && parseFloat(summary.discount) > 0;

  return (
    <Card style={containerStyle}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
        Résumé de la commande
      </Text>

      <View style={rowStyle}>
        <Text style={labelStyle}>Sous-total</Text>
        <Text style={valueStyle}>{formatAmount(summary.subtotal)} €</Text>
      </View>

      {hasDiscount && (
        <View style={rowStyle}>
          <Text style={labelStyle}>Remise</Text>
          <Text style={[valueStyle, { color: '#10B981' }]}>
            -{formatAmount(summary.discount!)} €
          </Text>
        </View>
      )}

      <View style={rowStyle}>
        <Text style={labelStyle}>Taxes</Text>
        <Text style={valueStyle}>{formatAmount(summary.tax_amount)} €</Text>
      </View>

      <View style={totalRowStyle}>
        <Text style={totalLabelStyle}>Total</Text>
        <Text style={totalValueStyle}>{formatAmount(summary.total_amount)} €</Text>
      </View>
    </Card>
  );
};