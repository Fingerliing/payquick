import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Loading } from '@/components/ui/Loading';
import { Alert as InlineAlert } from '@/components/ui/Alert';
import { Header } from '@/components/ui/Header';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import { useRestaurant } from '@/contexts/RestaurantContext';

import { RestaurantStatistics } from '@/types/restaurant-statistics';
import type { Restaurant } from '@/types/restaurant';
import { restaurantService } from '@/services/restaurantService';

import {
  useAppTheme,
  makeShadows,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

// ════════════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════════════

interface PeriodOption {
  value: number;
  key: string;          // clé i18n pour le label
  deltaKey: string;     // clé i18n pour la pill delta
}

// Les périodes sont définies avec leurs CLÉS i18n, pas leurs labels traduits.
// La traduction est résolue à l'usage via `t()` pour rester réactif au
// changement de langue sans avoir à recréer le tableau.
const PERIODS: PeriodOption[] = [
  { value: 7,   key: 'thisWeek',     deltaKey: 'vsPrevWeek' },
  { value: 30,  key: 'thisMonth',    deltaKey: 'vsPrevMonth' },
  { value: 90,  key: 'last3Months',  deltaKey: 'vsPrev3Months' },
  { value: 180, key: 'last6Months',  deltaKey: 'vsPrev6Months' },
  { value: 365, key: 'thisYear',     deltaKey: 'vsPrevYear' },
];

// L'API renvoie les jours en français (clés stables côté backend) — on garde
// cet ordre pour matcher la réponse, et on traduit uniquement pour l'affichage.
const DAY_ORDER_API_KEYS = [
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche',
] as const;

// Mapping clé API → clé i18n
const API_TO_I18N_DAY: Record<string, string> = {
  Lundi: 'monday',
  Mardi: 'tuesday',
  Mercredi: 'wednesday',
  Jeudi: 'thursday',
  Vendredi: 'friday',
  Samedi: 'saturday',
  Dimanche: 'sunday',
};

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

const formatCurrency = (value: number, lang: string, decimals = 0): string => {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safe);
  } catch {
    return `${safe.toFixed(decimals)} €`;
  }
};

const formatNumberLocale = (value: number, lang: string): string => {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(lang).format(safe);
  } catch {
    return String(safe);
  }
};

/** Calcule un pourcentage d'évolution entre deux valeurs. Renvoie null si non calculable. */
const computeDelta = (current: number, previous: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return ((current - previous) / previous) * 100;
};

/** Emoji par défaut basé sur le nom du plat (fallback si pas d'image). */
function inferDishEmoji(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('steak') || n.includes('boeuf') || n.includes('bœuf') || n.includes('entrec') || n.includes('beef')) return '🥩';
  if (n.includes('frites') || n.includes('frite') || n.includes('fries')) return '🍟';
  if (n.includes('risotto') || n.includes('pasta') || n.includes('pâte') || n.includes('pate')) return '🍝';
  if (n.includes('tarte') || n.includes('gâteau') || n.includes('gateau') || n.includes('cake') || n.includes('pie')) return '🥧';
  if (n.includes('crème') || n.includes('creme') || n.includes('brûlée') || n.includes('brulee')) return '🍮';
  if (n.includes('salade') || n.includes('césar') || n.includes('cesar') || n.includes('salad')) return '🥗';
  if (n.includes('canard') || n.includes('magret') || n.includes('volaille') || n.includes('poulet') || n.includes('chicken') || n.includes('duck')) return '🍗';
  if (n.includes('poisson') || n.includes('saumon') || n.includes('thon') || n.includes('cabillaud') || n.includes('fish') || n.includes('salmon')) return '🐟';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('burger')) return '🍔';
  if (n.includes('foie')) return '🥖';
  if (n.includes('soupe') || n.includes('velout') || n.includes('soup')) return '🍲';
  if (n.includes('moules') || n.includes('huîtres') || n.includes('huitres') || n.includes('oyster') || n.includes('mussels')) return '🦪';
  if (n.includes('tartare')) return '🥩';
  if (n.includes('vin') || n.includes('cocktail') || n.includes('wine')) return '🍷';
  if (n.includes('café') || n.includes('cafe') || n.includes('coffee')) return '☕';
  return '🍽️';
}

/** Couleur pastel dérivée du rang (1=or, 2=argent, 3=bronze, 4+=neutre). Stable. */
function getRankStyle(rank: number, colors: AppColors): { bg: string; fg: string } {
  if (rank === 1) return { bg: '#F59E0B', fg: '#FFFFFF' };
  if (rank === 2) return { bg: '#94A3B8', fg: '#FFFFFF' };
  if (rank === 3) return { bg: '#B45309', fg: '#FFFFFF' };
  return { bg: colors.border.default, fg: colors.text.secondary };
}

// ════════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ════════════════════════════════════════════════════════════════════════════

/** ---------------------------------------------------------------------- */
/** Bandeau navy haut avec titre + sélecteur de période                     */
/** ---------------------------------------------------------------------- */

interface StatsBannerProps {
  selectedPeriod: PeriodOption;
  onSelectPeriod: (period: PeriodOption) => void;
}

const StatsBanner: React.FC<StatsBannerProps> = ({ selectedPeriod, onSelectPeriod }) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const styles = useMemo(() => makeBannerStyles(colors, isDark), [colors, isDark]);

  const selectedLabel = t(`restaurantStats.periods.${selectedPeriod.key}`);

  return (
    <>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            {t('restaurantStats.title', { period: selectedLabel })}
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.pickerButton, pressed && { opacity: 0.85 }]}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
          >
            <Ionicons name="calendar-outline" size={14} color="#FFFFFF" />
            <Text style={styles.pickerLabel}>{selectedLabel}</Text>
            <Ionicons name="chevron-down" size={14} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, { marginTop: insets.top + 60 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {t('restaurantStats.pickerTitle')}
            </Text>
            <FlatList
              data={PERIODS}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => {
                const isActive = item.value === selectedPeriod.value;
                return (
                  <Pressable
                    onPress={() => {
                      onSelectPeriod(item);
                      setPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalRow,
                      isActive && styles.modalRowActive,
                      pressed && { backgroundColor: colors.background },
                    ]}
                    android_ripple={{ color: colors.primary + '15' }}
                  >
                    <Text
                      style={[styles.modalRowText, isActive && styles.modalRowTextActive]}
                    >
                      {t(`restaurantStats.periods.${item.key}`)}
                    </Text>
                    {isActive && (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

/** ---------------------------------------------------------------------- */
/** Card KPI : valeur + delta pastille                                     */
/** ---------------------------------------------------------------------- */

interface KpiCardProps {
  label: string;
  value: string;
  delta: number | null;
  deltaLabel: string;
  isCurrency?: boolean;
  currencyDelta?: number;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  delta,
  deltaLabel,
  isCurrency,
  currencyDelta = 0,
}) => {
  const { colors, isDark } = useAppTheme();
  const { i18n } = useTranslation();
  const styles = useMemo(() => makeKpiStyles(colors, isDark), [colors, isDark]);

  let pillContent: React.ReactNode = null;
  if (delta !== null) {
    const isPositive = delta > 0;
    const isNegative = delta < 0;
    // Pastels saturés stables : restent lisibles dans les 2 modes
    const pillBg = isPositive
      ? (isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5')
      : isNegative
        ? (isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2')
        : (isDark ? 'rgba(148, 163, 184, 0.18)' : '#F3F4F6');
    const pillFg = isPositive
      ? (isDark ? '#34D399' : '#065F46')
      : isNegative
        ? (isDark ? '#F87171' : '#991B1B')
        : (isDark ? '#9CA3AF' : '#6B7280');
    const arrow = isPositive ? '↑' : isNegative ? '↓' : '→';
    const deltaText = isCurrency
      ? `${currencyDelta > 0 ? '+' : ''}${formatCurrency(
          currencyDelta,
          i18n.language,
          Math.abs(currencyDelta) < 1 ? 2 : 0,
        )}`
      : `${isPositive ? '+' : ''}${delta.toFixed(0)}%`;
    pillContent = (
      <View style={[styles.pill, { backgroundColor: pillBg }]}>
        <Text style={[styles.pillText, { color: pillFg }]} numberOfLines={1}>
          {`${arrow} ${deltaText} ${deltaLabel}`}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {pillContent ?? <View style={styles.pillPlaceholder} />}
    </View>
  );
};

/** ---------------------------------------------------------------------- */
/** Chart simple : barres CA par jour de semaine                           */
/** ---------------------------------------------------------------------- */

interface RevenueBarChartProps {
  distribution: { day: string; revenue: number }[];
  total: number;
  title: string;
}

const RevenueBarChart: React.FC<RevenueBarChartProps> = ({
  distribution,
  total,
  title,
}) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeChartStyles(colors, isDark), [colors, isDark]);

  // Tri dans l'ordre Lun → Dim, et complétion des jours absents
  const ordered = useMemo(() => {
    const map = new Map<string, number>();
    distribution.forEach((d) => map.set(d.day, d.revenue));
    return DAY_ORDER_API_KEYS.map((apiDay) => {
      const i18nKey = API_TO_I18N_DAY[apiDay];
      return {
        day: apiDay,
        shortLabel: i18nKey
          ? t(`restaurantStats.daysShort.${i18nKey}`)
          : apiDay.slice(0, 3),
        revenue: map.get(apiDay) ?? 0,
      };
    });
  }, [distribution, t]);

  const maxRevenue = useMemo(() => {
    const max = ordered.reduce((acc, d) => Math.max(acc, d.revenue), 0);
    return max > 0 ? max : 1;
  }, [ordered]);

  const peakIndex = useMemo(() => {
    let idx = -1;
    let max = 0;
    ordered.forEach((d, i) => {
      if (d.revenue > max) {
        max = d.revenue;
        idx = i;
      }
    });
    return idx;
  }, [ordered]);

  const BAR_AREA_HEIGHT = 220;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.totalAmount}>
          {formatCurrency(total, i18n.language)}
        </Text>
      </View>

      <View style={[styles.barsArea, { height: BAR_AREA_HEIGHT }]}>
        {ordered.map((d, i) => {
          const ratio = d.revenue / maxRevenue;
          const barHeight = Math.max(
            ratio * (BAR_AREA_HEIGHT - 60),
            d.revenue > 0 ? 6 : 0,
          );
          const isPeak = i === peakIndex && d.revenue > 0;
          return (
            <View key={d.day} style={styles.barColumn}>
              {isPeak && (
                <View style={styles.peakTooltip}>
                  <Text style={styles.peakTooltipText}>
                    {formatCurrency(d.revenue, i18n.language)}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    // Pic = navy primary, autres = primary[700] légèrement
                    // plus clair (variante stable dans les 2 modes via la
                    // palette indigo du designSystem)
                    backgroundColor: isPeak
                      ? colors.primary
                      : colors.variants.primary[700],
                  },
                ]}
              />
              <Text style={styles.barLabel}>{d.shortLabel}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

/** ---------------------------------------------------------------------- */
/** Liste des top plats (rang + emoji + nom + jauge + ventes)              */
/** ---------------------------------------------------------------------- */

interface TopDishesListProps {
  dishes: { id: number; name: string; total_orders: number }[];
  title: string;
}

const TopDishesList: React.FC<TopDishesListProps> = ({ dishes, title }) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeTopStyles(colors, isDark), [colors, isDark]);

  const top5 = dishes.slice(0, 5);
  const max = top5.length > 0 ? top5[0].total_orders : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {top5.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="restaurant-outline" size={28} color={colors.text.light} />
          <Text style={styles.emptyText}>
            {t('restaurantStats.empty.noData')}
          </Text>
        </View>
      ) : (
        top5.map((dish, idx) => {
          const rank = idx + 1;
          const rankStyle = getRankStyle(rank, colors);
          const ratio = max > 0 ? dish.total_orders / max : 0;

          return (
            <View key={dish.id} style={styles.row}>
              <View style={[styles.rankBadge, { backgroundColor: rankStyle.bg }]}>
                <Text style={[styles.rankBadgeText, { color: rankStyle.fg }]}>
                  {rank}
                </Text>
              </View>

              <View style={styles.dishEmoji}>
                <Text style={styles.dishEmojiText}>
                  {inferDishEmoji(dish.name)}
                </Text>
              </View>

              <View style={styles.dishMain}>
                <Text style={styles.dishName} numberOfLines={1}>
                  {dish.name}
                </Text>
                <View style={styles.gaugeTrack}>
                  <View
                    style={[
                      styles.gaugeFill,
                      { width: `${Math.max(ratio * 100, 6)}%` },
                    ]}
                  />
                </View>
              </View>

              <Text style={styles.dishCount}>
                {t('restaurantStats.salesCount', {
                  count: dish.total_orders,
                  formatted: formatNumberLocale(dish.total_orders, i18n.language),
                })}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
};

/** ---------------------------------------------------------------------- */
/** Barre de sélection du restaurant (cachée si un seul restaurant)         */
/** ---------------------------------------------------------------------- */

interface RestaurantSwitchBarProps {
  restaurants: Restaurant[];
  currentRestaurantId: string;
  onSwitch: (restaurantId: string) => void;
}

const RestaurantSwitchBar: React.FC<RestaurantSwitchBarProps> = ({
  restaurants,
  currentRestaurantId,
  onSwitch,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeSwitchStyles(colors, isDark), [colors, isDark]);
  const [modalOpen, setModalOpen] = useState(false);

  if (restaurants.length <= 1) return null;

  const currentRestaurant = restaurants.find((r) => r.id === currentRestaurantId);

  return (
    <>
      <Pressable
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [
          styles.bar,
          pressed && { backgroundColor: colors.background },
        ]}
        android_ripple={{ color: colors.primary + '15' }}
      >
        <Ionicons name="restaurant" size={16} color={colors.secondary} />
        <Text style={styles.barText} numberOfLines={1}>
          {currentRestaurant?.name || t('restaurantStats.chooseRestaurant')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
      </Pressable>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t('restaurantStats.chooseRestaurant')}
              </Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>
            <FlatList
              data={restaurants}
              keyExtractor={(r) => r.id}
              renderItem={({ item }) => {
                const isActive = item.id === currentRestaurantId;
                return (
                  <Pressable
                    onPress={() => {
                      if (!isActive) onSwitch(item.id);
                      setModalOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalRow,
                      isActive && styles.modalRowActive,
                      pressed && { backgroundColor: colors.background },
                    ]}
                    android_ripple={{ color: colors.primary + '15' }}
                  >
                    <View style={styles.modalRowMain}>
                      <Text
                        style={[
                          styles.modalRowText,
                          isActive && styles.modalRowTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {(item.address || item.city) && (
                        <Text style={styles.modalRowSubtext} numberOfLines={1}>
                          {item.address}
                          {item.city ? `, ${item.city}` : ''}
                        </Text>
                      )}
                    </View>
                    {isActive && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    )}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// CONTENU PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

function StatisticsScreenContent({ restaurant }: { restaurant: Restaurant }) {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const isTwoCol = width >= 768;
  const styles = useMemo(() => makeContainerStyles(colors, isDark), [colors, isDark]);

  const { restaurants, loadRestaurant } = useRestaurant();

  const [stats, setStats] = useState<RestaurantStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(PERIODS[0]);

  const handleSwitchRestaurant = useCallback(
    (restaurantId: string) => {
      loadRestaurant(restaurantId);
    },
    [loadRestaurant],
  );

  const loadStatistics = useCallback(async () => {
    if (!restaurant?.id) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await restaurantService.getRestaurantStatistics(
        String(restaurant.id),
        selectedPeriod.value,
      );
      setStats(data);
    } catch (err: any) {
      console.error('Error loading statistics:', err);
      setErrorMessage(
        err?.message ?? t('restaurantStats.errors.loadFailed'),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurant?.id, selectedPeriod.value, t]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStatistics();
  }, [loadStatistics]);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  // ── Données dérivées pour les KPI ────────────────────────────────────────
  const kpiData = useMemo(() => {
    if (!stats) return null;

    const totalRevenue = stats.revenue.current_period ?? 0;
    const previousRevenue = stats.revenue.previous_period ?? 0;
    const revenueDelta = computeDelta(totalRevenue, previousRevenue);

    const ordersServed = stats.overview.orders.served ?? 0;
    const totalOrdersPrevious = stats.overview.orders.total_last_period ?? 0;
    const servedDelta: number | null = null;

    const avgOrderValue = stats.kpis.avg_order_value ?? 0;
    const previousAvg = totalOrdersPrevious > 0 ? previousRevenue / totalOrdersPrevious : 0;
    const avgDelta = computeDelta(avgOrderValue, previousAvg);
    const avgDeltaCurrency = avgOrderValue - previousAvg;

    return {
      totalRevenue,
      revenueDelta,
      revenueDeltaCurrency: totalRevenue - previousRevenue,
      ordersServed,
      servedDelta,
      avgOrderValue,
      avgDelta,
      avgDeltaCurrency,
    };
  }, [stats]);

  const deltaLabel = t(`restaurantStats.deltas.${selectedPeriod.deltaKey}`);

  // ── Rendu loading / error ────────────────────────────────────────────────

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <StatsBanner
          selectedPeriod={selectedPeriod}
          onSelectPeriod={setSelectedPeriod}
        />
        <RestaurantSwitchBar
          restaurants={restaurants}
          currentRestaurantId={restaurant.id}
          onSwitch={handleSwitchRestaurant}
        />
        <Loading />
      </View>
    );
  }

  if (!stats || !kpiData) {
    return (
      <View style={styles.container}>
        <StatsBanner
          selectedPeriod={selectedPeriod}
          onSelectPeriod={setSelectedPeriod}
        />
        <RestaurantSwitchBar
          restaurants={restaurants}
          currentRestaurantId={restaurant.id}
          onSwitch={handleSwitchRestaurant}
        />
        {errorMessage && (
          <View style={styles.alertWrap}>
            <InlineAlert
              variant="error"
              title={t('common.error')}
              message={errorMessage}
              onDismiss={() => setErrorMessage(null)}
            />
          </View>
        )}
        <View style={styles.emptyState}>
          <Ionicons name="stats-chart-outline" size={56} color={colors.text.light} />
          <Text style={styles.emptyTitle}>
            {t('restaurantStats.empty.noData')}
          </Text>
          <Text style={styles.emptyText}>
            {t('restaurantStats.empty.description')}
          </Text>
        </View>
      </View>
    );
  }

  // ── Rendu principal ──────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatsBanner
        selectedPeriod={selectedPeriod}
        onSelectPeriod={setSelectedPeriod}
      />
      <RestaurantSwitchBar
        restaurants={restaurants}
        currentRestaurantId={restaurant.id}
        onSwitch={handleSwitchRestaurant}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {errorMessage && (
          <View style={{ marginBottom: 12 }}>
            <InlineAlert
              variant="error"
              title={t('common.error')}
              message={errorMessage}
              onDismiss={() => setErrorMessage(null)}
            />
          </View>
        )}

        {/* ── 3 KPI cards ─────────────────────────────────────────────── */}
        <View style={[styles.kpiRow, !isTwoCol && styles.kpiRowMobile]}>
          <KpiCard
            label={t('restaurantStats.kpi.totalRevenue')}
            value={formatCurrency(kpiData.totalRevenue, i18n.language)}
            delta={kpiData.revenueDelta}
            deltaLabel={deltaLabel}
            isCurrency
            currencyDelta={kpiData.revenueDeltaCurrency}
          />
          <KpiCard
            label={t('restaurantStats.kpi.servedOrders')}
            value={formatNumberLocale(kpiData.ordersServed, i18n.language)}
            delta={kpiData.servedDelta}
            deltaLabel={deltaLabel}
          />
          <KpiCard
            label={t('restaurantStats.kpi.avgOrder')}
            value={formatCurrency(kpiData.avgOrderValue, i18n.language, 2)}
            delta={kpiData.avgDelta}
            deltaLabel={deltaLabel}
            isCurrency
            currencyDelta={kpiData.avgDeltaCurrency}
          />
        </View>

        {/* ── Chart + Top plats ───────────────────────────────────────── */}
        <View style={[styles.bodyRow, !isTwoCol && styles.bodyRowMobile]}>
          <View style={[styles.bodyCol, isTwoCol && styles.bodyColLeft]}>
            <RevenueBarChart
              distribution={stats.daily_performance.distribution}
              total={kpiData.totalRevenue}
              title={t('restaurantStats.charts.revenueByDay')}
            />
          </View>

          <View style={[styles.bodyCol, isTwoCol && styles.bodyColRight]}>
            <TopDishesList
              dishes={stats.dishes_performance.top_dishes}
              title={t('restaurantStats.charts.topDishes')}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSANT EXPORTÉ (avec wrapper restaurant selector)
// ════════════════════════════════════════════════════════════════════════════

export default function StatisticsScreen() {
  const { t } = useTranslation();
  const { currentRestaurant } = useRestaurant();

  return (
    <RestaurantAutoSelector
      noRestaurantMessage={t('restaurantStats.noRestaurantMessage')}
      createButtonText={t('restaurantStats.createFirstRestaurant')}
      onRestaurantSelected={(_restaurantId) => {
        /* noop */
      }}
    >
      {currentRestaurant && <StatisticsScreenContent restaurant={currentRestaurant} />}
    </RestaurantAutoSelector>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STYLES (fabriques theme-aware)
// ════════════════════════════════════════════════════════════════════════════

const makeContainerStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
      maxWidth: 1280,
      width: '100%',
      alignSelf: 'center',
    },
    alertWrap: { paddingHorizontal: 16, paddingTop: 12 },
    kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    kpiRowMobile: { flexDirection: 'column' },
    bodyRow: { flexDirection: 'row', gap: 16 },
    bodyRowMobile: { flexDirection: 'column' },
    bodyCol: { flex: 1 },
    bodyColLeft: { flex: 1.5 },
    bodyColRight: { flex: 1 },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      // Titre en or chaud en dark — cohérent avec la migration
      color: isDark ? colors.text.golden : colors.text.primary,
      marginTop: 6,
    },
    emptyText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });

// Bandeau navy stable dans les 2 modes (intrinsèquement sombre)
const makeBannerStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: -0.3,
    },
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.12)',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    pickerLabel: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'flex-end',
      paddingHorizontal: 16,
    },
    modalCard: {
      width: '100%',
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 8,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.18,
      shadowRadius: 16,
      elevation: 12,
    },
    modalTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.light,
      letterSpacing: 1.2,
      paddingHorizontal: 16,
      paddingVertical: 8,
      textTransform: 'uppercase',
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    modalRowActive: {
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : colors.variants.primary[50],
    },
    modalRowText: { fontSize: 15, fontWeight: '500', color: colors.text.primary },
    modalRowTextActive: { color: colors.primary, fontWeight: '700' },
  });

const makeKpiStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    card: {
      flex: 1,
      minWidth: 0,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border.light,
      gap: 6,
      ...shadows.sm,
    },
    label: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.light,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    value: {
      fontSize: 28,
      fontWeight: '700',
      // KPI values en or chaud en dark pour ressortir
      color: isDark ? colors.text.golden : colors.primary,
      letterSpacing: -0.8,
      lineHeight: 32,
      marginVertical: 4,
    },
    pill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.full,
      maxWidth: '100%',
    },
    pillPlaceholder: { height: 23 },
    pillText: { fontSize: 11, fontWeight: '600' },
  });
};

const makeChartStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border.light,
      ...shadows.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    totalAmount: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.text.golden : colors.primary,
    },
    barsArea: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingTop: 24,
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'flex-end',
      position: 'relative',
    },
    bar: {
      width: '60%',
      minHeight: 0,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
    },
    barLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.text.light,
      marginTop: 8,
    },
    peakTooltip: {
      position: 'absolute',
      top: -2,
      backgroundColor: colors.secondary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.sm,
      zIndex: 2,
    },
    peakTooltipText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  });
};

const makeTopStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border.light,
      gap: 14,
      ...shadows.sm,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    empty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
    emptyText: { fontSize: 13, color: colors.text.light },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rankBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankBadgeText: { fontSize: 11, fontWeight: '700' },
    dishEmoji: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dishEmojiText: { fontSize: 18 },
    dishMain: { flex: 1, minWidth: 0, gap: 6 },
    dishName: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    gaugeTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.light,
      overflow: 'hidden',
    },
    gaugeFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
    dishCount: { fontSize: 12, fontWeight: '500', color: colors.text.secondary },
  });
};

const makeSwitchStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    barText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      maxHeight: '70%',
      paddingBottom: 16,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.text.golden : colors.text.primary,
    },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
      gap: 12,
    },
    modalRowActive: {
      backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : colors.variants.primary[50],
    },
    modalRowMain: { flex: 1, minWidth: 0 },
    modalRowText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    modalRowTextActive: { color: colors.primary },
    modalRowSubtext: { fontSize: 12, color: colors.text.secondary },
  });