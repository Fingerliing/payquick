import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { CartItem } from '@/types/cart';
import { ListRenderItem } from 'react-native';

export default function CartScreen() {
  const { 
    cart, 
    updateQuantity, 
    removeFromCart, 
    clearCart 
  } = useCart();

  const { tableNumber } = useLocalSearchParams<{ tableNumber?: string }>();

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

  const handleCheckout = () => {
    if (cart.items.length === 0) {
      Alert.alert('Panier vide', 'Ajoutez des articles à votre panier pour continuer');
      return;
    }

    // Navigation vers le checkout avec les paramètres nécessaires
    const params: any = {};
    if (cart.restaurantId) {
      params.restaurantId = cart.restaurantId.toString();
    }
    if (tableNumber) {
      params.tableNumber = tableNumber;
    }

    router.push({
      pathname: '/order/checkout',
      params
    });
  };

  const handleGuestCheckout = () => {
    if (cart.items.length === 0) {
      Alert.alert('Panier vide', 'Ajoutez des articles à votre panier pour continuer');
      return;
    }

    // Navigation vers le checkout invité
    const params: any = {};
    if (cart.restaurantId) {
      params.restaurantId = cart.restaurantId.toString();
    }
    if (tableNumber) {
      params.tableNumber = tableNumber;
    }

    router.push({
      pathname: '/order/guest-checkout',
      params
    });
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
          
          {/* Utilisation du composant QRAccessButtons */}
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title={`Panier (${cart.itemCount})`}
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()}
        rightIcon="trash-outline"
        onRightPress={handleClearCart}
      />

      {/* Restaurant Info */}
      <Card style={{ margin: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 }}>
              {cart.restaurantName || 'Restaurant'}
            </Text>
            {tableNumber && (
              <Text style={{ fontSize: 14, color: '#666' }}>
                Table {tableNumber}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 12, color: '#666' }}>
              {cart.itemCount} {cart.itemCount > 1 ? 'articles' : 'article'}
            </Text>
          </View>
        </View>
      </Card>

      {/* Cart Items */}
      <FlatList
        data={cart.items}
        renderItem={renderCartItem}
        keyExtractor={(item: CartItem) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      />

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
            title="Passer commande (Client connecté)"
            onPress={handleCheckout}
            fullWidth
            style={{ backgroundColor: '#FF6B35' }}
          />
          
          <Button
            title="Commander en tant qu'invité"
            onPress={handleGuestCheckout}
            fullWidth
            variant="outline"
            style={{ borderColor: '#FF6B35' }}
          />
        </View>
      </Card>
    </SafeAreaView>
  );
}