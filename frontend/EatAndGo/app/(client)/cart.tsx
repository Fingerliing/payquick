import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
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
import { TableOrders } from '@/components/order/TableOrders';
import { SessionJoinModal } from '@/components/session/SessionJoinModal';

// Utils & Types
import {
  COLORS,
  SPACING,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';
import { QRSessionUtils } from '@/utils/qrSessionUtils';

export default function CartScreen() {
  const { cart, removeFromCart, updateQuantity, clearCart, setTableNumber } = useCart();
  const { isAuthenticated } = useAuth();
  const screenType = useScreenType();
  
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [currentTableNumber, setCurrentTableNumber] = useState(cart.tableNumber || '');
  const [showSessionModal, setShowSessionModal] = useState(false);

  // Charger la table depuis la session QR
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

  // Hook pour vérifier s'il existe une session active sur cette table
  const { activeSession, hasActiveSession, loading: checkingSession } = useActiveTableSession(
    cart.restaurantId,
    currentTableNumber
  );

  // Hook de gestion de session collaborative
  const {
    session,
    currentParticipant,
    isHost,
    joinSession,
    createSession,
  } = useCollaborativeSession({
    sessionId: activeSession?.id,
  });

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType);
  const smallIconSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    if (newQuantity === 0) {
      Alert.alert(
        'Retirer l\'article',
        'Voulez-vous retirer cet article du panier ?',
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

    // Si on a une table, vérifier s'il existe une session active
    if (currentTableNumber && cart.restaurantId) {
      if (hasActiveSession) {
        // Proposer de rejoindre la session existante
        Alert.alert(
          'Session collaborative détectée',
          `Une session collaborative est active pour cette table. Voulez-vous la rejoindre ou créer une nouvelle session ?`,
          [
            { text: 'Annuler', style: 'cancel' },
            { 
              text: 'Nouvelle commande', 
              onPress: () => proceedToCheckout() 
            },
            { 
              text: 'Rejoindre la session', 
              onPress: () => setShowSessionModal(true)
            }
          ]
        );
        return;
      } else {
        // Proposer de créer une session collaborative
        Alert.alert(
          'Commander seul ou en groupe ?',
          'Voulez-vous créer une session collaborative pour permettre à d\'autres personnes de la table de commander avec vous ?',
          [
            { text: 'Annuler', style: 'cancel' },
            { 
              text: 'Commande individuelle', 
              onPress: () => proceedToCheckout() 
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

    // Pas de table définie, procéder normalement
    proceedToCheckout();
  };

  const proceedToCheckout = () => {
    // ✅ CORRECTION : Construction des query params comme string
    const queryParams: string[] = [];
    
    if (cart.restaurantId) {
      queryParams.push(`restaurantId=${cart.restaurantId}`);
    }
    if (currentTableNumber || cart.tableNumber) {
      queryParams.push(`tableNumber=${currentTableNumber || cart.tableNumber}`);
    }

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    if (isAuthenticated) {
      // ✅ CORRECTION : Utiliser une string template au lieu d'un objet params
      router.push(`/order/checkout${queryString}` as any);
    } else {
      router.push(`/order/guest-checkout${queryString}` as any);
    }
  };

  const handleSessionCreated = (createdSession: any) => {
    console.log('✅ Session créée:', createdSession);
    setShowSessionModal(false);
    
    // ✅ CORRECTION : Construction des query params comme string
    const queryParams: string[] = [];
    
    if (cart.restaurantId) {
      queryParams.push(`restaurantId=${cart.restaurantId}`);
    }
    if (currentTableNumber || cart.tableNumber) {
      queryParams.push(`tableNumber=${currentTableNumber || cart.tableNumber}`);
    }
    if (createdSession.id) {
      queryParams.push(`sessionId=${createdSession.id}`);
    }

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    if (isAuthenticated) {
      router.push(`/order/checkout${queryString}` as any);
    } else {
      router.push(`/order/guest-checkout${queryString}` as any);
    }
  };

  const handleSessionJoined = (joinedSession: any) => {
    console.log('✅ Session rejointe:', joinedSession);
    setShowSessionModal(false);
    
    // ✅ CORRECTION : Construction des query params comme string
    const queryParams: string[] = [];
    
    if (cart.restaurantId) {
      queryParams.push(`restaurantId=${cart.restaurantId}`);
    }
    if (currentTableNumber || cart.tableNumber) {
      queryParams.push(`tableNumber=${currentTableNumber || cart.tableNumber}`);
    }
    if (joinedSession.id) {
      queryParams.push(`sessionId=${joinedSession.id}`);
    }

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

    if (isAuthenticated) {
      router.push(`/order/checkout${queryString}` as any);
    } else {
      router.push(`/order/guest-checkout${queryString}` as any);
    }
  };

  // Panier vide avec commandes de table (mode visualisation)
  if (cart.items.length === 0 && cart.restaurantId && currentTableNumber) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <Header
          title={`Panier (0)`}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        
        <View style={{ flex: 1 }}>
          <TableOrders
            restaurantId={Number(cart.restaurantId) || 0}
            tableNumber={String(currentTableNumber)}
            onAddOrder={() => {
              router.push(`/menu/client/${cart.restaurantId}?tableNumber=${currentTableNumber}` as any);
            }}
            onOrderPress={(order) => {
              router.push(`/order/${order.id}` as any);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Panier vide sans table
  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <Header
          title="Panier"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <View style={{ alignItems: 'center' }}>
            <Ionicons 
              name="bag-outline" 
              size={getResponsiveValue({ mobile: 80, tablet: 100, desktop: 120 }, screenType)} 
              color={COLORS.variants.secondary[600]} 
            />
          </View>
          <Text style={{ 
            fontSize: getResponsiveValue({ mobile: 22, tablet: 26, desktop: 30 }, screenType),
            fontWeight: 'bold',
            color: COLORS.text.primary,
            marginTop: getResponsiveValue(SPACING.lg, screenType),
            marginBottom: getResponsiveValue(SPACING.sm, screenType),
            textAlign: 'center'
          }}>
            Votre panier est vide
          </Text>
          <Text style={{
            fontSize: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
            color: COLORS.text.secondary,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: getResponsiveValue(SPACING.xl, screenType)
          }}>
            Scannez un QR code ou parcourez les restaurants pour découvrir de délicieux plats
          </Text>
          
          <View style={{ width: '100%' }}>
            <QRAccessButtons
              compact
              vertical
              title="Scanner pour commander"
              description="Scannez un QR code pour accéder au menu"
              scanButtonText="Scanner QR Code"
              codeButtonText="Entrer le code"
              containerStyle={{ width: '100%', backgroundColor: 'transparent' }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Panier avec des articles
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header
        title={`Panier (${cart.itemCount || 0})`}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="trash-outline"
        onRightPress={handleClearCart}
      />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Restaurant Info */}
        <Card style={{ margin: getResponsiveValue(SPACING.md, screenType) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ 
                fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType), 
                fontWeight: 'bold', 
                color: COLORS.text.primary, 
                marginBottom: 4 
              }}>
                {cart.restaurantName || 'Restaurant'}
              </Text>
              {currentTableNumber && (
                <Text style={{ 
                  fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType), 
                  color: COLORS.text.secondary 
                }}>
                  Table {currentTableNumber}
                </Text>
              )}
              {hasActiveSession && (
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  marginTop: 4,
                  backgroundColor: '#E8F5E8',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4,
                  alignSelf: 'flex-start'
                }}>
                  <Ionicons name="people" size={14} color="#2D5A2D" />
                  <Text style={{ fontSize: 12, color: '#2D5A2D', marginLeft: 4, fontWeight: '500' }}>
                    Session collaborative active
                  </Text>
                </View>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: COLORS.text.secondary }}>
                {cart.itemCount} {cart.itemCount > 1 ? 'articles' : 'article'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Cart Items */}
        <View style={{ 
          paddingHorizontal: getResponsiveValue(SPACING.md, screenType), 
          paddingBottom: getResponsiveValue(SPACING.md, screenType) 
        }}>
          {cart.items.map((item) => (
            <Card key={item.id} style={{ 
              marginBottom: getResponsiveValue(SPACING.sm, screenType), 
              padding: getResponsiveValue(SPACING.sm, screenType) 
            }}>
              <View style={{ flexDirection: 'row' }}>
                {item.image && (
                  <Image 
                    source={{ uri: item.image }}
                    style={{ 
                      width: 80, 
                      height: 80, 
                      borderRadius: 8, 
                      marginRight: getResponsiveValue(SPACING.sm, screenType) 
                    }}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ 
                    fontSize: getResponsiveValue({ mobile: 16, tablet: 17, desktop: 18 }, screenType), 
                    fontWeight: '600', 
                    color: COLORS.text.primary, 
                    marginBottom: 4 
                  }}>
                    {item.name}
                  </Text>
                  {item.specialInstructions && (
                    <Text style={{ 
                      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType), 
                      color: COLORS.text.secondary, 
                      marginBottom: 8 
                    }}>
                      {item.specialInstructions}
                    </Text>
                  )}
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ 
                      fontSize: getResponsiveValue({ mobile: 16, tablet: 17, desktop: 18 }, screenType), 
                      fontWeight: 'bold', 
                      color: COLORS.primary 
                    }}>
                      {(item.price * item.quantity).toFixed(2)} €
                    </Text>
                    
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      gap: getResponsiveValue(SPACING.sm, screenType) 
                    }}>
                      <TouchableOpacity
                        onPress={() => handleQuantityChange(item.id, item.quantity - 1)}
                        style={{ 
                          backgroundColor: COLORS.variants.secondary[100],
                          borderRadius: 6,
                          padding: 8
                        }}
                      >
                        <Ionicons name="remove" size={smallIconSize} color={COLORS.primary} />
                      </TouchableOpacity>
                      
                      <Text style={{ 
                        fontSize: getResponsiveValue({ mobile: 16, tablet: 17, desktop: 18 }, screenType), 
                        fontWeight: '600', 
                        minWidth: 30, 
                        textAlign: 'center' 
                      }}>
                        {item.quantity}
                      </Text>
                      
                      <TouchableOpacity
                        onPress={() => handleQuantityChange(item.id, item.quantity + 1)}
                        style={{ 
                          backgroundColor: COLORS.primary,
                          borderRadius: 6,
                          padding: 8
                        }}
                      >
                        <Ionicons name="add" size={smallIconSize} color={COLORS.text.inverse} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>

      {/* Footer with total and checkout */}
      <View style={{ 
        backgroundColor: COLORS.surface,
        padding: getResponsiveValue(SPACING.md, screenType),
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      }}>
        <View style={{ 
          flexDirection: 'row', 
          justifyContent: 'space-between', 
          marginBottom: getResponsiveValue(SPACING.md, screenType) 
        }}>
          <Text style={{ 
            fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType), 
            fontWeight: '600',
            color: COLORS.text.primary
          }}>
            Total
          </Text>
          <Text style={{ 
            fontSize: getResponsiveValue({ mobile: 24, tablet: 26, desktop: 28 }, screenType), 
            fontWeight: 'bold', 
            color: COLORS.primary 
          }}>
            {cart.total.toFixed(2)} €
          </Text>
        </View>
        
        <Button
          title={isCreatingOrder ? "Traitement..." : "Commander"}
          onPress={handleCheckout}
          disabled={isCreatingOrder || cart.items.length === 0}
          fullWidth
          leftIcon={<Ionicons name="checkmark-circle" size={iconSize} color={COLORS.text.inverse} />}
        />
      </View>

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