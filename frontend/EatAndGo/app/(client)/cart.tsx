import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  SafeAreaView,
  Alert,
  ScrollView,
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
import { clientOrderService } from '@/services/clientOrderService'; // ✅ CORRIGÉ: Utiliser le service existant

export default function CartScreen() {
  const { 
    cart, 
    updateQuantity, 
    removeFromCart, 
    clearCart,
    // Nouvelles propriétés pour les commandes multiples
    hasActiveTableOrders,
    tableOrders,
    isLoadingTableOrders,
    addOrderToTable,
    refreshTableOrders
  } = useCart();
  
  const { isAuthenticated } = useAuth();
  const { tableNumber } = useLocalSearchParams<{ tableNumber?: string }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false); // ✅ AJOUT: État pour la création de commande

  const currentTableNumber = tableNumber || cart.tableNumber;

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

    // Si on a une table avec des commandes actives, proposer d'ajouter à la session
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

    // Sinon, créer la commande et rediriger vers le paiement
    await createOrderAndRedirect();
  };

  const createOrderAndRedirect = async () => {
    if (!cart.restaurantId) {
      Alert.alert('Erreur', 'Restaurant non défini');
      return;
    }

    try {
      setIsCreatingOrder(true);

      // ✅ CORRIGÉ: Fix du type order_type avec typage explicite
      const orderType: 'dine_in' | 'takeaway' = currentTableNumber ? 'dine_in' : 'takeaway';
      
      const orderData = {
        restaurant: cart.restaurantId,
        order_type: orderType,
        table_number: currentTableNumber,
        customer_name: isAuthenticated ? 'Client connecté' : 'Client invité',
        phone: '',
        payment_method: 'cash', // Sera modifié sur la page de paiement
        notes: '',
        items: cart.items, // ✅ Passer directement les CartItem[], le service s'occupe de la conversion
      };

      console.log('🚀 Creating order from cart:', {
        restaurant: orderData.restaurant,
        order_type: orderData.order_type,
        table_number: orderData.table_number,
        items_count: orderData.items.length
      });

      // Créer la commande avec le service complet qui gère toute la validation
      const newOrder = await clientOrderService.createFromCart(orderData);
      
      console.log('✅ Order created for payment:', newOrder.id);

      // Rediriger vers la page de paiement
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
        payment_method: '', // Sera défini sur la page de paiement
        notes: '',
        items: []
      };

      const newOrder = await addOrderToTable(orderData);
      
      console.log('✅ Order added to table session:', newOrder.order_number);

      // Rediriger vers la page de paiement
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
      <View style={{ marginTop: 4 }}>
        {Object.entries(customizations).map(([key, value]) => (
          <Text key={key} style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>
            {String(key)}: {Array.isArray(value) ? value.join(', ') : String(value)}
          </Text>
        ))}
      </View>
    );
  };

  const renderCartItem: ListRenderItem<CartItem> = ({ item }) => (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
            {String(item.name || '')}
          </Text>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
            {(item.price || 0).toFixed(2)} € / unité
          </Text>
          
          {renderCustomizations(item.customizations)}
          
          {item.specialInstructions ? (
            <Text style={{ fontSize: 12, color: '#FF9500', fontStyle: 'italic', marginTop: 4 }}>
              Note: {String(item.specialInstructions)}
            </Text>
          ) : null}
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
          <Pressable
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#f0f0f0',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={() => handleQuantityChange(item.id, item.quantity - 1)}
          >
            <Ionicons name="remove" size={18} color="#666" />
          </Pressable>
          
          <Text style={{
            fontSize: 16,
            fontWeight: '600',
            marginHorizontal: 12,
            minWidth: 20,
            textAlign: 'center',
          }}>
            {String(item.quantity || 0)}
          </Text>
          
          <Pressable
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#f0f0f0',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={() => handleQuantityChange(item.id, item.quantity + 1)}
          >
            <Ionicons name="add" size={18} color="#666" />
          </Pressable>
        </View>
        
        <View style={{ alignItems: 'flex-end', marginLeft: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF6B35' }}>
            {((item.price || 0) * (item.quantity || 0)).toFixed(2)} €
          </Text>
          <Pressable
            style={{ marginTop: 8, padding: 4 }}
            onPress={() => removeFromCart(item.id)}
          >
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
          </Pressable>
        </View>
      </View>
    </Card>
  );

  // Panier vide avec table - Afficher les commandes existantes
  if (cart.items.length === 0 && cart.restaurantId && currentTableNumber) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header 
          title={`Table ${String(currentTableNumber || '')}`}
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()} 
        />
        
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
      </SafeAreaView>
    );
  }

  // Panier vide sans table
  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header 
          title="Panier" 
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()} 
        />
        
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Ionicons name="bag-outline" size={80} color="#ccc" style={{ marginBottom: 20 }} />
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' }}>
            Votre panier est vide
          </Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 30 }}>
            Scannez un QR code ou parcourez les restaurants pour commencer
          </Text>
          
          <QRAccessButtons
            compact
            vertical
            title="Scanner pour commander"
            description="Scannez un QR code pour accéder au menu"
            scanButtonText="Scanner QR Code"
            codeButtonText="Entrer le code"
            containerStyle={{ width: '100%', backgroundColor: 'transparent' }}
          />
          
          <View style={{ marginTop: 20, width: '100%' }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title={`Panier (${String(cart.itemCount || 0)})`}
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()}
        rightIcon="trash-outline"
        onRightPress={handleClearCart}
      />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* Restaurant Info */}
        <Card style={{ margin: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 }}>
                {String(cart.restaurantName || 'Restaurant')}
              </Text>
              {currentTableNumber ? (
                <Text style={{ fontSize: 14, color: '#666' }}>
                  Table {String(currentTableNumber)}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {String(cart.itemCount || 0)} {(cart.itemCount || 0) > 1 ? 'articles' : 'article'}
              </Text>
              {isLoadingTableOrders && currentTableNumber ? (
                <Text style={{ fontSize: 11, color: '#FF9500', marginTop: 2 }}>
                  Vérification des commandes...
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        {/* Alerte commandes existantes */}
        {hasActiveTableOrders && tableOrders && currentTableNumber && (
          <Card style={{ margin: 16, marginTop: 0, backgroundColor: '#FFF7ED', borderColor: '#FB923C' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Ionicons name="information-circle" size={24} color="#FB923C" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#FB923C', marginBottom: 4 }}>
                  Commandes en cours sur cette table
                </Text>
                <Text style={{ fontSize: 14, color: '#92400E', marginBottom: 8 }}>
                  {String(tableOrders?.active_orders?.length || 0)} commande(s) en cours. Vous pouvez ajouter votre commande à la session existante.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    title="Voir les commandes"
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      router.push(`/table/${String(currentTableNumber)}/orders?restaurantId=${String(cart.restaurantId)}`);
                    }}
                    style={{ borderColor: '#FB923C', flex: 1 }}
                  />
                  <Button
                    title="Actualiser"
                    variant="outline"
                    size="sm"
                    onPress={refreshTableOrders}
                    disabled={isLoadingTableOrders}
                    style={{ borderColor: '#FB923C' }}
                    leftIcon="refresh"
                  />
                </View>
              </View>
            </View>
          </Card>
        )}

        {/* Cart Items */}
        <View style={{ paddingHorizontal: 16 }}>
          <FlatList
            data={cart.items}
            renderItem={renderCartItem}
            keyExtractor={(item: CartItem) => String(item.id)}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Order Summary */}
        <Card style={{ margin: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Total</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FF6B35' }}>
              {(cart.total || 0).toFixed(2)} €
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            {/* Bouton principal de commande */}
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
              style={{ backgroundColor: '#FF6B35' }}
              disabled={isSubmitting || isCreatingOrder}
              loading={isCreatingOrder}
            />
            
            {/* Bouton d'ajout à la session existante (si applicable) */}
            {hasActiveTableOrders && currentTableNumber && (
              <Button
                title={isSubmitting ? "Ajout en cours..." : "Ajouter à la session en cours"}
                onPress={addToExistingSession}
                fullWidth
                variant="outline"
                style={{ borderColor: '#FF6B35' }}
                disabled={isSubmitting || isCreatingOrder}
                loading={isSubmitting}
              />
            )}
          </View>

          {/* Indicateurs d'état */}
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            {!isCreatingOrder && !isSubmitting ? (
              <>
                <Text style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
                  {isAuthenticated 
                    ? '🔒 Commande avec votre compte client' 
                    : '👤 Commande en tant qu\'invité'
                  }
                </Text>
                {hasActiveTableOrders && currentTableNumber ? (
                  <Text style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 2 }}>
                    Cette table a des commandes en cours
                  </Text>
                ) : (
                  <Text style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 2 }}>
                    Paiement sécurisé à l'étape suivante
                  </Text>
                )}
              </>
            ) : (
              <Text style={{ fontSize: 12, color: '#FF9500', textAlign: 'center' }}>
                {isCreatingOrder ? 'Création de la commande...' : 'Ajout à la session...'}
              </Text>
            )}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}