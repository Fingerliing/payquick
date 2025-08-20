import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
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

// ✅ Indicateur de connexion temps réel (SIMPLIFIÉ)
const RealtimeIndicator = React.memo(({ 
  connectionState, 
  activeOrdersCount,
  lastUpdateTime 
}: { 
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
  activeOrdersCount: number;
  lastUpdateTime?: Date;
}) => {
  if (activeOrdersCount === 0) return null;

  const getIndicatorProps = () => {
    switch (connectionState) {
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
    <View style={styles.realTimeIndicator}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.realTimeText, { color }]}>{text}</Text>
      {lastUpdateTime && connectionState === 'connected' && (
        <Text style={styles.lastUpdateText}>
          {lastUpdateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </View>
  );
});

// ✅ Composant pour une commande (SIMPLIFIÉ)
const OrderCard = React.memo(({ 
  item, 
  isRealtime = false 
}: { 
  item: OrderList;
  isRealtime?: boolean;
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

  return (
    <Pressable onPress={handlePress}>
      <Card style={[
        styles.orderCard,
        displayInfo.isActive && styles.activeOrderCard,
        isRealtime && displayInfo.isActive && styles.realtimeOrderCard,
      ]}>
        {/* En-tête de la commande */}
        <View style={styles.orderHeader}>
          <View style={styles.orderInfo}>
            <View style={styles.orderTitleRow}>
              <Text style={styles.orderTitle}>{displayInfo.title}</Text>
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
            <Ionicons 
              name={item.payment_status === 'paid' ? "checkmark-circle" : "time"} 
              size={16} 
              color={item.payment_status === 'paid' ? "#10B981" : "#FF9500"} 
            />
            <Text style={[
              styles.detailText,
              { color: item.payment_status === 'paid' ? "#10B981" : "#FF9500" }
            ]}>
              {item.payment_status === 'paid' ? 'Payé' : 'Paiement en attente'}
            </Text>
          </View>
        </View>

        {/* Temps d'attente pour commandes actives */}
        {displayInfo.isActive && item.waiting_time && (
          <View style={styles.waitingTime}>
            <Ionicons name="time-outline" size={16} color="#FF9500" />
            <Text style={styles.waitingTimeText}>
              Temps d'attente estimé : {item.waiting_time} min
            </Text>
          </View>
        )}

        {/* Action */}
        <View style={styles.orderAction}>
          <Text style={styles.actionText}>Voir le récapitulatif</Text>
          <Ionicons name="chevron-forward" size={20} color="#007AFF" />
        </View>
      </Card>
    </Pressable>
  );
});

// État vide avec QR Access
const EmptyState = React.memo(() => {
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

  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={80} color="#ddd" />
      <Text style={styles.emptyTitle}>Aucune commande en cours</Text>
      <Text style={styles.emptyMessage}>
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
  realtimeState
}: { 
  orders: OrderList[]; 
  onRefresh: () => void;
  isLoading: boolean;
  realtimeState?: {
    connectionState: 'connecting' | 'connected' | 'disconnected' | 'error';
    activeOrdersCount: number;
    lastUpdateTime?: Date;
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
          <Text style={styles.sectionTitle}>Commandes en cours</Text>
          {realtimeState && (
            <RealtimeIndicator 
              connectionState={realtimeState.connectionState}
              activeOrdersCount={realtimeState.activeOrdersCount}
              lastUpdateTime={realtimeState.lastUpdateTime}
            />
          )}
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
        <OrderCard 
          key={order.id} 
          item={order} 
          isRealtime={realtimeState?.connectionState === 'connected'}
        />
      ))}
    </View>
  );
});

// Section historique
const HistorySection = React.memo(({ orders }: { orders: OrderList[] }) => {
  const historyOrders = orders.filter(o => 
    ['served', 'cancelled'].includes(o.status)
  ).slice(0, 5);

  if (historyOrders.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Historique récent</Text>
      {historyOrders.map(order => (
        <OrderCard key={order.id} item={order} />
      ))}
    </View>
  );
});

// Composant principal
export default function ClientOrdersScreen() {
  const { isClient, isAuthenticated, user } = useAuth(); // ✅ Récupération des bonnes propriétés
  const [refreshing, setRefreshing] = useState(false);
  
  const {
    orders,
    isLoading,
    error,
    fetchOrders,
  } = useClientOrders();

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

  // Rendu du contenu principal
  const renderContent = useCallback(() => {
    if (orders.length === 0 && !isLoading) {
      return <EmptyState />;
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
            />
            <HistorySection orders={orders} />
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
  }, [orders, isLoading, refreshing, handleRefresh, realtimeState]);

  // Gestion des erreurs d'accès
  if (!isClient) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Mes commandes" />
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#666" />
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

      {/* Contenu principal */}
      {renderContent()}

      {/* Indicateur de chargement initial */}
      {isLoading && orders.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Chargement de vos commandes...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ✅ Styles (identiques mais organisés)
const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
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

  // Temps réel
  realTimeIndicator: {
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
  realTimeText: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  lastUpdateText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginLeft: 4,
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
  restaurantName: {
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
  },
  waitingTimeText: {
    fontSize: 14,
    color: '#FF9500',
    fontWeight: '500' as const,
  },

  // Action
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
    marginBottom: 32,
  },
  qrContainer: {
    width: '100%',
    maxWidth: 400,
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