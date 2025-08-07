import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
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
import StripeAccountStatus from '@/components/stripe/StripeAccountStatus';
import { router } from 'expo-router';
import { Order, OrderList, isOrderList } from '@/types/order';
import { RecentOrder } from '@/types/user';

export default function DashboardScreen() {
  const { user, isRestaurateur, refreshUser } = useAuth();
  const { restaurants, loadRestaurants, isLoading: restaurantsLoading, error: restaurantsError } = useRestaurant();
  const { orders, loadOrders, isLoading: ordersLoading, error: ordersError } = useOrder();
  const [refreshing, setRefreshing] = useState(false);
  const safeRestaurants = Array.isArray(restaurants) ? restaurants : [];
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeUserOrders = Array.isArray(user?.recent_orders) ? user.recent_orders : [];
  
  // Choisir la source de données prioritaire
  const displayOrders = safeUserOrders.length > 0 ? safeUserOrders : safeOrders;

  // 🔍 DEBUG complet
  console.log('=== DASHBOARD FINAL DEBUG ===');
  console.log('🏠 Restaurants:', {
    raw: restaurants,
    safe: safeRestaurants.length,
    type: typeof restaurants,
    isArray: Array.isArray(restaurants)
  });
  console.log('📋 Orders:', {
    raw: orders,
    safe: safeOrders.length,
    userOrders: safeUserOrders.length,
    display: displayOrders.length,
    type: typeof orders,
    isArray: Array.isArray(orders)
  });
  console.log('🔄 States:', { restaurantsLoading, ordersLoading, refreshing });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      console.log('🔄 Dashboard: Starting refresh...');
      await Promise.all([
        loadRestaurants(),
        // Correction : utilisation du bon format pour loadOrders
        loadOrders({ page: 1, limit: 5 }),
        refreshUser(),
      ]);
      console.log('✅ Dashboard: Refresh completed');
    } catch (error) {
      console.error('❌ Dashboard: Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Fonction utilitaire pour obtenir le nom du restaurant
  const getRestaurantName = (order: Order | RecentOrder): string => {
    // Si c'est un RecentOrder (de user.recent_orders)
    if ('restaurant_name' in order && order.restaurant_name) {
      return order.restaurant_name;
    }
    
    // Si c'est un OrderList qui a restaurant_name
    if (isOrderList(order) && order.restaurant_name) {
      return order.restaurant_name;
    }
    
    // Si c'est un Order avec une relation restaurant
    if ('restaurant' in order && typeof order.restaurant === 'object' && order.restaurant?.name) {
      return order.restaurant.name;
    }
    
    // Fallback
    return 'Restaurant';
  };

  // Fonction utilitaire pour obtenir le total
  const getOrderTotal = (order: Order | RecentOrder): string => {
    // Si c'est un RecentOrder, il n'a pas de total
    if ('restaurant_name' in order && !('total_amount' in order)) {
      return '0.00';
    }
    
    // Si c'est un Order avec total_amount (string)
    if ('total_amount' in order && order.total_amount) {
      const amount = parseFloat(order.total_amount);
      return isNaN(amount) ? '0.00' : amount.toFixed(2);
    }
    
    // Si c'est un Order avec total (number) - pour compatibility
    if ('total' in order && typeof order.total === 'number') {
      return order.total.toFixed(2);
    }
    
    // Fallback
    return '0.00';
  };

  // Fonction utilitaire pour obtenir la date
  const getOrderDate = (order: Order | RecentOrder): string => {
    const dateString = order?.created_at;
    if (!dateString) return 'Date inconnue';
    
    try {
      return new Date(dateString).toLocaleDateString('fr-FR');
    } catch {
      return 'Date inconnue';
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bonjour';
    if (hour < 18) return 'Bon après-midi';
    return 'Bonsoir';
  };

  const isInitialLoading = restaurantsLoading || ordersLoading;
  const hasData = safeRestaurants.length > 0 || safeOrders.length > 0;

  if (isInitialLoading && !hasData) {
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
            }}>
              {safeRestaurants.length}
            </Text>
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
            }}>
              {displayOrders.length}
            </Text>
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
              {isRestaurateur 
                ? (user?.stats as any)?.active_restaurants || 0 
                : safeRestaurants.filter(r => r?.isActive).length
              }
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
        
        <View style={{ marginBottom: 24 }}>
          {safeRestaurants.length > 0 ? (
            safeRestaurants.slice(0, 3).map((restaurant, index) => {
              console.log(`🏠 Rendering restaurant ${index}:`, restaurant?.id);
              return (
                <RestaurantCard
                  key={restaurant?.id || `restaurant-${index}`}
                  restaurant={restaurant}
                  onPress={() => router.push(`/restaurant/${restaurant?.id}`)}
                />
              );
            })
          ) : (
            <Card style={{ marginHorizontal: 16 }}>
              <Text style={{
                textAlign: 'center',
                color: '#6B7280',
                paddingVertical: 24,
                fontSize: 14,
              }}>
                {restaurantsLoading 
                  ? 'Chargement des restaurants...'
                  : restaurantsError
                    ? `Erreur: ${restaurantsError}`
                    : isRestaurateur 
                      ? (user?.roles?.has_validated_profile 
                        ? 'Aucun restaurant créé. Créez votre premier restaurant !'
                        : 'Validez votre compte Stripe pour créer vos restaurants.')
                      : 'Aucun restaurant disponible pour le moment.'
                }
              </Text>
            </Card>
          )}
        </View>

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
          {ordersLoading && displayOrders.length === 0 ? (
            <Loading text="Chargement des commandes..." />
          ) : displayOrders.length > 0 ? (
            displayOrders.slice(0, 5).map((order, index) => {
              console.log(`📋 Rendering order ${index}:`, order?.id);
              return (
                <TouchableOpacity
                  key={order?.id || `order-${index}`}
                  onPress={() => router.push(`/order/${order?.id}`)}
                  style={{ 
                    flexDirection: 'row', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    paddingVertical: 12,
                    borderBottomWidth: index < Math.min(displayOrders.length, 5) - 1 ? 1 : 0,
                    borderBottomColor: '#E5E7EB',
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                      {getRestaurantName(order)}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>
                      {getOrderDate(order)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                      {getOrderTotal(order)} €
                    </Text>
                    <Text style={{ 
                      fontSize: 12, 
                      color: ['served', 'delivered', 'completed'].includes(order?.status) ? '#10B981' : '#D97706',
                      fontWeight: '500',
                    }}>
                      {order?.status || 'Statut inconnu'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={{ textAlign: 'center', color: '#6B7280', paddingVertical: 24 }}>
              {ordersLoading
                ? 'Chargement des commandes...'
                : ordersError
                  ? `Erreur: ${ordersError}`
                  : isRestaurateur 
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
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => router.push('/restaurant/create')}
              >
                <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>🍽️</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                    Créer un restaurant
                  </Text>
                </Card>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => router.push('/qrcodes')}
              >
                <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>📱</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                    QR Codes Tables
                  </Text>
                </Card>
              </TouchableOpacity>
              
              {/* Placeholder pour d'autres actions rapides */}
              {/* <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => router.push('/menu/manage')}
              >
                <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>📋</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                    Gérer les menus
                  </Text>
                </Card>
              </TouchableOpacity> */}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}