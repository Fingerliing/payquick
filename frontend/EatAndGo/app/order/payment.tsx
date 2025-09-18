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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// UI kit
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Receipt } from '@/components/receipt/Receipt';

// Composants de division de paiement
import { SplitPaymentModal } from '@/components/payment/SplitPaymentModal';
import { SplitPaymentStatus } from '@/components/payment/SplitPaymentStatus';

// Services
import { orderService } from '@/services/orderService';
import { paymentService } from '@/services/paymentService';
import { receiptService } from '@/services/receiptService';

// Types et services pour paiement divisé
import { SplitPaymentMode, SplitPaymentPortion, SplitPaymentSession } from '@/types/splitPayment';
import { splitPaymentService } from '@/services/splitPaymentService';

// Contexts
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';

// Design system
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

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

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');

  // États pour division de paiement
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

  const screenType = useScreenType();
  const TIP_PERCENTAGES = [5, 10, 15, 20];

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
        
        // Trouver la portion de l'utilisateur actuel
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

  // Gestion de la division de paiement
  const handleSplitPaymentConfirm = async (
    mode: SplitPaymentMode, 
    portions: Omit<SplitPaymentPortion, 'id' | 'isPaid' | 'paidAt'>[]
  ) => {
    if (mode === 'none') {
      setSplitMode('none');
      setSplitSession(null);
      setShowSplitModal(false);
      return;
    }

    try {
      const session = await splitPaymentService.createSplitSession(
        orderId as string,
        mode as 'equal' | 'custom',
        portions
      );
      
      setSplitSession(session);
      setSplitMode(mode);
      setCurrentUserPortionId(session.portions[0]?.id || '');
      setShowSplitModal(false);
      
      // Mettre à jour le statut de la commande
      await paymentService.updatePaymentStatus(orderId as string, 'partial_paid');
      
      Alert.alert(
        'Division créée',
        `La note a été divisée en ${portions.length} parts. Vous pouvez maintenant effectuer votre paiement.`
      );
    } catch (error) {
      console.error('Error creating split payment:', error);
      Alert.alert('Erreur', 'Impossible de créer la division de paiement');
    }
  };

  const initializePayment = async (amount?: number) => {
    if (paymentMethod !== 'online' || !order) return false;

    try {
      const paymentAmount = amount || totalWithTip;
      const res = await paymentService.createPaymentIntent(orderId as string);
      
      // Si c'est un paiement divisé, il faudrait adapter l'API pour accepter le montant spécifique
      const clientSecret = res?.client_secret;
      
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

  const handleSplitPortionPayment = async (portionId: string) => {
    if (!splitSession || !order) return;
    
    const portion = splitSession.portions.find(p => p.id === portionId);
    if (!portion) return;

    setProcessing(true);
    try {
      if (customerEmail) await AsyncStorage.setItem('customerEmail', customerEmail.trim());

      const initialized = await initializePayment(portion.amount);
      if (!initialized) { 
        setProcessing(false); 
        return; 
      }

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

      // Marquer cette portion comme payée
      await splitPaymentService.payPortion(orderId as string, portionId, 'payment_intent_id');
      
      // Vérifier si tous les paiements sont terminés
      const completion = await splitPaymentService.checkCompletion(orderId as string);
      
      if (completion.isCompleted) {
        // Tous les paiements sont effectués, finaliser la commande
        await splitPaymentService.completePayment(orderId as string);
        await handlePaymentSuccess('online');
      } else {
        // Rafraîchir la session
        await loadSplitSession();
        setProcessing(false);
        
        Alert.alert(
          'Paiement effectué !',
          `Votre part a été payée avec succès. Il reste encore ${formatCurrency(completion.remainingAmount)} à payer par les autres personnes.`
        );
      }
    } catch (error) {
      console.error('Split payment error:', error);
      Alert.alert('Erreur', 'Le paiement de votre part a échoué');
      setProcessing(false);
    }
  };

  const handlePayAllRemaining = async () => {
    if (!splitSession) return;
    
    const unpaidPortions = splitSession.portions.filter(p => !p.isPaid);
    const remainingAmount = unpaidPortions.reduce((sum, p) => sum + p.amount, 0);
    
    Alert.alert(
      'Payer le reste',
      `Voulez-vous payer les ${formatCurrency(remainingAmount)} restants pour finaliser la commande ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Payer',
          onPress: async () => {
            setProcessing(true);
            try {
              // Créer un PaymentIntent pour le montant restant
              const initialized = await initializePayment(remainingAmount);
              if (!initialized) { 
                setProcessing(false); 
                return; 
              }

              const { error } = await presentPaymentSheet();
              if (error) {
                if ((error as any).code !== 'Canceled') {
                  Alert.alert('Erreur de paiement', (error as any).message || 'Paiement refusé');
                }
                setProcessing(false);
                return;
              }

              // Marquer toutes les portions restantes comme payées
              for (const portion of unpaidPortions) {
                await splitPaymentService.payPortion(orderId as string, portion.id, 'payment_intent_id');
              }
              
              // Finaliser la commande
              await splitPaymentService.completePayment(orderId as string);
              await handlePaymentSuccess('online');
            } catch (error) {
              console.error('Pay all remaining error:', error);
              Alert.alert('Erreur', 'Le paiement du montant restant a échoué');
              setProcessing(false);
            }
          }
        }
      ]
    );
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
      await orderService.updateOrderStatus(Number(orderId), method === 'online' ? 'paid' : 'cash_pending');
      await orderService.markAsPaid(Number(orderId), method);

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

  // ==== Styles (responsive via design system)
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    scrollContent: { 
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: getResponsiveValue(SPACING.xl, screenType) + (Platform.OS === 'ios' ? 20 : 30),
    },
    card: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    sectionTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600',
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    orderSummary: { gap: getResponsiveValue(SPACING.sm, screenType) },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    summaryLabel: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: COLORS.text.secondary,
    },
    summaryValue: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: COLORS.text.primary,
    },
    itemsList: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    item: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    itemName: {
      flex: 1,
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      color: COLORS.text.secondary,
    },
    itemPrice: {
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      color: COLORS.text.secondary,
    },
    splitPaymentCard: {
      backgroundColor: COLORS.secondary + '10',
      borderColor: COLORS.secondary + '30',
      borderWidth: 1,
    },
    paymentMethods: { 
      flexDirection: 'row', 
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    paymentMethodButton: {
      flex: 1,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 2,
      borderColor: COLORS.border.light,
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    paymentMethodSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
    paymentMethodLabel: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '500',
      color: COLORS.text.primary,
    },
    splitButton: {
      backgroundColor: COLORS.secondary + '20',
      borderColor: COLORS.secondary,
      borderWidth: 1,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
    tipSection: { gap: getResponsiveValue(SPACING.sm, screenType) },
    tipButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: getResponsiveValue(SPACING.xs, screenType) },
    tipButton: {
      flex: 1,
      minWidth: '22%',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipButtonSelected: { backgroundColor: COLORS.secondary + '20', borderColor: COLORS.secondary },
    tipButtonText: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '500',
      color: COLORS.text.secondary,
    },
    tipButtonTextSelected: { color: COLORS.secondary },
    customTipContainer: { flexDirection: 'row', alignItems: 'center', gap: getResponsiveValue(SPACING.sm, screenType) },
    customTipInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
    },
    receiptSection: { gap: getResponsiveValue(SPACING.sm, screenType) },
    emailInput: {
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      fontSize: getResponsiveValue({ mobile: 16, tablet: 17, desktop: 18 }, screenType),
    },
    receiptOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: getResponsiveValue(SPACING.xs, screenType) },
    receiptOptionText: { fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType), color: COLORS.text.primary },
    totalSection: { paddingTop: getResponsiveValue(SPACING.md, screenType), borderTopWidth: 2, borderTopColor: COLORS.text.primary },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: getResponsiveValue(SPACING.xs, screenType) },
    totalLabel: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: 'bold',
      color: COLORS.text.primary,
    },
    totalAmount: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: 'bold',
      color: COLORS.secondary,
    },
    payButton: { backgroundColor: COLORS.secondary, paddingVertical: getResponsiveValue(SPACING.lg, screenType) },
    payButtonText: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: 'bold',
      color: '#000',
    },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: getResponsiveValue(SPACING.xl, screenType) },
    successIcon: { marginBottom: getResponsiveValue(SPACING.lg, screenType) },
    successTitle: {
      fontSize: getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType),
      fontWeight: 'bold',
      color: COLORS.success,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      textAlign: 'center',
    },
    successMessage: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    helperText: { 
      textAlign: 'center', 
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      color: COLORS.text.secondary, 
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
  });

  const iconSize = getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType);
  const canPayOnline = Boolean(STRIPE_PUBLISHABLE_KEY);
  const emailIsValidOrEmpty = !customerEmail || isEmail(customerEmail);

  // ==== Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Paiement" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 16, color: COLORS.text.secondary }}>Chargement de la commande...</Text>
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

          <Button title="Voir le ticket" onPress={() => setShowReceiptPreview(true)} fullWidth style={{ marginBottom: 12 }} />
          <Button title="Retour à la commande" onPress={() => router.replace(`/order/${orderId}`)} variant="outline" fullWidth />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <SafeAreaView style={styles.container}>
        <Header title="Paiement" leftIcon="arrow-back" onLeftPress={() => router.back()} />

        <ScrollView 
          style={styles.container} 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Résumé de la commande */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Résumé de la commande</Text>
            <View style={styles.orderSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>N° Commande</Text>
                <Text style={styles.summaryValue}>{order?.order_number}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Restaurant</Text>
                <Text style={styles.summaryValue}>{order?.restaurant_name}</Text>
              </View>
              {!!order?.table_number && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Table</Text>
                  <Text style={styles.summaryValue}>{order?.table_number}</Text>
                </View>
              )}

              <View style={styles.itemsList}>
                {order?.items?.map((item, index) => (
                  <View key={`${item.id ?? index}`} style={styles.item}>
                    <Text style={styles.itemName}>{item.quantity}x {item.name}</Text>
                    <Text style={styles.itemPrice}>{formatCurrency(item.total_price)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>

          {/* Affichage de l'état du paiement divisé */}
          {splitSession && splitMode !== 'none' ? (
            <SplitPaymentStatus
              session={splitSession}
              currentUserPortionId={currentUserPortionId}
              onPayPortion={handleSplitPortionPayment}
              onPayAllRemaining={handlePayAllRemaining}
              isProcessing={processing}
            />
          ) : (
            <>
              {/* Méthode de paiement */}
              <Card style={styles.card}>
                <Text style={styles.sectionTitle}>Méthode de paiement</Text>
                <View style={styles.paymentMethods}>
                  <Pressable
                    style={[styles.paymentMethodButton, paymentMethod === 'online' && styles.paymentMethodSelected]}
                    onPress={() => setPaymentMethod('online')}
                  >
                    <Ionicons name="card" size={iconSize} color={paymentMethod === 'online' ? COLORS.primary : COLORS.text.secondary} />
                    <Text style={styles.paymentMethodLabel}>Carte bancaire</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.paymentMethodButton, paymentMethod === 'cash' && styles.paymentMethodSelected]}
                    onPress={() => setPaymentMethod('cash')}
                  >
                    <Ionicons name="cash" size={iconSize} color={paymentMethod === 'cash' ? COLORS.primary : COLORS.text.secondary} />
                    <Text style={styles.paymentMethodLabel}>Espèces</Text>
                  </Pressable>
                </View>
                
                <Button
                  title="Diviser la note"
                  leftIcon="people"
                  onPress={() => setShowSplitModal(true)}
                  variant="outline"
                  style={styles.splitButton}
                  fullWidth
                />
              </Card>

              {/* Pourboire */}
              <Card style={styles.card}>
                <Text style={styles.sectionTitle}>Pourboire (optionnel)</Text>
                <View style={styles.tipSection}>
                  <View style={styles.tipButtons}>
                    {TIP_PERCENTAGES.map((percent) => (
                      <Pressable
                        key={percent}
                        style={[styles.tipButton, selectedTipPercent === percent && styles.tipButtonSelected]}
                        onPress={() => handleTipPercentage(percent)}
                      >
                        <Text style={[styles.tipButtonText, selectedTipPercent === percent && styles.tipButtonTextSelected]}>
                          {percent}%
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={styles.customTipContainer}>
                    <Text style={styles.summaryLabel}>Montant libre :</Text>
                    <TextInput
                      style={styles.customTipInput}
                      value={customTipInput}
                      onChangeText={handleCustomTip}
                      placeholder="0.00"
                      keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                      returnKeyType="done"
                    />
                    <Text style={styles.summaryLabel}>€</Text>
                  </View>
                </View>
              </Card>

              {/* Ticket de caisse */}
              <Card style={styles.card}>
                <Text style={styles.sectionTitle}>Ticket de caisse</Text>
                <View style={styles.receiptSection}>
                  <TextInput
                    style={[styles.emailInput, !emailIsValidOrEmpty && { borderColor: 'tomato' }]}
                    value={customerEmail}
                    onChangeText={setCustomerEmail}
                    placeholder="Votre adresse email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <View style={styles.receiptOption}>
                    <Text style={styles.receiptOptionText}>Recevoir le ticket par email</Text>
                    <Switch
                      value={wantReceipt}
                      onValueChange={(val) => setWantReceipt(val)}
                      disabled={!!customerEmail && !emailIsValidOrEmpty}
                      trackColor={{ false: COLORS.border.light, true: COLORS.primary }}
                      thumbColor={wantReceipt ? COLORS.surface : COLORS.text.light}
                    />
                  </View>
                </View>
              </Card>

              {/* Total */}
              <Card style={styles.card}>
                <View style={styles.totalSection}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Sous-total</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(order?.total_amount)}</Text>
                  </View>
                  {tipAmount > 0 && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Pourboire {selectedTipPercent ? `(${selectedTipPercent}%)` : ''}</Text>
                      <Text style={styles.summaryValue}>{formatCurrency(tipAmount)}</Text>
                    </View>
                  )}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total à payer</Text>
                    <Text style={styles.totalAmount}>{formatCurrency(totalWithTip)}</Text>
                  </View>
                </View>
              </Card>

              {/* Bouton de paiement */}
              <Button
                title={
                  processing
                    ? 'Traitement en cours...'
                    : paymentMethod === 'online'
                    ? `Payer ${formatCurrency(totalWithTip)}`
                    : 'Confirmer la commande'
                }
                onPress={paymentMethod === 'online' ? handleOnlinePayment : handleCashPayment}
                fullWidth
                style={styles.payButton}
                textStyle={styles.payButtonText}
                disabled={processing || (paymentMethod === 'online' && !canPayOnline)}
                loading={processing}
              />

              <Text style={styles.helperText}>
                {paymentMethod === 'online'
                  ? canPayOnline
                    ? 'Paiement sécurisé par Stripe'
                    : "Paiement en ligne indisponible (clé Stripe manquante)"
                  : 'Vous paierez directement au restaurant'}
              </Text>
            </>
          )}
        </ScrollView>

        {/* Modal de division de paiement */}
        <SplitPaymentModal
          visible={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          totalAmount={safeParseFloat(order?.total_amount)}
          tipAmount={tipAmount}
          onConfirm={handleSplitPaymentConfirm}
        />

        {/* Modal Receipt Preview */}
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