import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ListRenderItem,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { orderService } from '@/services/orderService';
import { OrderList, useOrderNormalizer } from '@/types/order';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/common/StatusBadge';

export default function ClientOrdersScreen() {
  const { user, isClient } = useAuth();
  const [orders, setOrders] = useState<OrderList[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const { isUrgent } = useOrderNormalizer();

  useEffect(() => {
    if (isClient) {
      loadOrders();
    }
  }, [isClient]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      
      const ordersData = await orderService.getMyOrders({ page: 1, limit: 50 });
      
      console.log('✅ Orders loaded:', {
        count: ordersData.length,
        sample: ordersData[0]
      });
      
      setOrders(ordersData);
    } catch (error) {
      console.error('❌ Error loading orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  // Fonction helper pour l'affichage
  const getOrderDisplayInfo = (order: OrderList) => {
    return {
      title: `Commande #${order.order_number || order.id}`,
      restaurantName: order.restaurant_name || 'Restaurant',
      itemsText: order.items_count ? 
        `${order.items_count} article${order.items_count > 1 ? 's' : ''}` :
        'Commande',
      totalAmount: order.total_amount ? 
        `${parseFloat(order.total_amount).toFixed(2)} €` : 
        '0.00 €',
      date: new Date(order.created_at).toLocaleDateString('fr-FR'),
      isUrgent: isUrgent(order),
      statusText: order.status_display || order.status,
      paymentText: order.payment_status === 'paid' ? '✅ Payé' : '⏳ En attente',
      waitingTime: order.waiting_time,
    };
  };

  const renderOrderItem: ListRenderItem<OrderList> = ({ item }) => {
    const displayInfo = getOrderDisplayInfo(item);
    
    return (
      <Pressable
        onPress={() => {
          // Navigation avec type assertion pour route dynamique
          router.push(`/order/${item.id}` as any);
        }}
      >
        <Card style={{ 
          marginBottom: 12,
          // Style visuel si commande urgente
          ...(displayInfo.isUrgent && {
            borderLeftWidth: 4,
            borderLeftColor: '#FF3B30'
          })
        }}>
          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start', 
            marginBottom: 12 
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 }}>
                {displayInfo.title}
              </Text>
              <Text style={{ fontSize: 14, color: '#666' }}>
                {displayInfo.restaurantName}
              </Text>
              
              {/* Afficher le résumé des items si disponible */}
              {item.items_summary && (
                <Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {item.items_summary}
                </Text>
              )}
            </View>
            
            <View style={{ alignItems: 'flex-end' }}>
              <StatusBadge status={item.status} />
              <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {displayInfo.date}
              </Text>
              
              {/* Afficher temps d'attente si disponible */}
              {displayInfo.waitingTime && displayInfo.waitingTime > 0 && (
                <Text style={{ 
                  fontSize: 11, 
                  color: displayInfo.waitingTime > 30 ? '#FF3B30' : '#FF9500',
                  marginTop: 2 
                }}>
                  {displayInfo.waitingTime} min
                </Text>
              )}
            </View>
          </View>

          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <Text style={{ fontSize: 14, color: '#666' }}>
              {displayInfo.itemsText}
            </Text>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF6B35' }}>
              {displayInfo.totalAmount}
            </Text>
          </View>

          {/* Informations de table si disponibles */}
          {item.table_number && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <Ionicons name="restaurant-outline" size={14} color="#666" />
              <Text style={{ fontSize: 12, color: '#666', marginLeft: 4 }}>
                Table {item.table_number}
              </Text>
            </View>
          )}

          {/* Informations de type de commande */}
          {item.order_type_display && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Ionicons 
                name={item.order_type === 'dine_in' ? "restaurant" : "bag"} 
                size={14} 
                color="#666" 
              />
              <Text style={{ fontSize: 12, color: '#666', marginLeft: 4 }}>
                {item.order_type_display}
              </Text>
            </View>
          )}

          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginTop: 12 
          }}>
            <Text style={{ fontSize: 12, color: '#999' }}>
              Paiement: {displayInfo.paymentText}
            </Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* Indicateur de prochaine action si disponible */}
              {item.next_possible_status && (
                <Text style={{ fontSize: 11, color: '#007AFF', marginRight: 8 }}>
                  Prochaine étape: {item.next_possible_status}
                </Text>
              )}
              
              <Text style={{ fontSize: 12, color: '#666', marginRight: 4 }}>
                Voir détails
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#666" />
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  if (!isClient) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Mes commandes" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Accès réservé aux clients</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header title="Mes commandes" />

      {orders.length === 0 && !loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Ionicons name="receipt-outline" size={64} color="#ccc" />
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 20, marginBottom: 12 }}>
            Aucune commande
          </Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 30 }}>
            Vous n'avez pas encore passé de commande
          </Text>
          
          <Pressable 
            style={{
              backgroundColor: '#FF6B35',
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 8,
            }}
            onPress={() => router.push('/(client)/index')}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              Scanner QR Code
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Header avec statistiques si disponibles */}
          {orders.length > 0 && (
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-around', 
              padding: 16,
              backgroundColor: '#fff',
              borderBottomWidth: 1,
              borderBottomColor: '#f0f0f0'
            }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#333' }}>
                  {orders.length}
                </Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Total
                </Text>
              </View>
              
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#FF9500' }}>
                  {orders.filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status)).length}
                </Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  En cours
                </Text>
              </View>
              
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#10B981' }}>
                  {orders.filter(o => o.status === 'served').length}
                </Text>
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Terminées
                </Text>
              </View>
            </View>
          )}
          
          <FlatList
            data={orders}
            renderItem={renderOrderItem}
            keyExtractor={(item: OrderList) => item.id.toString()}
            contentContainerStyle={{ padding: 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </SafeAreaView>
  );
}