import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { useCart } from '@/contexts/CartContext';
import { menuService } from '@/services/menuService';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { DailyMenuDisplay } from '@/components/menu/DailyMenuDisplay';
import { MenuItemCard } from '@/components/menu/MenuItemCard';

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

// =============================================================================
// TYPES ET INTERFACES
// =============================================================================
interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  count: number;
}

interface FilterOptions {
  selectedCategory: string | null;
  hideAllergens: string[];
  showVegetarianOnly: boolean;
  showVeganOnly: boolean;
  showGlutenFreeOnly: boolean;
}

// =============================================================================
// STYLES DYNAMIQUES
// =============================================================================
const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', insets: any) => ({
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
  
  decorativeLine: {
    height: 2,
    backgroundColor: COLORS.border.golden,
    marginVertical: getResponsiveValue(SPACING.md, screenType),
    alignSelf: 'center' as const,
    width: '40%',
  },
  
  container: {
    paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
  },
  
  // Navigation Catégories - Style Menu
  categoriesSection: {
    marginVertical: getResponsiveValue(SPACING.lg, screenType),
  },
  
  categoryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: getResponsiveValue(SPACING.md, screenType),
    marginRight: getResponsiveValue(SPACING.sm, screenType),
    minWidth: 120,
    alignItems: 'center' as const,
    borderWidth: 2,
    borderColor: COLORS.border.light,
    ...SHADOWS.card,
  },
  
  categoryCardActive: {
    backgroundColor: COLORS.goldenSurface,
    borderColor: COLORS.variants.secondary[400],
    borderWidth: 2,
    ...SHADOWS.goldenGlow,
  },
  
  categoryIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  
  categoryName: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    color: COLORS.text.primary,
    textAlign: 'center' as const,
  },
  
  categoryNameActive: {
    color: COLORS.text.golden,
    fontWeight: TYPOGRAPHY.fontWeight.bold as any,
  },
  
  categoryCount: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
    color: COLORS.text.light,
    marginTop: 2,
  },
  
  // Section de Catégorie - Style Carte Restaurant
  categorySection: {
    marginBottom: getResponsiveValue(SPACING['2xl'], screenType),
  },
  
  sectionTitle: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
    fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
    color: COLORS.primary,
    marginBottom: getResponsiveValue(SPACING.md, screenType),
    textAlign: 'center' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  
  sectionDivider: {
    height: 1,
    backgroundColor: COLORS.border.golden,
    marginBottom: getResponsiveValue(SPACING.lg, screenType),
    width: '60%' as const,
    alignSelf: 'center' as const,
  },
  
  subSectionTitle: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold as any,
    color: COLORS.text.golden,
    marginTop: getResponsiveValue(SPACING.lg, screenType),
    marginBottom: getResponsiveValue(SPACING.md, screenType),
    fontStyle: 'italic' as const,
  },
  
  // Menu Item Card - Style Carte Restaurant
  menuItemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: getResponsiveValue(SPACING.lg, screenType),
    marginBottom: getResponsiveValue(SPACING.md, screenType),
    ...SHADOWS.card,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.variants.secondary[400],
  },
  
  menuItemHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: getResponsiveValue(SPACING.sm, screenType),
  },
  
  menuItemNameContainer: {
    flex: 1,
    marginRight: getResponsiveValue(SPACING.md, screenType),
  },
  
  menuItemName: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold as any,
    color: COLORS.text.primary,
    lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType) * 1.3,
  },
  
  menuItemNameWithPhoto: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  
  photoIcon: {
    marginLeft: 6,
  },
  
  menuItemPrice: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
    fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
    color: COLORS.variants.secondary[600],
    letterSpacing: 0.5,
  },
  
  menuItemDescription: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.normal as any,
    color: COLORS.text.secondary,
    lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
    marginBottom: getResponsiveValue(SPACING.md, screenType),
    fontStyle: 'italic' as const,
  },
  
  // Tags Diététiques - Style Élégant
  dietaryTags: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: getResponsiveValue(SPACING.sm, screenType),
  },
  
  dietaryTag: {
    backgroundColor: COLORS.variants.secondary[50],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.variants.secondary[300],
  },
  
  dietaryTagText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
    color: COLORS.variants.secondary[800],
    fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
  },
  
  // Allergènes
  allergenToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    gap: 6,
  },
  
  allergenToggleText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    color: COLORS.text.secondary,
    fontWeight: TYPOGRAPHY.fontWeight.medium as any,
  },
  
  allergenChips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 4,
  },
  
  allergenChip: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  
  allergenChipText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
    color: '#DC2626',
    fontWeight: TYPOGRAPHY.fontWeight.medium as any,
  },
  
  // Footer de l'item avec bouton
  menuItemFooter: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: getResponsiveValue(SPACING.md, screenType),
    paddingTop: getResponsiveValue(SPACING.sm, screenType),
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  
  categoryBadge: {
    backgroundColor: COLORS.variants.primary[100],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.variants.primary[300],
  },
  
  categoryBadgeText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  
  addButton: {
    backgroundColor: COLORS.variants.secondary[500],
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    ...SHADOWS.button,
  },
  
  addButtonText: {
    color: COLORS.text.inverse,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold as any,
  },
  
  unavailableContainer: {
    backgroundColor: COLORS.border.light,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.lg,
  },
  
  unavailableText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    color: COLORS.text.light,
    fontWeight: TYPOGRAPHY.fontWeight.medium as any,
  },
  
  // Bouton Panier Flottant - Style Premium
  cartButton: {
    position: 'absolute' as const,
    left: getResponsiveValue(SPACING.container, screenType),
    right: getResponsiveValue(SPACING.container, screenType),
    backgroundColor: COLORS.variants.secondary[500],
    borderRadius: BORDER_RADIUS['2xl'],
    padding: getResponsiveValue(SPACING.md, screenType),
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    ...SHADOWS.xl,
    borderWidth: 2,
    borderColor: COLORS.variants.secondary[600],
  },
  
  cartButtonContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  
  cartButtonIcon: {
    backgroundColor: COLORS.text.inverse,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  
  cartButtonText: {
    color: COLORS.text.inverse,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold as any,
  },
  
  cartButtonPrice: {
    color: COLORS.text.inverse,
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
    fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
  },
  
  // Filtres
  filtersButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border.default,
    gap: 6,
    alignSelf: 'center' as const,
    marginVertical: getResponsiveValue(SPACING.md, screenType),
    ...SHADOWS.sm,
  },
  
  filtersButtonActive: {
    backgroundColor: COLORS.goldenSurface,
    borderColor: COLORS.variants.secondary[400],
  },
  
  filtersButtonText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
  },
  
  filtersPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: getResponsiveValue(SPACING.lg, screenType),
    marginBottom: getResponsiveValue(SPACING.md, screenType),
    ...SHADOWS.md,
  },
  
  filtersPanelHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: getResponsiveValue(SPACING.md, screenType),
  },
  
  filtersPanelTitle: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold as any,
    color: COLORS.text.primary,
  },
  
  clearFiltersText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
  },
  
  filterOption: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  
  filterOptionText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    color: COLORS.text.primary,
    fontWeight: TYPOGRAPHY.fontWeight.medium as any,
  },
  
  // États vides
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingVertical: getResponsiveValue(SPACING['4xl'], screenType),
  },
  
  emptyStateText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    color: COLORS.text.secondary,
    textAlign: 'center' as const,
    marginTop: getResponsiveValue(SPACING.md, screenType),
    marginBottom: getResponsiveValue(SPACING.lg, screenType),
  },
  
  // Séparateur de section
  sectionSeparator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginVertical: getResponsiveValue(SPACING.xl, screenType),
  },
  
  separatorLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.border.golden,
  },
  
  separatorText: {
    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    fontWeight: TYPOGRAPHY.fontWeight.bold as any,
    color: COLORS.text.golden,
    marginHorizontal: getResponsiveValue(SPACING.md, screenType),
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
});

// =============================================================================
// COMPOSANTS ENFANTS
// =============================================================================

const RestaurantHeader = React.memo(({ restaurant, styles }: { restaurant: Restaurant; styles: any }) => (
  <View style={styles.restaurantHeader}>
    <Text style={styles.restaurantName}>{restaurant.name}</Text>
    <View style={styles.decorativeLine} />
    <Text style={styles.restaurantSubtitle}>Notre Carte</Text>
  </View>
));

const CategoryNavigation = React.memo(({ 
  categories, 
  selectedCategory, 
  onSelect, 
  styles 
}: {
  categories: MenuCategory[];
  selectedCategory: string | null;
  onSelect: (id: string | null) => void;
  styles: any;
}) => (
  <View style={styles.categoriesSection}>
    <FlatList
      data={categories}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            styles.categoryCard,
            selectedCategory === item.id && styles.categoryCardActive
          ]}
          onPress={() => onSelect(item.id === selectedCategory ? null : item.id)}
        >
          {item.icon && <Text style={styles.categoryIcon}>{item.icon}</Text>}
          <Text style={[
            styles.categoryName,
            selectedCategory === item.id && styles.categoryNameActive
          ]}>
            {item.name}
          </Text>
          {item.count > 0 && (
            <Text style={styles.categoryCount}>({item.count})</Text>
          )}
        </TouchableOpacity>
      )}
      contentContainerStyle={{ paddingHorizontal: getResponsiveValue(SPACING.container, 'mobile') }}
    />
  </View>
));

const SectionSeparator = React.memo(({ title, styles }: { title: string; styles: any }) => (
  <View style={styles.sectionSeparator}>
    <View style={styles.separatorLine} />
    <Text style={styles.separatorText}>{title}</Text>
    <View style={styles.separatorLine} />
  </View>
));

const FiltersPanel = React.memo(({ 
  filters, 
  onToggleFilter, 
  onClearFilters, 
  styles 
}: {
  filters: FilterOptions;
  onToggleFilter: (filterType: keyof FilterOptions) => void;
  onClearFilters: () => void;
  styles: any;
}) => (
  <View style={styles.filtersPanel}>
    <View style={styles.filtersPanelHeader}>
      <Text style={styles.filtersPanelTitle}>Filtres diététiques</Text>
      <TouchableOpacity onPress={onClearFilters}>
        <Text style={styles.clearFiltersText}>Réinitialiser</Text>
      </TouchableOpacity>
    </View>
    
    <TouchableOpacity
      style={styles.filterOption}
      onPress={() => onToggleFilter('showVegetarianOnly')}
    >
      <Text style={styles.filterOptionText}>🥗 Végétarien uniquement</Text>
      {filters.showVegetarianOnly && (
        <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
      )}
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.filterOption}
      onPress={() => onToggleFilter('showVeganOnly')}
    >
      <Text style={styles.filterOptionText}>🌱 Vegan uniquement</Text>
      {filters.showVeganOnly && (
        <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
      )}
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.filterOption, { borderBottomWidth: 0 }]}
      onPress={() => onToggleFilter('showGlutenFreeOnly')}
    >
      <Text style={styles.filterOptionText}>🚫🌾 Sans gluten uniquement</Text>
      {filters.showGlutenFreeOnly && (
        <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
      )}
    </TouchableOpacity>
  </View>
));

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================
export default function RestaurantMenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const { table } = useLocalSearchParams<{ table?: string }>();
  const { cart, addToCart, isCartForRestaurant } = useCart();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  
  const styles = useMemo(() => createStyles(screenType, insets), [screenType, insets]);

  // États
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedAllergens, setExpandedAllergens] = useState<Set<string>>(new Set());
  
  const [filters, setFilters] = useState<FilterOptions>({
    selectedCategory: null,
    hideAllergens: [],
    showVegetarianOnly: false,
    showVeganOnly: false,
    showGlutenFreeOnly: false,
  });

  // Chargement des données
  const loadRestaurantData = useCallback(async () => {
    try {
      setIsLoading(true);

      const [restaurantData, menusData] = await Promise.all([
        restaurantService.getPublicRestaurant(restaurantId),
        menuService.getMenusByRestaurant(parseInt(restaurantId)),
      ]);

      setRestaurant(restaurantData);
      setMenus(menusData);
      
      // Génération des catégories
      const categoryMap = new Map<string, MenuCategory>();
      
      menusData.forEach(menu => {
        menu.items?.forEach(item => {
          if (item.category_name) {
            const categoryId = item.category?.toString() || item.category_name;
            if (!categoryMap.has(categoryId)) {
              categoryMap.set(categoryId, {
                id: categoryId,
                name: item.category_name,
                icon: item.category_icon,
                color: COLORS.primary,
                count: 0,
              });
            }
            categoryMap.get(categoryId)!.count++;
          }
        });
      });

      setCategories([
        { id: 'all', name: 'Tout', icon: '🍽️', color: COLORS.text.secondary, count: 0 },
        ...Array.from(categoryMap.values())
      ]);

    } catch (error) {
      console.error('Error loading restaurant data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données du restaurant');
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRestaurantData();
    setRefreshing(false);
  }, [loadRestaurantData]);

  // Filtrage des items
  const filteredItems = useMemo(() => {
    const allItems = menus.flatMap(menu => menu.items || []);
    
    return allItems.filter(item => {
      if (filters.selectedCategory && filters.selectedCategory !== 'all') {
        const itemCategoryId = item.category?.toString() || item.category_name;
        if (itemCategoryId !== filters.selectedCategory) return false;
      }

      if (filters.showVeganOnly && !item.is_vegan) return false;
      if (filters.showVegetarianOnly && !item.is_vegetarian) return false;
      if (filters.showGlutenFreeOnly && !item.is_gluten_free) return false;

      return true;
    });
  }, [menus, filters]);

  // Groupement par catégorie
  const itemsByCategory = useMemo(() => {
    const grouped = filteredItems.reduce((acc, item) => {
      const categoryName = item.category_name || 'Autres';
      if (!acc[categoryName]) acc[categoryName] = [];
      acc[categoryName].push(item);
      return acc;
    }, {} as Record<string, MenuItem[]>);
  
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  // Handlers
  const handleAddToCart = useCallback((item: MenuItem | any) => {
    if (!isCartForRestaurant(parseInt(restaurantId))) {
      Alert.alert(
        'Changer de restaurant',
        "Vous avez déjà des articles d'un autre restaurant. Voulez-vous vider votre panier ?",
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Continuer', onPress: () => proceedAddToCart(item) },
        ]
      );
    } else {
      proceedAddToCart(item);
    }
  }, [restaurantId, isCartForRestaurant]);

  const proceedAddToCart = useCallback((item: MenuItem | any) => {
    const itemData = {
      id: `${item.id || item.menuItemId}-${Date.now()}`,
      menuItemId: item.id || item.menuItemId,
      name: item.name,
      description: item.description,
      price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
      restaurantId: parseInt(restaurantId),
      restaurantName: item.restaurantName || restaurant?.name || '',
      specialInstructions: '',
    };

    addToCart(itemData);
    Alert.alert('Ajouté au panier', `${item.name} a été ajouté à votre commande`);
  }, [addToCart, restaurantId, restaurant?.name]);

  const toggleFilter = useCallback((filterType: keyof FilterOptions) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: !prev[filterType],
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      selectedCategory: null,
      hideAllergens: [],
      showVegetarianOnly: false,
      showVeganOnly: false,
      showGlutenFreeOnly: false,
    });
  }, []);

  const toggleAllergens = useCallback((itemId: string) => {
    setExpandedAllergens(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  useEffect(() => {
    if (restaurantId) {
      loadRestaurantData();
    }
  }, [restaurantId, loadRestaurantData]);

  const totalCartItems = cart.itemCount;
  const activeFiltersCount = 
    (filters.showVegetarianOnly ? 1 : 0) +
    (filters.showVeganOnly ? 1 : 0) +
    (filters.showGlutenFreeOnly ? 1 : 0);

  // Render section de catégorie
  const renderCategorySection = useCallback(
    ([categoryName, items]: [string, MenuItem[]]) => {
      const groups = items.reduce((acc, item) => {
        const sub =
          (item as any).subcategory_name?.trim() ??
          (item as any).sub_category_name?.trim() ??
          '__noSub';
        if (!acc[sub]) acc[sub] = [];
        acc[sub].push(item);
        return acc;
      }, {} as Record<string, MenuItem[]>);
  
      const subNames = Object.keys(groups)
        .filter(k => k !== '__noSub')
        .sort((a, b) => a.localeCompare(b));

      return (
        <View key={categoryName} style={styles.categorySection}>
          <Text style={styles.sectionTitle}>{categoryName}</Text>
          <View style={styles.sectionDivider} />
  
          {groups['__noSub'] && 
            groups['__noSub'].map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAddToCart={handleAddToCart}
                styles={styles}
                showAllergens={expandedAllergens.has(item.id.toString())}
                onToggleAllergens={() => toggleAllergens(item.id.toString())}
              />
            ))
          }
  
          {subNames.map(subName => (
            <View key={subName}>
              <Text style={styles.subSectionTitle}>{subName}</Text>
              {groups[subName].map(item => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onAddToCart={handleAddToCart}
                  styles={styles}
                  showAllergens={expandedAllergens.has(item.id.toString())}
                  onToggleAllergens={() => toggleAllergens(item.id.toString())}
                />
              ))}
            </View>
          ))}
        </View>
      );
    },
    [styles, handleAddToCart, expandedAllergens, toggleAllergens]
  );

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
        <View style={styles.emptyStateContainer}>
          <Ionicons name="restaurant-outline" size={64} color={COLORS.text.light} />
          <Text style={styles.emptyStateText}>Restaurant non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <Header
        title=""
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon={totalCartItems > 0 ? "bag" : undefined}
        onRightPress={totalCartItems > 0 ? () => router.push('/(client)/cart') : undefined}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* En-tête Restaurant */}
        <RestaurantHeader restaurant={restaurant} styles={styles} />

        <View style={styles.container}>
          {/* Daily Menu Display */}
          <DailyMenuDisplay
            restaurantId={parseInt(restaurantId)}
            restaurantName={restaurant.name}
            onAddToCart={handleAddToCart}
            isInRestaurantView={true}
          />

          {/* Séparateur */}
          <SectionSeparator title="Menu à la carte" styles={styles} />

          {/* Navigation Catégories */}
          <CategoryNavigation
            categories={categories}
            selectedCategory={filters.selectedCategory}
            onSelect={(categoryId) => 
              setFilters(prev => ({ ...prev, selectedCategory: categoryId }))
            }
            styles={styles}
          />

          {/* Bouton Filtres */}
          <TouchableOpacity
            style={[
              styles.filtersButton,
              (activeFiltersCount > 0 || showFilters) && styles.filtersButtonActive
            ]}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons 
              name="filter" 
              size={18} 
              color={activeFiltersCount > 0 ? COLORS.variants.secondary[600] : COLORS.text.secondary} 
            />
            <Text style={styles.filtersButtonText}>
              Filtres {activeFiltersCount > 0 && `(${activeFiltersCount})`}
            </Text>
            <Ionicons 
              name={showFilters ? "chevron-up" : "chevron-down"} 
              size={18} 
              color={COLORS.text.secondary} 
            />
          </TouchableOpacity>

          {/* Panneau de Filtres */}
          {showFilters && (
            <FiltersPanel
              filters={filters}
              onToggleFilter={toggleFilter}
              onClearFilters={clearFilters}
              styles={styles}
            />
          )}

          {/* Liste des items par catégorie */}
          {itemsByCategory.length > 0 ? (
            itemsByCategory.map(renderCategorySection)
          ) : (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="restaurant-outline" size={64} color={COLORS.text.light} />
              <Text style={styles.emptyStateText}>
                Aucun plat ne correspond à vos critères
              </Text>
              <TouchableOpacity onPress={clearFilters}>
                <Text style={styles.clearFiltersText}>Réinitialiser les filtres</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: Math.max(120, insets.bottom + 100) }} />
        </View>
      </ScrollView>

      {/* Bouton panier flottant */}
      {totalCartItems > 0 && (
        <Pressable
          style={[styles.cartButton, { bottom: Math.max(20, insets.bottom + 10) }]}
          onPress={() => router.push('/(client)/cart')}
        >
          <View style={styles.cartButtonContent}>
            <View style={styles.cartButtonIcon}>
              <Ionicons name="bag" size={24} color={COLORS.variants.secondary[600]} />
            </View>
            <View>
              <Text style={styles.cartButtonText}>
                {totalCartItems} article{totalCartItems > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.cartButtonPrice}>
            {cart.total.toFixed(2)}€
          </Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}