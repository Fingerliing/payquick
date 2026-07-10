/**
 * Paiement de pré-commande de réservation — 100% obligatoire.
 *
 * Route : /reservation/pre-order-checkout?reservationId=<uuid>
 *
 * ⚠️ N'utilise PAS le flux /order/payment : celui-ci crée son propre
 * PaymentIntent sans reservation_id en metadata, ce qui retarderait la
 * confirmation de la réservation (rattrapage Celery jusqu'à 15 min).
 * Ici : POST /reservations/{id}/pre_order/ retourne le client_secret d'un
 * intent portant order_id + reservation_id → le webhook confirme la
 * réservation instantanément.
 *
 * Le créneau est bloqué RESERVATION_PAYMENT_HOLD_MINUTES (15 min) —
 * compte à rebours affiché, écran d'expiration au-delà.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStripe } from '@stripe/stripe-react-native';

import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@/utils/designSystem';
import { useCart } from '@/contexts/CartContext';
import { reservationService } from '@/services/reservationService';
import {
  clearPreOrderSession,
  getActivePreOrderSession,
  PreOrderSession,
} from '@/utils/preOrderSession';
import type { PreOrderPayload } from '@/types/reservation';

const formatPrice = (amount: number | string): string =>
  `${Number(amount).toFixed(2)} €`;

const extractApiError = (e: any): any =>
  e?.response?.data ?? e?.data ?? e?.body ?? e ?? {};

export default function PreOrderCheckoutScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { cart, clearCart } = useCart();

  // SPACING est responsive ({mobile, tablet, desktop}) → résolution unique
  const sp = useMemo(
    () => ({
      xs: getResponsiveValue(SPACING.xs, screenType),
      sm: getResponsiveValue(SPACING.sm, screenType),
      md: getResponsiveValue(SPACING.md, screenType),
      lg: getResponsiveValue(SPACING.lg, screenType),
      xl: getResponsiveValue(SPACING.xl, screenType),
    }),
    [screenType],
  );

  const params = useLocalSearchParams<{ reservationId: string }>();
  const reservationId = params.reservationId;

  const [session, setSession] = useState<PreOrderSession | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  // Le POST /pre_order/ est à usage unique : on garde le client_secret pour
  // permettre un retry du PaymentSheet sans recréer la commande.
  const paymentRef = useRef<{ clientSecret: string; amount: string } | null>(null);

  // ── Session + compte à rebours ────────────────────────────────────────
  useEffect(() => {
    getActivePreOrderSession().then((s) => {
      if (!s || s.reservationId !== reservationId) {
        setIsExpired(true);
        return;
      }
      setSession(s);
    });
  }, [reservationId]);

  useEffect(() => {
    if (!session?.expiresAt || isDone) return;
    const tick = () => {
      const remaining = Math.floor(
        (new Date(session.expiresAt!).getTime() - Date.now()) / 1000,
      );
      setRemainingSec(remaining);
      if (remaining <= 0) setIsExpired(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session, isDone]);

  // ── Payload depuis le panier ──────────────────────────────────────────
  const buildPayload = useCallback((): PreOrderPayload => {
    const items: PreOrderPayload['items'] = [];
    const formules: NonNullable<PreOrderPayload['formules']> = [];

    for (const item of cart.items) {
      const formuleData = (item as any).formule;
      if (formuleData) {
        formules.push({ ...formuleData, quantity: item.quantity });
      } else {
        const menuItemId = parseInt(item.id, 10);
        if (isNaN(menuItemId)) continue;
        items.push({
          menu_item: menuItemId,
          quantity: item.quantity,
          special_instructions: (item as any).specialInstructions || '',
        });
      }
    }
    return { items, formules };
  }, [cart.items]);

  // ── Paiement ──────────────────────────────────────────────────────────
  const pay = useCallback(async () => {
    if (!reservationId || cart.items.length === 0) return;
    setIsPaying(true);
    try {
      // 1. Créer la pré-commande (une seule fois — retry réutilise l'intent)
      if (!paymentRef.current) {
        const res = await reservationService.createPreOrder(
          reservationId,
          buildPayload(),
        );
        paymentRef.current = {
          clientSecret: res.client_secret,
          amount: res.amount,
        };
      }

      // 2. PaymentSheet — mêmes conventions que /order/payment
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: cart.restaurantName || 'EatQuickeR',
        paymentIntentClientSecret: paymentRef.current.clientSecret,
        allowsDelayedPaymentMethods: false,
        applePay: { merchantCountryCode: 'FR' },
        googlePay: { merchantCountryCode: 'FR', testEnv: false },
        appearance: {
          colors: {
            primary: colors.primary,
            background: colors.surface,
            componentBackground: colors.background,
            primaryText: colors.text.primary,
          },
          shapes: { borderRadius: 12, borderWidth: 1 },
        },
      });
      if (initError) throw initError;

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code === 'Canceled') return; // fermeture volontaire
        throw presentError;
      }

      // 3. Succès — le webhook confirme la réservation côté backend
      await clearCart();
      await clearPreOrderSession();
      setIsDone(true);
    } catch (e) {
      const data = extractApiError(e);
      if (data?.error === 'reservation_expired') {
        setIsExpired(true);
      } else {
        console.error('[PreOrderCheckout] payment error:', e);
        Alert.alert(t('common.error', 'Erreur'), t('payment.initFailed', t('reservation.errors.create')));
      }
    } finally {
      setIsPaying(false);
    }
  }, [buildPayload, cart.items.length, cart.restaurantName, clearCart, colors, initPaymentSheet, presentPaymentSheet, reservationId, t]);

  // ── Styles ────────────────────────────────────────────────────────────
  const fs = useCallback(
    (token: keyof typeof TYPOGRAPHY.fontSize) =>
      getResponsiveValue(TYPOGRAPHY.fontSize[token], screenType),
    [screenType],
  );

  const s = useMemo(
    () => ({
      container: { flex: 1, backgroundColor: colors.background } as const,
      header: {
        paddingTop: insets.top + sp.sm,
        paddingHorizontal: sp.md,
        paddingBottom: sp.sm,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border.light,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: sp.sm,
      },
      title: {
        fontSize: fs('lg'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        flex: 1,
      },
      countdown: (urgent: boolean) => ({
        marginHorizontal: sp.md,
        marginTop: sp.md,
        padding: sp.sm,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: urgent ? `${colors.error}14` : `${colors.warning}14`,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: 6,
      }),
      card: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.lg,
        padding: sp.md,
        margin: sp.md,
        gap: sp.xs,
        ...shadows.card,
      },
      line: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
      },
      lineText: { fontSize: fs('sm'), color: colors.text.primary, flex: 1 },
      linePrice: { fontSize: fs('sm'), color: colors.text.secondary },
      totalText: {
        fontSize: fs('md'),
        fontWeight: '700' as const,
        color: colors.text.primary,
      },
      payBtn: (enabled: boolean) => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: sp.sm,
        marginHorizontal: sp.md,
        paddingVertical: sp.md,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: enabled ? colors.primary : colors.border.default,
      }),
      payText: {
        fontSize: fs('md'),
        fontWeight: '700' as const,
        color: colors.text.inverse,
      },
      centerBox: {
        flex: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: sp.xl,
        gap: sp.md,
      },
      bigIcon: (color: string) => ({
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: `${color}22`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      }),
      hint: {
        fontSize: fs('sm'),
        color: colors.text.secondary,
        textAlign: 'center' as const,
      },
      bigTitle: {
        fontSize: fs('xl'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        textAlign: 'center' as const,
      },
    }),
    [colors, fs, insets, shadows, sp],
  );

  // ── Écrans terminaux ──────────────────────────────────────────────────
  if (isDone) {
    return (
      <View style={[s.container, s.centerBox]}>
        <View style={s.bigIcon(colors.success)}>
          <Ionicons name="checkmark" size={48} color={colors.success} />
        </View>
        <Text style={s.bigTitle}>{t('reservation.preOrder.success')}</Text>
        <Text style={s.hint}>{t('reservation.preOrder.successHint')}</Text>
        <TouchableOpacity
          style={[s.payBtn(true), { alignSelf: 'stretch' }]}
          onPress={() => router.replace('/reservation/mine' as any)}
        >
          <Text style={s.payText}>{t('reservation.success.viewMine')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isExpired) {
    return (
      <View style={[s.container, s.centerBox]}>
        <View style={s.bigIcon(colors.error)}>
          <Ionicons name="time-outline" size={48} color={colors.error} />
        </View>
        <Text style={s.bigTitle}>{t('reservation.preOrder.expired')}</Text>
        <TouchableOpacity
          style={[s.payBtn(true), { alignSelf: 'stretch' }]}
          onPress={() => router.back()}
        >
          <Text style={s.payText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Rendu principal ───────────────────────────────────────────────────
  const minutes = remainingSec != null ? Math.max(0, Math.ceil(remainingSec / 60)) : null;
  const startsAt = session ? new Date(session.startsAt) : null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>{t('reservation.preOrder.checkoutTitle')}</Text>
      </View>

      {minutes != null && (
        <View style={s.countdown(minutes <= 5)}>
          <Ionicons
            name="time-outline"
            size={16}
            color={minutes <= 5 ? colors.error : colors.warning}
          />
          <Text style={[s.hint, { color: minutes <= 5 ? colors.error : colors.warning }]}>
            {t('reservation.preOrder.expiresIn', { minutes })}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + sp.xl }}>
        {startsAt && (
          <View style={s.card}>
            <Text style={s.lineText}>
              📅{' '}
              {startsAt.toLocaleDateString(i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              ·{' '}
              {startsAt.toLocaleTimeString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            {session?.tableNumber && (
              <Text style={s.hint}>
                {t('reservation.success.table', { table: session.tableNumber })}
              </Text>
            )}
          </View>
        )}

        <View style={s.card}>
          {cart.items.map((item) => (
            <View key={item.id} style={s.line}>
              <Text style={s.lineText} numberOfLines={1}>
                {item.quantity}× {item.name}
              </Text>
              <Text style={s.linePrice}>
                {formatPrice(item.price * item.quantity)}
              </Text>
            </View>
          ))}
          <View
            style={[
              s.line,
              {
                borderTopWidth: 1,
                borderTopColor: colors.border.light,
                paddingTop: sp.sm,
                marginTop: sp.xs,
              },
            ]}
          >
            <Text style={s.totalText}>{t('cart.total', 'Total')}</Text>
            <Text style={s.totalText}>{formatPrice(cart.total)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.payBtn(cart.items.length > 0 && !isPaying)}
          onPress={pay}
          disabled={cart.items.length === 0 || isPaying}
        >
          {isPaying ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <>
              <Ionicons name="card" size={20} color={colors.text.inverse} />
              <Text style={s.payText}>
                {t('reservation.preOrder.pay', { amount: formatPrice(cart.total) })}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}