import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  SafeAreaView,
  FlatList,
  Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TableOrders } from '@/components/order/TableOrders';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { Ionicons } from '@expo/vector-icons';
import { CartItem } from '@/types/cart';
import { ListRenderItem } from 'react-native';

export default function CartWithTableOrdersScreen() {
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
    if (hasActiveTableOrders && tableOrders) {
      Alert.alert(
        'Commandes en cours',
        `Cette table a déjà ${tableOrders.active_orders.length} commande(s) en cours. Voulez-vous ajouter cette commande à la session existante ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Nouvelle session', 
            onPress: () => navigateToCheckout() 
          },
          { 
            text: 'Ajouter à la session', 
            onPress: () => addToExistingSession() 
          }
        ]
      );
      return;
    }

    // Sinon, procéder normalement
    navigateToCheckout();
  };

  const navigateToCheckout = () => {
    const params: any = {};
    if (cart.restaurantId) {
      params.restaurantId = cart.restaurantId.toString();
    }
    if (tableNumber || cart.tableNumber) {
      params.tableNumber = tableNumber || cart.tableNumber;
    }

    if (isAuthenticated) {
      router.push({
        pathname: '/order/checkout',
        params
      });
    } else {
      router.push({
        pathname: '/order/guest-checkout',
        params
      });
    }
  };

  const addToExistingSession = async () => {
    if (!cart.restaurantId || !cart.tableNumber) {
      Alert.alert('Erreur', 'Informations de table manquantes');
      return;
    }

    try {
      setIsSubmitting(true);

      // Préparer les données de commande avec les types corrects
      const orderData = {
        restaurant: cart.restaurantId,
        order_type: 'dine_in' as const,
        table_number: cart.tableNumber,
        customer_name: isAuthenticated ? 'Client connecté' : 'Client invité',
        phone: '',
        payment_method: 'cash',
        notes: '',
        // Les items seront mappés automatiquement dans addOrderToTable
        items: []
      };

      const newOrder = await addOrderToTable(orderData);

      Alert.alert(
        'Commande ajoutée !',
        `Votre commande #${newOrder.order_number} a été ajoutée à la session de table existante.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );

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
            {key}: {Array.isArray(value) ? value.join(', ') : value}
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
            {item.name}
          </Text>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>
            {item.price.toFixed(2)} € / unité
          </Text>
          
          {/* Affichage des personnalisations */}
          {renderCustomizations(item.customizations)}
          
          {/* Instructions spéciales */}
          {item.specialInstructions && (
            <Text style={{ fontSize: 12, color: '#FF9500', fontStyle: 'italic', marginTop: 4 }}>
              Note: {item.specialInstructions}
            </Text>
          )}
        </View>
        
        {/* Contrôles de quantité */}
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
            {item.quantity}
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
        
        {/* Prix et suppression */}
        <View style={{ alignItems: 'flex-end', marginLeft: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF6B35' }}>
            {(item.price * item.quantity).toFixed(2)} €
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

  // Si pas d'articles dans le panier, afficher les commandes de la table
  if (cart.items.length === 0 && cart.restaurantId && cart.tableNumber) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header 
          title={`Table ${cart.tableNumber}`}
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()} 
        />
        
        <TableOrders
          restaurantId={cart.restaurantId}
          tableNumber={cart.tableNumber}
          onAddOrder={() => {
            // Rediriger vers le menu pour ajouter des articles
            router.push(`/menu/client/${cart.restaurantId}?tableNumber=${cart.tableNumber}`);
          }}
          onOrderPress={(order) => {
            // Rediriger vers les détails de la commande
            router.push(`/order/${order.id}`);
          }}
        />
      </SafeAreaView>
    );
  }

  // Panier vide sans informations de table
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
        title={`Panier (${cart.itemCount})`}
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
                {cart.restaurantName || 'Restaurant'}
              </Text>
              {(tableNumber || cart.tableNumber) && (
                <Text style={{ fontSize: 14, color: '#666' }}>
                  Table {tableNumber || cart.tableNumber}
                </Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: '#666' }}>
                {cart.itemCount} {cart.itemCount > 1 ? 'articles' : 'article'}
              </Text>
              {isLoadingTableOrders && (
                <Text style={{ fontSize: 11, color: '#FF9500', marginTop: 2 }}>
                  Chargement des commandes...
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* Alerte commandes existantes */}
        {hasActiveTableOrders && tableOrders && (
          <Card style={{ margin: 16, marginTop: 0, backgroundColor: '#FFF7ED', borderColor: '#FB923C' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Ionicons name="information-circle" size={24} color="#FB923C" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#FB923C', marginBottom: 4 }}>
                  Commandes en cours sur cette table
                </Text>
                <Text style={{ fontSize: 14, color: '#92400E', marginBottom: 8 }}>
                  Cette table a {tableOrders.active_orders.length} commande(s) en cours. 
                  Vous pouvez ajouter votre commande à la session existante.
                </Text>
                <Button
                  title="Voir les commandes en cours"
                  variant="outline"
                  size="small"
                  onPress={() => {
                    router.push(`/table/${cart.tableNumber}/orders?restaurantId=${cart.restaurantId}`);
                  }}
                  style={{ borderColor: '#FB923C' }}
                />
              </View>
            </View>
          </Card>
        )}

        {/* Cart Items */}
        <View style={{ paddingHorizontal: 16 }}>
          <FlatList
            data={cart.items}
            renderItem={renderCartItem}
            keyExtractor={(item: CartItem) => item.id}
            scrollEnabled={false}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Order Summary */}
        <Card style={{ margin: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Total</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FF6B35' }}>
              {cart.total.toFixed(2)} €
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            <Button
              title={hasActiveTableOrders ? "Passer commande (nouvelle session)" : "Passer commande"}
              onPress={handleCheckout}
              fullWidth
              style={{ backgroundColor: '#FF6B35' }}
              disabled={isSubmitting}
            />
            
            {hasActiveTableOrders && (
              <Button
                title={isSubmitting ? "Ajout en cours..." : "Ajouter à la session en cours"}
                onPress={addToExistingSession}
                fullWidth
                variant="outline"
                style={{ borderColor: '#FF6B35' }}
                disabled={isSubmitting}
                loading={isSubmitting}
              />
            )}
          </View>

          {/* Indicateur du type de checkout */}
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
              {isAuthenticated 
                ? '🔒 Commande avec votre compte client' 
                : '👤 Commande en tant qu\'invité'
              }
            </Text>
            {hasActiveTableOrders && (
              <Text style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 2 }}>
                Cette table a des commandes en cours
              </Text>
            )}
          </View>
        </Card>

        {/* Bouton de rafraîchissement des commandes de table */}
        {cart.restaurantId && cart.tableNumber && (
          <View style={{ padding: 16, paddingTop: 0 }}>
            <Button
              title="Actualiser les commandes de la table"
              onPress={refreshTableOrders}
              variant="outline"
              size="small"
              leftIcon="refresh"
              disabled={isLoadingTableOrders}
              loading={isLoadingTableOrders}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}