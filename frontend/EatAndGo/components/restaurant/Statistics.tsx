import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui/Card';

// Types
import {
  Recommendation,
  TopDish,
  UnderperformingDish,
  PeakHour,
  HourlyDistribution,
  DailyPerformance,
  KPIs,
  Revenue,
  formatDuration,
  getRecommendationColor,
  getRecommendationIcon,
} from '@/types/restaurant-statistics';

import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  getLineHeight,
  type AppColors,
} from '@/utils/designSystem';

// ──────────────────────────────────────────────────────────────────────────
// Hook helper : formatter devise locale-aware (mémoïsé sur i18n.language)
// (formatCurrency depuis @/types/restaurant-statistics est hardcodé FR
//  d'après l'inspection — on l'inline ici en attendant sa migration.)
// ──────────────────────────────────────────────────────────────────────────
const useCurrencyFormatter = () => {
  const { i18n } = useTranslation();
  return useMemo(() => {
    let fmt: Intl.NumberFormat | null = null;
    try {
      fmt = new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'EUR',
      });
    } catch {
      fmt = null;
    }
    return (amount: number) => (fmt ? fmt.format(amount) : `${amount.toFixed(2)} €`);
  }, [i18n.language]);
};

// ============================================================================
// COMPOSANT : KPICard
// ============================================================================

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color,
  trend,
}) => {
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeKpiCardStyles(colors, isDark, screenType, color),
    [colors, isDark, screenType, color],
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>

      <Text style={styles.value}>{value}</Text>

      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {trend && (
        <View style={styles.trendContainer}>
          <Ionicons
            name={trend.isPositive ? 'trending-up' : 'trending-down'}
            size={16}
            color={trend.isPositive ? colors.success : colors.error}
          />
          <Text
            style={[
              styles.trendText,
              { color: trend.isPositive ? colors.success : colors.error },
            ]}
          >
            {Math.abs(trend.value)}%
          </Text>
        </View>
      )}
    </Card>
  );
};

const makeKpiCardStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
  accent: string,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    card: {
      padding: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: accent,
      ...shadows.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: `${accent}15`,
    },
    title: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    value: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: accent,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    subtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      lineHeight: getLineHeight('xs', screenType, 'normal'),
    },
    trendContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },
    trendText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      marginLeft: 4,
    },
  });
};

// ============================================================================
// COMPOSANT : KPIsPanel
// ============================================================================

interface KPIsPanelProps {
  kpis: KPIs;
  chartWidth: number;
}

export const KPIsPanel: React.FC<KPIsPanelProps> = ({ kpis }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(() => makeSectionStyles(colors, screenType), [colors, screenType]);
  const formatCurrency = useCurrencyFormatter();

  return (
    <View style={styles.section}>
      <Text style={styles.title}>📊 {t('statistics.kpis.title')}</Text>

      <View style={styles.grid}>
        <KPICard
          title={t('statistics.kpis.cancellationRate')}
          value={`${kpis.cancellation_rate}%`}
          icon="close-circle-outline"
          color={kpis.cancellation_rate > 10 ? colors.error : colors.success}
          subtitle={
            kpis.cancellation_rate > 10
              ? t('statistics.qualifiers.toImprove')
              : t('statistics.qualifiers.excellent')
          }
        />

        <KPICard
          title={t('statistics.kpis.paymentRate')}
          value={`${kpis.payment_rate}%`}
          icon="card-outline"
          color={kpis.payment_rate > 80 ? colors.success : colors.warning}
          subtitle={
            kpis.payment_rate > 80
              ? t('statistics.qualifiers.veryGood')
              : t('statistics.qualifiers.toWatch')
          }
        />

        <KPICard
          title={t('statistics.kpis.availabilityRate')}
          value={`${kpis.availability_rate}%`}
          icon="restaurant-outline"
          color={kpis.availability_rate > 80 ? colors.success : colors.error}
          subtitle={
            kpis.availability_rate > 80
              ? t('statistics.qualifiers.optimal')
              : t('statistics.qualifiers.critical')
          }
        />

        <KPICard
          title={t('statistics.kpis.avgOrderValue')}
          value={formatCurrency(kpis.avg_order_value)}
          icon="cash-outline"
          color={colors.primary}
          subtitle={t('statistics.kpis.perOrder')}
        />

        <KPICard
          title={t('statistics.kpis.serviceTime')}
          value={formatDuration(kpis.avg_service_time_minutes)}
          icon="time-outline"
          color={
            kpis.avg_service_time_minutes === null
              ? colors.text.secondary
              : kpis.avg_service_time_minutes < 15
                ? colors.success
                : kpis.avg_service_time_minutes < 30
                  ? colors.warning
                  : colors.error
          }
          subtitle={t('statistics.kpis.avgTime')}
        />

        <KPICard
          title={t('statistics.kpis.tableUsage')}
          value={`${kpis.table_usage_rate}%`}
          icon="grid-outline"
          color={kpis.table_usage_rate > 70 ? colors.success : colors.warning}
          subtitle={
            kpis.table_usage_rate > 70
              ? t('statistics.qualifiers.veryGood')
              : t('statistics.qualifiers.toOptimize')
          }
        />
      </View>
    </View>
  );
};

// Section styles partagés
const makeSectionStyles = (
  colors: AppColors,
  screenType: ReturnType<typeof useScreenType>,
) =>
  StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    container: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
  });

// ============================================================================
// COMPOSANT : RecommendationCard
// ============================================================================

interface RecommendationCardProps {
  recommendation: Recommendation;
}

const usePriorityHelpers = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const getPriorityColor = (priority: string): string => {
    const map: Record<string, string> = {
      high: colors.error,
      medium: colors.warning,
      low: colors.info,
    };
    return map[priority] || colors.text.secondary;
  };

  const getPriorityLabel = (priority: string): string => {
    const labels: Record<string, string> = {
      high: t('statistics.priorities.high'),
      medium: t('statistics.priorities.medium'),
      low: t('statistics.priorities.low'),
    };
    return labels[priority] || priority;
  };

  return { getPriorityColor, getPriorityLabel };
};

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
}) => {
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const { getPriorityColor, getPriorityLabel } = usePriorityHelpers();
  const color = getRecommendationColor(recommendation.type);
  const icon = getRecommendationIcon(recommendation.category);

  const styles = useMemo(
    () =>
      makeRecommendationStyles(
        colors,
        isDark,
        screenType,
        color,
        getPriorityColor(recommendation.priority),
      ),
    [colors, isDark, screenType, color, recommendation.priority],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{recommendation.title}</Text>
          <Text style={styles.category}>{recommendation.category}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {getPriorityLabel(recommendation.priority)}
          </Text>
        </View>
      </View>
      <Text style={styles.message}>{recommendation.message}</Text>
    </Card>
  );
};

const makeRecommendationStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
  accent: string,
  badgeBg: string,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    card: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: accent,
      ...shadows.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    iconContainer: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: `${accent}15`,
    },
    headerText: { flex: 1 },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: accent,
      marginBottom: 2,
    },
    category: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      textTransform: 'capitalize',
    },
    badge: {
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: badgeBg,
    },
    badgeText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      // Texte blanc stable sur fonds saturés des badges
      color: '#FFFFFF',
    },
    message: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.primary,
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },
  });
};

// ============================================================================
// COMPOSANT : RecommendationsPanel
// ============================================================================

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
}

export const RecommendationsPanel: React.FC<RecommendationsPanelProps> = ({
  recommendations,
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(() => makeSectionStyles(colors, screenType), [colors, screenType]);

  if (recommendations.length === 0) return null;

  const sorted = [...recommendations].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (
      priorityOrder[a.priority as keyof typeof priorityOrder] -
      priorityOrder[b.priority as keyof typeof priorityOrder]
    );
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>💡 {t('statistics.recommendations.title')}</Text>
      <View style={styles.container}>
        {sorted.map((rec, index) => (
          <RecommendationCard key={index} recommendation={rec} />
        ))}
      </View>
    </View>
  );
};

// ============================================================================
// COMPOSANT : TopDishesChart
// ============================================================================

interface TopDishesChartProps {
  dishes: TopDish[];
  chartWidth: number;
}

export const TopDishesChart: React.FC<TopDishesChartProps> = ({
  dishes,
  chartWidth,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const formatCurrency = useCurrencyFormatter();
  const styles = useMemo(
    () => makeDishListStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  if (dishes.length === 0) return null;

  const chartData = {
    labels: dishes.slice(0, 5).map((d) => d.name.substring(0, 15)),
    datasets: [
      {
        data: dishes.slice(0, 5).map((d) => d.total_orders),
      },
    ],
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        🏆 {t('statistics.topDishes.title')}
      </Text>

      <Card style={styles.chartCard}>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={220}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={makeChartConfig(colors, screenType)}
          fromZero
          showValuesOnTopOfBars
          style={styles.chart}
        />
      </Card>

      <Card style={styles.listCard}>
        {dishes.slice(0, 10).map((dish, index) => (
          <View key={dish.id} style={styles.dishRow}>
            <View style={styles.rank}>
              <Text style={styles.rankText}>#{index + 1}</Text>
            </View>
            <View style={styles.dishInfo}>
              <Text style={styles.dishName} numberOfLines={1}>
                {dish.name}
              </Text>
              <Text style={styles.dishStats}>
                {t('statistics.topDishes.dishStats', {
                  orders: dish.total_orders,
                  revenue: formatCurrency(dish.revenue),
                })}
              </Text>
            </View>
            <Text style={styles.dishPrice}>{formatCurrency(dish.price)}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
};

// Config commune des charts (theme-aware)
const makeChartConfig = (
  colors: AppColors,
  screenType: ReturnType<typeof useScreenType>,
) => ({
  backgroundColor: colors.surface,
  backgroundGradientFrom: colors.surface,
  backgroundGradientTo: colors.surface,
  decimalPlaces: 0,
  // Or stable cross-thème (identité visuelle des charts)
  color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`,
  labelColor: (_opacity = 1) => colors.text.primary,
  style: {
    borderRadius: BORDER_RADIUS.md,
  },
  propsForLabels: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
  },
});

// Styles partagés pour les listes de plats
const makeDishListStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    chartCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...shadows.card,
    },
    chart: {
      borderRadius: BORDER_RADIUS.md,
    },
    listCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...shadows.card,
    },
    dishRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    rank: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.18)'
        : colors.variants.primary[50],
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    rankText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.primary,
    },
    dishInfo: { flex: 1 },
    dishName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: 2,
      lineHeight: getLineHeight('md', screenType, 'tight'),
    },
    dishStats: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      lineHeight: getLineHeight('xs', screenType, 'normal'),
    },
    dishPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.primary,
    },
  });
};

// ============================================================================
// COMPOSANT : UnderperformingDishesPanel
// ============================================================================

interface UnderperformingDishesPanelProps {
  dishes: UnderperformingDish[];
  neverOrderedCount: number;
}

export const UnderperformingDishesPanel: React.FC<UnderperformingDishesPanelProps> = ({
  dishes,
  neverOrderedCount,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const formatCurrency = useCurrencyFormatter();
  const styles = useMemo(
    () => makeUnderperformingStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  if (dishes.length === 0 && neverOrderedCount === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        ⚠️ {t('statistics.underperforming.title')}
      </Text>

      {neverOrderedCount > 0 && (
        <Card style={styles.alertCard}>
          <Ionicons name="warning-outline" size={24} color={colors.warning} />
          <Text style={styles.alertText}>
            {t('statistics.underperforming.neverOrdered', {
              count: neverOrderedCount,
            })}
          </Text>
        </Card>
      )}

      {dishes.length > 0 && (
        <Card style={styles.listCard}>
          <Text style={styles.listTitle}>
            {t('statistics.underperforming.lowOrders')}
          </Text>
          {dishes.map((dish) => (
            <View key={dish.id} style={styles.dishRow}>
              <View style={styles.dishInfo}>
                <Text style={styles.dishName} numberOfLines={1}>
                  {dish.name}
                </Text>
                <Text style={styles.dishStats}>
                  {t('statistics.underperforming.onlyOrders', {
                    count: dish.orders_count,
                  })}
                </Text>
              </View>
              <Text style={styles.dishPrice}>{formatCurrency(dish.price)}</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
};

const makeUnderperformingStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    alertCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: colors.warning,
      ...shadows.card,
    },
    alertText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.primary,
      marginLeft: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },
    listCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...shadows.card,
    },
    listTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    dishRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    dishInfo: { flex: 1 },
    dishName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: 2,
      lineHeight: getLineHeight('md', screenType, 'tight'),
    },
    dishStats: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      lineHeight: getLineHeight('xs', screenType, 'normal'),
    },
    dishPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.primary,
    },
  });
};

// ============================================================================
// COMPOSANT : RevenueAnalysisPanel
// ============================================================================

interface RevenueAnalysisPanelProps {
  revenue: Revenue;
  chartWidth: number;
}

export const RevenueAnalysisPanel: React.FC<RevenueAnalysisPanelProps> = ({
  revenue,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const formatCurrency = useCurrencyFormatter();
  const styles = useMemo(
    () => makeRevenueStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );
  const evolutionIsPositive = revenue.evolution_percent >= 0;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>💰 {t('statistics.revenue.title')}</Text>

      <View style={styles.grid}>
        <Card style={styles.card}>
          <Text style={styles.label}>{t('statistics.revenue.currentPeriod')}</Text>
          <Text style={[styles.value, { color: colors.primary }]}>
            {formatCurrency(revenue.current_period)}
          </Text>
          <Text style={styles.subtext}>
            {t('statistics.revenue.ordersCount', { count: revenue.total_orders })}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>{t('statistics.revenue.previousPeriod')}</Text>
          <Text style={[styles.value, { color: colors.text.secondary }]}>
            {formatCurrency(revenue.previous_period)}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>{t('statistics.revenue.evolution')}</Text>
          <View style={styles.evolutionContainer}>
            <Ionicons
              name={evolutionIsPositive ? 'trending-up' : 'trending-down'}
              size={32}
              color={evolutionIsPositive ? colors.success : colors.error}
            />
            <Text
              style={[
                styles.value,
                {
                  color: evolutionIsPositive ? colors.success : colors.error,
                  marginLeft: getResponsiveValue(SPACING.sm, screenType),
                },
              ]}
            >
              {revenue.evolution_percent > 0 ? '+' : ''}
              {revenue.evolution_percent}%
            </Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>{t('statistics.revenue.avgOrderValue')}</Text>
          <Text style={[styles.value, { color: colors.info }]}>
            {formatCurrency(revenue.avg_order_value)}
          </Text>
          <Text style={styles.subtext}>{t('statistics.revenue.perOrder')}</Text>
        </Card>
      </View>
    </View>
  );
};

const makeRevenueStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    card: {
      flex: 1,
      minWidth: '48%',
      padding: getResponsiveValue(SPACING.lg, screenType),
      margin: getResponsiveValue(SPACING.xs, screenType) / 2,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...shadows.card,
    },
    label: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    value: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
    subtext: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    evolutionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },
  });
};

// ============================================================================
// COMPOSANT : PeakHoursChart
// ============================================================================

interface PeakHoursChartProps {
  peakHours: PeakHour[];
  hourlyDistribution: HourlyDistribution[];
  chartWidth: number;
}

export const PeakHoursChart: React.FC<PeakHoursChartProps> = ({
  peakHours,
  hourlyDistribution,
  chartWidth,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makePeakHoursStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  if (hourlyDistribution.length === 0) return null;

  // Labels d'heures : juste le nombre (locale-agnostic, gain de place dans le chart)
  const chartData = {
    labels: hourlyDistribution.map((h) => String(h.hour)),
    datasets: [
      {
        data: hourlyDistribution.map((h) => h.orders_count),
      },
    ],
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>⏰ {t('statistics.peakHours.title')}</Text>

      <Card style={styles.chartCard}>
        <LineChart
          data={chartData}
          width={chartWidth}
          height={220}
          chartConfig={{
            ...makeChartConfig(colors, screenType),
            propsForLabels: { fontSize: 8 },
          }}
          bezier
          style={styles.chart}
        />
      </Card>

      {peakHours.length > 0 && (
        <Card style={styles.peakCard}>
          <Text style={styles.peakTitle}>
            🔥 {t('statistics.peakHours.peakSlots')}
          </Text>
          {peakHours.map((peak, index) => (
            <View key={index} style={styles.peakRow}>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: isDark
                      ? `rgba(30, 42, 120, ${0.28 - index * 0.05})`
                      : `rgba(30, 42, 120, ${0.18 - index * 0.04})`,
                  },
                ]}
              >
                <Text style={styles.badgeText}>#{index + 1}</Text>
              </View>
              <Text style={styles.time}>{peak.hour}</Text>
              <Text style={styles.count}>
                {t('statistics.peakHours.ordersCount', {
                  count: peak.orders_count,
                })}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
};

const makePeakHoursStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    chartCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...shadows.card,
    },
    chart: {
      borderRadius: BORDER_RADIUS.md,
    },
    peakCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...shadows.card,
    },
    peakTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    peakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    badge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getResponsiveValue(SPACING.md, screenType),
    },
    badgeText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.primary,
    },
    time: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    count: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
    },
  });
};

// ============================================================================
// COMPOSANT : DailyPerformanceChart
// ============================================================================

interface DailyPerformanceChartProps {
  dailyPerformance: DailyPerformance;
  chartWidth: number;
}

export const DailyPerformanceChart: React.FC<DailyPerformanceChartProps> = ({
  dailyPerformance,
  chartWidth,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeDailyPerfStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  if (dailyPerformance.distribution.length === 0) return null;

  const chartData = {
    labels: dailyPerformance.distribution.map((d) => d.day.substring(0, 3)),
    datasets: [
      {
        data: dailyPerformance.distribution.map((d) => d.orders_count),
      },
    ],
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        📅 {t('statistics.dailyPerformance.title')}
      </Text>

      <Card style={styles.chartCard}>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={220}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={makeChartConfig(colors, screenType)}
          fromZero
          showValuesOnTopOfBars
          style={styles.chart}
        />
      </Card>

      <View style={styles.bestWorstContainer}>
        {dailyPerformance.best_day && (
          <Card style={[styles.card, { borderLeftColor: colors.success }]}>
            <Ionicons name="trophy" size={24} color={colors.success} />
            <View style={styles.info}>
              <Text style={styles.label}>
                {t('statistics.dailyPerformance.bestDay')}
              </Text>
              <Text style={styles.day}>{dailyPerformance.best_day.day}</Text>
              <Text style={styles.count}>
                {t('statistics.peakHours.ordersCount', {
                  count: dailyPerformance.best_day.orders_count,
                })}
              </Text>
            </View>
          </Card>
        )}

        {dailyPerformance.worst_day && (
          <Card style={[styles.card, { borderLeftColor: colors.warning }]}>
            <Ionicons name="alert-circle" size={24} color={colors.warning} />
            <View style={styles.info}>
              <Text style={styles.label}>
                {t('statistics.dailyPerformance.worstDay')}
              </Text>
              <Text style={styles.day}>{dailyPerformance.worst_day.day}</Text>
              <Text style={styles.count}>
                {t('statistics.peakHours.ordersCount', {
                  count: dailyPerformance.worst_day.orders_count,
                })}
              </Text>
            </View>
          </Card>
        )}
      </View>
    </View>
  );
};

const makeDailyPerfStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    chartCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...shadows.card,
    },
    chart: {
      borderRadius: BORDER_RADIUS.md,
    },
    bestWorstContainer: {
      flexDirection: 'row',
      marginHorizontal: -getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    card: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
      margin: getResponsiveValue(SPACING.xs, screenType) / 2,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      ...shadows.card,
    },
    info: {
      marginLeft: getResponsiveValue(SPACING.md, screenType),
      flex: 1,
    },
    label: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      marginBottom: 2,
    },
    day: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: 2,
      textTransform: 'capitalize',
    },
    count: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
    },
  });
};