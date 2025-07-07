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
import { Order } from '@/types/order';

export default function OrdersScreen() {
  const { orders, loadOrders, isLoading } = useOrder();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadOrders();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadOrders();
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
      case 'delivered': return '#059669';
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
      out_for_delivery: 'En livraison',
      delivered: 'Livrée',
      cancelled: 'Annulée',
      refunded: 'Remboursée',
    };
    return statusMap[status] || status;
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  const renderOrder = ({ item }: { item: Order }) => (
    <TouchableOpacity
      onPress={() => router.push(`/order/${item.id}`)}
      activeOpacity={0.7}
    >
      <Card style={{ marginHorizontal: 16, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 }}>
              {item.restaurant.name}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
              Commande #{item.id.slice(-8)}
            </Text>
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
            </View>
          </View>
          
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>
              {item.total.toFixed(2)} €
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {new Date(item.createdAt).toLocaleDateString()}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              {item.items.length} article{item.items.length > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoading) return <Loading fullScreen text="Chargement des commandes..." />;
    
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="receipt-outline" size={64} color="#D1D5DB" />
        <Text style={{ fontSize: 18, color: '#6B7280', textAlign: 'center', marginTop: 16 }}>
          Aucune commande trouvée
        </Text>
        <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>
          Les commandes apparaîtront ici une fois que vous en aurez créé
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

  const filters = [
    { key: 'all', label: 'Toutes' },
    { key: 'pending', label: 'En attente' },
    { key: 'confirmed', label: 'Confirmées' },
    { key: 'preparing', label: 'En préparation' },
    { key: 'delivered', label: 'Livrées' },
  ];

  return (
    <View style={containerStyle}>
      <Header title="Commandes" />
      
      <View style={filterContainerStyle}>
        {filters.map((filterOption) => (
          <TouchableOpacity
            key={filterOption.key}
            style={filterButtonStyle(filter === filterOption.key)}
            onPress={() => setFilter(filterOption.key)}
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
        keyExtractor={(item) => item.id}
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