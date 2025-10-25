import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useClientOrders } from '@/hooks/client/useClientOrders';
import { OrderList } from '@/types/order';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/common/StatusBadge';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { useOrderRealtime } from '@/hooks/useOrderRealtime';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS 
} from '@/utils/designSystem';

// Hook pour auto-refresh des commandes actives
const useAutoRefresh = (
  hasActiveOrders: boolean, 
  refreshFn: () => void, 
  realtimeEnabled: boolean = false
) => {
  React.useEffect(() => {
    if (!hasActiveOrders || realtimeEnabled) return;
    
    const interval = setInterval(refreshFn, 30000); // 30 secondes
    return () => clearInterval(interval);
  }, [hasActiveOrders, refreshFn, realtimeEnabled]);
};

// Indicateur de connexion temps réel
const RealtimeIndicator = React.memo(({ 
  connectionState, 
  activeOrdersCount,
  lastUpdateTime,
  screenType 
}: { 
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  activeOrdersCount: number;
  lastUpdateTime?: Date;
  screenType: 'mobile' | 'tablet' | 'desktop';
}) => {
  if (activeOrdersCount === 0) return null;

  const getIndicatorProps = () => {
    switch (connectionState) {
      case 'connected':
        return { 
          icon: 'radio-button-on' as const, 
          color: COLORS.success, 
          text: 'Temps réel activé' 
        };
      case 'connecting':
        return { 
          icon: 'radio-button-off' as const, 
          color: COLORS.warning, 
          text: 'Connexion...' 
        };
      case 'error':
        return { 
          icon: 'warning' as const, 
          color: COLORS.error, 
          text: 'Erreur connexion' 
        };
      default:
        return { 
          icon: 'radio-button-off' as const, 
          color: COLORS.text.light, 
          text: 'Hors ligne' 
        };
    }
  };

  const { icon, color, text } = getIndicatorProps();

  const styles = {
    indicator: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    text: {
      fontSize: getResponsiveValue(
        { mobile: 11, tablet: 12, desktop: 13 },
        screenType
      ),
      fontWeight: '500' as const,
      color,
    },
    timeText: {
      fontSize: getResponsiveValue(
        { mobile: 10, tablet: 11, desktop: 12 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
    },
  };

  return (
    <View style={styles.indicator}>
      <Ionicons name={icon} size={getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType)} color={color} />
      <Text style={styles.text}>{text}</Text>
      {lastUpdateTime && connectionState === 'connected' && (
        <Text style={styles.timeText}>
          {lastUpdateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </View>
  );
});

// Composant pour une commande
const OrderCard = React.memo(({ 
  item, 
  isRealtime = false,
  screenType
}: { 
  item: OrderList;
  isRealtime?: boolean;
  screenType: 'mobile' | 'tablet' | 'desktop';
}) => {
  const displayInfo = useMemo(() => {
    const date = new Date(item.created_at);
    const isActive = ['pending', 'confirmed', 'preparing', 'ready'].includes(item.status);
    
    return {
      title: `Commande #${item.order_number || item.id}`,
      restaurantName: item.restaurant_name || 'Restaurant',
      time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      date: date.toLocaleDateString('fr-FR'),
      isActive,
      isToday: date.toDateString() === new Date().toDateString(),
    };
  }, [item]);

  const handlePress = useCallback(() => {
    router.push(`/order/${item.id}` as any);
  }, [item.id]);

  const styles = {
    card: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: displayInfo.isActive ? COLORS.primary + '20' : COLORS.border.light,
      ...(displayInfo.isActive && {
        borderLeftWidth: 4,
        borderLeftColor: COLORS.secondary,
      }),
      ...(isRealtime && displayInfo.isActive && {
        borderColor: COLORS.success + '30',
        borderWidth: 1,
      }),
    },

    header: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: screenType === 'mobile' ? 'flex-start' as const : 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    orderInfo: {
      flex: 1,
    },

    titleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    title: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },

    realtimeBadge: {
      width: getResponsiveValue({ mobile: 8, tablet: 9, desktop: 10 }, screenType),
      height: getResponsiveValue({ mobile: 8, tablet: 9, desktop: 10 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 4, tablet: 4.5, desktop: 5 }, screenType),
      backgroundColor: COLORS.success,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    realtimeDot: {
      width: getResponsiveValue({ mobile: 4, tablet: 4.5, desktop: 5 }, screenType),
      height: getResponsiveValue({ mobile: 4, tablet: 4.5, desktop: 5 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 2, tablet: 2.25, desktop: 2.5 }, screenType),
      backgroundColor: COLORS.surface,
    },

    restaurantName: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    orderTime: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
    },

    statusContainer: {
      alignItems: screenType === 'mobile' ? 'flex-start' as const : 'flex-end' as const,
      marginTop: screenType === 'mobile' ? getResponsiveValue(SPACING.xs, screenType) : 0,
    },

    details: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      flexWrap: 'wrap' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: displayInfo.isActive && item.waiting_time ? getResponsiveValue(SPACING.sm, screenType) : getResponsiveValue(SPACING.md, screenType),
    },

    detailItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    detailText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
    },

    waitingTime: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.warning + '10',
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
    },

    waitingTimeText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.warning,
      fontWeight: '500' as const,
    },

    action: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingTop: getResponsiveValue(SPACING.md, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },

    actionText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType
      ),
      color: COLORS.primary,
      fontWeight: '500' as const,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 17, desktop: 18 },
    screenType
  );

  const chevronSize = getResponsiveValue(
    { mobile: 20, tablet: 22, desktop: 24 },
    screenType
  );

  return (
    <Pressable 
      onPress={handlePress}
      android_ripple={{ 
        color: COLORS.primary + '10',
        borderless: false 
      }}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.orderInfo}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{displayInfo.title}</Text>
              {isRealtime && displayInfo.isActive && (
                <View style={styles.realtimeBadge}>
                  <View style={styles.realtimeDot} />
                </View>
              )}
            </View>
            <Text style={styles.restaurantName}>{displayInfo.restaurantName}</Text>
            <Text style={styles.orderTime}>
              {displayInfo.isToday ? `Aujourd'hui à ${displayInfo.time}` : displayInfo.date}
            </Text>
          </View>
          <View style={styles.statusContainer}>
            <StatusBadge status={item.status} />
          </View>
        </View>

        <View style={styles.details}>
          {item.table_number && (
            <View style={styles.detailItem}>
              <Ionicons name="restaurant-outline" size={iconSize} color={COLORS.text.secondary} />
              <Text style={styles.detailText}>Table {item.table_number}</Text>
            </View>
          )}
          
          <View style={styles.detailItem}>
            <Ionicons 
              name={item.order_type === 'dine_in' ? "restaurant" : "bag"} 
              size={iconSize} 
              color={COLORS.text.secondary} 
            />
            <Text style={styles.detailText}>
              {item.order_type === 'dine_in' ? 'Sur place' : 'À emporter'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons 
              name={item.payment_status === 'paid' ? "checkmark-circle" : "time"} 
              size={iconSize} 
              color={item.payment_status === 'paid' ? COLORS.success : COLORS.warning} 
            />
            <Text style={[
              styles.detailText,
              { color: item.payment_status === 'paid' ? COLORS.success : COLORS.warning }
            ]}>
              {item.payment_status === 'paid' ? 'Payé' : 'Paiement en attente'}
            </Text>
          </View>
        </View>

        {/* Temps d'attente pour commandes actives */}
        {displayInfo.isActive && item.waiting_time && (
          <View style={styles.waitingTime}>
            <Ionicons name="time-outline" size={iconSize} color={COLORS.warning} />
            <Text style={styles.waitingTimeText}>
              Temps d'attente estimé : {item.waiting_time} min
            </Text>
          </View>
        )}

        {/* Action */}
        <View style={styles.action}>
          <Text style={styles.actionText}>Voir le récapitulatif</Text>
          <Ionicons name="chevron-forward" size={chevronSize} color={COLORS.primary} />
        </View>
      </Card>
    </Pressable>
  );
});

// État vide avec QR Access
const EmptyState = React.memo(({ screenType }: { screenType: 'mobile' | 'tablet' | 'desktop' }) => {
  const handleQRSuccess = useCallback((restaurantId: string, tableNumber?: string) => {
    const params: Record<string, string> = {};
    if (tableNumber) {
      params.tableNumber = tableNumber;
    }

    router.push({
      pathname: `/menu/client/${restaurantId}` as any,
      params
    });
  }, []);

  const styles = {
    container: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(
        { mobile: 32, tablet: 48, desktop: 64 },
        screenType
      ),
    },

    title: {
      fontSize: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginTop: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },

    message: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 24, tablet: 26, desktop: 28 },
        screenType
      ),
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    qrContainer: {
      width: '100%',
      maxWidth: getResponsiveValue(
        { mobile: 400, tablet: 500, desktop: 600 },
        screenType
      ),
    },
  };

  return (
    <View style={styles.container}>
      <Ionicons 
        name="receipt-outline" 
        size={getResponsiveValue({ mobile: 80, tablet: 100, desktop: 120 }, screenType)} 
        color={COLORS.text.light} 
      />
      <Text style={styles.title}>Aucune commande en cours</Text>
      <Text style={styles.message}>
        Scannez le QR code de votre table pour passer votre première commande
      </Text>
      
      <QRAccessButtons
        title="Commander maintenant"
        description="Accédez au menu en scannant le QR code de votre table"
        onSuccess={handleQRSuccess}
        containerStyle={styles.qrContainer}
        scanButtonText="Scanner QR Code"
        codeButtonText="Entrer le code"
      />
    </View>
  );
});

// Section commandes actives
const ActiveOrdersSection = React.memo(({ 
  orders, 
  onRefresh, 
  isLoading,
  realtimeState,
  screenType
}: { 
  orders: OrderList[]; 
  onRefresh: () => void;
  isLoading: boolean;
  realtimeState?: {
    connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
    activeOrdersCount: number;
    lastUpdateTime?: Date;
  };
  screenType: 'mobile' | 'tablet' | 'desktop';
}) => {
  const activeOrders = orders.filter(o => 
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  );

  if (activeOrders.length === 0) return null;

  const styles = {
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
    },

    titleContainer: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    title: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 22, desktop: 26 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },

    refreshButton: {
      padding: getResponsiveValue(SPACING.xs, screenType),
    },
  };

  const refreshIconSize = getResponsiveValue(
    { mobile: 20, tablet: 22, desktop: 24 },
    screenType
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Commandes en cours</Text>
          {realtimeState && (
            <RealtimeIndicator 
              connectionState={realtimeState.connectionState}
              activeOrdersCount={realtimeState.activeOrdersCount}
              lastUpdateTime={realtimeState.lastUpdateTime}
              screenType={screenType}
            />
          )}
        </View>
        <Pressable 
          style={styles.refreshButton}
          onPress={onRefresh} 
          disabled={isLoading}
          android_ripple={{ 
            color: COLORS.primary + '20',
            borderless: true 
          }}
        >
          <Ionicons 
            name="refresh" 
            size={refreshIconSize} 
            color={isLoading ? COLORS.text.light : COLORS.primary} 
          />
        </Pressable>
      </View>
      {activeOrders.map(order => (
        <View key={order.id} style={{ paddingHorizontal: getResponsiveValue(SPACING.container, screenType) }}>
          <OrderCard 
            item={order} 
            isRealtime={realtimeState?.connectionState === 'connected'}
            screenType={screenType}
          />
        </View>
      ))}
    </View>
  );
});

// Section historique
const HistorySection = React.memo(({ 
  orders, 
  screenType 
}: { 
  orders: OrderList[];
  screenType: 'mobile' | 'tablet' | 'desktop';
}) => {
  const historyOrders = orders.filter(o => 
    ['served', 'cancelled'].includes(o.status)
  ).slice(0, 5);

  if (historyOrders.length === 0) return null;

  const styles = {
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    title: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 22, desktop: 26 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
    },
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Historique récent</Text>
      {historyOrders.map(order => (
        <View key={order.id} style={{ paddingHorizontal: getResponsiveValue(SPACING.container, screenType) }}>
          <OrderCard item={order} screenType={screenType} />
        </View>
      ))}
    </View>
  );
});

// Composant principal
export default function ClientOrdersScreen() {
  const { isClient, isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  
  const {
    orders,
    isLoading,
    error,
    fetchOrders,
  } = useClientOrders();

  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Hook temps réel
  const realtimeState = useOrderRealtime(orders, fetchOrders, {
    enabled: isAuthenticated && orders.length > 0,
    onOrderUpdate: (update) => {
      console.log('📦 Order update received:', update);
    },
    onConnectionChange: (state) => {
      console.log('🔗 Connection state changed:', state);
    }
  });

  const hasActiveOrders = orders.some(o => 
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  // Auto-refresh pour commandes actives
  useAutoRefresh(hasActiveOrders, handleRefresh, realtimeState.isConnected);

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
    useGridLayout: screenType === 'desktop' && width > 1200,
  };

  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    content: {
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    errorContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(
        { mobile: 40, tablet: 60, desktop: 80 },
        screenType
      ),
    },

    errorText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.md, screenType),
      textAlign: 'center' as const,
    },

    errorBanner: {
      backgroundColor: COLORS.error + '10',
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.sm, screenType),
      margin: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.error + '30',
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    errorBannerText: {
      color: COLORS.error,
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      flex: 1,
    },

    warningBanner: {
      backgroundColor: COLORS.warning + '10',
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.sm, screenType),
      margin: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.warning + '30',
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    warningBannerText: {
      color: COLORS.warning,
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      flex: 1,
    },

    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(
        { mobile: 40, tablet: 60, desktop: 80 },
        screenType
      ),
    },

    loadingText: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
    },
  };

  // Rendu du contenu principal
  const renderContent = useCallback(() => {
    if (orders.length === 0 && !isLoading) {
      return <EmptyState screenType={screenType} />;
    }

    return (
      <FlatList
        data={[1]}
        renderItem={() => (
          <View style={styles.content}>
            <ActiveOrdersSection 
              orders={orders}
              onRefresh={handleRefresh}
              isLoading={refreshing}
              realtimeState={realtimeState}
              screenType={screenType}
            />
            <HistorySection 
              orders={orders}
              screenType={screenType}
            />
          </View>
        )}
        keyExtractor={() => 'content'}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    );
  }, [orders, isLoading, refreshing, handleRefresh, realtimeState, screenType, styles.content]);

  // Gestion des erreurs d'accès
  if (!isClient) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Mes commandes" />
        <View style={styles.errorContainer}>
          <Ionicons 
            name="lock-closed-outline" 
            size={getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType)} 
            color={COLORS.text.secondary} 
          />
          <Text style={styles.errorText}>Accès réservé aux clients</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Mes commandes" />

      {/* Bannière d'erreur */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons 
            name="warning" 
            size={getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType)} 
            color={COLORS.error} 
          />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Bannière d'avertissement si temps réel échoue */}
      {realtimeState.connectionState === 'error' && realtimeState.activeOrdersCount > 0 && (
        <View style={styles.warningBanner}>
          <Ionicons 
            name="cloud-offline" 
            size={getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType)} 
            color={COLORS.warning} 
          />
          <Text style={styles.warningBannerText}>
            Notifications temps réel indisponibles. Tirez pour actualiser.
          </Text>
        </View>
      )}

      {/* Contenu principal */}
      {renderContent()}

      {/* Indicateur de chargement initial */}
      {isLoading && orders.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator 
            size="large" 
            color={COLORS.primary} 
          />
          <Text style={styles.loadingText}>Chargement de vos commandes...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}