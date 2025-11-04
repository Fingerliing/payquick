import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Card } from '@/components/ui/Card';
import { Alert as InlineAlert } from '@/components/ui/Alert';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import { useRestaurant } from '@/contexts/RestaurantContext';

// Composants de statistiques
import {
  KPIsPanel,
  RecommendationsPanel,
  TopDishesChart,
  UnderperformingDishesPanel,
  RevenueAnalysisPanel,
  PeakHoursChart,
  DailyPerformanceChart,
} from '@/components/restaurant/Statistics';

// Types
import { RestaurantStatistics } from '@/types/restaurant-statistics';
import type { Restaurant } from '@/types/restaurant';

// Service
import { restaurantService } from '@/services/restaurantService';

// Design System
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@/utils/designSystem';

// ============================================================================
// TYPES
// ============================================================================

type AlertItem = {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
};

type PeriodOption = {
  label: string;
  value: number;
};

// ============================================================================
// HOOKS
// ============================================================================

const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const pushAlert = useCallback(
    (variant: AlertItem['variant'], title: string | undefined, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts((prev) => [{ id, variant, title, message }, ...prev]);
    },
    []
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { alerts, pushAlert, dismissAlert };
};

// ============================================================================
// COMPOSANT INTERNE - CONTENU DES STATISTIQUES
// ============================================================================

function StatisticsScreenContent({ restaurant }: { restaurant: Restaurant }) {
  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  const [stats, setStats] = useState<RestaurantStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  const { alerts, pushAlert, dismissAlert } = useAlerts();

  // Options de période
  const periodOptions: PeriodOption[] = [
    { label: '7 jours', value: 7 },
    { label: '30 jours', value: 30 },
    { label: '90 jours', value: 90 },
    { label: '180 jours', value: 180 },
    { label: '1 an', value: 365 },
  ];

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1200 : undefined,
    chartWidth: Math.min(width - getResponsiveValue(SPACING.container, screenType) * 2, 800),
  };

  // Chargement des statistiques
  const loadStatistics = useCallback(async () => {
    if (!restaurant?.id) return;

    try {
      setLoading(true);
      console.log(`📊 Loading statistics for restaurant ${restaurant.id} - period: ${selectedPeriod} days`);
      
      const data = await restaurantService.getRestaurantStatistics(String(restaurant.id), selectedPeriod);
      console.log("✅ Statistics loaded successfully");

      setStats(data);

      // Afficher un message si des recommandations urgentes existent
      const urgentRecommendations = data.recommendations.filter((r) => r.priority === 'high');
      if (urgentRecommendations.length > 0) {
        pushAlert(
          'warning',
          'Actions recommandées',
          `Vous avez ${urgentRecommendations.length} recommandation(s) urgente(s) à consulter.`
        );
      }
    } catch (err: any) {
      console.error('❌ Error loading statistics:', err);
      const message = err?.message ?? 'Erreur lors du chargement des statistiques.';
      pushAlert('error', 'Erreur', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurant?.id, selectedPeriod, pushAlert]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStatistics();
  }, [loadStatistics]);

  const handlePeriodChange = useCallback((period: number) => {
    setSelectedPeriod(period);
  }, []);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  // Styles
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingBottom: getResponsiveValue(SPACING.xl, screenType) * 2,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center',
      width: '100%',
    },
    alertsContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
    },
    header: {
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    headerTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: '#fff',
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    headerSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: '#fff',
      opacity: 0.9,
    },
    periodSelector: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    periodButton: {
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 2,
      borderColor: COLORS.border.default,
      backgroundColor: COLORS.surface,
    },
    periodButtonActive: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.primary + '15',
    },
    periodButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
    },
    periodButtonTextActive: {
      color: COLORS.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    },
    infoCard: {
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      borderLeftWidth: 4,
      borderLeftColor: COLORS.secondary,
    },
    infoCardText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType) * 1.5,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
    },
    emptyStateIcon: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    emptyStateTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    emptyStateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      maxWidth: 300,
    },
    summaryCard: {
      padding: getResponsiveValue(SPACING.lg, screenType),
      marginTop: getResponsiveValue(SPACING.xl, screenType),
    },
    summaryTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    summaryContent: {
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    summaryLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
    summaryValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.primary,
    },
    summaryValueInfo: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.info,
    },
    summaryValueSuccess: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.success,
    },
  });

  if (loading && !refreshing) {
    return <Loading />;
  }

  if (!stats) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Statistiques" showBackButton />
        <View style={styles.emptyState}>
          <Ionicons
            name="stats-chart-outline"
            size={64}
            color={COLORS.text.secondary}
            style={styles.emptyStateIcon}
          />
          <Text style={styles.emptyStateTitle}>Aucune donnée disponible</Text>
          <Text style={styles.emptyStateText}>
            Les statistiques apparaîtront ici une fois que vous aurez des commandes.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Statistiques avancées" showBackButton />

      {/* Bannières d'alertes */}
      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map((a) => (
            <InlineAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id)}
            />
          ))}
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        <View style={styles.content}>
          <View style={styles.scrollContent}>
            {/* En-tête */}
            <Card style={styles.header}>
              <Text style={styles.headerTitle}>📊 {restaurant.name}</Text>
              <Text style={styles.headerSubtitle}>
                Analyse de votre activité sur {stats.period.days} jours
              </Text>
            </Card>

            {/* Sélecteur de période */}
            <View style={styles.periodSelector}>
              {periodOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.periodButton,
                    selectedPeriod === option.value && styles.periodButtonActive,
                  ]}
                  onPress={() => handlePeriodChange(option.value)}
                >
                  <Text
                    style={[
                      styles.periodButtonText,
                      selectedPeriod === option.value && styles.periodButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Info card */}
            <View style={styles.infoCard}>
              <Text style={styles.infoCardText}>
                💡 Ces statistiques vous aident à identifier les opportunités d'amélioration et à
                optimiser votre activité. Consultez les recommandations personnalisées ci-dessous.
              </Text>
            </View>

            {/* 1. Recommandations (en premier car importantes) */}
            <RecommendationsPanel recommendations={stats.recommendations} />

            {/* 2. KPIs principaux */}
            <KPIsPanel kpis={stats.kpis} chartWidth={layoutConfig.chartWidth} />

            {/* 3. Analyse des revenus */}
            <RevenueAnalysisPanel revenue={stats.revenue} chartWidth={layoutConfig.chartWidth} />

            {/* 4. Performance des plats */}
            <TopDishesChart dishes={stats.dishes_performance.top_dishes} chartWidth={layoutConfig.chartWidth} />

            {/* 5. Plats sous-performants */}
            <UnderperformingDishesPanel
              dishes={stats.dishes_performance.underperforming_dishes}
              neverOrderedCount={stats.dishes_performance.never_ordered_count}
            />

            {/* 6. Heures de pointe */}
            <PeakHoursChart
              peakHours={stats.peak_hours}
              hourlyDistribution={stats.hourly_distribution}
              chartWidth={layoutConfig.chartWidth}
            />

            {/* 7. Performance par jour */}
            <DailyPerformanceChart
              dailyPerformance={stats.daily_performance}
              chartWidth={layoutConfig.chartWidth}
            />

            {/* Statistiques de base (overview) */}
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>📋 Résumé de l'activité</Text>

              <View style={styles.summaryContent}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total commandes</Text>
                  <Text style={styles.summaryValue}>
                    {stats.overview.orders.total}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Commandes en cours</Text>
                  <Text style={styles.summaryValueInfo}>
                    {stats.overview.orders.in_progress}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Commandes servies</Text>
                  <Text style={styles.summaryValueSuccess}>
                    {stats.overview.orders.served}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Menus actifs</Text>
                  <Text style={styles.summaryValue}>
                    {stats.overview.menus.active} / {stats.overview.menus.total}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Plats disponibles</Text>
                  <Text style={styles.summaryValue}>
                    {stats.overview.menu_items.available} / {stats.overview.menu_items.total}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tables</Text>
                  <Text style={styles.summaryValue}>
                    {stats.overview.tables.total}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// COMPOSANT PRINCIPAL - WRAPPER AVEC AUTOSELECTOR
// ============================================================================

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