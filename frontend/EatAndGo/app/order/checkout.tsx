import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { useClientOrders } from '@/hooks/client/useClientOrders';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function ClientCheckoutScreen() {
  const { cart, clearCart } = useCart();
  const { createOrder } = useClientOrders();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePlaceOrder = async () => {
    if (cart.items.length === 0) {
      Alert.alert('Erreur', 'Votre panier est vide');
      return;
    }

    if (!cart.restaurantId) {
      Alert.alert('Erreur', 'Restaurant non défini');
      return;
    }

    try {
      setLoading(true);
      
      const order = await createOrder(
        cart.items,
        cart.restaurantId,
        cart.tableNumber,
      ) as any;

      // Vider le panier
      clearCart();

      // Rediriger vers le suivi de commande
      router.replace(`/order/${order.id}`);
      
      Alert.alert(
        'Commande passée !',
        'Votre commande a été envoyée au restaurant. Vous recevrez une notification quand elle sera prête.',
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('Checkout error:', error);
      Alert.alert(
        'Erreur',
        'Impossible de passer la commande. Veuillez réessayer.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Votre panier est vide</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Finaliser la commande" 
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()} 
      />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Restaurant et table */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Détails de la commande
          </Text>
          <Text style={{ fontSize: 16, color: '#333', marginBottom: 8 }}>
            Restaurant: {cart.restaurantName}
          </Text>
          {cart.tableNumber && (
            <Text style={{ fontSize: 16, color: '#333' }}>
              Table: {cart.tableNumber}
            </Text>
          )}
        </Card>

        {/* Articles */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Vos articles
          </Text>
          {cart.items.map((item, index) => (
            <View 
              key={item.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderBottomWidth: index < cart.items.length - 1 ? 1 : 0,
                borderBottomColor: '#f0f0f0',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500' }}>
                  {item.quantity}x {item.name}
                </Text>
                {item.specialInstructions && (
                  <Text style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                    Note: {item.specialInstructions}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FF6B35' }}>
                {(item.price * item.quantity).toFixed(2)} €
              </Text>
            </View>
          ))}
        </Card>

        {/* Notes spéciales */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Instructions spéciales (optionnel)
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 12,
              minHeight: 80,
              textAlignVertical: 'top',
            }}
            placeholder="Allergies, préférences de cuisson, etc..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
          />
        </Card>

        {/* Résumé */}
        <Card style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Résumé
          </Text>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text>Sous-total</Text>
            <Text>{cart.subtotal.toFixed(2)} €</Text>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text>Frais de service</Text>
            <Text>{cart.deliveryFee.toFixed(2)} €</Text>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Total</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FF6B35' }}>
              {cart.total.toFixed(2)} €
            </Text>
          </View>

          <Button
            title={loading ? "Commande en cours..." : "Confirmer la commande"}
            onPress={handlePlaceOrder}
            loading={loading}
            disabled={loading}
            fullWidth
            style={{ backgroundColor: '#FF6B35' }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}