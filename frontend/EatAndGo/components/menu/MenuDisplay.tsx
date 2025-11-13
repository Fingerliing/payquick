import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MenuItem } from '@/types/menu';
import { MenuItemsGrid, MenuItemsMasonry, MenuItemsTable } from './MenuItemGrid';
import { COLORS, BORDER_RADIUS, SHADOWS } from '@/utils/designSystem';

const { width: screenWidth } = Dimensions.get('window');

// Types pour les différents modes d'affichage
type ViewMode = 'compact' | 'grid' | 'masonry' | 'table';

interface MenuDisplayProps {
  items: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
  restaurantName?: string;
  menuTitle?: string;
}

export const OptimizedMenuDisplay: React.FC<MenuDisplayProps> = ({
  items,
  onAddToCart,
  restaurantName = 'Restaurant',
  menuTitle = 'Menu du jour'
}) => {
  const [viewMode, setViewMode] = React.useState<ViewMode>('compact');
  const [showImages, setShowImages] = React.useState(true);
  const [groupByCategory, setGroupByCategory] = React.useState(true);
  
  // Filtrer les items avec/sans images selon le toggle
  const displayItems = React.useMemo(() => {
    if (showImages) return items;
    // Pour le mode sans images, on utilise toujours le mode compact
    return items;
  }, [items, showImages]);
  
  // Stats rapides
  const stats = React.useMemo(() => {
    const available = items.filter(item => item.is_available);
    const withImages = items.filter(item => item.image_url);
    const categories = [...new Set(items.map(item => item.category_name))];
    
    return {
      total: items.length,
      available: available.length,
      withImages: withImages.length,
      categories: categories.length
    };
  }, [items]);
  
  // Composant de bouton pour les modes d'affichage
  const ViewModeButton: React.FC<{
    mode: ViewMode;
    icon: string;
    label: string;
    isActive: boolean;
  }> = ({ mode, icon, label, isActive }) => (
    <TouchableOpacity
      style={[styles.viewModeButton, isActive && styles.viewModeButtonActive]}
      onPress={() => setViewMode(mode)}
    >
      <Ionicons 
        name={icon as any} 
        size={20} 
        color={isActive ? COLORS.primary : COLORS.text.secondary} 
      />
      <Text style={[styles.viewModeLabel, isActive && styles.viewModeLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
  
  return (
    <View style={styles.container}>
      {/* Header avec titre et stats */}
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <Text style={styles.restaurantName}>{restaurantName}</Text>
          <Text style={styles.menuTitle}>{menuTitle}</Text>
        </View>
        
        {/* Stats rapides */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Ionicons name="restaurant" size={16} color={COLORS.primary} />
            <Text style={styles.statText}>{stats.total} plats</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
            <Text style={styles.statText}>{stats.available} dispo</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="camera" size={16} color={COLORS.secondary} />
            <Text style={styles.statText}>{stats.withImages} photos</Text>
          </View>
        </View>
      </View>
      
      {/* Contrôles d'affichage */}
      <View style={styles.controls}>
        {/* Sélecteur de vue */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.viewModeSelector}
        >
          <ViewModeButton 
            mode="compact" 
            icon="list" 
            label="Liste" 
            isActive={viewMode === 'compact'} 
          />
          <ViewModeButton 
            mode="grid" 
            icon="grid" 
            label="Grille" 
            isActive={viewMode === 'grid'} 
          />
          {screenWidth >= 768 && (
            <>
              <ViewModeButton 
                mode="masonry" 
                icon="apps" 
                label="Mosaïque" 
                isActive={viewMode === 'masonry'} 
              />
              <ViewModeButton 
                mode="table" 
                icon="reorder-four" 
                label="Tableau" 
                isActive={viewMode === 'table'} 
              />
            </>
          )}
        </ScrollView>
        
        {/* Toggles d'options */}
        <View style={styles.toggles}>
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>Grouper</Text>
            <Switch
              value={groupByCategory}
              onValueChange={setGroupByCategory}
              trackColor={{ false: COLORS.border.default, true: COLORS.primary }}
              thumbColor={Platform.OS === 'ios' ? undefined : 'white'}
            />
          </View>
        </View>
      </View>
      
      {/* Zone d'affichage principale */}
      <View style={styles.content}>
        {viewMode === 'compact' && (
          <MenuItemsGrid
            items={displayItems}
            onAddToCart={onAddToCart}
            layout="list"
            showCategoryHeaders={groupByCategory}
          />
        )}
        
        {viewMode === 'grid' && (
          <MenuItemsGrid
            items={displayItems}
            onAddToCart={onAddToCart}
            layout="grid"
            showCategoryHeaders={groupByCategory}
          />
        )}
        
        {viewMode === 'masonry' && screenWidth >= 768 && (
          <MenuItemsMasonry
            items={displayItems}
            onAddToCart={onAddToCart}
          />
        )}
        
        {viewMode === 'table' && screenWidth >= 768 && (
          <MenuItemsTable
            items={displayItems}
            onAddToCart={onAddToCart}
          />
        )}
      </View>
      
      {/* Barre d'info flottante pour mobile */}
      {screenWidth < 768 && (
        <View style={styles.floatingInfo}>
          <Text style={styles.floatingText}>
            {stats.available} plats disponibles
          </Text>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="filter" size={18} color={COLORS.primary} />
            <Text style={styles.filterButtonText}>Filtres</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// Composant alternatif : Affichage par catégories avec accordéon
export const CategoryAccordionDisplay: React.FC<MenuDisplayProps> = ({
  items,
  onAddToCart
}) => {
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  
  // Grouper par catégorie
  const categories = React.useMemo(() => {
    const groups: { [key: string]: MenuItem[] } = {};
    items.forEach(item => {
      const category = item.category_name || 'Autres';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });
    return groups;
  }, [items]);
  
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };
  
  const expandAll = () => {
    setExpandedCategories(new Set(Object.keys(categories)));
  };
  
  const collapseAll = () => {
    setExpandedCategories(new Set());
  };
  
  return (
    <View style={styles.accordionContainer}>
      {/* Contrôles globaux */}
      <View style={styles.accordionControls}>
        <TouchableOpacity onPress={expandAll} style={styles.controlButton}>
          <Ionicons name="expand" size={16} color={COLORS.primary} />
          <Text style={styles.controlButtonText}>Tout ouvrir</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={collapseAll} style={styles.controlButton}>
          <Ionicons name="contract" size={16} color={COLORS.primary} />
          <Text style={styles.controlButtonText}>Tout fermer</Text>
        </TouchableOpacity>
      </View>
      
      {/* Catégories accordéon */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {Object.entries(categories).map(([category, categoryItems]) => {
          const isExpanded = expandedCategories.has(category);
          const availableCount = categoryItems.filter(item => item.is_available).length;
          
          return (
            <View key={category} style={styles.accordionSection}>
              <TouchableOpacity 
                style={styles.accordionHeader}
                onPress={() => toggleCategory(category)}
              >
                <View style={styles.accordionHeaderLeft}>
                  <Ionicons 
                    name={isExpanded ? "chevron-down" : "chevron-forward"} 
                    size={20} 
                    color={COLORS.primary} 
                  />
                  <Text style={styles.accordionTitle}>{category}</Text>
                </View>
                <View style={styles.accordionHeaderRight}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {availableCount}/{categoryItems.length}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              
              {isExpanded && (
                <View style={styles.accordionContent}>
                  <MenuItemsGrid
                    items={categoryItems}
                    onAddToCart={onAddToCart}
                    showCategoryHeaders={false}
                    layout="list"
                  />
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  
  header: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    ...SHADOWS.sm,
  },
  
  titleSection: {
    marginBottom: 12,
  },
  
  restaurantName: {
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 4,
  },
  
  menuTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  
  statText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  
  statDivider: {
    width: 1,
    height: 16,
    backgroundColor: COLORS.border.light,
    marginHorizontal: 12,
  },
  
  controls: {
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  
  viewModeSelector: {
    flexDirection: 'row',
    maxHeight: 36,
  },
  
  viewModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.background,
    gap: 6,
  },
  
  viewModeButtonActive: {
    backgroundColor: COLORS.variants.primary[100],
  },
  
  viewModeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  
  viewModeLabelActive: {
    color: COLORS.primary,
  },
  
  toggles: {
    flexDirection: 'row',
    gap: 16,
  },
  
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  
  toggleLabel: {
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  
  content: {
    flex: 1,
    paddingTop: 12,
  },
  
  floatingInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  
  floatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.lg,
    gap: 6,
  },
  
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  
  // Accordion styles
  accordionContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  
  accordionControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    gap: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
  },
  
  controlButtonText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '500',
  },
  
  accordionSection: {
    marginBottom: 4,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: 8,
    marginTop: 8,
    ...SHADOWS.sm,
  },
  
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  
  accordionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  
  accordionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  badge: {
    backgroundColor: COLORS.variants.primary[100],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  
  accordionContent: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
});

export default OptimizedMenuDisplay;