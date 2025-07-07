import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrder } from '@/contexts/OrderContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormatUtils } from '@/utils/formatters';
import { ORDER_STATUS_COLORS } from '@/utils/constants';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentOrder, loadOrder, updateOrderStatus, cancelOrder } = useOrder();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadOrder(id);
    }
  }, [id]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!currentOrder) return;

    Alert.alert(
      'Modifier le statut',
      `Changer le statut vers "${newStatus}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              setIsLoading(true);
              await updateOrderStatus(currentOrder.id, newStatus);
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de modifier le statut');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelOrder = () => {
    if (!currentOrder) return;

    Alert.alert(
      'Annuler la commande',
      'Êtes-vous sûr de vouloir annuler cette commande ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await cancelOrder(currentOrder.id);
            } catch (error) {
              Alert.alert('Erreur', 'Impossible d\'annuler la commande');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  if (!currentOrder && isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement de la commande..." />
      </View>
    );
  }

  if (!currentOrder) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' }}>
        <Header title="Commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Text style={{ fontSize: 16, color: '#6B7280' }}>Commande non trouvée</Text>
      </View>
    );
  }

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const statusStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORDER_STATUS_COLORS[currentOrder.status] + '20',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    alignSelf: 'flex-start',
  };

  const statusTextStyle: TextStyle = {
    fontSize: 14,
    fontWeight: '500',
    color: ORDER_STATUS_COLORS[currentOrder.status],
    marginLeft: 6,
  };

  const infoRowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return 'time-outline';
      case 'confirmed': return 'checkmark-circle-outline';
      case 'preparing': return 'restaurant-outline';
      case 'ready': return 'checkmark-done-outline';
      case 'out_for_delivery': return 'car-outline';
      case 'delivered': return 'checkmark-circle';
      case 'cancelled': return 'close-circle-outline';
      default: return 'help-circle-outline';
    }
  };

  const getNextStatuses = () => {
    switch (currentOrder.status) {
      case 'pending': return ['confirmed', 'cancelled'];
      case 'confirmed': return ['preparing', 'cancelled'];
      case 'preparing': return ['ready', 'cancelled'];
      case 'ready': return ['out_for_delivery'];
      case 'out_for_delivery': return ['delivered'];
      default: return [];
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'En attente',
      confirmed: 'Confirmée',
      preparing: 'En préparation',
      ready: 'Prête',
      out_for_delivery: 'En livraison',
      delivered: 'Livrée',
      cancelled: 'Annulée',
    };
    return labels[status] || status;
  };

  return (
    <View style={containerStyle}>
      <Header 
        title={`Commande #${currentOrder.id.slice(-8)}`}
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Statut de la commande */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
              Statut de la commande
            </Text>
            <View style={statusStyle}>
              <Ionicons 
                name={getStatusIcon(currentOrder.status) as any} 
                size={16} 
                color={ORDER_STATUS_COLORS[currentOrder.status]} 
              />
              <Text style={statusTextStyle}>
                {getStatusLabel(currentOrder.status)}
              </Text>
            </View>
          </View>

          <View style={infoRowStyle}>
            <Text style={labelStyle}>Restaurant</Text>
            <Text style={valueStyle}>{currentOrder.restaurant.name}</Text>
          </View>

          <View style={infoRowStyle}>
            <Text style={labelStyle}>Date de commande</Text>
            <Text style={valueStyle}>
              {FormatUtils.formatDateTime(currentOrder.createdAt)}
            </Text>
          </View>

          {currentOrder.estimatedDeliveryTime && (
            <View style={infoRowStyle}>
              <Text style={labelStyle}>Livraison estimée</Text>
              <Text style={valueStyle}>
                {FormatUtils.formatTime(currentOrder.estimatedDeliveryTime)}
              </Text>
            </View>
          )}

          {currentOrder.customer && (
            <>
              <View style={infoRowStyle}>
                <Text style={labelStyle}>Client</Text>
                <Text style={valueStyle}>
                  {currentOrder.customer.firstName} {currentOrder.customer.lastName}
                </Text>
              </View>

              <View style={infoRowStyle}>
                <Text style={labelStyle}>Téléphone</Text>
                <Text style={valueStyle}>{currentOrder.customer.phone}</Text>
              </View>
            </>
          )}

          <View style={[infoRowStyle, { borderBottomWidth: 0 }]}>
            <Text style={labelStyle}>Montant total</Text>
            <Text style={[valueStyle, { fontSize: 16, color: '#059669' }]}>
              {FormatUtils.formatPrice(currentOrder.total)}
            </Text>
          </View>
        </Card>

        {/* Articles commandés */}
        <Card style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Articles commandés
          </Text>

          {currentOrder.items.map((item, index) => (
            <View key={index} style={[
              infoRowStyle,
              index === currentOrder.items.length - 1 && { borderBottomWidth: 0 }
            ]}>
              <View style={{ flex: 1 }}>
                <Text style={valueStyle}>{item.product.name}</Text>
                <Text style={labelStyle}>Quantité: {item.quantity}</Text>
                {item.specialInstructions && (
                  <Text style={[labelStyle, { fontStyle: 'italic' }]}>
                    Note: {item.specialInstructions}
                  </Text>
                )}
              </View>
              <Text style={valueStyle}>
                {FormatUtils.formatPrice(item.totalPrice)}
              </Text>
            </View>
          ))}
        </Card>

        {/* Adresse de livraison */}
        {currentOrder.deliveryAddress && (
          <Card style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
              Adresse de livraison
            </Text>
            <Text style={valueStyle}>
              {FormatUtils.formatAddress(currentOrder.deliveryAddress)}
            </Text>
            {currentOrder.deliveryAddress.instructions && (
              <Text style={[labelStyle, { marginTop: 8 }]}>
                Instructions: {currentOrder.deliveryAddress.instructions}
              </Text>
            )}
          </Card>
        )}

        {/* Notes du client */}
        {currentOrder.customerNotes && (
          <Card style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
              Notes du client
            </Text>
            <Text style={valueStyle}>{currentOrder.customerNotes}</Text>
          </Card>
        )}

        {/* Actions possibles */}
        {getNextStatuses().length > 0 && (
          <Card style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
              Actions
            </Text>
            
            {getNextStatuses().map((status) => (
              <Button
                key={status}
                title={`Marquer comme ${getStatusLabel(status).toLowerCase()}`}
                onPress={() => handleStatusUpdate(status)}
                variant={status === 'cancelled' ? 'secondary' : 'primary'}
                style={{ marginBottom: 8 }}
                fullWidth
              />
            ))}
          </Card>
        )}
      </ScrollView>

      {/* Actions en bas */}
      {currentOrder.status !== 'delivered' && currentOrder.status !== 'cancelled' && (
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          padding: 16, 
          borderTopWidth: 1, 
          borderTopColor: '#E5E7EB' 
        }}>
          <Button
            title="Annuler la commande"
            onPress={handleCancelOrder}
            variant="secondary"
            loading={isLoading}
            fullWidth
          />
        </View>
      )}
    </View>
  );
}