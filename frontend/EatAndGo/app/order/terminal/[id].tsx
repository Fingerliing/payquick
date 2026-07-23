/**
 * Encaissement Tap to Pay (Stripe Terminal, reader intégré au téléphone).
 *
 * L'écran est monté APRÈS la création de la commande : la cuisine a déjà reçu
 * le bon. Un abandon ici ne perd donc rien — la commande retombe simplement en
 * « à encaisser » et reste disponible au comptoir.
 *
 * Le `StripeTerminalProvider` est monté localement plutôt que dans `_layout` :
 * le `tokenProvider` a besoin du restaurant courant, et l'initialisation du SDK
 * Terminal n'a aucune raison de tourner sur les écrans client.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';

import { useAuth } from '@/contexts/AuthContext';
import { orderService } from '@/services/orderService';
import { terminalService } from '@/services/terminalService';
import { useTapToPay, type TapToPayFailure } from '@/hooks/useTapToPay';
import type { OrderDetail } from '@/types/order';

import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Alert as InlineAlert } from '@/components/ui/Alert';
import { useAppTheme, BORDER_RADIUS, type AppColors } from '@/utils/designSystem';

const GOLD_FILL_LIGHT = '#D4AF37';
const GOLD_FILL_DARK = '#C9A227';
const INK_ON_GOLD = '#0C1219';

const formatAmount = (value: string | number | null | undefined): string => {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  return `${(isNaN(num) ? 0 : num).toFixed(2)} €`;
};

/** Échecs après lesquels retenter le même encaissement a du sens. */
const RETRYABLE: readonly TapToPayFailure[] = [
  'declined',
  'canceled',
  'timeout',
  'network',
  'intent',
  'connection',
  'unknown',
];

// =============================================================================
// CONTENU (sous le provider, pour avoir accès au contexte Terminal)
// =============================================================================

interface CheckoutProps {
  order: OrderDetail;
}

function TerminalCheckout({ order }: CheckoutProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { phase, failure, isBusy, prepare, collect, abort, reset } = useTapToPay({
    restaurantId: order.restaurant,
    orderId: order.id,
  });

  useEffect(() => {
    prepare();
  }, [prepare]);

  const leaveWithoutPaying = useCallback(() => {
    router.replace(`/order/${order.id}` as any);
  }, [order.id]);

  const switchToOnline = useCallback(() => {
    // Repli sans perte de commission : le flux en ligne passe par le même
    // PaymentIntent Connect, seul le canal change.
    router.replace(`/order/payment?orderId=${order.id}` as any);
  }, [order.id]);

  const canRetry = failure !== null && RETRYABLE.includes(failure);

  const bodyForPhase = () => {
    switch (phase) {
      case 'idle':
      case 'checking':
      case 'connecting':
        return (
          <View style={styles.stage}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stageTitle}>{t('terminal.connecting')}</Text>
            <Text style={styles.stageHint}>{t('terminal.connectingHint')}</Text>
          </View>
        );

      case 'unsupported':
        return (
          <View style={styles.stage}>
            <Ionicons name="phone-portrait-outline" size={56} color={colors.text.light} />
            <Text style={styles.stageTitle}>{t('terminal.unsupportedTitle')}</Text>
            <Text style={styles.stageHint}>{t('terminal.unsupportedMessage')}</Text>
          </View>
        );

      case 'ready':
        return (
          <View style={styles.stage}>
            <View style={styles.tapCircle}>
              <Ionicons name="wifi" size={48} color={isDark ? GOLD_FILL_DARK : GOLD_FILL_LIGHT} />
            </View>
            <Text style={styles.stageTitle}>{t('terminal.readyTitle')}</Text>
            <Text style={styles.stageHint}>{t('terminal.readyHint')}</Text>
          </View>
        );

      case 'creating':
        return (
          <View style={styles.stage}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stageTitle}>{t('terminal.preparing')}</Text>
          </View>
        );

      case 'collecting':
        return (
          <View style={styles.stage}>
            <View style={styles.tapCirclePulse}>
              <Ionicons name="card-outline" size={48} color="#FFFFFF" />
            </View>
            <Text style={styles.stageTitle}>{t('terminal.tapPrompt')}</Text>
            <Text style={styles.stageHint}>{t('terminal.tapHint')}</Text>
            <View style={styles.pinBox}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.text.secondary} />
              <Text style={styles.pinText}>{t('terminal.pinHint')}</Text>
            </View>
          </View>
        );

      case 'confirming':
        return (
          <View style={styles.stage}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stageTitle}>{t('terminal.confirming')}</Text>
            <Text style={styles.stageHint}>{t('terminal.confirmingHint')}</Text>
          </View>
        );

      case 'settling':
        return (
          <View style={styles.stage}>
            <Ionicons name="checkmark-circle" size={56} color={colors.success} />
            <Text style={styles.stageTitle}>{t('terminal.settlingTitle')}</Text>
            <Text style={styles.stageHint}>{t('terminal.settlingMessage')}</Text>
          </View>
        );

      case 'succeeded':
        return (
          <View style={styles.stage}>
            <Ionicons name="checkmark-circle" size={72} color={colors.success} />
            <Text style={styles.stageTitle}>{t('terminal.successTitle')}</Text>
            <Text style={styles.stageHint}>
              {t('terminal.successMessage', { amount: formatAmount(order.total_amount) })}
            </Text>
          </View>
        );

      case 'failed':
      default:
        return (
          <View style={styles.stage}>
            <Ionicons name="alert-circle-outline" size={56} color={colors.error} />
            <Text style={styles.stageTitle}>{t('terminal.failedTitle')}</Text>
            <Text style={styles.stageHint}>
              {t(`terminal.failure.${failure ?? 'unknown'}`)}
            </Text>
          </View>
        );
    }
  };

  const footerForPhase = () => {
    if (phase === 'succeeded' || phase === 'settling') {
      return (
        <Button
          title={t('terminal.backToOrder')}
          onPress={leaveWithoutPaying}
          style={styles.goldButton}
          textStyle={{ color: INK_ON_GOLD }}
        />
      );
    }

    if (phase === 'collecting') {
      return (
        <Button title={t('common.cancel')} variant="outline" onPress={abort} />
      );
    }

    if (phase === 'ready') {
      return (
        <>
          <Button
            title={t('terminal.startCollect')}
            onPress={collect}
            style={styles.goldButton}
            textStyle={{ color: INK_ON_GOLD }}
            leftIcon={<Ionicons name="wifi" size={18} color={INK_ON_GOLD} />}
          />
          <Pressable onPress={switchToOnline} style={styles.linkRow}>
            <Ionicons name="qr-code-outline" size={16} color={colors.primary} />
            <Text style={styles.linkText}>{t('terminal.fallbackAction')}</Text>
          </Pressable>
        </>
      );
    }

    if (phase === 'failed' || phase === 'unsupported') {
      return (
        <>
          {canRetry && (
            <Button
              title={t('common.retry')}
              onPress={() => {
                reset();
                collect();
              }}
              style={styles.goldButton}
              textStyle={{ color: INK_ON_GOLD }}
            />
          )}
          <Button
            title={t('terminal.fallbackAction')}
            variant="outline"
            onPress={switchToOnline}
          />
          <Pressable onPress={leaveWithoutPaying} style={styles.linkRow}>
            <Text style={styles.linkText}>{t('terminal.leaveUnpaid')}</Text>
          </Pressable>
        </>
      );
    }

    return null;
  };

  return (
    <View style={styles.page}>
      <Header
        title={t('terminal.title')}
        subtitle={t('takeOrder.tableLabel', { number: order.table_number ?? '—' })}
        includeSafeArea
        leftIcon="close"
        onLeftPress={isBusy ? undefined : leaveWithoutPaying}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>{t('payment.totalDue')}</Text>
          <Text style={styles.amountValue}>{formatAmount(order.total_amount)}</Text>
          <Text style={styles.amountMeta}>
            {t('payment.orderNumber')} {order.order_number}
          </Text>
        </View>

        {bodyForPhase()}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {footerForPhase()}
      </View>
    </View>
  );
}

// =============================================================================
// ÉCRAN
// =============================================================================

export default function TerminalScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { isRestaurateur } = useAuth();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Route à deux segments (`/order/terminal/42`) : `app/order/[id].tsx` ne
  // matche qu'un seul segment et ne peut donc structurellement pas l'avaler.
  // Un query param sur `/order/terminal` dépendait, lui, de la priorité du
  // routeur entre segment statique et segment dynamique.
  const params = useLocalSearchParams<{ id?: string }>();
  const parsedOrderId = /^\d+$/.test(params.id ?? '') ? Number(params.id) : NaN;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (isNaN(parsedOrderId)) {
        setLoadError(t('terminal.orderNotFound'));
        setLoading(false);
        return;
      }
      try {
        const data = await orderService.getOrderById(parsedOrderId);
        if (!cancelled) setOrder(data);
      } catch {
        if (!cancelled) setLoadError(t('terminal.orderNotFound'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [parsedOrderId, t]);

  const restaurantId = order?.restaurant;

  // Le SDK rappelle ce provider à chaque expiration de token : il doit rester
  // stable et ne jamais throw, sinon la session Terminal tombe en cours de
  // transaction.
  const tokenProvider = useCallback(async (): Promise<string> => {
    if (!restaurantId) return '';
    try {
      return await terminalService.fetchConnectionToken(restaurantId);
    } catch {
      return '';
    }
  }, [restaurantId]);

  if (!isRestaurateur) {
    return (
      <View style={styles.page}>
        <Header title={t('terminal.title')} includeSafeArea leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={64} color={colors.secondary} />
          <Text style={styles.centeredText}>{t('takeOrder.forbidden')}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.page}>
        <Header title={t('terminal.title')} includeSafeArea leftIcon="close" onLeftPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (loadError || !order) {
    return (
      <View style={styles.page}>
        <Header title={t('terminal.title')} includeSafeArea leftIcon="close" onLeftPress={() => router.back()} />
        <View style={styles.alertsWrap}>
          <InlineAlert variant="error" title={t('common.error')} message={loadError ?? t('terminal.orderNotFound')} />
        </View>
      </View>
    );
  }

  if (order.payment_status === 'paid') {
    return (
      <View style={styles.page}>
        <Header title={t('terminal.title')} includeSafeArea leftIcon="close" onLeftPress={() => router.back()} />
        <View style={styles.alertsWrap}>
          <InlineAlert variant="info" title={t('common.ok')} message={t('terminal.alreadyPaid')} />
        </View>
      </View>
    );
  }

  return (
    <StripeTerminalProvider tokenProvider={tokenProvider} logLevel="error">
      <TerminalCheckout order={order} />
    </StripeTerminalProvider>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const createStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },

    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    centeredText: { fontSize: 15, color: colors.text.secondary, textAlign: 'center' },
    alertsWrap: { padding: 16, gap: 8 },

    content: { padding: 16, gap: 20 },

    amountCard: {
      alignItems: 'center',
      gap: 4,
      paddingVertical: 20,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    amountLabel: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
    amountValue: { fontSize: 36, fontWeight: '800', color: colors.text.primary },
    amountMeta: { fontSize: 12, color: colors.text.light },

    stage: { alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 8 },
    stageTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
    },
    stageHint: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.secondary,
      textAlign: 'center',
    },

    tapCircle: {
      width: 112,
      height: 112,
      borderRadius: 56,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: isDark ? GOLD_FILL_DARK : GOLD_FILL_LIGHT,
      transform: [{ rotate: '90deg' }],
    },
    tapCirclePulse: {
      width: 132,
      height: 132,
      borderRadius: 66,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      elevation: 6,
      shadowColor: colors.shadow.default,
      shadowOpacity: isDark ? 0.5 : 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },

    pinBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    pinText: { flex: 1, fontSize: 12, color: colors.text.secondary },

    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
      backgroundColor: colors.background,
    },
    goldButton: { backgroundColor: isDark ? GOLD_FILL_DARK : GOLD_FILL_LIGHT },

    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
    },
    linkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  });