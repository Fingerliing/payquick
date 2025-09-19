import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  TextInput,
  Pressable,
  ActivityIndicator,
  Switch,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// UI components
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Receipt } from '@/components/receipt/Receipt';

// Split payment components
import { SplitPaymentModal } from '@/components/payment/SplitPaymentModal';
import { SplitPaymentStatus } from '@/components/payment/SplitPaymentStatus';

// Services
import { orderService } from '@/services/orderService';
import { paymentService } from '@/services/paymentService';
import { receiptService } from '@/services/receiptService';

// Split payment types and services
import { SplitPaymentMode, SplitPaymentPortion, SplitPaymentSession } from '@/types/splitPayment';
import { splitPaymentService } from '@/services/splitPaymentService';

// Contexts
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// ==== Design System
const COLORS = {
  primary: '#1E2A78',
  secondary: '#FFC845',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    light: '#64748B',
  },
  border: {
    light: '#E2E8F0',
    medium: '#CBD5E1',
  },
  shadow: 'rgba(15, 23, 42, 0.08)',
  overlay: 'rgba(15, 23, 42, 0.5)',
};

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

// Responsive hook
const useScreenType = () => {
  const { width } = useWindowDimensions();
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
};

const getResponsiveValue = (values: any, screenType: string) => {
  if (typeof values === 'object' && values !== null) {
    return values[screenType] || values.mobile || Object.values(values)[0];
  }
  return values;
};

// ==== Types
export interface OrderItem {
  id?: number | string;
  name: string;
  quantity: number;
  total_price: number | string;
}

export interface OrderDetail {
  id: number | string;
  order_number?: string;
  restaurant_name?: string;
  table_number?: string | number | null;
  items?: OrderItem[];
  total_amount: number | string;
  payment_status?: 'unpaid' | 'paid' | 'cash_pending' | 'partial_paid' | string;
  payment_method?: 'online' | 'cash' | 'split' | string;
  customer_email?: string | null;
  tip_amount?: number | string;
}

interface PaymentMethod {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  recommended?: boolean;
  disabled?: boolean;
}

// ==== Helpers
const safeParseFloat = (value: any, fallback = 0): number => {
  if (typeof value === 'number' && !isNaN(value)) return value;
  const parsed = parseFloat(String(value || fallback));
  return isNaN(parsed) ? fallback : parsed;
};

const formatCurrency = (v: number | string | null | undefined) => {
  const num = safeParseFloat(v);
  return `${num.toFixed(2)} €`;
};

const isEmail = (v: string) => /^(?:[^\s@]+@[^\s@]+\.[^\s@]+)$/i.test(v.trim());

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { clearCart } = useCart();
  const { user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const screenType = useScreenType();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');

  // Split payment states
  const [splitMode, setSplitMode] = useState<SplitPaymentMode>('none');
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitSession, setSplitSession] = useState<SplitPaymentSession | null>(null);
  const [currentUserPortionId, setCurrentUserPortionId] = useState<string>('');

  const [tipAmount, setTipAmount] = useState(0);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | null>(null);
  const [customTipInput, setCustomTipInput] = useState('');

  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [wantReceipt, setWantReceipt] = useState(true);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const TIP_PERCENTAGES = [5, 10, 15, 20];

  // Payment methods configuration
  const paymentMethods: PaymentMethod[] = [
    {
      id: 'online',
      title: 'Carte bancaire',
      description: 'Paiement sécurisé par Stripe • Aide le développeur',
      icon: 'card',
      badge: 'Instantané',
      recommended: true,
      disabled: !STRIPE_PUBLISHABLE_KEY,
    },
    {
      id: 'cash',
      title: 'Espèces au restaurant',
      description: 'Payez directement à votre table',
      icon: 'cash',
      badge: 'Disponible',
    },
  ];

  useEffect(() => {
    loadOrder();
    loadSplitSession();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await orderService.getOrderById(Number(orderId));
      setOrder(data as unknown as OrderDetail);
      
      const savedEmail = await AsyncStorage.getItem('customerEmail');
      if (savedEmail && !customerEmail) setCustomerEmail(savedEmail);
    } catch (error) {
      console.error('Error loading order:', error);
      Alert.alert('Erreur', "Impossible de charger la commande");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadSplitSession = async () => {
    try {
      const session = await splitPaymentService.getSplitSession(orderId as string);
      if (session) {
        setSplitSession(session);
        setSplitMode(session.splitType);
        
        const userPortion = session.portions.find(p => !p.isPaid);
        if (userPortion) {
          setCurrentUserPortionId(userPortion.id);
        }
      }
    } catch (error) {
      console.warn('No split session found:', error);
    }
  };

  const handleTipPercentage = (percent: number) => {
    if (!order) return;
    if (selectedTipPercent === percent) {
      setSelectedTipPercent(null);
      setTipAmount(0);
      setCustomTipInput('');
    } else {
      setSelectedTipPercent(percent);
      const orderAmount = safeParseFloat(order.total_amount);
      const tip = Math.round(orderAmount * (percent / 100) * 100) / 100;
      setTipAmount(tip);
      setCustomTipInput(tip.toFixed(2));
    }
  };

  const handleCustomTip = (text: string) => {
    setCustomTipInput(text);
    const amount = parseFloat(text.replace(',', '.'));
    if (!isNaN(amount) && amount >= 0) {
      setTipAmount(Math.max(0, Math.round(amount * 100) / 100));
      setSelectedTipPercent(null);
    } else {
      setTipAmount(0);
      setSelectedTipPercent(null);
    }
  };

  const totalWithTip = useMemo(() => {
    const orderAmount = safeParseFloat(order?.total_amount);
    const tip = safeParseFloat(tipAmount);
    return Math.round((orderAmount + tip) * 100) / 100;
  }, [order?.total_amount, tipAmount]);

  // Split payment handlers (simplified for brevity)
  const handleSplitPaymentConfirm = async (
    mode: SplitPaymentMode, 
    portions: Omit<SplitPaymentPortion, 'id' | 'isPaid' | 'paidAt'>[]
  ) => {
    console.log('handleSplitPaymentConfirm called with:', { mode, portions });
    
    if (!order) {
      Alert.alert('Erreur', 'Commande non trouvée');
      return;
    }
  
    try {
      setProcessing(true);
      console.log('Creating split session...');
  
      // Créer la session de paiement divisé
      const session = await splitPaymentService.createSplitSession(
        orderId as string, 
        mode as 'equal' | 'custom', 
        portions.map(p => ({
          name: p.name || '',
          amount: p.amount
        }))
      );
  
      console.log('Split session created:', session);
  
      // Mettre à jour l'état local
      setSplitSession(session);
      setSplitMode(mode);
      
      // Trouver la portion de l'utilisateur actuel (la première non payée par défaut)
      const userPortion = session.portions.find(p => !p.isPaid);
      if (userPortion) {
        setCurrentUserPortionId(userPortion.id);
        console.log('User portion set:', userPortion.id);
      }
  
      // Fermer la modal
      setShowSplitModal(false);
  
      // Afficher un message de confirmation
      Alert.alert(
        'Paiement divisé créé !', 
        `La note a été divisée en ${session.portions.length} parts. Vous pouvez maintenant payer votre part.`,
        [{ text: 'OK' }]
      );
  
      console.log('Split payment setup completed successfully');
  
    } catch (error) {
      console.error('Error creating split payment session:', error);
      
      // Afficher un message d'erreur plus informatif
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Une erreur est survenue lors de la création du paiement divisé';
        
      Alert.alert('Erreur', errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const initializePayment = async () => {
    if (paymentMethod !== 'online' || !order) return false;

    try {
      // Important: s'assurer que le PaymentIntent inclut le pourboire.
      // On tente d'envoyer tip/total, avec repli si l'API existante ne l'accepte pas.
      let clientSecret: string | undefined;
      try {
        const res = await (paymentService as any).createPaymentIntent(orderId, {
          tip_amount: safeParseFloat(tipAmount), // Utiliser la fonction sécurisée
          total_with_tip: safeParseFloat(totalWithTip),
        });
        clientSecret = res?.client_secret;
      } catch (e) {
        // fallback compat: API sans payload additionnel
        const res = await paymentService.createPaymentIntent(orderId as string);
        clientSecret = (res as any)?.client_secret;
      }

      if (!clientSecret) throw new Error('Client secret manquant');

      const { error } = await initPaymentSheet({
        merchantDisplayName: order.restaurant_name || 'Restaurant',
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { email: customerEmail || undefined },
        appearance: {
          colors: {
            primary: COLORS.primary,
            background: COLORS.surface,
            componentBackground: COLORS.background,
            primaryText: COLORS.text.primary,
          },
          shapes: {
            borderRadius: 12,
            borderWidth: 1,
          },
        },
      });

      if (error) {
        console.error('Error initializing payment sheet:', error);
        throw error;
      }
      return true;
    } catch (error) {
      console.error('Error initializing payment:', error);
      Alert.alert('Erreur', "Impossible d'initialiser le paiement");
      return false;
    }
  };


  const handleOnlinePayment = async () => {
    if (!order) return;
    if (!STRIPE_PUBLISHABLE_KEY) {
      Alert.alert('Configuration Stripe manquante',
        "La clé publique Stripe n'est pas configurée. Contactez le support.");
      return;
    }
    if (wantReceipt && customerEmail && !isEmail(customerEmail)) {
      Alert.alert('Email invalide', "Veuillez saisir une adresse email valide ou désactivez l'envoi du ticket.");
      return;
    }

    setProcessing(true);
    try {
      if (customerEmail) await AsyncStorage.setItem('customerEmail', customerEmail.trim());

      const initialized = await initializePayment();
      if (!initialized) { setProcessing(false); return; }

      const { error } = await presentPaymentSheet();
      if (error) {
        if ((error as any).code === 'Canceled') {
          console.log('Payment canceled by user');
        } else {
          Alert.alert('Erreur de paiement', (error as any).message || 'Paiement refusé');
        }
        setProcessing(false);
        return;
      }

      await handlePaymentSuccess('online');
    } catch (error) {
      console.error('Payment error:', error);
      Alert.alert('Erreur', 'Le paiement a échoué');
      setProcessing(false);
    }
  };

  const handleCashPayment = async () => {
    if (!order) return;
    Alert.alert(
      'Paiement en espèces',
      'Confirmez-vous le paiement en espèces au restaurant ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setProcessing(true);
            try {
              await paymentService.updatePaymentStatus(orderId as string, 'cash_pending');
              if (customerEmail) await AsyncStorage.setItem('customerEmail', customerEmail.trim());
              await handlePaymentSuccess('cash');
            } catch (error) {
              console.error('Error confirming cash payment:', error);
              Alert.alert('Erreur', 'Impossible de confirmer le paiement');
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handlePaymentSuccess = async (method: 'online' | 'cash') => {
    try {
      if (method === 'online') {
        await paymentService.updatePaymentStatus(orderId as string, 'paid');
      }

      if (wantReceipt && customerEmail && isEmail(customerEmail)) {
        try {
          await receiptService.sendReceiptByEmail({ 
            order_id: Number(orderId), 
            email: customerEmail.trim(), 
            format: 'pdf', 
            language: 'fr' 
          } as any);
        } catch (e) {
          console.warn('Receipt email failed, continuing:', e);
        }
      }

      clearCart();
      setPaymentSuccess(true);

      Alert.alert(
        'Paiement réussi !',
        method === 'online'
          ? 'Votre paiement a été confirmé.'
          : 'Votre commande est confirmée. Vous paierez au restaurant.',
        [
          {
            text: wantReceipt && customerEmail ? 'Voir le ticket' : 'OK',
            onPress: () => {
              if (wantReceipt && customerEmail) setShowReceiptPreview(true);
              else router.replace(`/order/${orderId}`);
            },
          },
        ]
      );
    } catch (error) {
      console.error('Post-payment steps error:', error);
      router.replace(`/order/${orderId}`);
    } finally {
      setProcessing(false);
    }
  };

  const handlePayPortion = async (portionId: string) => {
    if (!order) return;
    
    if (!STRIPE_PUBLISHABLE_KEY) {
      Alert.alert('Configuration Stripe manquante',
        "La clé publique Stripe n'est pas configurée. Contactez le support.");
      return;
    }
  
    setProcessing(true);
    try {
      console.log('Creating payment intent for portion:', portionId);
      
      // Créer le PaymentIntent pour cette portion
      const paymentData = await splitPaymentService.createPortionPaymentIntent(
        orderId as string, 
        portionId
      );
      
      console.log('Payment intent created:', paymentData);
  
      // Initialiser Stripe Payment Sheet
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: order.restaurant_name || 'Restaurant',
        paymentIntentClientSecret: paymentData.client_secret,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { email: customerEmail || undefined },
        appearance: {
          colors: {
            primary: COLORS.primary,
            background: COLORS.surface,
            componentBackground: COLORS.background,
            primaryText: COLORS.text.primary,
          },
          shapes: {
            borderRadius: 12,
            borderWidth: 1,
          },
        },
      });
  
      if (initError) {
        console.error('Error initializing payment sheet:', initError);
        Alert.alert('Erreur', "Impossible d'initialiser le paiement");
        setProcessing(false);
        return;
      }
  
      // Présenter le Payment Sheet
      const { error: paymentError } = await presentPaymentSheet();
      
      if (paymentError) {
        if ((paymentError as any).code === 'Canceled') {
          console.log('Payment canceled by user');
        } else {
          Alert.alert('Erreur de paiement', (paymentError as any).message || 'Paiement refusé');
        }
        setProcessing(false);
        return;
      }
  
      // Confirmer le paiement côté backend
      await splitPaymentService.confirmPortionPayment(
        orderId as string,
        portionId,
        paymentData.payment_intent_id
      );
  
      console.log('Portion payment confirmed successfully');
  
      // Recharger la session pour mettre à jour l'état
      await loadSplitSession();
  
      // Vérifier si tous les paiements sont terminés
      const completionStatus = await splitPaymentService.checkCompletion(orderId as string);
      
      if (completionStatus.isCompleted) {
        // Finaliser la commande
        await splitPaymentService.completePayment(orderId as string);
        await orderService.updateOrderStatus(Number(orderId), 'paid');
        
        // Envoyer le reçu si demandé
        if (wantReceipt && customerEmail && isEmail(customerEmail)) {
          try {
            await receiptService.sendReceiptByEmail({ 
              order_id: Number(orderId), 
              email: customerEmail.trim(), 
              format: 'pdf', 
              language: 'fr' 
            } as any);
          } catch (e) {
            console.warn('Receipt email failed, continuing:', e);
          }
        }
  
        Alert.alert(
          'Paiement réussi !',
          'Tous les paiements ont été effectués. La commande est maintenant complète.',
          [
            {
              text: wantReceipt && customerEmail ? 'Voir le ticket' : 'OK',
              onPress: () => {
                if (wantReceipt && customerEmail) setShowReceiptPreview(true);
                else router.replace(`/order/${orderId}`);
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Paiement réussi !',
          `Votre part a été payée avec succès. Il reste ${completionStatus.remainingPortions} portion(s) à payer.`,
          [{ text: 'OK' }]
        );
      }
  
    } catch (error) {
      console.error('Error paying portion:', error);
      Alert.alert('Erreur', 'Le paiement de cette portion a échoué');
    } finally {
      setProcessing(false);
    }
  };
  
  const handlePayAllRemaining = async () => {
    if (!order || !splitSession) return;
    
    if (!STRIPE_PUBLISHABLE_KEY) {
      Alert.alert('Configuration Stripe manquante',
        "La clé publique Stripe n'est pas configurée. Contactez le support.");
      return;
    }
  
    const unpaidPortions = splitSession.portions.filter(p => !p.isPaid);
    if (unpaidPortions.length === 0) {
      Alert.alert('Information', 'Toutes les portions sont déjà payées');
      return;
    }
  
    const totalRemaining = unpaidPortions.reduce((sum, p) => sum + p.amount, 0);
  
    Alert.alert(
      'Payer toutes les portions restantes',
      `Vous allez payer ${formatCurrency(totalRemaining)} pour ${unpaidPortions.length} portion(s). Confirmez-vous ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setProcessing(true);
            try {
              console.log('Creating payment intent for remaining portions');
              
              // Créer le PaymentIntent pour toutes les portions restantes
              const paymentData = await splitPaymentService.createRemainingPaymentIntent(
                orderId as string
              );
              
              console.log('Payment intent created for remaining portions:', paymentData);
  
              // Initialiser Stripe Payment Sheet
              const { error: initError } = await initPaymentSheet({
                merchantDisplayName: order.restaurant_name || 'Restaurant',
                paymentIntentClientSecret: paymentData.client_secret,
                allowsDelayedPaymentMethods: false,
                defaultBillingDetails: { email: customerEmail || undefined },
                appearance: {
                  colors: {
                    primary: COLORS.primary,
                    background: COLORS.surface,
                    componentBackground: COLORS.background,
                    primaryText: COLORS.text.primary,
                  },
                  shapes: {
                    borderRadius: 12,
                    borderWidth: 1,
                  },
                },
              });
  
              if (initError) {
                console.error('Error initializing payment sheet:', initError);
                Alert.alert('Erreur', "Impossible d'initialiser le paiement");
                setProcessing(false);
                return;
              }
  
              // Présenter le Payment Sheet
              const { error: paymentError } = await presentPaymentSheet();
              
              if (paymentError) {
                if ((paymentError as any).code === 'Canceled') {
                  console.log('Payment canceled by user');
                } else {
                  Alert.alert('Erreur de paiement', (paymentError as any).message || 'Paiement refusé');
                }
                setProcessing(false);
                return;
              }
  
              // Confirmer le paiement côté backend
              await splitPaymentService.confirmRemainingPayments(
                orderId as string,
                paymentData.payment_intent_id
              );
  
              console.log('All remaining payments confirmed successfully');
  
              // Finaliser la commande
              await splitPaymentService.completePayment(orderId as string);
              await orderService.updateOrderStatus(Number(orderId), 'paid');
              
              // Recharger la session pour mettre à jour l'état
              await loadSplitSession();
  
              // Envoyer le reçu si demandé
              if (wantReceipt && customerEmail && isEmail(customerEmail)) {
                try {
                  await receiptService.sendReceiptByEmail({ 
                    order_id: Number(orderId), 
                    email: customerEmail.trim(), 
                    format: 'pdf', 
                    language: 'fr' 
                  } as any);
                } catch (e) {
                  console.warn('Receipt email failed, continuing:', e);
                }
              }
  
              Alert.alert(
                'Paiement réussi !',
                'Tous les paiements ont été effectués. La commande est maintenant complète.',
                [
                  {
                    text: wantReceipt && customerEmail ? 'Voir le ticket' : 'OK',
                    onPress: () => {
                      if (wantReceipt && customerEmail) setShowReceiptPreview(true);
                      else router.replace(`/order/${orderId}`);
                    },
                  },
                ]
              );
  
            } catch (error) {
              console.error('Error paying remaining portions:', error);
              Alert.alert('Erreur', 'Le paiement des portions restantes a échoué');
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Create responsive styles
  const styles = createStyles(screenType);
  const iconSize = getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType);

  // ==== Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Paiement" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Chargement de la commande...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==== Success state
  if (paymentSuccess) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Paiement réussi" />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
          </View>
          <Text style={styles.successTitle}>Paiement confirmé !</Text>
          <Text style={styles.successMessage}>
            {paymentMethod === 'online'
              ? 'Votre paiement a été traité avec succès.'
              : 'Votre commande est confirmée. Vous paierez au restaurant.'}
            {wantReceipt && customerEmail && '\n\nVotre ticket a été envoyé par email.'}
          </Text>
          <View style={styles.successActions}>
            <Button 
              title="Voir le ticket" 
              onPress={() => setShowReceiptPreview(true)} 
              fullWidth 
              style={styles.primaryButton} 
            />
            <Button 
              title="Retour à la commande" 
              onPress={() => router.replace(`/order/${orderId}`)} 
              variant="outline" 
              fullWidth 
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <SafeAreaView style={styles.container}>
        <Header title="Paiement" leftIcon="arrow-back" onLeftPress={() => router.back()} />

        <View style={styles.content}>
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.mainLayout}>
              {/* Main Column */}
              <View style={styles.mainColumn}>
                {/* Order Summary */}
                <Card style={styles.orderSummaryCard}>
                  <View style={styles.cardHeader}>
                    <Ionicons name="receipt-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.cardTitle}>Résumé de la commande</Text>
                  </View>
                  
                  <View style={styles.orderInfo}>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>N° Commande</Text>
                      <Text style={styles.infoValue}>{order?.order_number}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Restaurant</Text>
                      <Text style={styles.infoValue}>{order?.restaurant_name}</Text>
                    </View>
                    {!!order?.table_number && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Table</Text>
                        <Text style={styles.infoValue}>{order?.table_number}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.itemsList}>
                    {order?.items?.map((item, index) => (
                      <View key={`${item.id ?? index}`} style={styles.orderItem}>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemQuantity}>{item.quantity}×</Text>
                          <Text style={styles.itemName}>{item.name}</Text>
                        </View>
                        <Text style={styles.itemPrice}>{formatCurrency(item.total_price)}</Text>
                      </View>
                    ))}
                  </View>
                </Card>

                {/* Payment Methods */}
                {splitSession && splitMode !== 'none' ? (
                  <SplitPaymentStatus
                    session={splitSession}
                    currentUserPortionId={currentUserPortionId}
                    onPayPortion={handlePayPortion}
                    onPayAllRemaining={handlePayAllRemaining}
                    isProcessing={processing}
                  />
                ) : (
                  <>
                    <Card style={styles.paymentMethodsCard}>
                      <View style={styles.cardHeader}>
                        <Ionicons name="wallet-outline" size={24} color={COLORS.primary} />
                        <Text style={styles.cardTitle}>Méthode de paiement</Text>
                      </View>

                      <View style={styles.paymentMethodsList}>
                        {paymentMethods.map((method) => (
                          <Pressable
                            key={method.id}
                            style={[
                              styles.paymentMethodItem,
                              paymentMethod === method.id && styles.selectedPaymentMethod,
                              method.recommended && styles.recommendedMethod,
                            ]}
                            onPress={() => !method.disabled && setPaymentMethod(method.id as 'online' | 'cash')}
                            disabled={method.disabled}
                          >
                            <View style={styles.methodContent}>
                              <View style={styles.methodLeft}>
                                <View style={[
                                  styles.radioButton,
                                  paymentMethod === method.id && styles.radioButtonSelected
                                ]}>
                                  {paymentMethod === method.id && (
                                    <View style={styles.radioButtonInner} />
                                  )}
                                </View>
                                
                                <View style={styles.methodIcon}>
                                  <Ionicons 
                                    name={method.icon} 
                                    size={28} 
                                    color={paymentMethod === method.id ? COLORS.primary : COLORS.text.secondary} 
                                  />
                                </View>
                                
                                <View style={styles.methodInfo}>
                                  <View style={styles.methodTitleContainer}>
                                    <Text style={[
                                      styles.methodTitle,
                                      paymentMethod === method.id && styles.selectedMethodTitle
                                    ]}>
                                      {method.title}
                                    </Text>
                                    {method.recommended && (
                                      <View style={styles.recommendedBadge}>
                                        <Text style={styles.recommendedText}>RECOMMANDÉ</Text>
                                      </View>
                                    )}
                                  </View>
                                  <Text style={styles.methodDescription}>{method.description}</Text>
                                  {method.badge && (
                                    <Text style={styles.methodBadge}>{method.badge}</Text>
                                  )}
                                </View>
                              </View>
                            </View>
                          </Pressable>
                        ))}
                      </View>

                      <Pressable
                        style={styles.splitPaymentButton}
                        onPress={() => setShowSplitModal(true)}
                      >
                        <Ionicons name="people-outline" size={20} color={COLORS.secondary} />
                        <Text style={styles.splitPaymentText}>Diviser la note</Text>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.text.secondary} />
                      </Pressable>
                    </Card>

                    {/* Tip Section */}
                    <Card style={styles.tipCard}>
                      <View style={styles.cardHeader}>
                        <Ionicons name="heart-outline" size={24} color={COLORS.primary} />
                        <Text style={styles.cardTitle}>Pourboire (optionnel)</Text>
                      </View>

                      <View style={styles.tipButtons}>
                        {TIP_PERCENTAGES.map((percent) => (
                          <Pressable
                            key={percent}
                            style={[
                              styles.tipButton,
                              selectedTipPercent === percent && styles.selectedTipButton
                            ]}
                            onPress={() => handleTipPercentage(percent)}
                          >
                            <Text style={[
                              styles.tipButtonText,
                              selectedTipPercent === percent && styles.selectedTipButtonText
                            ]}>
                              {percent}%
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      <View style={styles.customTipContainer}>
                        <Text style={styles.customTipLabel}>Montant libre</Text>
                        <View style={styles.customTipInputContainer}>
                          <TextInput
                            style={styles.customTipInput}
                            value={customTipInput}
                            onChangeText={handleCustomTip}
                            placeholder="0.00"
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            returnKeyType="done"
                          />
                          <Text style={styles.currencySymbol}>€</Text>
                        </View>
                      </View>
                    </Card>

                    {/* Receipt Section */}
                    <Card style={styles.receiptCard}>
                      <View style={styles.cardHeader}>
                        <Ionicons name="mail-outline" size={24} color={COLORS.primary} />
                        <Text style={styles.cardTitle}>Ticket de caisse</Text>
                      </View>

                      <View style={styles.emailInputContainer}>
                        <TextInput
                          style={[
                            styles.emailInput,
                            !customerEmail || isEmail(customerEmail) ? {} : styles.emailInputError
                          ]}
                          value={customerEmail}
                          onChangeText={setCustomerEmail}
                          placeholder="votre@email.com"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>

                      <View style={styles.receiptOption}>
                        <Text style={styles.receiptOptionText}>Recevoir le ticket par email</Text>
                        <Switch
                          value={wantReceipt}
                          onValueChange={setWantReceipt}
                          disabled={!!customerEmail && !isEmail(customerEmail)}
                          trackColor={{ false: COLORS.border.light, true: COLORS.primary }}
                          thumbColor={wantReceipt ? COLORS.surface : COLORS.text.light}
                        />
                      </View>
                    </Card>
                  </>
                )}
              </View>

              {/* Side Column - Total & Payment */}
              <View style={styles.sideColumn}>
                <Card style={styles.totalCard}>
                  <Text style={styles.cardTitle}>Total</Text>
                  
                  <View style={styles.totalDetails}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Sous-total</Text>
                      <Text style={styles.totalValue}>{formatCurrency(order?.total_amount)}</Text>
                    </View>
                    {tipAmount > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>
                          Pourboire {selectedTipPercent ? `(${selectedTipPercent}%)` : ''}
                        </Text>
                        <Text style={styles.totalValue}>{formatCurrency(tipAmount)}</Text>
                      </View>
                    )}
                    <View style={styles.totalDivider} />
                    <View style={styles.finalTotalRow}>
                      <Text style={styles.finalTotalLabel}>Total à payer</Text>
                      <Text style={styles.finalTotalAmount}>{formatCurrency(totalWithTip)}</Text>
                    </View>
                  </View>

                  <Button
                    title={
                      processing
                        ? 'Traitement...'
                        : paymentMethod === 'online'
                        ? `Payer ${formatCurrency(totalWithTip)}`
                        : 'Confirmer la commande'
                    }
                    onPress={paymentMethod === 'online' ? handleOnlinePayment : handleCashPayment}
                    fullWidth
                    style={styles.payButton}
                    disabled={processing || (paymentMethod === 'online' && !STRIPE_PUBLISHABLE_KEY)}
                    loading={processing}
                  />

                  <Text style={styles.securityText}>
                    {paymentMethod === 'online'
                      ? '🔒 Paiement sécurisé par Stripe • ❤️ Soutient le développeur'
                      : '💰 Paiement au restaurant'}
                  </Text>
                </Card>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Modals */}
        <SplitPaymentModal
          visible={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          totalAmount={safeParseFloat(order?.total_amount)}
          tipAmount={tipAmount}
          onConfirm={handleSplitPaymentConfirm}
        />

        <Modal
          visible={showReceiptPreview}
          animationType="slide"
          onRequestClose={() => {
            setShowReceiptPreview(false);
            if (paymentSuccess) router.replace(`/order/${orderId}`);
          }}
        >
          <Receipt
            orderId={orderId as string}
            order={{
              ...(order as any),
              tip_amount: tipAmount,
              customer_email: customerEmail,
              payment_method: paymentMethod,
              payment_date: new Date().toISOString(),
            }}
            showActions
            onClose={() => {
              setShowReceiptPreview(false);
              if (paymentSuccess) router.replace(`/order/${orderId}`);
            }}
            autoSendEmail={wantReceipt}
            customerEmail={customerEmail}
          />
        </Modal>
      </SafeAreaView>
    </StripeProvider>
  );
}

// Create responsive styles function
function createStyles(screenType: 'mobile' | 'tablet' | 'desktop') {
  const isTabletOrLarger = screenType !== 'mobile';
  const isDesktop = screenType === 'desktop';
  
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: isTabletOrLarger ? 24 : 16,
      paddingBottom: 40,
    },
    
    // Layout
    mainLayout: {
      flexDirection: isTabletOrLarger ? 'row' : 'column',
      gap: 24,
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center',
      width: '100%',
    },
    mainColumn: {
      flex: isTabletOrLarger ? 2 : 1,
    },
    sideColumn: {
      flex: 1,
      minWidth: isTabletOrLarger ? 300 : undefined,
    },

    // Loading
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
    },
    loadingText: {
      fontSize: 16,
      color: COLORS.text.secondary,
    },

    // Success
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      gap: 24,
    },
    successIcon: {
      marginBottom: 16,
    },
    successTitle: {
      fontSize: isTabletOrLarger ? 32 : 28,
      fontWeight: 'bold',
      color: COLORS.success,
      textAlign: 'center',
    },
    successMessage: {
      fontSize: isTabletOrLarger ? 18 : 16,
      color: COLORS.text.secondary,
      textAlign: 'center',
      lineHeight: 24,
    },
    successActions: {
      width: '100%',
      gap: 12,
    },

    // Cards
    orderSummaryCard: {
      marginBottom: 24,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 20,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    paymentMethodsCard: {
      marginBottom: 24,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 20,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    tipCard: {
      marginBottom: 24,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 20,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    receiptCard: {
      marginBottom: 24,
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 20,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    totalCard: {
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 20,
      shadowColor: COLORS.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
      position: isTabletOrLarger ? 'sticky' : 'relative',
      top: isTabletOrLarger ? 0 : undefined,
    },

    // Card headers
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: isTabletOrLarger ? 20 : 18,
      fontWeight: 'bold',
      color: COLORS.text.primary,
    },

    // Order summary
    orderInfo: {
      gap: 12,
      marginBottom: 16,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    infoLabel: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },
    infoValue: {
      fontSize: 14,
      fontWeight: '600',
      color: COLORS.text.primary,
    },
    itemsList: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
      gap: 12,
    },
    orderItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    itemInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    itemQuantity: {
      fontSize: 14,
      fontWeight: '600',
      color: COLORS.primary,
      minWidth: 24,
    },
    itemName: {
      fontSize: 14,
      color: COLORS.text.primary,
      flex: 1,
    },
    itemPrice: {
      fontSize: 14,
      fontWeight: '600',
      color: COLORS.text.primary,
    },

    // Payment methods
    paymentMethodsList: {
      gap: 12,
      marginBottom: 16,
    },
    paymentMethodItem: {
      borderWidth: 2,
      borderColor: COLORS.border.light,
      borderRadius: 12,
      padding: 16,
      backgroundColor: COLORS.surface,
    },
    selectedPaymentMethod: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.primary + '08',
    },
    recommendedMethod: {
      borderColor: COLORS.success + '40',
    },
    methodContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    methodLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    radioButton: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: COLORS.border.medium,
      alignItems: 'center',
      justifyContent: 'center',
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
      marginRight: 16,
    },
    methodInfo: {
      flex: 1,
    },
    methodTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      flexWrap: 'wrap',
      gap: 8,
    },
    methodTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.text.primary,
    },
    selectedMethodTitle: {
      color: COLORS.primary,
    },
    recommendedBadge: {
      backgroundColor: COLORS.success,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 12,
    },
    recommendedText: {
      fontSize: 10,
      color: '#fff',
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    methodDescription: {
      fontSize: 14,
      color: COLORS.text.secondary,
      marginBottom: 4,
    },
    methodBadge: {
      fontSize: 12,
      color: COLORS.secondary,
      fontWeight: '500',
    },

    // Split payment button
    splitPaymentButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: COLORS.secondary + '10',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: COLORS.secondary + '30',
    },
    splitPaymentText: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.secondary,
      flex: 1,
      marginLeft: 12,
    },

    // Tip section
    tipButtons: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    tipButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.surface,
    },
    selectedTipButton: {
      backgroundColor: COLORS.secondary + '15',
      borderColor: COLORS.secondary,
    },
    tipButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: COLORS.text.secondary,
    },
    selectedTipButtonText: {
      color: COLORS.secondary,
    },
    customTipContainer: {
      gap: 8,
    },
    customTipLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: COLORS.text.primary,
    },
    customTipInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: 8,
      backgroundColor: COLORS.surface,
    },
    customTipInput: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: COLORS.text.primary,
    },
    currencySymbol: {
      paddingHorizontal: 12,
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.text.secondary,
    },

    // Receipt section
    emailInputContainer: {
      marginBottom: 16,
    },
    emailInput: {
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: COLORS.surface,
      color: COLORS.text.primary,
    },
    emailInputError: {
      borderColor: COLORS.error,
      backgroundColor: COLORS.error + '08',
    },
    receiptOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
    },
    receiptOptionText: {
      fontSize: 16,
      fontWeight: '500',
      color: COLORS.text.primary,
    },

    // Total section
    totalDetails: {
      gap: 12,
      marginBottom: 24,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    totalLabel: {
      fontSize: 14,
      color: COLORS.text.secondary,
    },
    totalValue: {
      fontSize: 14,
      fontWeight: '600',
      color: COLORS.text.primary,
    },
    totalDivider: {
      height: 1,
      backgroundColor: COLORS.border.light,
      marginVertical: 8,
    },
    finalTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 8,
    },
    finalTotalLabel: {
      fontSize: 18,
      fontWeight: 'bold',
      color: COLORS.text.primary,
    },
    finalTotalAmount: {
      fontSize: 20,
      fontWeight: 'bold',
      color: COLORS.secondary,
    },

    // Payment button
    payButton: {
      backgroundColor: COLORS.primary,
      borderRadius: 12,
      paddingVertical: 16,
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: COLORS.primary,
      borderRadius: 12,
      paddingVertical: 16,
      marginBottom: 12,
    },
    securityText: {
      fontSize: 12,
      color: COLORS.text.light,
      textAlign: 'center',
    },
  });
}