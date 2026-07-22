import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Image,
  useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useOrder } from '@/contexts/OrderContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import { ValidationPending } from '@/components/restaurant/ValidationPending';

import { OrderList, OrderDetail } from '@/types/order';
import { RecentOrder } from '@/types/user';
import {
  useAppTheme,
  makeShadows,
  type AppColors,
} from '@/utils/designSystem';

// ════════════════════════════════════════════════════════════════════════════
// Responsive helpers (sizes statiques)
// ════════════════════════════════════════════════════════════════════════════

const useResponsiveSize = () => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;

  return useMemo(() => ({ isMobile, isTablet, isDesktop }), [isMobile, isTablet, isDesktop]);
};

const getSpacing = (
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl',
  r: { isMobile: boolean; isTablet: boolean },
) => {
  const { isMobile, isTablet } = r;
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

const getFontSize = (
  size: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl',
  r: { isMobile: boolean; isTablet: boolean },
) => {
  const { isMobile, isTablet } = r;
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

// ════════════════════════════════════════════════════════════════════════════
// Type guards
// ════════════════════════════════════════════════════════════════════════════

function isRecentOrder(order: any): order is RecentOrder {
  return 'restaurant_name' in order && !('restaurant' in order);
}
function isOrderList(order: any): order is OrderList {
  return 'order_number' in order && 'restaurant' in order;
}
function isOrderDetail(order: any): order is OrderDetail {
  return 'items' in order && 'restaurant' in order;
}

// ════════════════════════════════════════════════════════════════════════════
// Order helpers — désormais avec t pour traduction des libellés
// ════════════════════════════════════════════════════════════════════════════

function getRestaurantName(
  order: OrderList | OrderDetail | RecentOrder,
  fallback: string,
): string {
  if (isRecentOrder(order)) return order.restaurant_name || fallback;
  if (isOrderList(order) || isOrderDetail(order))
    return order.restaurant_name || fallback;
  return fallback;
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

function getOrderDate(
  order: OrderList | OrderDetail | RecentOrder,
  lang: string,
  fallback: string,
): string {
  if (!order?.created_at) return fallback;
  try {
    return new Date(order.created_at).toLocaleDateString(lang, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fallback;
  }
}

function getOrderNumber(order: OrderList | OrderDetail | RecentOrder): string {
  if (isOrderList(order) || isOrderDetail(order)) {
    return order.order_number || `#${order.id}`;
  }
  if ('id' in order) return `#${order.id}`;
  return 'N/A';
}

function getStatusColor(status: string | undefined, colors: AppColors): string {
  switch (status?.toLowerCase()) {
    case 'pending':
    case 'en_attente':
      return colors.warning;
    case 'confirmed':
    case 'confirmé':
      return colors.primary;
    case 'preparing':
    case 'preparation':
      return colors.secondary;
    case 'ready':
    case 'pret':
    case 'served':
    case 'delivered':
    case 'completed':
    case 'servi':
    case 'livré':
    case 'terminé':
      return colors.success;
    case 'cancelled':
    case 'annulé':
      return colors.error;
    default:
      return colors.text.light;
  }
}

const STATUS_TO_KEY: Record<string, string> = {
  pending: 'pending',
  en_attente: 'pending',
  confirmed: 'confirmed',
  confirmé: 'confirmed',
  preparing: 'preparing',
  preparation: 'preparing',
  ready: 'ready',
  pret: 'ready',
  served: 'served',
  servi: 'served',
  delivered: 'delivered',
  livré: 'delivered',
  completed: 'completed',
  terminé: 'completed',
  cancelled: 'cancelled',
  annulé: 'cancelled',
};

// ════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const responsive = useResponsiveSize();

  const { user, isRestaurateur, refreshUser } = useAuth();
  const {
    restaurants,
    loadRestaurants,
    isLoading: restaurantsLoading,
    error: restaurantsError,
    validationStatus,
    clearValidationStatus,
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

  const styles = useMemo(
    () => makeStyles(colors, isDark, responsive),
    [colors, isDark, responsive],
  );

  // Chargement initial
  useEffect(() => {
    const fetchData = async () => {
      try {
        const promises = [loadRestaurants(), refreshUser()];
        if (fetchOrders && typeof fetchOrders === 'function') {
          promises.push(fetchOrders({ page: 1, limit: 5, filters: {} }));
        }
        await Promise.all(promises);
      } catch (error) {
        console.error('Dashboard: Initial load error:', error);
      }
    };
    fetchData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isRestaurateur) return;
      const stillNeedsValidation =
        validationStatus?.needsValidation === true ||
        user?.roles?.has_validated_profile === false;

      if (stillNeedsValidation) {
        refreshUser().catch(() => {});
        loadRestaurants().catch(() => {});
      }
    }, [
      isRestaurateur,
      validationStatus?.needsValidation,
      user?.roles?.has_validated_profile,
    ]),
  );

  useEffect(() => {
    if (
      user?.roles?.has_validated_profile === true &&
      validationStatus?.needsValidation === true &&
      typeof clearValidationStatus === 'function'
    ) {
      clearValidationStatus();
    }
  }, [user?.roles?.has_validated_profile, validationStatus?.needsValidation]);

  if (
    isRestaurateur &&
    validationStatus?.needsValidation &&
    !user?.roles?.has_validated_profile
  ) {
    return <ValidationPending validationStatus={validationStatus} />;
  }

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const promises = [loadRestaurants(), refreshUser()];
      if (fetchOrders && typeof fetchOrders === 'function') {
        promises.push(fetchOrders({ page: 1, limit: 5, filters: {} }));
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
    if (hour < 12) return t('restaurantHome.greeting.morning');
    if (hour < 18) return t('restaurantHome.greeting.afternoon');
    return t('restaurantHome.greeting.evening');
  };

  const isInitialLoading = restaurantsLoading || ordersLoading;
  const hasData = safeRestaurants.length > 0 || safeOrders.length > 0;

  if (isInitialLoading && !hasData) {
    return (
      <View style={styles.container}>
        <Header title="EatQuickeR" showLanguageSwitcher showThemeSwitcher />
        <Loading fullScreen text={t('restaurantHome.loadingDashboard')} />
      </View>
    );
  }

  const inactiveStripeCount = safeRestaurants.filter((r: any) => !r.isStripeActive).length;
  const allInactiveStripe = inactiveStripeCount === safeRestaurants.length;

  const restaurantFallback = t('restaurantHome.restaurantFallback');

  return (
    <View style={styles.container}>
      {/* Icônes réparties 1 (gauche) / 2 (droite). Elles étaient toutes à
          droite : le Header réservait alors une marge trop large et le titre
          « EatQuickeR » — un seul mot, donc non sécable — se retrouvait à
          l'étroit. Déconnexion retirée (accessible depuis l'écran Profil). */}
      <Header
        title="EatQuickeR"
        leftIcon="notifications-outline"
        onLeftPress={() => {}}
        showLanguageSwitcher
        showThemeSwitcher
      />

      <ScrollView
        style={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentContainer}>
          {/* Header welcome card or */}
          <View style={styles.headerSection}>
            <View style={styles.welcomeCard}>
              <Text style={styles.greeting}>
                {getGreeting()},{' '}
                {user?.first_name || t('restaurantProfile.fallbackUserName')} !
              </Text>
              <Text style={styles.subtitle}>
                {isRestaurateur
                  ? t('restaurantHome.subtitle.restaurateur')
                  : t('restaurantHome.subtitle.client')}
              </Text>
            </View>
          </View>

          {/* Alerte Stripe (validation requise) */}
          {isRestaurateur && !user?.roles?.has_validated_profile && (
            <TouchableOpacity
              style={styles.alertCard}
              onPress={() => router.push('/(auth)/stripe')}
              activeOpacity={0.7}
            >
              <View style={styles.alertIconContainer}>
                <Ionicons name="warning" size={24} color={colors.warning} />
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>
                  {t('restaurantHome.stripeAlert.validationRequired.title')}
                </Text>
                <Text style={styles.alertText}>
                  {t('restaurantHome.stripeAlert.validationRequired.message')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.warning} />
            </TouchableOpacity>
          )}

          {/* Rappel Stripe Connect — restaurants existants mais Stripe inactif */}
          {isRestaurateur &&
            user?.roles?.has_validated_profile &&
            safeRestaurants.length > 0 &&
            safeRestaurants.some((r: any) => !r.isStripeActive) && (
              <TouchableOpacity
                style={[
                  styles.alertCard,
                  { borderLeftWidth: 4, borderLeftColor: colors.warning },
                ]}
                onPress={() => router.push('/stripe/onboarding' as any)}
                activeOpacity={0.7}
              >
                <View style={styles.alertIconContainer}>
                  <Ionicons name="card-outline" size={24} color={colors.warning} />
                </View>
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>
                    {t('restaurantHome.stripeAlert.finalizeConnect.title')}
                  </Text>
                  <Text style={styles.alertText}>
                    {allInactiveStripe
                      ? t('restaurantHome.stripeAlert.finalizeConnect.allInactive')
                      : t('restaurantHome.stripeAlert.finalizeConnect.partial', {
                          count: inactiveStripeCount,
                        })}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            )}

          {/* Section d'aide pour les nouveaux utilisateurs */}
          {isRestaurateur &&
            safeRestaurants.length === 0 &&
            user?.roles?.has_validated_profile && (
              <View style={styles.sectionContainer}>
                <View style={styles.helpCard}>
                  <View style={styles.helpIcon}>
                    <Image
                      source={require('@/assets/images/logo.png')}
                      style={{ width: 28, height: 28 }}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.helpTitle}>
                    {t('restaurantHome.help.title')}
                  </Text>
                  <Text style={styles.helpText}>
                    {t('restaurantHome.help.description')}
                  </Text>
                  <View style={styles.helpActions}>
                    <Button
                      title={t('restaurantHome.help.createFirstRestaurant')}
                      onPress={() => router.push('/restaurant/add')}
                      variant="primary"
                      leftIcon={
                        <Ionicons
                          name="add-circle-outline"
                          size={20}
                          color={colors.text.inverse}
                        />
                      }
                      fullWidth={responsive.isMobile}
                    />
                    <Button
                      title={t('restaurantMenus.help.userGuide')}
                      onPress={() => router.push('/help/help' as any)}
                      variant="outline"
                      fullWidth={responsive.isMobile}
                    />
                  </View>
                </View>
              </View>
            )}

          {/* Statistiques rapides */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t('restaurantHome.sections.overview')}
              </Text>
            </View>

            <View style={styles.statsContainer}>
              <View
                style={[
                  styles.statCard,
                  safeRestaurants.length > 0 && styles.statCardPremium,
                ]}
              >
                <View style={styles.statIcon}>
                  <Ionicons name="restaurant" size={24} color={colors.primary} />
                </View>
                <Text style={styles.statValue}>{safeRestaurants.length}</Text>
                <Text style={styles.statLabel}>
                  {t('restaurantHome.stats.restaurantCount', {
                    count: safeRestaurants.length,
                  })}
                </Text>
              </View>

              <View
                style={[
                  styles.statCard,
                  displayOrders.length > 0 && styles.statCardPremium,
                ]}
              >
                <View style={styles.statIcon}>
                  <Ionicons name="receipt" size={24} color={colors.primary} />
                </View>
                <Text style={styles.statValue}>{displayOrders.length}</Text>
                <Text style={styles.statLabel}>
                  {t('restaurantHome.stats.orderCount', {
                    count: displayOrders.length,
                  })}
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statIcon}>
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                </View>
                <Text style={styles.statValue}>
                  {isRestaurateur
                    ? (user?.stats as any)?.active_restaurants || 0
                    : safeRestaurants.filter((r) => r?.isActive).length}
                </Text>
                <Text style={styles.statLabel}>
                  {t('restaurantHome.stats.activeCount', {
                    count: isRestaurateur
                      ? (user?.stats as any)?.active_restaurants || 0
                      : safeRestaurants.filter((r) => r?.isActive).length,
                  })}
                </Text>
              </View>
            </View>
          </View>

          {/* Section Restaurants */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {isRestaurateur
                  ? t('restaurantHome.sections.yourRestaurants')
                  : t('restaurantHome.sections.recommendedRestaurants')}
              </Text>
              {safeRestaurants.length >
                (responsive.isDesktop ? 6 : responsive.isTablet ? 4 : 3) && (
                <TouchableOpacity onPress={() => router.push('/restaurants')}>
                  <Text style={styles.sectionSubtitle}>
                    {t('restaurantHome.viewAll')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.restaurantsGrid}>
              {safeRestaurants.length > 0 ? (
                safeRestaurants
                  .slice(0, responsive.isDesktop ? 6 : responsive.isTablet ? 4 : 3)
                  .map((restaurant, index) => (
                    <View
                      key={restaurant.id ?? `restaurant-${index}`}
                      style={styles.restaurantCardContainer}
                    >
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
                      name={restaurantsLoading ? 'sync' : 'restaurant-outline'}
                      size={32}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={styles.emptyStateTitle}>
                    {restaurantsLoading
                      ? t('restaurantHome.empty.loading')
                      : isRestaurateur
                        ? user?.roles?.has_validated_profile
                          ? t('restaurantHome.empty.createFirstTitle')
                          : t('restaurantHome.empty.validationRequiredTitle')
                        : t('restaurantHome.empty.noRestaurantTitle')}
                  </Text>
                  <Text style={styles.emptyStateText}>
                    {restaurantsLoading
                      ? t('restaurantHome.empty.loadingDescription')
                      : restaurantsError
                        ? t('restaurantHome.empty.errorPrefix', {
                            error: restaurantsError,
                          })
                        : isRestaurateur
                          ? user?.roles?.has_validated_profile
                            ? t('restaurantHome.empty.startNowDescription')
                            : t('restaurantHome.empty.validateStripeDescription')
                          : t('restaurantHome.empty.noRestaurantDescription')}
                  </Text>
                  {isRestaurateur && user?.roles?.has_validated_profile && (
                    <Button
                      title={t('restaurantHome.actions.createRestaurant.title')}
                      onPress={() => router.push('/restaurant/add')}
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
                {isRestaurateur
                  ? t('restaurantHome.sections.receivedOrders')
                  : t('restaurantHome.sections.yourOrders')}
              </Text>
              {displayOrders.length >
                (responsive.isDesktop ? 8 : responsive.isTablet ? 6 : 5) && (
                <TouchableOpacity onPress={() => router.push('/orders')}>
                  <Text style={styles.sectionSubtitle}>
                    {t('restaurantHome.viewAll')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.ordersCard}>
              {ordersLoading && displayOrders.length === 0 ? (
                <View style={{ padding: getSpacing('xl', responsive) }}>
                  <Loading text={t('restaurantHome.loadingOrders')} />
                </View>
              ) : displayOrders.length > 0 ? (
                displayOrders
                  .slice(0, responsive.isDesktop ? 8 : responsive.isTablet ? 6 : 5)
                  .map((order, index) => {
                    const statusKey = STATUS_TO_KEY[order.status?.toLowerCase() ?? ''] || 'pending';
                    return (
                      <TouchableOpacity
                        key={order.id ?? `order-${index}`}
                        onPress={() => router.push(`/order/${order.id}`)}
                        style={[
                          styles.orderItem,
                          {
                            borderBottomWidth:
                              index <
                              Math.min(
                                displayOrders.length,
                                responsive.isDesktop ? 8 : responsive.isTablet ? 6 : 5,
                              ) -
                                1
                                ? 1
                                : 0,
                          },
                        ]}
                      >
                        <View style={styles.orderItemContent}>
                          <Text style={styles.orderRestaurant}>
                            {getRestaurantName(order, restaurantFallback)}
                          </Text>
                          <View style={styles.orderItemMeta}>
                            <Text style={styles.orderNumber}>
                              {getOrderNumber(order)}
                            </Text>
                            <Text style={styles.orderDate}>
                              {getOrderDate(
                                order,
                                i18n.language,
                                t('restaurantHome.unknownDate'),
                              )}
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
                                {
                                  backgroundColor: getStatusColor(order.status, colors),
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.orderStatus,
                                { color: getStatusColor(order.status, colors) },
                              ]}
                            >
                              {t(`restaurantHome.orderStatus.${statusKey}`)}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
              ) : (
                <View style={styles.emptyStateCard}>
                  <View style={styles.emptyStateIcon}>
                    <Ionicons
                      name="receipt-outline"
                      size={32}
                      color={colors.text.light}
                    />
                  </View>
                  <Text style={styles.emptyStateTitle}>
                    {t('restaurantHome.empty.noOrderTitle')}
                  </Text>
                  <Text style={styles.emptyStateText}>
                    {ordersError
                      ? t('restaurantHome.empty.errorPrefix', { error: ordersError })
                      : isRestaurateur
                        ? t('restaurantHome.empty.noOrderRestaurateur')
                        : t('restaurantHome.empty.noOrderClient')}
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
                  {t('restaurantHome.sections.quickActions')}
                </Text>
              </View>

              <View style={styles.quickActionsGrid}>
                {/* Menu du Jour — premium en premier */}
                <TouchableOpacity
                  style={[styles.actionCard, styles.actionCardPremium]}
                  onPress={() => router.push('/(restaurant)/daily-menu')}
                >
                  <View
                    style={[
                      styles.actionIcon,
                      {
                        backgroundColor: isDark
                          ? 'rgba(212, 175, 55, 0.18)'
                          : colors.variants.secondary[100],
                      },
                    ]}
                  >
                    <Ionicons name="today" size={20} color={colors.secondary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.dailyMenu.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.dailyMenu.description')}
                  </Text>
                </TouchableOpacity>

                {/* Créer un restaurant */}
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    safeRestaurants.length === 0 && styles.actionCardPremium,
                  ]}
                  onPress={() => router.push('/restaurant/add')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="add-circle" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.createRestaurant.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.createRestaurant.description')}
                  </Text>
                </TouchableOpacity>

                {/* QR Codes */}
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/qrcodes')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="qr-code" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.qrCodes.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.qrCodes.description')}
                  </Text>
                </TouchableOpacity>

                {/* Plan de salle & réservations */}
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/floor-plan' as any)}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="grid" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.floorPlan.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.floorPlan.description')}
                  </Text>
                </TouchableOpacity>

                {/* Réservations */}
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/reservations' as any)}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="calendar" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.reservations.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.reservations.description')}
                  </Text>
                </TouchableOpacity>

                {/* Gérer les menus */}
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/menu')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="menu" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.manageMenus.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.manageMenus.description')}
                  </Text>
                </TouchableOpacity>

                {/* Voir les commandes */}
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/orders')}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="receipt" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.viewOrders.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.viewOrders.description')}
                  </Text>
                </TouchableOpacity>

                {/* Statistiques */}
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => router.navigate('/(restaurant)/statistics' as any)}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="stats-chart" size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.actionTitle}>
                    {t('restaurantHome.actions.statistics.title')}
                  </Text>
                  <Text style={styles.actionDescription}>
                    {t('restaurantHome.actions.statistics.description')}
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

// ════════════════════════════════════════════════════════════════════════════
// STYLES (fabrique theme-aware)
// ════════════════════════════════════════════════════════════════════════════
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  r: { isMobile: boolean; isTablet: boolean; isDesktop: boolean },
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContainer: { flex: 1 },
    contentContainer: {
      paddingHorizontal: getSpacing('lg', r),
      paddingVertical: getSpacing('xl', r),
      maxWidth: r.isDesktop ? 1200 : undefined,
      alignSelf: 'center',
      width: '100%',
    },

    // Welcome card or
    headerSection: { marginBottom: getSpacing('2xl', r) },
    welcomeCard: {
      backgroundColor: colors.goldenSurface,
      borderRadius: 16,
      padding: getSpacing('xl', r),
      borderWidth: 1,
      borderColor: colors.border.golden,
      shadowColor: colors.secondary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.35 : 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    greeting: {
      fontSize: getFontSize('4xl', r),
      fontWeight: '800',
      // Salutation en or chaud dans les 2 modes — c'est la signature visuelle
      // du dashboard
      color: isDark ? colors.text.golden : colors.text.primary,
      marginBottom: getSpacing('sm', r),
      lineHeight: getFontSize('4xl', r) * 1.2,
    },
    subtitle: {
      fontSize: getFontSize('lg', r),
      color: colors.text.golden,
      lineHeight: getFontSize('lg', r) * 1.4,
      fontWeight: '500',
    },

    // Stats
    statsSection: { marginBottom: getSpacing('3xl', r) },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: getSpacing('xl', r),
    },
    sectionTitle: {
      fontSize: getFontSize('2xl', r),
      fontWeight: '700',
      color: isDark ? colors.text.golden : colors.text.primary,
      lineHeight: getFontSize('2xl', r) * 1.2,
    },
    sectionSubtitle: {
      fontSize: getFontSize('base', r),
      color: colors.text.secondary,
      fontWeight: '500',
      lineHeight: getFontSize('base', r) * 1.4,
    },

    statsContainer: {
      flexDirection: r.isMobile ? 'column' : 'row',
      gap: getSpacing('lg', r),
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: getSpacing('xl', r),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border.light,
      minHeight: 120,
      ...shadows.sm,
    },
    statCardPremium: {
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.10)'
        : colors.variants.secondary[50],
      borderColor: colors.border.golden,
      borderWidth: 2,
      shadowColor: colors.secondary,
      shadowOpacity: isDark ? 0.4 : 0.15,
    },
    statIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark
        ? 'rgba(99, 102, 241, 0.18)'
        : colors.variants.primary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('md', r),
    },
    statValue: {
      fontSize: getFontSize('4xl', r),
      fontWeight: '800',
      color: isDark ? colors.text.golden : colors.primary,
      marginBottom: getSpacing('xs', r),
      lineHeight: getFontSize('4xl', r) * 1.1,
    },
    statLabel: {
      fontSize: getFontSize('base', r),
      color: colors.text.secondary,
      textAlign: 'center',
      fontWeight: '600',
      lineHeight: getFontSize('base', r) * 1.3,
    },

    sectionContainer: { marginBottom: getSpacing('3xl', r) },

    // Alertes Stripe
    alertCard: {
      flexDirection: 'row',
      backgroundColor: isDark
        ? 'rgba(245, 158, 11, 0.12)'
        : colors.variants.secondary[50],
      borderRadius: 16,
      padding: getSpacing('lg', r),
      borderLeftWidth: 4,
      borderLeftColor: colors.warning,
      marginBottom: getSpacing('xl', r),
      alignItems: 'center',
      ...shadows.sm,
    },
    alertIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.warning + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getSpacing('md', r),
    },
    alertContent: { flex: 1 },
    alertTitle: {
      fontSize: getFontSize('lg', r),
      fontWeight: '600',
      color: isDark ? colors.text.golden : colors.variants.secondary[800],
      marginBottom: getSpacing('xs', r),
      lineHeight: getFontSize('lg', r) * 1.3,
    },
    alertText: {
      fontSize: getFontSize('base', r),
      color: isDark ? colors.text.secondary : colors.variants.secondary[700],
      lineHeight: getFontSize('base', r) * 1.4,
    },

    // Restaurants grid
    restaurantsGrid: { gap: getSpacing('lg', r) },
    restaurantCardContainer: {
      flex: r.isMobile ? 1 : 1 / (r.isDesktop ? 3 : 2),
      minWidth: r.isMobile ? '100%' : 280,
      maxWidth: r.isMobile ? '100%' : 400,
      alignSelf: 'center',
    },

    // Empty state
    emptyStateCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: getSpacing('2xl', r),
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border.light,
      borderStyle: 'dashed',
    },
    emptyStateIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark
        ? 'rgba(99, 102, 241, 0.18)'
        : colors.variants.primary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('lg', r),
    },
    emptyStateTitle: {
      fontSize: getFontSize('xl', r),
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: getSpacing('sm', r),
      textAlign: 'center',
      lineHeight: getFontSize('xl', r) * 1.3,
    },
    emptyStateText: {
      fontSize: getFontSize('base', r),
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: getFontSize('base', r) * 1.5,
      marginBottom: getSpacing('lg', r),
    },

    // Orders
    ordersCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      ...shadows.sm,
    },
    orderItem: {
      flexDirection: 'row',
      padding: getSpacing('lg', r),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
      alignItems: 'flex-start',
      minHeight: 80,
    },
    orderItemContent: { flex: 1, marginRight: getSpacing('md', r) },
    orderRestaurant: {
      fontSize: getFontSize('lg', r),
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: getSpacing('xs', r),
      lineHeight: getFontSize('lg', r) * 1.3,
    },
    orderItemMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: getSpacing('xs', r),
    },
    orderNumber: {
      fontSize: getFontSize('sm', r),
      color: colors.text.secondary,
      fontWeight: '500',
      lineHeight: getFontSize('sm', r) * 1.3,
    },
    orderDate: {
      fontSize: getFontSize('sm', r),
      color: colors.text.light,
      marginLeft: getSpacing('sm', r),
      lineHeight: getFontSize('sm', r) * 1.3,
    },
    orderSummary: { alignItems: 'flex-end' },
    orderAmount: {
      fontSize: getFontSize('xl', r),
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: getSpacing('xs', r),
      lineHeight: getFontSize('xl', r) * 1.2,
    },
    orderStatusContainer: { flexDirection: 'row', alignItems: 'center' },
    orderStatusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: getSpacing('xs', r),
    },
    orderStatus: {
      fontSize: getFontSize('sm', r),
      fontWeight: '600',
      lineHeight: getFontSize('sm', r) * 1.2,
    },

    // Quick actions
    quickActionsSection: { marginBottom: getSpacing('3xl', r) },
    quickActionsGrid: {
      flexDirection: r.isMobile ? 'column' : 'row',
      gap: getSpacing('lg', r),
      flexWrap: 'wrap',
    },
    actionCard: {
      flex: r.isMobile ? undefined : 1,
      minWidth: r.isMobile ? '100%' : 200,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: getSpacing('lg', r),
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border.light,
      paddingVertical: getSpacing('xl', r),
      ...shadows.sm,
    },
    actionCardPremium: {
      backgroundColor: colors.goldenSurface,
      borderColor: colors.border.golden,
      shadowColor: colors.secondary,
      shadowOpacity: isDark ? 0.4 : 0.1,
    },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark
        ? 'rgba(99, 102, 241, 0.18)'
        : colors.variants.primary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('sm', r),
    },
    actionTitle: {
      fontSize: getFontSize('base', r),
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: getSpacing('xs', r),
      lineHeight: getFontSize('base', r) * 1.3,
    },
    actionDescription: {
      fontSize: getFontSize('sm', r),
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: getFontSize('sm', r) * 1.4,
    },

    // Help card
    helpCard: {
      backgroundColor: isDark
        ? 'rgba(99, 102, 241, 0.12)'
        : colors.variants.primary[100],
      borderRadius: 16,
      padding: getSpacing('xl', r),
      borderWidth: 1,
      borderColor: colors.primary + (isDark ? '50' : '30'),
    },
    helpIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getSpacing('lg', r),
    },
    helpTitle: {
      fontSize: getFontSize('xl', r),
      fontWeight: '700',
      color: isDark ? colors.text.golden : colors.text.primary,
      marginBottom: getSpacing('sm', r),
      lineHeight: getFontSize('xl', r) * 1.3,
    },
    helpText: {
      fontSize: getFontSize('base', r),
      color: colors.text.secondary,
      lineHeight: getFontSize('base', r) * 1.5,
      marginBottom: getSpacing('lg', r),
    },
    helpActions: {
      flexDirection: r.isMobile ? 'column' : 'row',
      gap: getSpacing('md', r),
    },
  });
};