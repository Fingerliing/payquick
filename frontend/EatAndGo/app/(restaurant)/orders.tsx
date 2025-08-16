import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrder } from '@/contexts/OrderContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { OrderList } from '@/types/order'; // Using your OrderList type

export default function OrdersScreen() {
  // Using the correct methods from your OrderContext
  const { orders, fetchOrders, isLoading, error } = useOrder();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    // Use fetchOrders with the correct signature from your OrderContext
    const loadInitialOrders = async () => {
      try {
        await fetchOrders({
          page: 1,
          limit: 20, // Load more orders for the orders screen
          filters: {}
        });
      } catch (error) {
        console.error('Error loading orders:', error);
      }
    };

    loadInitialOrders();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchOrders({
        page: 1,
        limit: 20,
        filters: filter !== 'all' ? { status: filter as any } : {}
      });
    } catch (error) {
      console.error('Error refreshing orders:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'confirmed': return '#3B82F6';
      case 'preparing': return '#8B5CF6';
      case 'ready': return '#10B981';
      case 'served': return '#059669';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'En attente',
      confirmed: 'Confirmée',
      preparing: 'En préparation',
      ready: 'Prête',
      served: 'Servie',
      cancelled: 'Annulée',
    };
    return statusMap[status] || status;
  };

  // Filter orders based on the selected filter
  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  const renderOrder = ({ item }: { item: OrderList }) => (
    <TouchableOpacity
      onPress={() => router.push(`/order/${item.id}`)}
      activeOpacity={0.7}
    >
      <Card style={{ marginHorizontal: 16, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 }}>
              {item.restaurant_name || 'Restaurant'}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
              {item.order_number || `Commande #${item.id}`}
            </Text>
            
            {/* Order type and table info */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: '#6B7280', marginRight: 12 }}>
                {item.order_type === 'dine_in' ? '🍽️ Sur place' : '📦 À emporter'}
              </Text>
              {item.table_number && (
                <Text style={{ fontSize: 12, color: '#6B7280' }}>
                  Table {item.table_number}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: getStatusColor(item.status) + '20',
                }}
              >
                <Text style={{ fontSize: 12, color: getStatusColor(item.status), fontWeight: '500' }}>
                  {getStatusText(item.status)}
                </Text>
              </View>
              
              {/* Payment status indicator */}
              {item.payment_status && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                    backgroundColor: item.payment_status === 'paid' ? '#10B981' + '20' : '#F59E0B' + '20',
                    marginLeft: 8,
                  }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: item.payment_status === 'paid' ? '#10B981' : '#F59E0B', 
                    fontWeight: '500' 
                  }}>
                    {item.payment_status === 'paid' ? 'Payé' : 'Non payé'}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          <View style={{ alignItems: 'flex-end' }}>
            {/* Note: OrderList doesn't have total_amount, so we'll show items count instead */}
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
              {item.items_count} article{item.items_count > 1 ? 's' : ''}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {new Date(item.created_at).toLocaleDateString('fr-FR')}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              {new Date(item.created_at).toLocaleTimeString('fr-FR', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </Text>
            {item.waiting_time && (
              <Text style={{ fontSize: 12, color: '#D97706', marginTop: 2 }}>
                ~{item.waiting_time} min
              </Text>
            )}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoading) return <Loading fullScreen text="Chargement des commandes..." />;
    
    if (error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={{ fontSize: 18, color: '#EF4444', textAlign: 'center', marginTop: 16 }}>
            Erreur de chargement
          </Text>
          <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>
            {error}
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            style={{
              backgroundColor: '#3B82F6',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              marginTop: 16,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '500' }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
        <Text style={{ fontSize: 18, color: '#6B7280', textAlign: 'center', marginTop: 16 }}>
          Aucune commande trouvée
        </Text>
        <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>
          {filter === 'all' 
            ? 'Les commandes apparaîtront ici une fois que vous en aurez créé'
            : `Aucune commande avec le statut "${getStatusText(filter)}"`
          }
        </Text>
      </View>
    );
  };

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const filterContainerStyle: ViewStyle = {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  };

  const filterButtonStyle = (isActive: boolean): ViewStyle => ({
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: isActive ? '#3B82F6' : '#F3F4F6',
  });

  const filterTextStyle = (isActive: boolean): TextStyle => ({
    fontSize: 12,
    fontWeight: '500',
    color: isActive ? '#FFFFFF' : '#6B7280',
  });

  // Updated filters to match your OrderStatus type
  const filters = [
    { key: 'all', label: 'Toutes' },
    { key: 'pending', label: 'En attente' },
    { key: 'confirmed', label: 'Confirmées' },
    { key: 'preparing', label: 'En préparation' },
    { key: 'ready', label: 'Prêtes' },
    { key: 'served', label: 'Servies' },
  ];

  // Update filter and refetch when filter changes
  const handleFilterChange = async (newFilter: string) => {
    setFilter(newFilter);
    try {
      await fetchOrders({
        page: 1,
        limit: 20,
        filters: newFilter !== 'all' ? { status: newFilter as any } : {}
      });
    } catch (error) {
      console.error('Error filtering orders:', error);
    }
  };

  return (
    <View style={containerStyle}>
      <Header title="Commandes" />
      
      <View style={filterContainerStyle}>
        {filters.map((filterOption) => (
          <TouchableOpacity
            key={filterOption.key}
            style={filterButtonStyle(filter === filterOption.key)}
            onPress={() => handleFilterChange(filterOption.key)}
          >
            <Text style={filterTextStyle(filter === filterOption.key)}>
              {filterOption.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredOrders}
        renderItem={renderOrder}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}