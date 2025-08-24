import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ListRenderItem,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/common/SearchBar';
import { Restaurant } from '@/types/restaurant';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS 
} from '@/utils/designSystem';

export default function BrowseRestaurantsScreen() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    numColumns: getResponsiveValue(
      { mobile: 1, tablet: 2, desktop: 3 },
      screenType
    ),
    itemSpacing: getResponsiveValue(SPACING.md, screenType),
    maxContentWidth: screenType === 'desktop' ? 1200 : undefined,
    isTabletLandscape: screenType === 'tablet' && width > 1000,
  };

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    try {
      console.log('🚀 Loading public restaurants...');
      setLoading(true);
      setError(null);
      
      const response = await restaurantService.getPublicRestaurants({
        page: 1,
        limit: 50,
      });
      
      console.log('🔥 Response received:', response);
      
      let restaurantsData: Restaurant[] = [];
      
      if (Array.isArray(response)) {
        restaurantsData = response;
      } else if (response && 'data' in response && Array.isArray(response.data)) {
        restaurantsData = response.data;
      } else if (response && 'results' in response && Array.isArray(response.results)) {
        restaurantsData = response.results;
      }
      
      console.log('✅ Public restaurants loaded:', restaurantsData.length);
      setRestaurants(restaurantsData);
      
    } catch (error: any) {
      console.error('❌ Error loading public restaurants:', error);
      
      if (error.status === 403) {
        setError('Les endpoints publics ne sont pas encore configurés. Veuillez contacter l\'administrateur.');
      } else if (error.status === 404) {
        setError('Service de restaurants non disponible. Les endpoints publics sont-ils configurés ?');
      } else if (error.status >= 500) {
        setError('Erreur serveur. Veuillez réessayer plus tard.');
      } else {
        setError(error.message || 'Erreur lors du chargement des restaurants');
      }
      
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRestaurants();
    setRefreshing(false);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      await loadRestaurants();
      return;
    }

    try {
      console.log('🔍 Searching public restaurants:', query);
      const results = await restaurantService.searchPublicRestaurants(query);
      
      let searchResults: Restaurant[] = [];
      if (Array.isArray(results)) {
        searchResults = results;
      } else if (results && Array.isArray(results)) {
        searchResults = results;
      }
      
      setRestaurants(searchResults);
    } catch (error: any) {
      console.error('❌ Search error:', error);
      // Fallback sur filtrage local
      const filtered = restaurants.filter(restaurant =>
        restaurant.name.toLowerCase().includes(query.toLowerCase()) ||
        restaurant.description?.toLowerCase().includes(query.toLowerCase()) ||
        restaurant.city.toLowerCase().includes(query.toLowerCase())
      );
      setRestaurants(filtered);
    }
  };

  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    searchContainer: {
      padding: layoutConfig.containerPadding,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    listContainer: {
      padding: layoutConfig.containerPadding,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    restaurantCard: {
      marginBottom: layoutConfig.itemSpacing,
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    restaurantHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },

    restaurantInfo: {
      flex: 1,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    restaurantName: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    restaurantDescription: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
    },

    restaurantAddress: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
    },

    voucherBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.success + '20',
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
      borderRadius: BORDER_RADIUS.sm,
      alignSelf: 'flex-start' as const,
    },

    voucherText: {
      fontSize: getResponsiveValue(
        { mobile: 10, tablet: 11, desktop: 12 },
        screenType
      ),
      color: COLORS.success,
      marginLeft: getResponsiveValue(SPACING.xs, screenType) / 2,
      fontWeight: '500' as const,
    },

    chevronIcon: {
      alignSelf: 'flex-start' as const,
    },

    restaurantDetails: {
      flexDirection: screenType === 'mobile' ? 'column' as const : 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: screenType === 'mobile' ? 'flex-start' as const : 'center' as const,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },

    detailRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType),
      flexWrap: 'wrap' as const,
    },

    detailItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType) / 2,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    detailText: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
    },

    statusText: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      fontWeight: '500' as const,
    },

    errorContainer: {
      margin: layoutConfig.containerPadding,
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.error + '10',
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.error,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    errorTitle: {
      color: COLORS.error,
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '500' as const,
    },

    errorMessage: {
      color: COLORS.error,
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },

    emptyContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(
        { mobile: 40, tablet: 60, desktop: 80 },
        screenType
      ),
      paddingHorizontal: layoutConfig.containerPadding,
    },

    emptyIcon: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    emptyTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 22, desktop: 26 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    emptySubtitle: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 16, desktop: 18 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },

    retryButton: {
      backgroundColor: COLORS.secondary,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },

    retryButtonText: {
      color: COLORS.text.primary,
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      fontWeight: '500' as const,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 18, desktop: 20 },
    screenType
  );

  const chevronSize = getResponsiveValue(
    { mobile: 20, tablet: 22, desktop: 24 },
    screenType
  );

  const renderRestaurantItem: ListRenderItem<Restaurant> = ({ item, index }) => (
    <Pressable 
      onPress={() => router.push(`/menu/client/${item.id}`)}
      android_ripple={{ 
        color: COLORS.primary + '20',
        borderless: false 
      }}
    >
      <Card style={styles.restaurantCard}>
        <View style={styles.restaurantHeader}>
          <View style={styles.restaurantInfo}>
            <Text style={styles.restaurantName}>
              {item.name}
            </Text>
            {item.description && (
              <Text style={styles.restaurantDescription}>
                {item.description}
              </Text>
            )}
            <Text style={styles.restaurantAddress}>
              {item.address}, {item.city}
            </Text>
            
            {/* Titres-restaurant */}
            {item.accepts_meal_vouchers && (
              <View style={styles.voucherBadge}>
                <Ionicons name="card-outline" size={iconSize - 4} color={COLORS.success} />
                <Text style={styles.voucherText}>
                  Titres-restaurant acceptés
                </Text>
              </View>
            )}
          </View>
          <View style={styles.chevronIcon}>
            <Ionicons name="chevron-forward" size={chevronSize} color={COLORS.text.secondary} />
          </View>
        </View>

        <View style={styles.restaurantDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Ionicons name="restaurant-outline" size={iconSize} color={COLORS.secondary} />
              <Text style={styles.detailText}>
                {item.cuisine || 'Restaurant'}
              </Text>
            </View>
            
            <View style={styles.detailItem}>
              <Text style={styles.detailText}>
                {'€'.repeat(item.priceRange || 2)}
              </Text>
            </View>
          </View>
          
          <View style={styles.detailItem}>
            <Ionicons 
              name={item.can_receive_orders ? "checkmark-circle" : "close-circle"} 
              size={iconSize} 
              color={item.can_receive_orders ? COLORS.success : COLORS.error} 
            />
            <Text style={[
              styles.statusText,
              { color: item.can_receive_orders ? COLORS.success : COLORS.error }
            ]}>
              {item.can_receive_orders ? "Ouvert" : "Fermé"}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        <Ionicons 
          name="restaurant-outline" 
          size={getResponsiveValue({ mobile: 64, tablet: 80, desktop: 96 }, screenType)} 
          color={COLORS.text.light} 
        />
      </View>
      <Text style={styles.emptyTitle}>
        {loading 
          ? 'Chargement...' 
          : searchQuery 
            ? 'Aucun restaurant trouvé' 
            : 'Aucun restaurant disponible'
        }
      </Text>
      {searchQuery && !loading && (
        <Text style={styles.emptySubtitle}>
          Essayez avec d'autres mots-clés
        </Text>
      )}
      {error && (
        <Pressable 
          style={styles.retryButton}
          onPress={loadRestaurants}
          android_ripple={{ 
            color: COLORS.primary + '20',
            borderless: false 
          }}
        >
          <Text style={styles.retryButtonText}>
            Réessayer
          </Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Restaurants" />

      <View style={styles.searchContainer}>
        <SearchBar
          placeholder="Rechercher un restaurant..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>
            Erreur de configuration
          </Text>
          <Text style={styles.errorMessage}>
            {error}
          </Text>
        </View>
      )}

      <FlatList
        data={restaurants}
        renderItem={renderRestaurantItem}
        keyExtractor={(item: Restaurant) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        numColumns={layoutConfig.numColumns}
        key={`${layoutConfig.numColumns}-${screenType}`}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyComponent}
      />
    </SafeAreaView>
  );
}