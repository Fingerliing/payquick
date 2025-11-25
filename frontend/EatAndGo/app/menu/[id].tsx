import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Image } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert, AlertWithAction, useAlert } from '@/components/ui/Alert';

// Services & Types
import { menuService } from '@/services/menuService';
import { categoryService } from '@/services/categoryService';
import { Menu, MenuItem, Allergen } from '@/types/menu';
import { MenuCategory, MenuSubCategory } from '@/types/category';
import { ALLERGENS } from '@/utils/allergens';

// Design System
import {
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY,
  COMPONENT_CONSTANTS,
} from '@/utils/designSystem';

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

export default function MenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  
  // État principal
  const [menu, setMenu] = useState<Menu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  // État des données de filtrage
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [subcategories, setSubcategories] = useState<MenuSubCategory[]>([]);
  const [allergens] = useState<Allergen[]>(ALLERGENS);
  
  // État des filtres actifs
  const [filters, setFilters] = useState<Filters>({
    categories: [],
    subcategories: [],
    dietary: [],
    allergens: []
  });
  
  // État UI des filtres
  const [showFilters, setShowFilters] = useState(false);

  // Hook pour gérer les alertes
  const {
    alertState,
    showSuccess,
    showError,
    hideAlert,
  } = useAlert();

  // État pour la modal de confirmation de suppression
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);

  // Recharger les données à chaque fois que l'écran devient actif
  useFocusEffect(
    useCallback(() => {
      loadInitialData();
    }, [id])
  );

  const loadInitialData = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      
      // Charger le menu et les catégories
      const menuData = await menuService.getMenu(parseInt(id));
      setMenu(menuData);
      
      // Charger les catégories du restaurant
      if (menuData.restaurant) {
        const categoriesData = await categoryService.getCategoriesByRestaurant(String(menuData.restaurant));
        setCategories(categoriesData.categories || []);
        
        // Extraire toutes les sous-catégories EN AJOUTANT LA RÉFÉRENCE AU PARENT
        const allSubcategories = (categoriesData.categories || []).flatMap(cat => 
          (cat.subcategories || []).map(sub => ({
            ...sub,
            category: cat.id  // Ajouter la référence à la catégorie parente
          }))
        );
        setSubcategories(allSubcategories);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      showError('Impossible de charger les données', 'Erreur');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const loadMenu = async () => {
    if (!id) return;
    
    try {
      const menuData = await menuService.getMenu(parseInt(id));
      setMenu(menuData);
    } catch (error) {
      console.error('Erreur lors du chargement du menu:', error);
      showError('Impossible de charger le menu', 'Erreur');
    }
  };

  const handleToggleItemAvailability = async (item: MenuItem) => {
    setTogglingItemId(item.id);
    try {
      const updatedItem = await menuService.menuItems.toggleItemAvailability(item.id);
      setMenu(prevMenu => {
        if (!prevMenu) return null;
        return {
          ...prevMenu,
          items: prevMenu.items.map(i => 
            i.id === item.id ? { ...i, is_available: updatedItem.is_available } : i
          )
        };
      });
      
      showSuccess(
        `Plat ${updatedItem.is_available ? 'activé' : 'désactivé'} avec succès`,
        'Succès'
      );
    } catch (error) {
      console.error('Erreur lors de la modification de l\'item:', error);
      showError('Impossible de modifier le statut du plat', 'Erreur');
    } finally {
      setTogglingItemId(null);
    }
  };

  const handleDeleteItem = (item: MenuItem) => {
    setItemToDelete(item);
  };
  
  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    
    setDeletingItemId(itemToDelete.id);
    const itemName = itemToDelete.name;
    
    try {
      await menuService.menuItems.deleteMenuItem(itemToDelete.id);
      setMenu(prevMenu => {
        if (!prevMenu) return null;
        return {
          ...prevMenu,
          items: prevMenu.items.filter(i => i.id !== itemToDelete.id)
        };
      });
      
      setItemToDelete(null);
      showSuccess(`Le plat "${itemName}" a été supprimé avec succès`, 'Succès');
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      showError('Impossible de supprimer le plat. Veuillez réessayer.', 'Erreur');
    } finally {
      setDeletingItemId(null);
    }
  };

  // Gestion des filtres
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
  };

  const hasActiveFilters = () => {
    return filters.categories.length > 0 ||
           filters.subcategories.length > 0 ||
           filters.dietary.length > 0 ||
           filters.allergens.length > 0;
  };

  // Filtrer les items du menu
  const getFilteredItems = () => {
    if (!menu) return [];
    
    let filtered = [...menu.items];

    // Filtre par catégorie
    if (filters.categories.length > 0) {
      filtered = filtered.filter(item => 
        item.category && filters.categories.includes(item.category)
      );
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

    // Filtre par allergènes (exclure les items contenant ces allergènes)
    if (filters.allergens.length > 0) {
      filtered = filtered.filter(item => {
        const itemAllergens = item.allergens || [];
        return !filters.allergens.some(allergenId => 
          itemAllergens.includes(allergenId)
        );
      });
    }

    return filtered;
  };

  // Regrouper les items par catégorie et sous-catégorie
  const getSectionedData = (): SectionData[] => {
    const filteredItems = getFilteredItems();
    const sections: SectionData[] = [];
    
    // Récupérer les catégories triées
    const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedCategories.forEach(category => {
      // Récupérer les items de cette catégorie
      const categoryItems = filteredItems.filter(item => item.category === category.id);
        
      if (categoryItems.length === 0) return;

      // Récupérer les sous-catégories de cette catégorie
      const categorySubcategories = subcategories
        .filter(sub => sub.category === category.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      if (categorySubcategories.length > 0) {
        // Si la catégorie a des sous-catégories
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

        // Items sans sous-catégorie dans cette catégorie
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
        // Pas de sous-catégories, tous les items sous la catégorie
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
  };

  // Styles dynamiques avec SafeArea
  const dynamicStyles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
      paddingBottom: insets.bottom,
    },
    headerCard: {
      backgroundColor: COLORS.goldenSurface,
      borderBottomLeftRadius: BORDER_RADIUS['2xl'],
      borderBottomRightRadius: BORDER_RADIUS['2xl'],
      padding: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 2,
      borderBottomColor: COLORS.border.golden,
      ...SHADOWS.premiumCard,
    },
    menuTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    menuMeta: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType) * 1.4,
    },
    filterSection: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.md, screenType),
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
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
    listContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
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
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    sectionHeaderSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginTop: 2,
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
    },
    menuItemCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
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
    },
    itemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.4,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    itemMeta: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    statusBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
    },
    statusBadgeAvailable: {
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: COLORS.success,
    },
    statusBadgeUnavailable: {
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: COLORS.error,
    },
    statusText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      marginLeft: 4,
    },
    statusTextAvailable: {
      color: COLORS.success,
    },
    statusTextUnavailable: {
      color: COLORS.error,
    },
    itemActions: {
      flexDirection: 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },
    dietaryTags: {
      flexDirection: 'row' as const,
      gap: 8,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      flexWrap: 'wrap' as const,
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
    allergenTag: {
      backgroundColor: '#FEF2F2',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: '#FCA5A5',
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    allergenTagText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: '#DC2626',
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING['2xl'], screenType),
    },
    emptyStateIcon: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    emptyStateTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    emptyStateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    statsContainer: {
      flexDirection: 'row' as const,
      justifyContent: 'space-around' as const,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.golden,
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
    },
    statItem: {
      alignItems: 'center' as const,
      flex: 1,
    },
    statValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
      color: COLORS.text.primary,
    },
    statLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginTop: 4,
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
    },
  };

  // Rendu des filtres
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

            {/* Sous-catégories */}
            {subcategories.length > 0 && (
              <View style={dynamicStyles.filterGroup}>
                <Text style={dynamicStyles.filterGroupTitle}>Sous-catégories ({subcategories.length})</Text>
                <View style={dynamicStyles.filterChipsContainer}>
                  {subcategories.map(subcategory => {
                    const parentCategory = categories.find(c => c.id === subcategory.category);
                    return (
                      <TouchableOpacity
                        key={subcategory.id}
                        onPress={() => toggleFilter('subcategories', subcategory.id)}
                        style={[
                          dynamicStyles.filterChip,
                          filters.subcategories.includes(subcategory.id) && dynamicStyles.filterChipActive
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          dynamicStyles.filterChipText,
                          filters.subcategories.includes(subcategory.id) && dynamicStyles.filterChipTextActive
                        ]}>
                          {parentCategory ? `${parentCategory.name} › ` : ''}{subcategory.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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

            {/* Allergènes (exclusion) */}
            {allergens.length > 0 && (
              <View style={dynamicStyles.filterGroup}>
                <Text style={dynamicStyles.filterGroupTitle}>
                  Exclure les allergènes
                </Text>
                <View style={dynamicStyles.filterChipsContainer}>
                  {allergens.map(allergen => (
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

  // Rendu de l'en-tête de section
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

  // Rendu d'un élément de menu
  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const isToggling = togglingItemId === item.id;
    const isDeleting = deletingItemId === item.id;
    const dietaryTags = [];
    
    if (item.is_vegetarian) dietaryTags.push({ label: 'Végétarien', icon: 'leaf-outline' });
    if (item.is_vegan) dietaryTags.push({ label: 'Vegan', icon: 'nutrition-outline' });
    if (item.is_gluten_free) dietaryTags.push({ label: 'Sans gluten', icon: 'fitness-outline' });

    // Récupérer les allergènes de l'item
    const itemAllergens = ALLERGENS.filter(allergen => 
      item.allergens?.includes(allergen.id)
    );

    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => router.push(`/menu/item/edit/${item.id}` as any)}
      >
        <Card variant="default" style={dynamicStyles.menuItemCard}>
          {/* Photo du plat */}
          {item.image_url && (
            <View style={{
              width: '100%',
              height: 180,
              borderRadius: BORDER_RADIUS.lg,
              overflow: 'hidden',
              marginBottom: getResponsiveValue(SPACING.md, screenType),
              backgroundColor: COLORS.variants.secondary[50],
              borderWidth: 2,
              borderColor: COLORS.border.golden,
            }}>
              <Image
                source={{ uri: item.image_url }}
                style={{
                  width: '100%',
                  height: '100%',
                }}
                resizeMode="cover"
              />
              {/* Badge "Nouveau" si créé récemment (moins de 7 jours) */}
              {item.created_at && new Date(item.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 && (
                <View style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  backgroundColor: COLORS.variants.secondary[600],
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: BORDER_RADIUS.full,
                  flexDirection: 'row',
                  alignItems: 'center',
                  ...SHADOWS.md,
                }}>
                  <Ionicons name="sparkles" size={14} color={COLORS.secondary} style={{ marginRight: 4 }} />
                  <Text style={{
                    color: COLORS.text.inverse,
                    fontSize: 12,
                    fontWeight: '700',
                  }}>
                    Nouveau
                  </Text>
                </View>
              )}
              {/* Badge de disponibilité sur l'image */}
              {!item.is_available && (
                <View style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.75)',
                  paddingVertical: 8,
                  alignItems: 'center',
                }}>
                  <Text style={{
                    color: COLORS.text.inverse,
                    fontSize: 13,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                  }}>
                    INDISPONIBLE
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {/* En-tête avec nom et prix */}
          <View style={dynamicStyles.itemHeader}>
            <Text style={dynamicStyles.itemName}>{item.name}</Text>
            <View style={{
              backgroundColor: COLORS.variants.secondary[100],
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: BORDER_RADIUS.lg,
              borderWidth: 1.5,
              borderColor: COLORS.variants.secondary[400],
            }}>
              <Text style={dynamicStyles.itemPrice}>
                {parseFloat(item.price).toFixed(2)}€
              </Text>
            </View>
          </View>

          {/* Description */}
          {item.description && (
            <Text style={dynamicStyles.itemDescription}>
              {item.description}
            </Text>
          )}

          {/* Tags diététiques */}
          {dietaryTags.length > 0 && (
            <View style={dynamicStyles.dietaryTags}>
              {dietaryTags.map((tag, index) => (
                <View key={index} style={dynamicStyles.dietaryTag}>
                  <Ionicons name={tag.icon as any} size={12} color={COLORS.variants.secondary[700]} />
                  <Text style={dynamicStyles.dietaryTagText}>{tag.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Allergènes */}
          {itemAllergens.length > 0 && (
            <View style={dynamicStyles.dietaryTags}>
              {itemAllergens.map(allergen => (
                <View key={allergen.id} style={dynamicStyles.allergenTag}>
                  <Ionicons name="warning" size={12} color="#DC2626" />
                  <Text style={dynamicStyles.allergenTagText}>{allergen.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Statut */}
          <View style={dynamicStyles.itemMeta}>
            <View style={[
              dynamicStyles.statusBadge,
              item.is_available ? dynamicStyles.statusBadgeAvailable : dynamicStyles.statusBadgeUnavailable
            ]}>
              <Ionicons 
                name={item.is_available ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={item.is_available ? COLORS.success : COLORS.error} 
              />
              <Text style={[
                dynamicStyles.statusText,
                item.is_available ? dynamicStyles.statusTextAvailable : dynamicStyles.statusTextUnavailable
              ]}>
                {item.is_available ? 'Disponible' : 'Indisponible'}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={dynamicStyles.itemActions}>
            <TouchableOpacity
              onPress={() => handleToggleItemAvailability(item)}
              disabled={isToggling || isDeleting}
              style={{
                flex: 1,
                backgroundColor: item.is_available ? COLORS.warning : COLORS.success,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: BORDER_RADIUS.lg,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: (isToggling || isDeleting) ? 0.5 : 1,
                ...SHADOWS.button,
              }}
            >
              {isToggling ? (
                <ActivityIndicator size="small" color={COLORS.text.inverse} />
              ) : (
                <>
                  <Ionicons 
                    name={item.is_available ? "eye-off-outline" : "eye-outline"} 
                    size={18} 
                    color={COLORS.text.inverse}
                    style={{ marginRight: 6 }} 
                  />
                  <Text style={{
                    color: COLORS.text.inverse,
                    fontSize: 14,
                    fontWeight: '600'
                  }}>
                    {item.is_available ? 'Masquer' : 'Afficher'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          
            <TouchableOpacity
              onPress={() => router.push(`/menu/item/edit/${item.id}` as any)}
              disabled={isToggling || isDeleting}
              style={{
                flex: 1,
                backgroundColor: COLORS.primary,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: BORDER_RADIUS.lg,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: (isToggling || isDeleting) ? 0.5 : 1,
                ...SHADOWS.button,
              }}
            >
              <Ionicons name="create-outline" size={18} color={COLORS.text.inverse} style={{ marginRight: 6 }} />
              <Text style={{
                color: COLORS.text.inverse,
                fontSize: 14,
                fontWeight: '600'
              }}>
                Modifier
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDeleteItem(item)}
              disabled={isToggling || isDeleting}
              style={[
                {
                  backgroundColor: COLORS.error,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: BORDER_RADIUS.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 48,
                  ...SHADOWS.button,
                },
                (isToggling || isDeleting) && { opacity: 0.5 }
              ]}
              activeOpacity={0.7}
            >
              {isDeleting ? (
                <ActivityIndicator 
                  size="small" 
                  color={COLORS.text.inverse} 
                />
              ) : (
                <Ionicons 
                  name="trash-outline" 
                  size={18} 
                  color={COLORS.text.inverse} 
                />
              )}
            </TouchableOpacity>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  // Composant d'état vide
  const renderEmptyState = () => {
    const sectionedData = getSectionedData();
    const isFiltered = hasActiveFilters();

    if (isFiltered && sectionedData.length === 0) {
      return (
        <View style={dynamicStyles.emptyState}>
          <View style={dynamicStyles.emptyStateIcon}>
            <Ionicons 
              name="funnel-outline" 
              size={64} 
              color={COLORS.text.light} 
            />
          </View>
          <Text style={dynamicStyles.emptyStateTitle}>
            Aucun résultat
          </Text>
          <Text style={dynamicStyles.emptyStateText}>
            Aucun plat ne correspond aux filtres sélectionnés.{'\n'}
            Essayez de modifier vos critères de recherche.
          </Text>
          <Button
            title="Réinitialiser les filtres"
            onPress={clearAllFilters}
            variant="outline"
            leftIcon={<Ionicons name="close-circle-outline" size={20} color={COLORS.primary} />}
          />
        </View>
      );
    }

    return (
      <View style={dynamicStyles.emptyState}>
        <View style={dynamicStyles.emptyStateIcon}>
          <Ionicons 
            name="restaurant-outline" 
            size={64} 
            color={COLORS.text.light} 
          />
        </View>
        <Text style={dynamicStyles.emptyStateTitle}>
          Aucun plat dans ce menu
        </Text>
        <Text style={dynamicStyles.emptyStateText}>
          Ajoutez votre premier plat pour commencer à recevoir des commandes
        </Text>
        <Button
          title="Ajouter un plat"
          onPress={() => router.push(`/menu/item/add?menuId=${menu?.id}&restaurantId=${menu?.restaurant}`)}
          variant="primary"
          leftIcon={<Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />}
        />
      </View>
    );
  };

  if (isLoading) {
    return <Loading fullScreen text="Chargement du menu..." />;
  }

  if (!menu) {
    return (
      <View style={dynamicStyles.container}>
        <Header 
          title="Menu"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
          includeSafeArea={true}
        />
        <View style={dynamicStyles.emptyState}>
          <Ionicons 
            name="restaurant-outline" 
            size={64} 
            color={COLORS.text.light} 
            style={dynamicStyles.emptyStateIcon}
          />
          <Text style={dynamicStyles.emptyStateTitle}>Menu non trouvé</Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="outline"
            leftIcon={<Ionicons name="arrow-back" size={20} color={COLORS.primary} />}
          />
        </View>
      </View>
    );
  }

  const sectionedData = getSectionedData();
  const totalItems = menu.items.length;

  return (
    <View style={dynamicStyles.container}>
      <Header 
        title={menu.name}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="create-outline"
        onRightPress={() => router.push(`/menu/edit/${menu.id}` as any)}
        includeSafeArea={true}
      />
      
      {/* Affichage des alertes */}
      {alertState && (
        <View style={{
          position: 'absolute',
          top: insets.top + 60,
          left: getResponsiveValue(SPACING.md, screenType),
          right: getResponsiveValue(SPACING.md, screenType),
          zIndex: 1000,
        }}>
          <Alert
            variant={alertState.variant}
            title={alertState.title}
            message={alertState.message}
            onDismiss={hideAlert}
            autoDismiss={alertState.autoDismiss}
            autoDismissDuration={alertState.autoDismissDuration}
          />
        </View>
      )}
      
      {/* Modal de confirmation de suppression */}
      {itemToDelete && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setItemToDelete(null)}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: getResponsiveValue(SPACING.lg, screenType),
          }}>
            <View style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: COLORS.surface,
              borderRadius: BORDER_RADIUS.xl,
              padding: getResponsiveValue(SPACING.lg, screenType),
              ...SHADOWS.xl,
            }}>
              <AlertWithAction
                variant="warning"
                title="Supprimer le plat"
                message={`Êtes-vous sûr de vouloir supprimer "${itemToDelete.name}" ?\n\nCette action est irréversible.`}
                showIcon={true}
                primaryButton={{
                  text: 'Supprimer',
                  onPress: confirmDeleteItem,
                  variant: 'danger'
                }}
                secondaryButton={{
                  text: 'Annuler',
                  onPress: () => setItemToDelete(null)
                }}
              />
            </View>
          </View>
        </Modal>
      )}
      
      <SectionList
        sections={sectionedData}
        renderItem={renderMenuItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          { paddingBottom: Math.max(getResponsiveValue(SPACING.lg, screenType), insets.bottom) }
        ]}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* En-tête du menu */}
            <View style={dynamicStyles.headerCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: getResponsiveValue(SPACING.xs, screenType) }}>
                <Ionicons name="restaurant" size={28} color={COLORS.variants.secondary[600]} style={{ marginRight: 8 }} />
                <Text style={dynamicStyles.menuTitle}>{menu.name}</Text>
              </View>
              <Text style={dynamicStyles.menuMeta}>
                Créé le {new Date(menu.created_at).toLocaleDateString('fr-FR', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </Text>
              
              {/* Statistiques */}
              <View style={dynamicStyles.statsContainer}>
                <View style={dynamicStyles.statItem}>
                  <Ionicons name="albums-outline" size={24} color={COLORS.primary} style={{ marginBottom: 4 }} />
                  <Text style={dynamicStyles.statValue}>{totalItems}</Text>
                  <Text style={dynamicStyles.statLabel}>Total</Text>
                </View>
                <View style={[dynamicStyles.statItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.border.golden }]}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.success} style={{ marginBottom: 4 }} />
                  <Text style={[dynamicStyles.statValue, { color: COLORS.success }]}>
                    {menu.items.filter(item => item.is_available).length}
                  </Text>
                  <Text style={dynamicStyles.statLabel}>Disponibles</Text>
                </View>
                <View style={dynamicStyles.statItem}>
                  <Ionicons name="close-circle" size={24} color={COLORS.error} style={{ marginBottom: 4 }} />
                  <Text style={[dynamicStyles.statValue, { color: COLORS.error }]}>
                    {totalItems - menu.items.filter(item => item.is_available).length}
                  </Text>
                  <Text style={dynamicStyles.statLabel}>Masqués</Text>
                </View>
              </View>
              
              <Button
                title="Ajouter un plat"
                onPress={() => router.push(`/menu/item/add?menuId=${menu.id}&restaurantId=${menu.restaurant}`)}
                variant="primary"
                fullWidth
                leftIcon={<Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />}
                style={{ marginTop: getResponsiveValue(SPACING.sm, screenType) }}
              />
            </View>

            {/* Section des filtres */}
            {renderFilters()}
          </>
        }
        ListEmptyComponent={renderEmptyState}
      />
    </View>
  );
}