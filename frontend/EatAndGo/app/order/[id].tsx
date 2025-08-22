import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Pressable,
  Alert,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useOrder } from '@/contexts/OrderContext';
import { OrderDetail, OrderItem } from '@/types/order';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/common/StatusBadge';

// Constantes de design responsive
const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

// Couleurs de la charte
const COLORS = {
  primary: '#1E2A78',    // Bleu principal
  secondary: '#FFC845',  // Jaune/Orange
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF',
  },
  border: '#E5E7EB',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

// Hook pour détecter le type d'écran
const useScreenType = () => {
  const { width } = useWindowDimensions();
  
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
};

// Composant pour un item de commande avec design responsive
const OrderItemCard = React.memo(({ item }: { item: OrderItem }) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  return (
    <Card style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.menu_item_name || `Item #${item.menu_item}`}</Text>
        <Text style={styles.itemPrice}>{item.total_price}€</Text>
      </View>
      
      <View style={styles.itemDetails}>
        <Text style={styles.itemQuantity}>Quantité: {item.quantity}</Text>
        <Text style={styles.itemUnitPrice}>Prix unitaire: {item.unit_price}€</Text>
      </View>
      
      {item.special_instructions && (
        <View style={styles.itemInstructions}>
          <Text style={styles.instructionsLabel}>Instructions spéciales:</Text>
          <Text style={styles.instructionsText}>{item.special_instructions}</Text>
        </View>
      )}
      
      {item.customizations && Object.keys(item.customizations).length > 0 && (
        <View style={styles.itemCustomizations}>
          <Text style={styles.customizationsLabel}>Personnalisations:</Text>
          {Object.entries(item.customizations).map(([key, value]) => (
            <Text key={key} style={styles.customizationText}>
              • {key}: {String(value)}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
});

// Actions pour restaurateurs avec design responsive
const RestaurantActions = React.memo(({ 
  order, 
  onStatusUpdate, 
  onMarkAsPaid,
  isUpdating 
}: {
  order: OrderDetail;
  onStatusUpdate: (status: string) => void;
  onMarkAsPaid: (paymentMethod: string) => void;
  isUpdating: boolean;
}) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  const canUpdateStatus = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
  const canMarkAsPaid = order.payment_status !== 'paid' && order.status !== 'cancelled';

  const statusFlow = {
    'pending': { next: 'confirmed', label: 'Confirmer' },
    'confirmed': { next: 'preparing', label: 'En préparation' },
    'preparing': { next: 'ready', label: 'Prête' },
    'ready': { next: 'served', label: 'Servir' }
  };

  const nextStatus = statusFlow[order.status as keyof typeof statusFlow];

  const handleMarkAsPaid = () => {
    Alert.alert(
      'Marquer comme payée',
      'Quelle méthode de paiement ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Espèces', onPress: () => onMarkAsPaid('cash') },
        { text: 'Carte', onPress: () => onMarkAsPaid('card') },
      ]
    );
  };

  return (
    <View style={styles.actionsSection}>
      <Text style={styles.sectionTitle}>Actions</Text>
      
      <View style={styles.actionButtons}>
        {canUpdateStatus && nextStatus && (
          <Pressable
            style={[styles.actionButton, styles.statusButton]}
            onPress={() => onStatusUpdate(nextStatus.next)}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
                <Text style={styles.actionButtonText}>{nextStatus.label}</Text>
              </>
            )}
          </Pressable>
        )}

        {canMarkAsPaid && (
          <Pressable
            style={[styles.actionButton, styles.paymentButton]}
            onPress={handleMarkAsPaid}
            disabled={isUpdating}
          >
            <Ionicons name="card" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Encaisser</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});

// Bouton de paiement pour les clients
const ClientPaymentButton = React.memo(({ order }: { order: OrderDetail }) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  const shouldShowPayButton = order.payment_status !== 'paid' && order.status !== 'cancelled';
  
  if (!shouldShowPayButton) return null;

  const handlePayPress = () => {
    router.push(`/order/payment?orderId=${order.id}`);
  };

  return (
    <View style={styles.paymentButtonContainer}>
      <Pressable
        style={styles.payButton}
        onPress={handlePayPress}
      >
        <Ionicons name="card" size={20} color="#fff" />
        <Text style={styles.payButtonText}>
          Payer {order.total_amount || order.subtotal}€
        </Text>
      </Pressable>
    </View>
  );
});

// Timeline de la commande avec design responsive
const OrderTimeline = React.memo(({ order }: { order: OrderDetail }) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  const timelineEvents = [
    {
      status: 'pending',
      label: 'Commande créée',
      time: order.created_at,
      completed: true
    },
    {
      status: 'confirmed',
      label: 'Commande confirmée',
      time: order.status === 'confirmed' ? order.updated_at : null,
      completed: ['confirmed', 'preparing', 'ready', 'served'].includes(order.status)
    },
    {
      status: 'preparing',
      label: 'En préparation',
      time: order.status === 'preparing' ? order.updated_at : null,
      completed: ['preparing', 'ready', 'served'].includes(order.status)
    },
    {
      status: 'ready',
      label: 'Prête',
      time: order.ready_at || (order.status === 'ready' ? order.updated_at : null),
      completed: ['ready', 'served'].includes(order.status)
    },
    {
      status: 'served',
      label: 'Servie',
      time: order.served_at || (order.status === 'served' ? order.updated_at : null),
      completed: order.status === 'served'
    }
  ];

  const formatTime = (timeString?: string | null) => {
    if (!timeString) return null;
    const date = new Date(timeString);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.timelineSection}>
      <Text style={styles.sectionTitle}>Suivi de la commande</Text>
      
      <View style={styles.timelineContainer}>
        {timelineEvents.map((event, index) => (
          <View key={event.status} style={styles.timelineEvent}>
            <View style={styles.timelineIconContainer}>
              <View style={[
                styles.timelineIcon,
                event.completed && styles.timelineIconCompleted
              ]}>
                {event.completed && (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                )}
              </View>
              {index < timelineEvents.length - 1 && (
                <View style={[
                  styles.timelineLine,
                  event.completed && styles.timelineLineCompleted
                ]} />
              )}
            </View>
            
            <View style={styles.timelineContent}>
              <Text style={[
                styles.timelineLabel,
                event.completed && styles.timelineLabelCompleted
              ]}>
                {event.label}
              </Text>
              {event.time && (
                <Text style={styles.timelineTime}>
                  {formatTime(event.time)}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

// Composant principal
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRestaurateur, isClient } = useAuth();
  const { getOrder, updateOrderStatus, markAsPaid } = useOrder();
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les détails de la commande
  useEffect(() => {
    if (!id) return;

    const loadOrder = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('🔍 Loading order details for:', id);
        const orderData = await getOrder(parseInt(id));
        
        if (orderData) {
          setOrder(orderData);
          console.log('✅ Order loaded:', orderData);
        } else {
          setError('Commande introuvable');
        }
      } catch (err) {
        console.error('❌ Error loading order:', err);
        setError('Erreur lors du chargement de la commande');
      } finally {
        setIsLoading(false);
      }
    };

    loadOrder();
  }, [id, getOrder]);

  // Gérer la mise à jour du statut
  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;

    setIsUpdating(true);
    try {
      console.log('🔄 Updating order status:', order.id, newStatus);
      const updatedOrder = await updateOrderStatus(order.id, newStatus);
      setOrder(updatedOrder);
      console.log('✅ Order status updated');
    } catch (error) {
      console.error('❌ Error updating status:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
    } finally {
      setIsUpdating(false);
    }
  };

  // Gérer le marquage comme payé
  const handleMarkAsPaid = async (paymentMethod: string) => {
    if (!order) return;

    setIsUpdating(true);
    try {
      console.log('💳 Marking order as paid:', order.id, paymentMethod);
      const updatedOrder = await markAsPaid(order.id, paymentMethod);
      setOrder(updatedOrder);
      console.log('✅ Order marked as paid');
    } catch (error) {
      console.error('❌ Error marking as paid:', error);
      Alert.alert('Erreur', 'Impossible de marquer comme payée');
    } finally {
      setIsUpdating(false);
    }
  };

  // État de chargement
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header 
          title="Détails de la commande" 
          showBackButton
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // État d'erreur
  if (error || !order) {
    return (
      <SafeAreaView style={styles.container}>
        <Header 
          title="Détails de la commande" 
          showBackButton
        />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={styles.errorTitle}>Erreur</Text>
          <Text style={styles.errorMessage}>
            {error || 'Commande introuvable'}
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Calculs pour l'affichage
  const displayInfo = {
    title: `Commande ${order.order_number || `#${order.id}`}`,
    restaurantName: order.restaurant_name || 'Restaurant',
    customerName: order.customer_name || order.customer_display || 'Client anonyme',
    date: new Date(order.created_at).toLocaleDateString('fr-FR'),
    time: new Date(order.created_at).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    }),
    isActive: ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status),
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header 
        title={displayInfo.title}
        showBackButton
      />

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainLayout}>
          {/* Colonne principale */}
          <View style={styles.mainColumn}>
            {/* Informations générales */}
            <Card style={styles.headerCard}>
              <View style={styles.orderHeader}>
                <View style={styles.orderInfo}>
                  <Text style={styles.orderTitle}>{displayInfo.title}</Text>
                  <Text style={styles.restaurantName}>{displayInfo.restaurantName}</Text>
                  <Text style={styles.customerName}>{displayInfo.customerName}</Text>
                  <Text style={styles.orderDateTime}>
                    {displayInfo.date} à {displayInfo.time}
                  </Text>
                </View>
                <StatusBadge status={order.status} />
              </View>

              {/* Détails de la commande */}
              <View style={styles.orderDetails}>
                {order.table_number && (
                  <View style={styles.detailItem}>
                    <Ionicons name="restaurant-outline" size={16} color={COLORS.text.secondary} />
                    <Text style={styles.detailText}>Table {order.table_number}</Text>
                  </View>
                )}
                
                <View style={styles.detailItem}>
                  <Ionicons 
                    name={order.order_type === 'dine_in' ? "restaurant" : "bag"} 
                    size={16} 
                    color={COLORS.text.secondary} 
                  />
                  <Text style={styles.detailText}>
                    {order.order_type === 'dine_in' ? 'Sur place' : 'À emporter'}
                  </Text>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons 
                    name={order.payment_status === 'paid' ? "checkmark-circle" : "time"} 
                    size={16} 
                    color={order.payment_status === 'paid' ? COLORS.success : COLORS.warning} 
                  />
                  <Text style={[
                    styles.detailText,
                    { color: order.payment_status === 'paid' ? COLORS.success : COLORS.warning }
                  ]}>
                    {order.payment_status === 'paid' ? 'Payée' : 'Paiement en attente'}
                  </Text>
                  {order.payment_method && order.payment_status === 'paid' && (
                    <Text style={styles.paymentMethod}>
                      ({order.payment_method === 'cash' ? 'Espèces' : 'Carte'})
                    </Text>
                  )}
                </View>

                {order.waiting_time && displayInfo.isActive && (
                  <View style={styles.detailItem}>
                    <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                    <Text style={styles.detailText}>
                      Temps estimé: {order.waiting_time} min
                    </Text>
                  </View>
                )}
              </View>

              {order.notes && (
                <View style={styles.notesSection}>
                  <Text style={styles.notesLabel}>Notes:</Text>
                  <Text style={styles.notesText}>{order.notes}</Text>
                </View>
              )}
            </Card>

            {/* Items de la commande */}
            <View style={styles.itemsSection}>
              <Text style={styles.sectionTitle}>Articles commandés</Text>
              {order.items.map((item) => (
                <OrderItemCard key={item.id} item={item} />
              ))}
            </View>

            {/* Totaux */}
            <Card style={styles.totalsCard}>
              <Text style={styles.sectionTitle}>Récapitulatif</Text>
              
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Sous-total:</Text>
                <Text style={styles.totalValue}>{order.subtotal}€</Text>
              </View>
              
              <View style={[styles.totalRow, styles.finalTotal]}>
                <Text style={styles.finalTotalLabel}>Total à payer:</Text>
                <Text style={styles.finalTotalValue}>{order.total_amount || order.subtotal}€</Text>
              </View>
            </Card>
          </View>

          {/* Colonne secondaire (timeline + actions) */}
          <View style={styles.sideColumn}>
            {/* Timeline */}
            <OrderTimeline order={order} />

            {/* Actions selon le type d'utilisateur */}
            {isRestaurateur && (
              <RestaurantActions
                order={order}
                onStatusUpdate={handleStatusUpdate}
                onMarkAsPaid={handleMarkAsPaid}
                isUpdating={isUpdating}
              />
            )}

            {/* Bouton de paiement pour les clients */}
            {isClient && (
              <ClientPaymentButton order={order} />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fonction pour créer les styles responsive
const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop') => {
  const isTabletOrLarger = screenType !== 'mobile';
  const isDesktop = screenType === 'desktop';
  
  return {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: isTabletOrLarger ? 24 : 16,
      paddingBottom: 32,
    },
    
    // Layout principal responsive
    mainLayout: {
      flexDirection: (isTabletOrLarger ? 'row' : 'column') as 'row' | 'column',
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center' as const,
      width: '100%' as '100%'
    },
    mainColumn: {
      flex: isTabletOrLarger ? 2 : 1,
      marginRight: isTabletOrLarger ? 24 : 0,
    },
    sideColumn: {
      flex: 1,
      minWidth: isTabletOrLarger ? 300 : undefined,
    },
    
    // États
    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: COLORS.text.secondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 32,
    },
    errorTitle: {
      fontSize: isTabletOrLarger ? 28 : 24,
      fontWeight: 'bold' as const,
      color: COLORS.error,
      marginTop: 16,
      marginBottom: 8,
    },
    errorMessage: {
      fontSize: 16,
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginBottom: 24,
    },
    retryButton: {
      backgroundColor: COLORS.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    retryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600' as const,
    },

    // En-tête
    headerCard: {
      marginBottom: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    orderHeader: {
      flexDirection: (isTabletOrLarger ? 'row' : 'column') as 'row' | 'column',
      justifyContent: 'space-between' as const,
      alignItems: (isTabletOrLarger ? 'flex-start' : 'stretch') as 'flex-start' | 'stretch',
      marginBottom: 16,
      gap: isTabletOrLarger ? 0 : 12,
    },
    orderInfo: {
      flex: 1,
    },
    orderTitle: {
      fontSize: isTabletOrLarger ? 24 : 20,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    restaurantName: {
      fontSize: isTabletOrLarger ? 18 : 16,
      color: COLORS.text.secondary,
      marginBottom: 4,
    },
    customerName: {
      fontSize: 16,
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    orderDateTime: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },

    // Détails
    orderDetails: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: isTabletOrLarger ? 20 : 16,
      marginBottom: 16,
    },
    detailItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      minWidth: isTabletOrLarger ? 200 : undefined,
    },
    detailText: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },
    paymentMethod: {
      fontSize: 12,
      color: COLORS.text.light,
      marginLeft: 4,
    },

    // Notes
    notesSection: {
      backgroundColor: '#F8F9FA',
      padding: 12,
      borderRadius: 8,
    },
    notesLabel: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    notesText: {
      fontSize: 14,
      color: COLORS.text.secondary,
      lineHeight: 20,
    },

    // Timeline
    timelineSection: {
      marginBottom: 16,
    },
    timelineContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    timelineEvent: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginBottom: 12,
    },
    timelineIconContainer: {
      alignItems: 'center' as const,
      marginRight: 12,
    },
    timelineIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: COLORS.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    timelineIconCompleted: {
      backgroundColor: COLORS.success,
    },
    timelineLine: {
      width: 2,
      height: 20,
      backgroundColor: COLORS.border,
      marginTop: 4,
    },
    timelineLineCompleted: {
      backgroundColor: COLORS.success,
    },
    timelineContent: {
      flex: 1,
    },
    timelineLabel: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },
    timelineLabelCompleted: {
      color: COLORS.text.primary,
      fontWeight: '500' as const,
    },
    timelineTime: {
      fontSize: 12,
      color: COLORS.text.light,
      marginTop: 2,
    },

    // Items
    itemsSection: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: isTabletOrLarger ? 20 : 18,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
      marginBottom: 12,
    },
    itemCard: {
      marginBottom: 12,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    itemHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: 8,
    },
    itemName: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginRight: 12,
    },
    itemPrice: {
      fontSize: 16,
      fontWeight: 'bold' as const,
      color: COLORS.secondary,
    },
    itemDetails: {
      flexDirection: 'row' as const,
      gap: 16,
      marginBottom: 8,
    },
    itemQuantity: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },
    itemUnitPrice: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },
    itemInstructions: {
      backgroundColor: '#FFF7ED',
      padding: 8,
      borderRadius: 6,
      marginBottom: 8,
    },
    instructionsLabel: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: COLORS.secondary,
      marginBottom: 4,
    },
    instructionsText: {
      fontSize: 14,
      color: COLORS.text.primary,
    },
    itemCustomizations: {
      backgroundColor: '#F3F4F6',
      padding: 8,
      borderRadius: 6,
    },
    customizationsLabel: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: COLORS.text.secondary,
      marginBottom: 4,
    },
    customizationText: {
      fontSize: 13,
      color: COLORS.text.primary,
      marginBottom: 2,
    },

    // Totaux
    totalsCard: {
      marginBottom: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    totalRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 8,
    },
    totalLabel: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },
    totalValue: {
      fontSize: 14,
      color: COLORS.text.primary,
    },
    finalTotal: {
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
      paddingTop: 8,
      marginTop: 8,
    },
    finalTotalLabel: {
      fontSize: isTabletOrLarger ? 18 : 16,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
    },
    finalTotalValue: {
      fontSize: isTabletOrLarger ? 18 : 16,
      fontWeight: 'bold' as const,
      color: COLORS.secondary,
    },

    // Actions
    actionsSection: {
      marginBottom: 16,
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    actionButtons: {
      flexDirection: (isTabletOrLarger ? 'column' : 'row') as 'row' | 'column',
      gap: 12,
    },
    actionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      gap: 6,
      flex: isTabletOrLarger ? undefined : 1,
      minHeight: 44,
    },
    statusButton: {
      backgroundColor: COLORS.primary,
    },
    paymentButton: {
      backgroundColor: COLORS.success,
    },
    actionButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600' as const,
    },

    // Bouton de paiement pour clients
    paymentButtonContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    payButton: {
      backgroundColor: COLORS.secondary,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderRadius: 12,
      gap: 8,
      minHeight: 52,
      shadowColor: COLORS.secondary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    payButtonText: {
      color: '#fff',
      fontSize: isTabletOrLarger ? 18 : 16,
      fontWeight: 'bold' as const,
    },
  };
};