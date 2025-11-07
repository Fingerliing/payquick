import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-chart-kit';

// Contexts
import { useComptabilite } from '@/contexts/ComptabiliteContext';

// Components
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Alert } from '@/components/ui/Alert';

// Design System
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY,
} from '@/utils/designSystem';

// Types
import type { ComptabiliteStats } from '@/types/comptabilite';

// Helpers responsive pour récupérer un nombre depuis les tokens
const s = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof SPACING) =>
  getResponsiveValue(SPACING[key], screenType);
const fs = (screenType: 'mobile' | 'tablet' | 'desktop', key: keyof typeof TYPOGRAPHY.fontSize) =>
  getResponsiveValue(TYPOGRAPHY.fontSize[key], screenType);

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================
export const ComptabiliteDashboard: React.FC = () => {
  const {
    stats,
    statsLoading,
    statsError,
    loadStats,
    isConfigured,
    checkConfiguration,
    settings,
    loadSettings,
  } = useComptabilite();

  const screenType = useScreenType();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // 1) Vérifier la config au montage uniquement
  useEffect(() => {
    checkConfiguration();
  }, []);

  // 2) Charger settings + stats quand config OK ou année change
  useEffect(() => {
    const run = async () => {
      if (!isConfigured) return;
      await loadSettings();
      await loadStats(selectedYear);
    };
    run();
  }, [isConfigured, selectedYear]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadStats(selectedYear);
    } finally {
      setRefreshing(false);
    }
  };

  // Styles dépendants du screenType
  const styles = useMemo(() => {
    const paddingLg = s(screenType, 'lg');
    const paddingMd = s(screenType, 'md');
    const paddingSm = s(screenType, 'sm');
    const paddingXs = s(screenType, 'xs');
    const gapMd = s(screenType, 'md');
    const gapLg = s(screenType, 'lg');

    return {
      container: {
        flex: 1,
        backgroundColor: COLORS.background,
        padding: paddingLg,
      },
      header: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'flex-start' as const,
        marginBottom: paddingLg,
      },
      title: {
        fontSize: fs(screenType, '3xl'),
        fontWeight: TYPOGRAPHY.fontWeight.bold,
        color: COLORS.text.primary,
      },
      subtitle: {
        marginTop: paddingXs,
        fontSize: fs(screenType, 'base'),
        fontWeight: TYPOGRAPHY.fontWeight.normal,
        color: COLORS.text.secondary,
      },
      sectionTitle: {
        fontSize: fs(screenType, 'xl'),
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        color: COLORS.text.primary,
        marginBottom: paddingMd,
      },
      yearSelector: {
        flexDirection: 'row' as const,
      },
      yearButton: {
        paddingHorizontal: paddingMd,
        paddingVertical: paddingSm,
        borderRadius: BORDER_RADIUS.md,
        backgroundColor: COLORS.border.light,
        marginLeft: paddingXs / 2,
      },
      yearButtonActive: {
        backgroundColor: COLORS.primary,
      },
      yearButtonText: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },
      yearButtonTextActive: {
        color: COLORS.text.inverse,
        fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      },
      statsGrid: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        marginBottom: paddingLg,
        marginHorizontal: -gapMd / 2,
      },
      statCardWrapper: {
        flex: 1,
        minWidth: 150,
        paddingHorizontal: gapMd / 2,
        marginBottom: gapMd,
      },
      statCard: {
        padding: paddingLg,
        alignItems: 'center' as const,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      statIconContainer: {
        width: 48,
        height: 48,
        borderRadius: BORDER_RADIUS.full,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginBottom: paddingSm,
      },
      statValue: {
        fontSize: fs(screenType, '2xl'),
        fontWeight: TYPOGRAPHY.fontWeight.bold,
        color: COLORS.text.primary,
        marginBottom: paddingXs,
      },
      statLabel: {
        fontSize: fs(screenType, 'sm'),
        color: COLORS.text.secondary,
        textAlign: 'center' as const,
      },
      chartCard: {
        padding: paddingLg,
        marginBottom: paddingLg,
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        ...SHADOWS.card,
      },
      cardTitle: {
        fontSize: fs(screenType, 'xl'),
        fontWeight: TYPOGRAPHY.fontWeight.semibold,
        color: COLORS.text.primary,
        marginBottom: paddingMd,
      },
      emptyState: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.secondary,
      },
      quickActions: {
        marginTop: paddingLg,
      },
      actionsGrid: {
        flexDirection: 'row' as const,
        flexWrap: 'wrap' as const,
        marginHorizontal: -gapMd / 2,
      },
      quickActionButtonWrapper: {
        flex: 1,
        minWidth: 150,
        paddingHorizontal: gapMd / 2,
        marginBottom: gapMd,
      },
      quickActionButton: {
        backgroundColor: COLORS.surface,
        borderRadius: BORDER_RADIUS.lg,
        padding: paddingLg,
        alignItems: 'center' as const,
        ...SHADOWS.sm,
      },
      quickActionIcon: {
        width: 56,
        height: 56,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: `${COLORS.primary}25`,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginBottom: paddingSm,
      },
      quickActionLabel: {
        fontSize: fs(screenType, 'base'),
        color: COLORS.text.primary,
        textAlign: 'center' as const,
        fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      },
    } as const;
  }, [screenType]);

  // Si pas configuré
  if (!isConfigured) {
    return (
      <View style={styles.container}>
      <Alert
        variant="warning"
        title="Configuration requise"
        message="Veuillez configurer vos paramètres comptables pour accéder au dashboard."
      />
        <Button
          title="Configurer maintenant"
          onPress={() => router.push('/comptabilite/settings')}
          style={{ marginTop: s(screenType, 'md') }}
        />
      </View>
    );
  }

  // Chargement initial
  if (statsLoading && !stats) {
    return <Loading text="Chargement des statistiques..." />;
  }

  // Erreur
  if (statsError) {
    return (
      <View style={styles.container}>
        <Alert variant="error" title="Erreur" message={statsError} />
        <Button title="Réessayer" onPress={() => loadStats(selectedYear)} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Comptabilité</Text>
          <Text style={styles.subtitle}>
            {settings?.siret ? `SIRET: ${settings.siret}` : '—'}
          </Text>
        </View>

        {/* Sélecteur d'année */}
        <YearSelector
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          styles={styles}
        />
      </View>

      {/* Indicateur de chargement léger quand l'année change */}
      {statsLoading && !!stats && (
        <View style={{ marginBottom: s(screenType, 'md') }}>
          <Loading size="small" text="Mise à jour des données…" />
        </View>
      )}

      {/* Cartes de statistiques */}
      <View style={styles.statsGrid}>
        <View style={styles.statCardWrapper}>
          <DashboardStatCard
            icon="cash-outline"
            label="CA TTC"
            value={formatCurrency(stats?.caTotalTtc || 0)}
            color={COLORS.primary}
            styles={styles}
          />
        </View>
        <View style={styles.statCardWrapper}>
          <DashboardStatCard
            icon="calculator-outline"
            label="TVA Collectée"
            value={formatCurrency(stats?.tvaTotale || 0)}
            color={COLORS.success}
            styles={styles}
          />
        </View>
        <View style={styles.statCardWrapper}>
          <DashboardStatCard
            icon="document-text-outline"
            label="Factures"
            value={stats?.nombreFactures ?? 0}
            color={COLORS.info}
            styles={styles}
          />
        </View>
        <View style={styles.statCardWrapper}>
          <DashboardStatCard
            icon="trending-up-outline"
            label="Ticket Moyen"
            value={formatCurrency(stats?.ticketMoyen || 0)}
            color={COLORS.warning}
            styles={styles}
          />
        </View>
      </View>

      {/* Graphique CA mensuel */}
      <Card style={styles.chartCard}>
        <Text style={styles.cardTitle}>Chiffre d'affaires mensuel</Text>
        {stats?.parMois && stats.parMois.length > 0 ? (
          <CAMensuelChart data={stats.parMois} />
        ) : (
          <Text style={styles.emptyState}>Aucune donnée pour cette période.</Text>
        )}
      </Card>

      {/* Répartition TVA */}
      <Card style={styles.chartCard}>
        <Text style={styles.cardTitle}>Répartition TVA</Text>
        {stats?.parTauxTVA ? (
          <TVABreakdownChart data={stats.parTauxTVA} />
        ) : (
          <Text style={styles.emptyState}>Aucune donnée de TVA disponible.</Text>
        )}
      </Card>

      <View style={{ height: s(screenType, 'xl') }} />

      {/* Actions rapides */}
      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        <View style={styles.actionsGrid}>
          <View style={styles.quickActionButtonWrapper}>
            <QuickActionButton
              icon="document-outline"
              label="Récaps TVA"
              onPress={() => router.push('/comptabilite/recaps' as any)}
              styles={styles}
            />
          </View>
          <View style={styles.quickActionButtonWrapper}>
            <QuickActionButton
              icon="download-outline"
              label="Exports"
              onPress={() => router.push('/comptabilite/exports' as any)}
              styles={styles}
            />
          </View>
          <View style={styles.quickActionButtonWrapper}>
            <QuickActionButton
              icon="folder-outline"
              label="Générer FEC"
              onPress={() => router.push('/comptabilite/fec' as any)}
              styles={styles}
            />
          </View>
          <View style={styles.quickActionButtonWrapper}>
            <QuickActionButton
              icon="settings-outline"
              label="Paramètres"
              onPress={() => router.push('/comptabilite/settings' as any)}
              styles={styles}
            />
          </View>
        </View>
      </View>

      <View style={{ height: s(screenType, 'xl') }} />
    </ScrollView>
  );
};

// ============================================================================
// COMPOSANTS ENFANTS
// ============================================================================
interface DashboardStatCardProps {
  icon: any;
  label: string;
  value: string | number;
  color: string;
  styles: ReturnType<typeof useMemo> extends infer T ? any : any; // simplifié
}

const DashboardStatCard: React.FC<DashboardStatCardProps> = ({
  icon,
  label,
  value,
  color,
  styles,
}) => {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

interface YearSelectorProps {
  selectedYear: number;
  onYearChange: (year: number) => void;
  styles: any;
}

const YearSelector: React.FC<YearSelectorProps> = ({
  selectedYear,
  onYearChange,
  styles,
}) => {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <View style={styles.yearSelector}>
      {years.map((year) => {
        const active = year === selectedYear;
        return (
          <TouchableOpacity
            key={year}
            style={[styles.yearButton, active && styles.yearButtonActive]}
            onPress={() => onYearChange(year)}
            accessibilityRole="button"
            accessibilityLabel={`Filtrer sur l'année ${year}`}
          >
            <Text style={[styles.yearButtonText, active && styles.yearButtonTextActive]}>
              {year}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

interface CAMensuelChartProps {
  data: Array<{ month: number; caTtc: number }>;
}

const CAMensuelChart: React.FC<CAMensuelChartProps> = ({ data }) => {
  const { width } = useWindowDimensions();

  const chartData = useMemo(
    () => ({
      labels: data.map((d) => getMonthName(d.month)),
      datasets: [
        {
          data: data.map((d) => d.caTtc),
          color: () => COLORS.primary,
          strokeWidth: 2,
        },
      ],
      legend: ['CA TTC'],
    }),
    [data]
  );

  return (
    <LineChart
      data={chartData}
      width={width - 2 * 16} // marge prudente
      height={220}
      chartConfig={{
        backgroundColor: COLORS.surface,
        backgroundGradientFrom: COLORS.surface,
        backgroundGradientTo: COLORS.surface,
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(30, 42, 120, ${opacity})`,
        labelColor: () => COLORS.text.secondary,
        style: {
          borderRadius: BORDER_RADIUS.md,
        },
        propsForDots: {
          r: '4',
          strokeWidth: '2',
          stroke: COLORS.primary,
        },
      }}
      bezier
      fromZero
      style={{
        marginVertical: 8,
        borderRadius: BORDER_RADIUS.md,
      }}
    />
  );
};

interface TVABreakdownChartProps {
  data: Partial<{ '5.5': number; '10': number; '20': number }>;
}

const TVABreakdownChart: React.FC<TVABreakdownChartProps> = ({ data }) => {
  const { width } = useWindowDimensions();

  const d55 = data['5.5'] ?? 0;
  const d10 = data['10'] ?? 0;
  const d20 = data['20'] ?? 0;

  const chartData = useMemo(
    () => ({
      labels: ['5.5%', '10%', '20%'],
      datasets: [{ data: [d55, d10, d20] }],
      legend: ['Montants collectés'],
    }),
    [d55, d10, d20]
  );

  return (
    <BarChart
      data={chartData}
      width={width - 2 * 16}
      height={220}
      yAxisLabel="€"
      yAxisSuffix="€"
      fromZero
      chartConfig={{
        backgroundColor: COLORS.surface,
        backgroundGradientFrom: COLORS.surface,
        backgroundGradientTo: COLORS.surface,
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
        labelColor: () => COLORS.text.secondary,
        style: {
          borderRadius: BORDER_RADIUS.md,
        },
      }}
      style={{
        marginVertical: 8,
        borderRadius: BORDER_RADIUS.md,
      }}
    />
  );
};

interface QuickActionButtonProps {
  icon: any;
  label: string;
  onPress: () => void;
  styles: any;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  icon,
  label,
  onPress,
  styles,
}) => {
  return (
    <TouchableOpacity
      style={styles.quickActionButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={24} color={COLORS.primary} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

// ============================================================================
// UTILITAIRES
// ============================================================================
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

function getMonthName(month: number): string {
  const safeMonth = Math.min(12, Math.max(1, month)) - 1;
  const date = new Date(2020, safeMonth, 1);
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' })
    .format(date)
    .replace('.', '')
    .replace(/^./, (c) => c.toUpperCase());
}
