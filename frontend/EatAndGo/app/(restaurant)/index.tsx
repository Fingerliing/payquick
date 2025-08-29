import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useOrder } from '@/contexts/OrderContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import StripeAccountStatus from '@/components/stripe/StripeAccountStatus';
import { ValidationPending } from '@/components/restaurant/ValidationPending';
import { router } from 'expo-router';
import { OrderList, OrderDetail } from '@/types/order';
import { RecentOrder } from '@/types/user';
import { useResponsive } from '@/utils/responsive';
import { 
  COLORS, 
  TYPOGRAPHY, 
  SPACING, 
  BORDER_RADIUS, 
  SHADOWS,
  createResponsiveStyles,
  useScreenType,
  getResponsiveValue
} from '@/utils/designSystem';

type DashStyles = {
  container: ViewStyle;
  scrollContainer: ViewStyle;
  contentContainer: ViewStyle;
  header: ViewStyle;

  greeting: TextStyle;
  subtitle: TextStyle;

  statsContainer: ViewStyle;
  statCard: ViewStyle;
  statValue: TextStyle;
  statLabel: TextStyle;

  sectionTitle: TextStyle;
  sectionContainer: ViewStyle;

  warningCard: ViewStyle;
  warningTitle: TextStyle;
  warningText: TextStyle;

  restaurantsGrid: ViewStyle;
  emptyStateCard: ViewStyle;
  emptyStateText: TextStyle;

  ordersCard: ViewStyle;
  orderItem: ViewStyle;
  orderItemContent: ViewStyle;
  orderRestaurant: TextStyle;
  orderDetails: TextStyle;
  orderSummary: ViewStyle;
  orderAmount: TextStyle;
  orderStatus: TextStyle;

  quickActionsGrid: ViewStyle;
  quickActionCard: ViewStyle;
  quickActionIcon: TextStyle;
  quickActionText: TextStyle;
};

// Type guards
function isRecentOrder(order: any): order is RecentOrder {
  return 'restaurant_name' in order && !('restaurant' in order);
}

function isOrderList(order: any): order is OrderList {
  return 'order_number' in order && 'restaurant' in order;
}

function isOrderDetail(order: any): order is OrderDetail {
  return 'items' in order && 'restaurant' in order;
}

// Helper functions
function getRestaurantName(order: OrderList | OrderDetail | RecentOrder): string {
  if (isRecentOrder(order)) {
    return order.restaurant_name || 'Restaurant';
  }
  if (isOrderList(order) || isOrderDetail(order)) {
    return order.restaurant_name || 'Restaurant';
  }
  return 'Restaurant';
}

function getOrderTotal(order: OrderList | OrderDetail | RecentOrder): string {
  if (isOrderDetail(order) && order.total_amount) {
    const amount = parseFloat(order.total_amount);
    return isNaN(amount) ? '0.00' : amount.toFixed(2);
  }
  
  if (isRecentOrder(order)) {
    if ('total_amount' in order && typeof order.total_amount === 'string') {
      const amount = parseFloat(order.total_amount);
      return isNaN(amount) ? '0.00' : amount.toFixed(2);
    }
    if ('total' in order && typeof order.total === 'number') {
      return order.total.toFixed(2);
    }
  }
  
  return '0.00';
}

function getOrderDate(order: OrderList | OrderDetail | RecentOrder): string {
  if (!order?.created_at) return 'Date inconnue';
  try {
    return new Date(order.created_at).toLocaleDateString('fr-FR');
  } catch {
    return 'Date inconnue';
  }
}

function getOrderNumber(order: OrderList | OrderDetail | RecentOrder): string {
  if (isOrderList(order) || isOrderDetail(order)) {
    return order.order_number || `#${order.id}`;
  }
  if ('id' in order) {
    return `#${order.id}`;
  }
  return 'N/A';
}

function isOrderCompleted(status?: string): boolean {
  return (
    typeof status === 'string' &&
    ['served', 'delivered', 'completed'].includes(status)
  );
}

export default function DashboardScreen() {
  const { user, isRestaurateur, refreshUser } = useAuth();
  const {
    restaurants,
    loadRestaurants,
    isLoading: restaurantsLoading,
    error: restaurantsError,
    validationStatus,
  } = useRestaurant();

  const {
    orders,
    fetchOrders,
    isLoading: ordersLoading,
    error: ordersError,
  } = useOrder();

  // Hooks responsive
  const responsive = useResponsive();
  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);

  const [refreshing, setRefreshing] = useState(false);
  const safeRestaurants = Array.isArray(restaurants) ? restaurants : [];
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeUserOrders = Array.isArray(user?.recent_orders) ? user.recent_orders : [];

  const displayOrders = safeUserOrders.length > 0 ? safeUserOrders : safeOrders;

  // Styles dynamiques basés sur la taille d'écran
  const dynamicStyles = StyleSheet.create<DashStyles>({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    
    scrollContainer: {
      flex: 1,
    },
    
    contentContainer: {
      ...styles.container,
      width: '100%' as const,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
    },
    
    header: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    
    greeting: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    
    subtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.secondary,
      lineHeight: TYPOGRAPHY.lineHeight.relaxed,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    
    statsContainer: {
      ...styles.grid,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    
    statCard: {
      ...styles.card,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      minHeight: responsive.isMobile ? 80 : 100,
      justifyContent: 'center' as const,
      flex: 1,
    },
    
    statValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.extrabold,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    
    statLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    sectionContainer: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    
    warningCard: {
      backgroundColor: COLORS.variants.secondary[50],
      padding: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.warning,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    
    warningTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.variants.secondary[800],
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    
    warningText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.variants.secondary[700],
      lineHeight: TYPOGRAPHY.lineHeight.normal,
    },
    
    restaurantsGrid: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    
    emptyStateCard: {
      ...styles.card,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING.xl, screenType),
    },
    
    emptyStateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: TYPOGRAPHY.lineHeight.normal,
    },
    
    ordersCard: {
      ...styles.card,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    
    orderItem: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    
    orderItemContent: {
      flex: 1,
      marginRight: getResponsiveValue(SPACING.md, screenType),
    },
    
    orderRestaurant: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    
    orderDetails: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
    
    orderSummary: {
      alignItems: 'flex-end' as const,
    },
    
    orderAmount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    
    orderStatus: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    
    quickActionsGrid: {
      ...styles.grid,
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    
    quickActionCard: {
      ...styles.card,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      flex: 1,
      minHeight: responsive.isMobile ? 100 : 120,
      justifyContent: 'center' as const,
    },
    
    quickActionIcon: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    
    quickActionText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
  });

  if (isRestaurateur && validationStatus?.needsValidation) {
    return <ValidationPending validationStatus={validationStatus} />;
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const promises = [
          loadRestaurants(),
          refreshUser(),
        ];

        if (fetchOrders && typeof fetchOrders === 'function') {
          promises.push(
            fetchOrders({
              page: 1,
              limit: 5,
              filters: {}
            })
          );
        }

        await Promise.all(promises);
      } catch (error) {
        console.error('Dashboard: Initial load error:', error);
      }
    };

    fetchData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const promises = [
        loadRestaurants(),
        refreshUser(),
      ];

      if (fetchOrders && typeof fetchOrders === 'function') {
        promises.push(
          fetchOrders({
            page: 1,
            limit: 5,
            filters: {}
          })
        );
      }

      await Promise.all(promises);
    } catch (error) {
      console.error('Dashboard: Refresh error:', error);
    } finally {
      setRefreshing(false);
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
      <View style={dynamicStyles.container}>
        <Header title="Eat&Go" />
        <Loading fullScreen text="Chargement du tableau de bord..." />
      </View>
    );
  }

  return (
    <View style={dynamicStyles.container}>
      <Header
        title="Eat&Go"
        showLogout
        logoutPosition="left"
        rightIcon="notifications-outline"
        onRightPress={() => {}}
      />

      <ScrollView
        style={dynamicStyles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={dynamicStyles.contentContainer}>
          {/* Header avec salutation */}
          <View style={dynamicStyles.header}>
            <Text style={dynamicStyles.greeting}>
              {getGreeting()}, {user?.first_name || 'Utilisateur'} !
            </Text>
            <Text style={dynamicStyles.subtitle}>
              {isRestaurateur
                ? 'Gérez vos restaurants et commandes'
                : 'Voici un aperçu de votre activité'}
            </Text>
          </View>

          {/* Alerte Stripe si nécessaire */}
          {isRestaurateur && !user?.roles?.has_validated_profile && (
            <View style={dynamicStyles.sectionContainer}>
              <StripeAccountStatus />
            </View>
          )}

          {/* Statistiques responsive */}
          <View style={dynamicStyles.sectionContainer}>
            <View style={dynamicStyles.statsContainer}>
              <View style={dynamicStyles.statCard}>
                <Text style={dynamicStyles.statValue}>
                  {safeRestaurants.length}
                </Text>
                <Text style={dynamicStyles.statLabel}>
                  Restaurant{safeRestaurants.length > 1 ? 's' : ''}
                </Text>
              </View>
              
              <View style={dynamicStyles.statCard}>
                <Text style={dynamicStyles.statValue}>
                  {displayOrders.length}
                </Text>
                <Text style={dynamicStyles.statLabel}>
                  Commande{displayOrders.length > 1 ? 's' : ''}
                </Text>
              </View>
              
              <View style={dynamicStyles.statCard}>
                <Text style={dynamicStyles.statValue}>
                  {isRestaurateur
                    ? (user?.stats as any)?.active_restaurants || 0
                    : safeRestaurants.filter((r) => r?.isActive).length}
                </Text>
                <Text style={dynamicStyles.statLabel}>
                  Actif{isRestaurateur || safeRestaurants.filter((r) => r?.isActive).length > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Alerte validation si nécessaire */}
          {isRestaurateur && !user?.roles?.has_validated_profile && (
            <View style={dynamicStyles.warningCard}>
              <Text style={dynamicStyles.warningTitle}>
                ⚠️ Validation de compte requise
              </Text>
              <Text style={dynamicStyles.warningText}>
                Validez votre compte Stripe pour activer vos restaurants et recevoir des paiements.
              </Text>
            </View>
          )}

          {/* Section Restaurants */}
          <View style={dynamicStyles.sectionContainer}>
            <Text style={dynamicStyles.sectionTitle}>
              {isRestaurateur ? 'Vos restaurants' : 'Restaurants recommandés'}
            </Text>

            <View style={dynamicStyles.restaurantsGrid}>
              {safeRestaurants.length > 0 ? (
                safeRestaurants.slice(0, responsive.isDesktop ? 6 : responsive.isTablet ? 4 : 3).map((restaurant, index) => (
                  <RestaurantCard
                    key={restaurant.id ?? `restaurant-${index}`}
                    restaurant={restaurant}
                    onPress={() => router.push(`/restaurant/${restaurant.id}`)}
                  />
                ))
              ) : (
                <View style={dynamicStyles.emptyStateCard}>
                  <Text style={dynamicStyles.emptyStateText}>
                    {restaurantsLoading
                      ? 'Chargement des restaurants...'
                      : restaurantsError
                      ? `Erreur: ${restaurantsError}`
                      : isRestaurateur
                      ? user?.roles?.has_validated_profile
                        ? 'Aucun restaurant créé. Créez votre premier restaurant !'
                        : 'Validez votre compte Stripe pour créer vos restaurants.'
                      : 'Aucun restaurant disponible pour le moment.'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Section Commandes */}
          <View style={dynamicStyles.sectionContainer}>
            <Text style={dynamicStyles.sectionTitle}>
              {isRestaurateur ? 'Commandes reçues' : 'Vos commandes'}
            </Text>

            <View style={dynamicStyles.ordersCard}>
              {ordersLoading && displayOrders.length === 0 ? (
                <Loading text="Chargement des commandes..." />
              ) : displayOrders.length > 0 ? (
                displayOrders.slice(0, responsive.isDesktop ? 8 : responsive.isTablet ? 6 : 5).map((order, index) => (
                  <TouchableOpacity
                    key={order.id ?? `order-${index}`}
                    onPress={() => router.push(`/order/${order.id}`)}
                    style={[
                      dynamicStyles.orderItem,
                      { 
                        borderBottomWidth: index < Math.min(displayOrders.length, responsive.isDesktop ? 8 : responsive.isTablet ? 6 : 5) - 1 ? 1 : 0 
                      }
                    ]}
                  >
                    <View style={dynamicStyles.orderItemContent}>
                      <Text style={dynamicStyles.orderRestaurant}>
                        {getRestaurantName(order)}
                      </Text>
                      <Text style={dynamicStyles.orderDetails}>
                        {getOrderNumber(order)} • {getOrderDate(order)}
                      </Text>
                    </View>
                    <View style={dynamicStyles.orderSummary}>
                      <Text style={dynamicStyles.orderAmount}>
                        {getOrderTotal(order)} €
                      </Text>
                      <Text style={[
                        dynamicStyles.orderStatus,
                        { 
                          color: isOrderCompleted(order.status) ? COLORS.success : COLORS.warning
                        }
                      ]}>
                        {order.status ?? 'Statut inconnu'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={dynamicStyles.emptyStateText}>
                  {ordersLoading
                    ? 'Chargement des commandes...'
                    : ordersError
                    ? `Erreur: ${ordersError}`
                    : isRestaurateur
                    ? 'Aucune commande reçue'
                    : 'Aucune commande récente'}
                </Text>
              )}
            </View>
          </View>

          {/* Actions rapides pour les restaurateurs */}
          {isRestaurateur && user?.roles?.has_validated_profile && (
            <View style={dynamicStyles.sectionContainer}>
              <Text style={dynamicStyles.sectionTitle}>
                Actions rapides
              </Text>
              
              <View style={dynamicStyles.quickActionsGrid}>
                <TouchableOpacity 
                  style={dynamicStyles.quickActionCard}
                  onPress={() => router.push('/restaurant/create')}
                  activeOpacity={0.7}
                >
                  <Text style={dynamicStyles.quickActionIcon}>🍽️</Text>
                  <Text style={dynamicStyles.quickActionText}>
                    Créer un restaurant
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={dynamicStyles.quickActionCard}
                  onPress={() => router.navigate('/(restaurant)/qrcodes')}
                  activeOpacity={0.7}
                >
                  <Text style={dynamicStyles.quickActionIcon}>📱</Text>
                  <Text style={dynamicStyles.quickActionText}>
                    QR Codes Tables
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}