/**
 * Mes réservations — liste, annulation, check-in.
 *
 * Route : /reservation/mine
 *
 * - Réservations à venir en premier, puis historique
 * - Check-in disponible dans la fenêtre ±30 min autour de l'heure de résa
 * - Annulation : message adapté selon l'éligibilité au remboursement
 *   (is_refundable calculé par le backend)
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@/utils/designSystem';
import { Alert, AlertWithAction } from '@/components/ui/Alert';
import { reservationService } from '@/services/reservationService';
import type { Reservation, ReservationStatus } from '@/types/reservation';

const CHECKIN_WINDOW_MS = 30 * 60 * 1000;


// ── Alertes bannières (pattern useAlerts maison) ─────────────────────────
interface AlertItem {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const pushAlert = useCallback(
    (variant: AlertItem['variant'], message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts((prev) => [{ id, variant, message }, ...prev]);
    },
    [],
  );
  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);
  return { alerts, pushAlert, dismissAlert };
};

const formatPrice = (amount: string): string =>
  `${Number(amount).toFixed(2)} €`;

export default function MyReservationsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();

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

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { alerts, pushAlert, dismissAlert } = useAlerts();
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    try {
      const data = await reservationService.getMine();
      setReservations(data);
    } catch (e) {
      console.error('[MyReservations] load error:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // ── Helpers ───────────────────────────────────────────────────────────

  const statusColor = useCallback(
    (status: ReservationStatus): string => {
      switch (status) {
        case 'confirmed': return colors.success;
        case 'seated': return colors.info;
        case 'pending_payment': return colors.warning;
        case 'completed': return colors.text.secondary;
        default: return colors.text.light;
      }
    },
    [colors],
  );

  const canCheckIn = useCallback((r: Reservation): boolean => {
    if (r.status !== 'confirmed') return false;
    const delta = new Date(r.starts_at).getTime() - Date.now();
    return Math.abs(delta) <= CHECKIN_WINDOW_MS;
  }, []);

  const isUpcoming = (r: Reservation): boolean =>
    (r.status === 'confirmed' || r.status === 'seated' || r.status === 'pending_payment') &&
    new Date(r.ends_at).getTime() > Date.now();

  const { upcoming, past } = useMemo(() => {
    const up = reservations.filter(isUpcoming);
    const pa = reservations.filter((r) => !isUpcoming(r));
    return { upcoming: up, past: pa };
  }, [reservations]);

  // ── Actions ───────────────────────────────────────────────────────────

  const handleCheckIn = useCallback(
    async (r: Reservation) => {
      setBusyId(r.id);
      try {
        const res = await reservationService.checkIn(r.id);
        pushAlert(
          'success',
          t('reservation.checkInSuccess', { table: res.table_number ?? r.table_number }),
        );
        load();
      } catch (e) {
        const data = (e as any)?.response?.data ?? (e as any)?.data ?? {};
        pushAlert(
          'error',
          data?.error === 'outside_checkin_window'
            ? t('reservation.errors.outsideWindow')
            : t('floorPlan.errors.action', 'Réessayez'),
        );
      } finally {
        setBusyId(null);
      }
    },
    [load, pushAlert, t],
  );

  const handleCancel = useCallback((r: Reservation) => {
    setCancelTarget(r);
  }, []);

  const confirmCancel = useCallback(async () => {
    const r = cancelTarget;
    if (!r) return;
    setCancelTarget(null);
    setBusyId(r.id);
    try {
      await reservationService.cancel(r.id);
      pushAlert('success', t('reservation.cancelled'));
      load();
    } catch {
      pushAlert('error', t('reservation.errors.create'));
    } finally {
      setBusyId(null);
    }
  }, [cancelTarget, load, pushAlert, t]);

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
      sectionLabel: {
        fontSize: fs('sm'),
        fontWeight: '600' as const,
        color: colors.text.secondary,
        marginTop: sp.lg,
        marginBottom: sp.sm,
        paddingHorizontal: sp.md,
      },
      card: {
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.lg,
        padding: sp.md,
        marginHorizontal: sp.md,
        marginBottom: sp.sm,
        gap: 4,
        ...shadows.card,
      },
      rowBetween: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
      },
      restaurantName: {
        fontSize: fs('md'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        flex: 1,
      },
      statusBadge: (color: string) => ({
        paddingHorizontal: sp.sm,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: `${color}22`,
      }),
      statusText: (color: string) => ({
        fontSize: fs('xs'),
        fontWeight: '600' as const,
        color,
      }),
      detail: { fontSize: fs('sm'), color: colors.text.secondary },
      prepaid: { fontSize: fs('sm'), color: colors.success, fontWeight: '600' as const },
      actionRow: {
        flexDirection: 'row' as const,
        gap: sp.sm,
        marginTop: sp.sm,
      },
      checkInBtn: {
        flex: 1,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: 6,
        paddingVertical: sp.sm + 2,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: colors.primary,
      },
      cancelBtn: {
        paddingVertical: sp.sm + 2,
        paddingHorizontal: sp.md,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: `${colors.error}14`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
      centerBox: {
        flex: 1,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        padding: sp.xl,
        gap: sp.md,
      },
      emptyTitle: {
        fontSize: fs('lg'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        textAlign: 'center' as const,
      },
      hint: {
        fontSize: fs('sm'),
        color: colors.text.secondary,
        textAlign: 'center' as const,
      },
      ctaBtn: {
        paddingVertical: sp.md,
        paddingHorizontal: sp.lg,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: colors.primary,
      },
    }),
    [colors, fs, insets, shadows, sp],
  );

  // ── Carte réservation ─────────────────────────────────────────────────

  const renderCard = (r: Reservation) => {
    const d = new Date(r.starts_at);
    const color = statusColor(r.status);
    const busy = busyId === r.id;
    const cancellable = r.status === 'confirmed' || r.status === 'pending_payment';

    return (
      <View key={r.id} style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.restaurantName} numberOfLines={1}>
            {r.restaurant_name}
          </Text>
          <View style={s.statusBadge(color)}>
            <Text style={s.statusText(color)}>
              {t(`reservation.status.${r.status}`)}
            </Text>
          </View>
        </View>

        <Text style={s.detail}>
          {d.toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}{' '}
          ·{' '}
          {d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}{' '}
          · {t('reservation.people', { count: r.party_size })}
        </Text>
        {r.table_number && (
          <Text style={s.detail}>
            {t('reservation.success.table', { table: r.table_number })}
          </Text>
        )}
        {r.pre_order_total && (
          <Text style={s.prepaid}>
            ✓ {t('reservation.prepaid', { amount: formatPrice(r.pre_order_total) })}
          </Text>
        )}

        {(canCheckIn(r) || cancellable) && (
          <View style={s.actionRow}>
            {canCheckIn(r) && (
              <TouchableOpacity
                style={s.checkInBtn}
                onPress={() => handleCheckIn(r)}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.text.inverse} size="small" />
                ) : (
                  <>
                    <Ionicons name="location" size={18} color={colors.text.inverse} />
                    <Text style={{ color: colors.text.inverse, fontWeight: '700', fontSize: fs('sm') }}>
                      {t('reservation.checkIn')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            {cancellable && (
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => handleCancel(r)}
                disabled={busy}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── Rendu ─────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>{t('reservation.myTitle')}</Text>
      </View>

      {alerts.length > 0 && (
        <View style={{ paddingHorizontal: sp.md, paddingTop: sp.sm, gap: sp.xs }}>
          {alerts.map((a) => (
            <Alert
              key={a.id}
              variant={a.variant}
              message={a.message}
              autoDismiss
              autoDismissDuration={4000}
              onDismiss={() => dismissAlert(a.id)}
            />
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : reservations.length === 0 ? (
        <View style={s.centerBox}>
          <Ionicons name="calendar-outline" size={48} color={colors.text.light} />
          <Text style={s.emptyTitle}>{t('reservation.empty.title')}</Text>
          <Text style={s.hint}>{t('reservation.empty.subtitle')}</Text>
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => router.push('/restaurant/directory' as any)}
          >
            <Text style={{ color: colors.text.inverse, fontWeight: '700' }}>
              {t('reservation.empty.cta')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => load(true)}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + sp.xl }}
        >
          {upcoming.length > 0 && upcoming.map(renderCard)}
          {past.length > 0 && (
            <>
              <Text style={s.sectionLabel}>{t('order.history', 'Historique')}</Text>
              {past.map(renderCard)}
            </>
          )}
        </ScrollView>
      )}

      {/* Confirmation d'annulation (AlertWithAction) */}
      {cancelTarget && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setCancelTarget(null)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.5)',
              justifyContent: 'center',
              paddingHorizontal: sp.lg,
            }}
            onPress={() => setCancelTarget(null)}
          >
            <Pressable onPress={() => {}}>
              <AlertWithAction
                variant="warning"
                title={t('reservation.cancelConfirmTitle')}
                message={
                  cancelTarget.pre_order_id
                    ? cancelTarget.is_refundable
                      ? t('reservation.cancelRefund')
                      : t('reservation.cancelNoRefund')
                    : t('reservation.cancelConfirmTitle')
                }
                primaryButton={{
                  text: t('reservation.cancelAction'),
                  variant: 'danger',
                  onPress: confirmCancel,
                }}
                secondaryButton={{
                  text: t('common.back'),
                  onPress: () => setCancelTarget(null),
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}