// app/menu/[restaurantId].tsx - Carte de restaurant premium avec filtres
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Header } from '@/components/ui/Header';

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

// ========================================
// TYPES
// ========================================

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  category: string;
  subcategory?: string;
  allergens?: string[];
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
  spicy_level?: number;
  preparation_time?: number;
  is_available?: boolean;
}

interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  order?: number;
}

interface MenuSubCategory {
  id: string;
  name: string;
  category: string;
  order?: number;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  specialInstructions?: string;
}

interface Restaurant {
  id: string;
  name: string;
  description?: string;
  cuisine: string;
}

interface Filters {
  categories: string[];
  subcategories: string[];
  dietary: ('vegetarian' | 'vegan' | 'gluten_free')[];
  allergens: string[];
}

interface SectionData {
  title: string;
  categoryId: string;
  categoryIcon?: string;
  categoryColor?: string;
  subcategoryId?: string;
  data: MenuItem[];
}

const ALLERGENS = [
  { id: 'gluten', name: 'Gluten' },
  { id: 'crustaceans', name: 'Crustacés' },
  { id: 'eggs', name: 'Œufs' },
  { id: 'fish', name: 'Poissons' },
  { id: 'peanuts', name: 'Arachides' },
  { id: 'soybeans', name: 'Soja' },
  { id: 'milk', name: 'Lait' },
  { id: 'nuts', name: 'Fruits à coque' },
];

// ========================================
// COMPOSANT PRINCIPAL
// ========================================

export default function MenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  
  // États principaux
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [subcategories, setSubcategories] = useState<MenuSubCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // États filtres
  const [filters, setFilters] = useState<Filters>({
    categories: [],
    subcategories: [],
    dietary: [],
    allergens: []
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // États modaux
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [showCart, setShowCart] = useState(false);

  // ========================================
  // CHARGEMENT DES DONNÉES
  // ========================================

  useEffect(() => {
    loadMenuData();
  }, [restaurantId]);

  const loadMenuData = async () => {
    try {
      setLoading(true);
      
      // Mock data - À remplacer par vos appels API
      const mockRestaurant: Restaurant = {
        id: restaurantId || '1',
        name: 'Le Gourmet Parisien',
        description: 'Cuisine française traditionnelle',
        cuisine: 'Française',
      };

      const mockCategories: MenuCategory[] = [
        { id: 'entrees', name: 'Entrées', icon: '🥗', color: '#10B981', order: 1 },
        { id: 'plats', name: 'Plats', icon: '🍽️', color: '#3B82F6', order: 2 },
        { id: 'desserts', name: 'Desserts', icon: '🍰', color: '#F59E0B', order: 3 },
        { id: 'boissons', name: 'Boissons', icon: '🍷', color: '#EF4444', order: 4 },
      ];

      const mockSubcategories: MenuSubCategory[] = [
        { id: 'salades', name: 'Salades', category: 'entrees', order: 1 },
        { id: 'soupes', name: 'Soupes', category: 'entrees', order: 2 },
        { id: 'viandes', name: 'Viandes', category: 'plats', order: 1 },
        { id: 'poissons', name: 'Poissons', category: 'plats', order: 2 },
        { id: 'vegetarien', name: 'Végétarien', category: 'plats', order: 3 },
      ];

      const mockItems: MenuItem[] = [
        // Entrées - Salades
        {
          id: '1',
          name: 'Salade César',
          description: 'Salade romaine, croûtons dorés, copeaux de parmesan, poulet grillé, sauce César maison',
          price: 14.50,
          category: 'entrees',
          subcategory: 'salades',
          preparation_time: 10,
          allergens: ['milk', 'eggs', 'gluten'],
          is_available: true,
        },
        {
          id: '2',
          name: 'Salade de chèvre chaud',
          description: 'Mesclun, toasts de chèvre chaud, miel, noix, tomates cerises',
          price: 13.90,
          category: 'entrees',
          subcategory: 'salades',
          is_vegetarian: true,
          preparation_time: 12,
          allergens: ['milk', 'gluten', 'nuts'],
          is_available: true,
        },
        // Entrées - Soupes
        {
          id: '3',
          name: 'Soupe à l\'oignon',
          description: 'Soupe d\'oignons caramélisés, croûtons, gruyère gratinée',
          price: 9.50,
          category: 'entrees',
          subcategory: 'soupes',
          is_vegetarian: true,
          preparation_time: 15,
          allergens: ['milk', 'gluten'],
          is_available: true,
        },
        {
          id: '4',
          name: 'Velouté de saison',
          description: 'Crème de légumes frais du marché, huile de truffe',
          price: 8.90,
          category: 'entrees',
          subcategory: 'soupes',
          is_vegan: true,
          is_vegetarian: true,
          is_gluten_free: true,
          preparation_time: 8,
          is_available: true,
        },
        // Plats - Viandes
        {
          id: '5',
          name: 'Entrecôte grillée',
          description: 'Entrecôte française 300g, frites maison, sauce au poivre',
          price: 28.90,
          category: 'plats',
          subcategory: 'viandes',
          preparation_time: 25,
          allergens: ['milk'],
          is_available: true,
        },
        {
          id: '6',
          name: 'Magret de canard',
          description: 'Magret de canard rôti, sauce aux figues, purée de patate douce',
          price: 26.50,
          category: 'plats',
          subcategory: 'viandes',
          preparation_time: 30,
          is_gluten_free: true,
          is_available: true,
        },
        // Plats - Poissons
        {
          id: '7',
          name: 'Saumon mi-cuit',
          description: 'Pavé de saumon écossais, légumes croquants, beurre blanc',
          price: 24.90,
          category: 'plats',
          subcategory: 'poissons',
          preparation_time: 20,
          allergens: ['fish', 'milk'],
          is_gluten_free: true,
          is_available: true,
        },
        {
          id: '8',
          name: 'Dorade royale',
          description: 'Dorade entière grillée, ratatouille provençale',
          price: 27.50,
          category: 'plats',
          subcategory: 'poissons',
          preparation_time: 25,
          allergens: ['fish'],
          is_gluten_free: true,
          is_available: true,
        },
        // Plats - Végétarien
        {
          id: '9',
          name: 'Risotto aux champignons',
          description: 'Risotto crémeux, cèpes, girolles, parmesan, truffe noire',
          price: 21.90,
          category: 'plats',
          subcategory: 'vegetarien',
          is_vegetarian: true,
          preparation_time: 30,
          allergens: ['milk'],
          is_available: true,
        },
        {
          id: '10',
          name: 'Lasagnes végétariennes',
          description: 'Lasagnes aux légumes du soleil, sauce tomate basilic, mozzarella',
          price: 18.90,
          category: 'plats',
          subcategory: 'vegetarien',
          is_vegetarian: true,
          preparation_time: 20,
          allergens: ['milk', 'gluten'],
          is_available: true,
        },
        // Desserts
        {
          id: '11',
          name: 'Tarte tatin',
          description: 'Tarte aux pommes caramélisées, glace vanille Bourbon',
          price: 9.50,
          category: 'desserts',
          is_vegetarian: true,
          preparation_time: 8,
          allergens: ['gluten', 'milk', 'eggs'],
          is_available: true,
        },
        {
          id: '12',
          name: 'Fondant au chocolat',
          description: 'Moelleux au chocolat noir 70%, cœur coulant, glace vanille',
          price: 10.50,
          category: 'desserts',
          is_vegetarian: true,
          preparation_time: 10,
          allergens: ['milk', 'eggs', 'gluten'],
          is_available: true,
        },
        {
          id: '13',
          name: 'Profiteroles',
          description: 'Choux à la crème pâtissière, sauce chocolat chaude, chantilly',
          price: 9.90,
          category: 'desserts',
          is_vegetarian: true,
          preparation_time: 5,
          allergens: ['milk', 'eggs', 'gluten'],
          is_available: true,
        },
        // Boissons
        {
          id: '14',
          name: 'Eau minérale',
          description: 'Eau plate ou gazeuse 50cl',
          price: 3.50,
          category: 'boissons',
          is_vegan: true,
          is_vegetarian: true,
          is_gluten_free: true,
          is_available: true,
        },
        {
          id: '15',
          name: 'Vin rouge (verre)',
          description: 'Sélection de vins de la maison',
          price: 6.50,
          category: 'boissons',
          is_vegetarian: true,
          is_gluten_free: true,
          is_available: true,
        },
      ];

      setRestaurant(mockRestaurant);
      setCategories(mockCategories);
      setSubcategories(mockSubcategories);
      setMenuItems(mockItems);
    } catch (error) {
      console.error('Erreur chargement menu:', error);
      Alert.alert('Erreur', 'Impossible de charger le menu');
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // GESTION DES FILTRES
  // ========================================

  const toggleFilter = (type: keyof Filters, value: any) => {
    setFilters(prev => {
      const currentValues = prev[type] as any[];
      const isActive = currentValues.includes(value);
      
      return {
        ...prev,
        [type]: isActive 
          ? currentValues.filter(v => v !== value)
          : [...currentValues, value]
      };
    });
  };

  const clearAllFilters = () => {
    setFilters({
      categories: [],
      subcategories: [],
      dietary: [],
      allergens: []
    });
    setSearchQuery('');
  };

  const hasActiveFilters = () => {
    return filters.categories.length > 0 ||
           filters.subcategories.length > 0 ||
           filters.dietary.length > 0 ||
           filters.allergens.length > 0 ||
           searchQuery.trim() !== '';
  };

  // ========================================
  // FILTRAGE DES ITEMS
  // ========================================

  const getFilteredItems = useCallback((): MenuItem[] => {
    let filtered = [...menuItems].filter(item => item.is_available);

    // Recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }

    // Filtre par catégorie
    if (filters.categories.length > 0) {
      filtered = filtered.filter(item => filters.categories.includes(item.category));
    }

    // Filtre par sous-catégorie
    if (filters.subcategories.length > 0) {
      filtered = filtered.filter(item => 
        item.subcategory && filters.subcategories.includes(item.subcategory)
      );
    }

    // Filtre par régime alimentaire
    if (filters.dietary.length > 0) {
      filtered = filtered.filter(item => {
        return filters.dietary.every(diet => {
          if (diet === 'vegetarian') return item.is_vegetarian;
          if (diet === 'vegan') return item.is_vegan;
          if (diet === 'gluten_free') return item.is_gluten_free;
          return true;
        });
      });
    }

    // Filtre par allergènes (exclusion)
    if (filters.allergens.length > 0) {
      filtered = filtered.filter(item => {
        const itemAllergens = item.allergens || [];
        return !filters.allergens.some(allergenId => 
          itemAllergens.includes(allergenId)
        );
      });
    }

    return filtered;
  }, [menuItems, filters, searchQuery]);

  // ========================================
  // ORGANISATION EN SECTIONS
  // ========================================

  const getSectionedData = useCallback((): SectionData[] => {
    const filteredItems = getFilteredItems();
    const sections: SectionData[] = [];

    const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedCategories.forEach(category => {
      const categoryItems = filteredItems.filter(item => item.category === category.id);
      
      if (categoryItems.length === 0) return;

      const categorySubcategories = subcategories
        .filter(sub => sub.category === category.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      if (categorySubcategories.length > 0) {
        categorySubcategories.forEach(subcategory => {
          const subcategoryItems = categoryItems.filter(item => item.subcategory === subcategory.id);
          
          if (subcategoryItems.length > 0) {
            sections.push({
              title: `${category.name} › ${subcategory.name}`,
              categoryId: category.id,
              categoryIcon: category.icon,
              categoryColor: category.color,
              subcategoryId: subcategory.id,
              data: subcategoryItems
            });
          }
        });

        const itemsWithoutSubcategory = categoryItems.filter(item => !item.subcategory);
        if (itemsWithoutSubcategory.length > 0) {
          sections.push({
            title: category.name,
            categoryId: category.id,
            categoryIcon: category.icon,
            categoryColor: category.color,
            data: itemsWithoutSubcategory
          });
        }
      } else {
        sections.push({
          title: category.name,
          categoryId: category.id,
          categoryIcon: category.icon,
          categoryColor: category.color,
          data: categoryItems
        });
      }
    });

    return sections;
  }, [getFilteredItems, categories, subcategories]);

  // ========================================
  // GESTION DU PANIER
  // ========================================

  const addToCart = useCallback((item: MenuItem, quantity: number = 1, instructions?: string) => {
    const existingItem = cart.find(cartItem => 
      cartItem.menuItem.id === item.id && 
      cartItem.specialInstructions === instructions
    );
    
    if (existingItem) {
      setCart(cart.map(cartItem =>
        cartItem === existingItem
          ? { ...cartItem, quantity: cartItem.quantity + quantity }
          : cartItem
      ));
    } else {
      setCart([...cart, { 
        menuItem: item, 
        quantity,
        specialInstructions: instructions 
      }]);
    }
  }, [cart]);

  const removeFromCart = useCallback((itemId: string, instructions?: string) => {
    setCart(cart.filter(cartItem => 
      !(cartItem.menuItem.id === itemId && cartItem.specialInstructions === instructions)
    ));
  }, [cart]);

  const updateQuantity = useCallback((itemId: string, quantity: number, instructions?: string) => {
    if (quantity <= 0) {
      removeFromCart(itemId, instructions);
      return;
    }
    
    setCart(cart.map(cartItem =>
      cartItem.menuItem.id === itemId && cartItem.specialInstructions === instructions
        ? { ...cartItem, quantity }
        : cartItem
    ));
  }, [cart, removeFromCart]);

  const clearCart = useCallback(() => {
    Alert.alert(
      'Vider le panier',
      'Êtes-vous sûr de vouloir vider votre panier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Vider', style: 'destructive', onPress: () => setCart([]) }
      ]
    );
  }, []);

  const getTotalPrice = useCallback(() => {
    return cart.reduce((total, item) => total + (item.menuItem.price * item.quantity), 0);
  }, [cart]);

  const getTotalItems = useCallback(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  // ========================================
  // STYLES DYNAMIQUES
  // ========================================

  const dynamicStyles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
      paddingBottom: cart.length > 0 ? 90 : insets.bottom,
    },
    headerCard: {
      backgroundColor: COLORS.goldenSurface,
      paddingTop: insets.top + 12,
      paddingBottom: getResponsiveValue(SPACING.lg, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      borderBottomWidth: 2,
      borderBottomColor: COLORS.border.golden,
      ...SHADOWS.premiumCard,
    },
    headerTop: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.surface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      ...SHADOWS.sm,
    },
    restaurantInfo: {
      flex: 1,
      marginHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
    restaurantName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.primary,
      textAlign: 'center' as const,
    },
    restaurantCuisine: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },
    cartButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.primary,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      position: 'relative' as const,
      ...SHADOWS.md,
    },
    cartBadge: {
      position: 'absolute' as const,
      top: -6,
      right: -6,
      backgroundColor: COLORS.error,
      borderRadius: BORDER_RADIUS.full,
      minWidth: 20,
      height: 20,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 6,
      borderWidth: 2,
      borderColor: COLORS.goldenSurface,
    },
    cartBadgeText: {
      fontSize: 11,
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.inverse,
    },
    searchContainer: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
    filterSection: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.md, screenType),
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      ...SHADOWS.md,
    },
    filterHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    filterTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      flex: 1,
    },
    filterBadge: {
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.full,
      width: 24,
      height: 24,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginLeft: 8,
    },
    filterBadgeText: {
      color: COLORS.text.inverse,
      fontSize: 12,
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
    },
    filterGroup: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    filterGroupTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    filterChipsContainer: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1.5,
      borderColor: COLORS.border.light,
      backgroundColor: COLORS.background,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    filterChipActive: {
      backgroundColor: COLORS.primary,
      borderColor: COLORS.primary,
    },
    filterChipText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
    },
    filterChipTextActive: {
      color: COLORS.text.inverse,
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    },
    sectionHeader: {
      backgroundColor: COLORS.variants.primary[50],
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.lg,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.primary,
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      ...SHADOWS.sm,
    },
    sectionHeaderTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
      color: COLORS.primary,
    },
    sectionHeaderSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginTop: 2,
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
    },
    menuItemCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      ...SHADOWS.lg,
      overflow: 'hidden' as const,
    },
    itemHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    itemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      flex: 1,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    itemPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
      color: COLORS.variants.secondary[600],
      backgroundColor: COLORS.variants.secondary[100],
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1.5,
      borderColor: COLORS.variants.secondary[400],
    },
    itemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    itemFooter: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    dietaryTags: {
      flexDirection: 'row' as const,
      gap: 8,
      flexWrap: 'wrap' as const,
      flex: 1,
    },
    dietaryTag: {
      backgroundColor: COLORS.variants.secondary[50],
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.variants.secondary[200],
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    dietaryTagText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.variants.secondary[800],
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    },
    addButton: {
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      ...SHADOWS.button,
    },
    addButtonText: {
      color: COLORS.text.inverse,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    },
    floatingCart: {
      position: 'absolute' as const,
      bottom: insets.bottom + getResponsiveValue(SPACING.md, screenType),
      left: getResponsiveValue(SPACING.container, screenType),
      right: getResponsiveValue(SPACING.container, screenType),
      backgroundColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      ...SHADOWS.xl,
    },
    cartInfo: {
      flex: 1,
    },
    cartItems: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.inverse,
      opacity: 0.9,
    },
    cartTotal: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.inverse,
    },
    viewCartButton: {
      backgroundColor: COLORS.text.inverse,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    viewCartText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.primary,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingVertical: getResponsiveValue(SPACING['3xl'], screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
    },
    emptyIcon: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    emptyTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    emptyText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
    },
  };

  // ========================================
  // RENDU DES COMPOSANTS
  // ========================================

  const renderFilters = () => {
    const activeFiltersCount = 
      filters.categories.length + 
      filters.subcategories.length + 
      filters.dietary.length + 
      filters.allergens.length;

    return (
      <View style={dynamicStyles.filterSection}>
        <TouchableOpacity 
          onPress={() => setShowFilters(!showFilters)}
          style={dynamicStyles.filterHeader}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <Ionicons 
              name="funnel" 
              size={20} 
              color={COLORS.primary} 
              style={{ marginRight: 8 }} 
            />
            <Text style={dynamicStyles.filterTitle}>Filtres</Text>
            {activeFiltersCount > 0 && (
              <View style={dynamicStyles.filterBadge}>
                <Text style={dynamicStyles.filterBadgeText}>
                  {activeFiltersCount}
                </Text>
              </View>
            )}
          </View>
          <Ionicons 
            name={showFilters ? "chevron-up" : "chevron-down"} 
            size={24} 
            color={COLORS.text.secondary} 
          />
        </TouchableOpacity>

        {showFilters && (
          <>
            {/* Catégories */}
            {categories.length > 0 && (
              <View style={dynamicStyles.filterGroup}>
                <Text style={dynamicStyles.filterGroupTitle}>Catégories</Text>
                <View style={dynamicStyles.filterChipsContainer}>
                  {categories.map(category => (
                    <TouchableOpacity
                      key={category.id}
                      onPress={() => toggleFilter('categories', category.id)}
                      style={[
                        dynamicStyles.filterChip,
                        filters.categories.includes(category.id) && dynamicStyles.filterChipActive
                      ]}
                      activeOpacity={0.7}
                    >
                      {category.icon && (
                        <Text style={{ fontSize: 14 }}>{category.icon}</Text>
                      )}
                      <Text style={[
                        dynamicStyles.filterChipText,
                        filters.categories.includes(category.id) && dynamicStyles.filterChipTextActive
                      ]}>
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Régime alimentaire */}
            <View style={dynamicStyles.filterGroup}>
              <Text style={dynamicStyles.filterGroupTitle}>Régime alimentaire</Text>
              <View style={dynamicStyles.filterChipsContainer}>
                <TouchableOpacity
                  onPress={() => toggleFilter('dietary', 'vegetarian')}
                  style={[
                    dynamicStyles.filterChip,
                    filters.dietary.includes('vegetarian') && dynamicStyles.filterChipActive
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="leaf-outline" 
                    size={14} 
                    color={filters.dietary.includes('vegetarian') ? COLORS.text.inverse : COLORS.text.primary} 
                  />
                  <Text style={[
                    dynamicStyles.filterChipText,
                    filters.dietary.includes('vegetarian') && dynamicStyles.filterChipTextActive
                  ]}>
                    Végétarien
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => toggleFilter('dietary', 'vegan')}
                  style={[
                    dynamicStyles.filterChip,
                    filters.dietary.includes('vegan') && dynamicStyles.filterChipActive
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="nutrition-outline" 
                    size={14} 
                    color={filters.dietary.includes('vegan') ? COLORS.text.inverse : COLORS.text.primary} 
                  />
                  <Text style={[
                    dynamicStyles.filterChipText,
                    filters.dietary.includes('vegan') && dynamicStyles.filterChipTextActive
                  ]}>
                    Vegan
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => toggleFilter('dietary', 'gluten_free')}
                  style={[
                    dynamicStyles.filterChip,
                    filters.dietary.includes('gluten_free') && dynamicStyles.filterChipActive
                  ]}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="fitness-outline" 
                    size={14} 
                    color={filters.dietary.includes('gluten_free') ? COLORS.text.inverse : COLORS.text.primary} 
                  />
                  <Text style={[
                    dynamicStyles.filterChipText,
                    filters.dietary.includes('gluten_free') && dynamicStyles.filterChipTextActive
                  ]}>
                    Sans gluten
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Allergènes */}
            {ALLERGENS.length > 0 && (
              <View style={dynamicStyles.filterGroup}>
                <Text style={dynamicStyles.filterGroupTitle}>
                  Exclure les allergènes
                </Text>
                <View style={dynamicStyles.filterChipsContainer}>
                  {ALLERGENS.map(allergen => (
                    <TouchableOpacity
                      key={allergen.id}
                      onPress={() => toggleFilter('allergens', allergen.id)}
                      style={[
                        dynamicStyles.filterChip,
                        filters.allergens.includes(allergen.id) && dynamicStyles.filterChipActive
                      ]}
                      activeOpacity={0.7}
                    >
                      <Ionicons 
                        name="warning-outline" 
                        size={14} 
                        color={filters.allergens.includes(allergen.id) ? COLORS.text.inverse : COLORS.error} 
                      />
                      <Text style={[
                        dynamicStyles.filterChipText,
                        filters.allergens.includes(allergen.id) && dynamicStyles.filterChipTextActive
                      ]}>
                        {allergen.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Bouton réinitialiser */}
            {hasActiveFilters() && (
              <Button
                title="Réinitialiser les filtres"
                onPress={clearAllFilters}
                variant="outline"
                size="sm"
                leftIcon={<Ionicons name="close-circle-outline" size={18} color={COLORS.primary} />}
                style={{ marginTop: getResponsiveValue(SPACING.xs, screenType) }}
              />
            )}
          </>
        )}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: SectionData }) => (
    <View style={dynamicStyles.sectionHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {section.categoryIcon && (
          <Text style={{ fontSize: 24, marginRight: 8 }}>
            {section.categoryIcon}
          </Text>
        )}
        <View style={{ flex: 1 }}>
          <Text style={dynamicStyles.sectionHeaderTitle}>
            {section.title}
          </Text>
          <Text style={dynamicStyles.sectionHeaderSubtitle}>
            {section.data.length} plat{section.data.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const dietaryTags = [];
    
    if (item.is_vegetarian) dietaryTags.push({ label: 'Végétarien', icon: 'leaf-outline' });
    if (item.is_vegan) dietaryTags.push({ label: 'Vegan', icon: 'nutrition-outline' });
    if (item.is_gluten_free) dietaryTags.push({ label: 'Sans gluten', icon: 'fitness-outline' });
    if (item.preparation_time) dietaryTags.push({ label: `${item.preparation_time} min`, icon: 'time-outline' });

    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => setSelectedItem(item)}
      >
        <Card variant="default" style={dynamicStyles.menuItemCard}>
          <View style={dynamicStyles.itemHeader}>
            <Text style={dynamicStyles.itemName}>{item.name}</Text>
            <Text style={dynamicStyles.itemPrice}>
              {item.price.toFixed(2)}€
            </Text>
          </View>

          <Text style={dynamicStyles.itemDescription}>
            {item.description}
          </Text>

          <View style={dynamicStyles.itemFooter}>
            <View style={dynamicStyles.dietaryTags}>
              {dietaryTags.map((tag, index) => (
                <View key={index} style={dynamicStyles.dietaryTag}>
                  <Ionicons name={tag.icon as any} size={12} color={COLORS.variants.secondary[700]} />
                  <Text style={dynamicStyles.dietaryTagText}>{tag.label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={dynamicStyles.addButton}
              onPress={(e) => {
                e.stopPropagation();
                addToCart(item);
                Alert.alert('Ajouté', `${item.name} ajouté au panier`);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color={COLORS.text.inverse} />
              <Text style={dynamicStyles.addButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    const sectionedData = getSectionedData();
    const isFiltered = hasActiveFilters();

    if (isFiltered && sectionedData.length === 0) {
      return (
        <View style={dynamicStyles.emptyState}>
          <View style={dynamicStyles.emptyIcon}>
            <Ionicons 
              name="funnel-outline" 
              size={64} 
              color={COLORS.text.light} 
            />
          </View>
          <Text style={dynamicStyles.emptyTitle}>
            Aucun résultat
          </Text>
          <Text style={dynamicStyles.emptyText}>
            Aucun plat ne correspond aux filtres sélectionnés.{'\n'}
            Essayez de modifier vos critères.
          </Text>
          <Button
            title="Réinitialiser"
            onPress={clearAllFilters}
            variant="outline"
            style={{ marginTop: getResponsiveValue(SPACING.md, screenType) }}
            leftIcon={<Ionicons name="close-circle-outline" size={20} color={COLORS.primary} />}
          />
        </View>
      );
    }

    return (
      <View style={dynamicStyles.emptyState}>
        <View style={dynamicStyles.emptyIcon}>
          <Ionicons 
            name="restaurant-outline" 
            size={64} 
            color={COLORS.text.light} 
          />
        </View>
        <Text style={dynamicStyles.emptyTitle}>
          Menu non disponible
        </Text>
        <Text style={dynamicStyles.emptyText}>
          Le menu de ce restaurant n'est pas encore disponible.
        </Text>
      </View>
    );
  };

  // ========================================
  // RENDU PRINCIPAL
  // ========================================

  if (loading) {
    return (
      <View style={[dynamicStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: getResponsiveValue(SPACING.md, screenType), color: "#6B7280" }}>
          Chargement du menu...
        </Text>
      </View>
    );
  }

  const sectionedData = getSectionedData();

  return (
    <View style={dynamicStyles.container}>
      <SectionList
        sections={sectionedData}
        renderItem={renderMenuItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Header Restaurant */}
            <View style={dynamicStyles.headerCard}>
              <View style={dynamicStyles.headerTop}>
                <TouchableOpacity 
                  style={dynamicStyles.backButton}
                  onPress={() => router.back()}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
                </TouchableOpacity>
                
                <View style={dynamicStyles.restaurantInfo}>
                  <Text style={dynamicStyles.restaurantName}>
                    {restaurant?.name || 'Menu'}
                  </Text>
                  {restaurant?.cuisine && (
                    <Text style={dynamicStyles.restaurantCuisine}>
                      Cuisine {restaurant.cuisine}
                    </Text>
                  )}
                </View>
                
                <TouchableOpacity 
                  style={dynamicStyles.cartButton}
                  onPress={() => setShowCart(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="bag-outline" size={24} color={COLORS.text.inverse} />
                  {getTotalItems() > 0 && (
                    <View style={dynamicStyles.cartBadge}>
                      <Text style={dynamicStyles.cartBadgeText}>
                        {getTotalItems()}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              
              {/* Search Bar */}
              <View style={dynamicStyles.searchContainer}>
                <Input
                  placeholder="Rechercher un plat..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  leftIcon="search-outline"
                  rightIcon={searchQuery ? "close-outline" : undefined}
                  onRightIconPress={searchQuery ? () => setSearchQuery('') : undefined}
                  fullWidth
                />
              </View>
            </View>

            {/* Filtres */}
            {renderFilters()}
          </>
        }
        ListEmptyComponent={renderEmptyState}
      />

      {/* Floating Cart */}
      {cart.length > 0 && (
        <TouchableOpacity 
          style={dynamicStyles.floatingCart}
          onPress={() => setShowCart(true)}
          activeOpacity={0.9}
        >
          <View style={dynamicStyles.cartInfo}>
            <Text style={dynamicStyles.cartItems}>
              {getTotalItems()} article{getTotalItems() > 1 ? 's' : ''}
            </Text>
            <Text style={dynamicStyles.cartTotal}>
              {getTotalPrice().toFixed(2)}€
            </Text>
          </View>
          
          <View style={dynamicStyles.viewCartButton}>
            <Text style={dynamicStyles.viewCartText}>Voir le panier</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Modals - À implémenter selon vos besoins */}
      {/* CartModal et ProductDetailModal */}
    </View>
  );
}