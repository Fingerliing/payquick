import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
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
import { orderService } from '@/services/orderService';
import { OrderDetail } from '@/types/order';

// Constantes de design responsive
const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

// Couleurs de la charte
const COLORS = {
  primary: '#1E2A78',    // Bleu principal
  secondary: '#FFC845',  // Jaune/Orange
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF',
  },
  border: '#E5E7EB',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

// Hook pour détecter le type d'écran
const useScreenType = () => {
  const { width } = useWindowDimensions();
  
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
};

interface PaymentMethod {
  id: string;
  title: string;
  description: string;
  icon: string;
  badge?: string;
  recommended?: boolean;
}

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { user, isAuthenticated } = useAuth();
  const { clearCart } = useCart();
  const screenType = useScreenType();
  const styles = createStyles(screenType);
  
  const [order, setOrder] = useState<OrderDetail | null>(null);
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

  // Récupération réelle de la commande avec le service existant
  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderId) {
        Alert.alert('Erreur', 'ID de commande manquant');
        router.back();
        return;
      }

      try {
        console.log('🔄 Fetching order:', orderId);
        
        const orderData = await orderService.getOrderById(Number(orderId));
        console.log('✅ Order fetched:', orderData);
        
        setOrder(orderData);
      } catch (error: any) {
        console.error('❌ Error fetching order:', error);
        Alert.alert('Erreur', error.message || 'Impossible de charger la commande');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  const initializePaymentSheet = async () => {
    try {
      if (!order) return null;
  
      const paymentIntent = await paymentService.createPaymentIntent(order.id.toString());
  
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
      const paymentIntent = await initializePaymentSheet();
      if (!paymentIntent) {
        Alert.alert('Erreur', 'Impossible d\'initialiser le paiement');
        return;
      }

      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Erreur de paiement', error.message);
        }
        return;
      }

      await updateOrderPaymentStatus('online');
      
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
            try {
              await updateOrderPaymentStatus('cash');
              clearCart();
              router.replace(`/order/${order.id}`);
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Erreur lors de la confirmation');
            }
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  const updateOrderPaymentStatus = async (paymentMethod: string) => {
    try {
      console.log('🔄 Updating payment status:', { orderId: order!.id, paymentMethod });
      
      const updatedOrder = await orderService.markAsPaid(Number(order!.id), paymentMethod);
      
      console.log('✅ Payment status updated:', updatedOrder);
      
      setOrder(updatedOrder);
    } catch (error: any) {
      console.error('❌ Error updating payment status:', error);
      throw new Error(error.message || 'Erreur lors de la mise à jour du paiement');
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
              color={selectedMethod === method.id ? COLORS.primary : COLORS.text.secondary} 
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
          <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
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
          <ActivityIndicator size="large" color={COLORS.primary} />
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
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.text.secondary} />
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

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mainLayout}>
          {/* Colonne principale */}
          <View style={styles.mainColumn}>
            {/* Résumé de la commande */}
            <Card style={styles.orderSummary}>
              <View style={styles.orderHeader}>
                <View style={styles.orderInfo}>
                  <Text style={styles.orderTitle}>
                    Commande #{order.order_number || order.id}
                  </Text>
                  <Text style={styles.restaurantName}>
                    {order.restaurant_name || 'Restaurant'}
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
                      {item.quantity}x {item.menu_item_name || 'Article'}
                    </Text>
                    <Text style={styles.itemPrice}>
                      {parseFloat(item.total_price || '0').toFixed(2)} €
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total à payer</Text>
                <Text style={styles.totalAmount}>
                  {parseFloat(order.total_amount || order.subtotal || '0').toFixed(2)} €
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
          </View>

          {/* Colonne secondaire (messages) */}
          <View style={styles.sideColumn}>
            {/* Message d'encouragement pour le paiement en ligne */}
            {selectedMethod === 'online' && (
              <Card style={styles.developerMessage}>
                <View style={styles.messageHeader}>
                  <Ionicons name="heart" size={20} color={COLORS.secondary} />
                  <Text style={styles.messageTitle}>Soutenez le développeur</Text>
                  <Pressable 
                    onPress={showDeveloperInfo}
                    style={styles.infoButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
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
                  <Ionicons name="information-circle" size={20} color={COLORS.primary} />
                  <Text style={styles.messageTitle}>Paiement en caisse</Text>
                </View>
                <Text style={styles.messageText}>
                  Votre commande sera transmise au restaurant. Vous pourrez payer 
                  directement à votre table ou au comptoir.
                </Text>
              </Card>
            )}

            {/* Informations de sécurité */}
            <Card style={styles.securityInfo}>
              <View style={styles.messageHeader}>
                <Ionicons name="shield-checkmark" size={20} color={COLORS.success} />
                <Text style={styles.messageTitle}>Paiement sécurisé</Text>
              </View>
              <Text style={styles.messageText}>
                Vos données de paiement sont protégées par un chiffrement de niveau bancaire. 
                Nous ne stockons jamais vos informations de carte de crédit.
              </Text>
            </Card>
          </View>
        </View>
      </ScrollView>

      {/* Bouton de paiement */}
      <View style={styles.footer}>
        <Button
          title={
            processingPayment 
              ? 'Traitement...' 
              : selectedMethod === 'online' 
                ? `Payer ${parseFloat(order.total_amount || order.subtotal || '0').toFixed(2)} €` 
                : 'Confirmer la commande'
          }
          onPress={handlePayment}
          fullWidth
          disabled={processingPayment}
          loading={processingPayment}
          style={{ 
            backgroundColor: selectedMethod === 'online' ? COLORS.secondary : COLORS.primary,
            minHeight: 52,
          }}
        />
      </View>
    </SafeAreaView>
  );
}

// Fonction pour créer les styles responsive
const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop') => {
  const isTabletOrLarger = screenType !== 'mobile';
  const isDesktop = screenType === 'desktop';
  
  return {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: isTabletOrLarger ? 24 : 16,
      paddingBottom: 32,
    },
    
    // Layout principal responsive
    mainLayout: {
      flexDirection: (isTabletOrLarger ? 'row' : 'column') as 'row' | 'column',
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center' as const,
      width: '100%' as '100%'
    },
    mainColumn: {
      flex: isTabletOrLarger ? 2 : 1,
    },
    sideColumn: {
      flex: 1,
      minWidth: isTabletOrLarger ? 300 : undefined,
      gap: 16,
    },
    
    // États
    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: COLORS.text.secondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: 40,
    },
    errorText: {
      fontSize: 16,
      color: COLORS.text.secondary,
      marginTop: 16,
    },

    // Résumé de commande
    orderSummary: {
      marginBottom: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    orderHeader: {
      flexDirection: isTabletOrLarger ? 'row' as const : 'column' as const,
      justifyContent: 'space-between' as const,
      alignItems: isTabletOrLarger ? 'flex-start' as const : 'stretch' as const,
      marginBottom: 16,
      gap: isTabletOrLarger ? 0 : 12,
    },
    orderInfo: {
      flex: 1,
    },
    orderTitle: {
      fontSize: isTabletOrLarger ? 24 : 20,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    restaurantName: {
      fontSize: isTabletOrLarger ? 18 : 16,
      color: COLORS.text.secondary,
      marginBottom: 2,
    },
    tableNumber: {
      fontSize: 14,
      color: COLORS.text.secondary,
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
      borderBottomColor: COLORS.border,
    },
    itemName: {
      fontSize: 14,
      color: COLORS.text.primary,
      flex: 1,
    },
    itemPrice: {
      fontSize: 14,
      fontWeight: '500' as const,
      color: COLORS.text.primary,
    },
    totalContainer: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingTop: 16,
      borderTopWidth: 2,
      borderTopColor: COLORS.border,
    },
    totalLabel: {
      fontSize: isTabletOrLarger ? 20 : 18,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
    },
    totalAmount: {
      fontSize: isTabletOrLarger ? 24 : 20,
      fontWeight: 'bold' as const,
      color: COLORS.secondary,
    },

    // Méthodes de paiement
    paymentMethodsCard: {
      marginBottom: 16,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    sectionTitle: {
      fontSize: isTabletOrLarger ? 20 : 18,
      fontWeight: 'bold' as const,
      color: COLORS.text.primary,
      marginBottom: 16,
    },
    paymentMethods: {
      gap: 12,
    },
    paymentMethod: {
      borderWidth: 2,
      borderColor: COLORS.border,
      borderRadius: 12,
      padding: 16,
      backgroundColor: COLORS.surface,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    selectedPaymentMethod: {
      borderColor: COLORS.primary,
      backgroundColor: '#F8F9FF',
    },
    recommendedMethod: {
      borderColor: COLORS.success,
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
      borderColor: COLORS.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: 12,
    },
    radioButtonSelected: {
      borderColor: COLORS.primary,
    },
    radioButtonInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: COLORS.primary,
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
      flexWrap: 'wrap' as const,
    },
    methodTitle: {
      fontSize: 16,
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    selectedMethodTitle: {
      color: COLORS.primary,
    },
    recommendedBadge: {
      backgroundColor: COLORS.success,
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
      color: COLORS.text.secondary,
      marginBottom: 4,
    },
    methodBadge: {
      fontSize: 12,
      color: COLORS.secondary,
      fontWeight: '500' as const,
      fontStyle: 'italic' as const,
    },

    // Messages
    developerMessage: {
      backgroundColor: '#FFF7F0',
      borderColor: COLORS.secondary,
      borderWidth: 1,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    infoMessage: {
      backgroundColor: '#F8F9FF',
      borderColor: COLORS.primary,
      borderWidth: 1,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    securityInfo: {
      backgroundColor: '#F0FDF9',
      borderColor: COLORS.success,
      borderWidth: 1,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
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
      color: COLORS.text.primary,
      flex: 1,
    },
    infoButton: {
      padding: 4,
      borderRadius: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.5)',
      marginLeft: 8,
    },
    messageText: {
      fontSize: 14,
      color: COLORS.text.secondary,
      lineHeight: 20,
    },

    // Footer
    footer: {
      padding: isTabletOrLarger ? 24 : 16,
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
  };
};