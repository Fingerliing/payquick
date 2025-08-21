import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { useOrder } from '@/contexts/OrderContext'; // Utiliser le contexte existant
import { useRestaurant } from '@/contexts/RestaurantContext'; // Pour récupérer les restaurants
import { OrderList } from '@/types/order';
import { Restaurant } from '@/types/restaurant';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/common/StatusBadge';
import { orderService } from '@/services/orderService';
import { useOrderRealtime } from '@/hooks/useOrderRealtime';

// Hook pour gérer la sélection de restaurant avec persistance
const useRestaurantSelection = () => {
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const { restaurants, loadRestaurants, isLoading: isLoadingRestaurants } = useRestaurant();

  // Charger les restaurants et restaurer la sélection
  useEffect(() => {
    const initializeRestaurants = async () => {
      console.log('🏪 Initializing restaurants...');
      
      // Charger les restaurants du restaurateur
      await loadRestaurants();
    };

    initializeRestaurants();
  }, []);

  // Restaurer la sélection depuis AsyncStorage quand les restaurants sont chargés
  useEffect(() => {
    const restoreSelection = async () => {
      if (restaurants.length > 0 && selectedRestaurantId === null) {
        try {
          const savedRestaurantId = await AsyncStorage.getItem('selectedRestaurantId');
          console.log('💾 Saved restaurant ID:', savedRestaurantId);
          
          if (savedRestaurantId && restaurants.find(r => r.id === savedRestaurantId)) {
            setSelectedRestaurantId(parseInt(savedRestaurantId));
            console.log('🔄 Restored restaurant selection:', savedRestaurantId);
          } else if (restaurants.length > 0) {
            // Sélectionner le premier restaurant par défaut
            const firstId = parseInt(restaurants[0].id);
            setSelectedRestaurantId(firstId);
            await AsyncStorage.setItem('selectedRestaurantId', String(firstId));
            console.log('🎯 Auto-selected first restaurant:', firstId);
          }
        } catch (error) {
          console.error('❌ Error restoring restaurant selection:', error);
        }
      }
    };

    restoreSelection();
  }, [restaurants.length, selectedRestaurantId]);

  // Changer de restaurant sélectionné
  const selectRestaurant = useCallback(async (restaurantId: number) => {
    setSelectedRestaurantId(restaurantId);
    await AsyncStorage.setItem('selectedRestaurantId', String(restaurantId));
    console.log('✅ Restaurant selection saved:', restaurantId);
  }, []);

  return {
    restaurants,
    selectedRestaurantId,
    isLoadingRestaurants,
    selectRestaurant
  };
};

// Hook pour auto-refresh des commandes actives
const useAutoRefresh = (
  hasActiveOrders: boolean, 
  refreshFn: () => void, 
  realtimeEnabled: boolean = false
) => {
  useEffect(() => {
    if (!hasActiveOrders || realtimeEnabled) return;
    
    const intervalId = setInterval(refreshFn, 30000); // 30 secondes
    return () => clearInterval(intervalId);
  }, [hasActiveOrders, refreshFn, realtimeEnabled]);
};

// Indicateur de connexion temps réel et dernière mise à jour
const RefreshIndicator = React.memo(({ 
  isRefreshing, 
  lastUpdateTime,
  activeOrdersCount,
  realtimeState
}: { 
  isRefreshing: boolean;
  lastUpdateTime?: Date;
  activeOrdersCount: number;
  realtimeState?: {
    connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
    lastUpdateTime?: Date;
  };
}) => {
  if (activeOrdersCount === 0) return null;

  // Priorité à l'état temps réel s'il est actif
  if (realtimeState && realtimeState.connectionState !== 'disconnected') {
    const getIndicatorProps = () => {
      switch (realtimeState.connectionState) {
        case 'connected':
          return { 
            icon: 'radio-button-on' as const, 
            color: '#10B981', 
            text: 'Temps réel activé' 
          };
        case 'connecting':
          return { 
            icon: 'radio-button-off' as const, 
            color: '#FF9500', 
            text: 'Connexion...' 
          };
        case 'error':
          return { 
            icon: 'warning' as const, 
            color: '#DC2626', 
            text: 'Erreur connexion' 
          };
        default:
          return { 
            icon: 'radio-button-off' as const, 
            color: '#9CA3AF', 
            text: 'Hors ligne' 
          };
      }
    };

    const { icon, color, text } = getIndicatorProps();

    return (
      <View style={styles.refreshIndicator}>
        <Ionicons name={icon} size={12} color={color} />
        <Text style={[styles.refreshText, { color }]}>{text}</Text>
        {realtimeState.lastUpdateTime && realtimeState.connectionState === 'connected' && (
          <Text style={styles.lastUpdateText}>
            {realtimeState.lastUpdateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>
    );
  }

  // Fallback vers l'indicateur de refresh manuel
  return (
    <View style={styles.refreshIndicator}>
      <Ionicons 
        name={isRefreshing ? "refresh" : "checkmark-circle"} 
        size={12} 
        color={isRefreshing ? "#FF9500" : "#10B981"} 
      />
      <Text style={[styles.refreshText, { color: isRefreshing ? "#FF9500" : "#10B981" }]}>
        {isRefreshing ? 'Actualisation...' : 'À jour'}
      </Text>
      {lastUpdateTime && !isRefreshing && (
        <Text style={styles.lastUpdateText}>
          {lastUpdateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </View>
  );
});

// Sélecteur de restaurant
const RestaurantSelector = React.memo(({ 
  restaurants, 
  selectedRestaurantId, 
  onSelect,
  isLoading
}: {
  restaurants: Restaurant[];
  selectedRestaurantId: number | null;
  onSelect: (id: number) => void;
  isLoading: boolean;
}) => {
  const [showModal, setShowModal] = useState(false);

  const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));

  if (isLoading) {
    return (
      <View style={styles.restaurantSelector}>
        <ActivityIndicator size="small" color="#FF6B35" />
        <Text style={styles.restaurantSelectorText}>Chargement...</Text>
      </View>
    );
  }

  if (restaurants.length === 0) {
    return (
      <View style={styles.restaurantSelector}>
        <Ionicons name="warning" size={16} color="#FF9500" />
        <Text style={styles.restaurantSelectorText}>Aucun restaurant trouvé</Text>
      </View>
    );
  }

  if (restaurants.length === 1) {
    return (
      <View style={styles.restaurantSelector}>
        <Ionicons name="restaurant" size={16} color="#FF6B35" />
        <Text style={styles.restaurantSelectorText}>{restaurants[0].name}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable 
        style={styles.restaurantSelector}
        onPress={() => setShowModal(true)}
      >
        <Ionicons name="restaurant" size={16} color="#FF6B35" />
        <Text style={styles.restaurantSelectorText}>
          {selectedRestaurant?.name || 'Sélectionner un restaurant'}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#666" />
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
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            
            <FlatList
              data={restaurants}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.restaurantOption,
                    item.id === String(selectedRestaurantId) && styles.restaurantOptionSelected
                  ]}
                  onPress={() => {
                    onSelect(parseInt(item.id));
                    setShowModal(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.restaurantOptionText,
                      item.id === String(selectedRestaurantId) && styles.restaurantOptionTextSelected
                    ]}>
                      {item.name}
                    </Text>
                    <Text style={styles.restaurantOptionAddress}>
                      {item.address}, {item.city}
                    </Text>
                  </View>
                  {item.id === String(selectedRestaurantId) && (
                    <Ionicons name="checkmark-circle" size={20} color="#FF6B35" />
                  )}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
});

// Composant pour une commande côté restaurateur
const RestaurantOrderCard = React.memo(({ 
  item, 
  onStatusUpdate,
  onMarkAsPaid,
  isUpdating = false,
  isRealtime = false
}: { 
  item: OrderList;
  onStatusUpdate: (orderId: number, newStatus: string) => Promise<void>;
  onMarkAsPaid: (orderId: number, paymentMethod: string) => Promise<void>;
  isUpdating?: boolean;
  isRealtime?: boolean;
}) => {
  const [localUpdating, setLocalUpdating] = useState(false);

  const displayInfo = useMemo(() => {
    const date = new Date(item.created_at);
    const isActive = ['pending', 'confirmed', 'preparing', 'ready'].includes(item.status);
    const isUrgent = isActive && (Date.now() - date.getTime()) > 30 * 60 * 1000; // Plus de 30 min
    
    return {
      title: `Commande ${item.order_number}`,
      time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      date: date.toLocaleDateString('fr-FR'),
      isActive,
      isUrgent,
      isToday: date.toDateString() === new Date().toDateString(),
    };
  }, [item]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (localUpdating || isUpdating) return;
    
    setLocalUpdating(true);
    try {
      await onStatusUpdate(item.id, newStatus);
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
    } finally {
      setLocalUpdating(false);
    }
  }, [item.id, onStatusUpdate, localUpdating, isUpdating]);

  const handleMarkAsPaid = useCallback(async () => {
    if (localUpdating || isUpdating) return;
    
    Alert.alert(
      'Marquer comme payée',
      'Quelle méthode de paiement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Espèces', 
          onPress: () => {
            setLocalUpdating(true);
            onMarkAsPaid(item.id, 'cash').finally(() => setLocalUpdating(false));
          }
        },
        { 
          text: 'Carte', 
          onPress: () => {
            setLocalUpdating(true);
            onMarkAsPaid(item.id, 'card').finally(() => setLocalUpdating(false));
          }
        },
      ]
    );
  }, [item.id, onMarkAsPaid, localUpdating, isUpdating]);

  const handlePress = useCallback(() => {
    router.push(`/order/${item.id}` as any);
  }, [item.id]);

  const renderStatusActions = () => {
    if (item.status === 'served' || item.status === 'cancelled') {
      return null;
    }

    const statusFlow = {
      'pending': 'confirmed',
      'confirmed': 'preparing',
      'preparing': 'ready',
      'ready': 'served'
    };

    const nextStatus = statusFlow[item.status as keyof typeof statusFlow];
    if (!nextStatus) return null;

    const actionLabels = {
      'confirmed': 'Confirmer',
      'preparing': 'En préparation',
      'ready': 'Prêt',
      'served': 'Servir'
    };

    return (
      <View style={styles.actionButtons}>
        <Pressable 
          style={[styles.actionButton, styles.statusButton]}
          onPress={() => handleStatusChange(nextStatus)}
          disabled={localUpdating || isUpdating}
        >
          {localUpdating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
              <Text style={styles.actionButtonText}>
                {actionLabels[nextStatus as keyof typeof actionLabels]}
              </Text>
            </>
          )}
        </Pressable>

        {item.payment_status !== 'paid' && (
          <Pressable 
            style={[styles.actionButton, styles.paymentButton]}
            onPress={handleMarkAsPaid}
            disabled={localUpdating || isUpdating}
          >
            <Ionicons name="card" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Encaisser</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <Pressable onPress={handlePress}>
      <Card style={[
        styles.orderCard,
        displayInfo.isActive && styles.activeOrderCard,
        displayInfo.isUrgent && styles.urgentOrderCard,
        isRealtime && displayInfo.isActive && styles.realtimeOrderCard,
      ]}>
        {/* En-tête de la commande */}
        <View style={styles.orderHeader}>
          <View style={styles.orderInfo}>
            <View style={styles.orderTitleRow}>
              <Text style={styles.orderTitle}>{displayInfo.title}</Text>
              {displayInfo.isUrgent && (
                <View style={styles.urgentBadge}>
                  <Ionicons name="warning" size={12} color="#DC2626" />
                </View>
              )}
              {isRealtime && displayInfo.isActive && (
                <View style={styles.realtimeBadge}>
                  <View style={styles.realtimeDot} />
                </View>
              )}
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

        {/* Détails */}
        <View style={styles.orderDetails}>
          {item.table_number && (
            <View style={styles.detailItem}>
              <Ionicons name="restaurant-outline" size={16} color="#666" />
              <Text style={styles.detailText}>Table {item.table_number}</Text>
            </View>
          )}
          
          <View style={styles.detailItem}>
            <Ionicons 
              name={item.order_type === 'dine_in' ? "restaurant" : "bag"} 
              size={16} 
              color="#666" 
            />
            <Text style={styles.detailText}>
              {item.order_type === 'dine_in' ? 'Sur place' : 'À emporter'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons name="receipt-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {item.items_count} article{item.items_count > 1 ? 's' : ''}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Ionicons 
              name={item.payment_status === 'paid' ? "checkmark-circle" : "time"} 
              size={16} 
              color={item.payment_status === 'paid' ? "#10B981" : "#FF9500"} 
            />
            <Text style={[
              styles.detailText,
              { color: item.payment_status === 'paid' ? "#10B981" : "#FF9500" }
            ]}>
              {item.payment_status === 'paid' ? 'Payée' : 'Non payée'}
            </Text>
          </View>
        </View>

        {/* Temps d'attente pour commandes actives */}
        {displayInfo.isActive && item.waiting_time && (
          <View style={styles.waitingTime}>
            <Ionicons name="time-outline" size={16} color="#FF9500" />
            <Text style={styles.waitingTimeText}>
              Temps estimé : {item.waiting_time} min
            </Text>
          </View>
        )}

        {/* Actions */}
        {renderStatusActions()}

        {/* Action de consultation */}
        <View style={styles.orderAction}>
          <Text style={styles.actionText}>Voir les détails</Text>
          <Ionicons name="chevron-forward" size={20} color="#007AFF" />
        </View>
      </Card>
    </Pressable>
  );
});

// Section commandes actives
const ActiveOrdersSection = React.memo(({ 
  orders, 
  onRefresh, 
  isLoading,
  onStatusUpdate,
  onMarkAsPaid,
  refreshIndicator,
  realtimeState
}: { 
  orders: OrderList[]; 
  onRefresh: () => void;
  isLoading: boolean;
  onStatusUpdate: (orderId: number, newStatus: string) => Promise<void>;
  onMarkAsPaid: (orderId: number, paymentMethod: string) => Promise<void>;
  refreshIndicator: React.ReactNode;
  realtimeState?: {
    connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
    isConnected: boolean;
  };
}) => {
  const activeOrders = orders.filter(o => 
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  );

  if (activeOrders.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Text style={styles.sectionTitle}>Commandes actives ({activeOrders.length})</Text>
          {refreshIndicator}
        </View>
        <Pressable onPress={onRefresh} disabled={isLoading}>
          <Ionicons 
            name="refresh" 
            size={20} 
            color={isLoading ? "#ccc" : "#007AFF"} 
          />
        </Pressable>
      </View>
      {activeOrders.map(order => (
        <RestaurantOrderCard 
          key={order.id} 
          item={order} 
          onStatusUpdate={onStatusUpdate}
          onMarkAsPaid={onMarkAsPaid}
          isUpdating={isLoading}
          isRealtime={realtimeState?.isConnected}
        />
      ))}
    </View>
  );
});

// Section historique
const HistorySection = React.memo(({ 
  orders,
  onStatusUpdate,
  onMarkAsPaid 
}: { 
  orders: OrderList[];
  onStatusUpdate: (orderId: number, newStatus: string) => Promise<void>;
  onMarkAsPaid: (orderId: number, paymentMethod: string) => Promise<void>;
}) => {
  const historyOrders = orders.filter(o => 
    ['served', 'cancelled'].includes(o.status)
  ).slice(0, 10); // Limiter à 10 pour l'affichage

  if (historyOrders.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Historique récent</Text>
      {historyOrders.map(order => (
        <RestaurantOrderCard 
          key={order.id} 
          item={order}
          onStatusUpdate={onStatusUpdate}
          onMarkAsPaid={onMarkAsPaid}
        />
      ))}
    </View>
  );
});

// État vide
const EmptyState = React.memo(({ 
  selectedRestaurant 
}: { 
  selectedRestaurant?: Restaurant 
}) => (
  <View style={styles.emptyContainer}>
    <Ionicons name="receipt-outline" size={80} color="#ddd" />
    <Text style={styles.emptyTitle}>Aucune commande</Text>
    <Text style={styles.emptyMessage}>
      {selectedRestaurant 
        ? `Aucune commande pour ${selectedRestaurant.name}`
        : 'Les nouvelles commandes apparaîtront ici'
      }
    </Text>
  </View>
));

// Filtres par statut
const StatusFilters = React.memo(({ 
  currentFilter, 
  onFilterChange, 
  orders 
}: {
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  orders: OrderList[];
}) => {
  const filters = [
    { key: 'all', label: 'Toutes', count: orders.length },
    { key: 'pending', label: 'En attente', count: orders.filter(o => o.status === 'pending').length },
    { key: 'confirmed', label: 'Confirmées', count: orders.filter(o => o.status === 'confirmed').length },
    { key: 'preparing', label: 'En préparation', count: orders.filter(o => o.status === 'preparing').length },
    { key: 'ready', label: 'Prêtes', count: orders.filter(o => o.status === 'ready').length },
    { key: 'served', label: 'Servies', count: orders.filter(o => o.status === 'served').length },
  ];

  return (
    <View style={styles.filtersContainer}>
      <FlatList
        horizontal
        data={filters}
        keyExtractor={item => item.key}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.filterButton,
              currentFilter === item.key && styles.filterButtonActive
            ]}
            onPress={() => onFilterChange(item.key)}
          >
            <Text style={[
              styles.filterButtonText,
              currentFilter === item.key && styles.filterButtonTextActive
            ]}>
              {item.label} ({item.count})
            </Text>
          </Pressable>
        )}
        contentContainerStyle={styles.filtersContent}
      />
    </View>
  );
});

// Composant principal
export default function RestaurantOrdersScreen() {
  const { isRestaurateur, isAuthenticated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [filter, setFilter] = useState<string>('all');
  
  // Gestion de la sélection de restaurant
  const {
    restaurants,
    selectedRestaurantId,
    isLoadingRestaurants,
    selectRestaurant
  } = useRestaurantSelection();

  // Utiliser le contexte OrderContext existant
  const { 
    orders: allOrders, 
    isLoading, 
    error, 
    fetchOrders, 
    updateOrderStatus,
    markAsPaid 
  } = useOrder();

  // Debug logs
  useEffect(() => {
    console.log('📊 Orders state:', {
      allOrders: allOrders.length,
      selectedRestaurantId,
      isLoading,
      error
    });
  }, [allOrders.length, selectedRestaurantId, isLoading, error]);

  // Filtrer les commandes par restaurant sélectionné
  const restaurantOrders = useMemo(() => {
    if (!selectedRestaurantId) return allOrders; // Afficher toutes si aucun restaurant sélectionné
    
    const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));
    
    console.log('🔍 Filtering orders for restaurant:', selectedRestaurantId, selectedRestaurant?.name);
    console.log('📦 All orders:', allOrders.map(o => ({ 
      id: o.id, 
      restaurant: o.restaurant, 
      restaurant_name: o.restaurant_name 
    })));
    
    if (!selectedRestaurant) {
      console.log('⚠️ No restaurant found with ID:', selectedRestaurantId);
      return allOrders;
    }
    
    const filtered = allOrders.filter(order => {
      // Filtrer par nom de restaurant (plus fiable que l'ID qui n'est pas toujours présent)
      const match = order.restaurant_name === selectedRestaurant.name;
      
      console.log(`🔍 Order ${order.id}: "${order.restaurant_name}" === "${selectedRestaurant.name}" ? ${match}`);
      
      return match;
    });
    
    console.log('✅ Filtered orders:', filtered.length);
    return filtered;
  }, [allOrders, selectedRestaurantId, restaurants]);

  const handleRefresh = useCallback(async () => {
    console.log('🔄 Refreshing orders...');
    setRefreshing(true);
    try {
      // Utiliser le contexte pour charger toutes les commandes du restaurateur
      await fetchOrders({
        page: 1,
        limit: 100, // Charger plus de commandes
      });
      setLastUpdateTime(new Date());
      console.log('✅ Orders refreshed successfully');
    } catch (error) {
      console.error('❌ Error refreshing orders:', error);
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrders]);

  // Hook temps réel pour les commandes du restaurant sélectionné
  const realtimeState = useOrderRealtime(restaurantOrders, handleRefresh, {
    enabled: isAuthenticated && isRestaurateur && restaurantOrders.length > 0,
    onOrderUpdate: (update) => {
      console.log('🔔 Restaurant order update received:', update);
      // Optionnel: afficher une notification
    },
    onConnectionChange: (state) => {
      console.log('🔗 Restaurant connection state changed:', state);
    }
  });

  // Filtrer par statut sélectionné
  const filteredOrders = useMemo(() => {
    if (filter === 'all') return restaurantOrders;
    return restaurantOrders.filter(order => order.status === filter);
  }, [restaurantOrders, filter]);

  const hasActiveOrders = restaurantOrders.some(o => 
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  );

  const selectedRestaurant = restaurants.find(r => r.id === String(selectedRestaurantId));

  const handleStatusUpdate = useCallback(async (orderId: number, newStatus: string) => {
    try {
      console.log('🔄 Updating order status:', orderId, newStatus);
      await updateOrderStatus(orderId, newStatus);
      console.log('✅ Order status updated');
    } catch (error) {
      console.error('❌ Error updating status:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut de la commande');
    }
  }, [updateOrderStatus]);

  const handleMarkAsPaid = useCallback(async (orderId: number, paymentMethod: string) => {
    try {
      console.log('💳 Marking order as paid:', orderId, paymentMethod);
      await markAsPaid(orderId, paymentMethod);
      console.log('✅ Order marked as paid');
    } catch (error) {
      console.error('❌ Error marking as paid:', error);
      Alert.alert('Erreur', 'Impossible de marquer la commande comme payée');
    }
  }, [markAsPaid]);

  const handleFilterChange = useCallback((newFilter: string) => {
    setFilter(newFilter);
  }, []);

  const handleRestaurantSelect = useCallback(async (restaurantId: number) => {
    console.log('🏪 Selecting restaurant:', restaurantId);
    await selectRestaurant(restaurantId);
    // Les commandes sont déjà chargées, le filtrage se fait automatiquement
  }, [selectRestaurant]);

  // Auto-refresh pour commandes actives (désactivé si temps réel connecté)
  useAutoRefresh(hasActiveOrders, handleRefresh, realtimeState.isConnected);

  // Charger les commandes au montage et quand l'auth change
  useEffect(() => {
    if (isAuthenticated && isRestaurateur) {
      console.log('🚀 Loading orders for restaurateur...');
      handleRefresh();
    }
  }, [isAuthenticated, isRestaurateur]);

  // Rendu du contenu principal
  const renderContent = useCallback(() => {
    if (!selectedRestaurantId && !isLoadingRestaurants) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="restaurant-outline" size={80} color="#ddd" />
          <Text style={styles.emptyTitle}>Aucun restaurant sélectionné</Text>
          <Text style={styles.emptyMessage}>Sélectionnez un restaurant pour voir les commandes</Text>
        </View>
      );
    }

    if (restaurantOrders.length === 0 && !isLoading) {
      return <EmptyState selectedRestaurant={selectedRestaurant} />;
    }

    const refreshIndicator = (
      <RefreshIndicator 
        isRefreshing={refreshing}
        lastUpdateTime={lastUpdateTime}
        activeOrdersCount={restaurantOrders.filter(o => 
          ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
        ).length}
        realtimeState={realtimeState}
      />
    );

    return (
      <FlatList
        data={[1]}
        renderItem={() => (
          <View style={styles.content}>
            <ActiveOrdersSection 
              orders={filteredOrders}
              onRefresh={handleRefresh}
              isLoading={refreshing}
              onStatusUpdate={handleStatusUpdate}
              onMarkAsPaid={handleMarkAsPaid}
              refreshIndicator={refreshIndicator}
              realtimeState={realtimeState}
            />
            <HistorySection 
              orders={filteredOrders} 
              onStatusUpdate={handleStatusUpdate}
              onMarkAsPaid={handleMarkAsPaid}
            />
          </View>
        )}
        keyExtractor={() => 'content'}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh}
            colors={['#FF6B35']}
            tintColor="#FF6B35"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    );
  }, [selectedRestaurantId, isLoadingRestaurants, restaurantOrders.length, isLoading, selectedRestaurant, filteredOrders, refreshing, handleRefresh, handleStatusUpdate, handleMarkAsPaid, lastUpdateTime]);

  // Gestion des erreurs d'accès
  if (!isRestaurateur) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Commandes" />
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#666" />
          <Text style={styles.errorText}>Accès réservé aux restaurateurs</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Gestion des commandes" />

      {/* Sélecteur de restaurant */}
      <RestaurantSelector
        restaurants={restaurants}
        selectedRestaurantId={selectedRestaurantId}
        onSelect={handleRestaurantSelect}
        isLoading={isLoadingRestaurants}
      />

      {/* Bannière d'erreur */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color="#DC2626" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* Bannière d'avertissement si temps réel échoue */}
      {realtimeState.connectionState === 'error' && realtimeState.activeOrdersCount > 0 && (
        <View style={styles.warningBanner}>
          <Ionicons name="cloud-offline" size={16} color="#FF9500" />
          <Text style={styles.warningBannerText}>
            Notifications temps réel indisponibles. Tirez pour actualiser.
          </Text>
        </View>
      )}

      {/* Filtres par statut */}
      {restaurantOrders.length > 0 && (
        <StatusFilters 
          currentFilter={filter}
          onFilterChange={handleFilterChange}
          orders={restaurantOrders}
        />
      )}

      {/* Contenu principal */}
      {renderContent()}

      {/* Indicateur de chargement initial */}
      {(isLoading || isLoadingRestaurants) && allOrders.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>
            {isLoadingRestaurants ? 'Chargement des restaurants...' : 'Chargement des commandes...'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// Styles (identiques à la version précédente)
const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
  },
  
  // Sélecteur de restaurant
  restaurantSelector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  restaurantSelectorText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500' as const,
    color: '#333',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flex: 0.7,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
  },
  restaurantOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  restaurantOptionSelected: {
    backgroundColor: '#FFF7ED',
  },
  restaurantOptionText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: '#333',
    marginBottom: 2,
  },
  restaurantOptionTextSelected: {
    color: '#FF6B35',
  },
  restaurantOptionAddress: {
    fontSize: 14,
    color: '#666',
  },
  
  // Sections
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  sectionTitleContainer: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
  },

  // Indicateur de refresh
  refreshIndicator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  refreshText: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  lastUpdateText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginLeft: 4,
  },

  // Filtres
  filtersContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#FF6B35',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#fff',
  },

  // Cartes de commande
  orderCard: {
    marginBottom: 16,
    padding: 20,
  },
  activeOrderCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35',
  },
  realtimeOrderCard: {
    borderColor: '#10B981',
    borderWidth: 1,
  },
  urgentOrderCard: {
    borderColor: '#DC2626',
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
  },
  orderHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 16,
  },
  orderInfo: {
    flex: 1,
  },
  orderTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
    marginBottom: 4,
  },
  urgentBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  realtimeBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  realtimeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  customerName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  orderTime: {
    fontSize: 14,
    color: '#666',
  },

  // Détails
  orderDetails: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 16,
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },

  // Temps d'attente
  waitingTime: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
  },
  waitingTimeText: {
    fontSize: 14,
    color: '#FF9500',
    fontWeight: '500' as const,
  },

  // Boutons d'action
  actionButtons: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
    flex: 1,
  },
  statusButton: {
    backgroundColor: '#FF6B35',
  },
  paymentButton: {
    backgroundColor: '#10B981',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
  },

  // Action de consultation
  orderAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500' as const,
  },

  // États
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center' as const,
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBannerText: {
    color: '#DC2626',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  warningBanner: {
    backgroundColor: '#FFF7ED',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  warningBannerText: {
    color: '#FF9500',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
};