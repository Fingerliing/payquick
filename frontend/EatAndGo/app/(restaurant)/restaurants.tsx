import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ViewStyle,
  TextStyle,
  Text,
  Pressable,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { SearchBar } from '@/components/common/SearchBar';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Restaurant } from '@/types/restaurant';
import { Alert as InlineAlert } from '@/components/ui/Alert';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  ANIMATIONS,
  type AppColors,
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

// ============================================================================
// Hook bannières d'alertes
// ============================================================================
type AlertItem = {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
};

const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const pushAlert = useCallback(
    (variant: AlertItem['variant'], title: string | undefined, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts(prev => [{ id, variant, title, message }, ...prev]);
    },
    [],
  );
  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);
  return { alerts, pushAlert, dismissAlert };
};

// ============================================================================
// StatItem — composant stat animé
// ============================================================================
type StatItemProps = {
  value: number | string;
  label: string;
  icon: string;
  color?: string;
  isGolden?: boolean;
};

const StatItem: React.FC<StatItemProps> = ({ value, label, icon, color, isGolden = false }) => {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [value]);

  const iconSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);
  const effectiveColor = color ?? colors.text.primary;

  const iconContainerSize = getResponsiveValue(
    { mobile: 36, tablet: 40, desktop: 44 },
    screenType,
  );

  return (
    <Animated.View
      style={[
        { flex: 1, alignItems: 'center', gap: 4 },
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View
        style={[
          {
            width: iconContainerSize,
            height: iconContainerSize,
            borderRadius: iconContainerSize / 2,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
          },
          isGolden
            ? {
                backgroundColor: isDark
                  ? 'rgba(212, 175, 55, 0.18)'
                  : colors.variants.secondary[100],
                shadowColor: colors.secondary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 4,
              }
            : { backgroundColor: `${effectiveColor}15` },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={iconSize}
          color={isGolden ? colors.variants.secondary[600] : effectiveColor}
        />
      </View>
      <Text
        style={{
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
          fontWeight: '700',
          color: isGolden ? colors.text.golden : effectiveColor,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
          color: colors.text.secondary,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Animated.View>
  );
};

// ============================================================================
// ViewModeButton — toggle grille/liste
// ============================================================================
const ViewModeButton: React.FC<{
  viewMode: 'grid' | 'list';
  onPress: () => void;
  screenType: ScreenType;
}> = ({ viewMode, onPress, screenType }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          minWidth: screenType === 'mobile' ? 48 : 88,
          height: 48,
          borderRadius: BORDER_RADIUS.lg,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: screenType === 'mobile' ? 'column' : 'row',
          gap: screenType === 'mobile' ? 2 : 8,
          paddingHorizontal: screenType === 'mobile' ? 8 : 16,
          borderWidth: 1,
          borderColor: colors.border.default,
          ...shadows.sm,
        },
        pressed && { backgroundColor: colors.border.light },
      ]}
    >
      <Ionicons
        name={viewMode === 'grid' ? 'list' : 'grid'}
        size={24}
        color={colors.text.primary}
      />
      {screenType !== 'mobile' && (
        <Text
          style={{
            color: colors.text.secondary,
            fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
            fontWeight: '500',
          }}
        >
          {viewMode === 'grid'
            ? t('restaurantsList.viewMode.list')
            : t('restaurantsList.viewMode.grid')}
        </Text>
      )}
    </Pressable>
  );
};

// ============================================================================
// AnimatedRestaurantItem
// ============================================================================
const AnimatedRestaurantItem: React.FC<{
  item: Restaurant;
  index: number;
  viewMode: 'grid' | 'list';
  screenType: ScreenType;
}> = ({ item, index, viewMode, screenType }) => {
  const itemAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(itemAnim, {
      toValue: 1,
      duration: ANIMATIONS.duration.normal,
      delay: Math.min(index * 50, 500),
      useNativeDriver: true,
    }).start();
  }, []);

  const gridMaxWidth: any =
    screenType === 'desktop' ? 380 : screenType === 'tablet' ? 340 : '100%';

  return (
    <Animated.View
      style={[
        viewMode === 'grid'
          ? {
              flex: 1,
              maxWidth: gridMaxWidth,
              marginBottom: getResponsiveValue(SPACING.lg, screenType),
            }
          : {
              marginBottom: getResponsiveValue(SPACING.md, screenType),
            },
        {
          opacity: itemAnim,
          transform: [
            {
              translateY: itemAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <RestaurantCard
        restaurant={item}
        onPress={() => router.push(`/restaurant/${item.id}`)}
        variant="default"
      />
    </Animated.View>
  );
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================
export default function RestaurantsScreen() {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  const {
    restaurants,
    isLoading,
    filters,
    pagination,
    loadRestaurants,
    searchRestaurants,
    setFilters,
  } = useRestaurant();

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const { alerts, pushAlert, dismissAlert } = useAlerts();

  useEffect(() => {
    loadRestaurants();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIMATIONS.duration.slow,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim()) {
      try {
        await searchRestaurants(searchQuery.trim(), filters);
      } catch {
        pushAlert('error', t('common.error'), t('restaurantsList.errors.searchFailed'));
      }
    } else {
      try {
        await loadRestaurants(filters);
      } catch {
        pushAlert('error', t('common.error'), t('restaurantsList.errors.reloadFailed'));
      }
    }
  }, [searchQuery, filters, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadRestaurants(filters, 1);
    } catch {
      pushAlert('error', t('common.error'), t('restaurantsList.errors.refreshFailed'));
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || pagination.page >= pagination.pages) return;

    setLoadingMore(true);
    try {
      await loadRestaurants(filters, pagination.page + 1);
    } catch {
      pushAlert('error', t('common.error'), t('restaurantsList.errors.loadMoreFailed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const renderRestaurant = ({ item, index }: { item: Restaurant; index: number }) => (
    <AnimatedRestaurantItem
      item={item}
      index={index}
      viewMode={viewMode}
      screenType={screenType}
    />
  );

  const renderHeader = () => {
    const activeCount = restaurants.filter(r => r.isActive).length;
    const inactiveCount = restaurants.length - activeCount;

    return (
      <Animated.View style={[styles.headerContainer, { opacity: fadeAnim }]}>
        {/* Carte de statistiques premium */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <View style={styles.statsBadge}>
              <Ionicons
                name="stats-chart"
                size={14}
                color={colors.variants.secondary[700]}
              />
              <Text style={styles.statsBadgeText}>
                {t('restaurantsList.overview')}
              </Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <StatItem
              icon="restaurant"
              value={restaurants.length}
              label={t('restaurantsList.stats.totalLabel', { count: restaurants.length })}
              color={colors.primary}
              isGolden
            />

            <View style={styles.statDivider} />

            <StatItem
              icon="checkmark-circle"
              value={activeCount}
              label={t('restaurantsList.stats.openLabel', { count: activeCount })}
              color={colors.success}
            />

            {inactiveCount > 0 && screenType !== 'mobile' && (
              <>
                <View style={styles.statDivider} />
                <StatItem
                  icon="close-circle"
                  value={inactiveCount}
                  label={t('restaurantsList.stats.closedLabel', { count: inactiveCount })}
                  color={colors.error}
                />
              </>
            )}
          </View>

          {pagination.pages > 1 && (
            <View style={styles.paginationInfo}>
              <Ionicons name="documents-outline" size={14} color={colors.text.light} />
              <Text style={styles.paginationText}>
                {t('restaurantsList.pagination', {
                  current: pagination.page,
                  total: pagination.pages,
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Barre de contrôles */}
        <View style={styles.controlsContainer}>
          <View style={styles.searchContainer}>
            <SearchBar
              placeholder={t('restaurantsList.searchPlaceholder')}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSearch={handleSearch}
              onFilter={() => {
                /* Ouvrir modal de filtres */
              }}
            />
          </View>

          <ViewModeButton
            viewMode={viewMode}
            onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            screenType={screenType}
          />
        </View>

        {/* Indicateur de filtres actifs */}
        {Object.keys(filters).length > 0 && (
          <View style={styles.activeFilters}>
            <Ionicons name="funnel" size={16} color={colors.variants.secondary[600]} />
            <Text style={styles.activeFiltersText}>
              {t('restaurantsList.activeFilters', { count: Object.keys(filters).length })}
            </Text>
            <Pressable onPress={() => setFilters({})}>
              <Text style={styles.clearFiltersText}>
                {t('restaurantsList.clearFilters')}
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <Loading style={{ paddingVertical: getResponsiveValue(SPACING.md, screenType) }} />
        <Text style={styles.loaderText}>{t('restaurantsList.loading')}</Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) {
      return <Loading fullScreen text={t('restaurantsList.loadingFull')} />;
    }

    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        <View style={styles.emptyState}>
          <View style={styles.emptyContent}>
            <View style={styles.emptyIconContainer}>
              <Ionicons
                name={searchQuery ? 'search-outline' : 'restaurant-outline'}
                size={getResponsiveValue(
                  { mobile: 48, tablet: 56, desktop: 64 },
                  screenType,
                )}
                color={colors.variants.secondary[500]}
              />
            </View>

            <Text style={styles.emptyTitle}>
              {searchQuery
                ? t('restaurantsList.empty.noResultTitle')
                : t('restaurantsList.empty.noRestaurantTitle')}
            </Text>

            <Text style={styles.emptyDescription}>
              {searchQuery
                ? t('restaurantsList.empty.noResultDescription')
                : t('restaurantsList.empty.noRestaurantDescription')}
            </Text>

            {!searchQuery && (
              <View style={styles.emptyActions}>
                <Button
                  title={t('restaurantsList.empty.addCta')}
                  variant="primary"
                  size="lg"
                  onPress={() => router.push('/restaurant/add')}
                  style={styles.emptyButton}
                  leftIcon={<Ionicons name="add-circle" size={24} color="#fff" />}
                />

                <Pressable
                  style={styles.emptySecondaryAction}
                  onPress={() => router.push('/help/help' as any)}
                >
                  <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.emptySecondaryText}>
                    {t('restaurantsList.empty.howItWorks')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  const numColumns =
    viewMode === 'grid'
      ? screenType === 'desktop'
        ? 3
        : screenType === 'tablet'
          ? 2
          : 1
      : 1;

  return (
    <View style={styles.container}>
      <Header
        title={t('restaurantNav.restaurants')}
        subtitle={t('restaurantsList.subtitle', { count: restaurants.length })}
        rightIcon="add-outline"
        onRightPress={() => router.push('/restaurant/add')}
        showLanguageSwitcher
        showThemeSwitcher
      />

      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map(a => (
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

      <FlatList
        key={`${viewMode}-${numColumns}-${isDark ? 'd' : 'l'}`}
        data={restaurants}
        renderItem={renderRestaurant}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={
          viewMode === 'grid' && numColumns > 1 ? styles.columnWrapper : undefined
        }
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.variants.secondary[500]]}
            tintColor={colors.variants.secondary[500]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================
const makeStyles = (colors: AppColors, isDark: boolean, screenType: ScreenType) => {
  const shadows = makeShadows(colors);

  return {
    container: {
      flex: 1,
      backgroundColor: colors.background,
    } as ViewStyle,

    listContent: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: getResponsiveValue(SPACING['4xl'], screenType),
    } as ViewStyle,

    alertsContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
    } as ViewStyle,

    columnWrapper: {
      gap: getResponsiveValue(SPACING.lg, screenType),
      justifyContent: screenType === 'tablet' ? 'space-between' : 'flex-start',
    } as ViewStyle,

    headerContainer: {
      gap: getResponsiveValue(SPACING.md, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    } as ViewStyle,

    // Carte de stats — fond doré dans les 2 modes
    statsCard: {
      backgroundColor: colors.goldenSurface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderWidth: 1,
      borderColor: colors.border.golden,
      ...shadows.md,
    } as ViewStyle,

    statsHeader: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'center',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    } as ViewStyle,

    statsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.18)'
        : colors.variants.secondary[100],
      paddingHorizontal: getResponsiveValue(
        { mobile: 10, tablet: 12, desktop: 14 },
        screenType,
      ),
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
    } as ViewStyle,

    statsBadgeText: {
      color: colors.variants.secondary[700],
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: '600',
    } as TextStyle,

    statsGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    } as ViewStyle,

    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border.golden,
      opacity: 0.4,
      marginHorizontal: 4,
    } as ViewStyle,

    paginationInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: colors.border.golden,
    } as ViewStyle,

    paginationText: {
      color: colors.text.light,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    } as TextStyle,

    // Contrôles
    controlsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
    } as ViewStyle,

    searchContainer: {
      flex: 1,
    } as ViewStyle,

    // Filtres actifs
    activeFilters: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(212, 175, 55, 0.12)' : colors.variants.secondary[50],
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.golden,
    } as ViewStyle,

    activeFiltersText: {
      flex: 1,
      color: colors.variants.secondary[700],
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: '500',
    } as TextStyle,

    clearFiltersText: {
      color: colors.primary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: '600',
    } as TextStyle,

    // Footer
    footerLoader: {
      paddingVertical: getResponsiveValue(SPACING.xl, screenType),
      alignItems: 'center',
    } as ViewStyle,

    loaderText: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      color: colors.text.light,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    } as TextStyle,

    // État vide
    emptyState: {
      marginTop: getResponsiveValue(SPACING['2xl'], screenType),
      backgroundColor: colors.goldenSurface,
      borderRadius: BORDER_RADIUS['2xl'],
      padding: getResponsiveValue(SPACING.xl, screenType),
      borderWidth: 1,
      borderColor: colors.border.golden,
      alignItems: 'center',
      ...shadows.md,
    } as ViewStyle,

    emptyContent: {
      alignItems: 'center',
      maxWidth: screenType === 'mobile' ? 320 : 480,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
    } as ViewStyle,

    emptyIconContainer: {
      width: getResponsiveValue({ mobile: 96, tablet: 112, desktop: 128 }, screenType),
      height: getResponsiveValue({ mobile: 96, tablet: 112, desktop: 128 }, screenType),
      borderRadius: getResponsiveValue(
        { mobile: 48, tablet: 56, desktop: 64 },
        screenType,
      ),
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.18)'
        : colors.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      ...shadows.sm,
    } as ViewStyle,

    emptyTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: '700',
      // Titre en or chaud en dark — cohérent avec la migration
      color: isDark ? colors.text.golden : colors.text.primary,
      textAlign: 'center',
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    } as TextStyle,

    emptyDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.secondary,
      textAlign: 'center',
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
    } as TextStyle,

    emptyActions: {
      width: '100%',
      gap: getResponsiveValue(SPACING.md, screenType),
      marginTop: getResponsiveValue(SPACING.xl, screenType),
      alignItems: 'center',
    } as ViewStyle,

    emptyButton: {
      width: '100%',
      maxWidth: 300,
    } as ViewStyle,

    emptySecondaryAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
    } as ViewStyle,

    emptySecondaryText: {
      color: colors.primary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: '600',
    } as TextStyle,
  };
};