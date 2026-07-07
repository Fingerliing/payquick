import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppTheme, type AppColors } from '@/utils/designSystem';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
import type { OrderDetail, OrderItem } from '@/types/order';
import type { MonetaryAmount } from '@/types/common';

// UI
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert, useAlert } from '@/components/ui/Alert';

// Split payment
import { SplitPaymentStatus } from '@/components/payment/SplitPaymentStatus';
import { SplitPaymentModal, KnownParticipant } from '@/components/payment/SplitPaymentModal';
import { ItemSplitSelector } from '@/components/payment/ItemSplitSelector';
import {
  SplitPaymentSession,
  SplitPaymentMode,
  CreatePortionInput,
} from '@/types/splitPayment';
import { splitPaymentService } from '@/services/splitPaymentService';

// Services
import { orderService } from '@/services/orderService';
import { receiptService } from '@/services/receiptService';

// Contexts
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';

// Constants
import { STRIPE_PUBLISHABLE_KEY } from '@/constants/config';

// Stripe refuse les montants < 0,50 € en EUR.
const STRIPE_MIN_AMOUNT_EUR = 0.50;

// ==== Design System
const makeColors = (c: AppColors, isDark: boolean) => ({
  primary: c.primary,
  secondary: c.secondary,
  success: c.success,
  warning: c.warning,
  error: c.error,
  background: c.background,
  surface: c.surface,
  surfaceSecondary: c.border.light,
  text: { primary: c.text.primary, secondary: c.text.secondary, light: c.text.light },
  border: { light: c.border.light, medium: c.border.dark },
  shadow: c.shadow.default,
  overlay: c.overlay,
});

const BREAKPOINTS = { mobile: 0, tablet: 768, desktop: 1024 };

const useScreenType = () => {
  const { width } = useWindowDimensions();
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
};

// ==== Helpers
const safeParseAmount = (value: MonetaryAmount | number | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number' && !isNaN(value)) return value;
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? fallback : parsed;
};

const formatCurrency = (value: MonetaryAmount | number | null | undefined): string => {
  return `${safeParseAmount(value).toFixed(2)} €`;
};

const isValidEmail = (email: string): boolean => {
  return /^(?:[^\s@]+@[^\s@]+\.[^\s@]+)$/i.test(email.trim());
};

const getItemName = (item: OrderItem): string => item.menu_item_name || '';

export default function SplitPaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { clearCart } = useCart();
  const { user } = useAuth();
  const { session, participantId, isHost } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const COLORS = useMemo(() => makeColors(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();

  const {
    alertState, showAlert, hideAlert,
    showSuccess, showError, showWarning, showInfo,
  } = useAlert();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [splitSession, setSplitSession] = useState<SplitPaymentSession | null>(null);
  const [currentUserPortionId, setCurrentUserPortionId] = useState<string>('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [showSplitModal, setShowSplitModal] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────

  const loadOrder = useCallback(async () => {
    try {
      const data = await orderService.getOrderById(Number(orderId));
      setOrder(data);
    } catch (error) {
      console.error('Error loading order:', error);
      showError(t('payment.toast.loadFailed'), t('common.error'));
    }
  }, [orderId]);

  const loadSplitSession = useCallback(async () => {
    try {
      const sess = await splitPaymentService.getSplitSession(orderId as string);
      if (sess) {
        setSplitSession(sess);

        const myPortion = sess.portions.find(
          (p: any) => p.participant_id === participantId
        );
        if (myPortion) {
          setCurrentUserPortionId(myPortion.id);
        } else {
          const firstUnpaid = sess.portions.find((p: any) => !p.isPaid);
          if (firstUnpaid) setCurrentUserPortionId(firstUnpaid.id);
        }
      }
    } catch (error) {
      console.warn('No split session found:', error);
    }
  }, [orderId, participantId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadOrder(), loadSplitSession()]);
      const savedEmail = await AsyncStorage.getItem('customerEmail');
      if (savedEmail && !customerEmail) setCustomerEmail(savedEmail);
      setLoading(false);
    };
    init();
  }, [orderId]);

  // Polling pour rafraîchir le statut du split (toutes les 12s) — fallback
  // si le WebSocket ne fonctionne pas. La source de vérité primaire est
  // l'événement `split_payment_updated` (cf. SessionContext + ws message handlers).
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        if (!paymentSuccess) loadSplitSession();
      }, 12000);
      return () => clearInterval(interval);
    }, [loadSplitSession, paymentSuccess])
  );

  // Liste des participants connus de la session collaborative — utilisée
  // pour pré-remplir les portions en mode `items` (une part par participant).
  const knownParticipants: KnownParticipant[] = useMemo(() => {
    const rawParticipants = (session?.participants ?? []) as any[];
    return rawParticipants
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
  }, [session?.participants]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOrder(), loadSplitSession()]);
    setRefreshing(false);
  };

  // ── Configure split ────────────────────────────────────────────────────

  const handleSplitConfirm = async (
    mode: SplitPaymentMode,
    portions: CreatePortionInput[]
  ) => {
    setShowSplitModal(false);

    if (mode === 'none') {
      // Paiement unique — pas de split, retour au checkout classique
      router.replace(`/checkout?orderId=${orderId}`);
      return;
    }

    setProcessing(true);
    try {
      // Si une session existe déjà, l'annuler avant d'en créer une nouvelle
      if (splitSession) {
        await splitPaymentService.cancelSplitSession(orderId as string);
      }

      const orderTotal = safeParseAmount(order?.total_amount);
      const tipAmount = safeParseAmount((order as any)?.tip_amount);

      const sess = await splitPaymentService.createSplitSession(
        orderId as string,
        mode,
        portions.map((p) => ({
          name: p.name,
          amount: safeParseAmount(p.amount),
          participantId: p.participantId ?? null,
        })),
        tipAmount,
      );

      setSplitSession(sess);

      // Trouver la portion du participant courant
      const myPortion = sess.portions.find(
        (p: any) => p.participant_id === participantId
      );
      if (myPortion) {
        setCurrentUserPortionId(myPortion.id);
      } else {
        const firstUnpaid = sess.portions.find((p: any) => !p.isPaid);
        if (firstUnpaid) setCurrentUserPortionId(firstUnpaid.id);
      }

      const modeLabel = mode === 'equal'
        ? t('splitPayment.modeEqual', { count: portions.length })
        : mode === 'custom'
          ? t('splitPayment.modeCustom', { count: portions.length })
          : t('splitPayment.modeItems', { count: portions.length });
      showSuccess(modeLabel, t('splitPayment.configuredTitle'));
    } catch (error) {
      console.error('Error creating split session:', error);
      showError(t('splitPayment.createFailed'), t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  // ── Claim / Unclaim (mode `items`) ─────────────────────────────────────

  const handleClaim = useCallback(async (portionId: string, orderItemId: number) => {
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
  }, [orderId]);

  const handleUnclaim = useCallback(async (portionId: string, orderItemId: number) => {
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
  }, [orderId]);

  // ── Pay portion ────────────────────────────────────────────────────────

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
      const paymentData = await splitPaymentService.createPortionPaymentIntent(
        orderId as string,
        portionId
      );

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: order.restaurant_name || t('order.fallbackRestaurant'),
        paymentIntentClientSecret: paymentData.client_secret,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { email: customerEmail || undefined },
        applePay: { merchantCountryCode: 'FR' },
        googlePay: { merchantCountryCode: 'FR', testEnv: false },
        appearance: {
          colors: {
            primary: COLORS.primary,
            background: COLORS.surface,
            componentBackground: COLORS.background,
            primaryText: COLORS.text.primary,
          },
          shapes: { borderRadius: 12, borderWidth: 1 },
        },
      });

      if (initError) {
        showError(t('payment.initFailed'), t('common.error'));
        setProcessing(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        if ((paymentError as any).code === 'Canceled') {
          console.log('Payment canceled by user');
        } else {
          showError(
            (paymentError as any).message || t('payment.declined'),
            t('payment.declinedTitle')
          );
        }
        setProcessing(false);
        return;
      }

      await splitPaymentService.confirmPortionPayment(
        orderId as string,
        portionId,
        paymentData.payment_intent_id
      );

      await loadSplitSession();

      const completionStatus = await splitPaymentService.checkCompletion(orderId as string);

      if (completionStatus.isCompleted) {
        await splitPaymentService.completePayment(orderId as string);

        if (customerEmail && isValidEmail(customerEmail)) {
          try {
            await receiptService.sendReceiptByEmail({
              order_id: Number(orderId),
              email: customerEmail.trim(),
              format: 'pdf',
              language: 'fr',
            } as any);
          } catch (e) {
            console.warn('Receipt email failed:', e);
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

  // ── Pay all remaining ──────────────────────────────────────────────────

  const handlePayAllRemaining = async () => {
    if (!order || !splitSession) return;

    if (!STRIPE_PUBLISHABLE_KEY) {
      showError(
        t('payment.stripeKeyMissing'),
        t('payment.stripeKeyMissingTitle')
      );
      return;
    }

    const unpaidPortions = splitSession.portions.filter((p: any) => !p.isPaid);
    if (unpaidPortions.length === 0) {
      showInfo(t('payment.allPaidAlready'), t('payment.infoTitle'));
      return;
    }

    // Pré-validation : Stripe refuse les montants < 0,50 €.
    const remainingTotal = unpaidPortions.reduce((sum, p) => sum + p.amount, 0);
    if (remainingTotal < STRIPE_MIN_AMOUNT_EUR) {
      showError(
        t('payment.remainingTooLow', { amount: `${remainingTotal.toFixed(2)} €` }),
        t('payment.amountTooLowTitle')
      );
      return;
    }

    setProcessing(true);
    try {
      const paymentData = await splitPaymentService.createRemainingPaymentIntent(
        orderId as string
      );

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: order.restaurant_name || t('order.fallbackRestaurant'),
        paymentIntentClientSecret: paymentData.client_secret,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { email: customerEmail || undefined },
        applePay: { merchantCountryCode: 'FR' },
        googlePay: { merchantCountryCode: 'FR', testEnv: false },
        appearance: {
          colors: {
            primary: COLORS.primary,
            background: COLORS.surface,
            componentBackground: COLORS.background,
            primaryText: COLORS.text.primary,
          },
          shapes: { borderRadius: 12, borderWidth: 1 },
        },
      });

      if (initError) {
        showError(t('payment.initFailed'), t('common.error'));
        setProcessing(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        if ((paymentError as any).code === 'Canceled') {
          console.log('Payment canceled by user');
        } else {
          showError(
            (paymentError as any).message || t('payment.declined'),
            t('payment.declinedTitle')
          );
        }
        setProcessing(false);
        return;
      }

      await splitPaymentService.confirmRemainingPayments(
        orderId as string,
        paymentData.payment_intent_id
      );

      await splitPaymentService.completePayment(orderId as string);
      await loadSplitSession();

      if (customerEmail && isValidEmail(customerEmail)) {
        try {
          await receiptService.sendReceiptByEmail({
            order_id: Number(orderId),
            email: customerEmail.trim(),
            format: 'pdf',
            language: 'fr',
          } as any);
        } catch (e) {
          console.warn('Receipt email failed:', e);
        }
      }

      clearCart();
      setPaymentSuccess(true);
      showSuccess(
        'Tous les paiements ont été effectués. La commande est maintenant complète.',
        'Paiement réussi !'
      );
    } catch (error) {
      console.error('Error paying remaining:', error);
      showError(t('payment.remainingFailed'), t('common.error'));
    } finally {
      setProcessing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const styles = useMemo(() => createStyles(COLORS, screenType), [COLORS, screenType]);

  // Montants pour le modal
  const orderTotal = safeParseAmount(order?.total_amount);
  const tipAmount = safeParseAmount((order as any)?.tip_amount);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title={t('splitPayment.headerTitle')} leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </View>
    );
  }

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
            {t('splitPayment.yourPartPaid')}
          </Text>
          <View style={styles.successActions}>
            <Button
              title={t('payment.backToOrder')}
              onPress={() => router.replace(`/order/${orderId}`)}
              fullWidth
              style={styles.primaryButton}
            />
            {session?.id && (
              <Button
                title={t('splitPayment.backToSession')}
                onPress={() => router.replace('/session' as any)}
                variant="outline"
                fullWidth
              />
            )}
          </View>
        </View>
      </View>
    );
  }

  // Déterminer si aucune portion n'a encore été payée (permet de reconfigurer)
  const hasAnyPaidPortion = splitSession
    ? splitSession.portions.some((p: any) => p.isPaid)
    : false;

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier="merchant.fr.fingerliing.EatQuickeR"
    >
      <View style={styles.container}>
        <Header
          title={t('splitPayment.headerTitle')}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />

        {/* Alert */}
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

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Order Summary */}
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="receipt-outline" size={24} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t('splitPayment.groupOrder')}</Text>
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
                  <Text style={styles.infoValue}>{order.table_number}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('payment.total')}</Text>
                <Text style={[styles.infoValue, { color: COLORS.secondary, fontWeight: '700' }]}>
                  {formatCurrency(order?.total_amount)}
                </Text>
              </View>
            </View>

            {/* Items list */}
            <View style={styles.itemsList}>
              {order?.items?.map((item, index) => (
                <View key={`${item.id ?? index}`} style={styles.orderItem}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemQuantity}>{item.quantity}×</Text>
                    <Text style={styles.itemName}>{getItemName(item) || t('payment.itemFallback')}</Text>
                  </View>
                  <Text style={styles.itemPrice}>
                    {formatCurrency(item.total_price)}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {/* Session info banner */}
          <Card style={[styles.card, styles.sessionBanner]}>
            <View style={styles.bannerContent}>
              <Ionicons name="people" size={20} color={COLORS.primary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.bannerTitle}>
                  {isHost ? t('splitPayment.youAreHost') : t('splitPayment.splitInProgress')}
                </Text>
                <Text style={styles.bannerSubtitle}>
                  {splitSession
                    ? t('splitPayment.participantsPaid', { count: splitSession.portions.length, paid: splitSession.portions.filter((p: any) => p.isPaid).length })
                    : t('splitPayment.loadingPortions')}
                </Text>
              </View>


            </View>
          </Card>

          {/* Split Payment Status — coeur de la page */}
          {splitSession ? (
            splitSession.splitType === 'items' && order ? (
              <ItemSplitSelector
                order={order}
                session={splitSession}
                currentUserPortionId={currentUserPortionId}
                isHost={!!isHost}
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
                onEditSplit={isHost && !hasAnyPaidPortion ? () => setShowSplitModal(true) : undefined}
                isProcessing={processing}
              />
            )
          ) : (
            <Card style={styles.card}>
              <View style={styles.emptyState}>
                <Ionicons name="options-outline" size={40} color={COLORS.primary} />
                <Text style={styles.emptyText}>
                  {t('splitPayment.configurePrompt')}
                </Text>
                <Text style={styles.emptySubtext}>
                  {isHost
                    ? t('splitPayment.hostConfigureHint')
                    : t('splitPayment.guestWaitConfig')}
                </Text>
                {isHost && (
                  <Button
                    title={t('payment.splitBill')}
                    onPress={() => setShowSplitModal(true)}
                    leftIcon={<Ionicons name="cut-outline" size={18} color={COLORS.surface} />}
                    style={{ marginTop: 16, borderRadius: 12 }}
                  />
                )}
              </View>
            </Card>
          )}
        </ScrollView>

        {/* Modal de configuration du split */}
        <SplitPaymentModal
          visible={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          totalAmount={orderTotal}
          tipAmount={tipAmount}
          onConfirm={handleSplitConfirm}
          knownParticipants={knownParticipants}
        />
      </View>
    </StripeProvider>
  );
}

// ==== Styles
function createStyles(COLORS: ReturnType<typeof makeColors>, screenType: 'mobile' | 'tablet' | 'desktop') {
  const isTabletOrLarger = screenType !== 'mobile';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: isTabletOrLarger ? 24 : 16,
      paddingBottom: 40,
    },
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
    alertContainer: {
      paddingHorizontal: isTabletOrLarger ? 24 : 16,
      paddingTop: 8,
      zIndex: 1000,
    },

    // Cards
    card: {
      marginBottom: 16,
      padding: 20,
      borderRadius: 16,
      backgroundColor: COLORS.surface,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: COLORS.text.primary,
    },

    // Order info
    orderInfo: {
      gap: 10,
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
      gap: 10,
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

    // Session banner
    sessionBanner: {
      backgroundColor: COLORS.primary + '08',
      borderWidth: 1,
      borderColor: COLORS.primary + '20',
    },
    bannerContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    bannerTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: COLORS.primary,
    },
    bannerSubtitle: {
      fontSize: 13,
      color: COLORS.text.secondary,
      marginTop: 2,
    },

    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingVertical: 32,
      gap: 12,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '600',
      color: COLORS.text.primary,
      textAlign: 'center',
    },
    emptySubtext: {
      fontSize: 14,
      color: COLORS.text.secondary,
      textAlign: 'center',
    },

    // Success
    successContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    successIcon: {
      marginBottom: 24,
    },
    successTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: COLORS.text.primary,
      marginBottom: 12,
    },
    successMessage: {
      fontSize: 16,
      color: COLORS.text.secondary,
      textAlign: 'center',
      marginBottom: 32,
      lineHeight: 24,
    },
    successActions: {
      width: '100%',
      gap: 12,
    },
    primaryButton: {
      backgroundColor: COLORS.primary,
      borderRadius: 12,
      paddingVertical: 16,
    },
  });
}