import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  SafeAreaView,
  Alert,
  ScrollView,
  useWindowDimensions,
  TextInput,
} from 'react-native';
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
  BORDER_RADIUS 
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
    maxContentWidth: screenType === 'desktop' ? 800 : undefined,
    isTabletLandscape: screenType === 'tablet' && width > 1000,
    useGridLayout: (screenType === 'tablet' || screenType === 'desktop') && width > 900,
  };

  const currentTableNumber = tableNumber || cart.tableNumber;

  const [tipAmount, setTipAmount] = useState(0);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null);

  const TIP_PERCENTAGES = [5, 10, 15, 20];

  const handleTipPercentage = (percent: number) => {
    if (selectedTipPercent === percent) {
      // Désélectionner si déjà sélectionné
      setSelectedTipPercent(null);
      setTipAmount(0);
    } else {
      setSelectedTipPercent(percent);
      const tip = Math.round((cart.total || 0) * percent / 100 * 100) / 100;
      setTipAmount(tip);
    }
  };
  
  const handleCustomTip = (customAmount: string) => {
    const amount = parseFloat(customAmount) || 0;
    setTipAmount(amount);
    setSelectedTipPercent(null);
  };
  
  const clearTip = () => {
    setTipAmount(0);
    setSelectedTipPercent(null);
  };

  const totalWithTip = (cart.total || 0) + tipAmount;

  const orderButtonStyle = {
    backgroundColor: COLORS.secondary,
  };

  const orderButtonTextStyle = {
    color: '#000000',
    fontWeight: '700' as const,
    fontSize: getResponsiveValue(
      { mobile: 16, tablet: 18, desktop: 20 },
      screenType
    ),
  };

  const tipStyles = {
    tipSection: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
  
    tipHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
  
    tipTitle: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
  
    tipOptional: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      fontStyle: 'italic' as const,
    },
  
    tipButtons: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
  
    tipButton: {
      flex: 1,
      minWidth: screenType === 'mobile' ? '22%' as const : '20%' as const,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
  
    tipButtonSelected: {
      backgroundColor: COLORS.secondary + '20',
      borderColor: COLORS.secondary,
    },
  
    tipButtonDefault: {
      backgroundColor: COLORS.background,
      borderColor: COLORS.border.light,
    },
  
    tipButtonText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '500' as const,
    },
  
    tipButtonTextSelected: {
      color: COLORS.secondary,
    },
  
    tipButtonTextDefault: {
      color: COLORS.text.secondary,
    },
  
    customTipContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
  
    customTipInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.surface,
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.primary,
    },
  
    customTipLabel: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
      minWidth: getResponsiveValue(
        { mobile: 80, tablet: 90, desktop: 100 },
        screenType
      ),
    },
  
    tipSummary: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
  
    tipSummaryText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
    },
  
    tipAmount: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.secondary,
    },
  
    clearTipButton: {
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: COLORS.background,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
  
    clearTipText: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
    },
  };  

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
    },

    gridContainer: {
      flexDirection: layoutConfig.useGridLayout ? 'row' as const : 'column' as const,
      padding: layoutConfig.containerPadding,
      gap: getResponsiveValue(SPACING.md, screenType),
    },

    leftColumn: {
      flex: layoutConfig.useGridLayout ? 2 : 1,
      paddingRight: layoutConfig.useGridLayout ? getResponsiveValue(SPACING.sm, screenType) : 0,
    },

    rightColumn: {
      flex: layoutConfig.useGridLayout ? 1 : 1,
      minWidth: layoutConfig.useGridLayout ? 320 : undefined,
      paddingLeft: layoutConfig.useGridLayout ? getResponsiveValue(SPACING.sm, screenType) : 0,
    },

    // Styles pour mobile (avec margins)
    infoCard: {
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
      borderColor: COLORS.border.light,
    },

    alertCard: {
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.warning + '10',
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.warning + '40',
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },

    summaryCard: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    // Styles pour grille (sans margins)
    infoCardGrid: {
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
      borderColor: COLORS.border.light,
    },

    alertCardGrid: {
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.warning + '10',
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.warning + '40',
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },

    summaryCardGrid: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.xl, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    cartItemsContainer: {
      paddingHorizontal: layoutConfig.useGridLayout ? 0 : layoutConfig.containerPadding,
    },

    cartItemCard: {
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
      borderColor: COLORS.border.light,
    },

    restaurantHeader: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: screenType === 'mobile' ? 'flex-start' as const : 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    restaurantInfo: {
      flex: 1,
    },

    restaurantName: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 22, desktop: 26 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    tableInfo: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 16, desktop: 18 },
        screenType
      ),
      color: COLORS.text.secondary,
    },

    itemCount: {
      textAlign: screenType === 'mobile' ? 'left' as const : 'right' as const,
    },

    cartItemContainer: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      alignItems: screenType === 'mobile' ? 'stretch' as const : 'flex-start' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    cartItemInfo: {
      flex: 1,
    },

    cartItemName: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    cartItemPrice: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    customizations: {
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },

    customizationText: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      fontStyle: 'italic' as const,
    },

    specialInstructions: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.warning,
      fontStyle: 'italic' as const,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },

    quantityContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: screenType === 'mobile' ? 'flex-start' as const : 'flex-end' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginTop: screenType === 'mobile' ? getResponsiveValue(SPACING.sm, screenType) : 0,
    },

    quantityButton: {
      width: getResponsiveValue(
        { mobile: 32, tablet: 36, desktop: 40 },
        screenType
      ),
      height: getResponsiveValue(
        { mobile: 32, tablet: 36, desktop: 40 },
        screenType
      ),
      borderRadius: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      backgroundColor: COLORS.background,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    quantityText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      minWidth: getResponsiveValue(
        { mobile: 20, tablet: 24, desktop: 28 },
        screenType
      ),
      textAlign: 'center' as const,
    },

    priceActionsContainer: {
      alignItems: screenType === 'mobile' ? 'flex-end' as const : 'flex-end' as const,
      justifyContent: 'space-between' as const,
      minHeight: screenType === 'mobile' ? undefined : 60,
    },

    itemTotalPrice: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    deleteButton: {
      padding: getResponsiveValue(SPACING.xs, screenType),
    },

    alertContent: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    alertText: {
      flex: 1,
    },

    alertTitle: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.warning,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    alertMessage: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.primary,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },

    alertButtons: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    summaryTotal: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },

    totalLabel: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 24 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },

    totalAmount: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 24 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.secondary,
    },

    buttonGroup: {
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    statusIndicators: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      alignItems: 'center' as const,
    },

    statusText: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
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
      color: COLORS.text.primary,
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
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },

    emptyActions: {
      width: '100%' as const,
      maxWidth: layoutConfig.useGridLayout ? 400 : undefined,
      gap: getResponsiveValue(SPACING.md, screenType),
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 18, tablet: 20, desktop: 22 },
    screenType
  );

  const TipSection = () => {
    const [customTipInput, setCustomTipInput] = useState('');
  
    return (
      <View style={tipStyles.tipSection}>
        <View style={tipStyles.tipHeader}>
          <Text style={tipStyles.tipTitle}>Pourboire</Text>
          <Text style={tipStyles.tipOptional}>(optionnel)</Text>
        </View>
  
        {/* Boutons pourcentage prédéfinis */}
        <View style={tipStyles.tipButtons}>
          {TIP_PERCENTAGES.map((percent) => (
            <Pressable
              key={percent}
              style={[
                tipStyles.tipButton,
                selectedTipPercent === percent 
                  ? tipStyles.tipButtonSelected 
                  : tipStyles.tipButtonDefault
              ]}
              onPress={() => handleTipPercentage(percent)}
              android_ripple={{ color: COLORS.secondary + '20', borderless: false }}
            >
              <Text style={[
                tipStyles.tipButtonText,
                selectedTipPercent === percent 
                  ? tipStyles.tipButtonTextSelected 
                  : tipStyles.tipButtonTextDefault
              ]}>
                {percent}%
              </Text>
            </Pressable>
          ))}
          
          {/* Bouton effacer */}
          {(tipAmount > 0 || selectedTipPercent !== null) && (
            <Pressable
              style={tipStyles.clearTipButton}
              onPress={clearTip}
              android_ripple={{ color: COLORS.border.light, borderless: false }}
            >
              <Text style={tipStyles.clearTipText}>Effacer</Text>
            </Pressable>
          )}
        </View>
  
        {/* Input montant personnalisé */}
        <View style={tipStyles.customTipContainer}>
          <Text style={tipStyles.customTipLabel}>Montant libre :</Text>
          <TextInput
            style={tipStyles.customTipInput}
            value={customTipInput}
            onChangeText={(text) => {
              setCustomTipInput(text);
              handleCustomTip(text);
            }}
            placeholder="0.00"
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <Text style={tipStyles.customTipLabel}>€</Text>
        </View>
  
        {/* Résumé du pourboire */}
        {tipAmount > 0 && (
          <View style={tipStyles.tipSummary}>
            <Text style={tipStyles.tipSummaryText}>
              Pourboire {selectedTipPercent ? `(${selectedTipPercent}%)` : '(montant libre)'}
            </Text>
            <Text style={tipStyles.tipAmount}>
              {tipAmount.toFixed(2)} €
            </Text>
          </View>
        )}
      </View>
    );
  };

  const summaryTotalStyles = {
    summaryTotal: {
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
  
    summaryRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
  
    subtotalLabel: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '500' as const,
      color: COLORS.text.secondary,
    },
  
    subtotalAmount: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '500' as const,
      color: COLORS.text.secondary,
    },
  
    totalRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 2,
      borderTopColor: COLORS.border.default,
    },
  
    totalLabel: {
      fontSize: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 26 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },
  
    totalAmount: {
      fontSize: getResponsiveValue(
        { mobile: 20, tablet: 22, desktop: 26 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.secondary,
    },
  };  

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

    if (hasActiveTableOrders && tableOrders && currentTableNumber) {
      const ordersCount = tableOrders?.active_orders?.length || 0;
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

      console.log('🚀 Creating order from cart:', {
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
    if (!customizations || Object.keys(customizations).length === 0) return null;
    
    return (
      <View style={styles.customizations}>
        {Object.entries(customizations).map(([key, value]) => (
          <Text key={key} style={styles.customizationText}>
            {String(key)}: {Array.isArray(value) ? value.join(', ') : String(value)}
          </Text>
        ))}
      </View>
    );
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
            <Text style={styles.specialInstructions}>
              Note: {String(item.specialInstructions)}
            </Text>
          ) : null}
        </View>
        
        <View style={styles.quantityContainer}>
          <Pressable
            style={styles.quantityButton}
            onPress={() => handleQuantityChange(item.id, item.quantity - 1)}
            android_ripple={{ color: COLORS.primary + '20', borderless: true }}
          >
            <Ionicons name="remove" size={iconSize} color={COLORS.text.secondary} />
          </Pressable>
          
          <Text style={styles.quantityText}>
            {String(item.quantity || 0)}
          </Text>
          
          <Pressable
            style={styles.quantityButton}
            onPress={() => handleQuantityChange(item.id, item.quantity + 1)}
            android_ripple={{ color: COLORS.primary + '20', borderless: true }}
          >
            <Ionicons name="add" size={iconSize} color={COLORS.text.secondary} />
          </Pressable>
        </View>
        
        <View style={styles.priceActionsContainer}>
          <Text style={styles.itemTotalPrice}>
            {((item.price || 0) * (item.quantity || 0)).toFixed(2)} €
          </Text>
          <Pressable
            style={styles.deleteButton}
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
          title={`Table ${String(currentTableNumber || '')}`}
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()} 
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
          <View style={styles.emptyIcon}>
            <Ionicons 
              name="bag-outline" 
              size={getResponsiveValue({ mobile: 80, tablet: 100, desktop: 120 }, screenType)} 
              color={COLORS.text.light} 
            />
          </View>
          <Text style={styles.emptyTitle}>
            Votre panier est vide
          </Text>
          <Text style={styles.emptyMessage}>
            Scannez un QR code ou parcourez les restaurants pour commencer
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
            
            <Button
              title="Parcourir les restaurants"
              onPress={() => router.push('/(client)/browse')}
              variant="outline"
              leftIcon="restaurant-outline"
              fullWidth
            />
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
            {/* Restaurant Info */}
            <Card style={styles.infoCardGrid}>
              <View style={styles.restaurantHeader}>
                <View style={styles.restaurantInfo}>
                  <Text style={styles.restaurantName}>
                    {String(cart.restaurantName || 'Restaurant')}
                  </Text>
                  {currentTableNumber ? (
                    <Text style={styles.tableInfo}>
                      Table {String(currentTableNumber)}
                    </Text>
                  ) : null}
                </View>
                <View>
                  <Text style={[styles.tableInfo, styles.itemCount]}>
                    {String(cart.itemCount || 0)} {(cart.itemCount || 0) > 1 ? 'articles' : 'article'}
                  </Text>
                  {isLoadingTableOrders && currentTableNumber ? (
                    <Text style={[styles.statusText, { color: COLORS.warning }]}>
                      Vérification des commandes...
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>

            {/* Alert commandes existantes */}
            {hasActiveTableOrders && tableOrders && currentTableNumber && (
              <Card style={styles.alertCardGrid}>
                <View style={styles.alertContent}>
                  <Ionicons name="information-circle" size={24} color={COLORS.warning} />
                  <View style={styles.alertText}>
                    <Text style={styles.alertTitle}>
                      Commandes en cours sur cette table
                    </Text>
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
                        style={{ borderColor: COLORS.warning }}
                      />
                      <Button
                        title="Actualiser"
                        variant="outline"
                        size="sm"
                        onPress={refreshTableOrders}
                        disabled={isLoadingTableOrders}
                        style={{ borderColor: COLORS.warning }}
                        leftIcon="refresh"
                      />
                    </View>
                  </View>
                </View>
              </Card>
            )}

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

          {/* Summary dans la colonne de droite */}
          <View style={styles.rightColumn}>
            <Card style={styles.summaryCardGrid}>
            <View style={summaryTotalStyles.summaryTotal}>
              <View style={summaryTotalStyles.summaryRow}>
                <Text style={summaryTotalStyles.subtotalLabel}>Sous-total</Text>
                <Text style={summaryTotalStyles.subtotalAmount}>
                  {(cart.total || 0).toFixed(2)} €
                </Text>
              </View>
              
              {tipAmount > 0 && (
                <View style={summaryTotalStyles.summaryRow}>
                  <Text style={summaryTotalStyles.subtotalLabel}>
                    Pourboire {selectedTipPercent ? `(${selectedTipPercent}%)` : ''}
                  </Text>
                  <Text style={summaryTotalStyles.subtotalAmount}>
                    {tipAmount.toFixed(2)} €
                  </Text>
                </View>
              )}
              
              <View style={summaryTotalStyles.totalRow}>
                <Text style={summaryTotalStyles.totalLabel}>Total</Text>
                <Text style={summaryTotalStyles.totalAmount}>
                  {totalWithTip.toFixed(2)} €
                </Text>
              </View>
            </View>
          <TipSection />
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
                style={orderButtonStyle}
                textStyle={orderButtonTextStyle}
                disabled={isSubmitting || isCreatingOrder}
                loading={isCreatingOrder}
              />
                
                {hasActiveTableOrders && currentTableNumber && (
                  <Button
                    title={isSubmitting ? "Ajout en cours..." : "Ajouter à la session en cours"}
                    onPress={addToExistingSession}
                    fullWidth
                    variant="outline"
                    style={{ 
                      borderColor: COLORS.secondary,
                      backgroundColor: 'transparent' 
                    }}
                    textStyle={{ 
                      color: COLORS.secondary,
                      fontWeight: '600' as const 
                    }}
                    disabled={isSubmitting || isCreatingOrder}
                    loading={isSubmitting}
                  />
                )}
              </View>

              <View style={styles.statusIndicators}>
                {!isCreatingOrder && !isSubmitting ? (
                  <>
                    <Text style={[styles.statusText, { color: COLORS.text.secondary }]}>
                      {isAuthenticated 
                        ? '🔒 Commande avec votre compte client' 
                        : '👤 Commande en tant qu\'invité'
                      }
                    </Text>
                    {hasActiveTableOrders && currentTableNumber ? (
                      <Text style={[styles.statusText, { color: COLORS.text.light }]}>
                        Cette table a des commandes en cours
                      </Text>
                    ) : (
                      <Text style={[styles.statusText, { color: COLORS.text.light }]}>
                        Paiement sécurisé à l'étape suivante
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={[styles.statusText, { color: COLORS.warning }]}>
                    {isCreatingOrder ? 'Création de la commande...' : 'Ajout à la session...'}
                  </Text>
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
            <View style={styles.restaurantHeader}>
              <View style={styles.restaurantInfo}>
                <Text style={styles.restaurantName}>
                  {String(cart.restaurantName || 'Restaurant')}
                </Text>
                {currentTableNumber ? (
                  <Text style={styles.tableInfo}>
                    Table {String(currentTableNumber)}
                  </Text>
                ) : null}
              </View>
              <View>
                <Text style={[styles.tableInfo, styles.itemCount]}>
                  {String(cart.itemCount || 0)} {(cart.itemCount || 0) > 1 ? 'articles' : 'article'}
                </Text>
                {isLoadingTableOrders && currentTableNumber ? (
                  <Text style={[styles.statusText, { color: COLORS.warning }]}>
                    Vérification des commandes...
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>

          {/* Alert commandes existantes */}
          {hasActiveTableOrders && tableOrders && currentTableNumber && (
            <Card style={styles.alertCard}>
              <View style={styles.alertContent}>
                <Ionicons name="information-circle" size={24} color={COLORS.warning} />
                <View style={styles.alertText}>
                  <Text style={styles.alertTitle}>
                    Commandes en cours sur cette table
                  </Text>
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
                      style={{ borderColor: COLORS.warning, flex: 1 }}
                    />
                    <Button
                      title="Actualiser"
                      variant="outline"
                      size="sm"
                      onPress={refreshTableOrders}
                      disabled={isLoadingTableOrders}
                      style={{ borderColor: COLORS.warning }}
                      leftIcon="refresh"
                    />
                  </View>
                </View>
              </View>
            </Card>
          )}

          {/* Cart Items */}
          <FlatList
            data={cart.items}
            renderItem={renderCartItem}
            keyExtractor={(item: CartItem) => String(item.id)}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />

          {/* Order Summary */}
          <Card style={styles.summaryCard}>
            <View style={summaryTotalStyles.summaryTotal}>
              <View style={summaryTotalStyles.summaryRow}>
                <Text style={summaryTotalStyles.subtotalLabel}>Sous-total</Text>
                <Text style={summaryTotalStyles.subtotalAmount}>
                  {(cart.total || 0).toFixed(2)} €
                </Text>
              </View>
              
              {tipAmount > 0 && (
                <View style={summaryTotalStyles.summaryRow}>
                  <Text style={summaryTotalStyles.subtotalLabel}>
                    Pourboire {selectedTipPercent ? `(${selectedTipPercent}%)` : ''}
                  </Text>
                  <Text style={summaryTotalStyles.subtotalAmount}>
                    {tipAmount.toFixed(2)} €
                  </Text>
                </View>
              )}
              
              <View style={summaryTotalStyles.totalRow}>
                <Text style={summaryTotalStyles.totalLabel}>Total</Text>
                <Text style={summaryTotalStyles.totalAmount}>
                  {totalWithTip.toFixed(2)} €
                </Text>
              </View>
            </View>

            <TipSection />

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
                style={orderButtonStyle}
                textStyle={orderButtonTextStyle}
                disabled={isSubmitting || isCreatingOrder}
                loading={isCreatingOrder}
              />
              
              {hasActiveTableOrders && currentTableNumber && (
                <Button
                  title={isSubmitting ? "Ajout en cours..." : "Ajouter à la session en cours"}
                  onPress={addToExistingSession}
                  fullWidth
                  variant="outline"
                  style={{ 
                    borderColor: COLORS.secondary,
                    backgroundColor: 'transparent' 
                  }}
                  textStyle={{ 
                    color: COLORS.secondary,
                    fontWeight: '600' as const 
                  }}
                  disabled={isSubmitting || isCreatingOrder}
                  loading={isSubmitting}
                />
              )}
            </View>

            <View style={styles.statusIndicators}>
              {!isCreatingOrder && !isSubmitting ? (
                <>
                  <Text style={[styles.statusText, { color: COLORS.text.secondary }]}>
                    {isAuthenticated 
                      ? '🔒 Commande avec votre compte client' 
                      : '👤 Commande en tant qu\'invité'
                    }
                  </Text>
                  {hasActiveTableOrders && currentTableNumber ? (
                    <Text style={[styles.statusText, { color: COLORS.text.light }]}>
                      Cette table a des commandes en cours
                    </Text>
                  ) : (
                    <Text style={[styles.statusText, { color: COLORS.text.light }]}>
                      Paiement sécurisé à l'étape suivante
                    </Text>
                  )}
                </>
              ) : (
                <Text style={[styles.statusText, { color: COLORS.warning }]}>
                  {isCreatingOrder ? 'Création de la commande...' : 'Ajout à la session...'}
                </Text>
              )}
            </View>
          </Card>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}