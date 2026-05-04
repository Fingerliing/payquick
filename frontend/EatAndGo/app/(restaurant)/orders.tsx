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
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

// ════════════════════════════════════════════════════════════════════════════
// Hooks utilitaires (conservés à l'identique)
// ════════════════════════════════════════════════════════════════════════════

/** ---------- Utilitaires alertes ---------- */
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
    []
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  return { alerts, pushAlert, dismissAlert };
};

/** ---------- Hook pour gérer l'archivage des commandes ---------- */
const useOrderArchiving = () => {
  const [archivedOrders, setArchivedOrders] = useState<Set<number>>(new Set());

  useEffect(() => {
    const loadArchivedOrders = async () => {
      try {
        const archived = await AsyncStorage.getItem('archivedOrders');
        if (archived) {
          setArchivedOrders(new Set(JSON.parse(archived)));
        }
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

  const archiveOrder = useCallback(async (orderId: number) => {
    const newArchived = new Set(archivedOrders);
    newArchived.add(orderId);
    setArchivedOrders(newArchived);
    await saveArchivedOrders(newArchived);
  }, [archivedOrders, saveArchivedOrders]);

  const unarchiveOrder = useCallback(async (orderId: number) => {
    const newArchived = new Set(archivedOrders);
    newArchived.delete(orderId);
    setArchivedOrders(newArchived);
    await saveArchivedOrders(newArchived);
  }, [archivedOrders, saveArchivedOrders]);

  const archiveCompletedOrders = useCallback(async (orders: OrderList[]) => {
    const completedOrderIds = orders
      .filter(order => ['served', 'cancelled'].includes(order.status))
      .map(order => order.id);

    if (completedOrderIds.length === 0) return 0;

    const newArchived = new Set([...archivedOrders, ...completedOrderIds]);
    setArchivedOrders(newArchived);
    await saveArchivedOrders(newArchived);
    return completedOrderIds.length;
  }, [archivedOrders, saveArchivedOrders]);

  return {
    archivedOrders,
    archiveOrder,
    unarchiveOrder,
    archiveCompletedOrders,
  };
};

/** ---------- Hook pour gérer la sélection de restaurant ---------- */
const useRestaurantSelection = () => {
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const { restaurants, loadRestaurants, isLoading: isLoadingRestaurants } = useRestaurant();

  useEffect(() => {
    const initializeRestaurants = async () => {
      await loadRestaurants();
    };
    initializeRestaurants();
  }, []);

  useEffect(() => {
    const restoreSelection = async () => {
      if (restaurants.length > 0 ? selectedRestaurantId === null : false) {
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

  return {
    restaurants,
    selectedRestaurantId,
    isLoadingRestaurants,
    selectRestaurant
  };
};

/** ---------- Timer "temps écoulé" mis à jour chaque seconde ---------- */
const useElapsedTime = (createdAtIso: string) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = setInterval(tick, 1000);
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
// Composants conservés (utilisés dans le modal Historique)
// ════════════════════════════════════════════════════════════════════════════

/** ---------- Composant sélecteur de restaurant ---------- */
const RestaurantSelector = React.memo(({
  restaurants,
  selectedRestaurantId,
  onSelect,
  isLoading,
  screenType
}: {
  restaurants: Restaurant[];
  selectedRestaurantId: number | null;
  onSelect: (id: number) => void;
  isLoading: boolean;
  screenType: ScreenType;
}) => {
  const [showModal, setShowModal] = useState(false);
  const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));

  const styles = {
    selector: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    selectorText: {
      flex: 1,
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end' as const,
    },
    modalContent: {
      backgroundColor: COLORS.surface,
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
      borderBottomColor: COLORS.border.light,
    },
    modalTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    restaurantOption: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    restaurantOptionSelected: {
      backgroundColor: COLORS.secondary + '10',
    },
    restaurantOptionText: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    restaurantOptionTextSelected: {
      color: COLORS.secondary,
    },
    restaurantOptionAddress: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: COLORS.text.secondary,
    },
  };

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType);

  if (isLoading) {
    return (
      <View style={styles.selector}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.selectorText}>Chargement...</Text>
      </View>
    );
  }

  if (restaurants.length === 0) {
    return (
      <View style={styles.selector}>
        <Ionicons name="warning" size={iconSize} color={COLORS.warning} />
        <Text style={styles.selectorText}>Aucun restaurant trouvé</Text>
      </View>
    );
  }

  if (restaurants.length === 1) {
    return null; // Plus besoin d'afficher le sélecteur si 1 seul resto (il est dans le bandeau navy)
  }

  return (
    <>
      <Pressable
        style={styles.selector}
        onPress={() => setShowModal(true)}
        android_ripple={{ color: COLORS.primary + '20', borderless: false }}
      >
        <Ionicons name="restaurant" size={iconSize} color={COLORS.secondary} />
        <Text style={styles.selectorText}>
          {selectedRestaurant?.name || 'Sélectionner un restaurant'}
        </Text>
        <Ionicons name="chevron-down" size={iconSize} color={COLORS.text.secondary} />
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
              <Text style={styles.modalTitle}>Choisir un restaurant</Text>
              <Pressable onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.secondary} />
              </Pressable>
            </View>
            <FlatList
              data={restaurants}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.restaurantOption,
                    item.id === String(selectedRestaurantId) ? styles.restaurantOptionSelected : null
                  ]}
                  onPress={() => {
                    onSelect(parseInt(item.id));
                    setShowModal(false);
                  }}
                  android_ripple={{ color: COLORS.primary + '20', borderless: false }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.restaurantOptionText,
                      item.id === String(selectedRestaurantId) ? styles.restaurantOptionTextSelected : null
                    ]}>
                      {item.name}
                    </Text>
                    <Text style={styles.restaurantOptionAddress}>
                      {item.address}, {item.city}
                    </Text>
                  </View>
                  {item.id === String(selectedRestaurantId) ? (
                    <Ionicons name="checkmark-circle" size={iconSize} color={COLORS.secondary} />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
});

/** ---------- Carte de commande (vue détaillée pour modal historique) ---------- */
const OrderCard = React.memo(({
  item,
  onStatusUpdate,
  onRequestPaymentMethod,
  onArchive,
  onUnarchive,
  isUpdating = false,
  isArchived = false,
  screenType
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
  const [localUpdating, setLocalUpdating] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const displayInfo = useMemo(() => {
    const date = new Date(item.created_at);
    const isActive = ['pending', 'confirmed', 'preparing', 'ready'].includes(item.status);
    const isUrgent = isActive && (Date.now() - date.getTime()) > 30 * 60 * 1000;

    return {
      title: `Commande ${item.order_number}`,
      time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      date: date.toLocaleDateString('fr-FR'),
      isActive,
      isUrgent,
      isToday: date.toDateString() === new Date().toDateString(),
    };
  }, [item]);

  const styles = {
    card: {
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: displayInfo.isActive ? COLORS.secondary : COLORS.border.light,
    },
    archivedCard: { opacity: 0.7, borderColor: COLORS.border.default },
    urgentCard: { borderColor: COLORS.error, backgroundColor: COLORS.error + '05' },
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
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    badge: {
      width: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
      height: getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    urgentBadge: { backgroundColor: COLORS.error + '20' },
    customerName: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    orderTime: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: COLORS.text.secondary,
    },
    details: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
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
      color: COLORS.text.secondary,
    },
    waitingTime: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType) / 2,
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.warning + '10',
      borderRadius: BORDER_RADIUS.sm,
    },
    waitingTimeText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: COLORS.warning,
      fontWeight: '500' as const,
    },
    actions: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    viewDetails: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    viewDetailsText: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      color: COLORS.primary,
      fontWeight: '500' as const,
    },
  };

  const iconSize = getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (localUpdating || isUpdating) return;
    setLocalUpdating(true);
    try {
      await onStatusUpdate(item.id, newStatus);
    } finally {
      setLocalUpdating(false);
    }
  }, [item.id, onStatusUpdate, localUpdating, isUpdating]);

  const handlePress = useCallback(() => {
    router.push(`/order/${item.id}` as any);
  }, [item.id]);

  const renderActions = () => {
    const isCompleted = ['served', 'cancelled'].includes(item.status);

    if (isArchived) {
      return (
        <View style={styles.actions}>
          <Button
            title="Désarchiver"
            onPress={() => onUnarchive?.(item.id)}
            disabled={isUpdating}
            variant="outline"
            size="sm"
            leftIcon={<Ionicons name="archive-outline" size={16} color={COLORS.text.secondary} />}
            fullWidth={screenType === 'mobile'}
            style={{ borderColor: COLORS.text.secondary, backgroundColor: 'transparent' }}
            textStyle={{ color: COLORS.text.secondary }}
          />
        </View>
      );
    }

    const statusFlow = {
      'pending': { next: 'confirmed', label: 'Confirmer' },
      'confirmed': { next: 'preparing', label: 'En préparation' },
      'preparing': { next: 'ready', label: 'Prêt' },
      'ready': { next: 'served', label: 'Servir' }
    };

    const nextAction = statusFlow[item.status as keyof typeof statusFlow];

    return (
      <>
        <View style={styles.actions}>
          {nextAction ? (
            <Button
              title={nextAction.label}
              onPress={() => handleStatusChange(nextAction.next)}
              disabled={localUpdating || isUpdating}
              loading={localUpdating}
              style={{ backgroundColor: COLORS.secondary }}
              textStyle={{ color: COLORS.text.primary }}
              size="sm"
              leftIcon={<Ionicons name="arrow-forward" size={16} color={COLORS.text.secondary} />}
              fullWidth={screenType === 'mobile'}
            />
          ) : null}

          {item.payment_status !== 'paid' && !isCompleted ? (
            <Button
              title="Encaisser"
              onPress={() => onRequestPaymentMethod(item.id)}
              disabled={localUpdating || isUpdating}
              variant="outline"
              size="sm"
              leftIcon={<Ionicons name="card" size={16} color={COLORS.text.secondary} />}
              fullWidth={screenType === 'mobile'}
              style={{ borderColor: COLORS.success, backgroundColor: 'transparent' }}
              textStyle={{ color: COLORS.success }}
            />
          ) : null}

          {!isCompleted ? (
            <Button
              title="Annuler"
              onPress={() => setCancelConfirm(true)}
              disabled={localUpdating || isUpdating}
              variant="outline"
              size="sm"
              leftIcon={<Ionicons name="close-circle" size={16} color={COLORS.error} />}
              fullWidth={screenType === 'mobile'}
              style={{ borderColor: COLORS.error, backgroundColor: 'transparent' }}
              textStyle={{ color: COLORS.error }}
            />
          ) : null}

          {isCompleted && onArchive ? (
            <Button
              title="Archiver"
              onPress={() => onArchive(item.id)}
              disabled={isUpdating}
              variant="outline"
              size="sm"
              leftIcon={<Ionicons name="archive" size={16} color={COLORS.text.secondary} />}
              fullWidth={screenType === 'mobile'}
              style={{ borderColor: COLORS.text.secondary, backgroundColor: 'transparent' }}
              textStyle={{ color: COLORS.text.secondary }}
            />
          ) : null}
        </View>

        {cancelConfirm && (
          <View style={{ paddingHorizontal: getResponsiveValue(SPACING.xs, screenType), paddingTop: getResponsiveValue(SPACING.xs, screenType) }}>
            <AlertWithAction
              variant="warning"
              title="Annuler la commande"
              message={`Voulez-vous vraiment annuler la commande ${item.order_number} ?`}
              secondaryButton={{ text: 'Non, garder', onPress: () => setCancelConfirm(false) }}
              primaryButton={{
                text: 'Oui, annuler',
                onPress: () => { setCancelConfirm(false); handleStatusChange('cancelled'); },
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
                  <Ionicons name="warning" size={12} color={COLORS.error} />
                </View>
              ) : null}
            </View>
            <Text style={styles.customerName}>
              {item.customer_display || 'Client anonyme'}
            </Text>
            <Text style={styles.orderTime}>
              {displayInfo.isToday ? `Aujourd'hui à ${displayInfo.time}` : displayInfo.date}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>

        <View style={styles.details}>
          {item.table_number ? (
            <View style={styles.detailItem}>
              <Ionicons name="restaurant-outline" size={iconSize} color={COLORS.text.secondary} />
              <Text style={styles.detailText}>Table {item.table_number}</Text>
            </View>
          ) : null}

          <View style={styles.detailItem}>
            <Ionicons name={item.order_type === 'dine_in' ? 'restaurant' : 'bag'} size={iconSize} color={COLORS.text.secondary} />
            <Text style={styles.detailText}>
              {item.order_type === 'dine_in' ? 'Sur place' : 'À emporter'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons name="receipt-outline" size={iconSize} color={COLORS.text.secondary} />
            <Text style={styles.detailText}>
              {item.items_count ?? 0} article{(item.items_count ?? 0) > 1 ? 's' : ''}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons name={item.payment_status === 'paid' ? 'checkmark-circle' : 'time'} size={iconSize} color={item.payment_status === 'paid' ? COLORS.success : COLORS.warning} />
            <Text style={[styles.detailText, { color: item.payment_status === 'paid' ? COLORS.success : COLORS.warning }]}>
              {item.payment_status === 'paid' ? 'Payée' : 'Non payée'}
            </Text>
          </View>
        </View>

        {displayInfo.isActive && item.waiting_time ? (
          <View style={styles.waitingTime}>
            <Ionicons name="time-outline" size={iconSize} color={COLORS.warning} />
            <Text style={styles.waitingTimeText}>
              Temps estimé : {item.waiting_time} min
            </Text>
          </View>
        ) : null}

        <View onStartShouldSetResponder={() => true}>
          {renderActions()}
        </View>

        <View style={styles.viewDetails}>
          <Text style={styles.viewDetailsText}>Voir les détails</Text>
          <Ionicons name="chevron-forward" size={iconSize} color={COLORS.primary} />
        </View>
      </Card>
    </Pressable>
  );
});

/** ---------- Filtres par statut (modal historique uniquement) ---------- */
const StatusFilters = React.memo(({
  currentFilter,
  onFilterChange,
  orders,
  archivedCount,
  screenType
}: {
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  orders: OrderList[];
  archivedCount: number;
  screenType: ScreenType;
}) => {
  const filters = [
    { key: 'all', label: 'Toutes', count: orders.length },
    { key: 'served', label: 'Servies', count: orders.filter(o => o.status === 'served').length },
    { key: 'cancelled', label: 'Annulées', count: orders.filter(o => o.status === 'cancelled').length },
    { key: 'archived', label: 'Archives', count: archivedCount },
  ];

  const styles = {
    container: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border.light },
    content: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    filterButton: {
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.background,
      marginRight: getResponsiveValue(SPACING.xs, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    filterButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
    filterButtonArchive: { borderColor: COLORS.text.secondary },
    filterButtonText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '500' as const,
      color: COLORS.text.secondary,
    },
    filterButtonTextActive: { color: COLORS.surface },
    filterButtonTextArchive: { color: COLORS.text.secondary },
  };

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
              item.key === 'archived' ? styles.filterButtonArchive : null
            ]}
            onPress={() => onFilterChange(item.key)}
            android_ripple={{ color: COLORS.primary + '20', borderless: false }}
          >
            <Text style={[
              styles.filterButtonText,
              currentFilter === item.key ? styles.filterButtonTextActive : null,
              item.key === 'archived' && currentFilter !== item.key ? styles.filterButtonTextArchive : null
            ]}>
              {item.label} ({item.count})
            </Text>
          </Pressable>
        )}
        contentContainerStyle={styles.content}
      />
    </View>
  );
});

// ════════════════════════════════════════════════════════════════════════════
// NOUVEAUX COMPOSANTS — Vue Kanban
// ════════════════════════════════════════════════════════════════════════════

type KanbanColumnKey = 'new' | 'preparing' | 'ready';

interface KanbanColumnDef {
  key: KanbanColumnKey;
  label: string;
  color: string;          // accent color
  bgTint: string;         // light bg for column header
  statuses: string[];     // Status that fall into this column
  nextStatus: string;     // status après l'action
  actionLabel: string;    // label du bouton d'action
  actionColor: string;    // couleur du bouton
}

const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    key: 'new',
    label: 'Nouvelles',
    color: '#EF4444',
    bgTint: '#FEF2F2',
    statuses: ['pending', 'confirmed'],
    nextStatus: 'preparing',
    actionLabel: 'Commencer',
    actionColor: '#1E2A78', // navy primary
  },
  {
    key: 'preparing',
    label: 'En préparation',
    color: '#F59E0B',
    bgTint: '#FFFBEB',
    statuses: ['preparing'],
    nextStatus: 'ready',
    actionLabel: 'Marquer prête',
    actionColor: '#10B981', // green
  },
  {
    key: 'ready',
    label: 'Prêtes',
    color: '#10B981',
    bgTint: '#ECFDF5',
    statuses: ['ready'],
    nextStatus: 'served',
    actionLabel: 'Servie',
    actionColor: '#1E2A78',
  },
];

/** Card kanban (compacte, accent coloré à gauche) */
interface KanbanCardProps {
  order: OrderList;
  column: KanbanColumnDef;
  onAdvance: (orderId: number, nextStatus: string) => Promise<void>;
  onPress: (orderId: number) => void;
  isUpdating: boolean;
}

const KanbanCard: React.FC<KanbanCardProps> = React.memo(({ order, column, onAdvance, onPress, isUpdating }) => {
  const [localUpdating, setLocalUpdating] = useState(false);
  const elapsed = useElapsedTime(order.created_at);

  const totalFormatted = `${parseFloat(String(order.total_amount || 0)).toFixed(2).replace('.', ',')} €`;
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
    elapsed.urgency === 'urgent' ? '#EF4444' :
    elapsed.urgency === 'warning' ? '#F59E0B' :
    '#6B7280';

  return (
    <Pressable
      onPress={() => onPress(order.id)}
      style={({ pressed }) => [kanbanStyles.card, pressed && { opacity: 0.85 }]}
      android_ripple={{ color: COLORS.primary + '10' }}
    >
      {/* Accent coloré à gauche */}
      <View style={[kanbanStyles.cardAccent, { backgroundColor: column.color }]} />

      <View style={kanbanStyles.cardBody}>
        {/* Header : #N° + badge statut */}
        <View style={kanbanStyles.cardHeader}>
          <Text style={kanbanStyles.orderNumber}>#{order.order_number}</Text>
          <View style={[kanbanStyles.statusChip, { backgroundColor: column.color + '15', borderColor: column.color + '40' }]}>
            <Text style={[kanbanStyles.statusChipText, { color: column.color }]} numberOfLines={1}>
              {column.label === 'Nouvelles' ? 'Nouvelle' : column.label === 'En préparation' ? 'En préparation' : 'Prête'}
            </Text>
          </View>
        </View>

        {/* Table */}
        {order.table_number && (
          <Text style={kanbanStyles.tableLabel}>Table {order.table_number}</Text>
        )}
        {!order.table_number && order.order_type === 'takeaway' && (
          <Text style={kanbanStyles.tableLabel}>À emporter</Text>
        )}

        {/* Nombre d'articles (placeholder en attendant items_preview backend) */}
        <Text style={kanbanStyles.itemsLine} numberOfLines={1}>
          {itemsCount} article{itemsCount > 1 ? 's' : ''}
          {order.customer_display ? ` · ${order.customer_display}` : ''}
        </Text>

        {/* Footer : timer + prix + paiement */}
        <View style={kanbanStyles.cardFooter}>
          <View style={kanbanStyles.timerRow}>
            <Ionicons name="time-outline" size={12} color={elapsedColor} />
            <Text style={[kanbanStyles.timerText, { color: elapsedColor }]}>
              {elapsed.label}
            </Text>
            {!isPaid && (
              <>
                <View style={kanbanStyles.dotSeparator} />
                <Ionicons name="card-outline" size={12} color={COLORS.warning} />
                <Text style={kanbanStyles.unpaidText}>Non payé</Text>
              </>
            )}
          </View>
          <Text style={kanbanStyles.priceText}>{totalFormatted}</Text>
        </View>

        {/* Bouton d'action */}
        <Pressable
          onPress={handleAdvance}
          disabled={localUpdating || isUpdating}
          style={({ pressed }) => [
            kanbanStyles.actionButton,
            { backgroundColor: column.actionColor },
            pressed && { opacity: 0.85 },
            (localUpdating || isUpdating) && { opacity: 0.6 },
          ]}
        >
          {localUpdating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={kanbanStyles.actionButtonText}>{column.actionLabel}</Text>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
});

/** Header d'une colonne (badge couleur + titre + compteur) */
const KanbanColumnHeader: React.FC<{ column: KanbanColumnDef; count: number }> = ({ column, count }) => (
  <View style={kanbanStyles.columnHeader}>
    <View style={kanbanStyles.columnHeaderLeft}>
      <View style={[kanbanStyles.columnDot, { backgroundColor: column.color }]} />
      <Text style={kanbanStyles.columnTitle}>{column.label}</Text>
    </View>
    <View style={[kanbanStyles.columnCountBadge, { backgroundColor: column.color + '15' }]}>
      <Text style={[kanbanStyles.columnCountText, { color: column.color }]}>{count}</Text>
    </View>
  </View>
);

/** Bandeau navy en haut avec titre, date, stats et bouton historique */
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
  const insets = useSafeAreaInsets();
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long' });
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} ${timeStr}`;

  return (
    <View style={[kanbanStyles.banner, { paddingTop: insets.top + 12 }]}>
      <View style={kanbanStyles.bannerRow}>
        <View style={kanbanStyles.bannerLeft}>
          <Text style={kanbanStyles.bannerTitle} numberOfLines={1}>
            {restaurantName ? `${restaurantName} — Service en cours` : 'Service en cours'}
          </Text>
          <Text style={kanbanStyles.bannerSubtitle}>{dateLabel}</Text>
        </View>

        <View style={kanbanStyles.bannerStats}>
          <View style={kanbanStyles.bannerStatItem}>
            <Text style={kanbanStyles.bannerStatValue}>{pendingCount}</Text>
            <Text style={kanbanStyles.bannerStatLabel}>En attente</Text>
          </View>
          <View style={[kanbanStyles.bannerStatItem, kanbanStyles.bannerStatItemRevenue]}>
            <Text style={[kanbanStyles.bannerStatValue, { color: COLORS.secondary }]}>
              {todayRevenue.toFixed(0)} €
            </Text>
            <Text style={kanbanStyles.bannerStatLabel}>Ce soir</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={kanbanStyles.bannerActions}>
        <Pressable
          style={kanbanStyles.bannerAction}
          onPress={onOpenHistory}
          android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
        >
          <Ionicons name="time-outline" size={16} color="#FFFFFF" />
          <Text style={kanbanStyles.bannerActionText}>Historique</Text>
        </Pressable>
        <Pressable
          style={kanbanStyles.bannerAction}
          onPress={onRefresh}
          disabled={refreshing}
          android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
        >
          <Ionicons name="refresh" size={16} color={refreshing ? 'rgba(255,255,255,0.5)' : '#FFFFFF'} />
          <Text style={[kanbanStyles.bannerActionText, refreshing && { opacity: 0.5 }]}>Actualiser</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// Écran principal
// ════════════════════════════════════════════════════════════════════════════

export default function RestaurantOrdersScreen() {
  const { isRestaurateur, isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // Filtre du modal historique
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [showHistory, setShowHistory] = useState(false);

  // Onglet kanban actif (mobile)
  const [activeColumnKey, setActiveColumnKey] = useState<KanbanColumnKey>('new');

  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Gestion des alertes (bannières)
  const { alerts, pushAlert, dismissAlert } = useAlerts();

  // Demande choix de paiement (depuis le modal historique uniquement)
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
    selectRestaurant
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
    markAsPaid
  } = useOrder();

  // Filtrer les commandes par restaurant sélectionné
  // ⚠️ Tant qu'aucun restaurant n'est sélectionné, on renvoie [] et non `allOrders`,
  // sinon on compte les commandes de TOUS les restaurants pendant l'init.
  const restaurantOrders = useMemo(() => {
    if (!selectedRestaurantId) return [];
    const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));
    if (!selectedRestaurant) return [];
    return allOrders.filter(order => order.restaurant_name === selectedRestaurant.name);
  }, [allOrders, selectedRestaurantId, restaurants]);

  // Commandes actives (kanban) : exclure servies, annulées et archivées
  // + filtrage temporel : on ne montre que les commandes des dernières 24h
  // pour éviter d'afficher des commandes "fantômes" en pending/confirmed
  // qui n'auraient jamais été avancées.
  const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const activeOrders = useMemo(() => {
    const cutoff = Date.now() - SERVICE_WINDOW_MS;
    return restaurantOrders.filter(o =>
      !archivedOrders.has(o.id) &&
      ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status) &&
      new Date(o.created_at).getTime() >= cutoff
    );
  }, [restaurantOrders, archivedOrders]);

  // Regroupement par colonne kanban
  const kanbanGroups = useMemo(() => {
    const groups: Record<KanbanColumnKey, OrderList[]> = { new: [], preparing: [], ready: [] };
    activeOrders.forEach(order => {
      const col = KANBAN_COLUMNS.find(c => c.statuses.includes(order.status));
      if (col) groups[col.key].push(order);
    });
    // Tri par ancienneté (plus vieux en premier — urgent en haut)
    Object.keys(groups).forEach(k => {
      groups[k as KanbanColumnKey].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
    return groups;
  }, [activeOrders]);

  // Stats du bandeau navy
  const pendingCount = activeOrders.length;

  const todayRevenue = useMemo(() => {
    const cutoff = Date.now() - SERVICE_WINDOW_MS;
    return restaurantOrders
      .filter(o =>
        new Date(o.created_at).getTime() >= cutoff &&
        o.status !== 'cancelled'
      )
      .reduce((acc, o) => acc + parseFloat(String(o.total_amount || 0)), 0);
  }, [restaurantOrders]);

  const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOrders({ page: 1, limit: 100 });
    } catch (err) {
      console.error('Error refreshing orders:', err);
      pushAlert('error', 'Erreur', 'Impossible d\'actualiser les commandes');
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, pushAlert]);

  const handleStatusUpdate = useCallback(async (orderId: number, newStatus: string) => {
    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (err) {
      console.error('Error updating status:', err);
      pushAlert('error', 'Erreur', 'Impossible de mettre à jour le statut de la commande');
    }
  }, [updateOrderStatus, pushAlert]);

  const navigateToDetail = useCallback((orderId: number) => {
    router.push(`/order/${orderId}` as any);
  }, []);

  const openPaymentPrompt = useCallback((orderId: number) => {
    setPaymentPrompt({ orderId });
  }, []);

  const performMarkAsPaid = useCallback(async (orderId: number, paymentMethod: 'cash' | 'card') => {
    try {
      await markAsPaid(orderId, paymentMethod);
      pushAlert('success', 'Encaissement', 'La commande a été marquée comme payée');
    } catch (err) {
      console.error('Error marking as paid:', err);
      pushAlert('error', 'Erreur', 'Impossible de marquer la commande comme payée');
    } finally {
      setPaymentPrompt(null);
    }
  }, [markAsPaid, pushAlert]);

  const openArchiveConfirm = useCallback(() => setArchiveConfirmOpen(true), []);

  const confirmBulkArchive = useCallback(async () => {
    try {
      const count = await archiveCompletedOrders(restaurantOrders);
      if (count > 0) {
        pushAlert('success', 'Succès', `${count} commande(s) archivée(s)`);
      } else {
        pushAlert('info', 'Information', 'Aucune commande à archiver');
      }
    } catch (err) {
      console.error('Error bulk archiving:', err);
      pushAlert('error', 'Erreur', 'Impossible d\'archiver les commandes');
    } finally {
      setArchiveConfirmOpen(false);
    }
  }, [archiveCompletedOrders, restaurantOrders, pushAlert]);

  // Charger les commandes au montage
  useEffect(() => {
    if (isAuthenticated && isRestaurateur) {
      handleRefresh();
    }
  }, [isAuthenticated, isRestaurateur]);

  // ── Filtré pour l'historique ──────────────────────────────────────────────

  // L'historique montre uniquement les commandes terminées (servies, annulées, archivées)
  const historyOrders = useMemo(() => {
    let filtered = restaurantOrders;
    if (historyFilter === 'archived') {
      filtered = filtered.filter(o => archivedOrders.has(o.id));
    } else {
      filtered = filtered.filter(o => !archivedOrders.has(o.id));
      // Par défaut on ne montre que les terminées
      filtered = filtered.filter(o => ['served', 'cancelled'].includes(o.status));
      if (historyFilter !== 'all') {
        filtered = filtered.filter(o => o.status === historyFilter);
      }
    }
    return filtered;
  }, [restaurantOrders, historyFilter, archivedOrders]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const insets = useSafeAreaInsets();

  // Gestion accès non autorisé
  if (!isRestaurateur) {
    return (
      <View style={kanbanStyles.container}>
        <Header title="Commandes" />
        <View style={kanbanStyles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={64} color={COLORS.secondary} />
          <Text style={kanbanStyles.errorText}>Accès réservé aux restaurateurs</Text>
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
          kanbanStyles.column,
          isFullWidth ? kanbanStyles.columnFullWidth : null,
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
            <View style={kanbanStyles.emptyColumn}>
              <Ionicons name="checkmark-circle-outline" size={32} color={COLORS.text.light} />
              <Text style={kanbanStyles.emptyColumnText}>Rien ici</Text>
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
        <View style={kanbanStyles.mobileTabs}>
          {KANBAN_COLUMNS.map(col => {
            const count = kanbanGroups[col.key].length;
            const isActive = col.key === activeColumnKey;
            return (
              <Pressable
                key={col.key}
                onPress={() => setActiveColumnKey(col.key)}
                style={[
                  kanbanStyles.mobileTab,
                  isActive && { backgroundColor: col.color + '15', borderColor: col.color },
                ]}
                android_ripple={{ color: col.color + '20' }}
              >
                <View style={[kanbanStyles.mobileTabDot, { backgroundColor: col.color }]} />
                <Text style={[kanbanStyles.mobileTabText, isActive && { color: col.color, fontWeight: '700' }]}>
                  {col.label}
                </Text>
                <View style={[kanbanStyles.mobileTabBadge, { backgroundColor: col.color + (isActive ? '25' : '15') }]}>
                  <Text style={[kanbanStyles.mobileTabBadgeText, { color: col.color }]}>{count}</Text>
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
    <View style={kanbanStyles.container}>
      {/* Bandeau navy custom (remplace le Header standard) */}
      <KanbanBanner
        restaurantName={selectedRestaurant?.name}
        pendingCount={pendingCount}
        todayRevenue={todayRevenue}
        onOpenHistory={() => setShowHistory(true)}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Sélecteur de restaurant (uniquement si plusieurs) */}
      <RestaurantSelector
        restaurants={restaurants}
        selectedRestaurantId={selectedRestaurantId}
        onSelect={selectRestaurant}
        isLoading={isLoadingRestaurants}
        screenType={screenType}
      />

      {/* Bannières d'alertes */}
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

      {/* Erreur API */}
      {error ? (
        <View style={kanbanStyles.errorBanner}>
          <Ionicons name="warning" size={16} color={COLORS.error} />
          <Text style={kanbanStyles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Loading initial */}
      {(isLoading || isLoadingRestaurants) && allOrders.length === 0 ? (
        <View style={kanbanStyles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={kanbanStyles.loadingText}>
            {isLoadingRestaurants ? 'Chargement des restaurants...' : 'Chargement des commandes...'}
          </Text>
        </View>
      ) : (
        // Vue kanban
        <View style={kanbanStyles.kanbanWrapper}>
          {useKanbanColumns ? (
            <View style={kanbanStyles.columnsRow}>
              {KANBAN_COLUMNS.map(col => renderKanbanColumn(col))}
            </View>
          ) : (
            renderMobileTabs()
          )}
        </View>
      )}

      {/* ─── Modal Historique ─────────────────────────────────────────────── */}
      <Modal
        visible={showHistory}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowHistory(false)}
      >
        <View style={[kanbanStyles.container, { paddingTop: insets.top }]}>
          <View style={kanbanStyles.historyHeader}>
            <Pressable onPress={() => setShowHistory(false)} hitSlop={8}>
              <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
            </Pressable>
            <Text style={kanbanStyles.historyTitle}>Historique des commandes</Text>
            <View style={{ width: 24 }} />
          </View>

          <StatusFilters
            currentFilter={historyFilter}
            onFilterChange={setHistoryFilter}
            orders={restaurantOrders.filter(o => !archivedOrders.has(o.id) && ['served', 'cancelled'].includes(o.status))}
            archivedCount={archivedOrders.size}
            screenType={screenType}
          />

          {/* Bouton archivage en masse */}
          {(() => {
            const completedToArchive = restaurantOrders.filter(o =>
              ['served', 'cancelled'].includes(o.status) && !archivedOrders.has(o.id)
            );
            if (completedToArchive.length === 0 || historyFilter === 'archived') return null;
            return (
              <View style={kanbanStyles.bulkArchiveBar}>
                <Button
                  title={`Archiver les ${completedToArchive.length} commande(s) terminée(s)`}
                  onPress={openArchiveConfirm}
                  variant="outline"
                  size="sm"
                  leftIcon={<Ionicons name="archive" size={16} color={COLORS.text.secondary} />}
                  style={{ borderColor: COLORS.text.secondary, backgroundColor: 'transparent' }}
                  textStyle={{ color: COLORS.text.secondary }}
                />
              </View>
            );
          })()}

          {historyOrders.length === 0 ? (
            <View style={kanbanStyles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={COLORS.text.light} />
              <Text style={kanbanStyles.emptyTitle}>Aucune commande</Text>
              <Text style={kanbanStyles.emptyMessage}>
                {historyFilter === 'archived'
                  ? 'Aucune commande archivée'
                  : 'Aucune commande terminée pour le moment'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={historyOrders}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: layoutConfig.containerPadding, paddingBottom: 40 }}
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
        <View style={kanbanStyles.bottomActionBanner}>
          <AlertWithAction
            variant="info"
            title="Marquer comme payée"
            message="Quelle méthode de paiement ?"
            primaryButton={{
              text: 'Espèces',
              onPress: () => performMarkAsPaid(paymentPrompt.orderId, 'cash'),
              variant: 'primary',
            }}
            secondaryButton={{
              text: 'Carte',
              onPress: () => performMarkAsPaid(paymentPrompt.orderId, 'card'),
            }}
          />
        </View>
      )}

      {/* Confirmation archivage en masse */}
      {archiveConfirmOpen && (
        <View style={kanbanStyles.bottomActionBanner}>
          <AlertWithAction
            variant="warning"
            title="Archiver les commandes terminées"
            message="Voulez-vous archiver toutes les commandes servies et annulées ?"
            secondaryButton={{ text: 'Annuler', onPress: () => setArchiveConfirmOpen(false) }}
            primaryButton={{
              text: 'Archiver',
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
// Styles Kanban
// ════════════════════════════════════════════════════════════════════════════

const kanbanStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── Bandeau navy ────────────────────────────────────────────────────────
  banner: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bannerLeft: {
    flex: 1,
  },
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
  bannerStats: {
    flexDirection: 'row',
    gap: 8,
  },
  bannerStatItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    minWidth: 70,
  },
  bannerStatItemRevenue: {
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
  },
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
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  bannerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  bannerActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Wrapper kanban ──────────────────────────────────────────────────────
  kanbanWrapper: {
    flex: 1,
  },
  columnsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },

  // ── Colonne ─────────────────────────────────────────────────────────────
  column: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderTopWidth: 3,
    overflow: 'hidden',
    shadowColor: COLORS.shadow.default,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  columnFullWidth: {
    flex: 1,
    margin: 12,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  columnHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  columnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  columnCountBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnCountText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyColumn: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyColumnText: {
    fontSize: 13,
    color: COLORS.text.light,
  },

  // ── Card kanban ─────────────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border.light,
    overflow: 'hidden',
    shadowColor: COLORS.shadow.default,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardAccent: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  tableLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  itemsLine: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  dotSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.text.light,
    marginHorizontal: 2,
  },
  unpaidText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.warning,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  actionButton: {
    marginTop: 6,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Mobile tabs ─────────────────────────────────────────────────────────
  mobileTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
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
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  mobileTabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mobileTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  mobileTabBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileTabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Modal historique ────────────────────────────────────────────────────
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  bulkArchiveBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },

  // ── États génériques ────────────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: COLORS.error + '10',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    margin: 12,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.error + '40',
    gap: 8,
  },
  errorBannerText: {
    color: COLORS.error,
    fontSize: 13,
    flex: 1,
  },
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
    color: COLORS.text.primary,
    marginTop: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
  },

  // ── Banner d'action en bas (paymentPrompt / archiveConfirm) ─────────────
  bottomActionBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 9999,
    elevation: 9999,
  },
});