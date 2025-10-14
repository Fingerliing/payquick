import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Alert,
  Dimensions,
  useWindowDimensions,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useOrder } from '@/contexts/OrderContext';
import { OrderDetail, OrderItem } from '@/types/order';
import { Header } from '@/components/ui/Header';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Receipt } from '@/components/receipt/Receipt';

// Design System aligné sur l'existant
const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

const COLORS = {
  primary: '#1E2A78',
  secondary: '#D4AF37',     // Or classique
  accent: '#B8941F',        // Texte doré
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  background: '#F8FAFC',    // Arrière-plan plus doux
  surface: '#FFFFFF',
  goldenSurface: '#FFFCF0',
  overlay: 'rgba(30, 42, 120, 0.95)', // Overlay premium
  text: {
    primary: '#0F172A',     // Texte plus contrasté
    secondary: '#475569',   // Gris plus doux
    light: '#64748B',
    inverse: '#FFFFFF',
    golden: '#B8941F',
  },
  border: {
    light: '#F1F5F9',
    default: '#E2E8F0',
    medium: '#CBD5E1',
    golden: '#E6D08A',
  },
  shadow: {
    light: 'rgba(15, 23, 42, 0.04)',
    default: 'rgba(15, 23, 42, 0.08)',
    medium: 'rgba(15, 23, 42, 0.12)',
    dark: 'rgba(15, 23, 42, 0.20)',
    golden: 'rgba(212, 175, 55, 0.25)',
  },
  gradient: {
    primary: ['#1E2A78', '#2D3A8C'],
    secondary: ['#D4AF37', '#B8941F'],
    success: ['#10B981', '#059669'],
    surface: ['#FFFFFF', '#F8FAFC'],
    golden: ['#FFFCF0', '#FFF8E7'],
    instructions: ['#FFF7ED', '#FEF3C7'],
  }
};

// Hook pour détecter le type d'écran
const useScreenType = () => {
  const { width } = useWindowDimensions();
  
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
};

// Animation hook pour les micro-interactions
const useScaleAnimation = (initialValue = 1) => {
  const scaleValue = React.useRef(new Animated.Value(initialValue)).current;
  
  const scaleIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 300,
      friction: 5,
    }).start();
  };

  const scaleOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 5,
    }).start();
  };

  return { scaleValue, scaleIn, scaleOut };
};

// Composant amélioré pour les items avec animations
const OrderItemCard = React.memo(({ item, index }: { item: OrderItem; index: number }) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  const { scaleValue, scaleIn, scaleOut } = useScaleAnimation();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, []);

  const hasCustomizations = item.customizations && Object.keys(item.customizations).length > 0;
  const hasInstructions = item.special_instructions;

  return (
    <Animated.View style={{ 
      opacity: fadeAnim,
      transform: [{ scale: scaleValue }],
    }}>
      <Pressable
        onPressIn={scaleIn}
        onPressOut={scaleOut}
        style={styles.itemCard}
      >
        <LinearGradient
          colors={['#FFFFFF', '#F8FAFC']}
          style={styles.itemGradient}
        >
          {/* En-tête avec badge premium si customisé */}
          <View style={styles.itemHeader}>
            <View style={styles.itemTitleContainer}>
              <Text style={styles.itemName}>
                {item.menu_item_name || `Item #${item.menu_item}`}
              </Text>
              {(hasCustomizations || hasInstructions) && (
                <View style={styles.premiumBadge}>
                  <Ionicons name="star" size={12} color={COLORS.secondary} />
                  <Text style={styles.premiumText}>Personnalisé</Text>
                </View>
              )}
            </View>
            <View style={styles.priceContainer}>
              <Text style={styles.itemPrice}>{item.total_price}€</Text>
            </View>
          </View>

          {/* Détails avec meilleure hiérarchie */}
          <View style={styles.itemDetails}>
            <View style={styles.detailBadge}>
              <Ionicons name="layers-outline" size={14} color={COLORS.text.secondary} />
              <Text style={styles.itemQuantity}>Qté: {item.quantity}</Text>
            </View>
            <View style={styles.detailBadge}>
              <Ionicons name="card-outline" size={14} color={COLORS.text.secondary} />
              <Text style={styles.itemUnitPrice}>Prix unitaire: {item.unit_price}€</Text>
            </View>
          </View>

          {/* Instructions spéciales avec design premium */}
          {hasInstructions && (
            <View style={styles.instructionsContainer}>
              <LinearGradient
                colors={['#FFF7ED', '#FEF3C7']}
                style={styles.instructionsGradient}
              >
                <View style={styles.instructionsHeader}>
                  <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.warning} />
                  <Text style={styles.instructionsLabel}>Instructions spéciales</Text>
                </View>
                <Text style={styles.instructionsText}>{item.special_instructions}</Text>
              </LinearGradient>
            </View>
          )}

          {/* Personnalisations avec style premium */}
          {hasCustomizations && (
            <View style={styles.customizationsContainer}>
              <LinearGradient
                colors={['#FFFCF0', '#FFF8E7']}
                style={styles.customizationsGradient}
              >
                <View style={styles.customizationsHeader}>
                  <Ionicons name="options" size={16} color={COLORS.accent} />
                  <Text style={styles.customizationsLabel}>Personnalisations</Text>
                </View>
                <View style={styles.customizationsList}>
                  {Object.entries(item.customizations || {}).map(([key, value], idx) => (
                    <View key={idx} style={styles.customizationItem}>
                      <View style={styles.customizationDot} />
                      <Text style={styles.customizationText}>
                        <Text style={styles.customizationKey}>{key}:</Text> {String(value)}
                      </Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
});

// Bouton de suivi gamifié pour tous les utilisateurs
const GamifiedTrackingButton = React.memo(({ orderId, orderStatus }: { 
  orderId: number; 
  orderStatus: string;
}) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  const { scaleValue, scaleIn, scaleOut } = useScaleAnimation();
  
  // Afficher uniquement si la commande est active
  const isActiveOrder = ['pending', 'confirmed', 'preparing', 'ready'].includes(orderStatus);
  
  if (!isActiveOrder) return null;

  const handleTrackingPress = () => {
    router.push(`/order/tracking/${orderId}`);
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleValue }], marginBottom: 16 }}>
      <Pressable
        style={styles.trackingButtonContainer}
        onPress={handleTrackingPress}
        onPressIn={scaleIn}
        onPressOut={scaleOut}
      >
        <LinearGradient
          colors={['#8B5CF6', '#7C3AED', '#6D28D9']}
          style={styles.trackingButtonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Icônes flottantes d'animation */}
          <View style={styles.trackingIconsContainer}>
            <Text style={styles.floatingIcon}>🎮</Text>
            <Text style={styles.floatingIcon}>⭐</Text>
            <Text style={styles.floatingIcon}>🏆</Text>
          </View>

          <View style={styles.trackingButtonContent}>
            <View style={styles.trackingMainInfo}>
              <View style={styles.trackingTitleRow}>
                <Ionicons name="game-controller" size={24} color="#fff" />
                <Text style={styles.trackingButtonTitle}>Suivre ma commande</Text>
              </View>
              <Text style={styles.trackingButtonSubtitle}>
                Progression en temps réel avec badges et points
              </Text>
            </View>
            
            <View style={styles.trackingArrowContainer}>
              <Ionicons name="arrow-forward" size={24} color="#fff" />
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
});

// Actions pour restaurateurs avec bouton ticket de caisse
const RestaurantActions = React.memo(({ 
  order, 
  onStatusUpdate, 
  onMarkAsPaid,
  onShowReceipt,
  isUpdating 
}: {
  order: OrderDetail;
  onStatusUpdate: (status: string) => void;
  onMarkAsPaid: (paymentMethod: string) => void;
  onShowReceipt: () => void;
  isUpdating: boolean;
}) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  const canUpdateStatus = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
  const canMarkAsPaid = order.payment_status !== 'paid' && order.status !== 'cancelled';
  const canShowReceipt = order.payment_status === 'paid' || order.status === 'served';

  const statusFlow = {
    'pending': { next: 'confirmed', label: 'Confirmer', icon: 'checkmark-circle' },
    'confirmed': { next: 'preparing', label: 'En préparation', icon: 'restaurant' },
    'preparing': { next: 'ready', label: 'Prête', icon: 'checkmark-done' },
    'ready': { next: 'served', label: 'Servir', icon: 'hand-left' }
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
    <>
      {/* 🎮 Bouton de suivi gamifié */}
      <GamifiedTrackingButton orderId={order.id} orderStatus={order.status} />

      <LinearGradient
        colors={['#FFFFFF', '#F8FAFC']}
        style={styles.actionsCard}
      >
        <View style={styles.actionsHeader}>
          <Ionicons name="flash" size={20} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Actions rapides</Text>
        </View>
        
        <View style={styles.actionButtons}>
          {canUpdateStatus && nextStatus && (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.statusButton,
                pressed && styles.buttonPressed
              ]}
              onPress={() => onStatusUpdate(nextStatus.next)}
              disabled={isUpdating}
            >
              <LinearGradient
                colors={['#1E2A78', '#2D3A8C']}
                style={styles.buttonGradient}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={nextStatus.icon as any} size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>{nextStatus.label}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          )}

          {canMarkAsPaid && (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.paymentButton,
                pressed && styles.buttonPressed
              ]}
              onPress={handleMarkAsPaid}
              disabled={isUpdating}
            >
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.buttonGradient}
              >
                <Ionicons name="card" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Encaisser</Text>
              </LinearGradient>
            </Pressable>
          )}

          {/* Bouton Ticket de caisse pour restaurateurs */}
          {canShowReceipt && (
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.receiptButton,
                pressed && styles.buttonPressed
              ]}
              onPress={onShowReceipt}
              disabled={isUpdating}
            >
              <LinearGradient
                colors={['#D4AF37', '#B8941F']}
                style={styles.buttonGradient}
              >
                <Ionicons name="receipt" size={18} color="#fff" />
                <Text style={styles.actionButtonText}>Ticket de caisse</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </LinearGradient>
    </>
  );
});

// Bouton de paiement client avec option ticket de caisse
const ClientPaymentButton = React.memo(({ order, onShowReceipt }: { 
  order: OrderDetail; 
  onShowReceipt: () => void;
}) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  const { scaleValue, scaleIn, scaleOut } = useScaleAnimation();
  
  const shouldShowPayButton = order.payment_status !== 'paid' && order.status !== 'cancelled';
  const canShowReceipt = order.payment_status === 'paid';

  const handlePayPress = () => {
    router.push(`/order/payment?orderId=${order.id}`);
  };

  return (
    <View style={styles.paymentSection}>
      {/* 🎮 Bouton de suivi gamifié */}
      <GamifiedTrackingButton orderId={order.id} orderStatus={order.status} />

      {/* Bouton de paiement principal */}
      {shouldShowPayButton && (
        <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
          <Pressable
            style={styles.payButtonContainer}
            onPress={handlePayPress}
            onPressIn={scaleIn}
            onPressOut={scaleOut}
          >
            <LinearGradient
              colors={['#D4AF37', '#B8941F']}
              style={styles.payButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.payButtonContent}>
                <Ionicons name="card" size={24} color="#fff" />
                <View>
                  <Text style={styles.payButtonText}>Payer maintenant</Text>
                  <Text style={styles.payButtonAmount}>{order.total_amount || order.subtotal}€</Text>
                </View>
              </View>
              <View style={styles.payButtonArrow}>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {/* Bouton ticket de caisse pour clients (si payée) */}
      {canShowReceipt && (
        <Pressable
          style={styles.receiptButtonClient}
          onPress={onShowReceipt}
        >
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC']}
            style={styles.receiptButtonGradient}
          >
            <Ionicons name="receipt-outline" size={20} color={COLORS.primary} />
            <Text style={styles.receiptButtonText}>Voir le ticket de caisse</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.text.secondary} />
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );
});

// Timeline redesignée avec animations
const OrderTimeline = React.memo(({ order }: { order: OrderDetail }) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  const timelineEvents = [
    {
      status: 'pending',
      label: 'Commande créée',
      time: order.created_at,
      completed: true,
      icon: 'receipt-outline' as const,
      color: COLORS.info
    },
    {
      status: 'confirmed',
      label: 'Confirmée',
      time: order.status === 'confirmed' ? order.updated_at : null,
      completed: ['confirmed', 'preparing', 'ready', 'served'].includes(order.status),
      icon: 'checkmark-circle-outline' as const,
      color: COLORS.primary
    },
    {
      status: 'preparing',
      label: 'En préparation',
      time: order.status === 'preparing' ? order.updated_at : null,
      completed: ['preparing', 'ready', 'served'].includes(order.status),
      icon: 'restaurant-outline' as const,
      color: COLORS.secondary
    },
    {
      status: 'ready',
      label: 'Prête',
      time: order.ready_at || (order.status === 'ready' ? order.updated_at : null),
      completed: ['ready', 'served'].includes(order.status),
      icon: 'checkmark-done-outline' as const,
      color: COLORS.warning
    },
    {
      status: 'served',
      label: 'Servie',
      time: order.served_at || (order.status === 'served' ? order.updated_at : null),
      completed: order.status === 'served',
      icon: 'trophy-outline' as const,
      color: COLORS.success
    }
  ];

  const formatTime = (timeString?: string | null) => {
    if (!timeString) return null;
    const date = new Date(timeString);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F8FAFC']}
      style={styles.timelineCard}
    >
      <View style={styles.timelineHeader}>
        <Ionicons name="time" size={20} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>Suivi de la commande</Text>
      </View>
      
      <View style={styles.timelineContainer}>
        {timelineEvents.map((event, index) => (
          <View key={event.status} style={styles.timelineEvent}>
            <View style={styles.timelineIconContainer}>
              <View style={[
                styles.timelineIcon,
                { 
                  backgroundColor: event.completed ? event.color : COLORS.border.medium,
                  borderColor: event.color,
                }
              ]}>
                <Ionicons 
                  name={event.icon} 
                  size={16} 
                  color={event.completed ? '#fff' : COLORS.text.light} 
                />
              </View>
              {index < timelineEvents.length - 1 && (
                <View style={[
                  styles.timelineLine,
                  event.completed && { backgroundColor: event.color }
                ]} />
              )}
            </View>
            
            <View style={styles.timelineContent}>
              <Text style={[
                styles.timelineLabel,
                event.completed && { color: COLORS.text.primary, fontWeight: '600' }
              ]}>
                {event.label}
              </Text>
              {event.time && (
                <View style={styles.timeTimeContainer}>
                  <Ionicons name="time-outline" size={12} color={COLORS.text.light} />
                  <Text style={styles.timelineTime}>
                    {formatTime(event.time)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
});

// Modal Receipt Component
const ReceiptModal = React.memo(({ 
  visible, 
  onClose, 
  order 
}: { 
  visible: boolean; 
  onClose: () => void; 
  order: OrderDetail;
}) => {
  const screenType = useScreenType();
  const styles = createStyles(screenType);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <Receipt
          orderId={String(order.id)}
          order={order}
          showActions={true}
          onClose={onClose}
        />
      </SafeAreaView>
    </Modal>
  );
});

// Composant principal amélioré
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
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const fadeAnim = React.useRef(new Animated.Value(0)).current;

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
          
          // Animation d'apparition
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }).start();
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

  // Afficher le ticket de caisse
  const handleShowReceipt = () => {
    setShowReceiptModal(true);
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
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Chargement des détails...</Text>
          </View>
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
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          </View>
          <Text style={styles.errorTitle}>Oops !</Text>
          <Text style={styles.errorMessage}>
            {error || 'Cette commande est introuvable'}
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <LinearGradient
              colors={['#1E2A78', '#2D3A8C']}
              style={styles.retryGradient}
            >
              <Text style={styles.retryButtonText}>Retour</Text>
            </LinearGradient>
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
    date: new Date(order.created_at).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }),
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

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView 
          style={styles.content} 
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainLayout}>
            {/* Colonne principale */}
            <View style={styles.mainColumn}>
              {/* En-tête premium avec gradient */}
              <LinearGradient
                colors={order.payment_status === 'paid' 
                  ? ['#10B981', '#059669'] 
                  : ['#1E2A78', '#2D3A8C']}
                style={styles.headerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.headerContent}>
                  <View style={styles.orderMainInfo}>
                    <Text style={styles.orderTitle}>{displayInfo.title}</Text>
                    <Text style={styles.restaurantName}>{displayInfo.restaurantName}</Text>
                    <Text style={styles.customerName}>{displayInfo.customerName}</Text>
                    <View style={styles.dateTimeContainer}>
                      <Ionicons name="calendar" size={14} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.orderDateTime}>
                        {displayInfo.date} à {displayInfo.time}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.headerBadges}>
                    <StatusBadge status={order.status} />
                    {order.payment_status === 'paid' && (
                      <View style={styles.paidBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.paidText}>Payée</Text>
                      </View>
                    )}
                  </View>
                </View>
              </LinearGradient>

              {/* Informations détaillées */}
              <LinearGradient
                colors={['#FFFFFF', '#F8FAFC']}
                style={styles.detailsCard}
              >
                <View style={styles.orderDetails}>
                  {order.table_number && (
                    <View style={styles.detailChip}>
                      <Ionicons name="restaurant-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.detailText}>Table {order.table_number}</Text>
                    </View>
                  )}
                  
                  <View style={styles.detailChip}>
                    <Ionicons 
                      name={order.order_type === 'dine_in' ? "restaurant" : "bag"} 
                      size={16} 
                      color={COLORS.secondary} 
                    />
                    <Text style={styles.detailText}>
                      {order.order_type === 'dine_in' ? 'Sur place' : 'À emporter'}
                    </Text>
                  </View>

                  {order.waiting_time && displayInfo.isActive && (
                    <View style={styles.detailChip}>
                      <Ionicons name="hourglass-outline" size={16} color={COLORS.warning} />
                      <Text style={styles.detailText}>
                        Temps estimé: {order.waiting_time} min
                      </Text>
                    </View>
                  )}
                </View>

                {order.notes && (
                  <LinearGradient
                    colors={['#FFF7ED', '#FEF3C7']}
                    style={styles.notesContainer}
                  >
                    <View style={styles.notesHeader}>
                      <Ionicons name="chatbox-ellipses" size={16} color={COLORS.warning} />
                      <Text style={styles.notesLabel}>Notes de commande</Text>
                    </View>
                    <Text style={styles.notesText}>{order.notes}</Text>
                  </LinearGradient>
                )}
              </LinearGradient>

              {/* Items de la commande */}
              <View style={styles.itemsSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="receipt" size={20} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Articles commandés</Text>
                  <View style={styles.itemCount}>
                    <Text style={styles.itemCountText}>{order.items.length}</Text>
                  </View>
                </View>
                {order.items.map((item, index) => (
                  <OrderItemCard key={item.id} item={item} index={index} />
                ))}
              </View>

              {/* Récapitulatif avec design premium */}
              <LinearGradient
                colors={['#FFFCF0', '#FFF8E7']}
                style={styles.totalsCard}
              >
                <View style={styles.totalsHeader}>
                  <Ionicons name="calculator" size={20} color={COLORS.accent} />
                  <Text style={styles.sectionTitle}>Récapitulatif</Text>
                </View>
                
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Sous-total:</Text>
                  <Text style={styles.totalValue}>{order.subtotal}€</Text>
                </View>
                
                <View style={[styles.totalRow, styles.finalTotal]}>
                  <Text style={styles.finalTotalLabel}>Total à payer:</Text>
                  <Text style={styles.finalTotalValue}>{order.total_amount || order.subtotal}€</Text>
                </View>
              </LinearGradient>
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
                  onShowReceipt={handleShowReceipt}
                  isUpdating={isUpdating}
                />
              )}

              {/* Bouton de paiement pour les clients */}
              {isClient && (
                <ClientPaymentButton 
                  order={order} 
                  onShowReceipt={handleShowReceipt}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Modal Receipt */}
      <ReceiptModal
        visible={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        order={order}
      />
    </SafeAreaView>
  );
}

// Fonction pour créer les styles responsive améliorés
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
    
    // Layout responsive
    mainLayout: {
      flexDirection: (isTabletOrLarger ? 'row' : 'column') as 'row' | 'column',
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center' as const,
      width: '100%' as '100%',
      gap: isTabletOrLarger ? 24 : 16,
    },
    mainColumn: {
      flex: isTabletOrLarger ? 2 : 1,
    },
    sideColumn: {
      flex: 1,
      minWidth: isTabletOrLarger ? 320 : undefined,
    },
    
    // États améliorés
    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.background,
    },
    loadingContent: {
      alignItems: 'center' as const,
      backgroundColor: COLORS.surface,
      padding: 32,
      borderRadius: 20,
      ...COLORS.shadow.medium && {
        shadowColor: COLORS.shadow.medium,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
        elevation: 8,
      }
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: COLORS.text.secondary,
      fontWeight: '500' as const,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 32,
    },
    errorIcon: {
      backgroundColor: '#FEE2E2',
      width: 120,
      height: 120,
      borderRadius: 60,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginBottom: 20,
    },
    errorTitle: {
      fontSize: isTabletOrLarger ? 28 : 24,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
      marginBottom: 8,
    },
    errorMessage: {
      fontSize: 16,
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginBottom: 32,
      lineHeight: 24,
    },
    retryButton: {
      borderRadius: 12,
      overflow: 'hidden' as const,
    },
    retryGradient: {
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    retryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600' as const,
    },

    // En-tête premium avec gradient
    headerGradient: {
      borderRadius: 20,
      marginBottom: 20,
      overflow: 'hidden' as const,
      ...COLORS.shadow.medium && {
        shadowColor: COLORS.shadow.medium,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 12,
      }
    },
    headerContent: {
      padding: 24,
      flexDirection: (isTabletOrLarger ? 'row' : 'column') as 'row' | 'column',
      justifyContent: 'space-between' as const,
      alignItems: (isTabletOrLarger ? 'flex-start' : 'stretch') as 'flex-start' | 'stretch',
      gap: isTabletOrLarger ? 0 : 16,
    },
    orderMainInfo: {
      flex: 1,
    },
    orderTitle: {
      fontSize: isTabletOrLarger ? 28 : 24,
      fontWeight: 'bold' as const,
      color: '#fff',
      marginBottom: 6,
    },
    restaurantName: {
      fontSize: isTabletOrLarger ? 18 : 16,
      color: 'rgba(255,255,255,0.9)',
      marginBottom: 4,
    },
    customerName: {
      fontSize: 16,
      color: 'rgba(255,255,255,0.8)',
      marginBottom: 8,
    },
    dateTimeContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    orderDateTime: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.8)',
    },
    headerBadges: {
      alignItems: isTabletOrLarger ? 'flex-end' as const : 'flex-start' as const,
      gap: 8,
    },
    paidBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      gap: 6,
    },
    paidText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600' as const,
    },

    // Carte des détails
    detailsCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      ...COLORS.shadow.default && {
        shadowColor: COLORS.shadow.default,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
      }
    },
    orderDetails: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 12,
    },
    detailChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.goldenSurface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
    },
    detailText: {
      fontSize: 14,
      color: COLORS.text.primary,
      fontWeight: '500' as const,
    },

    // Notes améliorées
    notesContainer: {
      marginTop: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
    },
    notesHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginBottom: 8,
    },
    notesLabel: {
      fontSize: 14,
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    notesText: {
      fontSize: 14,
      color: COLORS.text.secondary,
      lineHeight: 20,
    },

    // Timeline améliorée
    timelineCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      ...COLORS.shadow.default && {
        shadowColor: COLORS.shadow.default,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
      }
    },
    timelineHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginBottom: 16,
    },
    timelineContainer: {
      paddingLeft: 4,
    },
    timelineEvent: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginBottom: 16,
    },
    timelineIconContainer: {
      alignItems: 'center' as const,
      marginRight: 16,
      zIndex: 1,
    },
    timelineIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: COLORS.surface,
    },
    timelineLine: {
      width: 2,
      height: 24,
      backgroundColor: COLORS.border.medium,
      marginTop: 8,
    },
    timelineContent: {
      flex: 1,
      paddingTop: 4,
    },
    timelineLabel: {
      fontSize: 15,
      color: COLORS.text.secondary,
      marginBottom: 4,
    },
    timeTimeContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    timelineTime: {
      fontSize: 12,
      color: COLORS.text.light,
    },

    // Section des items
    itemsSection: {
      marginBottom: 20,
    },
    sectionHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: isTabletOrLarger ? 20 : 18,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
      flex: 1,
    },
    itemCount: {
      backgroundColor: COLORS.primary,
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    itemCountText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: 'bold' as const,
    },

    // Cards d'items améliorées
    itemCard: {
      borderRadius: 16,
      marginBottom: 12,
      overflow: 'hidden' as const,
      ...COLORS.shadow.default && {
        shadowColor: COLORS.shadow.default,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 3,
      }
    },
    itemGradient: {
      padding: 16,
    },
    itemHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: 12,
    },
    itemTitleContainer: {
      flex: 1,
      marginRight: 12,
    },
    itemName: {
      fontSize: 16,
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: 6,
    },
    premiumBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.goldenSurface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
      alignSelf: 'flex-start' as const,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
    },
    premiumText: {
      fontSize: 11,
      color: COLORS.accent,
      fontWeight: '600' as const,
    },
    priceContainer: {
      backgroundColor: COLORS.secondary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    itemPrice: {
      fontSize: 16,
      fontWeight: 'bold' as const,
      color: '#fff',
    },
    itemDetails: {
      flexDirection: 'row' as const,
      gap: 16,
      marginBottom: 12,
    },
    detailBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.goldenSurface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      gap: 4,
    },
    itemQuantity: {
      fontSize: 13,
      color: COLORS.text.secondary,
      fontWeight: '500' as const,
    },
    itemUnitPrice: {
      fontSize: 13,
      color: COLORS.text.secondary,
      fontWeight: '500' as const,
    },

    // Instructions avec design premium
    instructionsContainer: {
      marginBottom: 12,
    },
    instructionsGradient: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#FCD34D',
    },
    instructionsHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginBottom: 6,
    },
    instructionsLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: COLORS.warning,
    },
    instructionsText: {
      fontSize: 14,
      color: COLORS.text.primary,
      lineHeight: 18,
    },

    // Personnalisations premium
    customizationsContainer: {
      marginBottom: 8,
    },
    customizationsGradient: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
    },
    customizationsHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginBottom: 8,
    },
    customizationsLabel: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: COLORS.accent,
    },
    customizationsList: {
      gap: 4,
    },
    customizationItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
    },
    customizationDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: COLORS.secondary,
    },
    customizationText: {
      fontSize: 13,
      color: COLORS.text.primary,
      flex: 1,
    },
    customizationKey: {
      fontWeight: '600' as const,
      color: COLORS.accent,
    },

    // Carte des totaux premium
    totalsCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      ...COLORS.shadow.golden && {
        shadowColor: COLORS.shadow.golden,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 6,
      }
    },
    totalsHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginBottom: 16,
    },
    totalRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: 8,
    },
    totalLabel: {
      fontSize: 15,
      color: COLORS.text.secondary,
    },
    totalValue: {
      fontSize: 15,
      color: COLORS.text.primary,
      fontWeight: '500' as const,
    },
    finalTotal: {
      borderTopWidth: 2,
      borderTopColor: COLORS.border.golden,
      paddingTop: 12,
      marginTop: 8,
    },
    finalTotalLabel: {
      fontSize: isTabletOrLarger ? 18 : 16,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
    },
    finalTotalValue: {
      fontSize: isTabletOrLarger ? 20 : 18,
      fontWeight: 'bold' as const,
      color: COLORS.accent,
    },

    // STYLES pour le bouton de suivi gamifié
    trackingButtonContainer: {
      borderRadius: 20,
      overflow: 'hidden' as const,
      ...COLORS.shadow.medium && {
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
      }
    },
    trackingButtonGradient: {
      padding: 20,
      position: 'relative' as const,
      minHeight: 100,
    },
    trackingIconsContainer: {
      position: 'absolute' as const,
      top: 10,
      right: 10,
      flexDirection: 'row' as const,
      gap: 8,
    },
    floatingIcon: {
      fontSize: 20,
      opacity: 0.3,
    },
    trackingButtonContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    trackingMainInfo: {
      flex: 1,
    },
    trackingTitleRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      marginBottom: 6,
    },
    trackingButtonTitle: {
      color: '#fff',
      fontSize: isTabletOrLarger ? 20 : 18,
      fontWeight: '700' as const,
    },
    trackingButtonSubtitle: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 14,
      lineHeight: 18,
    },
    trackingArrowContainer: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    newBadge: {
      position: 'absolute' as const,
      top: 16,
      left: 16,
      backgroundColor: '#EF4444',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    newBadgeText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '800' as const,
      letterSpacing: 0.5,
    },

    // Actions pour restaurateurs
    actionsCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      ...COLORS.shadow.default && {
        shadowColor: COLORS.shadow.default,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
      }
    },
    actionsHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      marginBottom: 16,
    },
    actionButtons: {
      flexDirection: (isTabletOrLarger ? 'column' : 'row') as 'row' | 'column',
      gap: 12,
    },
    actionButton: {
      borderRadius: 12,
      overflow: 'hidden' as const,
      flex: isTabletOrLarger ? undefined : 1,
    },
    buttonGradient: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 8,
      minHeight: 48,
    },
    statusButton: {
      ...COLORS.shadow.default && {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }
    },
    paymentButton: {
      ...COLORS.shadow.default && {
        shadowColor: COLORS.success,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }
    },
    receiptButton: {
      ...COLORS.shadow.golden && {
        shadowColor: COLORS.secondary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }
    },
    buttonPressed: {
      transform: [{ scale: 0.95 }],
    },
    actionButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700' as const,
    },

    // Bouton de paiement client premium
    paymentSection: {
      marginBottom: 16,
      gap: 12,
    },
    payButtonContainer: {
      borderRadius: 16,
      overflow: 'hidden' as const,
      ...COLORS.shadow.golden && {
        shadowColor: COLORS.shadow.golden,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 12,
      }
    },
    payButtonGradient: {
      padding: 20,
    },
    payButtonContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 16,
      marginBottom: 8,
    },
    payButtonText: {
      color: '#fff',
      fontSize: isTabletOrLarger ? 18 : 16,
      fontWeight: '700' as const,
    },
    payButtonAmount: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: isTabletOrLarger ? 24 : 20,
      fontWeight: 'bold' as const,
    },
    payButtonArrow: {
      position: 'absolute' as const,
      right: 20,
      top: '50%' as '50%',
      marginTop: -10,
    },

    // Bouton ticket client
    receiptButtonClient: {
      borderRadius: 12,
      overflow: 'hidden' as const,
      ...COLORS.shadow.default && {
        shadowColor: COLORS.shadow.default,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 4,
        elevation: 2,
      }
    },
    receiptButtonGradient: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    receiptButtonText: {
      fontSize: 15,
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      flex: 1,
      marginLeft: 8,
    },

    // Modal styles
    modalContainer: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
  };
};