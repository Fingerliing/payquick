import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOrder } from '../../contexts/OrderContext';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Loading } from '../../components/ui/Loading';

export default function OrderSuccessScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { currentOrder, loadOrder } = useOrder();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      loadOrderData();
    }
  }, [orderId]);

  const loadOrderData = async () => {
    if (!orderId) return;
    
    try {
      await loadOrder(orderId);
    } catch (error) {
      console.error('Erreur lors du chargement de la commande:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande confirmée" />
        <Loading fullScreen text="Chargement de votre commande..." />
      </View>
    );
  }

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const successIconStyle: ViewStyle = {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 24,
  };

  const titleStyle: TextStyle = {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  };

  const subtitleStyle: TextStyle = {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  };

  const infoRowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  };

  const labelStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
  };

  const valueStyle: TextStyle = {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  };

  const getEstimatedTime = () => {
    if (!currentOrder?.estimatedDeliveryTime) return 'Non estimé';
    const time = new Date(currentOrder.estimatedDeliveryTime);
    return time.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <View style={containerStyle}>
      <Header title="Commande confirmée" />
      
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <View style={successIconStyle}>
            <Ionicons name="checkmark" size={40} color="#FFFFFF" />
          </View>
          
          <Text style={titleStyle}>Commande confirmée !</Text>
          <Text style={subtitleStyle}>
            Votre commande a été transmise au restaurant
          </Text>

          {currentOrder && (
            <>
              <View style={infoRowStyle}>
                <Text style={labelStyle}>Numéro de commande</Text>
                <Text style={valueStyle}>#{currentOrder.id.slice(-8)}</Text>
              </View>

              <View style={infoRowStyle}>
                <Text style={labelStyle}>Restaurant</Text>
                <Text style={valueStyle}>{currentOrder.restaurant.name}</Text>
              </View>

              <View style={infoRowStyle}>
                <Text style={labelStyle}>Montant total</Text>
                <Text style={valueStyle}>{currentOrder.total.toFixed(2)} €</Text>
              </View>

              <View style={infoRowStyle}>
                <Text style={labelStyle}>Statut</Text>
                <Text style={[valueStyle, { color: '#F59E0B' }]}>
                  En attente de confirmation
                </Text>
              </View>

              <View style={[infoRowStyle, { borderBottomWidth: 0 }]}>
                <Text style={labelStyle}>Livraison estimée</Text>
                <Text style={valueStyle}>{getEstimatedTime()}</Text>
              </View>
            </>
          )}
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
            Prochaines étapes
          </Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: '#3B82F6',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 12,
              marginTop: 2,
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>1</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                Confirmation du restaurant
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                Le restaurant va confirmer votre commande
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: '#8B5CF6',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 12,
              marginTop: 2,
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>2</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                Préparation
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                Votre commande sera préparée avec soin
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: '#10B981',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 12,
              marginTop: 2,
            }}>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>3</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                Livraison
              </Text>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                Votre commande sera livrée à l'adresse indiquée
              </Text>
            </View>
          </View>
        </Card>

        <View style={{ marginTop: 24, gap: 12 }}>
          <Button
            title="Suivre ma commande"
            onPress={() => {
              if (currentOrder) {
                router.replace(`/order/${currentOrder.id}`);
              }
            }}
            fullWidth
          />
          
          <Button
            title="Retour à l'accueil"
            onPress={() => router.replace('/(tabs)')}
            variant="outline"
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}