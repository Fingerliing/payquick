import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Switch,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { useCart } from '@/contexts/CartContext';
import { menuService } from '@/services/menuService';
import { useSession } from '@/contexts/SessionContext';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { DailyMenuDisplay } from '@/components/menu/DailyMenuDisplay';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import { CategoryAccordionDisplay } from '@/components/menu/MenuDisplay';
import { MenuItemsGrid, MenuItemsMasonry, MenuItemsTable } from '@/components/menu/MenuItemGrid';

// Types
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';

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

const { width: screenWidth } = Dimensions.get('window');

// =============================================================================
// TYPES ET INTERFACES
// =============================================================================
interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  count: number;
  items: MenuItem[];
}

interface FilterOptions {
  selectedCategory: string | null;
  hideAllergens: string[];
  showVegetarianOnly: boolean;
  showVeganOnly: boolean;
  showGlutenFreeOnly: boolean;
  showAvailableOnly: boolean;
  searchQuery: string;
}

// Types pour les modes d'affichage
type ViewMode = 'compact' | 'grid' | 'masonry' | 'accordion' | 'table';

// =============================================================================
// COMPOSANT PRINCIPAL OPTIMISÉ
// =============================================================================
export default function OptimizedRestaurantPage() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { cart, addToCart, clearCart } = useCart();

  // États principaux
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 🆕 États pour l'affichage optimisé
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [showDailyMenuFirst, setShowDailyMenuFirst] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [quickFilterMode, setQuickFilterMode] = useState<'all' | 'available' | 'dietary'>('all');

  // États des filtres améliorés
  const [filters, setFilters] = useState<FilterOptions>({
    selectedCategory: null,
    hideAllergens: [],
    showVegetarianOnly: false,
    showVeganOnly: false,
    showGlutenFreeOnly: false,
    showAvailableOnly: false,
    searchQuery: '',
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // États UI
  const [toast, setToast] = useState({
    visible: false,
    variant: 'success' as 'success' | 'error' | 'info' | 'warning',
    title: '',
    message: '',
  });
  const [confirmCartSwitch, setConfirmCartSwitch] = useState({
    visible: false,
    item: null as MenuItem | null,
  });

  // =============================================================================
  // STYLES OPTIMISÉS
  // =============================================================================
  const styles = useMemo(
    () => ({
      page: {
        flex: 1,
        backgroundColor: COLORS.background,
      },

      // En-tête Restaurant Premium
      restaurantHeader: {
        backgroundColor: COLORS.goldenSurface,
        paddingTop: getResponsiveValue(SPACING.xl, screenType),
        paddingBottom: getResponsiveValue(SPACING.lg, screenType),
        paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
        borderBottomLeftRadius: BORDER_RADIUS['3xl'],
        borderBottomRightRadius: BORDER_RADIUS['3xl'],
        ...SHADOWS.premiumCard,
        borderBottomWidth: 3,
        borderBottomColor: COLORS.border.golden,
      },
      
      restaurantName: {
        fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
        fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
        color: COLORS.primary,
        textAlign: 'center' as const,
        marginBottom: getResponsiveValue(SPACING.xs, screenType),
        letterSpacing: 0.5,
      },
      
      restaurantSubtitle: {
        fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
        fontWeight: TYPOGRAPHY.fontWeight.medium as any,
        color: COLORS.text.golden,
        textAlign: 'center' as const,
        fontStyle: 'italic' as const,
      },

      // 🆕 Contrôles d'affichage optimisés
      displayControls: {
        backgroundColor: COLORS.surface,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border.light,
        ...SHADOWS.sm,
      },

      viewModeSelector: {
        flexDirection: 'row' as const,
        marginBottom: 12,
      },

      viewModeButton: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginRight: 8,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: COLORS.background,
      },

      viewModeButtonActive: {
        backgroundColor: COLORS.variants.primary[100],
        borderWidth: 1,
        borderColor: COLORS.variants.primary[300],
      },

      viewModeLabel: {
        fontSize: 13,
        fontWeight: '500' as const,
        color: COLORS.text.secondary,
        marginLeft: 6,
      },

      viewModeLabelActive: {
        color: COLORS.primary,
      },

      // 🆕 Quick filters bar (utilisée dans contentContainerStyle)
      quickFiltersBar: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: COLORS.variants.primary[50],
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border.light,
      },

      quickFilterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: COLORS.surface,
        marginRight: 8,
        borderWidth: 1,
        borderColor: COLORS.border.light,
      },

      quickFilterChipActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
      },

      quickFilterText: {
        fontSize: 12,
        fontWeight: '600' as const,
        color: COLORS.text.secondary,
      },

      quickFilterTextActive: {
        color: COLORS.text.inverse,
      },

      // 🆕 Stats bar
      statsBar: {
        flexDirection: 'row' as const,
        justifyContent: 'space-around' as const,
        paddingVertical: 12,
        backgroundColor: COLORS.surface,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border.light,
      },

      statItem: {
        alignItems: 'center' as const,
      },

      statValue: {
        fontSize: 20,
        fontWeight: '700' as const,
        color: COLORS.primary,
      },

      statLabel: {
        fontSize: 11,
        color: COLORS.text.secondary,
        marginTop: 2,
      },

      // Search bar
      searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: COLORS.surface,
      },

      searchInput: {
        backgroundColor: COLORS.background,
        borderRadius: BORDER_RADIUS.lg,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        borderWidth: 1,
        borderColor: COLORS.border.light,
      },

      searchInputFocused: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.variants.primary[50],
      },

      // Settings panel
      settingsPanel: {
        backgroundColor: COLORS.surface,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: COLORS.border.light,
      },

      settingRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        paddingVertical: 8,
      },

      settingLabel: {
        fontSize: 14,
        color: COLORS.text.primary,
      },

      // Floating cart button
      floatingCart: {
        position: 'absolute' as const,
        bottom: 20,
        left: 20,
        right: 20,
        backgroundColor: COLORS.primary,
        borderRadius: BORDER_RADIUS.xl,
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
        padding: 16,
        ...SHADOWS.lg,
      },

      cartInfo: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
      },

      cartBadge: {
        backgroundColor: COLORS.secondary,
        borderRadius: BORDER_RADIUS.full,
        width: 32,
        height: 32,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        marginRight: 12,
      },

      cartBadgeText: {
        color: COLORS.text.inverse,
        fontWeight: '700' as const,
        fontSize: 14,
      },

      cartText: {
        color: COLORS.text.inverse,
        fontSize: 16,
        fontWeight: '600' as const,
      },

      cartTotal: {
        color: COLORS.text.inverse,
        fontSize: 18,
        fontWeight: '700' as const,
      },
    }),
    [screenType]
  );

  // =============================================================================
  // TOAST / NOTIFICATIONS
  // =============================================================================
  const showToast = useCallback(
    (
      variant: 'success' | 'error' | 'info' | 'warning',
      title: string,
      message: string
    ) => {
      setToast({ visible: true, variant, title, message });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    },
    []
  );

  // =============================================================================
  // DATA FETCHING
  // =============================================================================
  const loadData = useCallback(async () => {
    if (!restaurantId) return;

    try {
      setIsLoading(true);

      console.log('[RestaurantScreen] restaurantId =', restaurantId);

      const [restaurantData, menusData] = await Promise.all([
        restaurantService.getPublicRestaurant(restaurantId),
        menuService.getMenusByRestaurant(parseInt(restaurantId, 10)),
      ]);

      console.log('[RestaurantScreen] restaurantData =', restaurantData);
      console.log('[RestaurantScreen] menusData =', menusData);

      setRestaurant(restaurantData);
      setMenus(menusData);
    } catch (error) {
      console.error('Error loading restaurant data:', error);
      showToast('error', 'Erreur', 'Impossible de charger le menu');
      setRestaurant(null);
      setMenus([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // =============================================================================
  // DONNÉES TRANSFORMÉES ET FILTRÉES
  // =============================================================================
  const allMenuItems = useMemo(() => {
    return menus.flatMap(menu => menu.items || []);
  }, [menus]);

  // 🆕 Catégories enrichies avec items
  const categoriesWithItems = useMemo(() => {
    const catMap = new Map<string, MenuCategory>();

    allMenuItems.forEach(item => {
      const catName = item.category_name || 'Autres';
      if (!catMap.has(catName)) {
        catMap.set(catName, {
          id: catName,
          name: catName,
          icon: '🍽️',
          count: 0,
          items: [],
        });
      }

      const cat = catMap.get(catName)!;
      cat.items.push(item);
      cat.count++;
    });

    return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allMenuItems]);

  // 🆕 Application des filtres optimisée
  const filteredItems = useMemo(() => {
    let items = [...allMenuItems];

    // Quick filter mode
    if (quickFilterMode === 'available') {
      items = items.filter(item => item.is_available);
    } else if (quickFilterMode === 'dietary') {
      items = items.filter(
        item => item.is_vegan || item.is_vegetarian || item.is_gluten_free
      );
    }

    // Search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      items = items.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (filters.selectedCategory) {
      items = items.filter(item => item.category_name === filters.selectedCategory);
    }

    // Dietary filters
    if (filters.showVeganOnly) {
      items = items.filter(item => item.is_vegan);
    }
    if (filters.showVegetarianOnly) {
      items = items.filter(item => item.is_vegetarian);
    }
    if (filters.showGlutenFreeOnly) {
      items = items.filter(item => item.is_gluten_free);
    }

    // Available only
    if (filters.showAvailableOnly) {
      items = items.filter(item => item.is_available);
    }

    // Hide allergens
    if (filters.hideAllergens.length > 0) {
      items = items.filter(item => {
        const itemAllergens = item.allergens || [];
        return !filters.hideAllergens.some(allergen =>
          itemAllergens.includes(allergen)
        );
      });
    }

    return items;
  }, [allMenuItems, filters, quickFilterMode]);

  // 🆕 Stats en temps réel
  const stats = useMemo(() => {
    const available = filteredItems.filter(item => item.is_available);
    const dietary = filteredItems.filter(
      item => item.is_vegan || item.is_vegetarian || item.is_gluten_free
    );
    const withImages = filteredItems.filter(item => item.image_url);

    return {
      total: filteredItems.length,
      available: available.length,
      dietary: dietary.length,
      withImages: withImages.length,
      categories: [...new Set(filteredItems.map(item => item.category_name))].length,
    };
  }, [filteredItems]);

  // =============================================================================
  // HANDLERS
  // =============================================================================
  const handleAddToCart = useCallback(
    (item: MenuItem) => {
      const parsedRestaurantId = parseInt(restaurantId, 10);

      if (cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== parsedRestaurantId) {
        setConfirmCartSwitch({ visible: true, item });
        return;
      }

      const menuItemId =
        typeof (item as any).id === 'number'
          ? (item as any).id
          : parseInt(String((item as any).id), 10);

      const cartItem: any = {
        id: String(menuItemId),
        menuItemId,
        name: item.name,
        price: (item as any).price,
        restaurantId: parsedRestaurantId,
        restaurantName: restaurant?.name || '',
        imageUrl: (item as any).image_url,
        isAvailable: (item as any).is_available,
        customizations: {},
        specialInstructions: '',
      };

      addToCart(cartItem);
      showToast('success', 'Ajouté au panier', `${item.name} a été ajouté`);
    },
    [cart.items.length, cart.restaurantId, restaurantId, restaurant, addToCart, showToast, setConfirmCartSwitch]
  );

  const proceedAddToCart = useCallback(
    (item: MenuItem) => {
      const parsedRestaurantId = parseInt(restaurantId, 10);

      clearCart();

      const menuItemId =
        typeof (item as any).id === 'number'
          ? (item as any).id
          : parseInt(String((item as any).id), 10);

      const cartItem: any = {
        id: String(menuItemId),
        menuItemId,
        name: item.name,
        price: (item as any).price,
        restaurantId: parsedRestaurantId,
        restaurantName: restaurant?.name || '',
        imageUrl: (item as any).image_url,
        isAvailable: (item as any).is_available,
        customizations: {},
        specialInstructions: '',
      };

      addToCart(cartItem);
      showToast('success', 'Ajouté au panier', `${item.name} a été ajouté`);
    },
    [clearCart, addToCart, restaurantId, restaurant, showToast]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // 🆕 Handlers pour les modes d'affichage
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
  };

  const handleQuickFilter = (mode: 'all' | 'available' | 'dietary') => {
    setQuickFilterMode(mode);
  };

  const handleCategorySelect = (categoryId: string | null) => {
    setFilters(prev => ({ ...prev, selectedCategory: categoryId }));
  };

  const handleSearchChange = (text: string) => {
    setFilters(prev => ({ ...prev, searchQuery: text }));
  };

  const toggleDietaryFilter = (filter: 'vegan' | 'vegetarian' | 'glutenFree') => {
    setFilters(prev => {
      switch (filter) {
        case 'vegan':
          return { ...prev, showVeganOnly: !prev.showVeganOnly };
        case 'vegetarian':
          return { ...prev, showVegetarianOnly: !prev.showVegetarianOnly };
        case 'glutenFree':
        default:
          return { ...prev, showGlutenFreeOnly: !prev.showGlutenFreeOnly };
      }
    });
  };

  const clearAllFilters = () => {
    setFilters({
      selectedCategory: null,
      hideAllergens: [],
      showVegetarianOnly: false,
      showVeganOnly: false,
      showGlutenFreeOnly: false,
      showAvailableOnly: false,
      searchQuery: '',
    });
    setQuickFilterMode('all');
  };

  // =============================================================================
  // CALCULS UI
  // =============================================================================
  const totalCartItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const activeFiltersCount = [
    filters.selectedCategory,
    filters.showVeganOnly,
    filters.showVegetarianOnly,
    filters.showGlutenFreeOnly,
    filters.showAvailableOnly,
    filters.hideAllergens.length > 0,
    filters.searchQuery,
  ].filter(Boolean).length;

  // =============================================================================
  // RENDER CONDITIONS
  // =============================================================================
  if (isLoading) {
    return (
      <SafeAreaView style={styles.page}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement du menu..." />
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={styles.page}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="restaurant-outline" size={64} color={COLORS.text.light} />
          <Text style={{ fontSize: 16, color: COLORS.text.secondary, marginTop: 16 }}>
            Restaurant non trouvé
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // =============================================================================
  // COMPOSANT PRINCIPAL
  // =============================================================================
  return (
    <SafeAreaView style={styles.page}>
      {/* Alerts Zone */}
      {toast.visible && (
        <View style={{ position: 'absolute', top: 100, left: 16, right: 16, zIndex: 999 }}>
          <InlineAlert
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onDismiss={() => setToast(prev => ({ ...prev, visible: false }))}
            autoDismiss
          />
        </View>
      )}

      {confirmCartSwitch.visible && confirmCartSwitch.item && (
        <AlertWithAction
          variant="info"
          title="Changer de restaurant"
          message="Vous avez déjà des articles d'un autre restaurant. Voulez-vous vider votre panier ?"
          autoDismiss={false}
          onDismiss={() => setConfirmCartSwitch({ visible: false, item: null })}
          secondaryButton={{
            text: 'Annuler',
            onPress: () => setConfirmCartSwitch({ visible: false, item: null }),
          }}
          primaryButton={{
            text: 'Continuer',
            variant: 'danger',
            onPress: () => {
              if (confirmCartSwitch.item) {
                proceedAddToCart(confirmCartSwitch.item);
              }
              setConfirmCartSwitch({ visible: false, item: null });
            },
          }}
        />
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
      >
        {/* Restaurant Header */}
        <View style={styles.restaurantHeader}>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          <Text style={styles.restaurantSubtitle}>
            {session?.share_code ? `Code table: ${session.share_code}` : 'Bienvenue'}
          </Text>
        </View>

        {/* 🆕 Display Controls */}
        <View style={styles.displayControls}>
          {/* View Mode Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <TouchableOpacity
              style={[
                styles.viewModeButton,
                viewMode === 'compact' && styles.viewModeButtonActive,
              ]}
              onPress={() => handleViewModeChange('compact')}
            >
              <Ionicons
                name="list"
                size={18}
                color={viewMode === 'compact' ? COLORS.primary : COLORS.text.secondary}
              />
              <Text
                style={[
                  styles.viewModeLabel,
                  viewMode === 'compact' && styles.viewModeLabelActive,
                ]}
              >
                Liste
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.viewModeButton,
                viewMode === 'grid' && styles.viewModeButtonActive,
              ]}
              onPress={() => handleViewModeChange('grid')}
            >
              <Ionicons
                name="grid"
                size={18}
                color={viewMode === 'grid' ? COLORS.primary : COLORS.text.secondary}
              />
              <Text
                style={[styles.viewModeLabel, viewMode === 'grid' && styles.viewModeLabelActive]}
              >
                Grille
              </Text>
            </TouchableOpacity>

            {screenWidth >= 768 && (
              <>
                <TouchableOpacity
                  style={[
                    styles.viewModeButton,
                    viewMode === 'masonry' && styles.viewModeButtonActive,
                  ]}
                  onPress={() => handleViewModeChange('masonry')}
                >
                  <Ionicons
                    name="apps"
                    size={18}
                    color={viewMode === 'masonry' ? COLORS.primary : COLORS.text.secondary}
                  />
                  <Text
                    style={[
                      styles.viewModeLabel,
                      viewMode === 'masonry' && styles.viewModeLabelActive,
                    ]}
                  >
                    Mosaïque
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.viewModeButton,
                    viewMode === 'accordion' && styles.viewModeButtonActive,
                  ]}
                  onPress={() => handleViewModeChange('accordion')}
                >
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={viewMode === 'accordion' ? COLORS.primary : COLORS.text.secondary}
                  />
                  <Text
                    style={[
                      styles.viewModeLabel,
                      viewMode === 'accordion' && styles.viewModeLabelActive,
                    ]}
                  >
                    Accordéon
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.viewModeButton,
                    viewMode === 'table' && styles.viewModeButtonActive,
                  ]}
                  onPress={() => handleViewModeChange('table')}
                >
                  <Ionicons
                    name="reorder-four"
                    size={18}
                    color={viewMode === 'table' ? COLORS.primary : COLORS.text.secondary}
                  />
                  <Text
                    style={[
                      styles.viewModeLabel,
                      viewMode === 'table' && styles.viewModeLabelActive,
                    ]}
                  >
                    Tableau
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          {/* Settings row */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Grouper par catégorie</Text>
            <Switch
              value={groupByCategory}
              onValueChange={setGroupByCategory}
              trackColor={{ false: COLORS.border.default, true: COLORS.primary }}
              thumbColor={Platform.OS === 'ios' ? undefined : 'white'}
            />
          </View>
        </View>

        {/* 🆕 Quick Filters Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickFiltersBar}  // ✅ FIX: contentContainerStyle
        >
          <TouchableOpacity
            style={[
              styles.quickFilterChip,
              quickFilterMode === 'all' && styles.quickFilterChipActive,
            ]}
            onPress={() => handleQuickFilter('all')}
          >
            <Text
              style={[
                styles.quickFilterText,
                quickFilterMode === 'all' && styles.quickFilterTextActive,
              ]}
            >
              Tous ({allMenuItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickFilterChip,
              quickFilterMode === 'available' && styles.quickFilterChipActive,
            ]}
            onPress={() => handleQuickFilter('available')}
          >
            <Text
              style={[
                styles.quickFilterText,
                quickFilterMode === 'available' && styles.quickFilterTextActive,
              ]}
            >
              Disponibles ({allMenuItems.filter(i => i.is_available).length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickFilterChip,
              quickFilterMode === 'dietary' && styles.quickFilterChipActive,
            ]}
            onPress={() => handleQuickFilter('dietary')}
          >
            <Text
              style={[
                styles.quickFilterText,
                quickFilterMode === 'dietary' && styles.quickFilterTextActive,
              ]}
            >
              🌱 Diététiques
            </Text>
          </TouchableOpacity>

          {/* Category chips */}
          {categoriesWithItems.map(category => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.quickFilterChip,
                filters.selectedCategory === category.name &&
                  styles.quickFilterChipActive,
              ]}
              onPress={() =>
                handleCategorySelect(
                  filters.selectedCategory === category.name ? null : category.name
                )
              }
            >
              <Text
                style={[
                  styles.quickFilterText,
                  filters.selectedCategory === category.name &&
                    styles.quickFilterTextActive,
                ]}
              >
                {category.name} ({category.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Advanced Filters Toggle */}
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
            backgroundColor:
              activeFiltersCount > 0
                ? COLORS.warning
                  ? COLORS.warning[50]
                  : COLORS.surface
                : COLORS.surface,
          }}
          onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
        >
          <Ionicons
            name="options"
            size={18}
            color={activeFiltersCount > 0 ? COLORS.warning : COLORS.text.secondary}
          />
          <Text
            style={{
              marginLeft: 6,
              fontSize: 13,
              color: activeFiltersCount > 0 ? COLORS.warning : COLORS.text.secondary,
              fontWeight: '600',
            }}
          >
            Filtres avancés
            {activeFiltersCount > 0 && ` (${activeFiltersCount})`}
          </Text>
          <Ionicons
            name={showAdvancedFilters ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.text.secondary}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>

        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <View style={styles.settingsPanel}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>🥗 Végétarien uniquement</Text>
              <Switch
                value={filters.showVegetarianOnly}
                onValueChange={() => toggleDietaryFilter('vegetarian')}
                trackColor={{ false: COLORS.border.default, true: COLORS.success }}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>🌱 Vegan uniquement</Text>
              <Switch
                value={filters.showVeganOnly}
                onValueChange={() => toggleDietaryFilter('vegan')}
                trackColor={{ false: COLORS.border.default, true: COLORS.success }}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>🚫🌾 Sans gluten uniquement</Text>
              <Switch
                value={filters.showGlutenFreeOnly}
                onValueChange={() => toggleDietaryFilter('glutenFree')}
                trackColor={{ false: COLORS.border.default, true: COLORS.success }}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Disponibles uniquement</Text>
              <Switch
                value={filters.showAvailableOnly}
                onValueChange={value =>
                  setFilters(prev => ({ ...prev, showAvailableOnly: value }))
                }
                trackColor={{ false: COLORS.border.default, true: COLORS.primary }}
              />
            </View>

            {activeFiltersCount > 0 && (
              <TouchableOpacity
                style={{
                  marginTop: 12,
                  backgroundColor: COLORS.error
                    ? COLORS.error[500]
                    : COLORS.primary,
                  padding: 10,
                  borderRadius: BORDER_RADIUS.lg,
                  alignItems: 'center',
                }}
                onPress={clearAllFilters}
              >
                <Text style={{ color: 'white', fontWeight: '600' }}>
                  Réinitialiser tous les filtres
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Daily Menu Display (if enabled) */}
        {showDailyMenuFirst && (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <DailyMenuDisplay
              restaurantId={parseInt(restaurantId, 10)}
              restaurantName={restaurant.name}
              onAddToCart={handleAddToCart}
              isInRestaurantView={true}
            />
          </View>
        )}

        {/* 🆕 MAIN CONTENT - Utilisation des nouveaux composants optimisés */}
        <View style={{ paddingHorizontal: 16, marginTop: 16, paddingBottom: 100 }}>
          {filteredItems.length > 0 ? (
            <>
              {viewMode === 'compact' && (
                <MenuItemsGrid
                  items={filteredItems}
                  onAddToCart={handleAddToCart}
                  layout="list"
                  showCategoryHeaders={groupByCategory}
                />
              )}

              {viewMode === 'grid' && (
                <MenuItemsGrid
                  items={filteredItems}
                  onAddToCart={handleAddToCart}
                  layout="grid"
                  showCategoryHeaders={groupByCategory}
                />
              )}

              {viewMode === 'masonry' && screenWidth >= 768 && (
                <MenuItemsMasonry items={filteredItems} onAddToCart={handleAddToCart} />
              )}

              {viewMode === 'accordion' && (
                <CategoryAccordionDisplay
                  items={filteredItems}
                  onAddToCart={handleAddToCart}
                  menuTitle="Menu à la carte"
                />
              )}

              {viewMode === 'table' && screenWidth >= 768 && (
                <MenuItemsTable items={filteredItems} onAddToCart={handleAddToCart} />
              )}
            </>
          ) : (
            <View
              style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                paddingVertical: 60,
              }}
            >
              <Ionicons name="search" size={64} color={COLORS.text.light} />
              <Text
                style={{
                  fontSize: 16,
                  color: COLORS.text.secondary,
                  marginTop: 16,
                  textAlign: 'center',
                }}
              >
                Aucun plat ne correspond à vos critères
              </Text>
              {activeFiltersCount > 0 && (
                <TouchableOpacity
                  onPress={clearAllFilters}
                  style={{
                    marginTop: 16,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    backgroundColor: COLORS.primary,
                    borderRadius: BORDER_RADIUS.lg,
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '600' }}>
                    Réinitialiser les filtres
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 🆕 Floating Cart Button - Design amélioré */}
      {totalCartItems > 0 && (
        <Pressable
          style={[styles.floatingCart, { bottom: Math.max(20, insets.bottom + 10) }]}
          onPress={() => router.push('/(client)/cart')}
        >
          <View style={styles.cartInfo}>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{totalCartItems}</Text>
            </View>
            <View>
              <Text style={styles.cartText}>Voir le panier</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                {totalCartItems} article{totalCartItems > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.cartTotal}>{cart.total.toFixed(2)}€</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
