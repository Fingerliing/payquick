import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/common/StatusBadge';
import { paymentService } from '@/services/paymentService';

interface PaymentMethod {
  id: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
  recommended?: boolean;
}

interface Order {
  id: string;
  order_number: string;
  total: number;
  status: string;
  payment_status: string;
  restaurant_name?: string;
  table_number?: string;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { user, isAuthenticated } = useAuth();
  const { clearCart } = useCart();
  
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('online');

  const paymentMethods: PaymentMethod[] = [
    {
      id: 'online',
      title: 'Paiement en ligne',
      description: 'Carte bancaire via Stripe (sécurisé)',
      icon: 'card-outline',
      badge: 'Soutenez le développeur',
      recommended: true,
    },
    {
      id: 'cash',
      title: 'Payer en caisse',
      description: 'Payez directement au restaurant',
      icon: 'storefront-outline',
    },
  ];

  // Simulation de récupération de la commande
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        // Ici vous appelleriez votre API pour récupérer les détails de la commande
        // const response = await orderService.getOrder(orderId);
        
        // Simulation d'une commande
        const mockOrder: Order = {
          id: orderId || '1',
          order_number: `CMD${Date.now().toString().slice(-6)}`,
          total: 24.50,
          status: 'pending',
          payment_status: 'pending',
          restaurant_name: 'Le Bistrot Moderne',
          table_number: '12',
          items: [
            { id: '1', name: 'Burger Classic', price: 12.50, quantity: 1 },
            { id: '2', name: 'Frites maison', price: 4.50, quantity: 1 },
            { id: '3', name: 'Coca-Cola', price: 3.50, quantity: 2 },
          ],
        };
        
        setOrder(mockOrder);
      } catch (error) {
        console.error('Erreur lors de la récupération de la commande:', error);
        Alert.alert('Erreur', 'Impossible de charger la commande');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const initializePaymentSheet = async () => {
    try {
      if (!order) return null;
  
      const paymentIntent = await paymentService.createPaymentIntent(order.id);
  
      const { error } = await initPaymentSheet({
        merchantDisplayName: 'Eat&Go',
        paymentIntentClientSecret: paymentIntent.client_secret,
        style: 'automatic',
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: {
          name: user?.first_name ? `${user.first_name} ${user.username}` : undefined,
          email: user?.email,
        },
      });
  
      if (error) {
        console.error('Erreur initialisation PaymentSheet:', error);
        return null;
      }
  
      return paymentIntent;
    } catch (error) {
      console.error('Erreur lors de l\'initialisation du paiement:', error);
      return null;
    }
  };

  const showDeveloperInfo = () => {
    Alert.alert(
      'Information développeur',
      'Le développeur touche un petit pourcentage de la commande si elle est réglée depuis l\'application.',
      [{ text: 'Compris', style: 'default' }]
    );
  };

  const handleOnlinePayment = async () => {
    if (!order) return;

    setProcessingPayment(true);
    
    try {
      // Initialiser le PaymentSheet
      const paymentIntent = await initializePaymentSheet();
      if (!paymentIntent) {
        Alert.alert('Erreur', 'Impossible d\'initialiser le paiement');
        return;
      }

      // Présenter le PaymentSheet
      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Erreur de paiement', error.message);
        }
        return;
      }

      // Paiement réussi
      await updateOrderPaymentStatus('paid');
      
      Alert.alert(
        'Paiement réussi ! 🎉',
        'Votre commande a été payée avec succès. Merci d\'avoir soutenu le développeur !',
        [
          {
            text: 'Voir ma commande',
            onPress: () => {
              clearCart();
              router.replace(`/order/${order.id}`);
            },
          },
        ]
      );

    } catch (error) {
      console.error('Erreur lors du paiement:', error);
      Alert.alert('Erreur', 'Une erreur est survenue lors du paiement');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCashPayment = async () => {
    if (!order) return;

    Alert.alert(
      'Paiement en caisse',
      'Votre commande a été transmise au restaurant. Vous pourrez payer directement en caisse.',
      [
        {
          text: 'Confirmer',
          onPress: async () => {
            await updateOrderPaymentStatus('cash_pending');
            clearCart();
            router.replace(`/order/${order.id}`);
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  const updateOrderPaymentStatus = async (paymentStatus: string) => {
    try {
      // ✅ Utiliser le vrai service
      await paymentService.updatePaymentStatus(order!.id, paymentStatus);
      
      // Mettre à jour l'état local
      if (order) {
        setOrder({ ...order, payment_status: paymentStatus });
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
      throw error;
    }
  };

  const renderPaymentMethod = (method: PaymentMethod) => (
    <Pressable
      key={method.id}
      onPress={() => setSelectedMethod(method.id)}
      style={[
        styles.paymentMethod,
        selectedMethod === method.id && styles.selectedPaymentMethod,
        method.recommended && styles.recommendedMethod,
      ]}
    >
      <View style={styles.methodContent}>
        <View style={styles.methodLeft}>
          <View style={[
            styles.radioButton,
            selectedMethod === method.id && styles.radioButtonSelected,
          ]}>
            {selectedMethod === method.id && (
              <View style={styles.radioButtonInner} />
            )}
          </View>
          
          <View style={styles.methodIcon}>
            <Ionicons 
              name={method.icon as any} 
              size={24} 
              color={selectedMethod === method.id ? '#FF6B35' : '#666'} 
            />
          </View>
          
          <View style={styles.methodInfo}>
            <View style={styles.methodTitleContainer}>
              <Text style={[
                styles.methodTitle,
                selectedMethod === method.id && styles.selectedMethodTitle,
              ]}>
                {method.title}
              </Text>
              {method.recommended && (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>Recommandé</Text>
                </View>
              )}
            </View>
            <Text style={styles.methodDescription}>
              {method.description}
            </Text>
            {method.badge && (
              <Text style={styles.methodBadge}>
                {method.badge}
              </Text>
            )}
          </View>
        </View>
        
        {selectedMethod === method.id && (
          <Ionicons name="checkmark-circle" size={20} color="#FF6B35" />
        )}
      </View>
    </Pressable>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header 
          title="Paiement" 
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()} 
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <Header 
          title="Paiement" 
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()} 
        />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#666" />
          <Text style={styles.errorText}>Commande introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handlePayment = () => {
    if (selectedMethod === 'online') {
      handleOnlinePayment();
    } else {
      handleCashPayment();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header 
        title="Paiement" 
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()} 
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Résumé de la commande */}
        <Card style={styles.orderSummary}>
          <View style={styles.orderHeader}>
            <View>
              <Text style={styles.orderTitle}>
                Commande #{order.order_number}
              </Text>
              <Text style={styles.restaurantName}>
                {order.restaurant_name}
              </Text>
              {order.table_number && (
                <Text style={styles.tableNumber}>
                  Table {order.table_number}
                </Text>
              )}
            </View>
            <StatusBadge status={order.status} />
          </View>

          <View style={styles.orderItems}>
            {order.items.map((item) => (
              <View key={item.id} style={styles.orderItem}>
                <Text style={styles.itemName}>
                  {item.quantity}x {item.name}
                </Text>
                <Text style={styles.itemPrice}>
                  {(item.price * item.quantity).toFixed(2)} €
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total à payer</Text>
            <Text style={styles.totalAmount}>
              {order.total.toFixed(2)} €
            </Text>
          </View>
        </Card>

        {/* Méthodes de paiement */}
        <Card style={styles.paymentMethodsCard}>
          <Text style={styles.sectionTitle}>
            Choisissez votre mode de paiement
          </Text>
          
          <View style={styles.paymentMethods}>
            {paymentMethods.map(renderPaymentMethod)}
          </View>
        </Card>

        {/* Message d'encouragement pour le paiement en ligne */}
        {selectedMethod === 'online' && (
          <Card style={styles.developerMessage}>
            <View style={styles.messageHeader}>
              <Ionicons name="heart" size={20} color="#FF6B35" />
              <Text style={styles.messageTitle}>Soutenez le développeur</Text>
              <Pressable 
                onPress={showDeveloperInfo}
                style={styles.infoButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="information-circle-outline" size={18} color="#007AFF" />
              </Pressable>
            </View>
            <Text style={styles.messageText}>
              En choisissant le paiement en ligne, vous soutenez le développeur 
              dans le maintien et l'amélioration de cette application. Merci ! 🙏
            </Text>
          </Card>
        )}

        {/* Message pour le paiement en caisse */}
        {selectedMethod === 'cash' && (
          <Card style={styles.infoMessage}>
            <View style={styles.messageHeader}>
              <Ionicons name="information-circle" size={20} color="#007AFF" />
              <Text style={styles.messageTitle}>Paiement en caisse</Text>
            </View>
            <Text style={styles.messageText}>
              Votre commande sera transmise au restaurant. Vous pourrez payer 
              directement à votre table ou au comptoir.
            </Text>
          </Card>
        )}
      </ScrollView>

      {/* Bouton de paiement */}
      <View style={styles.footer}>
        <Button
          title={
            processingPayment 
              ? 'Traitement...' 
              : selectedMethod === 'online' 
                ? `Payer ${order.total.toFixed(2)} €` 
                : 'Confirmer la commande'
          }
          onPress={handlePayment}
          fullWidth
          disabled={processingPayment}
          loading={processingPayment}
          style={{ 
            backgroundColor: selectedMethod === 'online' ? '#FF6B35' : '#007AFF' 
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },

  // Résumé de commande
  orderSummary: {
    marginBottom: 16,
  },
  orderHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 16,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
    marginBottom: 4,
  },
  restaurantName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 2,
  },
  tableNumber: {
    fontSize: 14,
    color: '#666',
  },
  orderItems: {
    marginBottom: 16,
  },
  orderItem: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#333',
  },
  totalContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: '#FF6B35',
  },

  // Méthodes de paiement
  paymentMethodsCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
    marginBottom: 16,
  },
  paymentMethods: {
    gap: 12,
  },
  paymentMethod: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
  },
  selectedPaymentMethod: {
    borderColor: '#FF6B35',
    backgroundColor: '#FFF7F4',
  },
  recommendedMethod: {
    borderColor: '#10B981',
  },
  methodContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  methodLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  radioButtonSelected: {
    borderColor: '#FF6B35',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF6B35',
  },
  methodIcon: {
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitleContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 4,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
  },
  selectedMethodTitle: {
    color: '#FF6B35',
  },
  recommendedBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  recommendedText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '500' as const,
  },
  methodDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  methodBadge: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '500' as const,
    fontStyle: 'italic' as const,
  },

  // Messages
  developerMessage: {
    backgroundColor: '#FFF7F4',
    borderColor: '#FF6B35',
    borderWidth: 1,
    marginBottom: 16,
  },
  infoMessage: {
    backgroundColor: '#F0F9FF',
    borderColor: '#007AFF',
    borderWidth: 1,
    marginBottom: 16,
  },
  messageHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginLeft: 8,
    color: '#333',
    flex: 1,
  },
  infoButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
    marginLeft: 8,
  },
  messageText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },

  // Footer
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
};