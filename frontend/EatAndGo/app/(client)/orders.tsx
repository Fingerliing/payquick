import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ListRenderItem,
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

// Hook pour auto-refresh des commandes actives
const useAutoRefresh = (hasActiveOrders: boolean, refreshFn: () => void) => {
  React.useEffect(() => {
    if (!hasActiveOrders) return;
    
    const interval = setInterval(refreshFn, 30000); // 30 secondes
    return () => clearInterval(interval);
  }, [hasActiveOrders, refreshFn]);
};

// Composant pour le suivi de commande en temps réel
const OrderTracker = React.memo(({ item }: { item: OrderList }) => {
  const steps = [
    { key: 'pending', label: 'Confirmée', icon: 'checkmark-circle' },
    { key: 'confirmed', label: 'En préparation', icon: 'restaurant' },
    { key: 'preparing', label: 'Presque prête', icon: 'timer' },
    { key: 'ready', label: 'Prête', icon: 'checkmark-done' },
    { key: 'served', label: 'Servie', icon: 'happy' },
  ];

  const currentStepIndex = steps.findIndex(step => step.key === item.status);
  
  return (
    <View style={styles.trackerContainer}>
      <Text style={styles.trackerTitle}>Suivi de votre commande</Text>
      <View style={styles.trackerSteps}>
        {steps.map((step, index) => {
          const isCompleted = index <= currentStepIndex;
          const isCurrent = index === currentStepIndex;
          
          return (
            <View key={step.key} style={styles.trackerStep}>
              <View style={[
                styles.trackerIcon,
                isCompleted && styles.trackerIconCompleted,
                isCurrent && styles.trackerIconCurrent,
              ]}>
                <Ionicons 
                  name={step.icon as any} 
                  size={16} 
                  color={isCompleted ? '#fff' : '#ccc'} 
                />
              </View>
              <Text style={[
                styles.trackerLabel,
                isCompleted && styles.trackerLabelCompleted,
                isCurrent && styles.trackerLabelCurrent,
              ]}>
                {step.label}
              </Text>
              {index < steps.length - 1 && (
                <View style={[
                  styles.trackerLine,
                  isCompleted && styles.trackerLineCompleted,
                ]} />
              )}
            </View>
          );
        })}
      </View>
      
      {/* Temps d'attente estimé */}
      {item.waiting_time && (
        <View style={styles.waitingTime}>
          <Ionicons name="time-outline" size={16} color="#FF9500" />
          <Text style={styles.waitingTimeText}>
            Temps d'attente estimé : {item.waiting_time} min
          </Text>
        </View>
      )}
    </View>
  );
});

// Composant pour une commande avec récapitulatif
const OrderCard = React.memo(({ item }: { item: OrderList }) => {
  const displayInfo = useMemo(() => {
    const date = new Date(item.created_at);
    const isActive = ['pending', 'confirmed', 'preparing', 'ready'].includes(item.status);
    
    return {
      title: `Commande #${item.order_number || item.id}`,
      restaurantName: item.restaurant_name || 'Restaurant',
      itemsText: item.items_count ? 
        `${item.items_count} article${item.items_count > 1 ? 's' : ''}` :
        'Commande',
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
      ]}>
        {/* En-tête de la commande */}
        <View style={styles.orderHeader}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderTitle}>{displayInfo.title}</Text>
            <Text style={styles.restaurantName}>{displayInfo.restaurantName}</Text>
            <View style={styles.orderMeta}>
              <Text style={styles.orderTime}>
                {displayInfo.isToday ? `Aujourd'hui à ${displayInfo.time}` : displayInfo.date}
              </Text>
              <Text style={styles.itemsText}>{displayInfo.itemsText}</Text>
            </View>
          </View>
          <StatusBadge status={item.status} />
        </View>

        {/* Détails contextuels */}
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

        {/* Suivi pour commandes actives */}
        {displayInfo.isActive && (
          <OrderTracker item={item} />
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
  isLoading 
}: { 
  orders: OrderList[]; 
  onRefresh: () => void;
  isLoading: boolean;
}) => {
  const activeOrders = orders.filter(o => 
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  );

  if (activeOrders.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Commandes en cours</Text>
        <Pressable onPress={onRefresh} disabled={isLoading}>
          <Ionicons 
            name="refresh" 
            size={20} 
            color={isLoading ? "#ccc" : "#007AFF"} 
          />
        </Pressable>
      </View>
      {activeOrders.map(order => (
        <OrderCard key={order.id} item={order} />
      ))}
    </View>
  );
});

// Section historique
const HistorySection = React.memo(({ orders }: { orders: OrderList[] }) => {
  const historyOrders = orders.filter(o => 
    ['served', 'cancelled'].includes(o.status)
  ).slice(0, 5); // Limiter à 5 commandes récentes

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

// Composant principal simplifié
export default function ClientOrdersScreen() {
  const { isClient } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  
  const {
    orders,
    isLoading,
    error,
    fetchOrders,
  } = useClientOrders();

  // Auto-refresh pour commandes actives
  const hasActiveOrders = orders.some(o => 
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  }, [fetchOrders]);

  useAutoRefresh(hasActiveOrders, handleRefresh);

  // Rendu optimisé
  const renderContent = useCallback(() => {
    if (orders.length === 0 && !isLoading) {
      return <EmptyState />;
    }

    return (
      <FlatList
        data={[1]} // Dummy data pour utiliser FlatList avec RefreshControl
        renderItem={() => (
          <View style={styles.content}>
            <ActiveOrdersSection 
              orders={orders}
              onRefresh={handleRefresh}
              isLoading={refreshing}
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
  }, [orders, isLoading, refreshing, handleRefresh]);

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

// Styles simplifiés et optimisés
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
  },

  // Cartes de commande
  orderCard: {
    marginBottom: 16,
    padding: 20,
  },
  activeOrderCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  // En-tête de commande
  orderHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 16,
  },
  orderInfo: {
    flex: 1,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
    marginBottom: 4,
  },
  restaurantName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  orderMeta: {
    flexDirection: 'row' as const,
    gap: 16,
  },
  orderTime: {
    fontSize: 14,
    color: '#666',
  },
  itemsText: {
    fontSize: 14,
    color: '#666',
  },

  // Détails de commande
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

  // Suivi de commande
  trackerContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  trackerTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
    marginBottom: 12,
  },
  trackerSteps: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  trackerStep: {
    alignItems: 'center' as const,
    flex: 1,
    position: 'relative' as const,
  },
  trackerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  trackerIconCompleted: {
    backgroundColor: '#10B981',
  },
  trackerIconCurrent: {
    backgroundColor: '#FF6B35',
  },
  trackerLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center' as const,
  },
  trackerLabelCompleted: {
    color: '#10B981',
    fontWeight: '500' as const,
  },
  trackerLabelCurrent: {
    color: '#FF6B35',
    fontWeight: '600' as const,
  },
  trackerLine: {
    position: 'absolute' as const,
    top: 16,
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: '#E5E7EB',
    zIndex: -1,
  },
  trackerLineCompleted: {
    backgroundColor: '#10B981',
  },

  // Temps d'attente
  waitingTime: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
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

  // État vide
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

  // États d'erreur et de chargement
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