import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  ScrollView,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { TableOrders } from '@/components/order/TableOrders';
import { CartItem } from '@/types/cart';
import { ListRenderItem } from 'react-native';
import { clientOrderService } from '@/services/clientOrderService';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY 
} from '@/utils/designSystem';

export default function CartScreen() {
  const { 
    cart, 
    updateQuantity, 
    removeFromCart, 
    clearCart,
    hasActiveTableOrders,
    tableOrders,
    isLoadingTableOrders,
    addOrderToTable,
    refreshTableOrders
  } = useCart();
  
  const { isAuthenticated } = useAuth();
  const { tableNumber } = useLocalSearchParams<{ tableNumber?: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1200 : undefined,
    isTabletLandscape: screenType === 'tablet' ? width > 1000 : false,
    useGridLayout: (screenType === 'tablet' || screenType === 'desktop') ? width > 900 : false,
  };

  const currentTableNumber = tableNumber || cart.tableNumber;

  // Styles améliorés avec des effets premium
  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    content: {
      flex: 1,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    scrollContent: {
      padding: layoutConfig.containerPadding,
      paddingBottom: getResponsiveValue(SPACING['2xl'], screenType),
    },

    gridContainer: {
      flexDirection: layoutConfig.useGridLayout ? 'row' as const : 'column' as const,
      padding: layoutConfig.containerPadding,
      gap: getResponsiveValue(SPACING.lg, screenType),
    },

    leftColumn: {
      flex: layoutConfig.useGridLayout ? 2 : 1,
      paddingRight: layoutConfig.useGridLayout ? getResponsiveValue(SPACING.md, screenType) : 0,
    },

    rightColumn: {
      flex: layoutConfig.useGridLayout ? 1 : 1,
      minWidth: layoutConfig.useGridLayout ? 360 : undefined,
      paddingLeft: layoutConfig.useGridLayout ? getResponsiveValue(SPACING.md, screenType) : 0,
    },

    // Cards avec design premium et gradients dorés
    infoCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      ...SHADOWS.card,
      borderWidth: 1,
      borderColor: COLORS.variants.secondary[100],
      // Effet doré subtil
      borderTopWidth: 3,
      borderTopColor: COLORS.variants.secondary[400],
    },

    alertCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 2,
      borderColor: COLORS.variants.secondary[200],
      ...SHADOWS.lg,
      // Effet d'avertissement premium
      position: 'relative' as const,
    },

    alertGlow: {
      position: 'absolute' as const,
      top: -2,
      left: -2,
      right: -2,
      bottom: -2,
      borderRadius: BORDER_RADIUS.xl + 2,
      backgroundColor: COLORS.variants.secondary[300] + '20',
      zIndex: -1,
    },

    summaryCard: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      ...SHADOWS.premiumCard,
      borderWidth: 2,
      borderColor: COLORS.variants.secondary[200],
      // Gradient border effect
      borderTopWidth: 4,
      borderTopColor: COLORS.variants.secondary[400],
      position: 'relative' as const,
    },

    summaryCardGlow: {
      position: 'absolute' as const,
      top: -3,
      left: -3,
      right: -3,
      bottom: -3,
      borderRadius: BORDER_RADIUS.xl + 3,
      backgroundColor: COLORS.variants.secondary[300] + '15',
      zIndex: -1,
    },

    cartItemsContainer: {
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    cartItemCard: {
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.md,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.variants.secondary[300],
      // Hover effect preparation
      transform: [{ scale: 1 }],
    },

    // Header avec gradient doré
    restaurantHeader: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: screenType === 'mobile' ? 'flex-start' as const : 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      position: 'relative' as const,
    },

    restaurantHeaderAccent: {
      position: 'absolute' as const,
      top: -getResponsiveValue(SPACING.xl, screenType),
      left: -getResponsiveValue(SPACING.xl, screenType),
      right: -getResponsiveValue(SPACING.xl, screenType),
      height: 4,
      backgroundColor: COLORS.variants.secondary[400],
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
    },

    restaurantInfo: {
      flex: 1,
    },

    restaurantName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      letterSpacing: -0.5,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    tableInfo: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      color: COLORS.variants.primary[600],
      backgroundColor: COLORS.variants.primary[50],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
      borderRadius: BORDER_RADIUS.md,
      alignSelf: 'flex-start' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    itemCount: {
      textAlign: screenType === 'mobile' ? 'left' as const : 'right' as const,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.secondary,
      backgroundColor: COLORS.variants.secondary[100],
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden' as const,
    },

    // Items du panier avec design amélioré
    cartItemContainer: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      alignItems: screenType === 'mobile' ? 'stretch' as const : 'flex-start' as const,
      gap: getResponsiveValue(SPACING.md, screenType),
    },

    cartItemInfo: {
      flex: 1,
    },

    cartItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      lineHeight: getResponsiveValue(
        { mobile: 22, tablet: 24, desktop: 26 },
        screenType
      ),
    },

    cartItemPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    customizations: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.md,
      borderLeftWidth: 3,
      borderLeftColor: COLORS.variants.secondary[300],
    },

    customizationText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },

    specialInstructions: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.variants.secondary[700],
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      fontStyle: 'italic' as const,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.variants.secondary[100],
      borderRadius: BORDER_RADIUS.md,
      borderLeftWidth: 3,
      borderLeftColor: COLORS.variants.secondary[400],
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    // Contrôles de quantité avec design moderne
    quantityContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: screenType === 'mobile' ? 'flex-start' as const : 'flex-end' as const,
      gap: getResponsiveValue(SPACING.md, screenType),
      marginTop: screenType === 'mobile' ? getResponsiveValue(SPACING.md, screenType) : 0,
      backgroundColor: COLORS.variants.primary[50],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.xl,
    },

    quantityButton: {
      width: getResponsiveValue(
        { mobile: 40, tablet: 44, desktop: 48 },
        screenType
      ),
      height: getResponsiveValue(
        { mobile: 40, tablet: 44, desktop: 48 },
        screenType
      ),
      borderRadius: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 24 },
        screenType
      ),
      backgroundColor: COLORS.surface,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      ...SHADOWS.md,
      borderWidth: 2,
      borderColor: COLORS.variants.primary[200],
    },

    quantityButtonActive: {
      backgroundColor: COLORS.variants.secondary[100],
      borderColor: COLORS.variants.secondary[400],
    },

    quantityText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      minWidth: getResponsiveValue(
        { mobile: 32, tablet: 36, desktop: 40 },
        screenType
      ),
      textAlign: 'center' as const,
      backgroundColor: COLORS.surface,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.md,
      ...SHADOWS.sm,
    },

    // Prix et actions
    priceActionsContainer: {
      alignItems: screenType === 'mobile' ? 'flex-end' as const : 'flex-end' as const,
      justifyContent: 'space-between' as const,
      minHeight: screenType === 'mobile' ? undefined : 80,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    itemTotalPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.variants.secondary[600],
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'right' as const,
      backgroundColor: COLORS.variants.secondary[50],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.md,
    },

    deleteButton: {
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.surface,
      ...SHADOWS.sm,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    deleteButtonActive: {
      backgroundColor: COLORS.error + '10',
      borderColor: COLORS.error + '40',
    },

    // Alert amélioré
    alertContent: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: getResponsiveValue(SPACING.md, screenType),
    },

    alertIcon: {
      marginTop: 2,
      padding: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.variants.secondary[200],
      borderRadius: BORDER_RADIUS.lg,
    },

    alertText: {
      flex: 1,
    },

    alertTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.variants.secondary[800],
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      letterSpacing: -0.3,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    alertMessage: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.primary,
      lineHeight: getResponsiveValue(
        { mobile: 22, tablet: 24, desktop: 26 },
        screenType
      ),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
    },

    alertButtons: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    // Total avec design premium
    summaryTotal: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
      paddingTop: getResponsiveValue(SPACING.lg, screenType),
      borderTopWidth: 3,
      borderTopColor: COLORS.variants.secondary[300],
      position: 'relative' as const,
    },

    totalGradientLine: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: COLORS.variants.secondary[400],
    },

    totalLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      letterSpacing: -0.5,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    totalAmount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
      color: COLORS.variants.secondary[600],
      letterSpacing: -1,
      textShadowColor: COLORS.variants.secondary[200],
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },

    // Boutons avec design premium
    buttonGroup: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },

    primaryOrderButton: {
      backgroundColor: COLORS.variants.secondary[500],
      ...SHADOWS.button,
      borderRadius: BORDER_RADIUS.xl,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      position: 'relative' as const,
      overflow: 'hidden' as const,
    },

    primaryOrderButtonText: {
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      letterSpacing: 0.5,
    },

    secondaryOrderButton: {
      borderColor: COLORS.variants.secondary[400],
      borderWidth: 2,
      backgroundColor: 'transparent',
      borderRadius: BORDER_RADIUS.xl,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
    },

    secondaryOrderButtonText: {
      color: COLORS.variants.secondary[700],
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    },

    // Status indicators améliorés
    statusIndicators: {
      marginTop: getResponsiveValue(SPACING.lg, screenType),
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    statusText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.variants.primary[50],
      borderRadius: BORDER_RADIUS.lg,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },

    // Empty state avec design amélioré
    emptyContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING['3xl'], screenType),
    },

    emptyIconContainer: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: COLORS.variants.secondary[100],
      borderRadius: BORDER_RADIUS.full,
      ...SHADOWS.lg,
    },

    emptyTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      textAlign: 'center' as const,
      letterSpacing: -0.5,
    },

    emptyMessage: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 26, tablet: 28, desktop: 30 },
        screenType
      ),
      marginBottom: getResponsiveValue(SPACING['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      maxWidth: 400,
    },

    emptyActions: {
      width: '100%' as const,
      maxWidth: layoutConfig.useGridLayout ? 500 : undefined,
      gap: getResponsiveValue(SPACING.lg, screenType),
    },

    iconWithText: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 20, tablet: 22, desktop: 24 },
    screenType
  );

  const smallIconSize = getResponsiveValue(
    { mobile: 16, tablet: 18, desktop: 20 },
    screenType
  );

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      Alert.alert(
        'Supprimer l\'article',
        'Voulez-vous supprimer cet article du panier ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', onPress: () => removeFromCart(itemId) }
        ]
      );
    } else {
      updateQuantity(itemId, newQuantity);
    }
  };

  const handleClearCart = () => {
    Alert.alert(
      'Vider le panier',
      'Êtes-vous sûr de vouloir vider votre panier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Vider', style: 'destructive', onPress: clearCart }
      ]
    );
  };

  const handleCheckout = async () => {
    if (cart.items.length === 0) {
      Alert.alert('Panier vide', 'Ajoutez des articles à votre panier pour continuer');
      return;
    }

    const ordersCount = tableOrders?.active_orders?.length || 0;
    
    if (hasActiveTableOrders && tableOrders && currentTableNumber) {
      Alert.alert(
        'Commandes en cours',
        `Cette table a déjà ${String(ordersCount)} commande(s) en cours. Comment souhaitez-vous procéder ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Nouvelle session', 
            onPress: () => createOrderAndRedirect() 
          },
          { 
            text: 'Ajouter à la session', 
            onPress: () => addToExistingSession() 
          }
        ]
      );
      return;
    }

    await createOrderAndRedirect();
  };

  const createOrderAndRedirect = async () => {
    if (!cart.restaurantId) {
      Alert.alert('Erreur', 'Restaurant non défini');
      return;
    }

    try {
      setIsCreatingOrder(true);

      const orderType: 'dine_in' | 'takeaway' = currentTableNumber ? 'dine_in' : 'takeaway';
      
      const orderData = {
        restaurant: cart.restaurantId,
        order_type: orderType,
        table_number: currentTableNumber,
        customer_name: isAuthenticated ? 'Client connecté' : 'Client invité',
        phone: '',
        payment_method: 'cash',
        notes: '',
        items: cart.items,
      };

      console.log('🛍️ Creating order from cart:', {
        restaurant: orderData.restaurant,
        order_type: orderData.order_type,
        table_number: orderData.table_number,
        items_count: orderData.items.length
      });

      const newOrder = await clientOrderService.createFromCart(orderData);
      
      console.log('✅ Order created for payment:', newOrder.id);

      router.push(`/order/payment?orderId=${String(newOrder.id)}`);

    } catch (error: any) {
      console.error('❌ Error creating order:', error);
      Alert.alert('Erreur', error.message || 'Erreur lors de la création de la commande');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const addToExistingSession = async () => {
    if (!cart.restaurantId || !currentTableNumber) {
      Alert.alert('Erreur', 'Informations de table manquantes');
      return;
    }

    try {
      setIsSubmitting(true);

      const orderData = {
        restaurant: cart.restaurantId,
        order_type: 'dine_in' as 'dine_in',
        table_number: currentTableNumber,
        customer_name: isAuthenticated ? 'Client connecté' : 'Client invité',
        phone: '',
        payment_method: '',
        notes: '',
        items: []
      };

      const newOrder = await addOrderToTable(orderData);
      
      console.log('✅ Order added to table session:', newOrder.order_number);

      router.push(`/order/payment?orderId=${String(newOrder.id)}`);

    } catch (error: any) {
      console.error('Error adding order to table:', error);
      Alert.alert('Erreur', error.message || 'Erreur lors de l\'ajout de la commande');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCustomizations = (customizations?: Record<string, any>) => {
    return customizations && Object.keys(customizations).length > 0 ? (
      <View style={styles.customizations}>
        {Object.entries(customizations).map(([key, value]) => (
          <View key={key} style={styles.customizationText}>
            <Ionicons name="ellipse" size={4} color={COLORS.text.secondary} />
            <Text style={{ color: COLORS.text.secondary }}>
              {String(key)}: {Array.isArray(value) ? value.join(', ') : String(value)}
            </Text>
          </View>
        ))}
      </View>
    ) : null;
  };

  const renderCartItem: ListRenderItem<CartItem> = ({ item }) => (
    <Card style={styles.cartItemCard}>
      <View style={styles.cartItemContainer}>
        <View style={styles.cartItemInfo}>
          <Text style={styles.cartItemName}>
            {String(item.name || '')}
          </Text>
          <Text style={styles.cartItemPrice}>
            {(item.price || 0).toFixed(2)} € / unité
          </Text>
          
          {renderCustomizations(item.customizations)}
          
          {item.specialInstructions ? (
            <View style={styles.specialInstructions}>
              <Ionicons name="chatbubble-outline" size={smallIconSize} color={COLORS.variants.secondary[700]} />
              <Text style={{ color: COLORS.variants.secondary[700], fontStyle: 'italic' }}>
                Note: {String(item.specialInstructions)}
              </Text>
            </View>
          ) : null}
        </View>
        
        <View style={styles.quantityContainer}>
          <Pressable
            style={[styles.quantityButton, item.quantity > 1 ? styles.quantityButtonActive : {}]}
            onPress={() => handleQuantityChange(item.id, item.quantity - 1)}
            android_ripple={{ color: COLORS.variants.secondary[200], borderless: true }}
          >
            <Ionicons name="remove" size={iconSize} color={COLORS.variants.primary[600]} />
          </Pressable>
          
          <Text style={styles.quantityText}>
            {String(item.quantity || 0)}
          </Text>
          
          <Pressable
            style={[styles.quantityButton, styles.quantityButtonActive]}
            onPress={() => handleQuantityChange(item.id, item.quantity + 1)}
            android_ripple={{ color: COLORS.variants.secondary[200], borderless: true }}
          >
            <Ionicons name="add" size={iconSize} color={COLORS.variants.primary[600]} />
          </Pressable>
        </View>
        
        <View style={styles.priceActionsContainer}>
          <Text style={styles.itemTotalPrice}>
            {((item.price || 0) * (item.quantity || 0)).toFixed(2)} €
          </Text>
          <Pressable
            style={[styles.deleteButton, styles.deleteButtonActive]}
            onPress={() => removeFromCart(item.id)}
            android_ripple={{ color: COLORS.error + '20', borderless: true }}
          >
            <Ionicons name="trash-outline" size={iconSize} color={COLORS.error} />
          </Pressable>
        </View>
      </View>
    </Card>
  );

  // Panier vide avec table
  if (cart.items.length === 0 && cart.restaurantId && currentTableNumber) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title={`Panier (${String(cart.itemCount || 0)})`}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
          rightIcon="trash-outline"
          onRightPress={handleClearCart}
        />
        
        <View style={styles.content}>
          <TableOrders
            restaurantId={Number(cart.restaurantId) || 0}
            tableNumber={String(currentTableNumber)}
            onAddOrder={() => {
              router.push(`/menu/client/${String(cart.restaurantId)}?tableNumber=${String(currentTableNumber)}`);
            }}
            onOrderPress={(order) => {
              router.push(`/order/${String(order.id)}`);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Panier vide sans table
  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Panier"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons 
              name="bag-outline" 
              size={getResponsiveValue({ mobile: 80, tablet: 100, desktop: 120 }, screenType)} 
              color={COLORS.variants.secondary[600]} 
            />
          </View>
          <Text style={styles.emptyTitle}>
            Votre panier est vide
          </Text>
          <Text style={styles.emptyMessage}>
            Scannez un QR code ou parcourez les restaurants pour découvrir de délicieux plats
          </Text>
          
          <View style={styles.emptyActions}>
            <QRAccessButtons
              compact
              vertical
              title="Scanner pour commander"
              description="Scannez un QR code pour accéder au menu"
              scanButtonText="Scanner QR Code"
              codeButtonText="Entrer le code"
              containerStyle={{ width: '100%', backgroundColor: 'transparent' }}
            />
            
            {/* <Button
              title="Parcourir les restaurants"
              onPress={() => router.push('/(client)/browse')}
              variant="outline"
              leftIcon={<Ionicons name="restaurant-outline" size={smallIconSize} color={COLORS.primary} />}
              fullWidth
            /> */}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Panier avec des articles
  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={`Panier (${String(cart.itemCount || 0)})`}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="trash-outline"
        onRightPress={handleClearCart}
      />

      {/* Layout responsive */}
      {layoutConfig.useGridLayout ? (
        // Layout en grille pour tablette/desktop
        <View style={styles.gridContainer}>
          <View style={styles.leftColumn}>
            {/* Restaurant Info avec design premium */}
            <Card style={styles.infoCard}>
              <View style={styles.restaurantHeaderAccent} />
              <View style={styles.restaurantHeader}>
                <View style={styles.restaurantInfo}>
                  <View style={styles.restaurantName}>
                    <Ionicons name="storefront" size={iconSize} color={COLORS.text.primary} />
                    <Text style={{ fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType), fontWeight: TYPOGRAPHY.fontWeight.bold as any, color: COLORS.text.primary }}>
                      {String(cart.restaurantName || 'Restaurant')}
                    </Text>
                  </View>
                  {currentTableNumber ? (
                    <View style={styles.tableInfo}>
                      <Ionicons name="restaurant" size={smallIconSize} color={COLORS.variants.primary[600]} />
                      <Text style={{ color: COLORS.variants.primary[600] }}>
                        Table {String(currentTableNumber)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View>
                  <Text style={styles.itemCount}>
                    {String(cart.itemCount || 0)} {(cart.itemCount || 0) > 1 ? 'articles' : 'article'}
                  </Text>
                  {isLoadingTableOrders && currentTableNumber ? (
                    <View style={styles.statusText}>
                      <Ionicons name="hourglass-outline" size={smallIconSize} color={COLORS.warning} />
                      <Text style={{ color: COLORS.warning }}>Vérification des commandes...</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>

            {/* Alert commandes existantes avec glow effect */}
            {hasActiveTableOrders && tableOrders && currentTableNumber ? (
              <Card style={styles.alertCard}>
                <View style={styles.alertGlow} />
                <View style={styles.alertContent}>
                  <View style={styles.alertIcon}>
                    <Ionicons name="information-circle" size={24} color={COLORS.variants.secondary[700]} />
                  </View>
                  <View style={styles.alertText}>
                    <View style={styles.alertTitle}>
                      <Ionicons name="warning" size={iconSize} color={COLORS.variants.secondary[800]} />
                      <Text style={{ fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType), fontWeight: TYPOGRAPHY.fontWeight.bold as any, color: COLORS.variants.secondary[800] }}>
                        Commandes en cours sur cette table
                      </Text>
                    </View>
                    <Text style={styles.alertMessage}>
                      {String(tableOrders?.active_orders?.length || 0)} commande(s) en cours. Vous pouvez ajouter votre commande à la session existante ou créer une nouvelle session.
                    </Text>
                    <View style={styles.alertButtons}>
                      <Button
                        title="Voir les commandes"
                        variant="outline"
                        size="sm"
                        onPress={() => {
                          router.push(`/table/${String(currentTableNumber)}/orders?restaurantId=${String(cart.restaurantId)}`);
                        }}
                        style={{ borderColor: COLORS.variants.secondary[400], flex: 1 }}
                        leftIcon={<Ionicons name="eye-outline" size={smallIconSize} color={COLORS.variants.secondary[400]} />}
                      />
                      <Button
                        title="Actualiser"
                        variant="outline"
                        size="sm"
                        onPress={refreshTableOrders}
                        disabled={isLoadingTableOrders}
                        style={{ borderColor: COLORS.variants.secondary[400] }}
                        leftIcon={<Ionicons name="refresh" size={smallIconSize} color={COLORS.variants.secondary[400]} />}
                      />
                    </View>
                  </View>
                </View>
              </Card>
            ) : null}

            {/* Cart Items */}
            <View style={styles.cartItemsContainer}>
              <FlatList
                data={cart.items}
                renderItem={renderCartItem}
                keyExtractor={(item: CartItem) => String(item.id)}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
              />
            </View>
          </View>

          {/* Summary dans la colonne de droite avec effet premium */}
          <View style={styles.rightColumn}>
            <Card style={styles.summaryCard}>
              <View style={styles.summaryCardGlow} />
              <View style={styles.summaryTotal}>
                <View style={styles.totalGradientLine} />
                <View style={styles.totalLabel}>
                  <Ionicons name="card" size={iconSize} color={COLORS.text.primary} />
                  <Text style={{ fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType), fontWeight: TYPOGRAPHY.fontWeight.bold as any, color: COLORS.text.primary }}>
                    Total
                  </Text>
                </View>
                <Text style={styles.totalAmount}>
                  {(cart.total || 0).toFixed(2)} €
                </Text>
              </View>

              <View style={styles.buttonGroup}>
                <Button
                  title={
                    isCreatingOrder 
                      ? "Création en cours..."
                      : hasActiveTableOrders 
                        ? "Passer commande (nouvelle session)" 
                        : "Passer commande"
                  }
                  onPress={handleCheckout}
                  fullWidth
                  style={styles.primaryOrderButton}
                  textStyle={styles.primaryOrderButtonText}
                  disabled={isSubmitting || isCreatingOrder}
                  loading={isCreatingOrder}
                  leftIcon={
                    isCreatingOrder 
                      ? <Ionicons name="hourglass-outline" size={smallIconSize} color={COLORS.text.primary} />
                      : hasActiveTableOrders 
                        ? <Ionicons name="add-circle" size={smallIconSize} color={COLORS.text.primary} />
                        : <Ionicons name="checkmark-circle" size={smallIconSize} color={COLORS.text.primary} />
                  }
                />
                
                {hasActiveTableOrders && currentTableNumber ? (
                  <Button
                    title={isSubmitting ? "Ajout en cours..." : "Ajouter à la session en cours"}
                    onPress={addToExistingSession}
                    fullWidth
                    variant="outline"
                    style={styles.secondaryOrderButton}
                    textStyle={styles.secondaryOrderButtonText}
                    disabled={isSubmitting || isCreatingOrder}
                    loading={isSubmitting}
                    leftIcon={
                      isSubmitting 
                        ? <Ionicons name="hourglass-outline" size={smallIconSize} color={COLORS.variants.secondary[700]} />
                        : <Ionicons name="add" size={smallIconSize} color={COLORS.variants.secondary[700]} />
                    }
                  />
                ) : null}
              </View>

              <View style={styles.statusIndicators}>
                {!isCreatingOrder && !isSubmitting ? (
                  <>
                    <View style={styles.statusText}>
                      <Ionicons 
                        name={isAuthenticated ? "person" : "person-outline"} 
                        size={smallIconSize} 
                        color={COLORS.text.secondary} 
                      />
                      <Text style={{ color: COLORS.text.secondary }}>
                        {isAuthenticated 
                          ? 'Commande avec votre compte client' 
                          : 'Commande en tant qu\'invité'
                        }
                      </Text>
                    </View>
                    {hasActiveTableOrders && currentTableNumber ? (
                      <View style={styles.statusText}>
                        <Ionicons name="information-circle-outline" size={smallIconSize} color={COLORS.text.light} />
                        <Text style={{ color: COLORS.text.light }}>Cette table a des commandes en cours</Text>
                      </View>
                    ) : (
                      <View style={styles.statusText}>
                        <Ionicons name="shield-checkmark" size={smallIconSize} color={COLORS.text.light} />
                        <Text style={{ color: COLORS.text.light }}>Paiement sécurisé à l'étape suivante</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.statusText}>
                    <Ionicons name="flash" size={smallIconSize} color={COLORS.warning} />
                    <Text style={{ color: COLORS.warning }}>
                      {isCreatingOrder ? 'Création de la commande...' : 'Ajout à la session...'}
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          </View>
        </View>
      ) : (
        // Layout mobile
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.scrollContent}>
            {/* Restaurant Info */}
            <Card style={styles.infoCard}>
              <View style={styles.restaurantHeaderAccent} />
              <View style={styles.restaurantHeader}>
                <View style={styles.restaurantInfo}>
                  <View style={styles.restaurantName}>
                    <Ionicons name="storefront" size={iconSize} color={COLORS.text.primary} />
                    <Text style={{ fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType), fontWeight: TYPOGRAPHY.fontWeight.bold as any, color: COLORS.text.primary }}>
                      {String(cart.restaurantName || 'Restaurant')}
                    </Text>
                  </View>
                  {currentTableNumber ? (
                    <View style={styles.tableInfo}>
                      <Ionicons name="restaurant" size={smallIconSize} color={COLORS.variants.primary[600]} />
                      <Text style={{ color: COLORS.variants.primary[600] }}>
                        Table {String(currentTableNumber)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View>
                  <Text style={styles.itemCount}>
                    {String(cart.itemCount || 0)} {(cart.itemCount || 0) > 1 ? 'articles' : 'article'}
                  </Text>
                  {isLoadingTableOrders && currentTableNumber ? (
                    <View style={styles.statusText}>
                      <Ionicons name="hourglass-outline" size={smallIconSize} color={COLORS.warning} />
                      <Text style={{ color: COLORS.warning }}>Vérification des commandes...</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>

            {/* Alert commandes existantes */}
            {hasActiveTableOrders && tableOrders && currentTableNumber ? (
              <Card style={styles.alertCard}>
                <View style={styles.alertGlow} />
                <View style={styles.alertContent}>
                  <View style={styles.alertIcon}>
                    <Ionicons name="information-circle" size={24} color={COLORS.variants.secondary[700]} />
                  </View>
                  <View style={styles.alertText}>
                    <View style={styles.alertTitle}>
                      <Ionicons name="warning" size={iconSize} color={COLORS.variants.secondary[800]} />
                      <Text style={{ fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType), fontWeight: TYPOGRAPHY.fontWeight.bold as any, color: COLORS.variants.secondary[800] }}>
                        Commandes en cours sur cette table
                      </Text>
                    </View>
                    <Text style={styles.alertMessage}>
                      {String(tableOrders?.active_orders?.length || 0)} commande(s) en cours. Vous pouvez ajouter votre commande à la session existante.
                    </Text>
                    <View style={styles.alertButtons}>
                      <Button
                        title="Voir les commandes"
                        variant="outline"
                        size="sm"
                        onPress={() => {
                          router.push(`/table/${String(currentTableNumber)}/orders?restaurantId=${String(cart.restaurantId)}`);
                        }}
                        style={{ borderColor: COLORS.variants.secondary[400], flex: 1 }}
                        leftIcon={<Ionicons name="eye-outline" size={smallIconSize} color={COLORS.variants.secondary[400]} />}
                      />
                      <Button
                        title="Actualiser"
                        variant="outline"
                        size="sm"
                        onPress={refreshTableOrders}
                        disabled={isLoadingTableOrders}
                        style={{ borderColor: COLORS.variants.secondary[400] }}
                        leftIcon={<Ionicons name="refresh" size={smallIconSize} color={COLORS.variants.secondary[400]} />}
                      />
                    </View>
                  </View>
                </View>
              </Card>
            ) : null}

            {/* Cart Items */}
            <FlatList
              data={cart.items}
              renderItem={renderCartItem}
              keyExtractor={(item: CartItem) => String(item.id)}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />

            {/* Order Summary avec design premium */}
            <Card style={styles.summaryCard}>
              <View style={styles.summaryCardGlow} />
              <View style={styles.summaryTotal}>
                <View style={styles.totalGradientLine} />
                <View style={styles.totalLabel}>
                  <Ionicons name="card" size={iconSize} color={COLORS.text.primary} />
                  <Text style={{ fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType), fontWeight: TYPOGRAPHY.fontWeight.bold as any, color: COLORS.text.primary }}>
                    Total
                  </Text>
                </View>
                <Text style={styles.totalAmount}>
                  {(cart.total || 0).toFixed(2)} €
                </Text>
              </View>

              <View style={styles.buttonGroup}>
                <Button
                  title={
                    isCreatingOrder 
                      ? "Création en cours..."
                      : hasActiveTableOrders 
                        ? "Passer commande (nouvelle session)" 
                        : "Passer commande"
                  }
                  onPress={handleCheckout}
                  fullWidth
                  style={styles.primaryOrderButton}
                  textStyle={styles.primaryOrderButtonText}
                  disabled={isSubmitting || isCreatingOrder}
                  loading={isCreatingOrder}
                  leftIcon={
                    isCreatingOrder 
                      ? <Ionicons name="hourglass-outline" size={smallIconSize} color={COLORS.text.primary} />
                      : hasActiveTableOrders 
                        ? <Ionicons name="add-circle" size={smallIconSize} color={COLORS.text.primary} />
                        : <Ionicons name="checkmark-circle" size={smallIconSize} color={COLORS.text.primary} />
                  }
                />
                
                {hasActiveTableOrders && currentTableNumber ? (
                  <Button
                    title={isSubmitting ? "Ajout en cours..." : "Ajouter à la session en cours"}
                    onPress={addToExistingSession}
                    fullWidth
                    variant="outline"
                    style={styles.secondaryOrderButton}
                    textStyle={styles.secondaryOrderButtonText}
                    disabled={isSubmitting || isCreatingOrder}
                    loading={isSubmitting}
                    leftIcon={
                      isSubmitting 
                        ? <Ionicons name="hourglass-outline" size={smallIconSize} color={COLORS.variants.secondary[700]} />
                        : <Ionicons name="add" size={smallIconSize} color={COLORS.variants.secondary[700]} />
                    }
                  />
                ) : null}
              </View>

              <View style={styles.statusIndicators}>
                {!isCreatingOrder && !isSubmitting ? (
                  <>
                    <View style={styles.statusText}>
                      <Ionicons 
                        name={isAuthenticated ? "person" : "person-outline"} 
                        size={smallIconSize} 
                        color={COLORS.text.secondary} 
                      />
                      <Text style={{ color: COLORS.text.secondary }}>
                        {isAuthenticated 
                          ? 'Commande avec votre compte client' 
                          : 'Commande en tant qu\'invité'
                        }
                      </Text>
                    </View>
                    {hasActiveTableOrders && currentTableNumber ? (
                      <View style={styles.statusText}>
                        <Ionicons name="information-circle-outline" size={smallIconSize} color={COLORS.text.light} />
                        <Text style={{ color: COLORS.text.light }}>Cette table a des commandes en cours</Text>
                      </View>
                    ) : (
                      <View style={styles.statusText}>
                        <Ionicons name="shield-checkmark" size={smallIconSize} color={COLORS.text.light} />
                        <Text style={{ color: COLORS.text.light }}>Paiement sécurisé à l'étape suivante</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.statusText}>
                    <Ionicons name="flash" size={smallIconSize} color={COLORS.warning} />
                    <Text style={{ color: COLORS.warning }}>
                      {isCreatingOrder ? 'Création de la commande...' : 'Ajout à la session...'}
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}