import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ViewStyle,
  TextStyle,
  Alert,
  Text,
  Pressable,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { SearchBar } from '@/components/common/SearchBar';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Restaurant } from '@/types/restaurant';
import { 
  COLORS, 
  SPACING, 
  useScreenType, 
  getResponsiveValue,
  createResponsiveStyles,
  TYPOGRAPHY,
  BORDER_RADIUS,
  SHADOWS,
  ANIMATIONS,
} from '@/utils/designSystem';

// Composant de statistique animé
const StatItem = ({ 
  value, 
  label, 
  icon, 
  color = COLORS.text.primary,
  isGolden = false 
}: { 
  value: number | string; 
  label: string; 
  icon: string;
  color?: string;
  isGolden?: boolean;
}) => {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const screenType = useScreenType();
  const responsiveStyles = createResponsiveStyles(screenType);

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, [value]);

  const iconSize = getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType);
  const valueSize = getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType);

  return (
    <Animated.View 
      style={[
        styles.statItem,
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      <View style={[
        styles.statIconContainer(screenType),
        isGolden && styles.statIconGolden,
        !isGolden && { backgroundColor: `${color}15` }
      ]}>
        <Ionicons 
          name={icon as any} 
          size={iconSize} 
          color={isGolden ? COLORS.variants.secondary[600] : color} 
        />
      </View>
      <Text style={[
        styles.statValue(screenType),
        { color: isGolden ? COLORS.text.golden : color }
      ]}>
        {value}
      </Text>
      <Text style={styles.statLabel(screenType)}>
        {label}
      </Text>
    </Animated.View>
  );
};

// Composant de bouton de vue animé
const ViewModeButton = ({ 
  viewMode, 
  onPress,
  screenType 
}: { 
  viewMode: 'grid' | 'list';
  onPress: () => void;
  screenType: 'mobile' | 'tablet' | 'desktop';
}) => {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.viewButton(screenType),
        pressed && styles.viewButtonPressed
      ]}
    >
      <Ionicons
        name={viewMode === 'grid' ? 'list' : 'grid'}
        size={24}
        color={COLORS.text.primary}
      />
      {screenType !== 'mobile' && (
        <Text style={styles.viewButtonText(screenType)}>
          {viewMode === 'grid' ? 'Liste' : 'Grille'}
        </Text>
      )}
    </Pressable>
  );
};

// Composant animé pour les items de restaurant
const AnimatedRestaurantItem = ({
  item,
  index,
  viewMode,
  screenType
}: {
  item: Restaurant;
  index: number;
  viewMode: 'grid' | 'list';
  screenType: 'mobile' | 'tablet' | 'desktop';
}) => {
  const itemAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(itemAnim, {
      toValue: 1,
      duration: ANIMATIONS.duration.normal,
      delay: Math.min(index * 50, 500),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View 
      style={[
        viewMode === 'grid' ? styles.gridItem(screenType) : styles.listItem(screenType),
        {
          opacity: itemAnim,
          transform: [{
            translateY: itemAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0],
            }),
          }],
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

export default function RestaurantsScreen() {
  const {
    restaurants,
    isLoading,
    filters,
    pagination,
    loadRestaurants,
    searchRestaurants,
    setFilters,
  } = useRestaurant();

  const screenType = useScreenType();
  const responsiveStyles = createResponsiveStyles(screenType);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

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
      } catch (error) {
        Alert.alert('Erreur', 'Impossible de rechercher les restaurants');
      }
    } else {
      await loadRestaurants(filters);
    }
  }, [searchQuery, filters]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadRestaurants(filters, 1);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de rafraîchir la liste');
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || pagination.page >= pagination.pages) return;

    setLoadingMore(true);
    try {
      await loadRestaurants(filters, pagination.page + 1);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger plus de restaurants');
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
      <Animated.View 
        style={[
          styles.headerContainer(screenType),
          { opacity: fadeAnim }
        ]}
      >
        {/* Carte de statistiques premium */}
        <View style={styles.statsCard(screenType)}>
          <View style={styles.statsHeader(screenType)}>
            <View style={styles.statsBadge(screenType)}>
              <Ionicons name="stats-chart" size={14} color={COLORS.variants.secondary[700]} />
              <Text style={styles.statsBadgeText(screenType)}>
                Vue d'ensemble
              </Text>
            </View>
          </View>

          <View style={styles.statsGrid(screenType)}>
            <StatItem
              icon="restaurant"
              value={restaurants.length}
              label={`Restaurant${restaurants.length > 1 ? 's' : ''}`}
              color={COLORS.primary}
              isGolden
            />
            
            <View style={styles.statDivider} />
            
            <StatItem
              icon="checkmark-circle"
              value={activeCount}
              label={`Ouvert${activeCount > 1 ? 's' : ''}`}
              color={COLORS.success}
            />
            
            {inactiveCount > 0 && screenType !== 'mobile' && (
              <>
                <View style={styles.statDivider} />
                <StatItem
                  icon="close-circle"
                  value={inactiveCount}
                  label="Fermé"
                  color={COLORS.error}
                />
              </>
            )}
          </View>

          {pagination.pages > 1 && (
            <View style={styles.paginationInfo(screenType)}>
              <Ionicons name="documents-outline" size={14} color={COLORS.text.light} />
              <Text style={styles.paginationText(screenType)}>
                Page {pagination.page} sur {pagination.pages}
              </Text>
            </View>
          )}
        </View>

        {/* Barre de contrôles */}
        <View style={styles.controlsContainer(screenType)}>
          <View style={styles.searchContainer}>
            <SearchBar
              placeholder="Rechercher un restaurant..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSearch={handleSearch}
              onFilter={() => {/* Ouvrir modal de filtres */}}
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
          <View style={styles.activeFilters(screenType)}>
            <Ionicons name="funnel" size={16} color={COLORS.variants.secondary[600]} />
            <Text style={styles.activeFiltersText(screenType)}>
              {Object.keys(filters).length} filtre{Object.keys(filters).length > 1 ? 's' : ''} actif{Object.keys(filters).length > 1 ? 's' : ''}
            </Text>
            <Pressable onPress={() => setFilters({})}>
              <Text style={styles.clearFiltersText(screenType)}>
                Effacer
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
      <View style={styles.footerLoader(screenType)}>
        <Loading style={{ paddingVertical: getResponsiveValue(SPACING.md, screenType) }} />
        <Text style={styles.loaderText(screenType)}>
          Chargement...
        </Text>
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) {
      return <Loading fullScreen text="Chargement des restaurants..." />;
    }
    
    return (
      <Animated.View style={{ opacity: fadeAnim }}>
        <View style={styles.emptyState(screenType)}>
          <View style={styles.emptyContent(screenType)}>
            <View style={styles.emptyIconContainer(screenType)}>
              <Ionicons
                name={searchQuery ? "search-outline" : "restaurant-outline"}
                size={getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType)}
                color={COLORS.variants.secondary[500]}
              />
            </View>
            
            <Text style={styles.emptyTitle(screenType)}>
              {searchQuery ? 'Aucun résultat' : 'Aucun restaurant'}
            </Text>
            
            <Text style={styles.emptyDescription(screenType)}>
              {searchQuery 
                ? 'Essayez de modifier votre recherche ou ajustez les filtres'
                : 'Commencez par ajouter votre premier restaurant pour gérer vos commandes'
              }
            </Text>
            
            {!searchQuery && (
              <View style={styles.emptyActions(screenType)}>
                <Button
                  title="Ajouter un restaurant"
                  variant="primary"
                  size="lg"
                  onPress={() => router.push('/restaurant/add')}
                  style={styles.emptyButton}
                  leftIcon={<Ionicons name="add-circle" size={24} color="#fff" />}
                />
                
                <Pressable 
                  style={styles.emptySecondaryAction}
                  onPress={() => {/* Guide d'utilisation */}}
                >
                  <Ionicons name="help-circle-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.emptySecondaryText(screenType)}>
                    Comment ça marche ?
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  const numColumns = viewMode === 'grid' ? (screenType === 'desktop' ? 3 : screenType === 'tablet' ? 2 : 1) : 1;

  return (
    <View style={styles.container}>
      <Header 
        title="Restaurants" 
        subtitle={`${restaurants.length} établissement${restaurants.length > 1 ? 's' : ''}`}
        rightIcon="add-outline"
        onRightPress={() => router.push('/restaurant/add')}
      />

      <FlatList
        key={`${viewMode}-${numColumns}`}
        data={restaurants}
        renderItem={renderRestaurant}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent(screenType)}
        columnWrapperStyle={viewMode === 'grid' && numColumns > 1 ? styles.columnWrapper(screenType) : undefined}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={[COLORS.variants.secondary[500]]}
            tintColor={COLORS.variants.secondary[500]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  } as ViewStyle,

  listContent: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
    paddingBottom: getResponsiveValue(SPACING['4xl'], screenType),
  }),

  columnWrapper: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    gap: getResponsiveValue(SPACING.lg, screenType),
    justifyContent: screenType === 'tablet' ? 'space-between' : 'flex-start',
  }),

  headerContainer: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    gap: getResponsiveValue(SPACING.md, screenType),
    marginTop: getResponsiveValue(SPACING.md, screenType),
    marginBottom: getResponsiveValue(SPACING.lg, screenType),
  }),

  // Carte de stats
  statsCard: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    backgroundColor: COLORS.goldenSurface,
    borderRadius: BORDER_RADIUS.xl,
    padding: getResponsiveValue(SPACING.lg, screenType),
    borderWidth: 1,
    borderColor: COLORS.border.golden,
    ...SHADOWS.card,
  }),

  statsHeader: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: getResponsiveValue(SPACING.md, screenType),
  }),

  statsBadge: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.variants.secondary[100],
    paddingHorizontal: getResponsiveValue({ mobile: 10, tablet: 12, desktop: 14 }, screenType),
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  }),

  statsBadgeText: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    color: COLORS.variants.secondary[700],
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
    fontWeight: '600',
  }),

  statsGrid: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: getResponsiveValue(SPACING.sm, screenType),
  }),

  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,

  statIconContainer: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    width: getResponsiveValue({ mobile: 36, tablet: 40, desktop: 44 }, screenType),
    height: getResponsiveValue({ mobile: 36, tablet: 40, desktop: 44 }, screenType),
    borderRadius: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  }),

  statIconGolden: {
    backgroundColor: COLORS.variants.secondary[100],
    ...SHADOWS.goldenGlow,
  } as ViewStyle,

  statValue: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
    fontWeight: '700',
  }),

  statLabel: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
    color: COLORS.text.secondary,
    textAlign: 'center',
  }),

  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.border.golden,
    opacity: 0.4,
    marginHorizontal: 4,
  } as ViewStyle,

  paginationInfo: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: getResponsiveValue(SPACING.sm, screenType),
    paddingTop: getResponsiveValue(SPACING.sm, screenType),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.golden,
  }),

  paginationText: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    color: COLORS.text.light,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
  }),

  // Contrôles
  controlsContainer: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveValue(SPACING.sm, screenType),
  }),

  searchContainer: {
    flex: 1,
  } as ViewStyle,

  viewButton: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    minWidth: screenType === 'mobile' ? 48 : 88,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: screenType === 'mobile' ? 'column' : 'row',
    gap: screenType === 'mobile' ? 2 : 8,
    paddingHorizontal: screenType === 'mobile' ? 8 : 16,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    ...SHADOWS.sm,
  }),

  viewButtonPressed: {
    backgroundColor: COLORS.border.light,
  } as ViewStyle,

  viewButtonText: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    color: COLORS.text.secondary,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: '500',
  }),

  // Filtres actifs
  activeFilters: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.variants.secondary[50],
    paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
    paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border.golden,
  }),

  activeFiltersText: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    flex: 1,
    color: COLORS.variants.secondary[700],
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: '500',
  }),

  clearFiltersText: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    color: COLORS.primary,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: '600',
  }),

  // Grille
  gridItem: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flex: 1,
    maxWidth: screenType === 'desktop' ? 380 : screenType === 'tablet' ? 340 : '100%',
    marginBottom: getResponsiveValue(SPACING.lg, screenType),
  }),

  listItem: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    marginBottom: getResponsiveValue(SPACING.md, screenType),
  }),

  // Footer
  footerLoader: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    paddingVertical: getResponsiveValue(SPACING.xl, screenType),
    alignItems: 'center',
  }),

  loaderText: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    marginTop: getResponsiveValue(SPACING.sm, screenType),
    color: COLORS.text.light,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
  }),

  // État vide
  emptyState: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    marginTop: getResponsiveValue(SPACING['2xl'], screenType),
    backgroundColor: COLORS.goldenSurface,
    borderRadius: BORDER_RADIUS['2xl'],
    padding: getResponsiveValue(SPACING.xl, screenType),
    borderWidth: 1,
    borderColor: COLORS.border.golden,
    alignItems: 'center',
    ...SHADOWS.card,
  }),

  emptyContent: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    alignItems: 'center',
    maxWidth: screenType === 'mobile' ? 320 : 480,
    paddingVertical: getResponsiveValue(SPACING.lg, screenType),
  }),

  emptyIconContainer: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    width: getResponsiveValue({ mobile: 96, tablet: 112, desktop: 128 }, screenType),
    height: getResponsiveValue({ mobile: 96, tablet: 112, desktop: 128 }, screenType),
    borderRadius: getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType),
    backgroundColor: COLORS.variants.secondary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getResponsiveValue(SPACING.lg, screenType),
    ...SHADOWS.sm,
  }),

  emptyTitle: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginTop: getResponsiveValue(SPACING.sm, screenType),
  }),

  emptyDescription: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginTop: getResponsiveValue(SPACING.sm, screenType),
    lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
  }),

  emptyActions: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    width: '100%',
    gap: getResponsiveValue(SPACING.md, screenType),
    marginTop: getResponsiveValue(SPACING.xl, screenType),
    alignItems: 'center',
  }),

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

  emptySecondaryText: (screenType: 'mobile' | 'tablet' | 'desktop'): TextStyle => ({
    color: COLORS.primary,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: '600',
  }),
};