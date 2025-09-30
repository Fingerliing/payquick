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
  BORDER_RADIUS,
  TYPOGRAPHY,
  SHADOWS,
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
    containerPadding: getResponsiveValue(SPACING.container, screenType) as number,
    numColumns: getResponsiveValue(
      { mobile: 1, tablet: 2, desktop: 3 },
      screenType
    ) as number,
    itemSpacing: getResponsiveValue(SPACING.md, screenType) as number,
    maxContentWidth: screenType === 'desktop' ? 1200 : undefined,
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
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.md, screenType) as number,
      paddingBottom: getResponsiveValue(SPACING.sm, screenType) as number,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },

    listContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.lg, screenType) as number,
      paddingBottom: getResponsiveValue(SPACING['2xl'], screenType) as number,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    restaurantCard: {
      flex: 1,
      marginBottom: getResponsiveValue(SPACING.lg, screenType) as number,
      marginHorizontal: layoutConfig.numColumns > 1 ? layoutConfig.itemSpacing / 2 : 0,
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS['2xl'],
      overflow: 'hidden' as const,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 5,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    cardContent: {
      padding: getResponsiveValue(
        { 
          mobile: SPACING.lg.mobile, 
          tablet: SPACING.xl.tablet, 
          desktop: SPACING['2xl'].desktop 
        },
        screenType
      ) as number,
    },

    restaurantHeader: {
      marginBottom: getResponsiveValue(SPACING.md, screenType) as number,
    },

    restaurantNameRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) as number,
    },

    restaurantName: {
      flex: 1,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.xl.mobile, 
          tablet: TYPOGRAPHY.fontSize['2xl'].tablet, 
          desktop: TYPOGRAPHY.fontSize['3xl'].desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      color: COLORS.text.primary,
      marginRight: getResponsiveValue(SPACING.sm, screenType) as number,
      letterSpacing: -0.5,
      lineHeight: getResponsiveValue(
        { mobile: 24, tablet: 30, desktop: 36 },
        screenType
      ) as number,
    },

    statusBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType) as number / 2,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType) as number,
      paddingVertical: getResponsiveValue(
        { mobile: 4, tablet: 5, desktop: 6 },
        screenType
      ) as number,
      borderRadius: BORDER_RADIUS.full,
      alignSelf: 'flex-start' as const,
    },

    statusText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.xs.mobile, 
          tablet: TYPOGRAPHY.fontSize.sm.tablet, 
          desktop: TYPOGRAPHY.fontSize.sm.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },

    restaurantDescription: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.md.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType) as number,
      lineHeight: getResponsiveValue(
        { mobile: 20, tablet: 24, desktop: 26 },
        screenType
      ) as number,
    },

    locationContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType) as number,
      marginBottom: getResponsiveValue(SPACING.sm, screenType) as number,
    },

    restaurantAddress: {
      flex: 1,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.light,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 22, desktop: 24 },
        screenType
      ) as number,
    },

    divider: {
      height: 1,
      backgroundColor: COLORS.border.light,
      marginVertical: getResponsiveValue(SPACING.md, screenType) as number,
    },

    restaurantDetails: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      flexWrap: 'wrap' as const,
      gap: getResponsiveValue(SPACING.md, screenType) as number,
    },

    detailItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType) as number,
      backgroundColor: COLORS.background,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType) as number,
      paddingVertical: getResponsiveValue(SPACING.xs, screenType) as number,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    detailText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium as '500',
    },

    voucherBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType) as number,
      backgroundColor: COLORS.goldenSurface,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType) as number,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType) as number,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      borderColor: COLORS.variants.secondary[400],
      alignSelf: 'flex-start' as const,
      ...SHADOWS.goldenGlow,
    },

    voucherText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.xs.mobile, 
          tablet: TYPOGRAPHY.fontSize.sm.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      letterSpacing: 0.3,
    },

    chevronIcon: {
      position: 'absolute' as const,
      right: getResponsiveValue(
        { 
          mobile: SPACING.lg.mobile, 
          tablet: SPACING.xl.tablet, 
          desktop: SPACING['2xl'].desktop 
        },
        screenType
      ) as number,
      top: getResponsiveValue(
        { 
          mobile: SPACING.lg.mobile, 
          tablet: SPACING.xl.tablet, 
          desktop: SPACING['2xl'].desktop 
        },
        screenType
      ) as number,
      width: getResponsiveValue(
        { mobile: 32, tablet: 36, desktop: 40 },
        screenType
      ) as number,
      height: getResponsiveValue(
        { mobile: 32, tablet: 36, desktop: 40 },
        screenType
      ) as number,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: COLORS.primary + '10',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    errorContainer: {
      margin: layoutConfig.containerPadding,
      padding: getResponsiveValue(
        { 
          mobile: SPACING.lg.mobile, 
          tablet: SPACING.xl.tablet, 
          desktop: SPACING['2xl'].desktop 
        },
        screenType
      ) as number,
      backgroundColor: COLORS.error + '08',
      borderRadius: BORDER_RADIUS.xl,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.error,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      ...SHADOWS.md,
    },

    errorTitle: {
      color: COLORS.error,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.md.mobile, 
          tablet: TYPOGRAPHY.fontSize.lg.tablet, 
          desktop: TYPOGRAPHY.fontSize.xl.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      marginBottom: getResponsiveValue(SPACING.xs, screenType) as number,
    },

    errorMessage: {
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      lineHeight: getResponsiveValue(
        { mobile: 20, tablet: 24, desktop: 26 },
        screenType
      ) as number,
    },

    emptyContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(
        { mobile: 80, tablet: 100, desktop: 120 },
        screenType
      ) as number,
      paddingHorizontal: layoutConfig.containerPadding,
    },

    emptyIconContainer: {
      width: getResponsiveValue(
        { mobile: 120, tablet: 140, desktop: 160 },
        screenType
      ) as number,
      height: getResponsiveValue(
        { mobile: 120, tablet: 140, desktop: 160 },
        screenType
      ) as number,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: COLORS.background,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.xl, screenType) as number,
      ...SHADOWS.lg,
    },

    emptyTitle: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize['2xl'].mobile, 
          tablet: TYPOGRAPHY.fontSize['3xl'].tablet, 
          desktop: TYPOGRAPHY.fontSize['4xl'].desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      marginBottom: getResponsiveValue(SPACING.sm, screenType) as number,
      letterSpacing: -0.5,
    },

    emptySubtitle: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.base.mobile, 
          tablet: TYPOGRAPHY.fontSize.md.tablet, 
          desktop: TYPOGRAPHY.fontSize.lg.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.xl, screenType) as number,
      lineHeight: getResponsiveValue(
        { mobile: 22, tablet: 26, desktop: 30 },
        screenType
      ) as number,
      maxWidth: getResponsiveValue(
        { mobile: 280, tablet: 360, desktop: 440 },
        screenType
      ) as number,
    },

    retryButton: {
      backgroundColor: COLORS.primary,
      paddingHorizontal: getResponsiveValue(
        { 
          mobile: SPACING.xl.mobile, 
          tablet: SPACING['2xl'].tablet, 
          desktop: SPACING['3xl'].desktop 
        },
        screenType
      ) as number,
      paddingVertical: getResponsiveValue(
        { 
          mobile: SPACING.md.mobile, 
          tablet: SPACING.lg.tablet, 
          desktop: SPACING.lg.desktop 
        },
        screenType
      ) as number,
      borderRadius: BORDER_RADIUS.xl,
      ...SHADOWS.button,
      minHeight: getResponsiveValue(
        { mobile: 48, tablet: 54, desktop: 60 },
        screenType
      ) as number,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    retryButtonText: {
      color: COLORS.text.inverse,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.base.mobile, 
          tablet: TYPOGRAPHY.fontSize.md.tablet, 
          desktop: TYPOGRAPHY.fontSize.lg.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      letterSpacing: 0.5,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 16, tablet: 18, desktop: 20 },
    screenType
  ) as number;

  const chevronSize = getResponsiveValue(
    { mobile: 18, tablet: 20, desktop: 22 },
    screenType
  ) as number;

  const renderRestaurantItem: ListRenderItem<Restaurant> = ({ item }) => (
    <Pressable 
      onPress={() => router.push(`/menu/client/${item.id}`)}
      android_ripple={{ 
        color: COLORS.primary + '15',
        borderless: false 
      }}
      style={({ pressed }) => [
        { 
          transform: [{ scale: pressed ? 0.98 : 1 }],
          opacity: pressed ? 0.95 : 1,
        }
      ]}
    >
      <Card style={styles.restaurantCard}>
        <View style={styles.cardContent}>
          {/* Header avec nom et statut */}
          <View style={styles.restaurantHeader}>
            <View style={styles.restaurantNameRow}>
              <Text style={styles.restaurantName} numberOfLines={2}>
                {item.name}
              </Text>
            </View>

            <View style={[
              styles.statusBadge,
              { 
                backgroundColor: item.can_receive_orders 
                  ? COLORS.success + '20' 
                  : COLORS.error + '15',
                borderWidth: 1.5,
                borderColor: item.can_receive_orders ? COLORS.success : COLORS.error,
              }
            ]}>
              <View style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: item.can_receive_orders ? COLORS.success : COLORS.error,
              }} />
              <Text style={[
                styles.statusText,
                { color: item.can_receive_orders ? COLORS.success : COLORS.error }
              ]}>
                {item.can_receive_orders ? "Ouvert" : "Fermé"}
              </Text>
            </View>

            {item.description && (
              <Text style={styles.restaurantDescription} numberOfLines={3}>
                {item.description}
              </Text>
            )}

            {/* Localisation */}
            <View style={styles.locationContainer}>
              <Ionicons name="location-outline" size={iconSize} color={COLORS.text.secondary} />
              <Text style={styles.restaurantAddress} numberOfLines={1}>
                {item.address}, {item.city}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Détails du restaurant */}
          <View style={styles.restaurantDetails}>
            <View style={styles.detailItem}>
              <Ionicons name="restaurant-outline" size={iconSize} color={COLORS.secondary} />
              <Text style={styles.detailText}>
                {item.cuisine || 'Restaurant'}
              </Text>
            </View>
            
            <View style={styles.detailItem}>
              <Ionicons name="pricetag-outline" size={iconSize} color={COLORS.secondary} />
              <Text style={[styles.detailText, { color: COLORS.secondary }]}>
                {'€'.repeat(item.priceRange || 2)}
              </Text>
            </View>

            {item.accepts_meal_vouchers && (
              <View style={styles.voucherBadge}>
                <Ionicons name="card" size={iconSize} color={COLORS.text.golden} />
                <Text style={styles.voucherText}>
                  Titres-restaurant
                </Text>
              </View>
            )}
          </View>

          {/* Chevron icon */}
          <View style={styles.chevronIcon}>
            <Ionicons name="arrow-forward" size={chevronSize} color={COLORS.primary} />
          </View>
        </View>
      </Card>
    </Pressable>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons 
          name="restaurant-outline" 
          size={getResponsiveValue({ mobile: 56, tablet: 64, desktop: 72 }, screenType) as number} 
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
          Essayez avec d'autres mots-clés ou affinez votre recherche
        </Text>
      )}
      {error && !loading && (
        <Pressable 
          style={styles.retryButton}
          onPress={loadRestaurants}
          android_ripple={{ 
            color: COLORS.text.inverse + '30',
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
        key={`${layoutConfig.numColumns}-${screenType}-${width}`}
        numColumns={layoutConfig.numColumns}
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
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={layoutConfig.numColumns * 3}
        windowSize={5}
      />
    </SafeAreaView>
  );
}