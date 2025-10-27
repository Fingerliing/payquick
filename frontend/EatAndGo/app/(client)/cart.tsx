import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Contexts & Hooks
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollaborativeSession, useActiveTableSession } from '@/hooks/session/useCollaborativeSession';

// Components
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { Alert, AlertWithAction, useAlert } from '@/components/ui/Alert';

// Utils & Types
import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  COMPONENT_CONSTANTS,
  SHADOWS,
} from '@/utils/designSystem';
import { QRSessionUtils } from '@/utils/qrSessionUtils';

// ============================================================================
// TYPES
// ============================================================================

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  specialInstructions?: string;
}

interface SessionData {
  id: string;
  [key: string]: any;
}

// ============================================================================
// CART ITEM COMPONENT
// ============================================================================

interface CartItemCardProps {
  item: CartItem;
  onQuantityChange: (itemId: string, newQuantity: number) => void;
  onRemove: (itemId: string) => void;
  screenType: 'mobile' | 'tablet' | 'desktop';
  isUpdating?: boolean;
}

const CartItemCard = React.memo<CartItemCardProps>(({ 
  item, 
  onQuantityChange, 
  onRemove,
  screenType,
  isUpdating = false,
}) => {
  const styles = createResponsiveStyles(screenType);
  const imageSize = getResponsiveValue({ mobile: 80, tablet: 90, desktop: 100 }, screenType);
  const smallIconSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);
  const [localQuantity, setLocalQuantity] = useState(item.quantity);

  // Sync local quantity with prop when it changes
  useEffect(() => {
    setLocalQuantity(item.quantity);
  }, [item.quantity]);

  const handleDecrease = useCallback(() => {
    const newQuantity = localQuantity - 1;
    if (newQuantity === 0) {
      onRemove(item.id);
    } else {
      setLocalQuantity(newQuantity);
      onQuantityChange(item.id, newQuantity);
    }
  }, [localQuantity, item.id, onQuantityChange, onRemove]);

  const handleIncrease = useCallback(() => {
    const newQuantity = localQuantity + 1;
    setLocalQuantity(newQuantity);
    onQuantityChange(item.id, newQuantity);
  }, [localQuantity, item.id, onQuantityChange]);

  return (
    <Card 
      padding="sm"
      style={[
        localStyles.cartItemCard, 
        styles.mb('sm'),
        ...(isUpdating ? [localStyles.updatingCard] : []),
      ]}
      accessibilityLabel={`${item.name}, quantité ${localQuantity}, prix ${(item.price * localQuantity).toFixed(2)} euros`}
    >
      {isUpdating && (
        <View style={localStyles.loadingOverlay}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}
      
      <View style={localStyles.cartItemContent}>
        {item.image && (
          <Image 
            source={{ uri: item.image }}
            style={[
              localStyles.itemImage,
              { 
                width: imageSize, 
                height: imageSize,
                marginRight: getResponsiveValue(SPACING.sm, screenType)
              }
            ]}
            accessibilityLabel={`Image de ${item.name}`}
          />
        )}
        
        <View style={localStyles.itemDetails}>
          <View style={localStyles.itemHeader}>
            <Text 
              style={[
                styles.textSubtitle,
                localStyles.itemName
              ]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            
            <TouchableOpacity
              onPress={() => onRemove(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Retirer l'article"
              accessibilityRole="button"
            >
              <Ionicons 
                name="trash-outline" 
                size={smallIconSize} 
                color={COLORS.error} 
              />
            </TouchableOpacity>
          </View>
          
          {item.specialInstructions && (
            <View style={[localStyles.instructionsContainer, styles.mt('xs')]}>
              <Ionicons 
                name="information-circle-outline" 
                size={14} 
                color={COLORS.text.light} 
              />
              <Text 
                style={[
                  styles.textCaption,
                  localStyles.instructions
                ]}
                numberOfLines={2}
              >
                {item.specialInstructions}
              </Text>
            </View>
          )}
          
          <View style={[localStyles.itemFooter, styles.mt('sm')]}>
            <Text 
              style={[
                styles.textSubtitle,
                { color: COLORS.primary, fontWeight: TYPOGRAPHY.fontWeight.bold }
              ]}
            >
              {(item.price * localQuantity).toFixed(2)} €
            </Text>
            
            <View style={localStyles.quantityControls}>
              <TouchableOpacity
                onPress={handleDecrease}
                style={localStyles.quantityButton}
                disabled={isUpdating}
                accessibilityLabel="Diminuer la quantité"
                accessibilityHint={`Quantité actuelle: ${localQuantity}`}
                accessibilityRole="button"
              >
                <Ionicons 
                  name={localQuantity === 1 ? "trash" : "remove"} 
                  size={smallIconSize} 
                  color={localQuantity === 1 ? COLORS.error : COLORS.primary} 
                />
              </TouchableOpacity>
              
              <Text 
                style={[
                  styles.textSubtitle,
                  localStyles.quantityText
                ]}
                accessibilityLabel={`Quantité: ${localQuantity}`}
              >
                {localQuantity}
              </Text>
              
              <TouchableOpacity
                onPress={handleIncrease}
                style={[
                  localStyles.quantityButton,
                  localStyles.quantityButtonAdd
                ]}
                disabled={isUpdating}
                accessibilityLabel="Augmenter la quantité"
                accessibilityRole="button"
              >
                <Ionicons name="add" size={smallIconSize} color={COLORS.text.inverse} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
});

CartItemCard.displayName = 'CartItemCard';

// ============================================================================
// CART SUMMARY COMPONENT
// ============================================================================

interface CartSummaryProps {
  subtotal: number;
  itemCount: number;
  isCreatingOrder: boolean;
  onCheckout: () => void;
  screenType: 'mobile' | 'tablet' | 'desktop';
}

const CartSummary = React.memo<CartSummaryProps>(({ 
  subtotal, 
  itemCount, 
  isCreatingOrder, 
  onCheckout,
  screenType 
}) => {
  const styles = createResponsiveStyles(screenType);
  const iconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType);

  // Calcul des frais (à adapter selon votre logique métier)
  const serviceFee = 0; // Exemple: pas de frais de service
  const total = subtotal + serviceFee;

  return (
    <View style={localStyles.summaryContainer}>
      <View style={localStyles.summaryContent}>
        <View style={localStyles.summaryRow}>
          <Text style={styles.textBody}>
            Sous-total ({itemCount} {itemCount > 1 ? 'articles' : 'article'})
          </Text>
          <Text style={styles.textBody}>
            {subtotal.toFixed(2)} €
          </Text>
        </View>
        
        {serviceFee > 0 && (
          <View style={[localStyles.summaryRow, styles.mt('xs')]}>
            <Text style={styles.textCaption}>
              Frais de service
            </Text>
            <Text style={styles.textCaption}>
              {serviceFee.toFixed(2)} €
            </Text>
          </View>
        )}
        
        <View style={localStyles.divider} />
        
        <View style={localStyles.totalRow}>
          <Text style={styles.textSubtitle}>
            Total
          </Text>
          <Text 
            style={[
              styles.textTitle,
              { color: COLORS.primary }
            ]}
          >
            {total.toFixed(2)} €
          </Text>
        </View>
      </View>
      
      <Button
        title={isCreatingOrder ? "Traitement en cours..." : "Passer la commande"}
        onPress={onCheckout}
        disabled={isCreatingOrder || itemCount === 0}
        fullWidth
        leftIcon={
          isCreatingOrder ? (
            <ActivityIndicator size="small" color={COLORS.text.inverse} />
          ) : (
            <Ionicons name="checkmark-circle" size={iconSize} color={COLORS.text.inverse} />
          )
        }
        accessibilityLabel={`Commander pour un total de ${total.toFixed(2)} euros`}
        accessibilityHint="Appuyez pour procéder au paiement"
        accessibilityState={{ disabled: isCreatingOrder || itemCount === 0 }}
      />
    </View>
  );
});

CartSummary.displayName = 'CartSummary';

// ============================================================================
// RESTAURANT INFO COMPONENT
// ============================================================================

interface RestaurantInfoProps {
  restaurantName: string;
  tableNumber: string;
  itemCount: number;
  hasActiveSession: boolean;
  screenType: 'mobile' | 'tablet' | 'desktop';
}

const RestaurantInfo = React.memo<RestaurantInfoProps>(({
  restaurantName,
  tableNumber,
  itemCount,
  hasActiveSession,
  screenType
}) => {
  const styles = createResponsiveStyles(screenType);
  const iconSize = getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType);
  
  // Padding adaptatif selon le screenType
  const cardPadding: keyof typeof SPACING = screenType === 'mobile' ? 'sm' : 'md';

  return (
    <View style={[styles.px('md'), styles.mt('md')]}>
    <Card 
      padding={cardPadding}
      style={localStyles.restaurantCard}
    >
      <View style={localStyles.restaurantContent}>
        <View style={localStyles.restaurantIcon}>
          <Ionicons name="restaurant" size={iconSize} color={COLORS.primary} />
        </View>
        
        <View style={localStyles.restaurantDetails}>
          <Text style={[styles.textSubtitle, localStyles.restaurantName]}>
            {restaurantName || 'Restaurant'}
          </Text>
          
          <View style={localStyles.restaurantMeta}>
            {tableNumber && (
              <View style={localStyles.metaItem}>
                <Ionicons name="location" size={14} color={COLORS.text.secondary} />
                <Text style={[styles.textCaption, localStyles.metaText]}>
                  Table {tableNumber}
                </Text>
              </View>
            )}
            
            <View style={localStyles.metaItem}>
              <Ionicons name="cart" size={14} color={COLORS.text.secondary} />
              <Text style={[styles.textCaption, localStyles.metaText]}>
                {itemCount} {itemCount > 1 ? 'articles' : 'article'}
              </Text>
            </View>
          </View>
          
          {hasActiveSession && (
            <View style={localStyles.sessionBadge}>
              <Ionicons name="people" size={12} color={COLORS.success} />
              <Text style={localStyles.sessionBadgeText}>
                Session collaborative
              </Text>
            </View>
          )}
        </View>
      </View>
    </Card>
    </View>
  );
});

RestaurantInfo.displayName = 'RestaurantInfo';

// ============================================================================
// EMPTY CART COMPONENT
// ============================================================================

interface EmptyCartProps {
  screenType: 'mobile' | 'tablet' | 'desktop';
}

const EmptyCart = React.memo<EmptyCartProps>(({ screenType }) => {
  const styles = createResponsiveStyles(screenType);
  const iconSize = getResponsiveValue({ mobile: 80, tablet: 100, desktop: 120 }, screenType);

  return (
    <View style={localStyles.emptyContainer}>
      <View style={localStyles.emptyIconContainer}>
        <Ionicons 
          name="cart-outline" 
          size={iconSize} 
          color={COLORS.border.dark} 
        />
      </View>
      
      <Text 
        style={[
          styles.textTitle,
          styles.mt('lg'),
          { textAlign: 'center' }
        ]}
      >
        Votre panier est vide
      </Text>
      
      <Text 
        style={[
          styles.textBody,
          styles.mt('sm'),
          { textAlign: 'center', maxWidth: 320 }
        ]}
      >
        Ajoutez des articles à votre panier pour commencer votre commande
      </Text>
      
      <View style={[localStyles.qrButtonsContainer, styles.mt('xl')]}>
        <QRAccessButtons
          compact
          vertical
          title="Scanner pour commander"
          description="Scannez un QR code pour accéder au menu"
          scanButtonText="Scanner QR Code"
          codeButtonText="Entrer le code"
          containerStyle={localStyles.qrButtons}
        />
      </View>
    </View>
  );
});

EmptyCart.displayName = 'EmptyCart';

// ============================================================================
// MAIN CART SCREEN
// ============================================================================

export default function CartScreen() {
  const { cart, removeFromCart, updateQuantity, clearCart, setTableNumber } = useCart();
  const { isAuthenticated } = useAuth();
  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);
  const { alertState, showAlert, hideAlert, showError, showSuccess } = useAlert();
  
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [currentTableNumber, setCurrentTableNumber] = useState(cart.tableNumber || '');
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    const loadTableFromQR = async () => {
      try {
        const qrData = await QRSessionUtils.getSession();
        if (qrData?.tableNumber && !currentTableNumber) {
          setCurrentTableNumber(qrData.tableNumber);
          setTableNumber(qrData.tableNumber);
        }
      } catch (error) {
        console.error('Error loading table from QR:', error);
      }
    };
    loadTableFromQR();
  }, []);

  // ============================================================================
  // HOOKS
  // ============================================================================

  const { activeSession, hasActiveSession, loading: checkingSession } = useActiveTableSession(
    cart.restaurantId,
    currentTableNumber
  );

  const {
    session,
    currentParticipant,
    isHost,
    joinSession,
    createSession,
  } = useCollaborativeSession({
    sessionId: activeSession?.id,
  });

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Construit l'URL de checkout avec les query params appropriés
   */
  const buildCheckoutUrl = useCallback((sessionId?: string): string => {
    const params: string[] = [];
    
    if (cart.restaurantId) {
      params.push(`restaurantId=${cart.restaurantId}`);
    }
    if (currentTableNumber || cart.tableNumber) {
      params.push(`tableNumber=${currentTableNumber || cart.tableNumber}`);
    }
    if (sessionId) {
      params.push(`sessionId=${sessionId}`);
    }

    const queryString = params.length > 0 ? `?${params.join('&')}` : '';
    const basePath = isAuthenticated ? '/order/checkout' : '/order/guest-checkout';
    
    return `${basePath}${queryString}`;
  }, [cart.restaurantId, cart.tableNumber, currentTableNumber, isAuthenticated]);

  /**
   * Navigue vers la page de checkout
   */
  const navigateToCheckout = useCallback((sessionId?: string) => {
    const url = buildCheckoutUrl(sessionId);
    router.push(url as any);
  }, [buildCheckoutUrl]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleQuantityChange = useCallback(async (itemId: string, newQuantity: number) => {
    try {
      setUpdatingItems(prev => new Set(prev).add(itemId));
      await updateQuantity(itemId, newQuantity);
      showSuccess('Quantité mise à jour');
    } catch (error) {
      showError('Erreur lors de la mise à jour de la quantité');
      console.error('Error updating quantity:', error);
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  }, [updateQuantity, showSuccess, showError]);

  const handleRemoveItem = useCallback((itemId: string) => {
    setItemToRemove(itemId);
  }, []);

  const confirmRemoveItem = useCallback(async () => {
    if (!itemToRemove) return;

    try {
      await removeFromCart(itemToRemove);
      showSuccess('Article retiré du panier');
      setItemToRemove(null);
    } catch (error) {
      showError('Erreur lors du retrait de l\'article');
      console.error('Error removing item:', error);
    }
  }, [itemToRemove, removeFromCart, showSuccess, showError]);

  const handleClearCart = useCallback(() => {
    setShowClearConfirmation(true);
  }, []);

  const confirmClearCart = useCallback(async () => {
    try {
      await clearCart();
      setShowClearConfirmation(false);
      showSuccess('Panier vidé');
    } catch (error) {
      showError('Erreur lors de la suppression du panier');
      console.error('Error clearing cart:', error);
    }
  }, [clearCart, showSuccess, showError]);

  const handleCheckout = useCallback(async () => {
    if (cart.items.length === 0) {
      showError('Votre panier est vide. Ajoutez des articles pour continuer.');
      return;
    }

    if (!cart.restaurantId) {
      showError('Restaurant non trouvé. Veuillez scanner à nouveau le QR code.');
      return;
    }

    try {
      setIsCreatingOrder(true);
      navigateToCheckout();
    } catch (error) {
      showError('Erreur lors de la préparation de la commande');
      console.error('Error during checkout:', error);
    } finally {
      setIsCreatingOrder(false);
    }
  }, [cart.items.length, cart.restaurantId, navigateToCheckout, showError]);

  // ============================================================================
  // MEMOIZED VALUES
  // ============================================================================

  const cartItems = useMemo(() => cart.items || [], [cart.items]);
  const itemCount = useMemo(() => cart.itemCount || 0, [cart.itemCount]);
  const totalAmount = useMemo(() => cart.total || 0, [cart.total]);

  // ============================================================================
  // RENDER
  // ============================================================================

  // Panier vide
  if (cartItems.length === 0) {
    return (
      <SafeAreaView style={localStyles.container}>
        <Header
          title="Panier"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        <EmptyCart screenType={screenType} />
      </SafeAreaView>
    );
  }

  // Panier avec articles
  return (
    <SafeAreaView style={localStyles.container}>
      <Header
        title={`Panier (${itemCount})`}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="trash-outline"
        onRightPress={handleClearCart}
      />

      <ScrollView 
        style={localStyles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.pb('xl')}
      >
        {/* Restaurant Info */}
        <RestaurantInfo
          restaurantName={cart.restaurantName || 'Restaurant'}
          tableNumber={currentTableNumber}
          itemCount={itemCount}
          hasActiveSession={hasActiveSession}
          screenType={screenType}
        />

        {/* Alerts */}
        {alertState && (
          <View style={[styles.mx('md'), styles.mt('md')]}>
            <Alert
              variant={alertState.variant}
              title={alertState.title}
              message={alertState.message}
            />
          </View>
        )}

        {/* Cart Items */}
        <View style={[localStyles.itemsContainer, styles.px('md'), styles.pt('md')]}>
          {cartItems.map((item) => (
            <CartItemCard
              key={item.id}
              item={item}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemoveItem}
              screenType={screenType}
              isUpdating={updatingItems.has(item.id)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Footer with total and checkout */}
      <CartSummary
        subtotal={totalAmount}
        itemCount={itemCount}
        isCreatingOrder={isCreatingOrder}
        onCheckout={handleCheckout}
        screenType={screenType}
      />

      {/* Confirmation Modals using AlertWithAction */}
      {showClearConfirmation && (
        <View style={localStyles.modalOverlay}>
          <View style={[localStyles.modalContainer, styles.mx('md')]}>
            <AlertWithAction
              variant="warning"
              title="Vider le panier"
              message="Êtes-vous sûr de vouloir vider votre panier ? Cette action est irréversible."
              primaryButton={{
                text: "Vider le panier",
                onPress: confirmClearCart,
                variant: "danger",
              }}
              secondaryButton={{
                text: "Annuler",
                onPress: () => setShowClearConfirmation(false),
              }}
            />
          </View>
        </View>
      )}

      {itemToRemove && (
        <View style={localStyles.modalOverlay}>
          <View style={[localStyles.modalContainer, styles.mx('md')]}>
            <AlertWithAction
              variant="warning"
              title="Retirer l'article"
              message="Voulez-vous retirer cet article de votre panier ?"
              primaryButton={{
                text: "Retirer",
                onPress: confirmRemoveItem,
                variant: "danger",
              }}
              secondaryButton={{
                text: "Annuler",
                onPress: () => setItemToRemove(null),
              }}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const localStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  
  scrollView: {
    flex: 1,
  },

  // Restaurant Info Styles
  restaurantCard: {
    // Le padding est géré par la prop du composant Card
    ...SHADOWS.card,
  },
  
  restaurantContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  
  restaurantIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.variants.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm.mobile,
  },
  
  restaurantDetails: {
    flex: 1,
  },
  
  restaurantName: {
    marginBottom: 4,
  },
  
  restaurantMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: SPACING.sm.mobile,
  },
  
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  
  metaText: {
    marginLeft: 2,
  },
  
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: COLORS.variants.primary[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  
  sessionBadgeText: {
    fontSize: 11,
    color: COLORS.success,
    marginLeft: 4,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },

  // Cart Items Styles
  itemsContainer: {
    // Le padding horizontal est géré par styles.px('md')
  },
  
  cartItemCard: {
    // Le padding est géré par la prop du composant Card
    position: 'relative',
  },
  
  updatingCard: {
    opacity: 0.7,
  },
  
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: BORDER_RADIUS.md,
    zIndex: 1,
  },
  
  cartItemContent: {
    flexDirection: 'row',
  },
  
  itemImage: {
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.border.light,
  },
  
  itemDetails: {
    flex: 1,
  },
  
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  
  itemName: {
    flex: 1,
    marginRight: SPACING.sm.mobile,
  },
  
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: COLORS.variants.primary[50],
    padding: SPACING.xs.mobile,
    borderRadius: BORDER_RADIUS.sm,
  },
  
  instructions: {
    flex: 1,
    fontStyle: 'italic',
  },
  
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm.mobile,
  },
  
  quantityButton: {
    backgroundColor: COLORS.variants.secondary[100],
    borderRadius: BORDER_RADIUS.sm,
    padding: 8,
    minWidth: COMPONENT_CONSTANTS.minTouchTarget,
    minHeight: COMPONENT_CONSTANTS.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  
  quantityButtonAdd: {
    backgroundColor: COLORS.primary,
  },
  
  quantityText: {
    minWidth: 30,
    textAlign: 'center',
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
  },

  // Summary Styles
  summaryContainer: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md.mobile,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    ...SHADOWS.lg,
  },
  
  summaryContent: {
    marginBottom: SPACING.md.mobile,
  },
  
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  
  divider: {
    height: 1,
    backgroundColor: COLORS.border.default,
    marginVertical: SPACING.sm.mobile,
  },
  
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },

  // Empty Cart Styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl.mobile,
  },
  
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: BORDER_RADIUS['2xl'],
    backgroundColor: COLORS.border.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  qrButtonsContainer: {
    width: '100%',
    maxWidth: 400,
  },
  
  qrButtons: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  
  // Modal Styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: COMPONENT_CONSTANTS.zIndex.modal,
  },
  
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
});