// app/(client)/restaurant/[restaurantId].tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  SafeAreaView,
  RefreshControl,
  Alert,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { useCart } from '@/contexts/CartContext';
import { menuService } from '@/services/menuService';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';

// Types
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';

// Design System & Styles
import { useScreenType } from '@/utils/designSystem';
import { createRestaurantMenuStyles } from '@/styles/restaurantMenuStyles';

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
// COMPOSANTS ENFANTS OPTIMISÉS
// =============================================================================

// Navigation Sticky pour Catégories
const StickyNavigation = React.memo(({ 
  categories, 
  selectedCategory, 
  onCategorySelect, 
  styles 
}: {
  categories: MenuCategory[];
  selectedCategory: string | null;
  onCategorySelect: (categoryId: string | null) => void;
  styles: any;
}) => {
  const renderNavPill = useCallback(({ item }: { item: MenuCategory }) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.navPill,
        selectedCategory === item.id && styles.navPillActive
      ]}
      onPress={() => onCategorySelect(item.id === selectedCategory ? null : item.id)}
      accessibilityRole="button"
      accessibilityLabel={`Catégorie ${item.name}`}
      accessibilityState={{ selected: selectedCategory === item.id }}
    >
      {item.icon && <Text style={styles.categoryIcon}>{item.icon}</Text>}
      <Text style={[
        styles.navPillText,
        selectedCategory === item.id && styles.navPillTextActive
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  ), [selectedCategory, onCategorySelect, styles]);

  return (
    <View style={styles.stickyNav}>
      <FlatList
        data={categories}
        renderItem={renderNavPill}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stickyNavContent}
      />
    </View>
  );
});

// Row d'Actions (Filtres)
const ActionsRow = React.memo(({ 
  activeFiltersCount, 
  showFilters, 
  onToggleFilters, 
  styles 
}: {
  activeFiltersCount: number;
  showFilters: boolean;
  onToggleFilters: () => void;
  styles: any;
}) => (
  <View style={styles.actionsRow}>
    <View style={{ flex: 1 }} />
    
    <TouchableOpacity
      style={[
        styles.filterButton,
        activeFiltersCount > 0 && styles.filterButtonActive
      ]}
      onPress={onToggleFilters}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir les filtres"
      accessibilityHint="Permet de filtrer les items du menu"
    >
      <Ionicons 
        name="filter" 
        size={16} 
        color={activeFiltersCount > 0 ? '#1E2A78' : '#6B7280'} 
      />
      <Text style={[
        styles.filterButtonText,
        activeFiltersCount > 0 && styles.filterButtonTextActive
      ]}>
        Filtres {activeFiltersCount > 0 && `(${activeFiltersCount})`}
      </Text>
    </TouchableOpacity>
  </View>
));

// Panneau de Filtres
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
      <Text style={styles.filtersPanelTitle}>Filtres</Text>
      <TouchableOpacity onPress={onClearFilters}>
        <Text style={styles.clearFiltersText}>Réinitialiser</Text>
      </TouchableOpacity>
    </View>
    
    <View style={styles.filterOptions}>
      <TouchableOpacity
        style={styles.filterOption}
        onPress={() => onToggleFilter('showVegetarianOnly')}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: filters.showVegetarianOnly }}
      >
        <Text style={styles.filterOptionText}>🥗 Végétarien uniquement</Text>
        {filters.showVegetarianOnly && (
          <Ionicons name="checkmark" size={20} color="#1E2A78" />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.filterOption}
        onPress={() => onToggleFilter('showVeganOnly')}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: filters.showVeganOnly }}
      >
        <Text style={styles.filterOptionText}>🌱 Vegan uniquement</Text>
        {filters.showVeganOnly && (
          <Ionicons name="checkmark" size={20} color="#1E2A78" />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.filterOption}
        onPress={() => onToggleFilter('showGlutenFreeOnly')}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: filters.showGlutenFreeOnly }}
      >
        <Text style={styles.filterOptionText}>🚫🌾 Sans gluten uniquement</Text>
        {filters.showGlutenFreeOnly && (
          <Ionicons name="checkmark" size={20} color="#1E2A78" />
        )}
      </TouchableOpacity>
    </View>
  </View>
));

// Menu Item Card avec nouveau design
const MenuItemCard = React.memo(({ 
  item, 
  onAddToCart, 
  styles,
  showAllergens,
  onToggleAllergens 
}: {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  styles: any;
  showAllergens: boolean;
  onToggleAllergens: () => void;
}) => {
  const [showImageModal, setShowImageModal] = React.useState(false);
  const hasImage = Boolean(item.image_url);

  return (
    <View style={[styles.card, styles.gridItem]}>
      <View style={styles.menuItemRow}>
        {/* Thumbnail — supprimé pour ne pas afficher l'image directement */}
        {/* {hasImage && (
          <View style={styles.menuItemThumb}>
            <Image 
              source={{ uri: item.image_url! }} 
              style={styles.menuItemThumb}
              resizeMode="cover"
            />
          </View>
        )} */}

        {/* Content Column */}
        <View style={styles.menuItemCol}>
          {/* Header avec nom et prix */}
          <View style={styles.menuItemHeaderRow}>
            {/* Groupe nom + icône photo */}
            <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
              {hasImage ? (
                <TouchableOpacity
                  onPress={() => setShowImageModal(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Voir la photo de ${item.name}`}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Text
                    style={styles.menuItemName}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                  <Ionicons
                    name="camera"
                    size={16}
                    color="#1E2A78"
                    style={{ marginLeft: 4 }}
                  />
                </TouchableOpacity>
              ) : (
                <Text style={styles.menuItemName} numberOfLines={2}>
                  {item.name}
                </Text>
              )}
            </View>

            {/* Prix aligné à droite */}
            <Text style={styles.menuItemPrice}>
              {parseFloat(item.price).toFixed(2)}€
            </Text>
          </View>

          {/* Description */}
          {item.description && (
            <Text style={styles.menuItemDescription} numberOfLines={3}>
              {item.description}
            </Text>
          )}

          {/* Tags diététiques */}
          <View style={styles.tagsRow}>
            {item.is_vegan && (
              <View style={[styles.tag, styles.dietaryTagVegan]}>
                <Text style={styles.tagText}>🌱 Vegan</Text>
              </View>
            )}
            {item.is_vegetarian && !item.is_vegan && (
              <View style={[styles.tag, styles.dietaryTagVegetarian]}>
                <Text style={styles.tagText}>🥗 Végétarien</Text>
              </View>
            )}
            {item.is_gluten_free && (
              <View style={[styles.tag, styles.dietaryTagGlutenFree]}>
                <Text style={styles.tagText}>🚫🌾 Sans gluten</Text>
              </View>
            )}
          </View>

          {/* Allergènes */}
          {item.allergens && item.allergens.length > 0 && (
            <>
              <TouchableOpacity 
                style={styles.allergenToggle}
                onPress={onToggleAllergens}
              >
                <Ionicons 
                  name={showAllergens ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color="#6B7280" 
                />
                <Text style={styles.allergenToggleText}>
                  Allergènes ({item.allergens.length})
                </Text>
              </TouchableOpacity>

              {showAllergens && (
                <View style={styles.allergenChipsRow}>
                  {item.allergens.map((allergen, index) => (
                    <View key={index} style={styles.allergenChip}>
                      <Text style={styles.allergenChipText}>{allergen}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Footer avec catégorie et bouton */}
          <View style={styles.menuItemFooterRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>
                {item.category_name}
              </Text>
            </View>

            {item.is_available ? (
              <Button
                title="Ajouter"
                onPress={() => onAddToCart(item)}
                leftIcon={<Ionicons name="add" size={16} color="#FFFFFF" />}
                variant="primary"
                size="sm"
              />
            ) : (
              <View style={styles.unavailableContainer}>
                <Text style={styles.unavailableText}>Indisponible</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Modal d'image centré */}
      {hasImage && (
        <Modal
          visible={showImageModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowImageModal(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.7)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onPress={() => setShowImageModal(false)}
            accessibilityRole="button"
            accessibilityLabel="Fermer l'image"
          >
            <Image
              source={{ uri: item.image_url! }}
              style={{ width: '90%', height: '60%', borderRadius: 12 }}
              resizeMode="contain"
            />
            <Text style={{ color: 'white', marginTop: 12 }}>{item.name}</Text>
          </Pressable>
        </Modal>
      )}
    </View>
  );
});

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================
export default function ModernClientMenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const { table } = useLocalSearchParams<{ table?: string }>();
  const { cart, addToCart, isCartForRestaurant } = useCart();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();

  // Styles mémorisés
  const styles = useMemo(() => createRestaurantMenuStyles(screenType), [screenType]);

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
                color: '#1E2A78',
                count: 0,
              });
            }
            categoryMap.get(categoryId)!.count++;
          }
        });
      });

      setCategories([
        { id: 'all', name: 'Tout', icon: '🍽️', color: '#6B7280', count: 0 },
        ...Array.from(categoryMap.values())
      ]);

    } catch (error) {
      console.error('Error loading restaurant data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données du restaurant');
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId]);

  // Refresh
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
  const handleAddToCart = useCallback((item: MenuItem) => {
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

  const proceedAddToCart = useCallback((item: MenuItem) => {
    addToCart({
      id: `${item.id}-${Date.now()}`,
      menuItemId: item.id,
      name: item.name,
      description: item.description,
      price: parseFloat(item.price),
      restaurantId: parseInt(restaurantId),
      restaurantName: restaurant?.name || '',
      specialInstructions: '',
    });

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

  // Effet de chargement initial
  useEffect(() => {
    if (restaurantId) {
      loadRestaurantData();
    }
  }, [restaurantId, loadRestaurantData]);

  // Compteurs pour l'UI
  const totalCartItems = cart.itemCount;
  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

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
  
      const hasSubcategories = subNames.length > 0;
  
      return (
        <View key={categoryName} style={styles.categorySection}>
          <Text style={styles.sectionTitle}>{categoryName}</Text>
  
          {groups['__noSub'] && (
            <View style={styles.grid}>
              {groups['__noSub'].map(item => (
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
          )}
  
          {hasSubcategories &&
            subNames.map(subName => (
              <View key={subName} style={styles.subCategorySection}>
                <Text style={styles.subSectionTitle}>{subName}</Text>
                <View style={styles.grid}>
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
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Restaurant non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <Header
        title={restaurant.name}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon={totalCartItems > 0 ? "bag" : undefined}
        onRightPress={totalCartItems > 0 ? () => router.push('/(client)/cart') : undefined}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* Sticky Navigation */}
          <StickyNavigation
            categories={categories}
            selectedCategory={filters.selectedCategory}
            onCategorySelect={(categoryId) => 
              setFilters(prev => ({ ...prev, selectedCategory: categoryId }))
            }
            styles={styles}
          />

          {/* Actions Row */}
          <ActionsRow
            activeFiltersCount={activeFiltersCount}
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            styles={styles}
          />

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
              <Ionicons name="restaurant-outline" size={64} color="#9CA3AF" />
              <Text style={styles.emptyStateText}>
                Aucun plat ne correspond à vos critères
              </Text>
              <TouchableOpacity onPress={clearFilters} style={styles.resetFiltersButton}>
                <Text style={styles.resetFiltersText}>Réinitialiser les filtres</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: Math.max(100, insets.bottom + 80) }} />
        </View>
      </ScrollView>

      {/* Bouton panier flottant */}
      {totalCartItems > 0 && (
        <Pressable
          style={[styles.cartButton, { bottom: Math.max(20, insets.bottom + 10) }]}
          onPress={() => router.push('/(client)/cart')}
          accessibilityRole="button"
          accessibilityLabel={`Panier avec ${totalCartItems} articles`}
        >
          <View>
            <Text style={styles.cartButtonText}>
              {totalCartItems} article{totalCartItems > 1 ? 's' : ''}
            </Text>
            <Text style={styles.cartButtonSubtext}>
              {cart.total.toFixed(2)}€
            </Text>
          </View>
          <Ionicons name="bag" size={20} color="#111827" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}