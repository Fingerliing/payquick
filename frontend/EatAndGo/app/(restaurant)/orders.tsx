import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useOrder } from '@/contexts/OrderContext';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { OrderList } from '@/types/order';
import { Restaurant } from '@/types/restaurant';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTES — couleurs kanban identitaires (stables dans les 2 modes)
// Saturation suffisante pour rester lisibles partout.
// ════════════════════════════════════════════════════════════════════════════
const KANBAN_RED = '#EF4444';
const KANBAN_AMBER = '#F59E0B';
const KANBAN_GREEN = '#10B981';

// ════════════════════════════════════════════════════════════════════════════
// Hooks utilitaires
// ════════════════════════════════════════════════════════════════════════════

type AlertItem = {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
};

const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const pushAlert = useCallback(
    (variant: AlertItem['variant'], title: string | undefined, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts(prev => [{ id, variant, title, message }, ...prev]);
    },
    [],
  );
  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);
  return { alerts, pushAlert, dismissAlert };
};

const useOrderArchiving = () => {
  const [archivedOrders, setArchivedOrders] = useState<Set<number>>(new Set());

  useEffect(() => {
    const loadArchivedOrders = async () => {
      try {
        const archived = await AsyncStorage.getItem('archivedOrders');
        if (archived) setArchivedOrders(new Set(JSON.parse(archived)));
      } catch (error) {
        console.error('Error loading archived orders:', error);
      }
    };
    loadArchivedOrders();
  }, []);

  const saveArchivedOrders = useCallback(async (orders: Set<number>) => {
    try {
      await AsyncStorage.setItem('archivedOrders', JSON.stringify(Array.from(orders)));
    } catch (error) {
      console.error('Error saving archived orders:', error);
    }
  }, []);

  const archiveOrder = useCallback(
    async (orderId: number) => {
      const newArchived = new Set(archivedOrders);
      newArchived.add(orderId);
      setArchivedOrders(newArchived);
      await saveArchivedOrders(newArchived);
    },
    [archivedOrders, saveArchivedOrders],
  );

  const unarchiveOrder = useCallback(
    async (orderId: number) => {
      const newArchived = new Set(archivedOrders);
      newArchived.delete(orderId);
      setArchivedOrders(newArchived);
      await saveArchivedOrders(newArchived);
    },
    [archivedOrders, saveArchivedOrders],
  );

  const archiveCompletedOrders = useCallback(
    async (orders: OrderList[]) => {
      const completedOrderIds = orders
        .filter(order => ['served', 'cancelled'].includes(order.status))
        .map(order => order.id);

      if (completedOrderIds.length === 0) return 0;

      const newArchived = new Set([...archivedOrders, ...completedOrderIds]);
      setArchivedOrders(newArchived);
      await saveArchivedOrders(newArchived);
      return completedOrderIds.length;
    },
    [archivedOrders, saveArchivedOrders],
  );

  return { archivedOrders, archiveOrder, unarchiveOrder, archiveCompletedOrders };
};

const useRestaurantSelection = () => {
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const { restaurants, loadRestaurants, isLoading: isLoadingRestaurants } = useRestaurant();

  useEffect(() => {
    loadRestaurants();
  }, []);

  useEffect(() => {
    const restoreSelection = async () => {
      if (restaurants.length > 0 && selectedRestaurantId === null) {
        try {
          const savedRestaurantId = await AsyncStorage.getItem('selectedRestaurantId');
          if (savedRestaurantId && restaurants.find(r => r.id === savedRestaurantId)) {
            setSelectedRestaurantId(parseInt(savedRestaurantId));
          } else if (restaurants.length > 0) {
            const firstId = parseInt(restaurants[0].id);
            setSelectedRestaurantId(firstId);
            await AsyncStorage.setItem('selectedRestaurantId', String(firstId));
          }
        } catch (error) {
          console.error('Error restoring restaurant selection:', error);
        }
      }
    };
    restoreSelection();
  }, [restaurants.length, selectedRestaurantId]);

  const selectRestaurant = useCallback(async (restaurantId: number) => {
    setSelectedRestaurantId(restaurantId);
    await AsyncStorage.setItem('selectedRestaurantId', String(restaurantId));
  }, []);

  return { restaurants, selectedRestaurantId, isLoadingRestaurants, selectRestaurant };
};

const useElapsedTime = (createdAtIso: string) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return useMemo(() => {
    const elapsedMs = Math.max(0, now - new Date(createdAtIso).getTime());
    const seconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    let label: string;
    if (seconds < 60) label = `${seconds}s`;
    else if (minutes < 60) label = `${minutes}m`;
    else label = `${hours}h ${minutes % 60}m`;

    let urgency: 'normal' | 'warning' | 'urgent' = 'normal';
    if (minutes >= 15) urgency = 'urgent';
    else if (minutes >= 5) urgency = 'warning';

    return { label, urgency, minutes, seconds };
  }, [now, createdAtIso]);
};

// ════════════════════════════════════════════════════════════════════════════
// Kanban column definitions — fonction qui prend `t` pour traduire les labels
// ════════════════════════════════════════════════════════════════════════════

type KanbanColumnKey = 'new' | 'preparing' | 'ready';

interface KanbanColumnDef {
  key: KanbanColumnKey;
  label: string;
  chipLabel: string;
  color: string;
  statuses: string[];
  nextStatus: string;
  actionLabel: string;
  actionColor: string;
}

const getKanbanColumns = (t: any, colors: AppColors): KanbanColumnDef[] => [
  {
    key: 'new',
    label: t('restaurantOrders.kanban.columns.new.title'),
    chipLabel: t('restaurantOrders.kanban.columns.new.chip'),
    color: KANBAN_RED,
    statuses: ['pending', 'confirmed'],
    nextStatus: 'preparing',
    actionLabel: t('restaurantOrders.kanban.columns.new.action'),
    actionColor: colors.primary, // navy primary
  },
  {
    key: 'preparing',
    label: t('restaurantOrders.kanban.columns.preparing.title'),
    chipLabel: t('restaurantOrders.kanban.columns.preparing.chip'),
    color: KANBAN_AMBER,
    statuses: ['preparing'],
    nextStatus: 'ready',
    actionLabel: t('restaurantOrders.kanban.columns.preparing.action'),
    actionColor: KANBAN_GREEN,
  },
  {
    key: 'ready',
    label: t('restaurantOrders.kanban.columns.ready.title'),
    chipLabel: t('restaurantOrders.kanban.columns.ready.chip'),
    color: KANBAN_GREEN,
    statuses: ['ready'],
    nextStatus: 'served',
    actionLabel: t('restaurantOrders.kanban.columns.ready.action'),
    actionColor: colors.primary,
  },
];

// ════════════════════════════════════════════════════════════════════════════
// RestaurantSelector
// ════════════════════════════════════════════════════════════════════════════

const RestaurantSelector = React.memo(
  ({
    restaurants,
    selectedRestaurantId,
    onSelect,
    isLoading,
    screenType,
  }: {
    restaurants: Restaurant[];
    selectedRestaurantId: number | null;
    onSelect: (id: number) => void;
    isLoading: boolean;
    screenType: ScreenType;
  }) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();
    const [showModal, setShowModal] = useState(false);
    const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));

    const styles = useMemo(
      () => ({
        selector: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
          paddingVertical: getResponsiveValue(SPACING.sm, screenType),
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
          gap: getResponsiveValue(SPACING.xs, screenType),
        },
        selectorText: {
          flex: 1,
          fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
          fontWeight: '500' as const,
          color: colors.text.primary,
        },
        modalOverlay: {
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end' as const,
        },
        modalContent: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: BORDER_RADIUS.xl,
          borderTopRightRadius: BORDER_RADIUS.xl,
          maxHeight: '70%' as const,
        },
        modalHeader: {
          flexDirection: 'row' as const,
          justifyContent: 'space-between' as const,
          alignItems: 'center' as const,
          padding: getResponsiveValue(SPACING.lg, screenType),
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        },
        modalTitle: {
          fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
          fontWeight: '600' as const,
          color: colors.text.primary,
        },
        restaurantOption: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          padding: getResponsiveValue(SPACING.lg, screenType),
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        },
        restaurantOptionSelected: { backgroundColor: colors.secondary + '15' },
        restaurantOptionText: {
          fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
          fontWeight: '500' as const,
          color: colors.text.primary,
          marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
        },
        restaurantOptionTextSelected: { color: colors.secondary },
        restaurantOptionAddress: {
          fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
          color: colors.text.secondary,
        },
      }),
      [colors, screenType],
    );

    const iconSize = getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType);

    if (isLoading) {
      return (
        <View style={styles.selector}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.selectorText}>{t('common.loading')}</Text>
        </View>
      );
    }

    if (restaurants.length === 0) {
      return (
        <View style={styles.selector}>
          <Ionicons name="warning" size={iconSize} color={colors.warning} />
          <Text style={styles.selectorText}>
            {t('restaurantOrders.noRestaurantFound')}
          </Text>
        </View>
      );
    }

    if (restaurants.length === 1) return null;

    return (
      <>
        <Pressable
          style={styles.selector}
          onPress={() => setShowModal(true)}
          android_ripple={{ color: colors.primary + '20', borderless: false }}
        >
          <Ionicons name="restaurant" size={iconSize} color={colors.secondary} />
          <Text style={styles.selectorText}>
            {selectedRestaurant?.name || t('restaurantOrders.selectRestaurant')}
          </Text>
          <Ionicons name="chevron-down" size={iconSize} color={colors.text.secondary} />
        </Pressable>

        <Modal
          visible={showModal}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setShowModal(false)}
        >
          <SafeAreaView style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {t('restaurantOrders.chooseRestaurant')}
                </Text>
                <Pressable onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text.secondary} />
                </Pressable>
              </View>
              <FlatList
                data={restaurants}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.restaurantOption,
                      item.id === String(selectedRestaurantId)
                        ? styles.restaurantOptionSelected
                        : null,
                    ]}
                    onPress={() => {
                      onSelect(parseInt(item.id));
                      setShowModal(false);
                    }}
                    android_ripple={{ color: colors.primary + '20', borderless: false }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.restaurantOptionText,
                          item.id === String(selectedRestaurantId)
                            ? styles.restaurantOptionTextSelected
                            : null,
                        ]}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.restaurantOptionAddress}>
                        {item.address}, {item.city}
                      </Text>
                    </View>
                    {item.id === String(selectedRestaurantId) ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={iconSize}
                        color={colors.secondary}
                      />
                    ) : null}
                  </Pressable>
                )}
              />
            </View>
          </SafeAreaView>
        </Modal>
      </>
    );
  },
);

// ════════════════════════════════════════════════════════════════════════════
// OrderCard (vue détaillée — modal historique)
// ════════════════════════════════════════════════════════════════════════════

const OrderCard = React.memo(
  ({
    item,
    onStatusUpdate,
    onRequestPaymentMethod,
    onArchive,
    onUnarchive,
    isUpdating = false,
    isArchived = false,
    screenType,
  }: {
    item: OrderList;
    onStatusUpdate: (orderId: number, newStatus: string) => Promise<void>;
    onRequestPaymentMethod: (orderId: number) => void;
    onArchive?: (orderId: number) => Promise<void>;
    onUnarchive?: (orderId: number) => Promise<void>;
    isUpdating?: boolean;
    isArchived?: boolean;
    screenType: ScreenType;
  }) => {
    const { t, i18n } = useTranslation();
    const { colors, isDark } = useAppTheme();
    const [localUpdating, setLocalUpdating] = useState(false);
    const [cancelConfirm, setCancelConfirm] = useState(false);

    const displayInfo = useMemo(() => {
      const date = new Date(item.created_at);
      const isActive = ['pending', 'confirmed', 'preparing', 'ready'].includes(item.status);
      const isUrgent = isActive && Date.now() - date.getTime() > 30 * 60 * 1000;
      const locale = i18n.language;

      return {
        title: t('restaurantOrders.orderTitle', { number: item.order_number }),
        time: date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        date: date.toLocaleDateString(locale),
        isActive,
        isUrgent,
        isToday: date.toDateString() === new Date().toDateString(),
      };
    }, [item, t, i18n.language]);

    const styles = useMemo(
      () => ({
        card: {
          marginBottom: getResponsiveValue(SPACING.sm, screenType),
          padding: getResponsiveValue(SPACING.lg, screenType),
          backgroundColor: colors.surface,
          borderRadius: BORDER_RADIUS.lg,
          shadowColor: colors.shadow.default,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.4 : 0.1,
          shadowRadius: 4,
          elevation: 3,
          borderWidth: 1,
          borderColor: displayInfo.isActive ? colors.secondary : colors.border.light,
        },
        archivedCard: { opacity: 0.7, borderColor: colors.border.default },
        urgentCard: { borderColor: colors.error, backgroundColor: colors.error + '08' },
        header: {
          flexDirection: 'row' as const,
          justifyContent: 'space-between' as const,
          alignItems: 'flex-start' as const,
          marginBottom: getResponsiveValue(SPACING.sm, screenType),
        },
        orderInfo: { flex: 1 },
        titleRow: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: getResponsiveValue(SPACING.xs, screenType),
        },
        title: {
          fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
          fontWeight: '600' as const,
          color: colors.text.primary,
          marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
        },
        badge: {
          width: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
          height: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
          borderRadius: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        urgentBadge: { backgroundColor: colors.error + '20' },
        customerName: {
          fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
          color: colors.text.secondary,
          marginBottom: getResponsiveValue(SPACING.xs, screenType),
        },
        orderTime: {
          fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
          color: colors.text.secondary,
        },
        details: {
          flexDirection: screenType === 'mobile' ? ('column' as const) : ('row' as const),
          flexWrap: 'wrap' as const,
          gap: getResponsiveValue(SPACING.sm, screenType),
          marginBottom: getResponsiveValue(SPACING.sm, screenType),
        },
        detailItem: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: getResponsiveValue(SPACING.xs, screenType) / 2,
        },
        detailText: {
          fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
          color: colors.text.secondary,
        },
        waitingTime: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          marginBottom: getResponsiveValue(SPACING.sm, screenType),
          gap: getResponsiveValue(SPACING.xs, screenType) / 2,
          paddingVertical: getResponsiveValue(SPACING.xs, screenType),
          backgroundColor: colors.warning + '15',
          borderRadius: BORDER_RADIUS.sm,
        },
        waitingTimeText: {
          fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
          color: colors.warning,
          fontWeight: '500' as const,
        },
        actions: {
          flexDirection: screenType === 'mobile' ? ('column' as const) : ('row' as const),
          gap: getResponsiveValue(SPACING.xs, screenType),
          marginBottom: getResponsiveValue(SPACING.sm, screenType),
        },
        viewDetails: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          justifyContent: 'space-between' as const,
          paddingTop: getResponsiveValue(SPACING.sm, screenType),
          borderTopWidth: 1,
          borderTopColor: colors.border.light,
        },
        viewDetailsText: {
          fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
          color: colors.primary,
          fontWeight: '500' as const,
        },
      }),
      [colors, isDark, screenType, displayInfo.isActive],
    );

    const iconSize = getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType);

    const handleStatusChange = useCallback(
      async (newStatus: string) => {
        if (localUpdating || isUpdating) return;
        setLocalUpdating(true);
        try {
          await onStatusUpdate(item.id, newStatus);
        } finally {
          setLocalUpdating(false);
        }
      },
      [item.id, onStatusUpdate, localUpdating, isUpdating],
    );

    const handlePress = useCallback(() => {
      router.push(`/order/${item.id}` as any);
    }, [item.id]);

    const renderActions = () => {
      const isCompleted = ['served', 'cancelled'].includes(item.status);

      if (isArchived) {
        return (
          <View style={styles.actions}>
            <Button
              title={t('restaurantOrders.actions.unarchive')}
              onPress={() => onUnarchive?.(item.id)}
              disabled={isUpdating}
              variant="outline"
              size="sm"
              leftIcon={
                <Ionicons name="archive-outline" size={16} color={colors.text.secondary} />
              }
              fullWidth={screenType === 'mobile'}
              style={{ borderColor: colors.text.secondary, backgroundColor: 'transparent' }}
              textStyle={{ color: colors.text.secondary }}
            />
          </View>
        );
      }

      const statusFlow: Record<string, { next: string; labelKey: string }> = {
        pending: { next: 'confirmed', labelKey: 'restaurantOrders.actions.confirm' },
        confirmed: { next: 'preparing', labelKey: 'restaurantOrders.actions.preparing' },
        preparing: { next: 'ready', labelKey: 'restaurantOrders.actions.ready' },
        ready: { next: 'served', labelKey: 'restaurantOrders.actions.serve' },
      };

      const nextAction = statusFlow[item.status];

      return (
        <>
          <View style={styles.actions}>
            {nextAction ? (
              <Button
                title={t(nextAction.labelKey)}
                onPress={() => handleStatusChange(nextAction.next)}
                disabled={localUpdating || isUpdating}
                loading={localUpdating}
                style={{ backgroundColor: colors.secondary }}
                textStyle={{ color: colors.text.primary }}
                size="sm"
                leftIcon={
                  <Ionicons name="arrow-forward" size={16} color={colors.text.secondary} />
                }
                fullWidth={screenType === 'mobile'}
              />
            ) : null}

            {item.payment_status !== 'paid' && !isCompleted ? (
              <Button
                title={t('restaurantOrders.actions.collect')}
                onPress={() => onRequestPaymentMethod(item.id)}
                disabled={localUpdating || isUpdating}
                variant="outline"
                size="sm"
                leftIcon={<Ionicons name="card" size={16} color={colors.text.secondary} />}
                fullWidth={screenType === 'mobile'}
                style={{ borderColor: colors.success, backgroundColor: 'transparent' }}
                textStyle={{ color: colors.success }}
              />
            ) : null}

            {!isCompleted ? (
              <Button
                title={t('common.cancel')}
                onPress={() => setCancelConfirm(true)}
                disabled={localUpdating || isUpdating}
                variant="outline"
                size="sm"
                leftIcon={<Ionicons name="close-circle" size={16} color={colors.error} />}
                fullWidth={screenType === 'mobile'}
                style={{ borderColor: colors.error, backgroundColor: 'transparent' }}
                textStyle={{ color: colors.error }}
              />
            ) : null}

            {isCompleted && onArchive ? (
              <Button
                title={t('restaurantOrders.actions.archive')}
                onPress={() => onArchive(item.id)}
                disabled={isUpdating}
                variant="outline"
                size="sm"
                leftIcon={<Ionicons name="archive" size={16} color={colors.text.secondary} />}
                fullWidth={screenType === 'mobile'}
                style={{ borderColor: colors.text.secondary, backgroundColor: 'transparent' }}
                textStyle={{ color: colors.text.secondary }}
              />
            ) : null}
          </View>

          {cancelConfirm && (
            <View
              style={{
                paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
                paddingTop: getResponsiveValue(SPACING.xs, screenType),
              }}
            >
              <AlertWithAction
                variant="warning"
                title={t('restaurantOrders.cancelConfirm.title')}
                message={t('restaurantOrders.cancelConfirm.message', {
                  number: item.order_number,
                })}
                secondaryButton={{
                  text: t('restaurantOrders.cancelConfirm.keep'),
                  onPress: () => setCancelConfirm(false),
                }}
                primaryButton={{
                  text: t('restaurantOrders.cancelConfirm.confirm'),
                  onPress: () => {
                    setCancelConfirm(false);
                    handleStatusChange('cancelled');
                  },
                  variant: 'danger',
                }}
              />
            </View>
          )}
        </>
      );
    };

    const cardStyle = {
      ...styles.card,
      ...(displayInfo.isUrgent ? styles.urgentCard : {}),
      ...(isArchived ? styles.archivedCard : {}),
    };

    return (
      <Pressable onPress={handlePress}>
        <Card style={cardStyle}>
          <View style={styles.header}>
            <View style={styles.orderInfo}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{displayInfo.title}</Text>
                {displayInfo.isUrgent && !isArchived ? (
                  <View style={[styles.badge, styles.urgentBadge]}>
                    <Ionicons name="warning" size={12} color={colors.error} />
                  </View>
                ) : null}
              </View>
              <Text style={styles.customerName}>
                {item.customer_display || t('restaurantOrders.anonymousCustomer')}
              </Text>
              <Text style={styles.orderTime}>
                {displayInfo.isToday
                  ? t('restaurantOrders.todayAt', { time: displayInfo.time })
                  : displayInfo.date}
              </Text>
            </View>
            <StatusBadge status={item.status} />
          </View>

          <View style={styles.details}>
            {item.table_number ? (
              <View style={styles.detailItem}>
                <Ionicons
                  name="restaurant-outline"
                  size={iconSize}
                  color={colors.text.secondary}
                />
                <Text style={styles.detailText}>
                  {t('restaurantOrders.tableLabel', { number: item.table_number })}
                </Text>
              </View>
            ) : null}

            <View style={styles.detailItem}>
              <Ionicons
                name={item.order_type === 'dine_in' ? 'restaurant' : 'bag'}
                size={iconSize}
                color={colors.text.secondary}
              />
              <Text style={styles.detailText}>
                {item.order_type === 'dine_in'
                  ? t('restaurantOrders.orderType.dineIn')
                  : t('restaurantOrders.orderType.takeaway')}
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Ionicons name="receipt-outline" size={iconSize} color={colors.text.secondary} />
              <Text style={styles.detailText}>
                {t('restaurantOrders.itemsCount', { count: item.items_count ?? 0 })}
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
                  {
                    color:
                      item.payment_status === 'paid' ? colors.success : colors.warning,
                  },
                ]}
              >
                {item.payment_status === 'paid'
                  ? t('restaurantOrders.paymentStatus.paid')
                  : t('restaurantOrders.paymentStatus.unpaid')}
              </Text>
            </View>
          </View>

          {displayInfo.isActive && item.waiting_time ? (
            <View style={styles.waitingTime}>
              <Ionicons name="time-outline" size={iconSize} color={colors.warning} />
              <Text style={styles.waitingTimeText}>
                {t('restaurantOrders.estimatedTime', { minutes: item.waiting_time })}
              </Text>
            </View>
          ) : null}

          <View onStartShouldSetResponder={() => true}>{renderActions()}</View>

          <View style={styles.viewDetails}>
            <Text style={styles.viewDetailsText}>{t('restaurantOrders.viewDetails')}</Text>
            <Ionicons name="chevron-forward" size={iconSize} color={colors.primary} />
          </View>
        </Card>
      </Pressable>
    );
  },
);

// ════════════════════════════════════════════════════════════════════════════
// StatusFilters (modal historique)
// ════════════════════════════════════════════════════════════════════════════

const StatusFilters = React.memo(
  ({
    currentFilter,
    onFilterChange,
    orders,
    archivedCount,
    screenType,
  }: {
    currentFilter: string;
    onFilterChange: (filter: string) => void;
    orders: OrderList[];
    archivedCount: number;
    screenType: ScreenType;
  }) => {
    const { t } = useTranslation();
    const { colors } = useAppTheme();

    const filters = [
      { key: 'all', label: t('restaurantOrders.filters.all'), count: orders.length },
      {
        key: 'served',
        label: t('restaurantOrders.filters.served'),
        count: orders.filter(o => o.status === 'served').length,
      },
      {
        key: 'cancelled',
        label: t('restaurantOrders.filters.cancelled'),
        count: orders.filter(o => o.status === 'cancelled').length,
      },
      { key: 'archived', label: t('restaurantOrders.filters.archived'), count: archivedCount },
    ];

    const styles = useMemo(
      () => ({
        container: {
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border.light,
        },
        content: {
          paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
          paddingVertical: getResponsiveValue(SPACING.sm, screenType),
        },
        filterButton: {
          paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
          paddingVertical: getResponsiveValue(SPACING.xs, screenType),
          borderRadius: BORDER_RADIUS.lg,
          backgroundColor: colors.background,
          marginRight: getResponsiveValue(SPACING.xs, screenType),
          borderWidth: 1,
          borderColor: colors.border.light,
        },
        filterButtonActive: {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
        },
        filterButtonArchive: { borderColor: colors.text.secondary },
        filterButtonText: {
          fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
          fontWeight: '500' as const,
          color: colors.text.secondary,
        },
        filterButtonTextActive: { color: colors.text.inverse },
        filterButtonTextArchive: { color: colors.text.secondary },
      }),
      [colors, screenType],
    );

    return (
      <View style={styles.container}>
        <FlatList
          horizontal
          data={filters}
          keyExtractor={item => item.key}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.filterButton,
                currentFilter === item.key ? styles.filterButtonActive : null,
                item.key === 'archived' ? styles.filterButtonArchive : null,
              ]}
              onPress={() => onFilterChange(item.key)}
              android_ripple={{ color: colors.primary + '20', borderless: false }}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  currentFilter === item.key ? styles.filterButtonTextActive : null,
                  item.key === 'archived' && currentFilter !== item.key
                    ? styles.filterButtonTextArchive
                    : null,
                ]}
              >
                {item.label} ({item.count})
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.content}
        />
      </View>
    );
  },
);

// ════════════════════════════════════════════════════════════════════════════
// KanbanCard
// ════════════════════════════════════════════════════════════════════════════

interface KanbanCardProps {
  order: OrderList;
  column: KanbanColumnDef;
  onAdvance: (orderId: number, nextStatus: string) => Promise<void>;
  onPress: (orderId: number) => void;
  isUpdating: boolean;
}

const KanbanCard: React.FC<KanbanCardProps> = React.memo(
  ({ order, column, onAdvance, onPress, isUpdating }) => {
    const { t, i18n } = useTranslation();
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => makeKanbanStyles(colors, isDark), [colors, isDark]);

    const [localUpdating, setLocalUpdating] = useState(false);
    const elapsed = useElapsedTime(order.created_at);

    const totalFormatted = useMemo(() => {
      const value = parseFloat(String(order.total_amount || 0));
      try {
        return new Intl.NumberFormat(i18n.language, {
          style: 'currency',
          currency: 'EUR',
        }).format(value);
      } catch {
        return `${value.toFixed(2).replace('.', ',')} €`;
      }
    }, [order.total_amount, i18n.language]);

    const itemsCount = order.items_count ?? 0;
    const isPaid = order.payment_status === 'paid';

    const handleAdvance = async () => {
      if (localUpdating || isUpdating) return;
      setLocalUpdating(true);
      try {
        await onAdvance(order.id, column.nextStatus);
      } finally {
        setLocalUpdating(false);
      }
    };

    const elapsedColor =
      elapsed.urgency === 'urgent'
        ? KANBAN_RED
        : elapsed.urgency === 'warning'
          ? KANBAN_AMBER
          : colors.text.secondary;

    return (
      <Pressable
        onPress={() => onPress(order.id)}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        android_ripple={{ color: colors.primary + '10' }}
      >
        <View style={[styles.cardAccent, { backgroundColor: column.color }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.orderNumber}>#{order.order_number}</Text>
            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: column.color + '15',
                  borderColor: column.color + '40',
                },
              ]}
            >
              <Text
                style={[styles.statusChipText, { color: column.color }]}
                numberOfLines={1}
              >
                {column.chipLabel}
              </Text>
            </View>
          </View>

          {order.table_number && (
            <Text style={styles.tableLabel}>
              {t('restaurantOrders.tableLabel', { number: order.table_number })}
            </Text>
          )}
          {!order.table_number && order.order_type === 'takeaway' && (
            <Text style={styles.tableLabel}>
              {t('restaurantOrders.orderType.takeaway')}
            </Text>
          )}

          <Text style={styles.itemsLine} numberOfLines={1}>
            {t('restaurantOrders.itemsCount', { count: itemsCount })}
            {order.customer_display ? ` · ${order.customer_display}` : ''}
          </Text>

          <View style={styles.cardFooter}>
            <View style={styles.timerRow}>
              <Ionicons name="time-outline" size={12} color={elapsedColor} />
              <Text style={[styles.timerText, { color: elapsedColor }]}>{elapsed.label}</Text>
              {!isPaid && (
                <>
                  <View style={styles.dotSeparator} />
                  <Ionicons name="card-outline" size={12} color={colors.warning} />
                  <Text style={styles.unpaidText}>
                    {t('restaurantOrders.paymentStatus.unpaidShort')}
                  </Text>
                </>
              )}
            </View>
            <Text style={styles.priceText}>{totalFormatted}</Text>
          </View>

          <Pressable
            onPress={handleAdvance}
            disabled={localUpdating || isUpdating}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: column.actionColor },
              pressed && { opacity: 0.85 },
              (localUpdating || isUpdating) && { opacity: 0.6 },
            ]}
          >
            {localUpdating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.actionButtonText}>{column.actionLabel}</Text>
            )}
          </Pressable>
        </View>
      </Pressable>
    );
  },
);

// ════════════════════════════════════════════════════════════════════════════
// KanbanColumnHeader
// ════════════════════════════════════════════════════════════════════════════

const KanbanColumnHeader: React.FC<{ column: KanbanColumnDef; count: number }> = ({
  column,
  count,
}) => {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeKanbanStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.columnHeader}>
      <View style={styles.columnHeaderLeft}>
        <View style={[styles.columnDot, { backgroundColor: column.color }]} />
        <Text style={styles.columnTitle}>{column.label}</Text>
      </View>
      <View style={[styles.columnCountBadge, { backgroundColor: column.color + '15' }]}>
        <Text style={[styles.columnCountText, { color: column.color }]}>{count}</Text>
      </View>
    </View>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// KanbanBanner — bandeau navy "service en cours"
// ════════════════════════════════════════════════════════════════════════════

interface KanbanBannerProps {
  restaurantName: string | undefined;
  pendingCount: number;
  todayRevenue: number;
  onOpenHistory: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const KanbanBanner: React.FC<KanbanBannerProps> = ({
  restaurantName,
  pendingCount,
  todayRevenue,
  onOpenHistory,
  onRefresh,
  refreshing,
}) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeKanbanStyles(colors, isDark), [colors, isDark]);

  // Le bandeau est intrinsèquement sombre (navy primary stable) — on garde
  // donc des textes blancs partout. Identité visuelle "service en cours".
  const now = new Date();
  const dateStr = now.toLocaleDateString(i18n.language, { weekday: 'long' });
  const timeStr = now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const dateLabel = `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} ${timeStr}`;

  const revenueFormatted = useMemo(() => {
    try {
      return new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(todayRevenue);
    } catch {
      return `${todayRevenue.toFixed(0)} €`;
    }
  }, [todayRevenue, i18n.language]);

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 12 }]}>
      <View style={styles.bannerRow}>
        <View style={styles.bannerLeft}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {restaurantName
              ? t('restaurantOrders.banner.titleWithName', { name: restaurantName })
              : t('restaurantOrders.banner.title')}
          </Text>
          <Text style={styles.bannerSubtitle}>{dateLabel}</Text>
        </View>

        <View style={styles.bannerStats}>
          <View style={styles.bannerStatItem}>
            <Text style={styles.bannerStatValue}>{pendingCount}</Text>
            <Text style={styles.bannerStatLabel}>
              {t('restaurantOrders.banner.pending')}
            </Text>
          </View>
          <View style={[styles.bannerStatItem, styles.bannerStatItemRevenue]}>
            <Text style={[styles.bannerStatValue, { color: colors.secondary }]}>
              {revenueFormatted}
            </Text>
            <Text style={styles.bannerStatLabel}>
              {t('restaurantOrders.banner.tonight')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bannerActions}>
        <Pressable
          style={styles.bannerAction}
          onPress={onOpenHistory}
          android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
        >
          <Ionicons name="time-outline" size={16} color="#FFFFFF" />
          <Text style={styles.bannerActionText}>
            {t('restaurantOrders.banner.history')}
          </Text>
        </Pressable>
        <Pressable
          style={styles.bannerAction}
          onPress={onRefresh}
          disabled={refreshing}
          android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
        >
          <Ionicons
            name="refresh"
            size={16}
            color={refreshing ? 'rgba(255,255,255,0.5)' : '#FFFFFF'}
          />
          <Text style={[styles.bannerActionText, refreshing && { opacity: 0.5 }]}>
            {t('restaurantOrders.banner.refresh')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// ÉCRAN PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

export default function RestaurantOrdersScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { isRestaurateur, isAuthenticated } = useAuth();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeKanbanStyles(colors, isDark), [colors, isDark]);

  const KANBAN_COLUMNS = useMemo(() => getKanbanColumns(t, colors), [t, colors]);

  const [refreshing, setRefreshing] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [showHistory, setShowHistory] = useState(false);
  const [activeColumnKey, setActiveColumnKey] = useState<KanbanColumnKey>('new');

  const { alerts, pushAlert, dismissAlert } = useAlerts();
  const [paymentPrompt, setPaymentPrompt] = useState<null | { orderId: number }>(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1400 : undefined,
  };

  const useKanbanColumns = screenType !== 'mobile';

  const {
    restaurants,
    selectedRestaurantId,
    isLoadingRestaurants,
    selectRestaurant,
  } = useRestaurantSelection();

  const {
    archivedOrders,
    archiveOrder,
    unarchiveOrder,
    archiveCompletedOrders,
  } = useOrderArchiving();

  const {
    orders: allOrders,
    isLoading,
    error,
    fetchOrders,
    updateOrderStatus,
    markAsPaid,
  } = useOrder();

  const restaurantOrders = useMemo(() => {
    if (!selectedRestaurantId) return [];
    const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));
    return allOrders.filter(order => {
      if (typeof order.restaurant === 'number') {
        return order.restaurant === selectedRestaurantId;
      }
      if (!selectedRestaurant) return false;
      return order.restaurant_name === selectedRestaurant.name;
    });
  }, [allOrders, selectedRestaurantId, restaurants]);

  const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const activeOrders = useMemo(() => {
    const cutoff = Date.now() - SERVICE_WINDOW_MS;
    return restaurantOrders.filter(
      o =>
        !archivedOrders.has(o.id) &&
        ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status) &&
        new Date(o.created_at).getTime() >= cutoff,
    );
  }, [restaurantOrders, archivedOrders]);

  const kanbanGroups = useMemo(() => {
    const groups: Record<KanbanColumnKey, OrderList[]> = {
      new: [],
      preparing: [],
      ready: [],
    };
    activeOrders.forEach(order => {
      const col = KANBAN_COLUMNS.find(c => c.statuses.includes(order.status));
      if (col) groups[col.key].push(order);
    });
    Object.keys(groups).forEach(k => {
      groups[k as KanbanColumnKey].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
    return groups;
  }, [activeOrders, KANBAN_COLUMNS]);

  const pendingCount = activeOrders.length;

  const todayRevenue = useMemo(() => {
    const cutoff = Date.now() - SERVICE_WINDOW_MS;
    return restaurantOrders
      .filter(
        o =>
          new Date(o.created_at).getTime() >= cutoff &&
          o.status !== 'cancelled',
      )
      .reduce((acc, o) => acc + parseFloat(String(o.total_amount || 0)), 0);
  }, [restaurantOrders]);

  const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOrders({ page: 1, limit: 100 });
    } catch {
      pushAlert(
        'error',
        t('common.error'),
        t('restaurantOrders.feedback.refreshFailed'),
      );
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, pushAlert, t]);

  const handleStatusUpdate = useCallback(
    async (orderId: number, newStatus: string) => {
      try {
        await updateOrderStatus(orderId, newStatus);
      } catch {
        pushAlert(
          'error',
          t('common.error'),
          t('restaurantOrders.feedback.statusUpdateFailed'),
        );
      }
    },
    [updateOrderStatus, pushAlert, t],
  );

  const navigateToDetail = useCallback((orderId: number) => {
    router.push(`/order/${orderId}` as any);
  }, []);

  const openPaymentPrompt = useCallback((orderId: number) => {
    setPaymentPrompt({ orderId });
  }, []);

  const performMarkAsPaid = useCallback(
    async (orderId: number, paymentMethod: 'cash' | 'card') => {
      try {
        await markAsPaid(orderId, paymentMethod);
        pushAlert(
          'success',
          t('restaurantOrders.feedback.paidTitle'),
          t('restaurantOrders.feedback.paidMessage'),
        );
      } catch {
        pushAlert(
          'error',
          t('common.error'),
          t('restaurantOrders.feedback.markPaidFailed'),
        );
      } finally {
        setPaymentPrompt(null);
      }
    },
    [markAsPaid, pushAlert, t],
  );

  const openArchiveConfirm = useCallback(() => setArchiveConfirmOpen(true), []);

  const confirmBulkArchive = useCallback(async () => {
    try {
      const count = await archiveCompletedOrders(restaurantOrders);
      if (count > 0) {
        pushAlert(
          'success',
          t('restaurantOrders.feedback.archivedTitle'),
          t('restaurantOrders.feedback.archivedMessage', { count }),
        );
      } else {
        pushAlert(
          'info',
          t('restaurantOrders.feedback.noneToArchiveTitle'),
          t('restaurantOrders.feedback.noneToArchiveMessage'),
        );
      }
    } catch {
      pushAlert(
        'error',
        t('common.error'),
        t('restaurantOrders.feedback.archiveFailed'),
      );
    } finally {
      setArchiveConfirmOpen(false);
    }
  }, [archiveCompletedOrders, restaurantOrders, pushAlert, t]);

  useEffect(() => {
    if (isAuthenticated && isRestaurateur) {
      handleRefresh();
    }
  }, [isAuthenticated, isRestaurateur]);

  const historyOrders = useMemo(() => {
    let filtered = restaurantOrders;
    if (historyFilter === 'archived') {
      filtered = filtered.filter(o => archivedOrders.has(o.id));
    } else {
      filtered = filtered.filter(o => !archivedOrders.has(o.id));
      filtered = filtered.filter(o => ['served', 'cancelled'].includes(o.status));
      if (historyFilter !== 'all') {
        filtered = filtered.filter(o => o.status === historyFilter);
      }
    }
    return filtered;
  }, [restaurantOrders, historyFilter, archivedOrders]);

  // ── Gestion accès non autorisé ────────────────────────────────────────
  if (!isRestaurateur) {
    return (
      <View style={styles.container}>
        <Header title={t('restaurantNav.orders')} showLanguageSwitcher showThemeSwitcher />
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={colors.secondary} />
          <Text style={styles.errorText}>
            {t('restaurantOrders.forbiddenMessage')}
          </Text>
        </View>
      </View>
    );
  }

  const renderKanbanColumn = (column: KanbanColumnDef, isFullWidth = false) => {
    const orders = kanbanGroups[column.key];
    return (
      <View
        key={column.key}
        style={[
          styles.column,
          isFullWidth ? styles.columnFullWidth : null,
          { borderTopColor: column.color },
        ]}
      >
        <KanbanColumnHeader column={column} count={orders.length} />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[column.color]}
              tintColor={column.color}
            />
          }
        >
          {orders.length === 0 ? (
            <View style={styles.emptyColumn}>
              <Ionicons
                name="checkmark-circle-outline"
                size={32}
                color={colors.text.light}
              />
              <Text style={styles.emptyColumnText}>
                {t('restaurantOrders.kanban.emptyColumn')}
              </Text>
            </View>
          ) : (
            orders.map(order => (
              <KanbanCard
                key={order.id}
                order={order}
                column={column}
                onAdvance={handleStatusUpdate}
                onPress={navigateToDetail}
                isUpdating={refreshing}
              />
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  const renderMobileTabs = () => {
    const activeColumn = KANBAN_COLUMNS.find(c => c.key === activeColumnKey)!;
    return (
      <>
        <View style={styles.mobileTabs}>
          {KANBAN_COLUMNS.map(col => {
            const count = kanbanGroups[col.key].length;
            const isActive = col.key === activeColumnKey;
            return (
              <Pressable
                key={col.key}
                onPress={() => setActiveColumnKey(col.key)}
                style={[
                  styles.mobileTab,
                  isActive && {
                    backgroundColor: col.color + '15',
                    borderColor: col.color,
                  },
                ]}
                android_ripple={{ color: col.color + '20' }}
              >
                <View style={[styles.mobileTabDot, { backgroundColor: col.color }]} />
                <Text
                  style={[
                    styles.mobileTabText,
                    isActive && { color: col.color, fontWeight: '700' },
                  ]}
                >
                  {col.label}
                </Text>
                <View
                  style={[
                    styles.mobileTabBadge,
                    { backgroundColor: col.color + (isActive ? '25' : '15') },
                  ]}
                >
                  <Text style={[styles.mobileTabBadgeText, { color: col.color }]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {renderKanbanColumn(activeColumn, true)}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <KanbanBanner
        restaurantName={selectedRestaurant?.name}
        pendingCount={pendingCount}
        todayRevenue={todayRevenue}
        onOpenHistory={() => setShowHistory(true)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <RestaurantSelector
        restaurants={restaurants}
        selectedRestaurantId={selectedRestaurantId}
        onSelect={selectRestaurant}
        isLoading={isLoadingRestaurants}
        screenType={screenType}
      />

      {alerts.length > 0 && (
        <View style={{ paddingHorizontal: layoutConfig.containerPadding, paddingTop: 8 }}>
          {alerts.map(a => (
            <InlineAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id)}
            />
          ))}
        </View>
      )}

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color={colors.error} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {(isLoading || isLoadingRestaurants) && allOrders.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {isLoadingRestaurants
              ? t('restaurantOrders.loading.restaurants')
              : t('restaurantOrders.loading.orders')}
          </Text>
        </View>
      ) : (
        <View style={styles.kanbanWrapper}>
          {useKanbanColumns ? (
            <View style={styles.columnsRow}>
              {KANBAN_COLUMNS.map(col => renderKanbanColumn(col))}
            </View>
          ) : (
            renderMobileTabs()
          )}
        </View>
      )}

      {/* ─── Modal Historique ──────────────────────────────────────────── */}
      <Modal
        visible={showHistory}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowHistory(false)}
      >
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.historyHeader}>
            <Pressable onPress={() => setShowHistory(false)} hitSlop={8}>
              <Ionicons name="arrow-back" size={24} color={colors.primary} />
            </Pressable>
            <Text style={styles.historyTitle}>
              {t('restaurantOrders.history.title')}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <StatusFilters
            currentFilter={historyFilter}
            onFilterChange={setHistoryFilter}
            orders={restaurantOrders.filter(
              o =>
                !archivedOrders.has(o.id) &&
                ['served', 'cancelled'].includes(o.status),
            )}
            archivedCount={archivedOrders.size}
            screenType={screenType}
          />

          {/* Bouton archivage en masse */}
          {(() => {
            const completedToArchive = restaurantOrders.filter(
              o =>
                ['served', 'cancelled'].includes(o.status) && !archivedOrders.has(o.id),
            );
            if (completedToArchive.length === 0 || historyFilter === 'archived') {
              return null;
            }
            return (
              <View style={styles.bulkArchiveBar}>
                <Button
                  title={t('restaurantOrders.history.bulkArchive', {
                    count: completedToArchive.length,
                  })}
                  onPress={openArchiveConfirm}
                  variant="outline"
                  size="sm"
                  leftIcon={
                    <Ionicons name="archive" size={16} color={colors.text.secondary} />
                  }
                  style={{
                    borderColor: colors.text.secondary,
                    backgroundColor: 'transparent',
                  }}
                  textStyle={{ color: colors.text.secondary }}
                />
              </View>
            );
          })()}

          {historyOrders.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={colors.text.light} />
              <Text style={styles.emptyTitle}>
                {t('restaurantOrders.history.emptyTitle')}
              </Text>
              <Text style={styles.emptyMessage}>
                {historyFilter === 'archived'
                  ? t('restaurantOrders.history.emptyArchived')
                  : t('restaurantOrders.history.emptyCompleted')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={historyOrders}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{
                padding: layoutConfig.containerPadding,
                paddingBottom: 40,
              }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <OrderCard
                  item={item}
                  onStatusUpdate={handleStatusUpdate}
                  onRequestPaymentMethod={openPaymentPrompt}
                  onArchive={archiveOrder}
                  onUnarchive={unarchiveOrder}
                  isUpdating={refreshing}
                  isArchived={historyFilter === 'archived'}
                  screenType={screenType}
                />
              )}
            />
          )}
        </View>
      </Modal>

      {/* Prompt encaissement */}
      {paymentPrompt && (
        <View style={styles.bottomActionBanner}>
          <AlertWithAction
            variant="info"
            title={t('restaurantOrders.paymentPrompt.title')}
            message={t('restaurantOrders.paymentPrompt.message')}
            primaryButton={{
              text: t('restaurantOrders.paymentPrompt.cash'),
              onPress: () => performMarkAsPaid(paymentPrompt.orderId, 'cash'),
              variant: 'primary',
            }}
            secondaryButton={{
              text: t('restaurantOrders.paymentPrompt.card'),
              onPress: () => performMarkAsPaid(paymentPrompt.orderId, 'card'),
            }}
          />
        </View>
      )}

      {/* Confirmation archivage en masse */}
      {archiveConfirmOpen && (
        <View style={styles.bottomActionBanner}>
          <AlertWithAction
            variant="warning"
            title={t('restaurantOrders.archiveConfirm.title')}
            message={t('restaurantOrders.archiveConfirm.message')}
            secondaryButton={{
              text: t('common.cancel'),
              onPress: () => setArchiveConfirmOpen(false),
            }}
            primaryButton={{
              text: t('restaurantOrders.actions.archive'),
              onPress: confirmBulkArchive,
              variant: 'danger',
            }}
          />
        </View>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Styles Kanban (fabrique theme-aware)
// ════════════════════════════════════════════════════════════════════════════

const makeKanbanStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ── Bandeau navy (intrinsèquement sombre, stable) ────────────────────
    banner: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    bannerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    bannerLeft: { flex: 1 },
    bannerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: -0.3,
    },
    bannerSubtitle: {
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.7)',
      marginTop: 2,
    },
    bannerStats: { flexDirection: 'row', gap: 8 },
    bannerStatItem: {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      minWidth: 70,
    },
    bannerStatItemRevenue: { backgroundColor: 'rgba(212, 175, 55, 0.15)' },
    bannerStatValue: {
      fontSize: 20,
      fontWeight: '700',
      color: '#FFFFFF',
      lineHeight: 24,
    },
    bannerStatLabel: {
      fontSize: 10,
      color: 'rgba(255, 255, 255, 0.7)',
      marginTop: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    bannerActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    bannerAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
    },
    bannerActionText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

    // ── Kanban wrapper ──────────────────────────────────────────────────
    kanbanWrapper: { flex: 1 },
    columnsRow: { flex: 1, flexDirection: 'row', gap: 12, padding: 12 },

    column: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderTopWidth: 3,
      overflow: 'hidden',
      ...shadows.sm,
    },
    columnFullWidth: { flex: 1, margin: 12 },
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    columnHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    columnDot: { width: 8, height: 8, borderRadius: 4 },
    columnTitle: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
    columnCountBadge: {
      minWidth: 24,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    columnCountText: { fontSize: 12, fontWeight: '700' },
    emptyColumn: { alignItems: 'center', paddingVertical: 32, gap: 6 },
    emptyColumnText: { fontSize: 13, color: colors.text.light },

    // ── Kanban card ─────────────────────────────────────────────────────
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border.light,
      overflow: 'hidden',
      ...shadows.sm,
    },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, padding: 12, gap: 6 },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    orderNumber: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
    statusChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
    },
    statusChipText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    tableLabel: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    itemsLine: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
    timerText: { fontSize: 12, fontWeight: '500' },
    dotSeparator: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.text.light,
      marginHorizontal: 2,
    },
    unpaidText: { fontSize: 11, fontWeight: '600', color: colors.warning },
    priceText: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
    actionButton: {
      marginTop: 6,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

    // ── Mobile tabs ─────────────────────────────────────────────────────
    mobileTabs: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    mobileTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    mobileTabDot: { width: 6, height: 6, borderRadius: 3 },
    mobileTabText: { fontSize: 12, fontWeight: '500', color: colors.text.secondary },
    mobileTabBadge: {
      minWidth: 20,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mobileTabBadgeText: { fontSize: 10, fontWeight: '700' },

    // ── Modal historique ───────────────────────────────────────────────
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    historyTitle: {
      fontSize: 18,
      fontWeight: '700',
      // Titre en or chaud en dark — cohérent avec la migration
      color: isDark ? colors.text.golden : colors.primary,
    },
    bulkArchiveBar: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },

    // ── États génériques ───────────────────────────────────────────────
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: { fontSize: 14, color: colors.text.secondary },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      gap: 12,
    },
    errorText: {
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    errorBanner: {
      backgroundColor: colors.error + '10',
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      margin: 12,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.error + '40',
      gap: 8,
    },
    errorBannerText: { color: colors.error, fontSize: 13, flex: 1 },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
      marginTop: 8,
    },
    emptyMessage: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },

    bottomActionBanner: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      zIndex: 9999,
      elevation: 9999,
    },
  });
};