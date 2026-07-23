import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
  Animated,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useOrder } from '@/contexts/OrderContext';
import { OrderDetail, OrderItem } from '@/types/order';
import { Header } from '@/components/ui/Header';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Receipt } from '@/components/receipt/Receipt';
import {
  printKitchenTicket,
  kitchenTicketFromOrder,
} from '@/components/receipt/KitchenTicket';
import { groupIdenticalItems } from '@/utils/regroupItems';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import { useAppTheme, type AppColors } from '@/utils/designSystem';

const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
};

/**
 * Tokens propres à cet écran, absents d'AppColors : dorés d'accent, bleu
 * d'information, surfaces et bordures dorées, ombres colorées. Ils sont dérivés
 * du mode plutôt que du thème pour ne pas dépendre de clés dont l'existence
 * n'est pas garantie. Si `designSystem.ts` les expose déjà, le remplacement est
 * mécanique : `accents.X` -> `colors.X`.
 */
const createAccents = (isDark: boolean) => ({
  accent: isDark ? '#D4AF37' : '#B8941F',
  info: isDark ? '#60A5FA' : '#3B82F6',
  goldenSurface: isDark ? '#231D0C' : '#FFFCF0',
  borderGolden: isDark ? '#3D3418' : '#E6D08A',
  borderMedium: isDark ? '#2B3550' : '#CBD5E1',
  shadowGolden: isDark ? 'rgba(212, 175, 55, 0.18)' : 'rgba(212, 175, 55, 0.25)',
  shadowMedium: isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(15, 23, 42, 0.12)',
});

type Accents = ReturnType<typeof createAccents>;

/** `LinearGradient` attend un tuple, pas un `string[]`. */
type GradientTuple = readonly [string, string, ...string[]];

/**
 * Dégradés de l'écran. Les éléments POSÉS dessus (titres, icônes du bandeau)
 * restent en blanc fixe dans les deux modes : le fond reste sombre des deux
 * côtés, c'est la règle appliquée sur le reste de l'app.
 */
const createGradients = (colors: AppColors, isDark: boolean) => ({
  navy: (isDark
    ? ['#070B18', '#0F1528', '#161D33']
    : ['#1E2A78', '#2D3E8F', '#3B4BA3']) as GradientTuple,
  // Cartes : dégradé quasi plat qui suit la surface du thème.
  surface: [colors.surface, colors.background] as GradientTuple,
  golden: (isDark
    ? ['#231D0C', '#1A1608']
    : ['#FFFCF0', '#FFF8E7']) as GradientTuple,
  instructions: (isDark
    ? ['#2A1E10', '#20180C']
    : ['#FFF7ED', '#FEF3C7']) as GradientTuple,
  // Dégradés sémantiques : même teinte dans les deux modes, ils portent du
  // blanc et gardent leur contraste sur fond clair comme sombre.
  gold: ['#D4AF37', '#B8941F'] as GradientTuple,
  success: ['#10B981', '#059669'] as GradientTuple,
  danger: ['#EF4444', '#DC2626'] as GradientTuple,
});

type Gradients = ReturnType<typeof createGradients>;


// Hook pour détecter le type d'écran
const useScreenType = () => {
  const { width } = useWindowDimensions();
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
};

// Animation hook pour les micro-interactions
const useScaleAnimation = (initialValue = 1) => {
  const scaleValue = React.useRef(new Animated.Value(initialValue)).current;

  const scaleIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 300,
      friction: 5,
    }).start();
  };

  const scaleOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 5,
    }).start();
  };

  return { scaleValue, scaleIn, scaleOut };
};

// Composant amélioré pour les items avec animations
const OrderItemCard = React.memo(({ item, index }: { item: OrderItem; index: number }) => {
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const accents = useMemo(() => createAccents(isDark), [isDark]);
  const gradients = useMemo(() => createGradients(colors, isDark), [colors, isDark]);
  const styles = useMemo(
    () => createStyles(colors, accents, screenType),
    [colors, accents, screenType],
  );
  const { scaleValue, scaleIn, scaleOut } = useScaleAnimation();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, index]);

  const hasCustomizations = item.customizations && Object.keys(item.customizations).length > 0;
  const hasInstructions = item.special_instructions;

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ scale: scaleValue }],
      }}
    >
      <Pressable onPressIn={scaleIn} onPressOut={scaleOut} style={styles.itemCard}>
        <LinearGradient colors={gradients.surface} style={styles.itemGradient}>
          {/* En-tête */}
          <View style={styles.itemHeader}>
            <View style={styles.itemTitleContainer}>
              <Text style={styles.itemName}>{item.menu_item_name || t('orderDetail.item.fallbackName', { id: item.menu_item })}</Text>
              {(hasCustomizations || hasInstructions) && (
                <View style={styles.premiumBadge}>
                  <Ionicons name="star" size={12} color={colors.secondary} />
                  <Text style={styles.premiumText}>{t('orderDetail.item.customized')}</Text>
                </View>
              )}
            </View>
            <View style={styles.priceContainer}>
              <Text style={styles.itemPrice}>{item.total_price}€</Text>
            </View>
          </View>

          {/* Détails */}
          <View style={styles.itemDetails}>
            <View style={styles.detailBadge}>
              <Ionicons name="layers-outline" size={14} color={colors.text.secondary} />
              <Text style={styles.itemQuantity}>
                {t('orderDetail.item.quantity', { count: item.quantity })}
              </Text>
            </View>
            <View style={styles.detailBadge}>
              <Ionicons name="card-outline" size={14} color={colors.text.secondary} />
              <Text style={styles.itemUnitPrice}>
                {t('orderDetail.item.unitPrice', { price: item.unit_price })}
              </Text>
            </View>
          </View>

          {/* Instructions */}
          {hasInstructions && (
            <View style={styles.instructionsContainer}>
              <LinearGradient colors={gradients.instructions} style={styles.instructionsGradient}>
                <View style={styles.instructionsHeader}>
                  <Ionicons name="chatbubble-ellipses" size={16} color={colors.warning} />
                  <Text style={styles.instructionsLabel}>{t('orderDetail.item.specialInstructions')}</Text>
                </View>
                <Text style={styles.instructionsText}>{item.special_instructions}</Text>
              </LinearGradient>
            </View>
          )}

          {/* Customisations */}
          {hasCustomizations && (
            <View style={styles.customizationsContainer}>
              <LinearGradient colors={gradients.golden} style={styles.customizationsGradient}>
                <View style={styles.customizationsHeader}>
                  <Ionicons name="options" size={16} color={accents.accent} />
                  <Text style={styles.customizationsLabel}>{t('orderDetail.item.customizations')}</Text>
                </View>
                <View style={styles.customizationsList}>
                  {Object.entries(item.customizations || {}).map(([key, value], idx) => (
                    <View key={idx} style={styles.customizationItem}>
                      <View style={styles.customizationDot} />
                      <Text style={styles.customizationText}>
                        <Text style={styles.customizationKey}>{key}:</Text> {String(value)}
                      </Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
});

// Bouton de suivi gamifié
// const GamifiedTrackingButton = React.memo(({ orderId, orderStatus }: { orderId: number; orderStatus: string }) => {
//   const screenType = useScreenType();
//   const styles = createStyles(screenType);
//   const { scaleValue, scaleIn, scaleOut } = useScaleAnimation();

//   const isActiveOrder = ['pending', 'confirmed', 'preparing', 'ready'].includes(orderStatus);
//   if (!isActiveOrder) return null;

//   const handleTrackingPress = () => {
//     router.push(`/order/tracking/${orderId}`);
//   };

//   return (
//     <Animated.View style={{ transform: [{ scale: scaleValue }], marginBottom: 16 }}>
//       <Pressable
//         style={styles.trackingButtonContainer}
//         onPress={handleTrackingPress}
//         onPressIn={scaleIn}
//         onPressOut={scaleOut}
//       >
//         <LinearGradient
//           colors={['#8B5CF6', '#7C3AED', '#6D28D9']}
//           style={styles.trackingButtonGradient}
//           start={{ x: 0, y: 0 }}
//           end={{ x: 1, y: 1 }}
//         >
//           <View style={styles.trackingIconsContainer}>
//             <Text style={styles.floatingIcon}>🎮</Text>
//             <Text style={styles.floatingIcon}>⭐</Text>
//             <Text style={styles.floatingIcon}>🏆</Text>
//           </View>

//           <View style={styles.trackingButtonContent}>
//             <View style={styles.trackingMainInfo}>
//               <View style={styles.trackingTitleRow}>
//                 <Text style={styles.trackingButtonTitle}>Suivre ma commande</Text>
//               </View>
//               <Text style={styles.trackingButtonSubtitle}>Progression en temps réel avec badges et points</Text>
//             </View>

//             {/* flèche alignée à droite, plus d'absolu avec top:'50%' */}
//             <View style={styles.trackingArrowContainer}>
//               <Ionicons name="arrow-forward" size={24} color="#fff" />
//             </View>
//           </View>
//         </LinearGradient>
//       </Pressable>
//     </Animated.View>
//   );
// });

// Actions restaurateurs (avec modal paiement)
const RestaurantActions = React.memo(
  ({
    order,
    onStatusUpdate,
    onMarkAsPaid,
    onShowReceipt,
    isUpdating,
    showToast,
    scrollRef,
  }: {
    order: OrderDetail;
    onStatusUpdate: (status: string) => void;
    onMarkAsPaid: (paymentMethod: string) => Promise<void>;
    onShowReceipt: () => void;
    isUpdating: boolean;
    showToast: (variant: 'success' | 'error' | 'warning' | 'info', message: string, title?: string) => void;
    scrollRef?: React.RefObject<ScrollView | null>;
  }) => {
    const screenType = useScreenType();
    const { colors, isDark } = useAppTheme();
    const { t } = useTranslation();
    const accents = useMemo(() => createAccents(isDark), [isDark]);
    const gradients = useMemo(() => createGradients(colors, isDark), [colors, isDark]);
    const styles = useMemo(
      () => createStyles(colors, accents, screenType),
      [colors, accents, screenType],
    );

    const canUpdateStatus = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
    const canMarkAsPaid = order.payment_status !== 'paid' && order.status !== 'cancelled';
    const canShowReceipt = order.payment_status === 'paid' || order.status === 'served';

    const statusFlow = {
      pending: { next: 'confirmed', labelKey: 'orderDetail.actions.confirm', icon: 'checkmark-circle' },
      confirmed: { next: 'preparing', labelKey: 'orderDetail.actions.startPreparing', icon: 'restaurant' },
      preparing: { next: 'ready', labelKey: 'orderDetail.actions.markReady', icon: 'checkmark-done' },
      ready: { next: 'served', labelKey: 'orderDetail.actions.serve', icon: 'hand-left' },
    } as const;

    const nextStatus = statusFlow[order.status as keyof typeof statusFlow];

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [cancelConfirm, setCancelConfirm] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);

    /**
     * Réimpression du bon de cuisine. On passe la liste regroupée pour que le
     * bon corresponde exactement à ce qui est affiché au-dessus.
     */
    const handlePrintKitchenTicket = useCallback(async () => {
      try {
        setIsPrinting(true);
        await printKitchenTicket(
          kitchenTicketFromOrder(order, groupIdenticalItems(order.items)),
        );
      } catch {
        showToast('error', t('orderDetail.printFailed'), t('orderDetail.printFailedTitle'));
      } finally {
        setIsPrinting(false);
      }
    }, [order, showToast, t]);
    const canCancel = ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);

    const handleAskPaymentMethod = () => setShowPaymentModal(true);

    const handleSelectPayment = async (method: 'cash' | 'card') => {
      setShowPaymentModal(false);
      try {
        await onMarkAsPaid(method);
        showToast(
          'success',
          method === 'cash' ? t('orderDetail.paidWithCash') : t('orderDetail.paidWithCard'),
          t('common.success'),
        );
      } catch {
        // onMarkAsPaid gère déjà l’erreur côté parent
      }
    };

    return (
      <>
        {/* <GamifiedTrackingButton orderId={order.id} orderStatus={order.status} /> */}

        <LinearGradient colors={gradients.surface} style={styles.actionsCard}>
          <View style={styles.actionsHeader}>
            <Ionicons name="flash" size={20} color={colors.primary} />
            <Text style={styles.sectionTitle}>{t('orderDetail.actions.quickTitle')}</Text>
          </View>

          <View style={styles.actionButtons}>
            {canUpdateStatus && nextStatus && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, styles.statusButton, pressed && styles.buttonPressed]}
                onPress={() => onStatusUpdate(nextStatus.next)}
                disabled={isUpdating}
              >
                <LinearGradient colors={gradients.navy} style={styles.buttonGradient}>
                  {isUpdating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={nextStatus.icon as any} size={18} color="#fff" />
                      <Text style={styles.actionButtonText}>{t(nextStatus.labelKey)}</Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>
            )}

            {canMarkAsPaid && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, styles.paymentButton, pressed && styles.buttonPressed]}
                onPress={handleAskPaymentMethod}
                disabled={isUpdating}
              >
                <LinearGradient colors={gradients.success} style={styles.buttonGradient}>
                  <Ionicons name="card" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>{t('orderDetail.actions.collect')}</Text>
                </LinearGradient>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
              onPress={handlePrintKitchenTicket}
              disabled={isUpdating || isPrinting}
            >
              <LinearGradient colors={gradients.navy} style={styles.buttonGradient}>
                <Ionicons name={isPrinting ? 'hourglass' : 'print'} size={18} color="#fff" />
                <Text style={styles.actionButtonText}>{t('orderDetail.actions.kitchenTicket')}</Text>
              </LinearGradient>
            </Pressable>

            {canShowReceipt && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, styles.receiptButton, pressed && styles.buttonPressed]}
                onPress={onShowReceipt}
                disabled={isUpdating}
              >
                <LinearGradient colors={gradients.gold} style={styles.buttonGradient}>
                  <Ionicons name="receipt" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>{t('orderDetail.actions.receipt')}</Text>
                </LinearGradient>
              </Pressable>
            )}

            {canCancel && (
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.buttonPressed]}
                onPress={() => {
                  setCancelConfirm(true);
                  setTimeout(() => scrollRef?.current?.scrollToEnd({ animated: true }), 150);
                }}
                disabled={isUpdating}
              >
                <LinearGradient colors={gradients.danger} style={styles.buttonGradient}>
                  <Ionicons name="close-circle" size={18} color="#fff" />
                  <Text style={styles.actionButtonText}>{t('orderDetail.actions.cancel')}</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>

          {cancelConfirm && (
            <View style={{ marginTop: 12 }}>
              <AlertWithAction
                variant="warning"
                title={t('orderDetail.cancelConfirm.title')}
                message={t('orderDetail.cancelConfirm.message', { number: order.order_number })}
                secondaryButton={{
                  text: t('orderDetail.cancelConfirm.keep'),
                  onPress: () => setCancelConfirm(false),
                }}
                primaryButton={{
                  text: t('orderDetail.cancelConfirm.confirm'),
                  onPress: () => {
                    setCancelConfirm(false);
                    onStatusUpdate('cancelled');
                  },
                  variant: 'danger',
                }}
              />
            </View>
          )}
        </LinearGradient>

        {/* Modal choix paiement */}
        <Modal visible={showPaymentModal} transparent animationType="fade" onRequestClose={() => setShowPaymentModal(false)}>
          <View
            style={{
              flex: 1,
              backgroundColor: colors.overlay,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 420,
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border.light,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: 12 }}>
                {t('orderDetail.payModal.title')}
              </Text>
              <Text style={{ color: colors.text.secondary, marginBottom: 16 }}>
                {t('orderDetail.payModal.question')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => handleSelectPayment('cash')}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      backgroundColor: colors.success,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('orderDetail.payModal.cash')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSelectPayment('card')}
                  style={({ pressed }) => [
                    {
                      flex: 1,
                      backgroundColor: colors.primary,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('orderDetail.payModal.card')}</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => setShowPaymentModal(false)} style={{ marginTop: 12, alignSelf: 'center' }}>
                <Text style={{ color: colors.text.light }}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    );
  }
);

// Bouton paiement client
const ClientPaymentButton = React.memo(({ order, onShowReceipt }: { order: OrderDetail; onShowReceipt: () => void }) => {
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const accents = useMemo(() => createAccents(isDark), [isDark]);
  const gradients = useMemo(() => createGradients(colors, isDark), [colors, isDark]);
  const styles = useMemo(
    () => createStyles(colors, accents, screenType),
    [colors, accents, screenType],
  );
  const { scaleValue, scaleIn, scaleOut } = useScaleAnimation();

  const shouldShowPayButton = order.payment_status !== 'paid' && order.status !== 'cancelled';
  const canShowReceipt = order.payment_status === 'paid';

  const handlePayPress = () => {
    router.push(`/order/payment?orderId=${order.id}`);
  };

  return (
    <View style={styles.paymentSection}>
      {/* <GamifiedTrackingButton orderId={order.id} orderStatus={order.status} /> */}

      {shouldShowPayButton && (
        <Animated.View style={{ transform: [{ scale: scaleValue }] }}>
          <Pressable style={styles.payButtonContainer} onPress={handlePayPress} onPressIn={scaleIn} onPressOut={scaleOut}>
            <LinearGradient colors={gradients.gold} style={styles.payButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.payButtonContent}>
                <Ionicons name="card" size={24} color="#fff" />
                <View>
                  <Text style={styles.payButtonText}>{t('orderDetail.client.payNow')}</Text>
                  <Text style={styles.payButtonAmount}>{order.subtotal}€</Text>
                </View>
                {/* flèche à droite */}
                <View style={{ marginLeft: 'auto' }}>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}

      {canShowReceipt && (
        <Pressable style={styles.receiptButtonClient} onPress={onShowReceipt}>
          <LinearGradient colors={gradients.surface} style={styles.receiptButtonGradient}>
            <Ionicons name="receipt-outline" size={20} color={colors.primary} />
            <Text style={styles.receiptButtonText}>{t('orderDetail.client.viewReceipt')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
          </LinearGradient>
        </Pressable>
      )}
    </View>
  );
});

// Timeline
const OrderTimeline = React.memo(({ order }: { order: OrderDetail }) => {
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const { t, i18n } = useTranslation();
  const accents = useMemo(() => createAccents(isDark), [isDark]);
  const gradients = useMemo(() => createGradients(colors, isDark), [colors, isDark]);
  const styles = useMemo(
    () => createStyles(colors, accents, screenType),
    [colors, accents, screenType],
  );

  const timelineEvents = [
    { status: 'pending', label: t('orderDetail.timeline.created'), time: order.created_at, completed: true, icon: 'receipt-outline' as const, color: accents.info },
    { status: 'confirmed', label: t('orderDetail.timeline.confirmed'), time: order.status === 'confirmed' ? order.updated_at : null, completed: ['confirmed', 'preparing', 'ready', 'served'].includes(order.status), icon: 'checkmark-circle-outline' as const, color: colors.primary },
    { status: 'preparing', label: t('orderDetail.timeline.preparing'), time: order.status === 'preparing' ? order.updated_at : null, completed: ['preparing', 'ready', 'served'].includes(order.status), icon: 'restaurant-outline' as const, color: colors.secondary },
    { status: 'ready', label: t('orderDetail.timeline.ready'), time: order.ready_at || (order.status === 'ready' ? order.updated_at : null), completed: ['ready', 'served'].includes(order.status), icon: 'checkmark-done-outline' as const, color: colors.warning },
    { status: 'served', label: t('orderDetail.timeline.served'), time: order.served_at || (order.status === 'served' ? order.updated_at : null), completed: order.status === 'served', icon: 'trophy-outline' as const, color: colors.success },
  ];

  const formatTime = (timeString?: string | null) => {
    if (!timeString) return null;
    const date = new Date(timeString);
    return date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
    };

  return (
    <LinearGradient colors={gradients.surface} style={styles.timelineCard}>
      <View style={styles.timelineHeader}>
        <Ionicons name="time" size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{t('orderDetail.timeline.title')}</Text>
      </View>

      <View style={styles.timelineContainer}>
        {timelineEvents.map((event, index) => (
          <View key={event.status} style={styles.timelineEvent}>
            <View style={styles.timelineIconContainer}>
              <View
                style={[
                  styles.timelineIcon,
                  {
                    backgroundColor: event.completed ? event.color : accents.borderMedium,
                    borderColor: event.color,
                  },
                ]}
              >
                <Ionicons name={event.icon} size={16} color={event.completed ? '#fff' : colors.text.light} />
              </View>
              {index < timelineEvents.length - 1 && <View style={[styles.timelineLine, event.completed && { backgroundColor: event.color }]} />}
            </View>

            <View style={styles.timelineContent}>
              <Text style={[styles.timelineLabel, event.completed && { color: colors.text.primary, fontWeight: '600' }]}>
                {event.label}
              </Text>
              {event.time && (
                <View style={styles.timeTimeContainer}>
                  <Ionicons name="time-outline" size={12} color={colors.text.light} />
                  <Text style={styles.timelineTime}>{formatTime(event.time)}</Text>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
});

// Modal Receipt
const ReceiptModal = React.memo(({ visible, onClose, order }: { visible: boolean; onClose: () => void; order: OrderDetail }) => {
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const accents = useMemo(() => createAccents(isDark), [isDark]);
  const styles = useMemo(
    () => createStyles(colors, accents, screenType),
    [colors, accents, screenType],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer}>
        <Receipt orderId={String(order.id)} order={order} showActions={true} onClose={onClose} />
      </SafeAreaView>
    </Modal>
  );
});

// Composant principal
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isRestaurateur, isClient } = useAuth();
  const { getOrder, updateOrderStatus, markAsPaid } = useOrder();
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const { t, i18n } = useTranslation();
  const accents = useMemo(() => createAccents(isDark), [isDark]);
  const gradients = useMemo(() => createGradients(colors, isDark), [colors, isDark]);
  const styles = useMemo(
    () => createStyles(colors, accents, screenType),
    [colors, accents, screenType],
  );

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // ✅ Toast local pour InlineAlert
  const [toast, setToast] = useState<{
    visible: boolean;
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({ visible: false, variant: 'info', message: '' });

  const showToast = useCallback(
    (variant: 'success' | 'error' | 'warning' | 'info', message: string, title?: string) => {
      setToast({ visible: true, variant, message, title });
    },
    []
  );
  const hideToast = useCallback(() => setToast((p) => ({ ...p, visible: false })), []);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Charger la commande
  useEffect(() => {
    if (!id) return;
    const loadOrder = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const orderData = await getOrder(parseInt(id));
        if (orderData) {
          setOrder(orderData);
          Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        } else {
          setError(t('orderDetail.error.orderNotFound'));
        }
      } catch (err) {
        setError(t('orderDetail.error.loadFailed'));
        showToast('error', t('orderDetail.error.loadFailed'), t('common.error'));
      } finally {
        setIsLoading(false);
      }
    };
    loadOrder();
  }, [getOrder, id, fadeAnim, showToast, t]);

  // MAJ statut
  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;
    setIsUpdating(true);
    try {
      const updatedOrder = await updateOrderStatus(order.id, newStatus);
      setOrder(updatedOrder);
      const statusLabels: Record<string, string> = {
        pending: t('order.status.pending'),
        confirmed: t('order.status.confirmed'),
        preparing: t('order.status.preparing'),
        ready: t('order.status.ready'),
        served: t('order.status.served'),
        cancelled: t('order.status.cancelled'),
      };
      showToast(
        'success',
        t('orderDetail.statusUpdated', { label: statusLabels[newStatus] ?? newStatus }),
        t('common.success'),
      );
      if (newStatus === 'cancelled') {
        setTimeout(() => router.back(), 600);
      }
    } catch (e) {
      showToast('error', t('orderDetail.statusUpdateFailed'), t('common.error'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Marquer payée
  const handleMarkAsPaid = async (paymentMethod: string) => {
    if (!order) return;
    setIsUpdating(true);
    try {
      const updatedOrder = await markAsPaid(order.id, paymentMethod);
      setOrder(updatedOrder);
      showToast('success', t('orderDetail.markPaidSuccess'), t('common.success'));
    } catch (e) {
      showToast('error', t('orderDetail.markPaidFailed'), t('common.error'));
      throw e;
    } finally {
      setIsUpdating(false);
    }
  };

  const handleShowReceipt = () => setShowReceiptModal(true);

  // État chargement
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header title={t('orderDetail.headerTitle')} showBackButton />
        {/* Zone d'alerte */}
        <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
          {toast.visible && (
            <InlineAlert variant={toast.variant} title={toast.title} message={toast.message} onDismiss={hideToast} autoDismiss />
          )}
        </View>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{t('orderDetail.loading')}</Text>
          </View>
        </View>
      </View>
    );
  }

  // État erreur
  if (error || !order) {
    return (
      <View style={styles.container}>
        <Header title={t('orderDetail.headerTitle')} showBackButton />
        {/* Zone d'alerte */}
        <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
          {toast.visible && (
            <InlineAlert variant={toast.variant} title={toast.title} message={toast.message} onDismiss={hideToast} autoDismiss />
          )}
        </View>
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          </View>
          <Text style={styles.errorTitle}>{t('orderDetail.error.title')}</Text>
          <Text style={styles.errorMessage}>{error || t('orderDetail.error.notFound')}</Text>
          <Pressable style={styles.retryButton} onPress={() => router.back()}>
            <LinearGradient colors={gradients.navy} style={styles.retryGradient}>
              <Text style={styles.retryButtonText}>{t('common.back')}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  // Infos d'affichage
  const displayInfo = {
    title: t('orderDetail.title', {
      number: order.order_number || t('orderDetail.titleFallback', { id: order.id }),
    }),
    restaurantName: order.restaurant_name || t('orderDetail.restaurantFallback'),
    customerName:
      order.customer_name || order.customer_display || t('orderDetail.customerFallback'),
    date: new Date(order.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' }),
    time: new Date(order.created_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
    isActive: ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status),
  };

  return (
    <View style={styles.container}>
      <Header title={displayInfo.title} showBackButton />

      {/* 🔔 Zone d’alertes en haut */}
      <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
        {toast.visible && (
          <InlineAlert variant={toast.variant} title={toast.title} message={toast.message} onDismiss={hideToast} autoDismiss />
        )}
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.mainLayout}>
            {/* Colonne principale */}
            <View style={styles.mainColumn}>
              {/* En-tête */}
              <LinearGradient
                colors={order.payment_status === 'paid' ? gradients.success : gradients.navy}
                style={styles.headerGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.headerContent}>
                  <View style={styles.orderMainInfo}>
                    <Text style={styles.orderTitle}>{displayInfo.title}</Text>
                    <Text style={styles.restaurantName}>{displayInfo.restaurantName}</Text>
                    <Text style={styles.customerName}>{displayInfo.customerName}</Text>
                    <View style={styles.dateTimeContainer}>
                      <Ionicons name="calendar" size={14} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.orderDateTime}>
                        {displayInfo.date} à {displayInfo.time}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.headerBadges}>
                    <StatusBadge status={order.status} />
                    {order.payment_status === 'paid' && (
                      <View style={styles.paidBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.paidText}>{t('orderDetail.paid')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </LinearGradient>

              {/* Détails */}
              <LinearGradient colors={gradients.surface} style={styles.detailsCard}>
                <View style={styles.orderDetails}>
                  {order.table_number && (
                    <View style={styles.detailChip}>
                      <Ionicons name="restaurant-outline" size={16} color={colors.primary} />
                      <Text style={styles.detailText}>
                        {t('orderDetail.table', { number: order.table_number })}
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailChip}>
                    <Ionicons name={order.order_type === 'dine_in' ? 'restaurant' : 'bag'} size={16} color={colors.secondary} />
                    <Text style={styles.detailText}>
                      {order.order_type === 'dine_in'
                        ? t('restaurantOrders.orderType.dineIn')
                        : t('restaurantOrders.orderType.takeaway')}
                    </Text>
                  </View>

                  {order.waiting_time && displayInfo.isActive && (
                    <View style={styles.detailChip}>
                      <Ionicons name="hourglass-outline" size={16} color={colors.warning} />
                      <Text style={styles.detailText}>
                        {t('orderDetail.estimatedTime', { minutes: order.waiting_time })}
                      </Text>
                    </View>
                  )}
                </View>

                {order.notes && (
                  <LinearGradient colors={gradients.instructions} style={styles.notesContainer}>
                    <View style={styles.notesHeader}>
                      <Ionicons name="chatbox-ellipses" size={16} color={colors.warning} />
                      <Text style={styles.notesLabel}>{t('orderDetail.notesLabel')}</Text>
                    </View>
                    <Text style={styles.notesText}>{order.notes}</Text>
                  </LinearGradient>
                )}
              </LinearGradient>

              {/* Items */}
              <View style={styles.itemsSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="receipt" size={20} color={colors.primary} />
                  <Text style={styles.sectionTitle}>{t('orderDetail.itemsTitle')}</Text>
                  <View style={styles.itemCount}>
                    <Text style={styles.itemCountText}>{groupIdenticalItems(order.items).reduce((sum, item) => sum + item.quantity, 0)}</Text>
                  </View>
                </View>
                {groupIdenticalItems(order.items).map((item, index) => (
                  <OrderItemCard key={`${item.menu_item}-${index}`} item={item} index={index} />
                ))}
              </View>

              {/* Totaux */}
              <LinearGradient colors={gradients.golden} style={styles.totalsCard}>
                <View style={styles.totalsHeader}>
                  <Ionicons name="calculator" size={20} color={accents.accent} />
                  <Text style={styles.sectionTitle}>{t('orderDetail.recap')}</Text>
                </View>

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('orderDetail.subtotal')}</Text>
                  <Text style={styles.totalValue}>{order.subtotal}€</Text>
                </View>

                <View style={[styles.totalRow, styles.finalTotal]}>
                  <Text style={styles.finalTotalLabel}>{t('orderDetail.totalDue')}</Text>
                  <Text style={styles.finalTotalValue}>{order.subtotal}€</Text>
                </View>
              </LinearGradient>
            </View>

            {/* Colonne secondaire */}
            <View style={styles.sideColumn}>
              <OrderTimeline order={order} />

              {isRestaurateur && order.status !== 'cancelled' && (
                <RestaurantActions
                  order={order}
                  onStatusUpdate={handleStatusUpdate}
                  onMarkAsPaid={handleMarkAsPaid}
                  onShowReceipt={handleShowReceipt}
                  isUpdating={isUpdating}
                  showToast={showToast}
                  scrollRef={scrollRef}
                />
              )}

              {isClient && <ClientPaymentButton order={order} onShowReceipt={handleShowReceipt} />}
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Modal Ticket */}
      <ReceiptModal visible={showReceiptModal} onClose={() => setShowReceiptModal(false)} order={order} />
    </View>
  );
}

// Styles
const createStyles = (
  colors: AppColors,
  accents: Accents,
  screenType: 'mobile' | 'tablet' | 'desktop',
) => {
  const isTabletOrLarger = screenType !== 'mobile';
  const isDesktop = screenType === 'desktop';

  return {
    container: { flex: 1 as const, backgroundColor: colors.background },
    content: { flex: 1 as const },
    contentContainer: { padding: isTabletOrLarger ? 24 : 16, paddingBottom: 32 },

    // Layout
    mainLayout: {
      flexDirection: (isTabletOrLarger ? ('row' as const) : ('column' as const)),
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center' as const,
      width: '100%' as const,
      gap: isTabletOrLarger ? 24 : 16,
    },
    mainColumn: { flex: isTabletOrLarger ? 2 : 1 },
    sideColumn: { flex: 1, minWidth: isTabletOrLarger ? 320 : undefined },

    // États
    loadingContainer: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, backgroundColor: colors.background },
    loadingContent: {
      alignItems: 'center' as const,
      backgroundColor: colors.surface,
      padding: 32,
      borderRadius: 20,
      ...(accents.shadowMedium && {
        shadowColor: accents.shadowMedium,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
        elevation: 8,
      }),
    },
    loadingText: { marginTop: 16, fontSize: 16, color: colors.text.secondary, fontWeight: '500' as const },
    errorContainer: { flex: 1, justifyContent: 'center' as const, alignItems: 'center' as const, padding: 32 },
    errorIcon: { backgroundColor: '#FEE2E2', width: 120, height: 120, borderRadius: 60, justifyContent: 'center' as const, alignItems: 'center' as const, marginBottom: 20 },
    errorTitle: { fontSize: isTabletOrLarger ? 28 : 24, fontWeight: 'bold' as const, color: colors.text.primary, marginBottom: 8 },
    errorMessage: { fontSize: 16, color: colors.text.secondary, textAlign: 'center' as const, marginBottom: 32, lineHeight: 24 },
    retryButton: { borderRadius: 12, overflow: 'hidden' as const },
    retryGradient: { paddingHorizontal: 24, paddingVertical: 12 },
    retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },

    // Header gradient
    headerGradient: {
      borderRadius: 20,
      marginBottom: 20,
      overflow: 'hidden' as const,
      ...(accents.shadowMedium && {
        shadowColor: accents.shadowMedium,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 12,
      }),
    },
    headerContent: {
      padding: 24,
      flexDirection: (isTabletOrLarger ? ('row' as const) : ('column' as const)),
      justifyContent: 'space-between' as const,
      alignItems: (isTabletOrLarger ? ('flex-start' as const) : ('stretch' as const)),
      gap: isTabletOrLarger ? 0 : 16,
    },
    orderMainInfo: { flex: 1 },
    orderTitle: { fontSize: isTabletOrLarger ? 28 : 24, fontWeight: 'bold' as const, color: '#fff', marginBottom: 6 },
    restaurantName: { fontSize: isTabletOrLarger ? 18 : 16, color: 'rgba(255,255,255,0.9)', marginBottom: 4 },
    customerName: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 8 },
    dateTimeContainer: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    orderDateTime: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
    headerBadges: { alignItems: (isTabletOrLarger ? ('flex-end' as const) : ('flex-start' as const)), gap: 8 },
    paidBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
    paidText: { color: '#fff', fontSize: 14, fontWeight: '600' as const },

    // Détails
    detailsCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      ...(colors.shadow.default && {
        shadowColor: colors.shadow.default,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
      }),
    },
    orderDetails: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
    detailChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: accents.goldenSurface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 6,
      borderWidth: 1,
      borderColor: accents.borderGolden,
    },
    detailText: { fontSize: 14, color: colors.text.primary, fontWeight: '500' as const },

    // Notes
    notesContainer: { marginTop: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: accents.borderGolden },
    notesHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8 },
    notesLabel: { fontSize: 14, fontWeight: '600' as const, color: colors.text.primary },
    notesText: { fontSize: 14, color: colors.text.secondary, lineHeight: 20 },

    // Timeline
    timelineCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      ...(colors.shadow.default && {
        shadowColor: colors.shadow.default,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
      }),
    },
    timelineHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 16 },
    timelineContainer: { paddingLeft: 4 },
    timelineEvent: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, marginBottom: 16 },
    timelineIconContainer: { alignItems: 'center' as const, marginRight: 16, zIndex: 1 },
    timelineIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: colors.surface,
    },
    timelineLine: { width: 2, height: 24, backgroundColor: accents.borderMedium, marginTop: 8 },
    timelineContent: { flex: 1, paddingTop: 4 },
    timelineLabel: { fontSize: 15, color: colors.text.secondary, marginBottom: 4 },
    timeTimeContainer: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
    timelineTime: { fontSize: 12, color: colors.text.light },

    // Items
    itemsSection: { marginBottom: 20 },
    sectionHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 16 },
    sectionTitle: { fontSize: isTabletOrLarger ? 20 : 18, fontWeight: 'bold' as const, color: colors.text.primary, flex: 1 },
    itemCount: { backgroundColor: colors.primary, width: 24, height: 24, borderRadius: 12, justifyContent: 'center' as const, alignItems: 'center' as const },
    itemCountText: { color: '#fff', fontSize: 12, fontWeight: 'bold' as const },

    // Cards
    itemCard: {
      borderRadius: 16,
      marginBottom: 12,
      overflow: 'hidden' as const,
      ...(colors.shadow.default && {
        shadowColor: colors.shadow.default,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 6,
        elevation: 3,
      }),
    },
    itemGradient: { padding: 16 },
    itemHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'flex-start' as const, marginBottom: 12 },
    itemTitleContainer: { flex: 1, marginRight: 12 },
    itemName: { fontSize: 16, fontWeight: '700' as const, color: colors.text.primary, marginBottom: 6 },
    premiumBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: accents.goldenSurface,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 4,
      alignSelf: 'flex-start' as const,
      borderWidth: 1,
      borderColor: accents.borderGolden,
    },
    premiumText: { fontSize: 11, color: accents.accent, fontWeight: '600' as const },
    priceContainer: { backgroundColor: colors.secondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    itemPrice: { fontSize: 16, fontWeight: 'bold' as const, color: '#fff' },
    itemDetails: { flexDirection: 'row' as const, gap: 16, marginBottom: 12 },
    detailBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: accents.goldenSurface, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, gap: 4 },
    itemQuantity: { fontSize: 13, color: colors.text.secondary, fontWeight: '500' as const },
    itemUnitPrice: { fontSize: 13, color: colors.text.secondary, fontWeight: '500' as const },

    // Instructions
    instructionsContainer: { marginBottom: 12 },
    instructionsGradient: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FCD34D' },
    instructionsHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 6 },
    instructionsLabel: { fontSize: 13, fontWeight: '600' as const, color: colors.warning },
    instructionsText: { fontSize: 14, color: colors.text.primary, lineHeight: 18 },

    // Customisations
    customizationsContainer: { marginBottom: 8 },
    customizationsGradient: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: accents.borderGolden },
    customizationsHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 },
    customizationsLabel: { fontSize: 13, fontWeight: '600' as const, color: accents.accent },
    customizationsList: { gap: 4 },
    customizationItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    customizationDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.secondary },
    customizationText: { fontSize: 13, color: colors.text.primary, flex: 1 },
    customizationKey: { fontWeight: '600' as const, color: accents.accent },

    // Totaux
    totalsCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: accents.borderGolden,
      ...(accents.shadowGolden && {
        shadowColor: accents.shadowGolden,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 6,
      }),
    },
    totalsHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 16 },
    totalRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 8 },
    totalLabel: { fontSize: 15, color: colors.text.secondary },
    totalValue: { fontSize: 15, color: colors.text.primary, fontWeight: '500' as const },
    finalTotal: { borderTopWidth: 2, borderTopColor: accents.borderGolden, paddingTop: 12, marginTop: 8 },
    finalTotalLabel: { fontSize: isTabletOrLarger ? 18 : 16, fontWeight: 'bold' as const, color: colors.text.primary },
    finalTotalValue: { fontSize: isTabletOrLarger ? 20 : 18, fontWeight: 'bold' as const, color: accents.accent },

    // Bouton Suivi
    trackingButtonContainer: {
      borderRadius: 20,
      overflow: 'hidden' as const,
      ...(accents.shadowMedium && {
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 12,
      }),
    },
    trackingButtonGradient: { padding: 20, position: 'relative' as const, minHeight: 100 },
    trackingIconsContainer: { position: 'absolute' as const, top: 10, right: 10, flexDirection: 'row' as const, gap: 8 },
    floatingIcon: { fontSize: 20, opacity: 0.3 },
    trackingButtonContent: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    trackingMainInfo: { flex: 1 },
    trackingTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 6 },
    trackingButtonTitle: { color: '#fff', fontSize: isTabletOrLarger ? 20 : 18, fontWeight: '700' as const },
    trackingButtonSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 18 },
    trackingArrowContainer: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 24, marginLeft: 12 },

    // Actions RESTO
    actionsCard: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      ...(colors.shadow.default && {
        shadowColor: colors.shadow.default,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 4,
      }),
    },
    actionsHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 16 },
    actionButtons: { flexDirection: (isTabletOrLarger ? ('column' as const) : ('row' as const)), flexWrap: 'wrap' as const, gap: 10 },
    actionButton: { borderRadius: 12, overflow: 'hidden' as const, flexGrow: isTabletOrLarger ? 0 : 1, flexShrink: 0 },
    buttonGradient: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 12, paddingVertical: 12, gap: 6, minHeight: 44 },
    statusButton: {
      ...(colors.shadow.default && {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }),
    },
    paymentButton: {
      ...(colors.shadow.default && {
        shadowColor: colors.success,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }),
    },
    receiptButton: {
      ...(accents.shadowGolden && {
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }),
    },
    buttonPressed: { transform: [{ scale: 0.95 }] },
    actionButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' as const },

    // Paiement client
    paymentSection: { marginBottom: 16, gap: 12 },
    payButtonContainer: {
      borderRadius: 16,
      overflow: 'hidden' as const,
      ...(accents.shadowGolden && {
        shadowColor: accents.shadowGolden,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 12,
      }),
    },
    payButtonGradient: { padding: 20 },
    payButtonContent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 },
    payButtonText: { color: '#fff', fontSize: isTabletOrLarger ? 18 : 16, fontWeight: '700' as const },
    payButtonAmount: { color: 'rgba(255,255,255,0.9)', fontSize: isTabletOrLarger ? 24 : 20, fontWeight: 'bold' as const },

    // Bouton ticket client
    receiptButtonClient: {
      borderRadius: 12,
      overflow: 'hidden' as const,
      ...(colors.shadow.default && {
        shadowColor: colors.shadow.default,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 4,
        elevation: 2,
      }),
    },
    receiptButtonGradient: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    receiptButtonText: { fontSize: 15, fontWeight: '600' as const, color: colors.text.primary, flex: 1, marginLeft: 8 },

    // Modal
    modalContainer: { flex: 1 as const, backgroundColor: colors.background },
  };
};