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

import { Loading } from '@/components/ui/Loading';
import { Alert as InlineAlert } from '@/components/ui/Alert';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import { useRestaurant } from '@/contexts/RestaurantContext';

import { RestaurantStatistics } from '@/types/restaurant-statistics';
import type { Restaurant } from '@/types/restaurant';
import { restaurantService } from '@/services/restaurantService';

import { COLORS, BORDER_RADIUS } from '@/utils/designSystem';

// ════════════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════════════

interface PeriodOption {
  value: number;
  label: string;        // affiché dans le sélecteur ("Cette semaine")
  shortLabel: string;   // utilisé dans le titre ("Cette semaine")
  deltaLabel: string;   // affiché dans la pill delta ("vs semaine précédente")
}

const PERIODS: PeriodOption[] = [
  { value: 7,   label: 'Cette semaine',    shortLabel: 'Cette semaine',    deltaLabel: 'vs semaine précédente' },
  { value: 30,  label: 'Ce mois',          shortLabel: 'Ce mois',          deltaLabel: 'vs mois précédent' },
  { value: 90,  label: '3 derniers mois',  shortLabel: '3 derniers mois',  deltaLabel: 'vs 3 mois précédents' },
  { value: 180, label: '6 derniers mois',  shortLabel: '6 derniers mois',  deltaLabel: 'vs 6 mois précédents' },
  { value: 365, label: 'Cette année',      shortLabel: 'Cette année',      deltaLabel: 'vs année précédente' },
];

const DAY_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAY_SHORT: Record<string, string> = {
  Lundi: 'Lun', Mardi: 'Mar', Mercredi: 'Mer', Jeudi: 'Jeu',
  Vendredi: 'Ven', Samedi: 'Sam', Dimanche: 'Dim',
};

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

const formatEuro = (value: number, decimals = 0): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} €`;
};

const formatEuroDecimal = (value: number): string => formatEuro(value, 2);

const formatNumber = (value: number): string => {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('fr-FR');
};

/** Calcule un pourcentage d'évolution entre deux valeurs. Renvoie null si non calculable. */
const computeDelta = (current: number, previous: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return null; // pas de base de comparaison
  }
  return ((current - previous) / previous) * 100;
};

/** Emoji par défaut basé sur le nom du plat (fallback si pas d'image). */
function inferDishEmoji(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('steak') || n.includes('boeuf') || n.includes('bœuf') || n.includes('entrec')) return '🥩';
  if (n.includes('frites') || n.includes('frite')) return '🍟';
  if (n.includes('risotto') || n.includes('pasta') || n.includes('pâte') || n.includes('pate')) return '🍝';
  if (n.includes('tarte') || n.includes('gâteau') || n.includes('gateau')) return '🥧';
  if (n.includes('crème') || n.includes('creme') || n.includes('brûlée') || n.includes('brulee')) return '🍮';
  if (n.includes('salade') || n.includes('césar') || n.includes('cesar')) return '🥗';
  if (n.includes('canard') || n.includes('magret') || n.includes('volaille') || n.includes('poulet')) return '🍗';
  if (n.includes('poisson') || n.includes('saumon') || n.includes('thon') || n.includes('cabillaud')) return '🐟';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('burger')) return '🍔';
  if (n.includes('foie')) return '🥖';
  if (n.includes('soupe') || n.includes('velout')) return '🍲';
  if (n.includes('moules') || n.includes('huîtres') || n.includes('huitres')) return '🦪';
  if (n.includes('tartare')) return '🥩';
  if (n.includes('vin') || n.includes('cocktail')) return '🍷';
  if (n.includes('café') || n.includes('cafe')) return '☕';
  return '🍽️';
}

/** Couleur pastel dérivée du rang (1=or, 2=argent, 3=bronze, 4+=neutre). */
function getRankStyle(rank: number): { bg: string; fg: string } {
  if (rank === 1) return { bg: '#F59E0B', fg: '#FFFFFF' };       // or
  if (rank === 2) return { bg: '#94A3B8', fg: '#FFFFFF' };       // argent
  if (rank === 3) return { bg: '#B45309', fg: '#FFFFFF' };       // bronze
  return { bg: '#E5E7EB', fg: '#6B7280' };                       // neutre
}

// ════════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ════════════════════════════════════════════════════════════════════════════

/** ---------------------------------------------------------------------- */
/** Bandeau navy haut avec titre + sélecteur de période                     */
/** ---------------------------------------------------------------------- */

interface StatsBannerProps {
  shortLabel: string;
  selectedPeriod: PeriodOption;
  onSelectPeriod: (period: PeriodOption) => void;
}

const StatsBanner: React.FC<StatsBannerProps> = ({ shortLabel, selectedPeriod, onSelectPeriod }) => {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <View style={[bannerStyles.container, { paddingTop: insets.top + 12 }]}>
        <View style={bannerStyles.row}>
          <Text style={bannerStyles.title} numberOfLines={1}>
            Statistiques — {shortLabel}
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [bannerStyles.pickerButton, pressed && { opacity: 0.85 }]}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
          >
            <Ionicons name="calendar-outline" size={14} color="#FFFFFF" />
            <Text style={bannerStyles.pickerLabel}>{selectedPeriod.shortLabel}</Text>
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
        <Pressable style={bannerStyles.modalOverlay} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[bannerStyles.modalCard, { marginTop: insets.top + 60 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={bannerStyles.modalTitle}>Période d'analyse</Text>
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
                      bannerStyles.modalRow,
                      isActive && bannerStyles.modalRowActive,
                      pressed && { backgroundColor: COLORS.background },
                    ]}
                    android_ripple={{ color: COLORS.primary + '15' }}
                  >
                    <Text style={[bannerStyles.modalRowText, isActive && bannerStyles.modalRowTextActive]}>
                      {item.label}
                    </Text>
                    {isActive && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
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
  delta: number | null;            // pourcentage (null = non calculable)
  deltaLabel: string;              // "vs semaine précédente"
  isCurrency?: boolean;            // si true, affiche le delta en € absolu
  currencyDelta?: number;          // delta en € (pour ticket moyen)
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, delta, deltaLabel, isCurrency, currencyDelta = 0 }) => {
  // Quand delta === null (pas de période précédente exploitable), on n'affiche
  // PAS la pill du "vs ..." pour éviter les comparaisons fantômes.
  // Un placeholder de même hauteur garde l'alignement entre les 3 KPI cards.
  let pillContent: React.ReactNode = null;
  if (delta !== null) {
    const isPositive = delta > 0;
    const isNegative = delta < 0;
    const pillBg = isPositive ? '#D1FAE5' : isNegative ? '#FEE2E2' : '#F3F4F6';
    const pillFg = isPositive ? '#065F46' : isNegative ? '#991B1B' : '#6B7280';
    const arrow = isPositive ? '↑' : isNegative ? '↓' : '→';
    const deltaText = isCurrency
      ? `${currencyDelta > 0 ? '+' : ''}${formatEuro(currencyDelta, Math.abs(currencyDelta) < 1 ? 2 : 0)}`
      : `${isPositive ? '+' : ''}${delta.toFixed(0)}%`;
    pillContent = (
      <View style={[kpiStyles.pill, { backgroundColor: pillBg }]}>
        <Text style={[kpiStyles.pillText, { color: pillFg }]} numberOfLines={1}>
          {`${arrow} ${deltaText} ${deltaLabel}`}
        </Text>
      </View>
    );
  }

  return (
    <View style={kpiStyles.card}>
      <Text style={kpiStyles.label} numberOfLines={1}>{label}</Text>
      <Text style={kpiStyles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {pillContent ?? <View style={kpiStyles.pillPlaceholder} />}
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

const RevenueBarChart: React.FC<RevenueBarChartProps> = ({ distribution, total, title }) => {
  // Tri dans l'ordre Lun → Dim, et complétion des jours absents
  const ordered = useMemo(() => {
    const map = new Map<string, number>();
    distribution.forEach((d) => map.set(d.day, d.revenue));
    return DAY_ORDER.map((day) => ({
      day,
      shortLabel: DAY_SHORT[day] || day.slice(0, 3),
      revenue: map.get(day) ?? 0,
    }));
  }, [distribution]);

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
    <View style={chartStyles.container}>
      <View style={chartStyles.header}>
        <Text style={chartStyles.title}>{title}</Text>
        <Text style={chartStyles.totalAmount}>{formatEuro(total)}</Text>
      </View>

      <View style={[chartStyles.barsArea, { height: BAR_AREA_HEIGHT }]}>
        {ordered.map((d, i) => {
          const ratio = d.revenue / maxRevenue;
          const barHeight = Math.max(ratio * (BAR_AREA_HEIGHT - 60), d.revenue > 0 ? 6 : 0);
          const isPeak = i === peakIndex && d.revenue > 0;
          return (
            <View key={d.day} style={chartStyles.barColumn}>
              {/* Tooltip sur la barre la plus haute */}
              {isPeak && (
                <View style={chartStyles.peakTooltip}>
                  <Text style={chartStyles.peakTooltipText}>{formatEuro(d.revenue)}</Text>
                </View>
              )}
              <View
                style={[
                  chartStyles.bar,
                  { height: barHeight, backgroundColor: isPeak ? COLORS.primary : '#3B47A8' },
                ]}
              />
              <Text style={chartStyles.barLabel}>{d.shortLabel}</Text>
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
  const top5 = dishes.slice(0, 5);
  const max = top5.length > 0 ? top5[0].total_orders : 0;

  return (
    <View style={topStyles.container}>
      <Text style={topStyles.title}>{title}</Text>

      {top5.length === 0 ? (
        <View style={topStyles.empty}>
          <Ionicons name="restaurant-outline" size={28} color={COLORS.text.light} />
          <Text style={topStyles.emptyText}>Aucune donnée disponible</Text>
        </View>
      ) : (
        top5.map((dish, idx) => {
          const rank = idx + 1;
          const rankStyle = getRankStyle(rank);
          const ratio = max > 0 ? dish.total_orders / max : 0;

          return (
            <View key={dish.id} style={topStyles.row}>
              {/* Numéro de rang */}
              <View style={[topStyles.rankBadge, { backgroundColor: rankStyle.bg }]}>
                <Text style={[topStyles.rankBadgeText, { color: rankStyle.fg }]}>{rank}</Text>
              </View>

              {/* Emoji du plat */}
              <View style={topStyles.dishEmoji}>
                <Text style={topStyles.dishEmojiText}>{inferDishEmoji(dish.name)}</Text>
              </View>

              {/* Nom + jauge */}
              <View style={topStyles.dishMain}>
                <Text style={topStyles.dishName} numberOfLines={1}>{dish.name}</Text>
                <View style={topStyles.gaugeTrack}>
                  <View style={[topStyles.gaugeFill, { width: `${Math.max(ratio * 100, 6)}%` }]} />
                </View>
              </View>

              {/* Ventes */}
              <Text style={topStyles.dishCount}>
                {formatNumber(dish.total_orders)} vente{dish.total_orders > 1 ? 's' : ''}
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
  const [modalOpen, setModalOpen] = useState(false);

  // Pas de bar si moins de 2 restaurants : rien à switcher
  if (restaurants.length <= 1) return null;

  const currentRestaurant = restaurants.find((r) => r.id === currentRestaurantId);

  return (
    <>
      <Pressable
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [switchStyles.bar, pressed && { backgroundColor: COLORS.background }]}
        android_ripple={{ color: COLORS.primary + '15' }}
      >
        <Ionicons name="restaurant" size={16} color={COLORS.secondary} />
        <Text style={switchStyles.barText} numberOfLines={1}>
          {currentRestaurant?.name || 'Choisir un restaurant'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.text.secondary} />
      </Pressable>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable style={switchStyles.modalOverlay} onPress={() => setModalOpen(false)}>
          <Pressable style={switchStyles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={switchStyles.modalHeader}>
              <Text style={switchStyles.modalTitle}>Choisir un restaurant</Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
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
                      switchStyles.modalRow,
                      isActive && switchStyles.modalRowActive,
                      pressed && { backgroundColor: COLORS.background },
                    ]}
                    android_ripple={{ color: COLORS.primary + '15' }}
                  >
                    <View style={switchStyles.modalRowMain}>
                      <Text
                        style={[switchStyles.modalRowText, isActive && switchStyles.modalRowTextActive]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {(item.address || item.city) && (
                        <Text style={switchStyles.modalRowSubtext} numberOfLines={1}>
                          {item.address}{item.city ? `, ${item.city}` : ''}
                        </Text>
                      )}
                    </View>
                    {isActive && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
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
  const { width } = useWindowDimensions();
  const isTwoCol = width >= 768;

  // On récupère la liste complète des restaurants + la méthode de switch
  // depuis le contexte. `loadRestaurant(id)` met à jour `currentRestaurant`,
  // qui est re-passé à ce composant via `RestaurantAutoSelector`, donc le
  // changement déclenche automatiquement un nouveau chargement des stats.
  const { restaurants, loadRestaurant } = useRestaurant();

  const [stats, setStats] = useState<RestaurantStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(PERIODS[0]); // Cette semaine par défaut

  const handleSwitchRestaurant = useCallback(
    (restaurantId: string) => {
      loadRestaurant(restaurantId);
    },
    [loadRestaurant]
  );

  const loadStatistics = useCallback(async () => {
    if (!restaurant?.id) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await restaurantService.getRestaurantStatistics(
        String(restaurant.id),
        selectedPeriod.value
      );
      setStats(data);
    } catch (err: any) {
      console.error('Error loading statistics:', err);
      setErrorMessage(err?.message ?? 'Erreur lors du chargement des statistiques.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurant?.id, selectedPeriod.value]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStatistics();
  }, [loadStatistics]);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  // ── Données dérivées pour les KPI ──────────────────────────────────────────

  const kpiData = useMemo(() => {
    if (!stats) return null;

    const totalRevenue = stats.revenue.current_period ?? 0;
    const previousRevenue = stats.revenue.previous_period ?? 0;
    const revenueDelta = computeDelta(totalRevenue, previousRevenue);

    const ordersServed = stats.overview.orders.served ?? 0;
    const totalOrdersPrevious = stats.overview.orders.total_last_period ?? 0;
    // Pas de delta pour "Commandes servies" : le backend ne fournit pas
    // actuellement `served_last_period` dans OrdersStats. On préfère afficher
    // la valeur sans comparaison plutôt qu'un proxy basé sur le delta du
    // total des commandes — qui serait trompeur car il mélange servies,
    // en cours et annulées (ex: si la période précédente avait beaucoup
    // d'annulations, le delta sur le total minimise la vraie progression
    // des servies).
    //
    // Pour activer un vrai delta : ajouter `served_last_period: number`
    // dans le serializer OrdersStatsSerializer (backend/api/serializers)
    // puis remplacer la ligne ci-dessous par :
    //   const servedDelta = computeDelta(ordersServed, stats.overview.orders.served_last_period ?? 0);
    const servedDelta: number | null = null;

    const avgOrderValue = stats.kpis.avg_order_value ?? 0;
    const previousAvg = totalOrdersPrevious > 0
      ? previousRevenue / totalOrdersPrevious
      : 0;
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

  // ── Rendu loading / error ──────────────────────────────────────────────────

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <StatsBanner
          shortLabel={selectedPeriod.shortLabel}
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
          shortLabel={selectedPeriod.shortLabel}
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
              title="Erreur"
              message={errorMessage}
              onDismiss={() => setErrorMessage(null)}
            />
          </View>
        )}
        <View style={styles.emptyState}>
          <Ionicons name="stats-chart-outline" size={56} color={COLORS.text.light} />
          <Text style={styles.emptyTitle}>Aucune donnée disponible</Text>
          <Text style={styles.emptyText}>
            Les statistiques apparaîtront ici une fois que vous aurez des commandes sur cette période.
          </Text>
        </View>
      </View>
    );
  }

  // ── Rendu principal ────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatsBanner
        shortLabel={selectedPeriod.shortLabel}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {errorMessage && (
          <View style={{ marginBottom: 12 }}>
            <InlineAlert
              variant="error"
              title="Erreur"
              message={errorMessage}
              onDismiss={() => setErrorMessage(null)}
            />
          </View>
        )}

        {/* ── 3 KPI cards ───────────────────────────────────────────────── */}
        <View style={[styles.kpiRow, !isTwoCol && styles.kpiRowMobile]}>
          <KpiCard
            label="CA total"
            value={formatEuro(kpiData.totalRevenue)}
            delta={kpiData.revenueDelta}
            deltaLabel={selectedPeriod.deltaLabel}
            isCurrency
            currencyDelta={kpiData.revenueDeltaCurrency}
          />
          <KpiCard
            label="Commandes servies"
            value={formatNumber(kpiData.ordersServed)}
            delta={kpiData.servedDelta}
            deltaLabel={selectedPeriod.deltaLabel}
          />
          <KpiCard
            label="Ticket moyen"
            value={formatEuroDecimal(kpiData.avgOrderValue)}
            delta={kpiData.avgDelta}
            deltaLabel={selectedPeriod.deltaLabel}
            isCurrency
            currencyDelta={kpiData.avgDeltaCurrency}
          />
        </View>

        {/* ── Chart + Top plats ─────────────────────────────────────────── */}
        <View style={[styles.bodyRow, !isTwoCol && styles.bodyRowMobile]}>
          <View style={[styles.bodyCol, isTwoCol && styles.bodyColLeft]}>
            <RevenueBarChart
              distribution={stats.daily_performance.distribution}
              total={kpiData.totalRevenue}
              title="CA par jour"
            />
          </View>

          <View style={[styles.bodyCol, isTwoCol && styles.bodyColRight]}>
            <TopDishesList
              dishes={stats.dishes_performance.top_dishes}
              title="Top plats"
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
  const { currentRestaurant } = useRestaurant();

  return (
    <RestaurantAutoSelector
      noRestaurantMessage="Vous n'avez pas encore de restaurant"
      createButtonText="Créer mon premier restaurant"
      onRestaurantSelected={(restaurantId) => {
        console.log(`📊 Restaurant ${restaurantId} sélectionné pour les statistiques`);
      }}
    >
      {currentRestaurant && <StatisticsScreenContent restaurant={currentRestaurant} />}
    </RestaurantAutoSelector>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
  },
  alertWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // KPI row
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  kpiRowMobile: {
    flexDirection: 'column',
  },

  // Body row (chart + top dishes)
  bodyRow: {
    flexDirection: 'row',
    gap: 16,
  },
  bodyRowMobile: {
    flexDirection: 'column',
  },
  bodyCol: {
    flex: 1,
  },
  bodyColLeft: {
    flex: 1.5,
  },
  bodyColRight: {
    flex: 1,
  },

  // Empty state
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
    color: COLORS.text.primary,
    marginTop: 6,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primary,
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
  pickerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text.light,
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
    backgroundColor: COLORS.variants.primary[50],
  },
  modalRowText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text.primary,
  },
  modalRowTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});

const kpiStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border.light,
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text.light,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primary,
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
  pillPlaceholder: {
    // Hauteur équivalente à la pill rendue (3px padding * 2 + ~17px line-height ≈ 23px)
    // pour conserver une hauteur de card identique entre les 3 KPI quand
    // certaines n'ont pas de comparaison disponible.
    height: 23,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

const chartStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
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
    color: COLORS.text.light,
    marginTop: 8,
  },
  peakTooltip: {
    position: 'absolute',
    top: -2,
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
    zIndex: 2,
  },
  peakTooltipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

const topStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border.light,
    gap: 14,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.text.light,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dishEmoji: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishEmojiText: {
    fontSize: 18,
  },
  dishMain: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  dishName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  gaugeTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border.light,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  dishCount: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
});

const switchStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  barText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '70%',
    paddingBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    gap: 12,
  },
  modalRowActive: {
    backgroundColor: COLORS.variants.primary[50],
  },
  modalRowMain: {
    flex: 1,
    minWidth: 0,
  },
  modalRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  modalRowTextActive: {
    color: COLORS.primary,
  },
  modalRowSubtext: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
});