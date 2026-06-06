import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

// Contexts & Hooks
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';
import { useSessionCart } from '@/hooks/session/useSessionCart';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';

// Components
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { Alert, AlertWithAction, useAlert } from '@/components/ui/Alert';

// Utils & Types
import {
  useAppTheme,
  makeShadows,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  useScreenType,
  getResponsiveValue,
  createResponsiveStylesThemed,
  COMPONENT_CONSTANTS,
  type AppColors,
} from '@/utils/designSystem';
import { QRSessionUtils } from '@/utils/qrSessionUtils';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';
import { dailyMenuService, PublicDailyMenu } from '@/services/dailyMenuService';
import { computeFormulaStatus, formatFormulaMissingMessage } from '@/utils/dailyMenuFormula';

// ============================================================================
// TYPES
// ============================================================================

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  specialInstructions?: string;
}

type ScreenType = 'mobile' | 'tablet' | 'desktop';

// Formatage de prix simple — peut évoluer vers Intl.NumberFormat localisé
const formatPrice = (amount: number): string => `${amount.toFixed(2)} €`;

// ============================================================================
// CART ITEM COMPONENT
// ============================================================================

interface CartItemCardProps {
  item: CartItem;
  onQuantityChange: (itemId: string, newQuantity: number) => void;
  onRemove: (itemId: string) => void;
  screenType: ScreenType;
  isUpdating?: boolean;
}

const CartItemCard = React.memo<CartItemCardProps>(({
  item,
  onQuantityChange,
  onRemove,
  screenType,
  isUpdating = false,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createResponsiveStylesThemed(screenType, colors), [screenType, colors]);
  const local = useMemo(() => makeLocalStyles(colors, isDark), [colors, isDark]);

  const imageSize = getResponsiveValue({ mobile: 80, tablet: 90, desktop: 100 }, screenType);
  const smallIconSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);
  const [localQuantity, setLocalQuantity] = useState(item.quantity);

  useEffect(() => {
    setLocalQuantity(item.quantity);
  }, [item.quantity]);

  const handleDecrease = useCallback(() => {
    const newQuantity = localQuantity - 1;
    if (newQuantity === 0) {
      onRemove(item.id);
    } else {
      setLocalQuantity(newQuantity);
      onQuantityChange(item.id, newQuantity);
    }
  }, [localQuantity, item.id, onQuantityChange, onRemove]);

  const handleIncrease = useCallback(() => {
    const newQuantity = localQuantity + 1;
    setLocalQuantity(newQuantity);
    onQuantityChange(item.id, newQuantity);
  }, [localQuantity, item.id, onQuantityChange]);

  return (
    <Card
      padding="sm"
      style={[
        local.cartItemCard,
        styles.mb('sm'),
        ...(isUpdating ? [local.updatingCard] : []),
      ]}
      accessibilityLabel={t('cart.a11y.itemRow', {
        name: item.name,
        count: localQuantity,
        price: formatPrice(item.price * localQuantity),
      })}
    >
      {isUpdating && (
        <View style={local.loadingOverlay}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      <View style={local.cartItemContent}>
        {item.image && (
          <Image
            source={{ uri: item.image }}
            style={[
              local.itemImage,
              {
                width: imageSize,
                height: imageSize,
                marginRight: getResponsiveValue(SPACING.sm, screenType),
              },
            ]}
            accessibilityLabel={t('cart.a11y.itemImage', { name: item.name })}
          />
        )}

        <View style={local.itemDetails}>
          <View style={local.itemHeader}>
            <Text
              style={[styles.textSubtitle, local.itemName]}
              numberOfLines={2}
            >
              {item.name}
            </Text>

            <TouchableOpacity
              onPress={() => onRemove(item.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel={t('cart.a11y.removeItem')}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={smallIconSize} color={colors.error} />
            </TouchableOpacity>
          </View>

          {item.specialInstructions && (
            <View style={[local.instructionsContainer, styles.mt('xs')]}>
              <Ionicons
                name="information-circle-outline"
                size={14}
                color={colors.text.light}
              />
              <Text
                style={[styles.textCaption, local.instructions]}
                numberOfLines={2}
              >
                {item.specialInstructions}
              </Text>
            </View>
          )}

          <View style={[local.itemFooter, styles.mt('sm')]}>
            <Text
              style={[
                styles.textSubtitle,
                { color: colors.primary, fontWeight: TYPOGRAPHY.fontWeight.bold },
              ]}
            >
              {formatPrice(item.price * localQuantity)}
            </Text>

            <View style={local.quantityControls}>
              <TouchableOpacity
                onPress={handleDecrease}
                style={local.quantityButton}
                disabled={isUpdating}
                accessibilityLabel={t('cart.a11y.decrease')}
                accessibilityHint={t('cart.a11y.currentQuantity', { count: localQuantity })}
                accessibilityRole="button"
              >
                <Ionicons
                  name={localQuantity === 1 ? 'trash' : 'remove'}
                  size={smallIconSize}
                  color={localQuantity === 1 ? colors.error : colors.primary}
                />
              </TouchableOpacity>

              <Text
                style={[styles.textSubtitle, local.quantityText]}
                accessibilityLabel={t('cart.a11y.currentQuantity', { count: localQuantity })}
              >
                {localQuantity}
              </Text>

              <TouchableOpacity
                onPress={handleIncrease}
                style={[local.quantityButton, local.quantityButtonAdd]}
                disabled={isUpdating}
                accessibilityLabel={t('cart.a11y.increase')}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={smallIconSize} color={colors.text.inverse} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
});

CartItemCard.displayName = 'CartItemCard';

// ============================================================================
// CART SUMMARY COMPONENT
// ============================================================================

interface CartSummaryProps {
  subtotal: number;
  itemCount: number;
  isCreatingOrder: boolean;
  onCheckout: () => void;
  screenType: ScreenType;
  canCheckout?: boolean;
  checkoutTitle?: string;
  formulaWarning?: string | null;
}

const CartSummary = React.memo<CartSummaryProps>(({
  subtotal,
  itemCount,
  isCreatingOrder,
  onCheckout,
  screenType,
  canCheckout = true,
  checkoutTitle,
  formulaWarning = null,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createResponsiveStylesThemed(screenType, colors), [screenType, colors]);
  const local = useMemo(() => makeLocalStyles(colors, isDark), [colors, isDark]);

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType);

  const serviceFee = 0;
  const total = subtotal + serviceFee;

  const isLockedByFormula = !!formulaWarning;
  const resolvedCheckoutTitle = checkoutTitle ?? t('cart.checkout');

  return (
    <View style={local.summaryContainer}>
      <View style={local.summaryContent}>
        <View style={local.summaryRow}>
          <Text style={styles.textBody}>
            {t('cart.subtotal')} ({t('cart.item', { count: itemCount })})
          </Text>
          <Text style={styles.textBody}>{formatPrice(subtotal)}</Text>
        </View>

        {serviceFee > 0 && (
          <View style={[local.summaryRow, styles.mt('xs')]}>
            <Text style={styles.textCaption}>{t('cart.serviceFee')}</Text>
            <Text style={styles.textCaption}>{formatPrice(serviceFee)}</Text>
          </View>
        )}

        <View style={local.divider} />

        <View style={local.totalRow}>
          <Text style={styles.textSubtitle}>{t('cart.total')}</Text>
          <Text style={[styles.textTitle, { color: colors.primary }]}>
            {formatPrice(total)}
          </Text>
        </View>
      </View>

      {isLockedByFormula && (
        <View style={local.formulaBanner}>
          <Ionicons name="information-circle" size={18} color={colors.warning} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={local.formulaBannerTitle}>{t('cart.formula.incomplete')}</Text>
            <Text style={local.formulaBannerText}>{formulaWarning}</Text>
          </View>
        </View>
      )}

      {canCheckout ? (
        <Button
          title={isCreatingOrder ? t('cart.processing') : resolvedCheckoutTitle}
          onPress={onCheckout}
          disabled={isCreatingOrder || itemCount === 0 || isLockedByFormula}
          fullWidth
          leftIcon={
            isCreatingOrder ? (
              <ActivityIndicator size="small" color={colors.text.inverse} />
            ) : (
              <Ionicons
                name={isLockedByFormula ? 'lock-closed' : 'checkmark-circle'}
                size={iconSize}
                color={colors.text.inverse}
              />
            )
          }
          accessibilityLabel={t('cart.a11y.checkoutLabel', { amount: formatPrice(total) })}
          accessibilityHint={
            isLockedByFormula ? t('cart.a11y.formulaLockHint') : t('cart.a11y.checkoutHint')
          }
          accessibilityState={{ disabled: isCreatingOrder || itemCount === 0 || isLockedByFormula }}
        />
      ) : (
        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
          <Ionicons
            name="lock-closed-outline"
            size={18}
            color={colors.text.secondary}
            style={{ marginBottom: 4 }}
          />
          <Text style={{ color: colors.text.secondary, fontSize: 13, textAlign: 'center' }}>
            {t('cart.hostOnlyCheckout')}
          </Text>
        </View>
      )}
    </View>
  );
});

CartSummary.displayName = 'CartSummary';

// ============================================================================
// RESTAURANT INFO COMPONENT
// ============================================================================

interface RestaurantInfoProps {
  restaurantName: string;
  tableNumber: string;
  itemCount: number;
  hasActiveSession: boolean;
  screenType: ScreenType;
}

const RestaurantInfo = React.memo<RestaurantInfoProps>(({
  restaurantName,
  tableNumber,
  itemCount,
  hasActiveSession,
  screenType,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createResponsiveStylesThemed(screenType, colors), [screenType, colors]);
  const local = useMemo(() => makeLocalStyles(colors, isDark), [colors, isDark]);

  const iconSize = getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType);
  const cardPadding: keyof typeof SPACING = screenType === 'mobile' ? 'sm' : 'md';

  return (
    <View style={[styles.px('md'), styles.mt('md')]}>
      <Card padding={cardPadding} style={local.restaurantCard}>
        <View style={local.restaurantContent}>
          <View style={local.restaurantIcon}>
            <Ionicons name="restaurant" size={iconSize} color={colors.primary} />
          </View>

          <View style={local.restaurantDetails}>
            <Text style={[styles.textSubtitle, local.restaurantName]}>
              {restaurantName || t('order.fallbackRestaurant')}
            </Text>

            <View style={local.restaurantMeta}>
              {tableNumber && (
                <View style={local.metaItem}>
                  <Ionicons name="location" size={14} color={colors.text.secondary} />
                  <Text style={[styles.textCaption, local.metaText]}>
                    {t('cart.tableNumber', { number: tableNumber })}
                  </Text>
                </View>
              )}

              <View style={local.metaItem}>
                <Ionicons name="cart" size={14} color={colors.text.secondary} />
                <Text style={[styles.textCaption, local.metaText]}>
                  {t('cart.item', { count: itemCount })}
                </Text>
              </View>
            </View>

            {hasActiveSession && (
              <View style={local.sessionBadge}>
                <Ionicons name="people" size={12} color={colors.success} />
                <Text style={local.sessionBadgeText}>
                  {t('cart.collaborativeSession')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Card>
    </View>
  );
});

RestaurantInfo.displayName = 'RestaurantInfo';

// ============================================================================
// EMPTY CART COMPONENT
// ============================================================================

interface EmptyCartProps {
  screenType: ScreenType;
}

const EmptyCart = React.memo<EmptyCartProps>(({ screenType }) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createResponsiveStylesThemed(screenType, colors), [screenType, colors]);
  const local = useMemo(() => makeLocalStyles(colors, isDark), [colors, isDark]);

  const iconSize = getResponsiveValue({ mobile: 80, tablet: 100, desktop: 120 }, screenType);

  return (
    <View style={local.emptyContainer}>
      <View style={local.emptyIconContainer}>
        <Ionicons name="cart-outline" size={iconSize} color={colors.border.dark} />
      </View>

      <Text style={[styles.textTitle, styles.mt('lg'), { textAlign: 'center' }]}>
        {t('cart.empty')}
      </Text>

      <Text style={[styles.textBody, styles.mt('sm'), { textAlign: 'center', maxWidth: 320 }]}>
        {t('cart.emptyHint')}
      </Text>

      <View style={[local.qrButtonsContainer, styles.mt('xl')]}>
        <QRAccessButtons
          compact
          vertical
          title={t('cart.scanToOrder')}
          description={t('cart.scanToOrderDescription')}
          scanButtonText={t('order.scanQR')}
          codeButtonText={t('order.enterCode')}
          containerStyle={local.qrButtons}
        />
      </View>
    </View>
  );
});

EmptyCart.displayName = 'EmptyCart';

// ============================================================================
// MAIN CART SCREEN
// ============================================================================

export default function CartScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const {
    cart,
    removeFromCart,
    updateQuantity,
    clearCart,
    setTableNumber,
    initializeFromQRSession,
  } = useCart();
  const { isAuthenticated } = useAuth();
  const screenType = useScreenType();
  const styles = useMemo(() => createResponsiveStylesThemed(screenType, colors), [screenType, colors]);
  const local = useMemo(() => makeLocalStyles(colors, isDark), [colors, isDark]);
  const { alertState, showAlert, hideAlert, showError, showSuccess } = useAlert();

  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [currentTableNumber, setCurrentTableNumber] = useState(cart.tableNumber || '');
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set());
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [showSplitConfirmation, setShowSplitConfirmation] = useState(false);

  const [dailyMenu, setDailyMenu] = useState<PublicDailyMenu | null>(null);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    const loadTableFromQR = async () => {
      try {
        await initializeFromQRSession();
        const qrData = await QRSessionUtils.getSession();
        if (qrData?.tableNumber && !currentTableNumber) {
          setCurrentTableNumber(qrData.tableNumber);
          setTableNumber(qrData.tableNumber);
        }
      } catch (error) {
        console.error('Error loading table from QR:', error);
      }
    };
    loadTableFromQR();
  }, []);

  // ============================================================================
  // HOOKS
  // ============================================================================

  const { session: ctxSession, participantId: ctxParticipantId, isHost } = useSession();
  const ctxSessionId = ctxSession?.id ?? null;
  const isSessionMode = !!ctxSessionId;

  // ============================================================================
  // BACK NAVIGATION
  // ============================================================================
  const handleGoBack = useCallback(() => {
    const targetRestaurantId =
      cart.restaurantId ?? (isSessionMode ? ctxSession?.restaurant : undefined);
    const targetTableNumber = currentTableNumber || cart.tableNumber;

    if (targetRestaurantId != null) {
      const qs: string[] = [];
      if (targetTableNumber) {
        qs.push(`tableNumber=${encodeURIComponent(String(targetTableNumber))}`);
      }
      if (isSessionMode && ctxSessionId) {
        qs.push(`sessionId=${encodeURIComponent(String(ctxSessionId))}`);
      }
      const query = qs.length > 0 ? `?${qs.join('&')}` : '';
      router.replace(`/menu/client/${targetRestaurantId}${query}` as any);
      return;
    }

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(client)' as any);
    }
  }, [
    cart.restaurantId,
    cart.tableNumber,
    currentTableNumber,
    isSessionMode,
    ctxSession?.restaurant,
    ctxSessionId,
  ]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleGoBack();
        return true;
      });
      return () => sub.remove();
    }, [handleGoBack]),
  );

  const sessionCart = useSessionCart({
    sessionId: ctxSessionId,
    participantId: ctxParticipantId,
    enabled: isSessionMode,
    onPaymentRequested: isHost ? undefined : () => {
      router.replace('/(client)/orders' as any);
    },
  });

  const { on } = useSessionWebSocket(ctxSessionId);
  useEffect(() => {
    if (!ctxSessionId) return;
    const unsub = on('session_update', (data: any) => {
      if (data?.event === 'payment' && !isHost) {
        router.replace('/(client)/orders' as any);
      }
    });
    return () => unsub();
  }, [ctxSessionId, on, isHost]);

  useEffect(() => {
    if (ctxSession?.status === 'payment' && !isHost) {
      router.replace('/(client)/orders' as any);
    }
  }, [ctxSession?.status, isHost]);

  const restaurantIdForDailyMenu = useMemo(() => {
    const raw = cart.restaurantId ?? (isSessionMode ? ctxSession?.restaurant : undefined);
    if (raw == null) return null;
    const asNum = Number(raw);
    return Number.isFinite(asNum) ? asNum : null;
  }, [cart.restaurantId, isSessionMode, ctxSession?.restaurant]);

  useEffect(() => {
    let cancelled = false;
    if (restaurantIdForDailyMenu == null) {
      setDailyMenu(null);
      return;
    }
    (async () => {
      try {
        const menu = await dailyMenuService.getPublicDailyMenu(restaurantIdForDailyMenu);
        if (!cancelled) setDailyMenu(menu);
      } catch {
        if (!cancelled) setDailyMenu(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantIdForDailyMenu]);

  // ============================================================================
  // UTILITY
  // ============================================================================

  const buildCheckoutUrl = useCallback(
    (sessionId?: string): string => {
      const params: string[] = [];
      const effectiveRestaurantId =
        cart.restaurantId ?? (isSessionMode ? ctxSession?.restaurant : undefined);
      if (effectiveRestaurantId) params.push(`restaurantId=${effectiveRestaurantId}`);
      if (currentTableNumber || cart.tableNumber) {
        params.push(`tableNumber=${currentTableNumber || cart.tableNumber}`);
      }
      if (sessionId) params.push(`sessionId=${sessionId}`);

      const queryString = params.length > 0 ? `?${params.join('&')}` : '';
      const basePath = isAuthenticated ? '/order/checkout' : '/order/guest-checkout';
      return `${basePath}${queryString}`;
    },
    [cart.restaurantId, cart.tableNumber, currentTableNumber, isAuthenticated, isSessionMode, ctxSession],
  );

  const navigateToCheckout = useCallback(
    (sessionId?: string) => {
      const url = buildCheckoutUrl(sessionId);
      router.push(url as any);
    },
    [buildCheckoutUrl],
  );

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleQuantityChange = useCallback(
    async (itemId: string, newQuantity: number) => {
      try {
        setUpdatingItems((prev) => new Set(prev).add(itemId));
        if (isSessionMode) {
          await sessionCart.updateItem(itemId, { quantity: newQuantity });
        } else {
          await updateQuantity(itemId, newQuantity);
        }
        showSuccess(t('cart.feedback.quantityUpdated'));
      } catch (error) {
        showError(t('cart.errors.quantityUpdate'));
      } finally {
        setUpdatingItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      }
    },
    [isSessionMode, sessionCart, updateQuantity, showSuccess, showError, t],
  );

  const handleRemoveItem = useCallback((itemId: string) => {
    setItemToRemove(itemId);
  }, []);

  const confirmRemoveItem = useCallback(async () => {
    if (!itemToRemove) return;
    try {
      if (isSessionMode) {
        await sessionCart.removeItem(itemToRemove);
      } else {
        await removeFromCart(itemToRemove);
      }
      showSuccess(t('cart.feedback.itemRemoved'));
      setItemToRemove(null);
    } catch (error) {
      showError(t('cart.errors.itemRemove'));
    }
  }, [itemToRemove, isSessionMode, sessionCart, removeFromCart, showSuccess, showError, t]);

  const handleClearCart = useCallback(() => {
    setShowClearConfirmation(true);
  }, []);

  const confirmClearCart = useCallback(async () => {
    try {
      if (isSessionMode) {
        await sessionCart.clearMyItems();
      } else {
        await clearCart();
      }
      setShowClearConfirmation(false);
      showSuccess(t('cart.feedback.cleared'));
    } catch (error) {
      showError(t('cart.errors.cartClear'));
    }
  }, [isSessionMode, sessionCart, clearCart, showSuccess, showError, t]);

  const formulaStatusRef = useRef<ReturnType<typeof computeFormulaStatus>>({
    isFormula: false,
    totalCategories: 0,
    pickedCategories: 0,
    missingCategoryNames: [],
    hasFormulaItemsInCart: false,
    isValid: true,
    hasDuplicateCategoryPicks: false,
  });

  const handleCheckout = useCallback(async () => {
    const hasItems = isSessionMode ? sessionCart.items_count > 0 : cart.items.length > 0;

    if (!hasItems) {
      showError(t('cart.feedback.emptyOnCheckout'));
      return;
    }

    const status = formulaStatusRef.current;
    if (!status.isValid) {
      const msg = formatFormulaMissingMessage(status) ?? t('cart.formula.completeAction');
      showError(msg);
      return;
    }

    const effectiveRestaurantId =
      cart.restaurantId ?? (isSessionMode ? ctxSession?.restaurant : undefined);
    if (!effectiveRestaurantId) {
      showError(t('cart.feedback.restaurantNotFound'));
      return;
    }

    if (isSessionMode && isHost && ctxSessionId) {
      setShowSplitConfirmation(true);
      return;
    }

    try {
      setIsCreatingOrder(true);
      navigateToCheckout(isSessionMode ? ctxSessionId ?? undefined : undefined);
    } catch (error) {
      showError(t('cart.errors.checkout'));
    } finally {
      setIsCreatingOrder(false);
    }
  }, [
    isSessionMode,
    isHost,
    sessionCart.items_count,
    cart.items.length,
    cart.restaurantId,
    ctxSession,
    ctxSessionId,
    navigateToCheckout,
    showError,
    t,
  ]);

  const handlePlaceGroupOrder = useCallback(
    async (withSplit: boolean) => {
      if (!ctxSessionId) return;
      setShowSplitConfirmation(false);
      setIsCreatingOrder(true);

      try {
        const result = await collaborativeSessionService.placeGroupOrder(ctxSessionId, withSplit);

        if (withSplit) {
          showSuccess(t('cart.feedback.orderPlacedSplit'));
          router.push(`/order/split-payment?orderId=${result.order_id}` as any);
        } else {
          showSuccess(t('cart.feedback.orderPlaced'));
          router.push(`/order/payment?orderId=${result.order_id}` as any);
        }
      } catch (error: any) {
        console.error('Error placing group order:', error);
        const msg = error?.response?.data?.error || error?.message || t('cart.errors.groupOrder');
        showError(msg);
      } finally {
        setIsCreatingOrder(false);
      }
    },
    [ctxSessionId, showSuccess, showError, t],
  );

  // ============================================================================
  // MEMOIZED VALUES
  // ============================================================================

  const cartItems = useMemo(() => {
    if (isSessionMode) {
      return sessionCart.items.map((item) => ({
        id: item.id,
        name: item.menu_item_name,
        price: parseFloat(item.menu_item_price || '0'),
        quantity: item.quantity,
        image: item.menu_item_image,
        specialInstructions: item.special_instructions || undefined,
      }));
    }
    return cart.items || [];
  }, [isSessionMode, sessionCart.items, cart.items]);

  const itemCount = useMemo(
    () => (isSessionMode ? sessionCart.items_count : cart.itemCount || 0),
    [isSessionMode, sessionCart.items_count, cart.itemCount],
  );

  const totalAmount = useMemo(
    () => (isSessionMode ? sessionCart.total : cart.total || 0),
    [isSessionMode, sessionCart.total, cart.total],
  );

  const formulaCartLines = useMemo(() => {
    const lines: Array<{ menuItemId: number; quantity: number }> = [];
    if (isSessionMode) {
      sessionCart.items.forEach((it) => {
        const id = Number(it.menu_item);
        if (Number.isFinite(id) && it.quantity > 0) {
          lines.push({ menuItemId: id, quantity: it.quantity });
        }
      });
    } else {
      (cart.items ?? []).forEach((it: any) => {
        const id = Number(it.menuItemId);
        if (Number.isFinite(id) && it.quantity > 0) {
          lines.push({ menuItemId: id, quantity: it.quantity });
        }
      });
    }
    return lines;
  }, [isSessionMode, sessionCart.items, cart.items]);

  const formulaStatus = useMemo(
    () => computeFormulaStatus(dailyMenu, formulaCartLines),
    [dailyMenu, formulaCartLines],
  );

  formulaStatusRef.current = formulaStatus;

  const formulaWarningMessage = useMemo(
    () => formatFormulaMissingMessage(formulaStatus),
    [formulaStatus],
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  if (cartItems.length === 0) {
    return (
      <View style={local.container}>
        <Header
          title={t('cart.title')}
          leftIcon="arrow-back"
          onLeftPress={handleGoBack}
          showLanguageSwitcher
          showThemeSwitcher
        />
        <EmptyCart screenType={screenType} />
      </View>
    );
  }

  return (
    <View style={local.container}>
      <Header
        title={t('cart.titleWithCount', { count: itemCount })}
        leftIcon="arrow-back"
        onLeftPress={handleGoBack}
        rightIcon="trash-outline"
        onRightPress={handleClearCart}
        showLanguageSwitcher
        showThemeSwitcher
      />

      <ScrollView
        style={local.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.pb('xl')}
      >
        <RestaurantInfo
          restaurantName={cart.restaurantName || t('order.fallbackRestaurant')}
          tableNumber={currentTableNumber}
          itemCount={itemCount}
          hasActiveSession={isSessionMode}
          screenType={screenType}
        />

        {alertState && (
          <View style={[styles.mx('md'), styles.mt('md')]}>
            <Alert
              variant={alertState.variant}
              title={alertState.title}
              message={alertState.message}
            />
          </View>
        )}

        <View style={[local.itemsContainer, styles.px('md'), styles.pt('md')]}>
          {cartItems.map((item) => (
            <CartItemCard
              key={item.id}
              item={item}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemoveItem}
              screenType={screenType}
              isUpdating={updatingItems.has(item.id)}
            />
          ))}
        </View>
      </ScrollView>

      <CartSummary
        subtotal={totalAmount}
        itemCount={itemCount}
        isCreatingOrder={isCreatingOrder}
        onCheckout={handleCheckout}
        screenType={screenType}
        canCheckout={!isSessionMode || isHost}
        checkoutTitle={
          isSessionMode && isHost ? t('cart.checkoutForGroup') : t('cart.checkout')
        }
        formulaWarning={formulaWarningMessage}
      />

      {/* Confirmation : vider le panier */}
      {showClearConfirmation && (
        <View style={local.modalOverlay}>
          <View style={[local.modalContainer, styles.mx('md')]}>
            <AlertWithAction
              variant="warning"
              title={t('cart.clearConfirm.title')}
              message={t('cart.clearConfirm.message')}
              primaryButton={{
                text: t('cart.clearConfirm.cta'),
                onPress: confirmClearCart,
                variant: 'danger',
              }}
              secondaryButton={{
                text: t('common.cancel'),
                onPress: () => setShowClearConfirmation(false),
              }}
            />
          </View>
        </View>
      )}

      {/* Confirmation : retirer un article */}
      {itemToRemove && (
        <View style={local.modalOverlay}>
          <View style={[local.modalContainer, styles.mx('md')]}>
            <AlertWithAction
              variant="warning"
              title={t('cart.removeConfirm.title')}
              message={t('cart.removeConfirm.message')}
              primaryButton={{
                text: t('cart.removeConfirm.cta'),
                onPress: confirmRemoveItem,
                variant: 'danger',
              }}
              secondaryButton={{
                text: t('common.cancel'),
                onPress: () => setItemToRemove(null),
              }}
            />
          </View>
        </View>
      )}

      {/* Confirmation : diviser la note ? */}
      {showSplitConfirmation && (
        <View style={local.modalOverlay}>
          <View style={[local.modalContainer, styles.mx('md')]}>
            <AlertWithAction
              variant="info"
              title={t('cart.splitConfirm.title')}
              message={t('cart.splitConfirm.message')}
              showIcon
              primaryButton={{
                text: t('cart.splitConfirm.split'),
                onPress: () => handlePlaceGroupOrder(true),
                variant: 'primary',
              }}
              secondaryButton={{
                text: t('cart.splitConfirm.payAll'),
                onPress: () => handlePlaceGroupOrder(false),
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================

const makeLocalStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: { flex: 1 },

    // Restaurant Info
    restaurantCard: {
      ...shadows.card,
    },
    restaurantContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    restaurantIcon: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.variants.primary[50],
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.sm.mobile,
    },
    restaurantDetails: { flex: 1 },
    restaurantName: { marginBottom: 4 },
    restaurantMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: SPACING.sm.mobile,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: { marginLeft: 2 },
    sessionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      backgroundColor: colors.variants.primary[50],
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.success,
    },
    sessionBadgeText: {
      fontSize: 11,
      color: colors.success,
      marginLeft: 4,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },

    // Cart Items
    itemsContainer: {},
    cartItemCard: { position: 'relative' },
    updatingCard: { opacity: 0.7 },
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      // En dark, l'overlay doit être sombre lui aussi sinon ça crée un flash blanc
      backgroundColor: isDark ? 'rgba(15, 21, 40, 0.7)' : 'rgba(255, 255, 255, 0.8)',
      borderRadius: BORDER_RADIUS.md,
      zIndex: 1,
    },
    cartItemContent: {
      flexDirection: 'row',
    },
    itemImage: {
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.border.light,
    },
    itemDetails: { flex: 1 },
    itemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    itemName: {
      flex: 1,
      marginRight: SPACING.sm.mobile,
    },
    instructionsContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 4,
      backgroundColor: colors.variants.primary[50],
      padding: SPACING.xs.mobile,
      borderRadius: BORDER_RADIUS.sm,
    },
    instructions: {
      flex: 1,
      fontStyle: 'italic',
    },
    itemFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    quantityControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm.mobile,
    },
    quantityButton: {
      backgroundColor: colors.variants.secondary[100],
      borderRadius: BORDER_RADIUS.sm,
      padding: 8,
      minWidth: COMPONENT_CONSTANTS.minTouchTarget,
      minHeight: COMPONENT_CONSTANTS.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
    },
    quantityButtonAdd: {
      backgroundColor: colors.primary,
    },
    quantityText: {
      minWidth: 30,
      textAlign: 'center',
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    // Summary
    summaryContainer: {
      backgroundColor: colors.surface,
      padding: SPACING.md.mobile,
      borderTopWidth: 1,
      borderTopColor: colors.border.default,
      ...shadows.lg,
    },
    summaryContent: {
      marginBottom: SPACING.md.mobile,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border.default,
      marginVertical: SPACING.sm.mobile,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    },

    // Bandeau "formule incomplète"
    formulaBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.warning + '15',
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      borderRadius: BORDER_RADIUS.sm,
      padding: 10,
      marginTop: 8,
      marginBottom: 8,
    },
    formulaBannerTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.primary,
    },
    formulaBannerText: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 2,
    },

    // Empty Cart
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl.mobile,
    },
    emptyIconContainer: {
      width: 120,
      height: 120,
      borderRadius: BORDER_RADIUS['2xl'],
      backgroundColor: colors.border.light,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrButtonsContainer: {
      width: '100%',
      maxWidth: 400,
    },
    qrButtons: {
      width: '100%',
      backgroundColor: 'transparent',
    },

    // Modals
    modalOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: COMPONENT_CONSTANTS.zIndex.modal,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 400,
    },
  });
};