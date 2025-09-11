import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useOrder } from '@/contexts/OrderContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import { ValidationPending } from '@/components/restaurant/ValidationPending';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OrderList, OrderDetail } from '@/types/order';
import { RecentOrder } from '@/types/user';

// Configuration responsive simplifiée
const { width: screenWidth } = Dimensions.get('window');
const isMobile = screenWidth < 768;
const isTablet = screenWidth >= 768 && screenWidth < 1024;
const isDesktop = screenWidth >= 1024;

// Couleurs fixes
const COLORS = {
  primary: '#1E2A78',
  secondary: '#D4AF37',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  goldenSurface: '#FFFCF0',
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF',
    inverse: '#FFFFFF',
    golden: '#B8941F',
  },
  border: {
    light: '#F3F4F6',
    default: '#E5E7EB',
    golden: '#E6D08A',
  },
  variants: {
    primary: {
      100: '#E0E7FF',
    },
    secondary: {
      50: '#FFFEF7',
      100: '#FFFBEB',
      500: '#D4AF37',
      700: '#A16207',
      800: '#854D0E',
    },
  },
};

// Espacements fixes
const getSpacing = (size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl') => {
  const spacings = {
    xs: isMobile ? 4 : isTablet ? 6 : 8,
    sm: isMobile ? 8 : isTablet ? 10 : 12,
    md: isMobile ? 12 : isTablet ? 16 : 20,
    lg: isMobile ? 16 : isTablet ? 20 : 24,
    xl: isMobile ? 20 : isTablet ? 24 : 32,
    '2xl': isMobile ? 24 : isTablet ? 32 : 40,
    '3xl': isMobile ? 32 : isTablet ? 40 : 48,
  };
  return spacings[size];
};

// Tailles de police fixes et lisibles
const getFontSize = (size: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl') => {
  const sizes = {
    sm: isMobile ? 14 : isTablet ? 15 : 16,
    base: isMobile ? 16 : isTablet ? 17 : 18,
    lg: isMobile ? 18 : isTablet ? 20 : 22,
    xl: isMobile ? 20 : isTablet ? 22 : 24,
    '2xl': isMobile ? 24 : isTablet ? 28 : 32,
    '3xl': isMobile ? 28 : isTablet ? 32 : 36,
    '4xl': isMobile ? 32 : isTablet ? 36 : 42,
  };
  return sizes[size];
};

// Type guards (inchangés)
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
    return new Date(order.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
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

function getStatusColor(status?: string): string {
  switch (status?.toLowerCase()) {
    case 'pending':
    case 'en_attente':
      return COLORS.warning;
    case 'confirmed':
    case 'confirmé':
      return COLORS.primary;
    case 'preparing':
    case 'preparation':
      return COLORS.secondary;
    case 'ready':
    case 'pret':
      return COLORS.success;
    case 'served':
    case 'delivered':
    case 'completed':
    case 'servi':
    case 'livré':
    case 'terminé':
      return COLORS.success;
    case 'cancelled':
    case 'annulé':
      return COLORS.error;
    default:
      return COLORS.text.light;
  }
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

  const [refreshing, setRefreshing] = useState(false);
  const safeRestaurants = Array.isArray(restaurants) ? restaurants : [];
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeUserOrders = Array.isArray(user?.recent_orders) ? user.recent_orders : [];

  const displayOrders = safeUserOrders.length > 0 ? safeUserOrders : safeOrders;

  // Styles avec des valeurs fixes et lisibles
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    
    scrollContainer: {
      flex: 1,
    },
    
    contentContainer: {
      paddingHorizontal: getSpacing('lg'),
      paddingVertical: getSpacing('xl'),
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center',
      width: '100%',
    },
    
    // Header section avec design premium
    headerSection: {
      marginBottom: getSpacing('2xl'),
    },
    
    welcomeCard: {
      backgroundColor: COLORS.goldenSurface,
      borderRadius: 16,
      padding: getSpacing('xl'),
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      shadowColor: COLORS.variants.secondary[500],
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    
    greeting: {
      fontSize: getFontSize('4xl'),
      fontWeight: '800',
      color: COLORS.text.primary,
      marginBottom: getSpacing('sm'),
      lineHeight: getFontSize('4xl') * 1.2,
    },
    
    subtitle: {
      fontSize: getFontSize('lg'),
      color: COLORS.text.golden,
      lineHeight: getFontSize('lg') * 1.4,
      fontWeight: '500',
    },
    
    // Stats section
    statsSection: {
      marginBottom: getSpacing('3xl'),
    },
    
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: getSpacing('xl'),
    },
    
    sectionTitle: {
      fontSize: getFontSize('2xl'),
      fontWeight: '700',
      color: COLORS.text.primary,
      lineHeight: getFontSize('2xl') * 1.2,
    },
    
    sectionSubtitle: {
      fontSize: getFontSize('base'),
      color: COLORS.text.secondary,
      fontWeight: '500',
      lineHeight: getFontSize('base') * 1.4,
    },
    
    statsContainer: {
      flexDirection: isMobile ? 'column' : 'row',
      gap: getSpacing('lg'),
    },
    
    statCard: {
      flex: 1,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: getSpacing('xl'),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: COLORS.border.light,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
      minHeight: 120,
    },
    
    statCardPremium: {
      backgroundColor: COLORS.variants.secondary[50],
      borderColor: COLORS.border.golden,
      borderWidth: 2,
      shadowColor: COLORS.variants.secondary[500],
      shadowOpacity: 0.15,
    },
    
    statIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: COLORS.variants.primary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('md'),
    },
    
    statValue: {
      fontSize: getFontSize('4xl'),
      fontWeight: '800',
      color: COLORS.primary,
      marginBottom: getSpacing('xs'),
      lineHeight: getFontSize('4xl') * 1.1,
    },
    
    statLabel: {
      fontSize: getFontSize('base'),
      color: COLORS.text.secondary,
      textAlign: 'center',
      fontWeight: '600',
      lineHeight: getFontSize('base') * 1.3,
    },
    
    // Sections
    sectionContainer: {
      marginBottom: getSpacing('3xl'),
    },
    
    // Alertes
    alertCard: {
      flexDirection: 'row',
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: 16,
      padding: getSpacing('lg'),
      borderLeftWidth: 4,
      borderLeftColor: COLORS.warning,
      marginBottom: getSpacing('xl'),
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    
    alertIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: COLORS.warning + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getSpacing('md'),
    },
    
    alertContent: {
      flex: 1,
    },
    
    alertTitle: {
      fontSize: getFontSize('lg'),
      fontWeight: '600',
      color: COLORS.variants.secondary[800],
      marginBottom: getSpacing('xs'),
      lineHeight: getFontSize('lg') * 1.3,
    },
    
    alertText: {
      fontSize: getFontSize('base'),
      color: COLORS.variants.secondary[700],
      lineHeight: getFontSize('base') * 1.4,
    },
    
    // Restaurants grid
    restaurantsGrid: {
      gap: getSpacing('lg'),
    },
    
    restaurantCardContainer: {
      flex: isMobile ? 1 : 1 / (isDesktop ? 3 : 2),
      minWidth: isMobile ? '100%' : 280,
      maxWidth: isMobile ? '100%' : 400,
      alignSelf: 'center',
    },
    
    emptyStateCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: getSpacing('2xl'),
      alignItems: 'center',
      borderWidth: 2,
      borderColor: COLORS.border.light,
      borderStyle: 'dashed',
    },
    
    emptyStateIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: COLORS.variants.primary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('lg'),
    },
    
    emptyStateTitle: {
      fontSize: getFontSize('xl'),
      fontWeight: '700',
      color: COLORS.text.primary,
      marginBottom: getSpacing('sm'),
      textAlign: 'center',
      lineHeight: getFontSize('xl') * 1.3,
    },
    
    emptyStateText: {
      fontSize: getFontSize('base'),
      color: COLORS.text.secondary,
      textAlign: 'center',
      lineHeight: getFontSize('base') * 1.5,
      marginBottom: getSpacing('lg'),
    },
    
    // Orders section
    ordersCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    
    orderItem: {
      flexDirection: 'row',
      padding: getSpacing('lg'),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
      alignItems: 'flex-start',
      minHeight: 80,
    },
    
    orderItemContent: {
      flex: 1,
      marginRight: getSpacing('md'),
    },
    
    orderRestaurant: {
      fontSize: getFontSize('lg'),
      fontWeight: '600',
      color: COLORS.text.primary,
      marginBottom: getSpacing('xs'),
      lineHeight: getFontSize('lg') * 1.3,
    },
    
    orderItemMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: getSpacing('xs'),
    },
    
    orderNumber: {
      fontSize: getFontSize('sm'),
      color: COLORS.text.secondary,
      fontWeight: '500',
      lineHeight: getFontSize('sm') * 1.3,
    },
    
    orderDate: {
      fontSize: getFontSize('sm'),
      color: COLORS.text.light,
      marginLeft: getSpacing('sm'),
      lineHeight: getFontSize('sm') * 1.3,
    },
    
    orderSummary: {
      alignItems: 'flex-end',
    },
    
    orderAmount: {
      fontSize: getFontSize('xl'),
      fontWeight: '700',
      color: COLORS.text.primary,
      marginBottom: getSpacing('xs'),
      lineHeight: getFontSize('xl') * 1.2,
    },
    
    orderStatusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    
    orderStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: getSpacing('xs'),
    },
    
    orderStatus: {
      fontSize: getFontSize('sm'),
      fontWeight: '600',
      textTransform: 'capitalize',
      lineHeight: getFontSize('sm') * 1.2,
    },
    
    // Actions rapides
    quickActionsSection: {
      marginBottom: getSpacing('3xl'),
    },
    
    quickActionsGrid: {
      flexDirection: isMobile ? 'column' : 'row',
      gap: getSpacing('lg'),
    },
    
    actionCard: {
      flex: 1,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: getSpacing('lg'),
      alignItems: 'center',
      borderWidth: 2,
      borderColor: COLORS.border.light,
      paddingVertical: getSpacing('xl'),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    
    actionCardPremium: {
      backgroundColor: COLORS.goldenSurface,
      borderColor: COLORS.border.golden,
      shadowColor: COLORS.variants.secondary[500],
      shadowOpacity: 0.1,
    },
    
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.variants.primary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('sm'),
    },
    
    actionTitle: {
      fontSize: getFontSize('base'),
      fontWeight: '600',
      color: COLORS.text.primary,
      textAlign: 'center',
      marginBottom: getSpacing('xs'),
      lineHeight: getFontSize('base') * 1.3,
    },
    
    actionDescription: {
      fontSize: getFontSize('sm'),
      color: COLORS.text.secondary,
      textAlign: 'center',
      lineHeight: getFontSize('sm') * 1.4,
    },
    
    // Help section
    helpCard: {
      backgroundColor: COLORS.variants.primary[100],
      borderRadius: 16,
      padding: getSpacing('xl'),
      borderWidth: 1,
      borderColor: COLORS.primary + '30',
    },
    
    helpIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: COLORS.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('lg'),
    },
    
    helpTitle: {
      fontSize: getFontSize('xl'),
      fontWeight: '700',
      color: COLORS.text.primary,
      marginBottom: getSpacing('sm'),
      lineHeight: getFontSize('xl') * 1.3,
    },
    
    helpText: {
      fontSize: getFontSize('base'),
      color: COLORS.text.secondary,
      lineHeight: getFontSize('base') * 1.5,
      marginBottom: getSpacing('lg'),
    },
    
    helpActions: {
      flexDirection: isMobile ? 'column' : 'row',
      gap: getSpacing('md'),
    },
  });

  // Validation check
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
      <View style={styles.container}>
        <Header title="Eat&Go" />
        <Loading fullScreen text="Chargement du tableau de bord..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Eat&Go"
        showLogout
        logoutPosition="left"
        rightIcon="notifications-outline"
        onRightPress={() => {}}
      />

      <ScrollView
        style={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentContainer}>
          {/* Header avec design premium */}
          <View style={styles.headerSection}>
            <View style={styles.welcomeCard}>
              <Text style={styles.greeting}>
                {getGreeting()}, {user?.first_name || 'Utilisateur'} !
              </Text>
              <Text style={styles.subtitle}>
                {isRestaurateur
                  ? 'Gérez vos restaurants et optimisez vos performances'
                  : 'Découvrez les meilleurs restaurants près de chez vous'}
              </Text>
            </View>
          </View>

          {/* Alerte Stripe */}
          {isRestaurateur && !user?.roles?.has_validated_profile && (
            <View style={styles.alertCard}>
              <View style={styles.alertIconContainer}>
                <Ionicons name="warning" size={24} color={COLORS.warning} />
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>
                  Validation de compte requise
                </Text>
                <Text style={styles.alertText}>
                  Validez votre compte Stripe pour activer vos restaurants et recevoir des paiements.
                </Text>
              </View>
            </View>
          )}

          {/* Statistiques */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Aperçu</Text>
            </View>
            
            <View style={styles.statsContainer}>
              <View style={[
                styles.statCard, 
                safeRestaurants.length > 0 && styles.statCardPremium
              ]}>
                <View style={styles.statIcon}>
                  <Ionicons 
                    name="restaurant" 
                    size={24} 
                    color={COLORS.primary} 
                  />
                </View>
                <Text style={styles.statValue}>
                  {safeRestaurants.length}
                </Text>
                <Text style={styles.statLabel}>
                  Restaurant{safeRestaurants.length > 1 ? 's' : ''}
                </Text>
              </View>
              
              <View style={[
                styles.statCard,
                displayOrders.length > 0 && styles.statCardPremium
              ]}>
                <View style={styles.statIcon}>
                  <Ionicons 
                    name="receipt" 
                    size={24} 
                    color={COLORS.primary} 
                  />
                </View>
                <Text style={styles.statValue}>
                  {displayOrders.length}
                </Text>
                <Text style={styles.statLabel}>
                  Commande{displayOrders.length > 1 ? 's' : ''}
                </Text>
              </View>
              
              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Ionicons 
                    name="checkmark-circle" 
                    size={24} 
                    color={COLORS.success} 
                  />
                </View>
                <Text style={styles.statValue}>
                  {isRestaurateur
                    ? (user?.stats as any)?.active_restaurants || 0
                    : safeRestaurants.filter((r) => r?.isActive).length}
                </Text>
                <Text style={styles.statLabel}>
                  Actif{isRestaurateur || safeRestaurants.filter((r) => r?.isActive).length > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Section Restaurants */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {isRestaurateur ? 'Vos restaurants' : 'Restaurants recommandés'}
              </Text>
              {safeRestaurants.length > (isDesktop ? 6 : isTablet ? 4 : 3) && (
                <TouchableOpacity onPress={() => router.push('/restaurants')}>
                  <Text style={styles.sectionSubtitle}>Voir tout</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.restaurantsGrid}>
              {safeRestaurants.length > 0 ? (
                safeRestaurants.slice(0, isDesktop ? 6 : isTablet ? 4 : 3).map((restaurant, index) => (
                  <View key={restaurant.id ?? `restaurant-${index}`} style={styles.restaurantCardContainer}>
                    <RestaurantCard
                      restaurant={restaurant}
                      onPress={() => router.push(`/restaurant/${restaurant.id}`)}
                    />
                  </View>
                ))
              ) : (
                <View style={styles.emptyStateCard}>
                  <View style={styles.emptyStateIcon}>
                    <Ionicons 
                      name={restaurantsLoading ? "sync" : "restaurant-outline"} 
                      size={32} 
                      color={COLORS.primary} 
                    />
                  </View>
                  <Text style={styles.emptyStateTitle}>
                    {restaurantsLoading
                      ? 'Chargement...'
                      : isRestaurateur
                      ? user?.roles?.has_validated_profile
                        ? 'Créez votre premier restaurant'
                        : 'Validation requise'
                      : 'Aucun restaurant'}
                  </Text>
                  <Text style={styles.emptyStateText}>
                    {restaurantsLoading
                      ? 'Chargement des restaurants en cours...'
                      : restaurantsError
                      ? `Erreur: ${restaurantsError}`
                      : isRestaurateur
                      ? user?.roles?.has_validated_profile
                        ? 'Commencez dès maintenant à recevoir des commandes en ligne.'
                        : 'Validez votre compte Stripe pour créer vos restaurants.'
                      : 'Aucun restaurant disponible pour le moment.'}
                  </Text>
                  {isRestaurateur && user?.roles?.has_validated_profile && (
                    <Button
                      title="Créer un restaurant"
                      onPress={() => router.push('/restaurant/create')}
                      variant="primary"
                      size="sm"
                    />
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Section Commandes */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {isRestaurateur ? 'Commandes reçues' : 'Vos commandes'}
              </Text>
              {displayOrders.length > (isDesktop ? 8 : isTablet ? 6 : 5) && (
                <TouchableOpacity onPress={() => router.push('/orders')}>
                  <Text style={styles.sectionSubtitle}>Voir tout</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.ordersCard}>
              {ordersLoading && displayOrders.length === 0 ? (
                <View style={{ padding: getSpacing('xl') }}>
                  <Loading text="Chargement des commandes..." />
                </View>
              ) : displayOrders.length > 0 ? (
                displayOrders.slice(0, isDesktop ? 8 : isTablet ? 6 : 5).map((order, index) => (
                  <TouchableOpacity
                    key={order.id ?? `order-${index}`}
                    onPress={() => router.push(`/order/${order.id}`)}
                    style={[
                      styles.orderItem,
                      { 
                        borderBottomWidth: index < Math.min(displayOrders.length, isDesktop ? 8 : isTablet ? 6 : 5) - 1 ? 1 : 0 
                      }
                    ]}
                  >
                    <View style={styles.orderItemContent}>
                      <Text style={styles.orderRestaurant}>
                        {getRestaurantName(order)}
                      </Text>
                      <View style={styles.orderItemMeta}>
                        <Text style={styles.orderNumber}>
                          {getOrderNumber(order)}
                        </Text>
                        <Text style={styles.orderDate}>
                          {getOrderDate(order)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.orderSummary}>
                      <Text style={styles.orderAmount}>
                        {getOrderTotal(order)} €
                      </Text>
                      <View style={styles.orderStatusContainer}>
                        <View 
                          style={[
                            styles.orderStatusDot,
                            { backgroundColor: getStatusColor(order.status) }
                          ]}
                        />
                        <Text style={[
                          styles.orderStatus,
                          { color: getStatusColor(order.status) }
                        ]}>
                          {order.status ?? 'En attente'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyStateCard}>
                  <View style={styles.emptyStateIcon}>
                    <Ionicons 
                      name="receipt-outline" 
                      size={32} 
                      color={COLORS.text.light} 
                    />
                  </View>
                  <Text style={styles.emptyStateTitle}>
                    Aucune commande
                  </Text>
                  <Text style={styles.emptyStateText}>
                    {ordersError
                      ? `Erreur: ${ordersError}`
                      : isRestaurateur
                      ? 'Aucune commande reçue pour le moment'
                      : 'Vous n\'avez pas encore passé de commande'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Actions rapides pour les restaurateurs */}
          {isRestaurateur && user?.roles?.has_validated_profile && (
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Actions rapides
                </Text>
              </View>
              
              <View style={styles.quickActionsGrid}>
                <TouchableOpacity
                  style={[styles.actionCard, styles.actionCardPremium]}
                  onPress={() => router.push('/restaurant/create')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="add-circle" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.actionTitle}>Créer un restaurant</Text>
                  <Text style={styles.actionDescription}>Nouveau établissement</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/qrcodes')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="qr-code" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.actionTitle}>QR Codes Tables</Text>
                  <Text style={styles.actionDescription}>Générer et gérer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/menu')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="menu" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.actionTitle}>Gérer les menus</Text>
                  <Text style={styles.actionDescription}>Plats et prix</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/orders')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="receipt" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.actionTitle}>Voir les commandes</Text>
                  <Text style={styles.actionDescription}>Gestion et suivi</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Section d'aide pour les nouveaux utilisateurs */}
          {isRestaurateur && safeRestaurants.length === 0 && user?.roles?.has_validated_profile && (
            <View style={styles.sectionContainer}>
              <View style={styles.helpCard}>
                <View style={styles.helpIcon}>
                  <Ionicons title="lightbulb" size={28} color={COLORS.text.inverse} />
                </View>
                <Text style={styles.helpTitle}>
                  Commencer avec Eat&Go
                </Text>
                <Text style={styles.helpText}>
                  Créez votre premier restaurant pour commencer à recevoir des commandes en ligne et développer votre activité.
                </Text>
                <View style={styles.helpActions}>
                  <Button
                    title="Créer mon premier restaurant"
                    onPress={() => router.push('/restaurant/create')}
                    variant="primary"
                    leftIcon={<Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />}
                    fullWidth={isMobile}
                  />
                  <Button
                    title="Guide d'utilisation"
                    onPress={() => router.push('/help')}
                    variant="outline"
                    fullWidth={isMobile}
                  />
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}