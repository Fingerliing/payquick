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
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useClientOrders } from '@/hooks/client/useClientOrders';
import { OrderList } from '@/types/order';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/common/StatusBadge';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { useOrderRealtime } from '@/hooks/useOrderRealtime';
import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

type OrderTab = 'active' | 'history';
type ScreenType = 'mobile' | 'tablet' | 'desktop';

// =============================================================================
// SEGMENTED TABS — En cours / Historique
// =============================================================================
const SegmentedTabs = React.memo(({
  selected,
  onSelect,
  activeCount,
  historyCount,
  screenType,
}: {
  selected: OrderTab;
  onSelect: (tab: OrderTab) => void;
  activeCount: number;
  historyCount: number;
  screenType: ScreenType;
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const tabs: { key: OrderTab; label: string; count: number }[] = [
    { key: 'active',  label: t('order.tabs.active'),  count: activeCount },
    { key: 'history', label: t('order.tabs.history'), count: historyCount },
  ];

  const styles = {
    container: {
      flexDirection: 'row' as const,
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.light,
      padding: 3,
    },
    tab: {
      flex: 1,
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden' as const,
    },
    tabInner: (isSelected: boolean) => ({
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: getResponsiveValue(
        { mobile: 10, tablet: 12, desktop: 14 },
        screenType,
      ),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: isSelected ? colors.primary : 'transparent',
      gap: getResponsiveValue(SPACING.xs, screenType),
    }),
    label: (isSelected: boolean) => ({
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      fontWeight: '600' as const,
      color: isSelected ? colors.text.inverse : colors.text.secondary,
    }),
    badge: (isSelected: boolean) => ({
      backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : colors.border.light,
      paddingHorizontal: getResponsiveValue(
        { mobile: 7, tablet: 8, desktop: 9 },
        screenType,
      ),
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
    }),
    badgeText: (isSelected: boolean) => ({
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType,
      ),
      fontWeight: '700' as const,
      color: isSelected ? colors.text.inverse : colors.text.secondary,
    }),
  };

  return (
    <View style={styles.container}>
      {tabs.map(({ key, label, count }) => {
        const isSelected = selected === key;
        return (
          <Pressable
            key={key}
            style={styles.tab}
            onPress={() => onSelect(key)}
            android_ripple={{ color: colors.primary + '15', borderless: false }}
          >
            <View style={styles.tabInner(isSelected)}>
              <Text style={styles.label(isSelected)}>{label}</Text>
              {count > 0 && (
                <View style={styles.badge(isSelected)}>
                  <Text style={styles.badgeText(isSelected)}>{count}</Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

// =============================================================================
// useAutoRefresh — auto-refresh des commandes actives
// =============================================================================
const useAutoRefresh = (
  hasActiveOrders: boolean,
  refreshFn: () => void,
  realtimeEnabled: boolean = false,
) => {
  React.useEffect(() => {
    if (!hasActiveOrders || realtimeEnabled) return;
    const interval = setInterval(refreshFn, 30000);
    return () => clearInterval(interval);
  }, [hasActiveOrders, refreshFn, realtimeEnabled]);
};

// =============================================================================
// RealtimeIndicator — indicateur connexion temps réel
// =============================================================================
const RealtimeIndicator = React.memo(({
  connectionState,
  activeOrdersCount,
  screenType,
}: {
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  activeOrdersCount: number;
  screenType: ScreenType;
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  if (activeOrdersCount === 0) return null;

  const getIndicatorProps = () => {
    switch (connectionState) {
      case 'connected':
        return {
          icon: 'radio-button-on' as const,
          color: colors.success,
          text: t('order.realtime.on'),
        };
      case 'connecting':
        return {
          icon: 'radio-button-off' as const,
          color: colors.warning,
          text: t('order.realtime.connecting'),
        };
      case 'error':
        return {
          icon: 'warning' as const,
          color: colors.error,
          text: t('order.realtime.error'),
        };
      default:
        return {
          icon: 'radio-button-off' as const,
          color: colors.text.light,
          text: t('order.realtime.offline'),
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
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    text: {
      fontSize: getResponsiveValue(
        { mobile: 11, tablet: 12, desktop: 13 },
        screenType,
      ),
      fontWeight: '500' as const,
      color,
    },
  };

  return (
    <View style={styles.indicator}>
      <Ionicons
        name={icon}
        size={getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType)}
        color={color}
      />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
});

// =============================================================================
// OrderCard — carte d'une commande
// =============================================================================
const OrderCard = React.memo(({
  item,
  isRealtime = false,
  screenType,
}: {
  item: OrderList;
  isRealtime?: boolean;
  screenType: ScreenType;
}) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();

  const displayInfo = useMemo(() => {
    const date = new Date(item.created_at);
    const isActive = ['pending', 'confirmed', 'preparing', 'ready'].includes(item.status);
    const locale = i18n.language || 'fr';

    return {
      title: t('order.orderNumber', { number: item.order_number || item.id }),
      restaurantName: item.restaurant_name || t('order.fallbackRestaurant'),
      time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      date: date.toLocaleDateString(locale),
      isActive,
      isToday: date.toDateString() === new Date().toDateString(),
    };
  }, [item, t, i18n.language]);

  const handlePress = useCallback(() => {
    router.push(`/order/${item.id}` as any);
  }, [item.id]);

  const styles = {
    card: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: colors.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: displayInfo.isActive ? colors.primary + '20' : colors.border.light,
      ...(displayInfo.isActive && {
        borderLeftWidth: 4,
        borderLeftColor: colors.secondary,
      }),
      ...(isRealtime && displayInfo.isActive && {
        borderColor: colors.success + '30',
        borderWidth: 1,
      }),
    },
    header: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    orderInfo: { flex: 1 },
    titleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    title: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType,
      ),
      fontWeight: '700' as const,
      color: colors.text.primary,
    },
    realtimeBadge: {
      width: getResponsiveValue({ mobile: 8, tablet: 9, desktop: 10 }, screenType),
      height: getResponsiveValue({ mobile: 8, tablet: 9, desktop: 10 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 4, tablet: 4.5, desktop: 5 }, screenType),
      backgroundColor: colors.success,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    realtimeDot: {
      width: getResponsiveValue({ mobile: 4, tablet: 4.5, desktop: 5 }, screenType),
      height: getResponsiveValue({ mobile: 4, tablet: 4.5, desktop: 5 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 2, tablet: 2.25, desktop: 2.5 }, screenType),
      backgroundColor: colors.surface,
    },
    restaurantName: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType,
      ),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    orderTime: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      color: colors.text.secondary,
    },
    statusContainer: {
      alignItems: screenType === 'mobile' ? 'flex-start' as const : 'flex-end' as const,
      marginTop: screenType === 'mobile' ? getResponsiveValue(SPACING.xs, screenType) : 0,
    },
    details: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      flexWrap: 'wrap' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: displayInfo.isActive && item.waiting_time
        ? getResponsiveValue(SPACING.sm, screenType)
        : getResponsiveValue(SPACING.md, screenType),
    },
    detailItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    detailText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      color: colors.text.secondary,
    },
    waitingTime: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: colors.warning + '10',
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
    },
    waitingTimeText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      color: colors.warning,
      fontWeight: '500' as const,
    },
    action: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingTop: getResponsiveValue(SPACING.md, screenType),
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
    actionText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 17, desktop: 18 },
        screenType,
      ),
      color: colors.primary,
      fontWeight: '500' as const,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 17, desktop: 18 },
    screenType,
  );
  const chevronSize = getResponsiveValue(
    { mobile: 20, tablet: 22, desktop: 24 },
    screenType,
  );

  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{ color: colors.primary + '10', borderless: false }}
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
              {displayInfo.isToday
                ? t('order.todayAt', { time: displayInfo.time })
                : displayInfo.date}
            </Text>
          </View>
          <View style={styles.statusContainer}>
            <StatusBadge status={item.status} />
          </View>
        </View>

        <View style={styles.details}>
          {!!item.table_number && (
            <View style={styles.detailItem}>
              <Ionicons name="restaurant-outline" size={iconSize} color={colors.text.secondary} />
              <Text style={styles.detailText}>
                {t('cart.tableNumber', { number: item.table_number })}
              </Text>
            </View>
          )}

          <View style={styles.detailItem}>
            <Ionicons
              name={item.order_type === 'dine_in' ? 'restaurant' : 'bag'}
              size={iconSize}
              color={colors.text.secondary}
            />
            <Text style={styles.detailText}>
              {item.order_type === 'dine_in' ? t('order.dineIn') : t('order.takeaway')}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons
              name={item.payment_status === 'paid' ? 'checkmark-circle' : 'time'}
              size={iconSize}
              color={item.payment_status === 'paid' ? colors.success : colors.warning}
            />
            <Text
              style={[
                styles.detailText,
                { color: item.payment_status === 'paid' ? colors.success : colors.warning },
              ]}
            >
              {item.payment_status === 'paid' ? t('order.paid') : t('order.paymentPending')}
            </Text>
          </View>
        </View>

        {/* Temps d'attente */}
        {displayInfo.isActive && !!item.waiting_time && (
          <View style={styles.waitingTime}>
            <Ionicons name="time-outline" size={iconSize} color={colors.warning} />
            <Text style={styles.waitingTimeText}>
              {t('order.waitingTime', { minutes: item.waiting_time })}
            </Text>
          </View>
        )}

        {/* Action */}
        <View style={styles.action}>
          <Text style={styles.actionText}>{t('order.viewDetails')}</Text>
          <Ionicons name="chevron-forward" size={chevronSize} color={colors.primary} />
        </View>
      </Card>
    </Pressable>
  );
});

// =============================================================================
// EmptyState — aucune commande + QR Access
// =============================================================================
const EmptyState = React.memo(({ screenType }: { screenType: ScreenType }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const handleQRSuccess = useCallback(
    (restaurantId: number, tableNumber: string, code: string) => {
      router.push({
        pathname: `/menu/client/${restaurantId}` as any,
        params: {
          code,
          restaurantId: restaurantId.toString(),
          tableNumber,
        },
      });
    },
    [],
  );

  const styles = {
    container: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(
        { mobile: 32, tablet: 48, desktop: 64 },
        screenType,
      ),
    },
    title: {
      fontSize: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType,
      ),
      fontWeight: '700' as const,
      color: colors.text.primary,
      marginTop: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },
    message: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType,
      ),
      color: colors.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 24, tablet: 26, desktop: 28 },
        screenType,
      ),
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    qrContainer: {
      width: '100%' as const,
      maxWidth: getResponsiveValue(
        { mobile: 400, tablet: 500, desktop: 600 },
        screenType,
      ),
    },
  };

  return (
    <View style={styles.container}>
      <Ionicons
        name="receipt-outline"
        size={getResponsiveValue({ mobile: 80, tablet: 100, desktop: 120 }, screenType)}
        color={colors.text.light}
      />
      <Text style={styles.title}>{t('order.noActiveOrders')}</Text>
      <Text style={styles.message}>{t('order.scanPrompt')}</Text>

      <QRAccessButtons
        title={t('order.orderNow')}
        description={t('order.scanDescription')}
        onSuccess={handleQRSuccess}
        containerStyle={styles.qrContainer}
        scanButtonText={t('order.scanQR')}
        codeButtonText={t('order.enterCode')}
      />
    </View>
  );
});

// =============================================================================
// ActiveOrdersSection
// =============================================================================
const ActiveOrdersSection = React.memo(({
  orders,
  onRefresh,
  isLoading,
  realtimeState,
  screenType,
}: {
  orders: OrderList[];
  onRefresh: () => void;
  isLoading: boolean;
  realtimeState?: {
    connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
    activeOrdersCount: number;
  };
  screenType: ScreenType;
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const activeOrders = orders.filter((o) =>
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status),
  );

  if (activeOrders.length === 0) {
    const emptyStyles = {
      container: {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: getResponsiveValue(
          { mobile: 40, tablet: 60, desktop: 80 },
          screenType,
        ),
      },
      text: {
        fontSize: getResponsiveValue(
          { mobile: 16, tablet: 18, desktop: 20 },
          screenType,
        ),
        color: colors.text.secondary,
        marginTop: getResponsiveValue(SPACING.md, screenType),
        textAlign: 'center' as const,
      },
    };

    return (
      <View style={emptyStyles.container}>
        <Ionicons
          name="checkmark-circle-outline"
          size={getResponsiveValue({ mobile: 56, tablet: 64, desktop: 72 }, screenType)}
          color={colors.text.light}
        />
        <Text style={emptyStyles.text}>{t('order.noActiveOrders')}</Text>
      </View>
    );
  }

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
    refreshButton: {
      padding: getResponsiveValue(SPACING.xs, screenType),
    },
  };

  const refreshIconSize = getResponsiveValue(
    { mobile: 20, tablet: 22, desktop: 24 },
    screenType,
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          {realtimeState && (
            <RealtimeIndicator
              connectionState={realtimeState.connectionState}
              activeOrdersCount={realtimeState.activeOrdersCount}
              screenType={screenType}
            />
          )}
        </View>
        <Pressable
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={isLoading}
          android_ripple={{ color: colors.primary + '20', borderless: true }}
        >
          <Ionicons
            name="refresh"
            size={refreshIconSize}
            color={isLoading ? colors.text.light : colors.primary}
          />
        </Pressable>
      </View>
      {activeOrders.map((order) => (
        <View
          key={order.id}
          style={{ paddingHorizontal: getResponsiveValue(SPACING.container, screenType) }}
        >
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

// =============================================================================
// HistorySection
// =============================================================================
const HistorySection = React.memo(({
  orders,
  screenType,
}: {
  orders: OrderList[];
  screenType: ScreenType;
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const historyOrders = orders.filter((o) =>
    ['served', 'cancelled'].includes(o.status),
  );

  if (historyOrders.length === 0) {
    const emptyStyles = {
      container: {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: getResponsiveValue(
          { mobile: 40, tablet: 60, desktop: 80 },
          screenType,
        ),
      },
      text: {
        fontSize: getResponsiveValue(
          { mobile: 16, tablet: 18, desktop: 20 },
          screenType,
        ),
        color: colors.text.secondary,
        marginTop: getResponsiveValue(SPACING.md, screenType),
        textAlign: 'center' as const,
      },
    };

    return (
      <View style={emptyStyles.container}>
        <Ionicons
          name="time-outline"
          size={getResponsiveValue({ mobile: 56, tablet: 64, desktop: 72 }, screenType)}
          color={colors.text.light}
        />
        <Text style={emptyStyles.text}>{t('order.noHistoryOrders')}</Text>
      </View>
    );
  }

  const styles = {
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
  };

  return (
    <View style={styles.section}>
      {historyOrders.map((order) => (
        <View
          key={order.id}
          style={{ paddingHorizontal: getResponsiveValue(SPACING.container, screenType) }}
        >
          <OrderCard item={order} screenType={screenType} />
        </View>
      ))}
    </View>
  );
});

// =============================================================================
// MAIN SCREEN
// =============================================================================
export default function ClientOrdersScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { isClient, isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<OrderTab>('active');

  const { orders, isLoading, error, fetchOrders } = useClientOrders();

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
    },
  });

  const hasActiveOrders = orders.some((o) =>
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status),
  );

  const activeCount = useMemo(
    () =>
      orders.filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)).length,
    [orders],
  );

  const historyCount = useMemo(
    () => orders.filter((o) => ['served', 'cancelled'].includes(o.status)).length,
    [orders],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  useAutoRefresh(hasActiveOrders, handleRefresh, realtimeState.isConnected);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders]),
  );

  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
    useGridLayout: screenType === 'desktop' && width > 1200,
  };

  const styles = {
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
        screenType,
      ),
    },
    errorText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType,
      ),
      color: colors.text.secondary,
      marginTop: getResponsiveValue(SPACING.md, screenType),
      textAlign: 'center' as const,
    },
    errorBanner: {
      backgroundColor: colors.error + '10',
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.sm, screenType),
      margin: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.error + '30',
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    errorBannerText: {
      color: colors.error,
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
      ),
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      flex: 1,
    },
    warningBanner: {
      backgroundColor: colors.warning + '10',
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.sm, screenType),
      margin: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.warning + '30',
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    warningBannerText: {
      color: colors.warning,
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType,
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
        screenType,
      ),
    },
    loadingText: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType,
      ),
      color: colors.text.secondary,
      textAlign: 'center' as const,
    },
  };

  const renderContent = useCallback(() => {
    if (orders.length === 0 && !isLoading) {
      return <EmptyState screenType={screenType} />;
    }

    return (
      <FlatList
        data={[1]}
        extraData={selectedTab}
        renderItem={() => (
          <View style={styles.content}>
            <SegmentedTabs
              selected={selectedTab}
              onSelect={setSelectedTab}
              activeCount={activeCount}
              historyCount={historyCount}
              screenType={screenType}
            />
            {selectedTab === 'active' ? (
              <ActiveOrdersSection
                orders={orders}
                onRefresh={handleRefresh}
                isLoading={refreshing}
                realtimeState={realtimeState}
                screenType={screenType}
              />
            ) : (
              <HistorySection orders={orders} screenType={screenType} />
            )}
          </View>
        )}
        keyExtractor={() => 'content'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      />
    );
  }, [
    orders,
    isLoading,
    refreshing,
    handleRefresh,
    realtimeState,
    screenType,
    styles.content,
    selectedTab,
    activeCount,
    historyCount,
    colors.primary,
  ]);

  // Accès non autorisé
  if (!isClient) {
    return (
      <View style={styles.container}>
        <Header
          title={t('order.myOrders')}
          showLanguageSwitcher
          showThemeSwitcher
        />
        <View style={styles.errorContainer}>
          <Ionicons
            name="lock-closed-outline"
            size={getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType)}
            color={colors.text.secondary}
          />
          <Text style={styles.errorText}>{t('order.clientOnly')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={t('order.myOrders')}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        showLanguageSwitcher
        showThemeSwitcher
      />

      {/* Bannière d'erreur */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons
            name="warning"
            size={getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType)}
            color={colors.error}
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
            color={colors.warning}
          />
          <Text style={styles.warningBannerText}>{t('order.realtimeUnavailable')}</Text>
        </View>
      )}

      {/* Contenu principal */}
      {renderContent()}

      {/* Indicateur de chargement initial */}
      {isLoading && orders.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('order.loadingOrders')}</Text>
        </View>
      )}
    </View>
  );
}