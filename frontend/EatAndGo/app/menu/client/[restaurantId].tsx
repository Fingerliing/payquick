import React, { useState, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/contexts/CartContext';
import { menuService } from '@/services/menuService';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';

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

export default function ClientMenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const { table } = useLocalSearchParams<{ table?: string }>();
  const { cart, addToCart, isCartForRestaurant } = useCart();

  // États existants
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Nouveaux états pour les catégories et filtres
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    selectedCategory: null,
    hideAllergens: [],
    showVegetarianOnly: false,
    showVeganOnly: false,
    showGlutenFreeOnly: false,
  });

  // Simuler des préférences utilisateur (à remplacer par de vraies données du profil)
  const [userPreferences] = useState({
    allergens: [], // ['gluten', 'milk'] - allergies de l'utilisateur
    isVegetarian: false,
    isVegan: false,
    isGlutenFree: false,
  });

  useEffect(() => {
    if (restaurantId) {
      loadRestaurantData();
    }
  }, [restaurantId]);

  // Effet pour appliquer les préférences automatiquement
  useEffect(() => {
    if (userPreferences.allergens.length > 0 || userPreferences.isVegetarian || userPreferences.isVegan || userPreferences.isGlutenFree) {
      setFilters(prev => ({
        ...prev,
        hideAllergens: userPreferences.allergens,
        showVegetarianOnly: userPreferences.isVegetarian && !userPreferences.isVegan,
        showVeganOnly: userPreferences.isVegan,
        showGlutenFreeOnly: userPreferences.isGlutenFree,
      }));
    }
  }, [userPreferences]);

  const loadRestaurantData = async () => {
    try {
      setIsLoading(true);

      const [restaurantData, menusData] = await Promise.all([
        restaurantService.getPublicRestaurant(restaurantId),
        menuService.getMenusByRestaurant(parseInt(restaurantId)),
      ]);

      setRestaurant(restaurantData);
      setMenus(menusData);
      
      // Extraire les catégories des items
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
                color: '#FF6B35', // Couleur par défaut
                count: 0,
              });
            }
            const category = categoryMap.get(categoryId)!;
            category.count++;
          }
        });
      });

      setCategories([
        { id: 'all', name: 'Tout voir', icon: '🍽️', color: '#6B7280', count: 0 },
        ...Array.from(categoryMap.values())
      ]);

    } catch (error) {
      console.error('Error loading restaurant data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données du restaurant');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRestaurantData();
    setRefreshing(false);
  };

  // Filtrer les items selon les critères sélectionnés
  const filteredItems = useMemo(() => {
    const allItems = menus.flatMap(menu => menu.items || []);
    
    return allItems.filter(item => {
      // Filtre par catégorie
      if (filters.selectedCategory && filters.selectedCategory !== 'all') {
        const itemCategoryId = item.category?.toString() || item.category_name;
        if (itemCategoryId !== filters.selectedCategory) return false;
      }

      // Filtre par allergènes (cacher les items contenant les allergènes)
      if (filters.hideAllergens.length > 0) {
        const hasAllergen = filters.hideAllergens.some(allergen => 
          item.allergens?.includes(allergen)
        );
        if (hasAllergen) return false;
      }

      // Filtres diététiques
      if (filters.showVeganOnly && !item.is_vegan) return false;
      if (filters.showVegetarianOnly && !item.is_vegetarian) return false;
      if (filters.showGlutenFreeOnly && !item.is_gluten_free) return false;

      return true;
    });
  }, [menus, filters]);

  // Grouper les items par catégorie
  const itemsByCategory = useMemo(() => {
    const grouped = filteredItems.reduce((acc, item) => {
      const categoryName = item.category_name || 'Autres';
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(item);
      return acc;
    }, {} as Record<string, MenuItem[]>);

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const handleAddToCart = (item: MenuItem) => {
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
  };

  const proceedAddToCart = (item: MenuItem) => {
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
  };

  const toggleFilter = (filterType: keyof FilterOptions, value?: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value !== undefined ? value : !prev[filterType],
    }));
  };

  const clearFilters = () => {
    setFilters({
      selectedCategory: null,
      hideAllergens: userPreferences.allergens,
      showVegetarianOnly: userPreferences.isVegetarian && !userPreferences.isVegan,
      showVeganOnly: userPreferences.isVegan,
      showGlutenFreeOnly: userPreferences.isGlutenFree,
    });
  };

  const renderCategoryButton = ({ item }: { item: MenuCategory }) => (
    <TouchableOpacity
      style={[
        styles.categoryButton,
        filters.selectedCategory === item.id && styles.categoryButtonActive
      ]}
      onPress={() => toggleFilter('selectedCategory', item.id === filters.selectedCategory ? null : item.id)}
    >
      <Text style={styles.categoryIcon}>{item.icon}</Text>
      <Text style={[
        styles.categoryText,
        filters.selectedCategory === item.id && styles.categoryTextActive
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderMenuItem = ({ item }: { item: MenuItem }) => (
    <Card style={{ margin: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
            {item.name}
          </Text>
          
          {/* Tags diététiques */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {item.is_vegan && (
              <Text style={styles.dietaryTag}>🌱 Vegan</Text>
            )}
            {item.is_vegetarian && !item.is_vegan && (
              <Text style={styles.dietaryTag}>🥗 Végétarien</Text>
            )}
            {item.is_gluten_free && (
              <Text style={styles.dietaryTag}>🚫🌾 Sans gluten</Text>
            )}
          </View>

          {item.description && (
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>
              {item.description}
            </Text>
          )}

          {/* Allergènes */}
          {item.allergens && item.allergens.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '500' }}>
                Contient: {item.allergen_display?.join(', ') || item.allergens.join(', ')}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF6B35' }}>
              {parseFloat(item.price).toFixed(2)} €
            </Text>
            <Text style={styles.categoryBadge}>
              {item.category_name}
            </Text>
          </View>
        </View>
      </View>

      {item.is_available ? (
        <Button
          title="Ajouter au panier"
          onPress={() => handleAddToCart(item)}
          leftIcon="add"
          style={{ marginTop: 12, backgroundColor: '#FF6B35' }}
        />
      ) : (
        <View style={styles.unavailableContainer}>
          <Text style={styles.unavailableText}>Temporairement indisponible</Text>
        </View>
      )}
    </Card>
  );

  const renderCategorySection = ([categoryName, items]: [string, MenuItem[]]) => (
    <View key={categoryName} style={{ marginBottom: 24 }}>
      <Text style={styles.sectionTitle}>{categoryName}</Text>
      <FlatList
        data={items}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id.toString()}
        scrollEnabled={false}
      />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement du menu..." />
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Restaurant non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalCartItems = cart.itemCount;
  const activeFiltersCount = Object.values(filters).filter(Boolean).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header
        title={restaurant.name}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon={totalCartItems > 0 ? 'bag' : undefined}
        onRightPress={totalCartItems > 0 ? () => router.push('/(client)/cart') : undefined}
      />

      {/* Restaurant Info */}
      <Card style={{ margin: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
          {restaurant.name}
        </Text>
        {restaurant.description && (
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 12 }}>
            {restaurant.description}
          </Text>
        )}
        {table && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="restaurant-outline" size={16} color="#FF6B35" />
            <Text style={{ fontSize: 14, color: '#FF6B35', marginLeft: 4, fontWeight: '500' }}>
              Table {table}
            </Text>
          </View>
        )}
      </Card>

      {/* Catégories */}
      <View style={{ marginBottom: 8 }}>
        <FlatList
          data={categories}
          renderItem={renderCategoryButton}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        />
      </View>

      {/* Bouton Filtres */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.filterButton, activeFiltersCount > 0 && styles.filterButtonActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons 
            name="filter" 
            size={16} 
            color={activeFiltersCount > 0 ? '#FF6B35' : '#6B7280'} 
          />
          <Text style={[
            styles.filterButtonText,
            activeFiltersCount > 0 && styles.filterButtonTextActive
          ]}>
            Filtres {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Panneau de filtres */}
      {showFilters && (
        <Card style={{ margin: 16, marginTop: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>Filtres</Text>
            <TouchableOpacity onPress={clearFilters}>
              <Text style={{ color: '#FF6B35', fontSize: 14 }}>Réinitialiser</Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              style={styles.filterOption}
              onPress={() => toggleFilter('showVegetarianOnly')}
            >
              <Text>🥗 Végétarien uniquement</Text>
              {filters.showVegetarianOnly && <Ionicons name="checkmark" size={20} color="#FF6B35" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.filterOption}
              onPress={() => toggleFilter('showVeganOnly')}
            >
              <Text>🌱 Vegan uniquement</Text>
              {filters.showVeganOnly && <Ionicons name="checkmark" size={20} color="#FF6B35" />}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.filterOption}
              onPress={() => toggleFilter('showGlutenFreeOnly')}
            >
              <Text>🚫🌾 Sans gluten uniquement</Text>
              {filters.showGlutenFreeOnly && <Ionicons name="checkmark" size={20} color="#FF6B35" />}
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {/* Liste des plats par catégorie */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {itemsByCategory.length > 0 ? (
          itemsByCategory.map(renderCategorySection)
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="restaurant-outline" size={64} color="#ccc" />
            <Text style={{ fontSize: 18, color: '#6B7280', textAlign: 'center', marginTop: 16 }}>
              Aucun plat ne correspond à vos critères
            </Text>
            <TouchableOpacity onPress={clearFilters} style={{ marginTop: 16 }}>
              <Text style={{ color: '#FF6B35', fontSize: 16 }}>Réinitialiser les filtres</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bouton panier flottant */}
      {totalCartItems > 0 && (
        <Pressable
          style={styles.cartButton}
          onPress={() => router.push('/(client)/cart')}
        >
          <View>
            <Text style={styles.cartButtonText}>
              {totalCartItems} article{totalCartItems > 1 ? 's' : ''}
            </Text>
            <Text style={styles.cartButtonSubtext}>
              {cart.total.toFixed(2)} €
            </Text>
          </View>
          <Ionicons name="bag" size={20} color="#fff" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = {
  categoryButton: {
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    minWidth: 80,
  },
  categoryButtonActive: {
    backgroundColor: '#FF6B35',
  },
  categoryIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center' as const,
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '600' as const,
  },
  filterButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    gap: 8,
  },
  filterButtonActive: {
    backgroundColor: '#FEF3F2',
    borderWidth: 1,
    borderColor: '#FF6B35',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#FF6B35',
    fontWeight: '500' as const,
  },
  filterOption: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  dietaryTag: {
    fontSize: 11,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  categoryBadge: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: '#333',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  unavailableContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center' as const,
  },
  unavailableText: {
    color: '#6B7280',
    fontSize: 14,
  },
  cartButton: {
    position: 'absolute' as const,
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cartButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  cartButtonSubtext: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
  },
};