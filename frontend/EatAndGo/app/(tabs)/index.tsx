import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext'; // Utilise VOTRE AuthContext
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useOrder } from '@/contexts/OrderContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import StripeAccountStatus from '@/components/stripe/StripeAccountStatus';
import { router } from 'expo-router';

export default function DashboardScreen() {
  const { user, isRestaurateur, refreshUser } = useAuth(); // Utilise vos utilitaires
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
    // Rafraîchir aussi les données utilisateur
    try {
      await refreshUser();
    } catch (error) {
      console.log('Impossible de rafraîchir les données utilisateur');
    }
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  if (restaurantsLoading && restaurants.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Eat&Go"/>
        <Loading fullScreen text="Chargement du tableau de bord..." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Eat&Go"
        showLogout={true}
        logoutPosition="left"
        rightIcon="notifications-outline"
        onRightPress={() => {/* Gérer les notifications */}}
      />
      
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ padding: 16 }}>
          <Text style={{
            fontSize: 24,
            fontWeight: 'bold',
            color: '#111827',
            marginBottom: 4,
          }}>
            {getGreeting()}, {user?.first_name || 'Utilisateur'} !
          </Text>
          <Text style={{
            fontSize: 16,
            color: '#6B7280',
            marginBottom: 24,
          }}>
            {isRestaurateur 
              ? 'Gérez vos restaurants et commandes'
              : 'Voici un aperçu de votre activité'
            }
          </Text>
        </View>

        {/* Section Stripe pour les restaurateurs SEULEMENT */}
        {isRestaurateur && (
          <View style={{ paddingHorizontal: 16, marginBottom: 24 }}>
            <StripeAccountStatus />
          </View>
        )}

        {/* Statistiques rapides */}
        <View style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          marginBottom: 24,
        }}>
          <Card style={{ flex: 1, marginHorizontal: 4 }}>
            <Text style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: '#3B82F6',
              textAlign: 'center',
            }}>{user?.restaurants?.length || restaurants.length}</Text>
            <Text style={{
              fontSize: 12,
              color: '#6B7280',
              textAlign: 'center',
              marginTop: 4,
            }}>Restaurants</Text>
          </Card>
          
          <Card style={{ flex: 1, marginHorizontal: 4 }}>
            <Text style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: '#3B82F6',
              textAlign: 'center',
            }}>{user?.recent_orders?.length || orders.length}</Text>
            <Text style={{
              fontSize: 12,
              color: '#6B7280',
              textAlign: 'center',
              marginTop: 4,
            }}>Commandes</Text>
          </Card>
          
          <Card style={{ flex: 1, marginHorizontal: 4 }}>
            <Text style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: '#3B82F6',
              textAlign: 'center',
            }}>
              {isRestaurateur ? (user?.stats as any)?.active_restaurants || 0 : restaurants.filter(r => r.isActive).length}
            </Text>
            <Text style={{
              fontSize: 12,
              color: '#6B7280',
              textAlign: 'center',
              marginTop: 4,
            }}>Actifs</Text>
          </Card>
        </View>

        {/* Message d'information pour les restaurateurs non validés */}
        {isRestaurateur && !user?.roles?.has_validated_profile && (
          <Card style={{ marginHorizontal: 16, marginBottom: 24 }}>
            <View style={{
              backgroundColor: '#FEF3C7',
              padding: 12,
              borderRadius: 8,
              borderLeftWidth: 4,
              borderLeftColor: '#F59E0B',
            }}>
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#92400E',
                marginBottom: 4,
              }}>
                ⚠️ Validation de compte requise
              </Text>
              <Text style={{
                fontSize: 12,
                color: '#92400E',
                lineHeight: 16,
              }}>
                Validez votre compte Stripe pour activer vos restaurants et recevoir des paiements.
              </Text>
            </View>
          </Card>
        )}

        {/* Restaurants récents */}
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#111827',
          marginBottom: 12,
          paddingHorizontal: 16,
        }}>
          {isRestaurateur ? 'Vos restaurants' : 'Restaurants recommandés'}
        </Text>
        
        {restaurants.slice(0, 3).map((restaurant) => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            onPress={() => router.push(`/restaurant/${restaurant.id}`)}
          />
        ))}

        {/* Message si pas de restaurants pour les restaurateurs */}
        {isRestaurateur && restaurants.length === 0 && (
          <Card style={{ marginHorizontal: 16, marginBottom: 24 }}>
            <Text style={{
              textAlign: 'center',
              color: '#6B7280',
              paddingVertical: 24,
              fontSize: 14,
            }}>
              {user?.roles?.has_validated_profile 
                ? 'Aucun restaurant créé. Créez votre premier restaurant !'
                : 'Validez votre compte Stripe pour créer vos restaurants.'
              }
            </Text>
          </Card>
        )}

        {/* Commandes récentes */}
        <Text style={{
          fontSize: 18,
          fontWeight: '600',
          color: '#111827',
          marginBottom: 12,
          paddingHorizontal: 16,
        }}>
          {isRestaurateur ? 'Commandes reçues' : 'Vos commandes'}
        </Text>
        
        <Card style={{ marginHorizontal: 16, marginBottom: 24 }}>
          {ordersLoading ? (
            <Loading text="Chargement des commandes..." />
          ) : (user?.recent_orders && user.recent_orders.length > 0) || orders.length > 0 ? (
            (user?.recent_orders || orders).slice(0, 5).map((order) => (
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
                    {order.restaurant_name || 'Restaurant'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                    {(order as any).total?.toFixed(2) || '0.00'} €
                  </Text>
                  <Text style={{ 
                    fontSize: 12, 
                    color: order.status === 'served' ? '#10B981' : '#D97706',
                    fontWeight: '500',
                  }}>
                    {order.status}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={{ textAlign: 'center', color: '#6B7280', paddingVertical: 24 }}>
              {isRestaurateur 
                ? 'Aucune commande reçue'
                : 'Aucune commande récente'
              }
            </Text>
          )}
        </Card>

        {/* Section d'actions rapides pour les restaurateurs validés */}
        {isRestaurateur && user?.roles?.has_validated_profile && (
          <>
            <Text style={{
              fontSize: 18,
              fontWeight: '600',
              color: '#111827',
              marginBottom: 12,
              paddingHorizontal: 16,
            }}>Actions rapides</Text>
            <View style={{ 
              flexDirection: 'row', 
              paddingHorizontal: 16, 
              marginBottom: 24,
              gap: 8,
            }}>
              <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ fontSize: 24, marginBottom: 4 }}>🍽️</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                  Créer un restaurant
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ fontSize: 24, marginBottom: 4 }}>📋</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                  Gérer les menus
                </Text>
              </Card>
              <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ fontSize: 24, marginBottom: 4 }}>📊</Text>
                <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                  Voir les stats
                </Text>
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}