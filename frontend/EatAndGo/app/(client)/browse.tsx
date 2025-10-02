import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ListRenderItem,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
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
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [showCitySelector, setShowCitySelector] = useState(false);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  const screenType = useScreenType();
  const { width, height } = useWindowDimensions();

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
    loadAvailableCities();
  }, []);

  useEffect(() => {
    if (selectedCity) {
      loadRestaurants();
    }
  }, [selectedCity]);

  const loadAvailableCities = async () => {
    try {
      const response = await restaurantService.getPublicRestaurants({
        page: 1,
        limit: 100,
      });
      
      let restaurantsData: Restaurant[] = [];
      if (Array.isArray(response)) {
        restaurantsData = response;
      } else if (response && 'data' in response && Array.isArray(response.data)) {
        restaurantsData = response.data;
      } else if (response && 'results' in response && Array.isArray(response.results)) {
        restaurantsData = response.results;
      }
      
      // Extraire les villes uniques
      const cities = [...new Set(restaurantsData.map(r => r.city))].sort();
      setAvailableCities(cities);
      
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const loadRestaurants = async () => {
    if (!selectedCity) return;
    
    try {
      console.log('🚀 Loading public restaurants...');
      setLoading(true);
      setError(null);
      
      const response = await restaurantService.getPublicRestaurants({
        page: 1,
        limit: 50,
      });
      
      console.log('📥 Response received:', response);
      
      let restaurantsData: Restaurant[] = [];
      
      if (Array.isArray(response)) {
        restaurantsData = response;
      } else if (response && 'data' in response && Array.isArray(response.data)) {
        restaurantsData = response.data;
      } else if (response && 'results' in response && Array.isArray(response.results)) {
        restaurantsData = response.results;
      }
      
      // Filtrer par ville sélectionnée
      const filteredByCity = restaurantsData.filter(r => r.city === selectedCity);
      
      console.log('✅ Public restaurants loaded:', filteredByCity.length);
      setRestaurants(filteredByCity);
      
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

    if (!selectedCity) return;

    try {
      console.log('🔍 Searching public restaurants:', query);
      const results = await restaurantService.searchPublicRestaurants(query);
      
      let searchResults: Restaurant[] = [];
      if (Array.isArray(results)) {
        searchResults = results;
      } else if (results && Array.isArray(results)) {
        searchResults = results;
      }
      
      // Filtrer par ville
      const filteredResults = searchResults.filter(r => r.city === selectedCity);
      setRestaurants(filteredResults);
    } catch (error: any) {
      console.error('❌ Search error:', error);
      const filtered = restaurants.filter(restaurant =>
        restaurant.city === selectedCity &&
        (restaurant.name.toLowerCase().includes(query.toLowerCase()) ||
        restaurant.description?.toLowerCase().includes(query.toLowerCase()))
      );
      setRestaurants(filtered);
    }
  };

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setShowCitySelector(false);
    setCitySearchQuery('');
  };

  const filteredCities = availableCities.filter(city =>
    city.toLowerCase().includes(citySearchQuery.toLowerCase())
  );

  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    searchContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.md, screenType) as number,
      paddingBottom: getResponsiveValue(SPACING.md, screenType) as number,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      backgroundColor: COLORS.surface,
    },

    listContainer: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: getResponsiveValue(SPACING.xl, screenType) as number,
      paddingBottom: getResponsiveValue(SPACING['2xl'], screenType) as number,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    // NOUVELLE CARTE RESTAURANT - Design moderne
    restaurantCard: {
      flex: 1,
      marginBottom: getResponsiveValue(SPACING.xl, screenType) as number,
      marginHorizontal: layoutConfig.numColumns > 1 ? layoutConfig.itemSpacing / 2 : 0,
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS['3xl'],
      overflow: 'hidden' as const,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },

    // Gradient subtil en haut de la carte
    cardGradient: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      height: 100,
      opacity: 0.03,
    },

    cardContent: {
      padding: getResponsiveValue(
        { 
          mobile: SPACING.xl.mobile, 
          tablet: SPACING['2xl'].tablet, 
          desktop: SPACING['2xl'].desktop 
        },
        screenType
      ) as number,
    },

    // Header simplifié
    restaurantHeader: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType) as number,
    },

    restaurantNameRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType) as number,
      gap: getResponsiveValue(SPACING.md, screenType) as number,
    },

    restaurantName: {
      flex: 1,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize['2xl'].mobile, 
          tablet: TYPOGRAPHY.fontSize['2xl'].tablet, 
          desktop: TYPOGRAPHY.fontSize['3xl'].desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      color: COLORS.text.primary,
      letterSpacing: -0.5,
      lineHeight: getResponsiveValue(
        { mobile: 28, tablet: 32, desktop: 38 },
        screenType
      ) as number,
    },

    // Badge de statut modernisé
    statusBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: getResponsiveValue(
        { mobile: 10, tablet: 12, desktop: 14 },
        screenType
      ) as number,
      paddingVertical: getResponsiveValue(
        { mobile: 6, tablet: 7, desktop: 8 },
        screenType
      ) as number,
      borderRadius: BORDER_RADIUS.full,
      alignSelf: 'flex-start' as const,
    },

    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },

    statusText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.xs.mobile, 
          tablet: TYPOGRAPHY.fontSize.xs.tablet, 
          desktop: TYPOGRAPHY.fontSize.sm.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.semibold as '600',
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
    },

    // Description optimisée
    restaurantDescription: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.base.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.md.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(
        { mobile: 22, tablet: 24, desktop: 28 },
        screenType
      ) as number,
      marginTop: getResponsiveValue(SPACING.sm, screenType) as number,
    },

    // Localisation avec icône
    locationContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.xs, screenType) as number,
      marginTop: getResponsiveValue(SPACING.md, screenType) as number,
      paddingVertical: getResponsiveValue(SPACING.xs, screenType) as number,
    },

    locationIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: COLORS.primary + '10',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    restaurantAddress: {
      flex: 1,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.sm.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.light,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ) as number,
    },

    // Divider plus subtil
    divider: {
      height: 1,
      backgroundColor: COLORS.border.light,
      marginVertical: getResponsiveValue(SPACING.lg, screenType) as number,
    },

    // Section détails repensée
    restaurantDetails: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: getResponsiveValue(SPACING.sm, screenType) as number,
    },

    detailChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: getResponsiveValue(
        { mobile: 12, tablet: 14, desktop: 16 },
        screenType
      ) as number,
      paddingVertical: getResponsiveValue(
        { mobile: 8, tablet: 9, desktop: 10 },
        screenType
      ) as number,
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.border.default,
    },

    detailChipIcon: {
      width: 18,
      height: 18,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    detailText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.sm.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium as '500',
    },

    // Badge voucher modernisé avec gradient subtil
    voucherChip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: getResponsiveValue(
        { mobile: 12, tablet: 14, desktop: 16 },
        screenType
      ) as number,
      paddingVertical: getResponsiveValue(
        { mobile: 8, tablet: 9, desktop: 10 },
        screenType
      ) as number,
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.variants.secondary[300],
    },

    voucherText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.xs.mobile, 
          tablet: TYPOGRAPHY.fontSize.xs.tablet, 
          desktop: TYPOGRAPHY.fontSize.sm.desktop 
        },
        screenType
      ) as number,
      color: COLORS.variants.secondary[700],
      fontWeight: TYPOGRAPHY.fontWeight.semibold as '600',
      letterSpacing: 0.2,
    },

    // Messages d'erreur améliorés
    errorContainer: {
      margin: layoutConfig.containerPadding,
      padding: getResponsiveValue(
        { 
          mobile: SPACING.xl.mobile, 
          tablet: SPACING['2xl'].tablet, 
          desktop: SPACING['2xl'].desktop 
        },
        screenType
      ) as number,
      backgroundColor: COLORS.error + '05',
      borderRadius: BORDER_RADIUS['2xl'],
      borderLeftWidth: 4,
      borderLeftColor: COLORS.error,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    errorTitle: {
      color: COLORS.error,
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.lg.mobile, 
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
          mobile: TYPOGRAPHY.fontSize.base.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      lineHeight: getResponsiveValue(
        { mobile: 22, tablet: 24, desktop: 26 },
        screenType
      ) as number,
    },

    // État vide amélioré
    emptyContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingVertical: getResponsiveValue(
        { mobile: 100, tablet: 120, desktop: 140 },
        screenType
      ) as number,
      paddingHorizontal: layoutConfig.containerPadding,
    },

    emptyIconContainer: {
      width: getResponsiveValue(
        { mobile: 100, tablet: 120, desktop: 140 },
        screenType
      ) as number,
      height: getResponsiveValue(
        { mobile: 100, tablet: 120, desktop: 140 },
        screenType
      ) as number,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: COLORS.primary + '08',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getResponsiveValue(SPACING['2xl'], screenType) as number,
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
      marginBottom: getResponsiveValue(SPACING.md, screenType) as number,
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
      marginBottom: getResponsiveValue(SPACING['2xl'], screenType) as number,
      lineHeight: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType
      ) as number,
      maxWidth: getResponsiveValue(
        { mobile: 300, tablet: 400, desktop: 500 },
        screenType
      ) as number,
    },

    retryButton: {
      backgroundColor: COLORS.primary,
      paddingHorizontal: getResponsiveValue(
        { 
          mobile: SPACING['2xl'].mobile, 
          tablet: SPACING['3xl'].tablet, 
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
      shadowColor: COLORS.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
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

    // CITY SELECTOR STYLES
    cityWelcomeContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: layoutConfig.containerPadding,
      paddingVertical: getResponsiveValue(
        { mobile: 40, tablet: 60, desktop: 80 },
        screenType
      ) as number,
    },

    cityWelcomeIcon: {
      width: getResponsiveValue(
        { mobile: 120, tablet: 140, desktop: 160 },
        screenType
      ) as number,
      height: getResponsiveValue(
        { mobile: 120, tablet: 140, desktop: 160 },
        screenType
      ) as number,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: COLORS.primary + '10',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: getResponsiveValue(SPACING['2xl'], screenType) as number,
    },

    cityWelcomeTitle: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize['3xl'].mobile, 
          tablet: TYPOGRAPHY.fontSize['3xl'].tablet, 
          desktop: TYPOGRAPHY.fontSize['4xl'].desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      marginBottom: getResponsiveValue(SPACING.md, screenType) as number,
      letterSpacing: -0.5,
    },

    cityWelcomeSubtitle: {
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
      marginBottom: getResponsiveValue(SPACING['3xl'], screenType) as number,
      lineHeight: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType
      ) as number,
      maxWidth: getResponsiveValue(
        { mobile: 320, tablet: 400, desktop: 480 },
        screenType
      ) as number,
    },

    citySelectorModal: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: COLORS.overlay,
      justifyContent: 'flex-end' as const,
    },

    citySelectorContent: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: BORDER_RADIUS['3xl'],
      borderTopRightRadius: BORDER_RADIUS['3xl'],
      maxHeight: height * 0.8,
      paddingTop: getResponsiveValue(SPACING.xl, screenType) as number,
      paddingHorizontal: layoutConfig.containerPadding,
      paddingBottom: getResponsiveValue(SPACING['2xl'], screenType) as number,
    },

    citySelectorHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.lg, screenType) as number,
    },

    citySelectorTitle: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize['2xl'].mobile, 
          tablet: TYPOGRAPHY.fontSize['2xl'].tablet, 
          desktop: TYPOGRAPHY.fontSize['3xl'].desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.bold as '700',
      color: COLORS.text.primary,
    },

    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.background,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    citySearchBar: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType) as number,
    },

    cityList: {
      paddingBottom: getResponsiveValue(SPACING.xl, screenType) as number,
    },

    cityItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: getResponsiveValue(SPACING.md, screenType) as number,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType) as number,
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.xl,
      marginBottom: getResponsiveValue(SPACING.sm, screenType) as number,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },

    cityItemSelected: {
      backgroundColor: COLORS.primary + '10',
      borderColor: COLORS.primary,
      borderWidth: 2,
    },

    cityItemLeft: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.md, screenType) as number,
      flex: 1,
    },

    cityItemIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    cityItemName: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.base.mobile, 
          tablet: TYPOGRAPHY.fontSize.md.tablet, 
          desktop: TYPOGRAPHY.fontSize.lg.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.medium as '500',
      color: COLORS.text.primary,
      flex: 1,
    },

    selectedCityBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType) as number,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType) as number,
      backgroundColor: COLORS.primary + '10',
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.primary + '30',
    },

    selectedCityText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.semibold as '600',
      color: COLORS.primary,
    },

    changeCityButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType) as number,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType) as number,
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.border.default,
    },

    changeCityText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.sm.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.medium as '500',
      color: COLORS.text.primary,
    },

    // Info banner
    infoBanner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: getResponsiveValue(SPACING.md, screenType) as number,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType) as number,
      paddingVertical: getResponsiveValue(SPACING.md, screenType) as number,
      backgroundColor: COLORS.primary + '08',
      borderRadius: BORDER_RADIUS.xl,
      borderWidth: 1,
      borderColor: COLORS.primary + '20',
      marginBottom: getResponsiveValue(SPACING.md, screenType) as number,
    },

    infoBannerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.primary + '15',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    infoBannerContent: {
      flex: 1,
    },

    infoBannerTitle: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.sm.mobile, 
          tablet: TYPOGRAPHY.fontSize.base.tablet, 
          desktop: TYPOGRAPHY.fontSize.base.desktop 
        },
        screenType
      ) as number,
      fontWeight: TYPOGRAPHY.fontWeight.semibold as '600',
      color: COLORS.text.primary,
      marginBottom: 2,
    },

    infoBannerText: {
      fontSize: getResponsiveValue(
        { 
          mobile: TYPOGRAPHY.fontSize.xs.mobile, 
          tablet: TYPOGRAPHY.fontSize.sm.tablet, 
          desktop: TYPOGRAPHY.fontSize.sm.desktop 
        },
        screenType
      ) as number,
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ) as number,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 14, tablet: 15, desktop: 16 },
    screenType
  ) as number;

  const renderRestaurantItem: ListRenderItem<Restaurant> = ({ item }) => (
    <Pressable 
      onPress={() => router.push(`/menu/client/${item.id}`)}
      android_ripple={{ 
        color: COLORS.primary + '10',
        borderless: false 
      }}
      style={({ pressed }) => [
        styles.restaurantCard,
        { 
          transform: [{ scale: pressed ? 0.98 : 1 }],
          opacity: pressed ? 0.95 : 1,
        }
      ]}
    >
      <View style={styles.cardContent}>
        {/* Header */}
        <View style={styles.restaurantHeader}>
          <View style={styles.restaurantNameRow}>
            <Text style={styles.restaurantName} numberOfLines={2}>
              {item.name}
            </Text>

            {/* Badge de statut modernisé */}
            <View style={[
              styles.statusBadge,
              { 
                backgroundColor: item.can_receive_orders 
                  ? COLORS.success + '15' 
                  : COLORS.border.light,
              }
            ]}>
              <View style={[
                styles.statusDot,
                { backgroundColor: item.can_receive_orders ? COLORS.success : COLORS.text.light }
              ]} />
              <Text style={[
                styles.statusText,
                { color: item.can_receive_orders ? COLORS.success : COLORS.text.light }
              ]}>
                {item.can_receive_orders ? "Ouvert" : "Fermé"}
              </Text>
            </View>
          </View>

          {/* Description */}
          {item.description && item.description.trim() && item.description !== 'string' && (
            <Text style={styles.restaurantDescription} numberOfLines={3}>
              {item.description}
            </Text>
          )}

          {/* Localisation */}
          <View style={styles.locationContainer}>
            <View style={styles.locationIcon}>
              <Ionicons name="location" size={12} color={COLORS.primary} />
            </View>
            <Text style={styles.restaurantAddress} numberOfLines={1}>
              {item.address}, {item.city}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Détails sous forme de chips */}
        <View style={styles.restaurantDetails}>
          <View style={styles.detailChip}>
            <View style={styles.detailChipIcon}>
              <Ionicons name="restaurant" size={iconSize} color={COLORS.secondary} />
            </View>
            <Text style={styles.detailText}>
              {item.cuisine || 'Restaurant'}
            </Text>
          </View>
          
          <View style={styles.detailChip}>
            <View style={styles.detailChipIcon}>
              <Ionicons name="pricetag" size={iconSize} color={COLORS.secondary} />
            </View>
            <Text style={[styles.detailText, { color: COLORS.secondary }]}>
              {'€'.repeat(item.priceRange || 2)}
            </Text>
          </View>

          {item.accepts_meal_vouchers && (
            <View style={styles.voucherChip}>
              <View style={styles.detailChipIcon}>
                <Ionicons name="card" size={iconSize} color={COLORS.variants.secondary[700]} />
              </View>
              <Text style={styles.voucherText}>
                Titres-resto
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons 
          name="restaurant-outline" 
          size={getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType) as number} 
          color={COLORS.primary} 
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
          style={({ pressed }) => [
            styles.retryButton,
            { opacity: pressed ? 0.9 : 1 }
          ]}
          onPress={loadRestaurants}
          android_ripple={{ 
            color: COLORS.text.inverse + '20',
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

  const renderCityWelcome = () => (
    <View style={styles.cityWelcomeContainer}>
      <View style={styles.cityWelcomeIcon}>
        <Ionicons 
          name="location" 
          size={getResponsiveValue({ mobile: 56, tablet: 64, desktop: 72 }, screenType) as number} 
          color={COLORS.primary} 
        />
      </View>
      <Text style={styles.cityWelcomeTitle}>
        Choisissez votre ville
      </Text>
      <Text style={styles.cityWelcomeSubtitle}>
        Sélectionnez une ville pour découvrir les restaurants disponibles près de chez vous
      </Text>
      <Pressable 
        style={({ pressed }) => [
          styles.retryButton,
          { opacity: pressed ? 0.9 : 1 }
        ]}
        onPress={() => setShowCitySelector(true)}
        android_ripple={{ 
          color: COLORS.text.inverse + '20',
          borderless: false 
        }}
      >
        <Text style={styles.retryButtonText}>
          Choisir une ville
        </Text>
      </Pressable>
    </View>
  );

  const renderCitySelector = () => (
    <Modal
      visible={showCitySelector}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCitySelector(false)}
    >
      <Pressable 
        style={styles.citySelectorModal}
        onPress={() => setShowCitySelector(false)}
      >
        <Pressable 
          style={styles.citySelectorContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.citySelectorHeader}>
            <Text style={styles.citySelectorTitle}>
              Sélectionner une ville
            </Text>
            <Pressable 
              style={styles.closeButton}
              onPress={() => setShowCitySelector(false)}
            >
              <Ionicons name="close" size={20} color={COLORS.text.secondary} />
            </Pressable>
          </View>

          <View style={styles.citySearchBar}>
            <SearchBar
              placeholder="Rechercher une ville..."
              value={citySearchQuery}
              onChangeText={setCitySearchQuery}
            />
          </View>

          <FlatList
            data={filteredCities}
            keyExtractor={(item) => item}
            style={styles.cityList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.cityItem,
                  selectedCity === item && styles.cityItemSelected
                ]}
                onPress={() => handleCitySelect(item)}
                android_ripple={{ 
                  color: COLORS.primary + '10',
                  borderless: false 
                }}
              >
                <View style={styles.cityItemLeft}>
                  <View style={styles.cityItemIcon}>
                    <Ionicons 
                      name="location" 
                      size={20} 
                      color={selectedCity === item ? COLORS.primary : COLORS.text.secondary} 
                    />
                  </View>
                  <Text style={styles.cityItemName}>{item}</Text>
                </View>
                {selectedCity === item && (
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptySubtitle}>
                Aucune ville trouvée
              </Text>
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Header title="Restaurants" />

      {!selectedCity ? (
        renderCityWelcome()
      ) : (
        <>
          <View style={styles.searchContainer}>
            {/* Info Banner */}
            <View style={styles.infoBanner}>
              <View style={styles.infoBannerIcon}>
                <Ionicons 
                  name="information-circle" 
                  size={20} 
                  color={COLORS.primary} 
                />
              </View>
              <View style={styles.infoBannerContent}>
                <Text style={styles.infoBannerTitle}>
                  Commande à emporter
                </Text>
                <Text style={styles.infoBannerText}>
                  Pour consommer sur place, utilisez l'onglet Scanner
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: getResponsiveValue(SPACING.sm, screenType) as number }}>
              <View style={{ flex: 1 }}>
                <SearchBar
                  placeholder="Rechercher un restaurant..."
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
              </View>
              <Pressable 
                style={styles.changeCityButton}
                onPress={() => setShowCitySelector(true)}
              >
                <Ionicons name="location" size={16} color={COLORS.primary} />
                <Text style={styles.changeCityText} numberOfLines={1}>
                  {selectedCity}
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.text.secondary} />
              </Pressable>
            </View>
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
        </>
      )}

      {renderCitySelector()}
    </SafeAreaView>
  );
}