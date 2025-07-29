// =============================================================================
// order/[id].tsx - Détails d'une commande
// =============================================================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrder } from '@/contexts/OrderContext';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

// Types de statut pour l'affichage localisé
const STATUS_LABELS = {
  'pending': 'En attente',
  'confirmed': 'Confirmée',
  'preparing': 'En préparation',
  'ready': 'Prête',
  'served': 'Servie',
  'cancelled': 'Annulée',
};

const STATUS_COLORS = {
  'pending': '#F59E0B',
  'confirmed': '#3B82F6',
  'preparing': '#8B5CF6',
  'ready': '#10B981',
  'served': '#059669',
  'cancelled': '#EF4444',
};

const PAYMENT_STATUS_LABELS = {
  'pending': 'En attente',
  'paid': 'Payé',
  'failed': 'Échoué',
};

const ORDER_TYPE_LABELS = {
  'dine_in': '🪑 Sur place',
  'takeaway': '📦 À emporter',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentOrder, loadOrder, updateOrderStatus, cancelOrder, markAsPaid, isLoading } = useOrder();
  const { user, isRestaurateur } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadOrder(Number(id));
    }
  }, [id]);

  const onRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      await loadOrder(Number(id));
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de rafraîchir la commande');
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!currentOrder) return;

    setActionLoading(newStatus);
    try {
      await updateOrderStatus(currentOrder.id, newStatus);
      Alert.alert('Succès', `Commande ${STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS]}`);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
    } finally {
      setActionLoading(null);
    }
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
            setActionLoading('cancel');
            try {
              await cancelOrder(currentOrder.id);
              Alert.alert('Succès', 'Commande annulée avec succès');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible d\'annuler la commande');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleMarkAsPaid = (paymentMethod: string) => {
    if (!currentOrder) return;

    Alert.alert(
      'Marquer comme payé',
      `Confirmer le paiement par ${paymentMethod} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setActionLoading('payment');
            try {
              await markAsPaid(currentOrder.id, paymentMethod);
              Alert.alert('Succès', 'Paiement confirmé');
            } catch (error) {
              Alert.alert('Erreur', 'Erreur lors de la confirmation du paiement');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const showPaymentOptions = () => {
    Alert.alert(
      'Mode de paiement',
      'Comment le client a-t-il payé ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: '💵 Espèces', onPress: () => handleMarkAsPaid('cash') },
        { text: '💳 Carte', onPress: () => handleMarkAsPaid('card') },
        { text: '🌐 En ligne', onPress: () => handleMarkAsPaid('online') },
      ]
    );
  };

  const getNextStatusAction = () => {
    if (!currentOrder) return null;

    switch (currentOrder.status) {
      case 'pending':
        return { status: 'confirmed', label: 'Confirmer', icon: 'checkmark-circle-outline' };
      case 'confirmed':
        return { status: 'preparing', label: 'Commencer préparation', icon: 'restaurant-outline' };
      case 'preparing':
        return { status: 'ready', label: 'Marquer prêt', icon: 'checkmark-done-outline' };
      case 'ready':
        return { status: 'served', label: 'Marquer servi', icon: 'happy-outline' };
      default:
        return null;
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR');
  };

  if (isLoading && !currentOrder) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement de la commande..." />
      </View>
    );
  }

  if (!currentOrder) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
          <Text style={{ fontSize: 18, color: '#6B7280', marginTop: 16, textAlign: 'center' }}>
            Commande non trouvée
          </Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="outline"
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    );
  }

  const nextAction = getNextStatusAction();
  const canCancel = currentOrder.can_be_cancelled;
  const canUpdateStatus = isRestaurateur && currentOrder.status !== 'served' && currentOrder.status !== 'cancelled';
  const needsPayment = currentOrder.payment_status === 'pending' && isRestaurateur;

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title={`Commande ${currentOrder.order_number}`}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Statut de la commande */}
        <Card style={{ margin: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: STATUS_COLORS[currentOrder.status as keyof typeof STATUS_COLORS],
                marginRight: 8,
              }} />
              <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
                {STATUS_LABELS[currentOrder.status as keyof typeof STATUS_LABELS]}
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons 
                name={currentOrder.order_type === 'dine_in' ? 'restaurant' : 'bag'} 
                size={16} 
                color="#6B7280" 
              />
              <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 4 }}>
                {ORDER_TYPE_LABELS[currentOrder.order_type as keyof typeof ORDER_TYPE_LABELS]}
              </Text>
            </View>
          </View>

          {/* Informations client */}
          <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
              Informations client
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>Client:</Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>
                {currentOrder.customer_display}
              </Text>
            </View>
            {currentOrder.table_number && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Table:</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>
                  {currentOrder.table_number}
                </Text>
              </View>
            )}
            {currentOrder.phone && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Téléphone:</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>
                  {currentOrder.phone}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>Commande passée:</Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#111827' }}>
                {formatDateTime(currentOrder.created_at)}
              </Text>
            </View>
          </View>

          {/* Actions pour les restaurateurs */}
          {isRestaurateur && canUpdateStatus && nextAction && (
            <Button
              title={nextAction.label}
              onPress={() => handleStatusUpdate(nextAction.status)}
              loading={actionLoading === nextAction.status}
              leftIcon={nextAction.icon}
              fullWidth
              style={{ marginBottom: 8 }}
            />
          )}

          {/* Action paiement */}
          {needsPayment && (
            <Button
              title="Marquer comme payé"
              onPress={showPaymentOptions}
              loading={actionLoading === 'payment'}
              leftIcon="card-outline"
              variant="secondary"
              fullWidth
              style={{ marginBottom: 8 }}
            />
          )}

          {/* Action annulation */}
          {canCancel && (
            <Button
              title="Annuler la commande"
              onPress={handleCancelOrder}
              loading={actionLoading === 'cancel'}
              leftIcon="close-circle-outline"
              variant="outline"
              fullWidth
            />
          )}
        </Card>

        {/* Items de la commande */}
        <Card style={{ margin: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Détail de la commande
          </Text>

          {currentOrder.items?.map((item, index) => (
            <View key={item.id} style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 12,
              borderBottomWidth: index < (currentOrder.items?.length || 0) - 1 ? 1 : 0,
              borderBottomColor: '#F3F4F6',
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827', marginBottom: 2 }}>
                  {item.quantity}x {item.menu_item_name}
                </Text>
                {item.special_instructions && (
                  <Text style={{ fontSize: 12, color: '#F59E0B', fontStyle: 'italic', marginBottom: 2 }}>
                    ℹ️ {item.special_instructions}
                  </Text>
                )}
                {item.dietary_tags && item.dietary_tags.length > 0 && (
                  <Text style={{ fontSize: 10, color: '#10B981' }}>
                    {item.dietary_tags.join(' • ')}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                  {item.total_price} €
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>
                  {item.unit_price} € / unité
                </Text>
              </View>
            </View>
          ))}

          {/* Totaux */}
          <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, color: '#6B7280' }}>Sous-total:</Text>
              <Text style={{ fontSize: 14, color: '#111827' }}>{currentOrder.subtotal} €</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: '#6B7280' }}>TVA (10%):</Text>
              <Text style={{ fontSize: 14, color: '#111827' }}>{currentOrder.tax_amount} €</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Total:</Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
                {currentOrder.total_amount} €
              </Text>
            </View>
          </View>
        </Card>

        {/* Informations de paiement */}
        <Card style={{ margin: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Paiement
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 14, color: '#6B7280' }}>Statut:</Text>
            <View style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: currentOrder.payment_status === 'paid' ? '#D1FAE5' : '#FEF3C7',
            }}>
              <Text style={{
                fontSize: 12,
                fontWeight: '500',
                color: currentOrder.payment_status === 'paid' ? '#065F46' : '#92400E',
              }}>
                {PAYMENT_STATUS_LABELS[currentOrder.payment_status as keyof typeof PAYMENT_STATUS_LABELS]}
              </Text>
            </View>
          </View>

          {currentOrder.payment_method && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6B7280' }}>Méthode:</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                {currentOrder.payment_method_display}
              </Text>
            </View>
          )}
        </Card>

        {/* Notes */}
        {currentOrder.notes && (
          <Card style={{ margin: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
              Notes
            </Text>
            <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 20 }}>
              {currentOrder.notes}
            </Text>
          </Card>
        )}

        {/* Timeline */}
        <Card style={{ margin: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Historique
          </Text>

          <View style={{ paddingLeft: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#10B981',
                marginRight: 12,
              }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                  Commande créée
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>
                  {formatDateTime(currentOrder.created_at)}
                </Text>
              </View>
            </View>

            {currentOrder.ready_at && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#10B981',
                  marginRight: 12,
                }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                    Commande prête
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>
                    {formatDateTime(currentOrder.ready_at)}
                  </Text>
                </View>
              </View>
            )}

            {currentOrder.served_at && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#10B981',
                  marginRight: 12,
                }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                    Commande servie
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>
                    {formatDateTime(currentOrder.served_at)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Card>

        {/* Actions client */}
        {!isRestaurateur && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <Button
              title="Contacter le restaurant"
              onPress={() => {/* Logique pour contacter */}}
              variant="outline"
              leftIcon="call-outline"
              fullWidth
              style={{ marginBottom: 8 }}
            />
            
            {currentOrder.status === 'served' && (
              <Button
                title="Noter ma commande"
                onPress={() => router.push(`/review/add/${currentOrder.id}` as any)}
                variant="outline"
                leftIcon="star-outline"
                fullWidth
              />
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}