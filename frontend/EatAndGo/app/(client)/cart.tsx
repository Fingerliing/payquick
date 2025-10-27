import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  StyleSheet,
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
import { SessionJoinModal } from '@/components/session/SessionJoinModal';

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
  screenType: 'mobile' | 'tablet' | 'desktop';
}

const CartItemCard = React.memo<CartItemCardProps>(({ item, onQuantityChange, screenType }) => {
  const styles = createResponsiveStyles(screenType);
  const imageSize = getResponsiveValue({ mobile: 80, tablet: 90, desktop: 100 }, screenType);
  const smallIconSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);

  return (
    <Card 
      style={[
        localStyles.cartItemCard, 
        styles.mb('sm')
      ]}
      accessibilityLabel={`${item.name}, quantité ${item.quantity}, prix ${(item.price * item.quantity).toFixed(2)} euros`}
    >
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
          <Text 
            style={[
              styles.textSubtitle,
              localStyles.itemName
            ]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          
          {item.specialInstructions && (
            <Text 
              style={[
                styles.textCaption,
                styles.mt('xs')
              ]}
              numberOfLines={2}
            >
              {item.specialInstructions}
            </Text>
          )}
          
          <View style={[localStyles.itemFooter, styles.mt('sm')]}>
            <Text 
              style={[
                styles.textSubtitle,
                { color: COLORS.primary }
              ]}
            >
              {(item.price * item.quantity).toFixed(2)} €
            </Text>
            
            <View style={localStyles.quantityControls}>
              <TouchableOpacity
                onPress={() => onQuantityChange(item.id, item.quantity - 1)}
                style={localStyles.quantityButton}
                accessibilityLabel="Diminuer la quantité"
                accessibilityHint={`Quantité actuelle: ${item.quantity}`}
              >
                <Ionicons name="remove" size={smallIconSize} color={COLORS.primary} />
              </TouchableOpacity>
              
              <Text 
                style={[
                  styles.textSubtitle,
                  localStyles.quantityText
                ]}
                accessibilityLabel={`Quantité: ${item.quantity}`}
              >
                {item.quantity}
              </Text>
              
              <TouchableOpacity
                onPress={() => onQuantityChange(item.id, item.quantity + 1)}
                style={[
                  localStyles.quantityButton,
                  localStyles.quantityButtonAdd
                ]}
                accessibilityLabel="Augmenter la quantité"
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
  total: number;
  itemCount: number;
  isCreatingOrder: boolean;
  onCheckout: () => void;
  screenType: 'mobile' | 'tablet' | 'desktop';
}

const CartSummary = React.memo<CartSummaryProps>(({ 
  total, 
  itemCount, 
  isCreatingOrder, 
  onCheckout,
  screenType 
}) => {
  const styles = createResponsiveStyles(screenType);
  const iconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType);

  return (
    <View style={localStyles.summaryContainer}>
      <View style={[localStyles.totalRow, styles.mb('md')]}>
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
      
      <Button
        title={isCreatingOrder ? "Traitement..." : "Commander"}
        onPress={onCheckout}
        disabled={isCreatingOrder || itemCount === 0}
        fullWidth
        leftIcon={<Ionicons name="checkmark-circle" size={iconSize} color={COLORS.text.inverse} />}
        accessibilityLabel={`Commander pour un total de ${total.toFixed(2)} euros`}
        accessibilityHint="Appuyez pour procéder au paiement"
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

  return (
    <Card style={[localStyles.restaurantCard, styles.mx('md'), styles.mt('md')]}>
      <View style={localStyles.restaurantContent}>
        <View style={localStyles.restaurantDetails}>
          <Text style={[styles.textSubtitle, localStyles.restaurantName]}>
            {restaurantName || 'Restaurant'}
          </Text>
          
          {tableNumber && (
            <Text style={[styles.textBody, styles.mt('xs')]}>
              Table {tableNumber}
            </Text>
          )}
          
          {hasActiveSession && (
            <View style={localStyles.sessionBadge}>
              <Ionicons name="people" size={14} color={COLORS.success} />
              <Text style={localStyles.sessionBadgeText}>
                Session collaborative active
              </Text>
            </View>
          )}
        </View>
        
        <View style={localStyles.itemCountContainer}>
          <Text style={styles.textCaption}>
            {itemCount} {itemCount > 1 ? 'articles' : 'article'}
          </Text>
        </View>
      </View>
    </Card>
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
      <Ionicons 
        name="cart-outline" 
        size={iconSize} 
        color={COLORS.border.dark} 
      />
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
          { textAlign: 'center', maxWidth: 300 }
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
  
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [currentTableNumber, setCurrentTableNumber] = useState(cart.tableNumber || '');
  const [showSessionModal, setShowSessionModal] = useState(false);

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    const loadTableFromQR = async () => {
      const qrData = await QRSessionUtils.getSession();
      if (qrData?.tableNumber && !currentTableNumber) {
        setCurrentTableNumber(qrData.tableNumber);
        setTableNumber(qrData.tableNumber);
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

  const handleQuantityChange = useCallback((itemId: string, newQuantity: number) => {
    if (newQuantity === 0) {
      Alert.alert(
        'Retirer l\'article',
        'Voulez-vous retirer cet article du panier ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Supprimer', 
            style: 'destructive',
            onPress: () => removeFromCart(itemId) 
          }
        ]
      );
    } else {
      updateQuantity(itemId, newQuantity);
    }
  }, [removeFromCart, updateQuantity]);

  const handleClearCart = useCallback(() => {
    Alert.alert(
      'Vider le panier',
      'Êtes-vous sûr de vouloir vider votre panier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Vider', 
          style: 'destructive', 
          onPress: clearCart 
        }
      ]
    );
  }, [clearCart]);

  const handleCheckout = useCallback(async () => {
    if (cart.items.length === 0) {
      Alert.alert('Panier vide', 'Ajoutez des articles à votre panier pour continuer');
      return;
    }

    // Vérifier s'il existe une session active
    if (currentTableNumber && cart.restaurantId) {
      if (hasActiveSession) {
        Alert.alert(
          'Session collaborative détectée',
          'Une session collaborative est active pour cette table. Voulez-vous la rejoindre ou créer une nouvelle session ?',
          [
            { text: 'Annuler', style: 'cancel' },
            { 
              text: 'Nouvelle commande', 
              onPress: () => navigateToCheckout() 
            },
            { 
              text: 'Rejoindre la session', 
              onPress: () => setShowSessionModal(true)
            }
          ]
        );
        return;
      } else {
        Alert.alert(
          'Commander seul ou en groupe ?',
          'Voulez-vous créer une session collaborative pour permettre à d\'autres personnes de la table de commander avec vous ?',
          [
            { text: 'Annuler', style: 'cancel' },
            { 
              text: 'Commande individuelle', 
              onPress: () => navigateToCheckout() 
            },
            { 
              text: 'Session collaborative', 
              onPress: () => setShowSessionModal(true)
            }
          ]
        );
        return;
      }
    }

    navigateToCheckout();
  }, [cart.items.length, cart.restaurantId, currentTableNumber, hasActiveSession, navigateToCheckout]);

  const handleSessionCreated = useCallback((createdSession: SessionData) => {
    console.log('✅ Session créée:', createdSession);
    setShowSessionModal(false);
    navigateToCheckout(createdSession.id);
  }, [navigateToCheckout]);

  const handleSessionJoined = useCallback((joinedSession: SessionData) => {
    console.log('✅ Session rejointe:', joinedSession);
    setShowSessionModal(false);
    navigateToCheckout(joinedSession.id);
  }, [navigateToCheckout]);

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
        contentContainerStyle={styles.pb('md')}
      >
        {/* Restaurant Info */}
        <RestaurantInfo
          restaurantName={cart.restaurantName || 'Restaurant'}
          tableNumber={currentTableNumber}
          itemCount={itemCount}
          hasActiveSession={hasActiveSession}
          screenType={screenType}
        />

        {/* Cart Items */}
        <View style={[localStyles.itemsContainer, styles.px('md'), styles.pt('md')]}>
          {cartItems.map((item) => (
            <CartItemCard
              key={item.id}
              item={item}
              onQuantityChange={handleQuantityChange}
              screenType={screenType}
            />
          ))}
        </View>
      </ScrollView>

      {/* Footer with total and checkout */}
      <CartSummary
        total={totalAmount}
        itemCount={itemCount}
        isCreatingOrder={isCreatingOrder}
        onCheckout={handleCheckout}
        screenType={screenType}
      />

      {/* Modal de session collaborative */}
      {showSessionModal && cart.restaurantId && currentTableNumber && (
        <SessionJoinModal
          visible={showSessionModal}
          onClose={() => setShowSessionModal(false)}
          restaurantId={cart.restaurantId}
          tableNumber={currentTableNumber}
          onSessionCreated={handleSessionCreated}
          onSessionJoined={handleSessionJoined}
        />
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
    padding: SPACING.md.mobile,
  },
  
  restaurantContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  restaurantDetails: {
    flex: 1,
  },
  
  restaurantName: {
    marginBottom: 4,
  },
  
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  
  sessionBadgeText: {
    fontSize: 12,
    color: COLORS.success,
    marginLeft: 4,
    fontWeight: '500',
  },
  
  itemCountContainer: {
    alignItems: 'flex-end',
  },

  // Cart Items Styles
  itemsContainer: {
    // Empty - spacing handled by responsive styles
  },
  
  cartItemCard: {
    padding: SPACING.sm.mobile,
  },
  
  cartItemContent: {
    flexDirection: 'row',
  },
  
  itemImage: {
    borderRadius: BORDER_RADIUS.md,
  },
  
  itemDetails: {
    flex: 1,
  },
  
  itemName: {
    marginBottom: 4,
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
  },
  
  quantityButtonAdd: {
    backgroundColor: COLORS.primary,
  },
  
  quantityText: {
    minWidth: 30,
    textAlign: 'center',
  },

  // Summary Styles
  summaryContainer: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md.mobile,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Empty Cart Styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl.mobile,
  },
  
  qrButtonsContainer: {
    width: '100%',
    maxWidth: 400,
  },
  
  qrButtons: {
    width: '100%',
    backgroundColor: 'transparent',
  },
});