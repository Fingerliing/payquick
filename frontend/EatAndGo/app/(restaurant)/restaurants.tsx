import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ViewStyle,
  Alert,
  Text,
  Pressable,
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
} from '@/utils/designSystem';

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

  useEffect(() => {
    loadRestaurants();
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

  const renderRestaurant = ({ item }: { item: Restaurant }) => (
    <View style={viewMode === 'grid' ? styles.gridItem(screenType) : styles.listItem}>
      <RestaurantCard
        restaurant={item}
        onPress={() => router.push(`/restaurant/${item.id}`)}
        variant="default"
      />
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContainer(screenType)}>
      {/* Statistiques rapides */}
      <Card variant="elevated" padding="md" style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={responsiveStyles.textTitleGolden}>
              {restaurants.length}
            </Text>
            <Text style={responsiveStyles.textCaption}>
              Restaurant{restaurants.length > 1 ? 's' : ''}
            </Text>
          </View>
          
          <View style={[styles.statDivider, { backgroundColor: COLORS.border.golden }]} />
          
          <View style={styles.statItem}>
            <Text style={[responsiveStyles.textTitle, { color: COLORS.success }]}>
              {restaurants.filter(r => r.isActive).length}
            </Text>
            <Text style={responsiveStyles.textCaption}>
              Ouvert{restaurants.filter(r => r.isActive).length > 1 ? 's' : ''}
            </Text>
          </View>
          
          {pagination.pages > 1 && (
            <>
              <View style={[styles.statDivider, { backgroundColor: COLORS.border.default }]} />
              <View style={styles.statItem}>
                <Text style={responsiveStyles.textTitle}>
                  {pagination.page}/{pagination.pages}
                </Text>
                <Text style={responsiveStyles.textCaption}>
                  Pages
                </Text>
              </View>
            </>
          )}
        </View>
      </Card>

      {/* Barre de contrôles */}
      <View style={styles.controlsRow(screenType)}>
        <View style={{ flex: 1 }}>
          <SearchBar
            placeholder="Rechercher un restaurant..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSearch={handleSearch}
            onFilter={() => {/* Ouvrir modal de filtres */}}
          />
        </View>
        
        {/* Bouton de vue */}
        <Pressable
          onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          style={styles.viewButton(screenType)}
          android_ripple={{ color: COLORS.overlay }}
        >
          <Ionicons
            name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
            size={24}
            color={COLORS.text.primary}
          />
        </Pressable>
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader(screenType)}>
        <Loading style={{ paddingVertical: getResponsiveValue(SPACING.lg, screenType) }} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) {
      return <Loading fullScreen text="Chargement des restaurants..." />;
    }
    
    return (
      <Card 
        variant="surface" 
        padding="xl" 
        style={styles.emptyState(screenType)}
      >
        <View style={styles.emptyContent(screenType)}>
          <View style={styles.emptyIconContainer(screenType)}>
            <Ionicons
              name="restaurant-outline"
              size={getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType)}
              color={COLORS.text.light}
            />
          </View>
          
          <Text style={[responsiveStyles.textSubtitle, { textAlign: 'center' }]}>
            Aucun restaurant trouvé
          </Text>
          
          <Text style={[responsiveStyles.textBody, { textAlign: 'center', marginTop: getResponsiveValue(SPACING.sm, screenType) }]}>
            {searchQuery 
              ? 'Essayez de modifier votre recherche'
              : 'Commencez par ajouter votre premier restaurant'
            }
          </Text>
          
          <Button
            title="Ajouter un restaurant"
            variant="primary"
            size="lg"
            onPress={() => router.push('/restaurant/add')}
            style={{ marginTop: getResponsiveValue(SPACING.xl, screenType) }}
            leftIcon={<Ionicons name="add" size={20} color="#fff" />}
          />
        </View>
      </Card>
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
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
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
  }),

  headerContainer: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    gap: getResponsiveValue(SPACING.lg, screenType),
    marginTop: getResponsiveValue(SPACING.md, screenType),
    marginBottom: getResponsiveValue(SPACING.lg, screenType),
  }),

  statsCard: {
    marginBottom: getResponsiveValue(SPACING.sm, 'mobile'),
  } as ViewStyle,

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  } as ViewStyle,

  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  } as ViewStyle,

  statDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 8,
  } as ViewStyle,

  controlsRow: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: getResponsiveValue(SPACING.sm, screenType),
  }),

  viewButton: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  }),

  gridItem: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    flex: 1,
    marginBottom: getResponsiveValue(SPACING.lg, screenType),
  }),

  listItem: {
    marginBottom: getResponsiveValue(SPACING.md, 'mobile'),
  } as ViewStyle,

  footerLoader: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    paddingVertical: getResponsiveValue(SPACING.xl, screenType),
  }),

  emptyState: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    marginTop: getResponsiveValue(SPACING['3xl'], screenType),
    alignItems: 'center',
  }),

  emptyContent: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    alignItems: 'center',
    maxWidth: 400,
  }),

  emptyIconContainer: (screenType: 'mobile' | 'tablet' | 'desktop'): ViewStyle => ({
    width: getResponsiveValue({ mobile: 80, tablet: 96, desktop: 112 }, screenType),
    height: getResponsiveValue({ mobile: 80, tablet: 96, desktop: 112 }, screenType),
    borderRadius: getResponsiveValue({ mobile: 40, tablet: 48, desktop: 56 }, screenType),
    backgroundColor: COLORS.border.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: getResponsiveValue(SPACING.xl, screenType),
  }),
};