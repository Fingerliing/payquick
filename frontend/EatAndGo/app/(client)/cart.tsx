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
import { router } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CartItem } from '@/types/cart';
import { ListRenderItem } from 'react-native';

export default function CartScreen() {
  const { 
    cart, 
    updateQuantity, 
    removeFromCart, 
    clearCart 
  } = useCart();

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
    router.push('/order/checkout');
  };

  const renderCartItem: ListRenderItem<CartItem> = ({ item }) => (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
            {item.name}
          </Text>
          <Text style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
            {item.price.toFixed(2)} € / unité
          </Text>
          {item.specialInstructions && (
            <Text style={{ fontSize: 12, color: '#FF9500', fontStyle: 'italic' }}>
              Note: {item.specialInstructions}
            </Text>
          )}
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
          <Ionicons name="bag-outline" size={80} color="#ccc" />
          <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 20, marginBottom: 12 }}>
            Votre panier est vide
          </Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 30 }}>
            Scannez un QR code ou parcourez les restaurants pour commencer
          </Text>
          
          <Button
            title="Scanner QR Code"
            onPress={() => router.push('/(client)/index')}
            leftIcon="qr-code-outline"
            style={{ marginBottom: 12 }}
          />
          
          <Button
            title="Parcourir les restaurants"
            onPress={() => router.push('/(client)/browse')}
            variant="outline"
            leftIcon="restaurant-outline"
          />
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
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 }}>
          {cart.restaurantName}
        </Text>
        {cart.tableNumber && (
          <Text style={{ fontSize: 14, color: '#666' }}>
            Table {cart.tableNumber}
          </Text>
        )}
      </Card>

      {/* Cart Items */}
      <FlatList
        data={cart.items}
        renderItem={renderCartItem}
        keyExtractor={(item: CartItem) => item.id}
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      />

      {/* Order Summary */}
      <Card style={{ margin: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 16, color: '#666' }}>Sous-total</Text>
          <Text style={{ fontSize: 16, color: '#333' }}>{cart.subtotal.toFixed(2)} €</Text>
        </View>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 16, color: '#666' }}>Frais de service</Text>
          <Text style={{ fontSize: 16, color: '#333' }}>{cart.deliveryFee.toFixed(2)} €</Text>
        </View>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>Total</Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FF6B35' }}>
            {cart.total.toFixed(2)} €
          </Text>
        </View>

        <Button
          title="Passer commande"
          onPress={handleCheckout}
          fullWidth
          style={{ backgroundColor: '#FF6B35' }}
        />
      </Card>
    </SafeAreaView>
  );
}