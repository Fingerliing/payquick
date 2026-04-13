import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import { SplitPaymentModal } from '@/components/payment/SplitPaymentModal';
import { SplitPaymentSession, SplitPaymentMode, SplitPaymentPortion } from '@/types/splitPayment';
import { splitPaymentService } from '@/services/splitPaymentService';

// Services
import { orderService } from '@/services/orderService';
import { receiptService } from '@/services/receiptService';

// Contexts
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';

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

const getItemName = (item: OrderItem): string => item.menu_item_name || 'Article sans nom';

export default function SplitPaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { clearCart } = useCart();
  const { user } = useAuth();
  const { session, participantId, isHost } = useSession();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const screenType = useScreenType();

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
      showError("Impossible de charger la commande", "Erreur");
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

  // Polling pour rafraîchir le statut du split (toutes les 10s)
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        if (!paymentSuccess) loadSplitSession();
      }, 10000);
      return () => clearInterval(interval);
    }, [loadSplitSession, paymentSuccess])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadOrder(), loadSplitSession()]);
    setRefreshing(false);
  };

  // ── Configure split ────────────────────────────────────────────────────

  const handleSplitConfirm = async (
    mode: SplitPaymentMode,
    portions: Omit<SplitPaymentPortion, 'id' | 'isPaid' | 'paidAt'>[]
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

      const sess = await splitPaymentService.createSplitSession(
        orderId as string,
        mode,
        portions.map((p) => ({
          name: p.name,
          amount: safeParseAmount(p.amount),
        }))
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

      showSuccess(
        mode === 'equal'
          ? `Note divisée équitablement entre ${portions.length} personnes`
          : `Note divisée en ${portions.length} parts personnalisées`,
        'Division configurée'
      );
    } catch (error) {
      console.error('Error creating split session:', error);
      showError('Impossible de créer la division de la note', 'Erreur');
    } finally {
      setProcessing(false);
    }
  };

  // ── Pay portion ────────────────────────────────────────────────────────

  const handlePayPortion = async (portionId: string) => {
    if (!order) return;

    if (!STRIPE_PUBLISHABLE_KEY) {
      showError(
        "La clé publique Stripe n'est pas configurée.",
        'Configuration Stripe manquante'
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
          shapes: { borderRadius: 12, borderWidth: 1 },
        },
      });

      if (initError) {
        showError("Impossible d'initialiser le paiement", "Erreur");
        setProcessing(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        if ((paymentError as any).code === 'Canceled') {
          console.log('Payment canceled by user');
        } else {
          showError(
            (paymentError as any).message || 'Paiement refusé',
            'Erreur de paiement'
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
          'Tous les paiements ont été effectués. La commande est maintenant complète.',
          'Paiement réussi !'
        );
      } else {
        showSuccess(
          `Votre part a été payée avec succès. Il reste ${completionStatus.remainingPortions} portion(s) à payer.`,
          'Paiement réussi !'
        );
      }
    } catch (error) {
      console.error('Error paying portion:', error);
      showError('Le paiement de cette portion a échoué', 'Erreur');
    } finally {
      setProcessing(false);
    }
  };

  // ── Pay all remaining ──────────────────────────────────────────────────

  const handlePayAllRemaining = async () => {
    if (!order || !splitSession) return;

    if (!STRIPE_PUBLISHABLE_KEY) {
      showError(
        "La clé publique Stripe n'est pas configurée.",
        'Configuration Stripe manquante'
      );
      return;
    }

    const unpaidPortions = splitSession.portions.filter((p: any) => !p.isPaid);
    if (unpaidPortions.length === 0) {
      showInfo('Toutes les portions sont déjà payées', 'Information');
      return;
    }

    setProcessing(true);
    try {
      const paymentData = await splitPaymentService.createRemainingPaymentIntent(
        orderId as string
      );

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
          shapes: { borderRadius: 12, borderWidth: 1 },
        },
      });

      if (initError) {
        showError("Impossible d'initialiser le paiement", "Erreur");
        setProcessing(false);
        return;
      }

      const { error: paymentError } = await presentPaymentSheet();

      if (paymentError) {
        if ((paymentError as any).code === 'Canceled') {
          console.log('Payment canceled by user');
        } else {
          showError(
            (paymentError as any).message || 'Paiement refusé',
            'Erreur de paiement'
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
      showError('Le paiement des portions restantes a échoué', 'Erreur');
    } finally {
      setProcessing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const styles = createStyles(screenType);

  // Montants pour le modal
  const orderTotal = safeParseAmount(order?.total_amount);
  const tipAmount = safeParseAmount((order as any)?.tip_amount);

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Division de la note" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  if (paymentSuccess) {
    return (
      <View style={styles.container}>
        <Header title="Paiement réussi" />
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
          </View>
          <Text style={styles.successTitle}>Paiement confirmé !</Text>
          <Text style={styles.successMessage}>
            Votre part a été payée avec succès.
          </Text>
          <View style={styles.successActions}>
            <Button
              title="Retour à la commande"
              onPress={() => router.replace(`/order/${orderId}`)}
              fullWidth
              style={styles.primaryButton}
            />
            {session?.id && (
              <Button
                title="Retour à la session"
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
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <View style={styles.container}>
        <Header
          title="Division de la note"
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
              <Text style={styles.cardTitle}>Commande groupée</Text>
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
                  <Text style={styles.infoValue}>{order.table_number}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Total</Text>
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
                    <Text style={styles.itemName}>{getItemName(item)}</Text>
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
                  {isHost ? 'Vous êtes l\'hôte' : 'Division de la note en cours'}
                </Text>
                <Text style={styles.bannerSubtitle}>
                  {splitSession
                    ? `${splitSession.portions.length} participant(s) • ${
                        splitSession.portions.filter((p: any) => p.isPaid).length
                      } payé(s)`
                    : 'Chargement des portions...'}
                </Text>
              </View>


            </View>
          </Card>

          {/* Split Payment Status — coeur de la page */}
          {splitSession ? (
            <SplitPaymentStatus
              session={splitSession}
              currentUserPortionId={currentUserPortionId}
              onPayPortion={handlePayPortion}
              onPayAllRemaining={handlePayAllRemaining}
              onEditSplit={isHost && !hasAnyPaidPortion ? () => setShowSplitModal(true) : undefined}
              isProcessing={processing}
            />
          ) : (
            <Card style={styles.card}>
              <View style={styles.emptyState}>
                <Ionicons name="options-outline" size={40} color={COLORS.primary} />
                <Text style={styles.emptyText}>
                  Configurez la division de la note
                </Text>
                <Text style={styles.emptySubtext}>
                  {isHost
                    ? 'Choisissez comment répartir le paiement entre les participants.'
                    : 'L\'hôte est en train de configurer la division de la note.'}
                </Text>
                {isHost && (
                  <Button
                    title="Diviser la note"
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
        />
      </View>
    </StripeProvider>
  );
}

// ==== Styles
function createStyles(screenType: 'mobile' | 'tablet' | 'desktop') {
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