import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  BORDER_RADIUS 
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

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
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
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
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
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
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    restaurantOptionTextSelected: {
      color: COLORS.secondary,
    },

    restaurantOptionAddress: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 20, tablet: 22, desktop: 24 },
    screenType
  );

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
    return (
      <View style={styles.selector}>
        <Ionicons name="restaurant" size={iconSize} color={COLORS.secondary} />
        <Text style={styles.selectorText}>{restaurants[0].name}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable 
        style={styles.selector}
        onPress={() => setShowModal(true)}
        android_ripple={{ 
          color: COLORS.primary + '20',
          borderless: false 
        }}
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
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
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
                  android_ripple={{ 
                    color: COLORS.primary + '20',
                    borderless: false 
                  }}
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
        </View>
      </Modal>
    </>
  );
});

/** ---------- Carte de commande ---------- */
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

    archivedCard: {
      opacity: 0.7,
      borderColor: COLORS.border.default,
    },

    urgentCard: {
      borderColor: COLORS.error,
      backgroundColor: COLORS.error + '05',
    },

    header: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },

    orderInfo: {
      flex: 1,
    },

    titleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    title: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    badge: {
      width: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      height: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      borderRadius: getResponsiveValue(
        { mobile: 10, tablet: 11, desktop: 12 },
        screenType
      ),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    urgentBadge: {
      backgroundColor: COLORS.error + '20',
    },

    customerName: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
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
      gap: getResponsiveValue(SPACING.xs, screenType) / 2,
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.warning + '10',
      borderRadius: BORDER_RADIUS.sm,
    },

    waitingTimeText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
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
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.primary,
      fontWeight: '500' as const,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 18, desktop: 20 },
    screenType
  );

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
            style={{ 
              borderColor: COLORS.text.secondary,
              backgroundColor: 'transparent' 
            }}
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
          style={{ 
            borderColor: COLORS.success,
            backgroundColor: 'transparent' 
          }}
          textStyle={{ color: COLORS.success }}
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
          style={{ 
            borderColor: COLORS.text.secondary,
            backgroundColor: 'transparent' 
          }}
          textStyle={{ color: COLORS.text.secondary }}
        />
      ) : null}
      </View>
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
            <Ionicons name="receipt-outline" size={iconSize} color={COLORS.text.secondary} />
            <Text style={styles.detailText}>
              {item.items_count ?? 0} article{(item.items_count ?? 0) > 1 ? 's' : ''}
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

        {renderActions()}

        <View style={styles.viewDetails}>
          <Text style={styles.viewDetailsText}>Voir les détails</Text>
          <Ionicons name="chevron-forward" size={iconSize} color={COLORS.primary} />
        </View>
      </Card>
    </Pressable>
  );
});

/** ---------- Filtres par statut ---------- */
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
    { key: 'all', label: 'Actives', count: orders.length },
    { key: 'pending', label: 'En attente', count: orders.filter(o => o.status === 'pending').length },
    { key: 'confirmed', label: 'Confirmées', count: orders.filter(o => o.status === 'confirmed').length },
    { key: 'preparing', label: 'En préparation', count: orders.filter(o => o.status === 'preparing').length },
    { key: 'ready', label: 'Prêtes', count: orders.filter(o => o.status === 'ready').length },
    { key: 'served', label: 'Servies', count: orders.filter(o => o.status === 'served').length },
    { key: 'archived', label: 'Archives', count: archivedCount },
  ];

  const styles = {
    container: {
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },

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

    filterButtonActive: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },

    filterButtonArchive: {
      borderColor: COLORS.text.secondary,
    },

    filterButtonText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '500' as const,
      color: COLORS.text.secondary,
    },

    filterButtonTextActive: {
      color: COLORS.surface,
    },

    filterButtonTextArchive: {
      color: COLORS.text.secondary,
    },
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
            android_ripple={{ 
              color: COLORS.primary + '20',
              borderless: false 
            }}
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

/** ---------- Écran principal ---------- */
export default function RestaurantOrdersScreen() {
  const { isRestaurateur, isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  
  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Gestion des alertes (bannières)
  const { alerts, pushAlert, dismissAlert } = useAlerts();

  // Demande choix de paiement
  const [paymentPrompt, setPaymentPrompt] = useState<null | { orderId: number }>(null);

  // Confirmation d'archivage en masse
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1200 : undefined,
    isTabletLandscape: screenType === 'tablet' && width > 1000,
  };
  
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
  const restaurantOrders = useMemo(() => {
    if (!selectedRestaurantId) return allOrders;
    
    const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));
    if (!selectedRestaurant) return allOrders;
    
    return allOrders.filter(order => order.restaurant_name === selectedRestaurant.name);
  }, [allOrders, selectedRestaurantId, restaurants]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOrders({
        page: 1,
        limit: 100,
      });
    } catch (err) {
      console.error('Error refreshing orders:', err);
      pushAlert('error', 'Erreur', 'Impossible d’actualiser les commandes');
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders, pushAlert]);

  // Filtrer par statut et archivage
  const filteredOrders = useMemo(() => {
    let filtered = restaurantOrders;

    if (filter === 'archived') {
      filtered = filtered.filter(order => archivedOrders.has(order.id));
    } else {
      filtered = filtered.filter(order => !archivedOrders.has(order.id));
    }

    if (filter !== 'all' && filter !== 'archived') {
      filtered = filtered.filter(order => order.status === filter);
    }

    return filtered;
  }, [restaurantOrders, filter, archivedOrders]);

  const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));

  const handleStatusUpdate = useCallback(async (orderId: number, newStatus: string) => {
    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (err) {
      console.error('Error updating status:', err);
      pushAlert('error', 'Erreur', 'Impossible de mettre à jour le statut de la commande');
    }
  }, [updateOrderStatus, pushAlert]);

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

  const openArchiveConfirm = useCallback(() => {
    setArchiveConfirmOpen(true);
  }, []);

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
      pushAlert('error', 'Erreur', 'Impossible d’archiver les commandes');
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

  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    content: {
      padding: layoutConfig.containerPadding,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    sectionHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    sectionTitle: {
      fontSize: getResponsiveValue(
        { mobile: 20, tablet: 24, desktop: 28 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },

    headerActions: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    emptyContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(
        { mobile: 40, tablet: 60, desktop: 80 },
        screenType
      ),
    },

    emptyIcon: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },

    emptyTitle: {
      fontSize: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },

    emptyMessage: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 22, tablet: 24, desktop: 26 },
        screenType
      ),
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
      margin: layoutConfig.containerPadding,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.error + '40',
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

    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },

    loadingText: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.secondary,
    },

    alertsContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 64, tablet: 80, desktop: 96 },
    screenType
  );

  // Gestion des erreurs d'accès
  if (!isRestaurateur) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Commandes" />
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={iconSize} color={COLORS.secondary} />
          <Text style={styles.errorText}>Accès réservé aux restaurateurs</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderContent = () => {
    if (!selectedRestaurantId && !isLoadingRestaurants) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="restaurant-outline" size={iconSize} color={COLORS.secondary} />
          </View>
          <Text style={styles.emptyTitle}>Aucun restaurant sélectionné</Text>
          <Text style={styles.emptyMessage}>
            Sélectionnez un restaurant pour voir les commandes
          </Text>
        </View>
      );
    }

    if (restaurantOrders.length === 0 && !isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Ionicons name="receipt-outline" size={iconSize} color={COLORS.secondary} />
          </View>
          <Text style={styles.emptyTitle}>Aucune commande</Text>
          <Text style={styles.emptyMessage}>
            {selectedRestaurant 
              ? `Aucune commande pour ${selectedRestaurant.name}`
              : 'Les nouvelles commandes apparaîtront ici'
            }
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredOrders}
        renderItem={({ item }) => (
          <OrderCard
            key={item.id}
            item={item}
            onStatusUpdate={handleStatusUpdate}
            onRequestPaymentMethod={openPaymentPrompt}
            onArchive={archiveOrder}
            onUnarchive={unarchiveOrder}
            isUpdating={refreshing}
            isArchived={filter === 'archived'}
            screenType={screenType}
          />
        )}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={() => {
          const completedOrders = restaurantOrders.filter(o => 
            ['served', 'cancelled'].includes(o.status) && !archivedOrders.has(o.id)
          );

          return (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {filter === 'archived' ? 'Archives' : 'Commandes actives'} ({filteredOrders.length})
              </Text>
              <View style={styles.headerActions}>
                {completedOrders.length > 0 && filter !== 'archived' ? (
                  <Button
                    title={`Archiver (${completedOrders.length})`}
                    onPress={openArchiveConfirm}
                    variant="outline"
                    size="sm"
                    leftIcon={<Ionicons name="archive" size={16} color={COLORS.text.secondary} />}
                    style={{ 
                      borderColor: COLORS.text.secondary,
                      backgroundColor: 'transparent' 
                    }}
                    textStyle={{ color: COLORS.text.secondary }}
                  />
                ) : null}
                <Pressable onPress={handleRefresh} disabled={refreshing}>
                  <Ionicons 
                    name="refresh" 
                    size={getResponsiveValue(
                      { mobile: 20, tablet: 22, desktop: 24 },
                      screenType
                    )} 
                    color={refreshing ? COLORS.text.light : COLORS.primary} 
                  />
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Gestion des commandes" />

      {/* Bannières d’alertes (success / error / info / warning) */}
      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map(a => (
            <InlineAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id)}
              // autoDismiss true par défaut (dans ton composant)
            />
          ))}
        </View>
      )}

      <RestaurantSelector
        restaurants={restaurants}
        selectedRestaurantId={selectedRestaurantId}
        onSelect={selectRestaurant}
        isLoading={isLoadingRestaurants}
        screenType={screenType}
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color={COLORS.error} />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {restaurantOrders.length > 0 ? (
        <StatusFilters 
          currentFilter={filter}
          onFilterChange={setFilter}
          orders={restaurantOrders.filter(order => !archivedOrders.has(order.id))}
          archivedCount={archivedOrders.size}
          screenType={screenType}
        />
      ) : null}

      {(isLoading || isLoadingRestaurants) && allOrders.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>
            {isLoadingRestaurants ? 'Chargement des restaurants...' : 'Chargement des commandes...'}
          </Text>
        </View>
      ) : (
        renderContent()
      )}

      {/* Prompt d’encaissement (carte / espèces) */}
      {paymentPrompt && (
        <View style={{ paddingHorizontal: layoutConfig.containerPadding, paddingTop: getResponsiveValue(SPACING.sm, screenType) }}>
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
            // autoDismiss est désactivé par défaut dans AlertWithAction
          />
        </View>
      )}

      {/* Confirmation d’archivage en masse */}
      {archiveConfirmOpen && (
        <View style={{ paddingHorizontal: layoutConfig.containerPadding, paddingTop: getResponsiveValue(SPACING.sm, screenType) }}>
          <AlertWithAction
            variant="warning"
            title="Archiver les commandes terminées"
            message="Voulez-vous archiver toutes les commandes servies et annulées ?"
            secondaryButton={{
              text: 'Annuler',
              onPress: () => setArchiveConfirmOpen(false),
            }}
            primaryButton={{
              text: 'Archiver',
              onPress: confirmBulkArchive,
              variant: 'danger',
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
