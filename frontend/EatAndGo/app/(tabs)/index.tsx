import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useOrder } from '@/contexts/OrderContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import { router } from 'expo-router';

export default function DashboardScreen() {
  const { user } = useAuth();
  const { restaurants, loadRestaurants, isLoading: restaurantsLoading } = useRestaurant();
  const { orders, loadOrders, isLoading: ordersLoading } = useOrder();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      await Promise.all([
        loadRestaurants(),
        loadOrders({ limit: 5 }),
      ]);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const greetingStyle: TextStyle = {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  };

  const subtitleStyle: TextStyle = {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  };

  const sectionTitleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    paddingHorizontal: 16,
  };

  const statsRowStyle: ViewStyle = {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
  };

  const statCardStyle: ViewStyle = {
    flex: 1,
    marginHorizontal: 4,
  };

  const statValueStyle: TextStyle = {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3B82F6',
    textAlign: 'center',
  };

  const statLabelStyle: TextStyle = {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  if (restaurantsLoading && restaurants.length === 0) {
    return (
      <View style={containerStyle}>
        <Header title="Eat&Go" />
        <Loading fullScreen text="Chargement du tableau de bord..." />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Header 
        title="Eat&Go" 
        rightIcon="notifications-outline"
        onRightPress={() => {/* Gérer les notifications */}}
      />
      
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ padding: 16 }}>
          <Text style={greetingStyle}>
            {getGreeting()}, {user?.first_name} !
          </Text>
          <Text style={subtitleStyle}>
            Voici un aperçu de votre activité
          </Text>
        </View>

        {/* Statistiques rapides */}
        <View style={statsRowStyle}>
          <Card style={statCardStyle}>
            <Text style={statValueStyle}>{restaurants.length}</Text>
            <Text style={statLabelStyle}>Restaurants</Text>
          </Card>
          
          <Card style={statCardStyle}>
            <Text style={statValueStyle}>{orders.length}</Text>
            <Text style={statLabelStyle}>Commandes</Text>
          </Card>
          
          <Card style={statCardStyle}>
            <Text style={statValueStyle}>
              {restaurants.filter(r => r.isActive).length}
            </Text>
            <Text style={statLabelStyle}>Actifs</Text>
          </Card>
        </View>

        {/* Restaurants récents */}
        <Text style={sectionTitleStyle}>Vos restaurants</Text>
        {restaurants.slice(0, 3).map((restaurant) => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            onPress={() => router.push(`/restaurant/${restaurant.id}`)}
          />
        ))}

        {/* Commandes récentes */}
        <Text style={sectionTitleStyle}>Commandes récentes</Text>
        <Card style={{ marginHorizontal: 16, marginBottom: 24 }}>
          {ordersLoading ? (
            <Loading text="Chargement des commandes..." />
          ) : orders.length > 0 ? (
            orders.slice(0, 5).map((order) => (
              <View key={order.id} style={{ 
                flexDirection: 'row', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
              }}>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                    {order.restaurant.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>
                    {new Date(order.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                    {order.total.toFixed(2)} €
                  </Text>
                  <Text style={{ 
                    fontSize: 12, 
                    color: order.status === 'delivered' ? '#10B981' : '#D97706',
                    fontWeight: '500',
                  }}>
                    {order.status}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ textAlign: 'center', color: '#6B7280', paddingVertical: 24 }}>
              Aucune commande récente
            </Text>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}