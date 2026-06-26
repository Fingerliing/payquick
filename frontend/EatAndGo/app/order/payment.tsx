import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Switch,
  Modal,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types importés
import type { 
  OrderDetail, 
  OrderItem,
} from '@/types/order';
import type { MonetaryAmount } from '@/types/common';

// UI components
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Receipt } from '@/components/receipt/Receipt';
import { Alert, AlertWithAction, useAlert } from '@/components/ui/Alert';

// Split payment components
import { SplitPaymentModal, KnownParticipant } from '@/components/payment/SplitPaymentModal';
import { SplitPaymentStatus } from '@/components/payment/SplitPaymentStatus';
import { ItemSplitSelector } from '@/components/payment/ItemSplitSelector';

// Services
import { orderService } from '@/services/orderService';
import { paymentService } from '@/services/paymentService';
import { receiptService } from '@/services/receiptService';

// Split payment types and services
import {
  SplitPaymentMode,
  SplitPaymentPortion,
  SplitPaymentSession,
  CreatePortionInput,
} from '@/types/splitPayment';
import { splitPaymentService } from '@/services/splitPaymentService';

// Contexts
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';

// Constants
import { STRIPE_PUBLISHABLE_KEY } from '@/constants/config';
import { useAppTheme, type AppColors } from '@/utils/designSystem';

// Stripe refuse les montants < 0,50 € en EUR.
const STRIPE_MIN_AMOUNT_EUR = 0.50;

// ==== Design System — adaptateur theme-aware
// Cet écran avait sa propre palette statique (clair uniquement). On dérive la
// même forme depuis useAppTheme() pour activer le dark mode sans réécrire les
// ~90 références COLORS.x (le paramètre de createStyles garde le nom COLORS).
const makeColors = (c: AppColors, isDark: boolean) => ({
  primary: c.primary,
  secondary: c.secondary,
  success: c.success,
  warning: c.warning,
  error: c.error,
  background: c.background,
  surface: c.surface,
  surfaceSecondary: c.border.light,
  text: {
    primary: c.text.primary,
    secondary: c.text.secondary,
    light: c.text.light,
  },
  border: {
    light: c.border.light,
    medium: c.border.dark,
  },
  shadow: c.shadow.default,
  overlay: c.overlay,
});

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

// ==== Types locaux étendus
interface PaymentOrderDetail extends OrderDetail {
  tip_amount?: MonetaryAmount;
  customer_email?: string | null;
}

type PaymentMethodType = 'online' | 'cash';

interface PaymentMethod {
  id: PaymentMethodType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: string;
  recommended?: boolean;
  disabled?: boolean;
}

interface ConfirmationAlert {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

// ==== Helpers
const safeParseAmount = (value: MonetaryAmount | number | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number' && !isNaN(value)) return value;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? fallback : parsed;
};

const formatCurrency = (value: MonetaryAmount | number | null | undefined): string => {
  const num = safeParseAmount(value);
  return `${num.toFixed(2)} €`;
};

const isValidEmail = (email: string): boolean => {
  return /^(?:[^\s@]+@[^\s@]+\.[^\s@]+)$/i.test(email.trim());
};

// Helper pour obtenir le nom d'un item
const getItemName = (item: OrderItem): string => {
  return item.menu_item_name || '';
};

// Helper pour obtenir le prix unitaire d'un item
const getItemUnitPrice = (item: OrderItem): number => {
  const totalPrice = safeParseAmount(item.total_price);
  return totalPrice / (item.quantity || 1);
};

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { clearCart } = useCart();
  const { user } = useAuth();
  const { session: collabSession, participantId, isHost } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const screenType = useScreenType();
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const COLORS = useMemo(() => makeColors(colors, isDark), [colors, isDark]);

  // Alert hook
  const {
    alertState,
    showAlert,
    hideAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  } = useAlert();

  const [order, setOrder] = useState<PaymentOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('online');

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

  // Confirmation dialog state
  const [confirmationAlert, setConfirmationAlert] = useState<ConfirmationAlert | null>(null);

  // Ref pour stocker le PI ID entre initializePayment et handlePaymentSuccess
  const paymentIntentIdRef = useRef<string | null>(null);

  const TIP_PERCENTAGES = [5, 10, 15, 20];

  // Payment methods configuration
  const paymentMethods: PaymentMethod[] = [
    {
      id: 'online',
      title: t('payment.methods.onlineTitle'),
      description: t('payment.methods.onlineDesc'),
      icon: 'card',
      badge: t('payment.methods.onlineBadge'),
      recommended: true,
      disabled: !STRIPE_PUBLISHABLE_KEY,
    },
    {
      id: 'cash',
      title: t('payment.methods.cashTitle'),
      description: t('payment.methods.cashDesc'),
      icon: 'cash',
      badge: t('payment.methods.cashBadge'),
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
      setOrder(data);
      
      const savedEmail = await AsyncStorage.getItem('customerEmail');
      if (savedEmail && !customerEmail) setCustomerEmail(savedEmail);
    } catch (error) {
      console.error('Error loading order:', error);
      showError(t('payment.toast.loadFailed'), t('common.error'));
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
      const orderAmount = safeParseAmount(order.total_amount);
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
    const orderAmount = safeParseAmount(order?.total_amount);
    const tip = safeParseAmount(tipAmount);
    return Math.round((orderAmount + tip) * 100) / 100;
  }, [order?.total_amount, tipAmount]);

  // Split payment handlers
  const handleSplitPaymentConfirm = async (
    mode: SplitPaymentMode,
    portions: CreatePortionInput[]
  ) => {
    console.log('handleSplitPaymentConfirm called with:', { mode, portions });

    if (!order) {
      showError(t('payment.toast.orderNotFound'), t('common.error'));
      return;
    }

    if (mode === 'none') {
      setShowSplitModal(false);
      setSplitMode('none');
      setSplitSession(null);
      return;
    }

    try {
      setProcessing(true);
      console.log('Creating split session...');

      // Annuler la session existante avant d'en créer une nouvelle.
      // Le backend supprime aussi automatiquement les sessions sans portion
      // payée dans CreateSplitPaymentSessionView (belt+suspenders).
      if (splitSession) {
        try {
          await splitPaymentService.cancelSplitSession(orderId as string);
        } catch (e) {
          console.warn('Could not cancel previous split session:', e);
        }
      }

      const session = await splitPaymentService.createSplitSession(
        orderId as string,
        mode,
        portions.map(p => ({
          name: p.name || '',
          amount: p.amount,
          participantId: p.participantId ?? null,
        })),
        tipAmount,
      );

      console.log('Split session created:', session);

      setSplitSession(session);
      setSplitMode(mode);

      const myPortion = session.portions.find(
        (p: any) => p.participant_id === participantId
      );
      if (myPortion) {
        setCurrentUserPortionId(myPortion.id);
      } else {
        const firstUnpaid = session.portions.find((p: any) => !p.isPaid);
        if (firstUnpaid) setCurrentUserPortionId(firstUnpaid.id);
      }

      setShowSplitModal(false);

      const successMessage = mode === 'items'
        ? t('payment.split.itemsActivated')
        : t('payment.split.dividedInto', { count: session.portions.length });
      showSuccess(successMessage, t('payment.split.createdTitle'));

      console.log('Split payment setup completed successfully');

    } catch (error) {
      console.error('Error creating split payment session:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : t('payment.split.createError');
      showError(errorMessage, t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  // ── Claim / Unclaim (mode `items`) ─────────────────────────────────────

  const handleClaim = async (portionId: string, orderItemId: number) => {
    setProcessing(true);
    try {
      const updated = await splitPaymentService.claimItem(
        orderId as string,
        portionId,
        orderItemId,
      );
      setSplitSession(updated);
    } catch (error: any) {
      console.error('Error claiming item:', error);
      showError(error?.message || t('payment.split.claimFailed'), t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  const handleUnclaim = async (portionId: string, orderItemId: number) => {
    setProcessing(true);
    try {
      const updated = await splitPaymentService.unclaimItem(
        orderId as string,
        portionId,
        orderItemId,
      );
      setSplitSession(updated);
    } catch (error: any) {
      console.error('Error unclaiming item:', error);
      showError(error?.message || t('payment.split.unclaimFailed'), t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  // ── Détermination du statut "hôte" effectif ───────────────────────────
  // useSession().isHost ne fonctionne que si l'utilisateur a transité par
  // le SessionContext. Sur cet écran (atterri directement via /order/payment),
  // il est souvent à false même pour le vrai hôte. Fallback : l'utilisateur
  // qui a CRÉÉ la commande (order.user) est de facto l'hôte.
  const effectiveIsHost = useMemo(() => {
    if (isHost) return true;
    if (user?.id && order?.user && Number(order.user) === Number(user.id)) {
      return true;
    }
    return false;
  }, [isHost, user?.id, order?.user]);

  // Liste des participants connus — utilisée pour pré-remplir les portions
  // en mode `items` (une part par participant). Trois sources possibles,
  // dans l'ordre de priorité :
  //   1. session collaborative chargée via useSession() (cas nominal)
  //   2. portions de la session de split existante (fallback : si on a déjà
  //      un split en cours, ses portions sont liées aux SessionParticipant)
  //   3. rien (mode items indisponible)
  const knownParticipants: KnownParticipant[] = useMemo(() => {
    const fromCollab = (collabSession?.participants ?? []) as any[];
    if (fromCollab.length > 0) {
      const list = fromCollab
        .filter((p) => p?.status === 'active' || p?.is_host)
        .map((p) => ({
          id: String(p.id),
          name:
            p.display_name
            || p.guest_name
            || p.user?.first_name
            || p.user?.email
            || p.name
            || t('payment.participantFallback'),
        }));
      if (list.length >= 2) return list;
    }

    const fromPortions = (splitSession?.portions ?? [])
      .filter((p: any) => !!p.participant_id)
      .map((p: any) => ({
        id: String(p.participant_id),
        name: p.name || t('payment.participantFallback'),
      }));
    return fromPortions;
  }, [collabSession?.participants, splitSession?.portions]);

  const initializePayment = async () => {
    if (paymentMethod !== 'online' || !order) return false;

    try {
      // Important: s'assurer que le PaymentIntent inclut le pourboire.
      let clientSecret: string | undefined;
      try {
        const res = await (paymentService as any).createPaymentIntent(orderId, {
          tip_amount: tipAmount.toString(),
          total_with_tip: totalWithTip.toString(),
        });
        clientSecret = res?.client_secret;
        paymentIntentIdRef.current = res?.payment_intent_id ?? null;
      } catch (e) {
        // fallback compat: API sans payload additionnel
        const res = await paymentService.createPaymentIntent(orderId as string);
        clientSecret = (res as any)?.client_secret;
        paymentIntentIdRef.current = (res as any)?.payment_intent_id ?? null;
      }

      if (!clientSecret) throw new Error('Client secret manquant');

      const { error } = await initPaymentSheet({
        merchantDisplayName: order.restaurant_name || t('order.fallbackRestaurant'),
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
      showError(t('payment.initFailed'), t('common.error'));
      return false;
    }
  };

  const handleOnlinePayment = async () => {
    if (!order) return;
    if (!STRIPE_PUBLISHABLE_KEY) {
      showError(
        t('payment.stripeKeyMissing'),
        t('payment.stripeKeyMissingTitle')
      );
      return;
    }
    if (wantReceipt && customerEmail && !isValidEmail(customerEmail)) {
      showError(
        t('payment.emailInvalid'),
        t('payment.emailInvalidTitle')
      );
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
          showError((error as any).message || t('payment.declined'), t('payment.declinedTitle'));
        }
        setProcessing(false);
        return;
      }

      await handlePaymentSuccess('online');
    } catch (error) {
      console.error('Payment error:', error);
      showError(t('payment.failed'), t('common.error'));
      setProcessing(false);
    }
  };

  const handleCashPayment = async () => {
    if (!order) return;
    
    setConfirmationAlert({
      visible: true,
      title: t('payment.cashConfirmTitle'),
      message: t('payment.cashConfirmMsg'),
      onConfirm: async () => {
        setConfirmationAlert(null);
        setProcessing(true);
        try {
          await paymentService.updatePaymentStatus(orderId as string, 'cash_pending');
          if (customerEmail) await AsyncStorage.setItem('customerEmail', customerEmail.trim());
          await handlePaymentSuccess('cash');
        } catch (error) {
          console.error('Error confirming cash payment:', error);
          showError(t('payment.cashConfirmFailed'), t('common.error'));
          setProcessing(false);
        }
      },
      onCancel: () => setConfirmationAlert(null),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel')
    });
  };

  const handlePaymentSuccess = async (method: PaymentMethodType) => {
    try {
      // Paiement online : confirmer côté backend avec vérification Stripe du PI.
      // Le webhook Stripe sert de fallback asynchrone.
      if (method === 'online' && paymentIntentIdRef.current) {
        try {
          await paymentService.updatePaymentStatus(
            orderId as string,
            'paid',
            'online',
            paymentIntentIdRef.current
          );
        } catch (e) {
          // Le webhook Stripe fera le travail en fallback
          console.warn('Sync payment confirmation failed, webhook will handle:', e);
        }
      }
      // Paiement cash : déjà mis à jour par handleCashPayment() avant cet appel.
      if (wantReceipt && customerEmail && isValidEmail(customerEmail)) {
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

      // Annuler toute session de split orpheline (si l'hôte a payé tout seul)
      try {
        await splitPaymentService.cancelSplitSession(orderId as string);
      } catch (e) {
        // Pas de split session ou déjà annulée → ignore
      }

      const successMessage = method === 'online'
        ? t('payment.successOnlineToast')
        : t('payment.successCash');
      
      const fullMessage = wantReceipt && customerEmail 
        ? `${successMessage}${t('payment.receiptSentSuffix')}`
        : successMessage;

      showSuccess(fullMessage, t('payment.successTitleToast'));

    } catch (error) {
      console.error('Post-payment steps error:', error);
      router.replace(`/order/${orderId}`);
    } finally {
      setProcessing(false);
    }
  };

  const handlePayPortion = async (portionId: string) => {
    if (!order) return;

    // Pré-validation : Stripe refuse les montants < 0,50 €. Sans ce garde,
    // l'appel échoue côté Stripe et le backend renvoie un 500 générique.
    const portion = splitSession?.portions.find((p) => p.id === portionId);
    if (portion && portion.amount < STRIPE_MIN_AMOUNT_EUR) {
      showError(
        t('payment.portionTooLow', { amount: `${portion.amount.toFixed(2)} €` }),
        t('payment.amountTooLowTitle')
      );
      return;
    }

    if (!STRIPE_PUBLISHABLE_KEY) {
      showError(
        t('payment.stripeKeyMissing'),
        t('payment.stripeKeyMissingTitle')
      );
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
        merchantDisplayName: order.restaurant_name || t('order.fallbackRestaurant'),
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
        showError(t('payment.initFailed'), t('common.error'));
        setProcessing(false);
        return;
      }
  
      // Présenter le Payment Sheet
      const { error: paymentError } = await presentPaymentSheet();
      
      if (paymentError) {
        if ((paymentError as any).code === 'Canceled') {
          console.log('Payment canceled by user');
        } else {
          showError((paymentError as any).message || t('payment.declined'), t('payment.declinedTitle'));
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
        // Finaliser la commande (le backend met à jour order.payment_status)
        await splitPaymentService.completePayment(orderId as string);
        
        // Envoyer le reçu si demandé
        if (wantReceipt && customerEmail && isValidEmail(customerEmail)) {
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
        showSuccess(
          t('payment.portionPaidComplete'),
          t('payment.successTitleToast')
        );
      } else {
        showSuccess(
          t('payment.portionPaidRemaining', { count: completionStatus.remainingPortions }),
          t('payment.successTitleToast')
        );
      }
  
    } catch (error) {
      console.error('Error paying portion:', error);
      showError(t('payment.portionFailed'), t('common.error'));
    } finally {
      setProcessing(false);
    }
  };
  
  const handlePayAllRemaining = async () => {
    if (!order || !splitSession) return;
    
    if (!STRIPE_PUBLISHABLE_KEY) {
      showError(
        t('payment.stripeKeyMissing'),
        t('payment.stripeKeyMissingTitle')
      );
      return;
    }
  
    const unpaidPortions = splitSession.portions.filter(p => !p.isPaid);
    if (unpaidPortions.length === 0) {
      showInfo(t('payment.allPaidAlready'), t('payment.infoTitle'));
      return;
    }
  
    const totalRemaining = unpaidPortions.reduce((sum, p) => sum + p.amount, 0);
  
    // Pré-validation : Stripe refuse les montants < 0,50 €.
    if (totalRemaining < STRIPE_MIN_AMOUNT_EUR) {
      showError(
        t('payment.remainingTooLow', { amount: `${totalRemaining.toFixed(2)} €` }),
        t('payment.amountTooLowTitle')
      );
      return;
    }
  
    setConfirmationAlert({
      visible: true,
      title: t('payment.payAllTitle'),
      message: t('payment.payAllMsg', { amount: formatCurrency(totalRemaining), count: unpaidPortions.length }),
      onConfirm: async () => {
        setConfirmationAlert(null);
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
            merchantDisplayName: order.restaurant_name || t('order.fallbackRestaurant'),
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
            showError(t('payment.initFailed'), t('common.error'));
            setProcessing(false);
            return;
          }

          // Présenter le Payment Sheet
          const { error: paymentError } = await presentPaymentSheet();
          
          if (paymentError) {
            if ((paymentError as any).code === 'Canceled') {
              console.log('Payment canceled by user');
            } else {
              showError((paymentError as any).message || t('payment.declined'), t('payment.declinedTitle'));
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

          // Finaliser la commande (le backend met à jour order.payment_status)
          await splitPaymentService.completePayment(orderId as string);
          
          // Recharger la session pour mettre à jour l'état
          await loadSplitSession();

          // Envoyer le reçu si demandé
          if (wantReceipt && customerEmail && isValidEmail(customerEmail)) {
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
          showSuccess(
            t('payment.portionPaidComplete'),
            t('payment.successTitleToast')
          );

        } catch (error) {
          console.error('Error paying remaining portions:', error);
          showError(t('payment.remainingFailed'), t('common.error'));
          setProcessing(false);
        }
      },
      onCancel: () => setConfirmationAlert(null),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel')
    });
  };

  // Create responsive styles
  const styles = useMemo(() => createStyles(COLORS, screenType), [COLORS, screenType]);

  // ==== Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={t('payment.title')} leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t('payment.loadingOrder')}</Text>
        </View>
      </View>
    );
  }

  // ==== Success state
  if (paymentSuccess) {
    return (
      <View style={styles.container}>
        <Header title={t('payment.successHeader')} />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
          </View>
          <Text style={styles.successTitle}>{t('payment.successTitle')}</Text>
          <Text style={styles.successMessage}>
            {paymentMethod === 'online'
              ? t('payment.successOnline')
              : t('payment.successCash')}
            {wantReceipt && customerEmail && t('payment.receiptSentSuffix')}
          </Text>
          <View style={styles.successActions}>
            <Button 
              title={t('payment.viewReceipt')} 
              onPress={() => setShowReceiptPreview(true)} 
              fullWidth 
              style={styles.primaryButton} 
            />
            <Button 
              title={t('payment.backToOrder')} 
              onPress={() => router.replace(`/order/${orderId}`)} 
              variant="outline" 
              fullWidth 
            />
          </View>
        </View>
        
        {/* Receipt Modal */}
        <Modal
          visible={showReceiptPreview}
          animationType="slide"
          onRequestClose={() => {
            setShowReceiptPreview(false);
            router.replace(`/order/${orderId}`);
          }}
        >
        <Receipt
          orderId={orderId as string}
          order={order ? {
            id: order.id,
            order_number: order.order_number || `ORD-${orderId}`,
            order_type: order.order_type,
            table_number: order.table_number,
            items: order.items?.map(item => ({
              name: getItemName(item) || t('payment.itemFallback'),
              price: getItemUnitPrice(item),
              quantity: item.quantity,
              total_price: safeParseAmount(item.total_price),
              customizations: item.customizations || {}
            })) || [],
            total_amount: safeParseAmount(order.total_amount),
            restaurant_name: order.restaurant_name,
            tip_amount: tipAmount,
            customer_email: customerEmail,
            payment_method: paymentMethod,
            payment_date: new Date().toISOString(),
          } : undefined}
          showActions
          onClose={() => {
            setShowReceiptPreview(false);
            router.replace(`/order/${orderId}`);
          }}
          autoSendEmail={false}
          customerEmail={customerEmail}
        />
        </Modal>
      </View>
    );
  }

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <View style={styles.container}>
        <Header title={t('payment.title')} leftIcon="arrow-back" onLeftPress={() => router.back()} />

        {/* Alert Display */}
        {alertState && (
          <View style={styles.alertContainer}>
            <Alert
              variant={alertState.variant}
              title={alertState.title}
              message={alertState.message}
              onDismiss={hideAlert}
            />
          </View>
        )}

        {/* Confirmation Dialog */}
        {confirmationAlert && (
          <Modal
            visible={confirmationAlert.visible}
            transparent
            animationType="fade"
            onRequestClose={confirmationAlert.onCancel}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.confirmationDialog}>
                <AlertWithAction
                  variant="warning"
                  title={confirmationAlert.title}
                  message={confirmationAlert.message}
                  showIcon={true}
                  primaryButton={{
                    text: confirmationAlert.confirmText || t('common.confirm'),
                    onPress: confirmationAlert.onConfirm,
                    variant: 'primary'
                  }}
                  secondaryButton={{
                    text: confirmationAlert.cancelText || t('common.cancel'),
                    onPress: confirmationAlert.onCancel
                  }}
                />
              </View>
            </View>
          </Modal>
        )}

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
                    <Text style={styles.cardTitle}>{t('payment.summaryTitle')}</Text>
                  </View>
                  
                  <View style={styles.orderInfo}>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('payment.orderNumber')}</Text>
                      <Text style={styles.infoValue}>{order?.order_number}</Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('payment.restaurant')}</Text>
                      <Text style={styles.infoValue}>{order?.restaurant_name}</Text>
                    </View>
                    {!!order?.table_number && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>{t('payment.table')}</Text>
                        <Text style={styles.infoValue}>{order?.table_number}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.itemsList}>
                    {order?.items?.map((item, index) => (
                      <View key={`${item.id ?? index}`} style={styles.orderItem}>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemQuantity}>{item.quantity}×</Text>
                          <Text style={styles.itemName}>{getItemName(item) || t('payment.itemFallback')}</Text>
                        </View>
                        <Text style={styles.itemPrice}>{formatCurrency(item.total_price)}</Text>
                      </View>
                    ))}
                  </View>
                </Card>

                {/* Payment Methods */}
                {splitSession && splitMode !== 'none' ? (
                  <>
                    {/* Bouton "Modifier la division" — affiché tant qu'aucune
                        portion n'a été payée. L'autorisation effective est
                        vérifiée côté backend (owner de la commande uniquement). */}
                    {!splitSession.portions.some((p: any) => p.isPaid) && (
                      <Pressable
                        style={styles.splitPaymentButton}
                        onPress={() => {
                          console.log('[Modifier division]',
                            'isHost=', isHost,
                            'effectiveIsHost=', effectiveIsHost,
                            'participantId=', participantId,
                            'order.user=', order?.user,
                            'user.id=', user?.id,
                            'knownParticipants=', knownParticipants);
                          setShowSplitModal(true);
                        }}
                      >
                        <Ionicons name="create-outline" size={20} color={COLORS.secondary} />
                        <Text style={styles.splitPaymentText}>{t('payment.editSplit')}</Text>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.text.secondary} />
                      </Pressable>
                    )}

                    {splitSession.splitType === 'items' && order ? (
                      <ItemSplitSelector
                        order={order}
                        session={splitSession}
                        currentUserPortionId={currentUserPortionId}
                        isHost={effectiveIsHost}
                        isProcessing={processing}
                        onClaim={handleClaim}
                        onUnclaim={handleUnclaim}
                        onPayPortion={handlePayPortion}
                        onPayAllRemaining={handlePayAllRemaining}
                      />
                    ) : (
                      <SplitPaymentStatus
                        session={splitSession}
                        currentUserPortionId={currentUserPortionId}
                        onPayPortion={handlePayPortion}
                        onPayAllRemaining={handlePayAllRemaining}
                        isProcessing={processing}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Card style={styles.paymentMethodsCard}>
                      <View style={styles.cardHeader}>
                        <Ionicons name="wallet-outline" size={24} color={COLORS.primary} />
                        <Text style={styles.cardTitle}>{t('payment.method')}</Text>
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
                            onPress={() => !method.disabled && setPaymentMethod(method.id)}
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
                                        <Text style={styles.recommendedText}>{t('payment.recommended')}</Text>
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
                        <Text style={styles.splitPaymentText}>{t('payment.splitBill')}</Text>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.text.secondary} />
                      </Pressable>
                    </Card>

                    {/* Tip Section */}
                    <Card style={styles.tipCard}>
                      <View style={styles.cardHeader}>
                        <Ionicons name="heart-outline" size={24} color={COLORS.primary} />
                        <Text style={styles.cardTitle}>{t('payment.tipTitle')}</Text>
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
                        <Text style={styles.customTipLabel}>{t('payment.tipCustomLabel')}</Text>
                        <View style={styles.customTipInputContainer}>
                          <TextInput
                            style={styles.customTipInput}
                            value={customTipInput}
                            onChangeText={handleCustomTip}
                            placeholder="0.00"
                            placeholderTextColor={COLORS.text.light}
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
                        <Text style={styles.cardTitle}>{t('payment.receiptTitle')}</Text>
                      </View>

                      <View style={styles.emailInputContainer}>
                        <TextInput
                          style={[
                            styles.emailInput,
                            !customerEmail || isValidEmail(customerEmail) ? {} : styles.emailInputError
                          ]}
                          value={customerEmail}
                          onChangeText={setCustomerEmail}
                          placeholder="votre@email.com"
                          placeholderTextColor={COLORS.text.light}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>

                      <View style={styles.receiptOption}>
                        <Text style={styles.receiptOptionText}>{t('payment.receiptOption')}</Text>
                        <Switch
                          value={wantReceipt}
                          onValueChange={setWantReceipt}
                          disabled={!!customerEmail && !isValidEmail(customerEmail)}
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
                  <Text style={styles.cardTitle}>{t('payment.total')}</Text>
                  
                  <View style={styles.totalDetails}>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{t('payment.subtotal')}</Text>
                      <Text style={styles.totalValue}>{formatCurrency(order?.total_amount)}</Text>
                    </View>
                    {tipAmount > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>
                          {t('payment.tipLabel')} {selectedTipPercent ? `(${selectedTipPercent}%)` : ''}
                        </Text>
                        <Text style={styles.totalValue}>{formatCurrency(tipAmount)}</Text>
                      </View>
                    )}
                    <View style={styles.totalDivider} />
                    <View style={styles.finalTotalRow}>
                      <Text style={styles.finalTotalLabel}>{t('payment.totalDue')}</Text>
                      <Text style={styles.finalTotalAmount}>{formatCurrency(totalWithTip)}</Text>
                    </View>
                  </View>

                  <Button
                    title={
                      processing
                        ? t('payment.processingBtn')
                        : paymentMethod === 'online'
                        ? t('payment.payAmount', { amount: formatCurrency(totalWithTip) })
                        : t('payment.confirmOrder')
                    }
                    onPress={paymentMethod === 'online' ? handleOnlinePayment : handleCashPayment}
                    fullWidth
                    style={styles.payButton}
                    disabled={processing || (paymentMethod === 'online' && !STRIPE_PUBLISHABLE_KEY)}
                    loading={processing}
                  />

                  <Text style={styles.securityText}>
                    {paymentMethod === 'online'
                      ? t('payment.securityOnline')
                      : t('payment.securityCash')}
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
          totalAmount={safeParseAmount(order?.total_amount)}
          tipAmount={tipAmount}
          onConfirm={handleSplitPaymentConfirm}
          knownParticipants={knownParticipants}
        />
      </View>
    </StripeProvider>
  );
}

// Create responsive styles function
function createStyles(COLORS: ReturnType<typeof makeColors>, screenType: 'mobile' | 'tablet' | 'desktop') {
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
    
    // Alert Container
    alertContainer: {
      paddingHorizontal: isTabletOrLarger ? 24 : 16,
      paddingTop: 8,
      zIndex: 1000,
    },

    // Confirmation Dialog
    modalOverlay: {
      flex: 1,
      backgroundColor: COLORS.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    confirmationDialog: {
      backgroundColor: COLORS.surface,
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 400,
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
      position: isTabletOrLarger ? 'absolute' : 'relative',
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