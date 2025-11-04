import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-chart-kit';
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
  formatCurrency,
  formatDuration,
  getRecommendationColor,
  getRecommendationIcon,
} from '@/types/restaurant-statistics';

// Design system unifié
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  SHADOWS,
  getLineHeight,
} from '@/utils/designSystem';

// ============================================================================
// COMPOSANT: Carte de KPI
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
  trend 
}) => {
  const screenType = useScreenType();

  const styles = StyleSheet.create({
    card: {
      padding: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: color,
      ...SHADOWS.card,
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
      backgroundColor: `${color}15`,
    },
    title: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    value: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: color,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    subtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
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
            color={trend.isPositive ? COLORS.success : COLORS.error}
          />
          <Text
            style={[
              styles.trendText,
              { color: trend.isPositive ? COLORS.success : COLORS.error },
            ]}
          >
            {Math.abs(trend.value)}%
          </Text>
        </View>
      )}
    </Card>
  );
};

// ============================================================================
// COMPOSANT: Panneau de KPIs
// ============================================================================

interface KPIsPanelProps {
  kpis: KPIs;
  chartWidth: number;
}

export const KPIsPanel: React.FC<KPIsPanelProps> = ({ kpis }) => {
  const screenType = useScreenType();

  const styles = StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -getResponsiveValue(SPACING.xs, screenType) / 2,
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>📊 Indicateurs clés de performance</Text>
      
      <View style={styles.grid}>
        <KPICard
          title="Taux d'annulation"
          value={`${kpis.cancellation_rate}%`}
          icon="close-circle-outline"
          color={kpis.cancellation_rate > 10 ? COLORS.error : COLORS.success}
          subtitle={kpis.cancellation_rate > 10 ? 'À améliorer' : 'Excellent'}
        />
        
        <KPICard
          title="Taux de paiement"
          value={`${kpis.payment_rate}%`}
          icon="card-outline"
          color={kpis.payment_rate > 80 ? COLORS.success : COLORS.warning}
          subtitle={kpis.payment_rate > 80 ? 'Très bien' : 'À surveiller'}
        />
        
        <KPICard
          title="Disponibilité des plats"
          value={`${kpis.availability_rate}%`}
          icon="restaurant-outline"
          color={kpis.availability_rate > 80 ? COLORS.success : COLORS.error}
          subtitle={kpis.availability_rate > 80 ? 'Optimal' : 'Critique'}
        />
        
        <KPICard
          title="Ticket moyen"
          value={formatCurrency(kpis.avg_order_value)}
          icon="cash-outline"
          color={COLORS.primary}
          subtitle="Par commande"
        />
        
        <KPICard
          title="Temps de service"
          value={formatDuration(kpis.avg_service_time_minutes)}
          icon="time-outline"
          color={
            kpis.avg_service_time_minutes === null
              ? COLORS.text.secondary
              : kpis.avg_service_time_minutes < 15
              ? COLORS.success
              : kpis.avg_service_time_minutes < 30
              ? COLORS.warning
              : COLORS.error
          }
          subtitle="Temps moyen"
        />
        
        <KPICard
          title="Utilisation des tables"
          value={`${kpis.table_usage_rate}%`}
          icon="grid-outline"
          color={kpis.table_usage_rate > 70 ? COLORS.success : COLORS.warning}
          subtitle={kpis.table_usage_rate > 70 ? 'Très bien' : 'À optimiser'}
        />
      </View>
    </View>
  );
};

// ============================================================================
// COMPOSANT: Carte de recommandation
// ============================================================================

interface RecommendationCardProps {
  recommendation: Recommendation;
}

const getPriorityColor = (priority: string): string => {
  const colors = {
    high: COLORS.error,
    medium: COLORS.warning,
    low: COLORS.info,
  };
  return colors[priority as keyof typeof colors] || COLORS.text.secondary;
};

const getPriorityLabel = (priority: string): string => {
  const labels = {
    high: 'URGENT',
    medium: 'Important',
    low: 'Info',
  };
  return labels[priority as keyof typeof labels] || priority;
};

export const RecommendationCard: React.FC<RecommendationCardProps> = ({ recommendation }) => {
  const screenType = useScreenType();
  const color = getRecommendationColor(recommendation.type);
  const icon = getRecommendationIcon(recommendation.category);

  const styles = StyleSheet.create({
    card: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: color,
      ...SHADOWS.card,
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
      backgroundColor: `${color}15`,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: color,
      marginBottom: 2,
    },
    category: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      textTransform: 'capitalize',
    },
    badge: {
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: getPriorityColor(recommendation.priority),
    },
    badgeText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.inverse,
    },
    message: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.primary,
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },
  });

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
          <Text style={styles.badgeText}>{getPriorityLabel(recommendation.priority)}</Text>
        </View>
      </View>
      <Text style={styles.message}>{recommendation.message}</Text>
    </Card>
  );
};

// ============================================================================
// COMPOSANT: Panneau de recommandations
// ============================================================================

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
}

export const RecommendationsPanel: React.FC<RecommendationsPanelProps> = ({ recommendations }) => {
  const screenType = useScreenType();

  if (recommendations.length === 0) return null;

  // Trier par priorité
  const sorted = [...recommendations].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (
      priorityOrder[a.priority as keyof typeof priorityOrder] -
      priorityOrder[b.priority as keyof typeof priorityOrder]
    );
  });

  const styles = StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    container: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>💡 Recommandations personnalisées</Text>
      <View style={styles.container}>
        {sorted.map((rec, index) => (
          <RecommendationCard key={index} recommendation={rec} />
        ))}
      </View>
    </View>
  );
};

// ============================================================================
// COMPOSANT: Top plats
// ============================================================================

interface TopDishesChartProps {
  dishes: TopDish[];
  chartWidth: number;
}

export const TopDishesChart: React.FC<TopDishesChartProps> = ({ dishes, chartWidth }) => {
  const screenType = useScreenType();

  if (dishes.length === 0) return null;

  const chartData = {
    labels: dishes.slice(0, 5).map((d) => d.name.substring(0, 15)),
    datasets: [
      {
        data: dishes.slice(0, 5).map((d) => d.total_orders),
      },
    ],
  };

  const styles = StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    chartCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.card,
    },
    chart: {
      borderRadius: BORDER_RADIUS.md,
    },
    listCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.card,
    },
    dishRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    rank: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: `${COLORS.primary}15`,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    rankText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },
    dishInfo: {
      flex: 1,
    },
    dishName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: 2,
      lineHeight: getLineHeight('md', screenType, 'tight'),
    },
    dishStats: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      lineHeight: getLineHeight('xs', screenType, 'normal'),
    },
    dishPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.primary,
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>🏆 Top 5 des plats les plus commandés</Text>
      
      <Card style={styles.chartCard}>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={220}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            backgroundColor: COLORS.surface,
            backgroundGradientFrom: COLORS.surface,
            backgroundGradientTo: COLORS.surface,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`,
            labelColor: (opacity = 1) => COLORS.text.primary,
            style: {
              borderRadius: BORDER_RADIUS.md,
            },
            propsForLabels: {
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
            },
          }}
          fromZero
          showValuesOnTopOfBars
          style={styles.chart}
        />
      </Card>

      {/* Liste détaillée */}
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
                {dish.total_orders} commandes • {formatCurrency(dish.revenue)} CA
              </Text>
            </View>
            <Text style={styles.dishPrice}>{formatCurrency(dish.price)}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
};

// ============================================================================
// COMPOSANT: Plats sous-performants
// ============================================================================

interface UnderperformingDishesPanelProps {
  dishes: UnderperformingDish[];
  neverOrderedCount: number;
}

export const UnderperformingDishesPanel: React.FC<UnderperformingDishesPanelProps> = ({
  dishes,
  neverOrderedCount,
}) => {
  const screenType = useScreenType();

  if (dishes.length === 0 && neverOrderedCount === 0) return null;

  const styles = StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    alertCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.warning,
      ...SHADOWS.card,
    },
    alertText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.primary,
      marginLeft: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },
    listCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.card,
    },
    listTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    dishRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    dishInfo: {
      flex: 1,
    },
    dishName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: 2,
      lineHeight: getLineHeight('md', screenType, 'tight'),
    },
    dishStats: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      lineHeight: getLineHeight('xs', screenType, 'normal'),
    },
    dishPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.primary,
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>⚠️ Plats à optimiser</Text>
      
      {neverOrderedCount > 0 && (
        <Card style={styles.alertCard}>
          <Ionicons name="warning-outline" size={24} color={COLORS.warning} />
          <Text style={styles.alertText}>
            {neverOrderedCount} plat(s) n'ont jamais été commandé(s). Envisagez de les retirer ou de les
            promouvoir.
          </Text>
        </Card>
      )}

      {dishes.length > 0 && (
        <Card style={styles.listCard}>
          <Text style={styles.listTitle}>Plats peu commandés (30 derniers jours)</Text>
          {dishes.map((dish) => (
            <View key={dish.id} style={styles.dishRow}>
              <View style={styles.dishInfo}>
                <Text style={styles.dishName} numberOfLines={1}>
                  {dish.name}
                </Text>
                <Text style={styles.dishStats}>{dish.orders_count} commande(s) seulement</Text>
              </View>
              <Text style={styles.dishPrice}>{formatCurrency(dish.price)}</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
};

// ============================================================================
// COMPOSANT: Analyse des revenus
// ============================================================================

interface RevenueAnalysisPanelProps {
  revenue: Revenue;
  chartWidth: number;
}

export const RevenueAnalysisPanel: React.FC<RevenueAnalysisPanelProps> = ({ revenue }) => {
  const screenType = useScreenType();
  const evolutionIsPositive = revenue.evolution_percent >= 0;

  const styles = StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
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
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.card,
    },
    label: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    value: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
    subtext: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    evolutionContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>💰 Analyse des revenus</Text>
      
      <View style={styles.grid}>
        <Card style={styles.card}>
          <Text style={styles.label}>Période actuelle</Text>
          <Text style={[styles.value, { color: COLORS.primary }]}>
            {formatCurrency(revenue.current_period)}
          </Text>
          <Text style={styles.subtext}>{revenue.total_orders} commandes</Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>Période précédente</Text>
          <Text style={[styles.value, { color: COLORS.text.secondary }]}>
            {formatCurrency(revenue.previous_period)}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.label}>Évolution</Text>
          <View style={styles.evolutionContainer}>
            <Ionicons
              name={evolutionIsPositive ? 'trending-up' : 'trending-down'}
              size={32}
              color={evolutionIsPositive ? COLORS.success : COLORS.error}
            />
            <Text
              style={[
                styles.value,
                { 
                  color: evolutionIsPositive ? COLORS.success : COLORS.error,
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
          <Text style={styles.label}>Ticket moyen</Text>
          <Text style={[styles.value, { color: COLORS.info }]}>
            {formatCurrency(revenue.avg_order_value)}
          </Text>
          <Text style={styles.subtext}>par commande</Text>
        </Card>
      </View>
    </View>
  );
};

// ============================================================================
// COMPOSANT: Heures de pointe
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
  const screenType = useScreenType();

  if (hourlyDistribution.length === 0) return null;

  const chartData = {
    labels: hourlyDistribution.map((h) => `${h.hour}h`),
    datasets: [
      {
        data: hourlyDistribution.map((h) => h.orders_count),
      },
    ],
  };

  const styles = StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    chartCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.card,
    },
    chart: {
      borderRadius: BORDER_RADIUS.md,
    },
    peakCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.card,
    },
    peakTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    peakRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
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
      color: COLORS.primary,
    },
    time: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    count: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>⏰ Distribution horaire des commandes</Text>
      
      <Card style={styles.chartCard}>
        <LineChart
          data={chartData}
          width={chartWidth}
          height={220}
          chartConfig={{
            backgroundColor: COLORS.surface,
            backgroundGradientFrom: COLORS.surface,
            backgroundGradientTo: COLORS.surface,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`,
            labelColor: (opacity = 1) => COLORS.text.primary,
            style: {
              borderRadius: BORDER_RADIUS.md,
            },
            propsForLabels: {
              fontSize: 8,
            },
          }}
          bezier
          style={styles.chart}
        />
      </Card>

      {peakHours.length > 0 && (
        <Card style={styles.peakCard}>
          <Text style={styles.peakTitle}>🔥 Heures de pointe</Text>
          {peakHours.map((peak, index) => (
            <View key={index} style={styles.peakRow}>
              <View 
                style={[
                  styles.badge, 
                  { backgroundColor: `${COLORS.primary}${20 - index * 5}` }
                ]}
              >
                <Text style={styles.badgeText}>#{index + 1}</Text>
              </View>
              <Text style={styles.time}>{peak.hour}</Text>
              <Text style={styles.count}>{peak.orders_count} commandes</Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
};

// ============================================================================
// COMPOSANT: Performance par jour
// ============================================================================

interface DailyPerformanceChartProps {
  dailyPerformance: DailyPerformance;
  chartWidth: number;
}

export const DailyPerformanceChart: React.FC<DailyPerformanceChartProps> = ({ 
  dailyPerformance, 
  chartWidth 
}) => {
  const screenType = useScreenType();

  if (dailyPerformance.distribution.length === 0) return null;

  const chartData = {
    labels: dailyPerformance.distribution.map((d) => d.day.substring(0, 3)),
    datasets: [
      {
        data: dailyPerformance.distribution.map((d) => d.orders_count),
      },
    ],
  };

  const styles = StyleSheet.create({
    section: {
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getLineHeight('xl', screenType, 'tight'),
    },
    chartCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      ...SHADOWS.card,
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
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      ...SHADOWS.card,
    },
    info: {
      marginLeft: getResponsiveValue(SPACING.md, screenType),
      flex: 1,
    },
    label: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      marginBottom: 2,
    },
    day: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: 2,
    },
    count: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.title}>📅 Performance par jour de la semaine</Text>
      
      <Card style={styles.chartCard}>
        <BarChart
          data={chartData}
          width={chartWidth}
          height={220}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            backgroundColor: COLORS.surface,
            backgroundGradientFrom: COLORS.surface,
            backgroundGradientTo: COLORS.surface,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`,
            labelColor: (opacity = 1) => COLORS.text.primary,
            style: {
              borderRadius: BORDER_RADIUS.md,
            },
          }}
          fromZero
          showValuesOnTopOfBars
          style={styles.chart}
        />
      </Card>

      <View style={styles.bestWorstContainer}>
        {dailyPerformance.best_day && (
          <Card style={[styles.card, { borderLeftColor: COLORS.success }]}>
            <Ionicons name="trophy" size={24} color={COLORS.success} />
            <View style={styles.info}>
              <Text style={styles.label}>Meilleur jour</Text>
              <Text style={styles.day}>{dailyPerformance.best_day.day}</Text>
              <Text style={styles.count}>{dailyPerformance.best_day.orders_count} commandes</Text>
            </View>
          </Card>
        )}

        {dailyPerformance.worst_day && (
          <Card style={[styles.card, { borderLeftColor: COLORS.warning }]}>
            <Ionicons name="alert-circle" size={24} color={COLORS.warning} />
            <View style={styles.info}>
              <Text style={styles.label}>Jour le plus faible</Text>
              <Text style={styles.day}>{dailyPerformance.worst_day.day}</Text>
              <Text style={styles.count}>{dailyPerformance.worst_day.orders_count} commandes</Text>
            </View>
          </Card>
        )}
      </View>
    </View>
  );
};