import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useOrder } from '../../contexts/OrderContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { OrderSummary } from '../../components/order/OrderSummary';
import { Loading } from '../../components/ui/Loading';

export default function CheckoutScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const { cart, orderSummary, createOrder, calculateTotal } = useOrder();
  const [isLoading, setIsLoading] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: '',
    city: '',
    zipCode: '',
    apartment: '',
    instructions: '',
  });

  useEffect(() => {
    if (cart.length > 0) {
      calculateTotal();
    }
  }, [cart]);

  const validateForm = () => {
    if (cart.length === 0) {
      Alert.alert('Erreur', 'Votre panier est vide');
      return false;
    }

    if (!deliveryAddress.street || !deliveryAddress.city || !deliveryAddress.zipCode) {
      Alert.alert('Erreur', 'Veuillez remplir l\'adresse de livraison');
      return false;
    }

    return true;
  };

  const handlePlaceOrder = async () => {
    if (!validateForm() || !restaurantId) return;

    setIsLoading(true);
    try {
      const order = await createOrder({
        restaurantId,
        items: cart,
        deliveryAddress,
        customerNotes: customerNotes.trim() || undefined,
      });

      router.replace(`/order/success?orderId=${order.id}`);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de créer la commande');
    } finally {
      setIsLoading(false);
    }
  };

  if (cart.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Finaliser la commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 18, color: '#6B7280', textAlign: 'center' }}>
            Votre panier est vide
          </Text>
          <Button
            title="Retour aux restaurants"
            onPress={() => router.push('/(tabs)/restaurants')}
            style={{ marginTop: 20 }}
          />
        </View>
      </View>
    );
  }

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const sectionTitleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  };

  return (
    <View style={containerStyle}>
      <Header 
        title="Finaliser la commande" 
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()} 
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Articles du panier */}
        <Card style={{ margin: 16 }}>
          <Text style={sectionTitleStyle}>Votre commande</Text>
          {cart.map((item, index) => (
            <View key={index} style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              paddingVertical: 8,
              borderBottomWidth: index < cart.length - 1 ? 1 : 0,
              borderBottomColor: '#F3F4F6',
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                  {item.product.name}
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>
                  Quantité: {item.quantity}
                </Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                {item.totalPrice.toFixed(2)} €
              </Text>
            </View>
          ))}
        </Card>

        {/* Adresse de livraison */}
        <Card style={{ margin: 16 }}>
          <Text style={sectionTitleStyle}>Adresse de livraison</Text>
          
          <Input
            label="Adresse *"
            placeholder="123 Rue de la Paix"
            value={deliveryAddress.street}
            onChangeText={(value) => setDeliveryAddress(prev => ({ ...prev, street: value }))}
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Input
              label="Ville *"
              placeholder="Paris"
              value={deliveryAddress.city}
              onChangeText={(value) => setDeliveryAddress(prev => ({ ...prev, city: value }))}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Input
              label="Code postal *"
              placeholder="75001"
              value={deliveryAddress.zipCode}
              onChangeText={(value) => setDeliveryAddress(prev => ({ ...prev, zipCode: value }))}
              style={{ flex: 1, marginLeft: 8 }}
              keyboardType="numeric"
            />
          </View>

          <Input
            label="Appartement/Étage"
            placeholder="Apt 4B, 2ème étage"
            value={deliveryAddress.apartment}
            onChangeText={(value) => setDeliveryAddress(prev => ({ ...prev, apartment: value }))}
          />

          <Input
            label="Instructions de livraison"
            placeholder="Sonner à l'interphone, code d'accès..."
            value={deliveryAddress.instructions}
            onChangeText={(value) => setDeliveryAddress(prev => ({ ...prev, instructions: value }))}
            multiline
            numberOfLines={3}
          />
        </Card>

        {/* Notes pour le restaurant */}
        <Card style={{ margin: 16 }}>
          <Text style={sectionTitleStyle}>Notes pour le restaurant</Text>
          <Input
            placeholder="Allergies, préférences de cuisson, etc."
            value={customerNotes}
            onChangeText={setCustomerNotes}
            multiline
            numberOfLines={3}
          />
        </Card>

        {/* Résumé de la commande */}
        {orderSummary && (
          <OrderSummary summary={orderSummary} style={{ margin: 16 }} />
        )}
      </ScrollView>

      {/* Bouton de validation */}
      <View style={{ 
        backgroundColor: '#FFFFFF', 
        padding: 16, 
        borderTopWidth: 1, 
        borderTopColor: '#E5E7EB' 
      }}>
        <Button
          title={`Passer la commande • ${orderSummary?.total.toFixed(2) || '0.00'} €`}
          onPress={handlePlaceOrder}
          loading={isLoading}
          fullWidth
        />
      </View>
    </View>
  );
}