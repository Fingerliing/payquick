/**
 * Réservations — vue restaurateur.
 *
 * Onglet (restaurant)/reservations — restaurant courant via RestaurantContext
 * (wrapper RestaurantAutoSelector, même pattern que qrcodes.tsx / floor-plan.tsx).
 *
 * - Onglets À venir / Passées (GET /reservations/history/?period=…)
 * - Groupement par jour (Aujourd'hui, Demain, puis date longue)
 * - Recherche nom/téléphone (débouncée), filtre par statut
 * - Bandeau de statistiques sur l'ensemble filtré (avant pagination)
 * - Pagination "Charger plus" (30 par page)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/ui/Header';
import { Alert } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@/utils/designSystem';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import { RestaurantSwitcherModal } from '@/components/restaurant/RestaurantSwitcherModal';
import { reservationService } from '@/services/reservationService';
import type { Reservation, ReservationStatus } from '@/types/reservation';

const PAGE_SIZE = 30;

type Period = 'upcoming' | 'past';

const STATUS_FILTERS: Array<ReservationStatus | 'all'> = [
  'all',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
];

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

// =============================================================================
// CONTENU
// =============================================================================

function ReservationsScreenContent({
  restaurant,
}: {
  restaurant: NonNullable<ReturnType<typeof useRestaurant>['currentRestaurant']>;
}) {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { alerts, pushAlert, dismissAlert } = useAlerts();
  const { restaurants } = useRestaurant();

  // Sélection locale (même pattern que l'écran QR codes)
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number>(
    Number(restaurant.id),
  );
  const [showRestaurantPicker, setShowRestaurantPicker] = useState(false);
  const restaurantId = selectedRestaurantId;
  const selectedRestaurantData = useMemo(
    () =>
      restaurants?.find((r: any) => Number(r.id) === selectedRestaurantId) ??
      restaurant,
    [restaurant, restaurants, selectedRestaurantId],
  );

  const [period, setPeriod] = useState<Period>('upcoming');
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [items, setItems] = useState<Reservation[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    covers: number;
    no_shows: number;
    cancelled: number;
    with_pre_order: number;
  } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [actionTarget, setActionTarget] = useState<Reservation | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const requestId = useRef(0);

  // ── Recherche débouncée ───────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Chargement ────────────────────────────────────────────────────────
  const load = useCallback(
    async (refresh = false) => {
      const rid = ++requestId.current;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      try {
        const res = await reservationService.getHistory(restaurantId, {
          period,
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: search || undefined,
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (rid !== requestId.current) return; // réponse obsolète
        setItems(res.results);
        setStats(res.stats);
        setHasMore(res.has_more);
      } catch (e) {
        if (rid !== requestId.current) return;
        console.error('[Reservations] load error:', e);
        pushAlert('error', t('restaurantReservations.errors.load'));
      } finally {
        if (rid === requestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [period, pushAlert, restaurantId, search, statusFilter, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Refetch au retour sur l'onglet (une résa a pu arriver entre-temps)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const res = await reservationService.getHistory(restaurantId, {
        period,
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...res.results]);
      setHasMore(res.has_more);
    } catch {
      pushAlert('error', t('restaurantReservations.errors.load'));
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, items.length, period, pushAlert, restaurantId, search, statusFilter, t]);

  // ── Changement de statut (installés / terminée / non présenté) ────────
  const applyStatus = useCallback(
    async (r: Reservation, next: 'seated' | 'completed' | 'no_show' | 'confirmed') => {
      setIsUpdating(true);
      try {
        const updated = await reservationService.setStatus(r.id, next);
        setItems((prev) =>
          prev.map((item) => (item.id === r.id ? { ...item, ...updated } : item)),
        );
        setActionTarget(null);
        pushAlert('success', t(`restaurantReservations.actions.done.${next}`));
      } catch (e) {
        const data = (e as any)?.response?.data ?? (e as any)?.data ?? {};
        pushAlert(
          'error',
          data?.message || t('restaurantReservations.errors.status'),
        );
      } finally {
        setIsUpdating(false);
      }
    },
    [pushAlert, t],
  );

  // ── Groupement par jour ───────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of items) {
      const key = new Date(r.starts_at).toDateString();
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return Array.from(map.entries());
  }, [items]);

  const dayLabel = useCallback(
    (dateString: string): string => {
      const d = new Date(dateString);
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      if (d.toDateString() === today.toDateString()) {
        return t('reservation.today');
      }
      if (d.toDateString() === tomorrow.toDateString()) {
        return t('reservation.tomorrow');
      }
      return d.toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    },
    [i18n.language, t],
  );

  const statusColor = useCallback(
    (status: ReservationStatus): string => {
      switch (status) {
        case 'confirmed': return colors.success;
        case 'seated': return colors.info;
        case 'pending_payment': return colors.warning;
        case 'completed': return colors.text.secondary;
        case 'no_show': return colors.error;
        default: return colors.text.light;
      }
    },
    [colors],
  );

  // ── Styles ────────────────────────────────────────────────────────────
  const fs = useCallback(
    (token: keyof typeof TYPOGRAPHY.fontSize) =>
      getResponsiveValue(TYPOGRAPHY.fontSize[token], screenType),
    [screenType],
  );

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

  const { width: windowWidth } = useWindowDimensions();

  const layoutConfig = useMemo(
    () => ({
      containerPadding: getResponsiveValue(SPACING.container, screenType),
      maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
    }),
    [screenType],
  );

  // Grille de cartes : 1 colonne sur téléphone, 2 dès la tablette,
  // 3 en desktop large. Largeur calculée sur le conteneur réellement
  // disponible (borné par maxContentWidth) et arrondie à l'entier
  // inférieur -1px pour absorber l'arrondi sub-pixel Android.
  const grid = useMemo(() => {
    const available = Math.min(
      windowWidth,
      layoutConfig.maxContentWidth ?? windowWidth,
    );
    const columns = screenType === 'mobile' ? 1 : screenType === 'tablet' ? 2 : 3;
    const gap = getResponsiveValue(SPACING.sm, screenType);
    const inner = available - layoutConfig.containerPadding * 2;
    const width =
      columns === 1
        ? undefined
        : Math.floor((inner - gap * (columns - 1)) / columns) - 1;
    return { columns, gap, width };
  }, [layoutConfig, screenType, windowWidth]);

  const s = useMemo(
    () => ({
      container: { flex: 1, backgroundColor: colors.background } as const,
      content: {
        flex: 1,
        maxWidth: layoutConfig.maxContentWidth,
        alignSelf: 'center' as const,
        width: '100%' as const,
      },
      tabRow: {
        flexDirection: 'row' as const,
        gap: sp.sm,
        paddingHorizontal: layoutConfig.containerPadding,
        paddingTop: sp.sm,
      },
      tab: (active: boolean) => ({
        flex: 1,
        alignItems: 'center' as const,
        paddingVertical: sp.sm,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: active ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: active
          ? colors.primary
          : isDark
            ? 'rgba(212, 175, 55, 0.18)'
            : colors.border.light,
      }),
      tabText: (active: boolean) => ({
        fontSize: fs('sm'),
        fontWeight: '700' as const,
        color: active ? colors.text.inverse : colors.text.primary,
      }),
      // (restaurantSelector / restaurantLabel / restaurantName supprimés : le switch d'établissement est
      //  désormais porté par le <Header /> — leftIcon `swap-horizontal`.)
      // (styles picker* supprimés : la feuille de changement
      //  d'établissement est le composant partagé RestaurantSwitcherModal.)
      searchBox: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: sp.sm,
        marginHorizontal: layoutConfig.containerPadding,
        marginTop: sp.sm,
        paddingHorizontal: sp.md,
        paddingVertical: sp.sm,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border.light,
      },
      searchInput: {
        flex: 1,
        fontSize: fs('sm'),
        color: colors.text.primary,
        padding: 0,
      },
      chip: (active: boolean) => ({
        alignSelf: 'center' as const,
        justifyContent: 'center' as const,
        paddingHorizontal: sp.md,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: active ? colors.primary : colors.card,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border.light,
      }),
      chipText: (active: boolean) => ({
        fontSize: fs('xs'),
        fontWeight: '600' as const,
        color: active ? colors.text.inverse : colors.text.secondary,
      }),
      statsRow: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: sp.sm,
        paddingHorizontal: layoutConfig.containerPadding,
        paddingVertical: sp.sm,
      },
      statBox: {
        flexGrow: 1,
        flexBasis: (screenType === 'mobile' ? '22%' : 120) as DimensionValue,
        minWidth: 76,
        paddingVertical: sp.sm,
        paddingHorizontal: sp.sm,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: colors.card,
        alignItems: 'center' as const,
        ...shadows.card,
      },
      statValue: {
        fontSize: fs('lg'),
        fontWeight: '700' as const,
        color: colors.text.primary,
      },
      statLabel: {
        fontSize: fs('xs'),
        color: colors.text.secondary,
        textAlign: 'center' as const,
      },
      dayHeader: {
        fontSize: fs('sm'),
        fontWeight: '700' as const,
        color: isDark ? colors.text.golden : colors.text.primary,
        paddingHorizontal: layoutConfig.containerPadding,
        paddingTop: sp.md,
        paddingBottom: sp.xs,
        textTransform: 'capitalize' as const,
      },
      cardsWrap: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        gap: grid.gap,
        paddingHorizontal: layoutConfig.containerPadding,
      },
      card: {
        width: grid.width,
        flexGrow: grid.columns === 1 ? 1 : 0,
        backgroundColor: colors.card,
        borderRadius: BORDER_RADIUS.lg,
        padding: sp.md,
        marginBottom: sp.sm,
        gap: 4,
        ...shadows.card,
      },
      rowBetween: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        gap: sp.sm,
      },
      time: {
        fontSize: fs('md'),
        fontWeight: '700' as const,
        color: colors.text.primary,
      },
      name: {
        fontSize: fs('sm'),
        fontWeight: '600' as const,
        color: colors.text.primary,
        flex: 1,
      },
      detail: { fontSize: fs('sm'), color: colors.text.secondary },
      prepaid: {
        fontSize: fs('sm'),
        color: colors.success,
        fontWeight: '600' as const,
      },
      badge: (color: string) => ({
        paddingHorizontal: sp.sm,
        paddingVertical: 3,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: `${color}22`,
      }),
      badgeText: (color: string) => ({
        fontSize: fs('xs'),
        fontWeight: '600' as const,
        color,
      }),
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
      manageBtn: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: 6,
        marginTop: sp.xs,
        paddingVertical: sp.sm,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surface,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(212, 175, 55, 0.25)' : colors.border.light,
      },
      sheetOverlay: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end' as const,
        zIndex: 30,
      },
      sheet: {
        backgroundColor: colors.card,
        borderTopLeftRadius: BORDER_RADIUS.xl,
        borderTopRightRadius: BORDER_RADIUS.xl,
        padding: sp.lg,
        paddingBottom: insets.bottom + sp.lg,
        gap: sp.sm,
        maxWidth: layoutConfig.maxContentWidth,
        width: '100%' as const,
        alignSelf: 'center' as const,
      },
      sheetTitle: {
        fontSize: fs('md'),
        fontWeight: '700' as const,
        color: colors.text.primary,
        marginBottom: sp.xs,
      },
      sheetBtn: (tone: 'default' | 'danger') => ({
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: sp.sm,
        paddingVertical: sp.md,
        paddingHorizontal: sp.md,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor:
          tone === 'danger'
            ? `${colors.error}14`
            : isDark
              ? 'rgba(255,255,255,0.06)'
              : colors.surface,
        borderWidth: 1,
        borderColor:
          tone === 'danger'
            ? `${colors.error}55`
            : isDark
              ? 'rgba(212, 175, 55, 0.2)'
              : colors.border.light,
      }),
      sheetBtnText: (tone: 'default' | 'danger') => ({
        fontSize: fs('sm'),
        fontWeight: '600' as const,
        color: tone === 'danger' ? colors.error : colors.text.primary,
      }),
      moreBtn: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        gap: sp.sm,
        marginHorizontal: layoutConfig.containerPadding,
        marginTop: sp.sm,
        paddingVertical: sp.md,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border.light,
      },
    }),
    [colors, fs, grid, insets, isDark, layoutConfig, screenType, shadows, sp],
  );

  // ── Carte réservation ─────────────────────────────────────────────────
  const renderCard = (r: Reservation) => {
    const d = new Date(r.starts_at);
    const color = statusColor(r.status);
    return (
      <View key={r.id} style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.time}>
            {d.toLocaleTimeString(i18n.language, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <View style={s.badge(color)}>
            <Text style={s.badgeText(color)}>
              {t(`reservation.status.${r.status}`)}
            </Text>
          </View>
        </View>

        <View style={s.rowBetween}>
          <Text style={s.name} numberOfLines={1}>
            {r.customer_name}
          </Text>
          <Text style={s.detail}>
            {t('reservation.people', { count: r.party_size })}
          </Text>
        </View>

        <Text style={s.detail}>
          {r.table_number
            ? t('reservation.success.table', { table: r.table_number })
            : t('restaurantReservations.noTable')}
          {r.customer_phone ? ` · ${r.customer_phone}` : ''}
        </Text>

        {!!r.pre_order_total && (
          <Text style={s.prepaid}>
            ✓ {t('reservation.prepaid', { amount: `${Number(r.pre_order_total).toFixed(2)} €` })}
          </Text>
        )}

        {!!r.special_requests && (
          <Text style={[s.detail, { fontStyle: 'italic' }]} numberOfLines={2}>
            « {r.special_requests} »
          </Text>
        )}

        {r.status !== 'cancelled' && r.status !== 'expired' &&
          r.status !== 'pending_payment' && (
          <TouchableOpacity style={s.manageBtn} onPress={() => setActionTarget(r)}>
            <Ionicons name="swap-horizontal" size={16} color={colors.text.primary} />
            <Text
              style={{
                fontSize: fs('sm'),
                fontWeight: '600',
                color: colors.text.primary,
              }}
            >
              {t('restaurantReservations.actions.manage')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Rendu ─────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Sélecteur d'établissement porté par le Header (pattern menu.tsx) :
          icône gauche `swap-horizontal` + nom du restaurant en sous-titre.
          L'ancienne barre dans le corps de page est supprimée. */}
      <Header
        title={t('restaurantReservations.title')}
        subtitle={selectedRestaurantData?.name}
        leftIcon={restaurants && restaurants.length > 1 ? 'swap-horizontal' : undefined}
        onLeftPress={
          restaurants && restaurants.length > 1
            ? () => setShowRestaurantPicker(true)
            : undefined
        }
      />

      <View style={s.content}>
        {alerts.length > 0 && (
          <View
            style={{
              paddingHorizontal: layoutConfig.containerPadding,
              paddingTop: sp.sm,
              gap: sp.xs,
            }}
          >
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

        {/* Onglets À venir / Passées */}
        <View style={s.tabRow}>
          {(['upcoming', 'past'] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={s.tab(period === p)}
              onPress={() => setPeriod(p)}
            >
              <Text style={s.tabText(period === p)}>
                {t(`restaurantReservations.tabs.${p}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recherche */}
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={colors.text.secondary} />
          <TextInput
            style={s.searchInput}
            placeholder={t('restaurantReservations.searchPlaceholder')}
            placeholderTextColor={colors.text.light}
            value={searchInput}
            onChangeText={setSearchInput}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {!!searchInput && (
            <TouchableOpacity onPress={() => setSearchInput('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.text.light} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filtres de statut */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            alignItems: 'center',
            paddingHorizontal: layoutConfig.containerPadding,
            paddingTop: sp.sm,
            gap: sp.sm,
          }}
          style={{ flexGrow: 0, flexShrink: 0 }}
        >
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={s.chip(statusFilter === f)}
              onPress={() => setStatusFilter(f)}
            >
              <Text style={s.chipText(statusFilter === f)}>
                {f === 'all'
                  ? t('restaurantReservations.filters.all')
                  : t(`reservation.status.${f}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isLoading ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={colors.primary} />
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
            {/* Statistiques */}
            {!!stats && stats.total > 0 && (
              <View style={s.statsRow}>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{stats.total}</Text>
                  <Text style={s.statLabel}>
                    {t('restaurantReservations.stats.total')}
                  </Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{stats.covers}</Text>
                  <Text style={s.statLabel}>
                    {t('restaurantReservations.stats.covers')}
                  </Text>
                </View>
                <View style={s.statBox}>
                  <Text style={[s.statValue, { color: colors.success }]}>
                    {stats.with_pre_order}
                  </Text>
                  <Text style={s.statLabel}>
                    {t('restaurantReservations.stats.preOrders')}
                  </Text>
                </View>
                {period === 'past' && (
                  <View style={s.statBox}>
                    <Text style={[s.statValue, { color: colors.error }]}>
                      {stats.no_shows}
                    </Text>
                    <Text style={s.statLabel}>
                      {t('restaurantReservations.stats.noShows')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {items.length === 0 ? (
              <View style={[s.centerBox, { paddingTop: sp.xl * 2 }]}>
                <Ionicons name="calendar-outline" size={48} color={colors.text.light} />
                <Text style={s.emptyTitle}>
                  {t(`restaurantReservations.empty.${period}`)}
                </Text>
                <Text style={s.hint}>
                  {search || statusFilter !== 'all'
                    ? t('restaurantReservations.empty.filtered')
                    : t('restaurantReservations.empty.hint')}
                </Text>
              </View>
            ) : (
              <>
                {groups.map(([day, dayItems]) => (
                  <View key={day}>
                    <Text style={s.dayHeader}>{dayLabel(day)}</Text>
                    <View style={s.cardsWrap}>{dayItems.map(renderCard)}</View>
                  </View>
                ))}

                {hasMore && (
                  <TouchableOpacity
                    style={s.moreBtn}
                    onPress={loadMore}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name="chevron-down"
                          size={18}
                          color={colors.text.primary}
                        />
                        <Text
                          style={{
                            fontSize: fs('sm'),
                            fontWeight: '600',
                            color: colors.text.primary,
                          }}
                        >
                          {t('restaurantReservations.loadMore')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* Sélecteur de restaurant (overlay inline : suit le thème) */}
      {/* Feuille de changement d'établissement : composant partagé, ouvert
          depuis l'icône gauche du <Header />. */}
      <RestaurantSwitcherModal
        restaurants={restaurants ?? []}
        currentRestaurantId={selectedRestaurantId}
        onSelect={(id) => setSelectedRestaurantId(Number(id))}
        title={t('restaurantReservations.restaurantPicker')}
        visible={showRestaurantPicker}
        onClose={() => setShowRestaurantPicker(false)}
      />

      {/* Feuille : changer le statut d'une réservation */}
      {actionTarget && (
        <Pressable style={s.sheetOverlay} onPress={() => setActionTarget(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
              <Text style={s.sheetTitle}>
                {actionTarget.customer_name} ·{' '}
                {new Date(actionTarget.starts_at).toLocaleTimeString(i18n.language, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>

              {([
                { key: 'seated', icon: 'people', tone: 'default' },
                { key: 'completed', icon: 'checkmark-done', tone: 'default' },
                { key: 'no_show', icon: 'close-circle', tone: 'danger' },
                { key: 'confirmed', icon: 'refresh', tone: 'default' },
              ] as const)
                .filter((a) => a.key !== actionTarget.status)
                .map((a) => (
                  <TouchableOpacity
                    key={a.key}
                    style={s.sheetBtn(a.tone)}
                    onPress={() => applyStatus(actionTarget, a.key)}
                    disabled={isUpdating}
                  >
                    <Ionicons
                      name={a.icon}
                      size={20}
                      color={a.tone === 'danger' ? colors.error : colors.text.primary}
                    />
                    <Text style={s.sheetBtnText(a.tone)}>
                      {t(`restaurantReservations.actions.${a.key}`)}
                    </Text>
                  </TouchableOpacity>
                ))}

            {isUpdating && <ActivityIndicator color={colors.primary} />}
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

// =============================================================================
// WRAPPER avec sélection automatique du restaurant
// =============================================================================
export default function ReservationsScreen() {
  const { t } = useTranslation();
  const { currentRestaurant } = useRestaurant();
  // Abonne le WRAPPER au thème : sans ça, ce composant ne se re-rend pas au
  // changement de mode, l'élément <ReservationsScreenContent> reste la même
  // référence, et React peut court-circuiter le rendu de tout le sous-arbre.
  const { isDark } = useAppTheme();

  return (
    <RestaurantAutoSelector
      noRestaurantMessage={t('restaurantDailyMenu.noRestaurantMessage')}
      createButtonText={t('restaurantDailyMenu.createRestaurant')}
      onRestaurantSelected={(_restaurantId) => {
        /* noop */
      }}
    >
      {currentRestaurant && (
        <ReservationsScreenContent
          key={isDark ? 'dark' : 'light'}
          restaurant={currentRestaurant}
        />
      )}
    </RestaurantAutoSelector>
  );
}