import React from 'react';
import {
  View,
  ScrollView,
  FlatList,
  Dimensions,
  Text,
  StyleSheet,
  TouchableOpacity
} from 'react-native';
import { MenuItem } from '@/types/menu';
import { MenuItemCard } from './MenuItemCard';
import { COLORS, BORDER_RADIUS } from '@/utils/designSystem';

const { width: screenWidth } = Dimensions.get('window');

interface MenuItemsGridProps {
  items: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
  categoryName?: string;
  layout?: 'grid' | 'list' | 'auto';
  showCategoryHeaders?: boolean;
}

export const MenuItemsGrid: React.FC<MenuItemsGridProps> = ({
  items,
  onAddToCart,
  categoryName,
  layout = 'auto',
  showCategoryHeaders = true
}) => {
  const [allergenStates, setAllergenStates] = React.useState<{ [key: string]: boolean }>({});
  
  // Calcul dynamique du nombre de colonnes
  const getNumColumns = () => {
    if (layout === 'list') return 1;
    if (layout === 'grid') {
      if (screenWidth >= 1200) return 4;
      if (screenWidth >= 900) return 3;
      if (screenWidth >= 600) return 2;
      return 1;
    }
    // Auto layout
    if (screenWidth >= 1200) return 3;
    if (screenWidth >= 768) return 2;
    return 1;
  };
  
  const numColumns = getNumColumns();
  const isCompact = numColumns > 1 || layout === 'list';
  
  const toggleAllergens = (itemId: string) => {
    setAllergenStates(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };
  
  const renderItem = ({ item }: { item: MenuItem }) => {
    const itemId = item.id.toString();
    return (
      <View style={[
        styles.itemContainer,
        numColumns > 1 && styles.gridItem,
        { width: numColumns > 1 ? `${100 / numColumns}%` : '100%' }
      ]}>
        <MenuItemCard
          item={item}
          onAddToCart={onAddToCart}
          compact={isCompact}
          showAllergens={allergenStates[itemId] || false}
          onToggleAllergens={() => toggleAllergens(itemId)}
        />
      </View>
    );
  };
  
  // Grouper les items par catégorie si nécessaire
  const groupedItems = React.useMemo(() => {
    if (!showCategoryHeaders) return { [categoryName || 'Tous']: items };
    
    const groups: { [key: string]: MenuItem[] } = {};
    items.forEach(item => {
      const category = item.category_name || 'Autres';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });
    return groups;
  }, [items, categoryName, showCategoryHeaders]);
  
  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <View key={category} style={styles.categorySection}>
            {showCategoryHeaders && (
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryTitle}>{category}</Text>
                <View style={styles.categoryCount}>
                  <Text style={styles.categoryCountText}>
                    {categoryItems.length} plat{categoryItems.length > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            )}
            
            {numColumns === 1 ? (
              // Liste simple pour mobile
              <View>
                {categoryItems.map(item => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onAddToCart={onAddToCart}
                    compact={true}
                    showAllergens={allergenStates[item.id.toString()] || false}
                    onToggleAllergens={() => toggleAllergens(item.id.toString())}
                  />
                ))}
              </View>
            ) : (
              // Grille pour tablettes/desktop
              <FlatList
                data={categoryItems}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                numColumns={numColumns}
                scrollEnabled={false}
                columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

// Composant alternatif : Vue masonry pour affichage Pinterest-like
export const MenuItemsMasonry: React.FC<MenuItemsGridProps> = ({
  items,
  onAddToCart,
  layout = 'auto'
}) => {
  const numColumns = screenWidth >= 1200 ? 4 : screenWidth >= 768 ? 3 : 2;
  const [allergenStates, setAllergenStates] = React.useState<{ [key: string]: boolean }>({});
  
  const toggleAllergens = (itemId: string) => {
    setAllergenStates(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };
  
  // Distribuer les items en colonnes pour effet masonry
  const columns = React.useMemo(() => {
    const cols: MenuItem[][] = Array(numColumns).fill(null).map(() => []);
    items.forEach((item, index) => {
      cols[index % numColumns].push(item);
    });
    return cols;
  }, [items, numColumns]);
  
  return (
    <ScrollView
      horizontal={false}
      showsVerticalScrollIndicator={false}
      style={styles.masonryContainer}
    >
      <View style={styles.masonryRow}>
        {columns.map((column, colIndex) => (
          <View key={colIndex} style={[styles.masonryColumn, { width: `${100 / numColumns}%` }]}>
            {column.map(item => (
              <View key={item.id} style={styles.masonryItem}>
                <MenuItemCard
                  item={item}
                  onAddToCart={onAddToCart}
                  compact={false}
                  showAllergens={allergenStates[item.id.toString()] || false}
                  onToggleAllergens={() => toggleAllergens(item.id.toString())}
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// Composant vue compacte en tableau pour affichage très dense
export const MenuItemsTable: React.FC<MenuItemsGridProps> = ({
  items,
  onAddToCart
}) => {
  return (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderText, { flex: 0.1 }]}>Photo</Text>
        <Text style={[styles.tableHeaderText, { flex: 0.35 }]}>Nom</Text>
        <Text style={[styles.tableHeaderText, { flex: 0.25 }]}>Description</Text>
        <Text style={[styles.tableHeaderText, { flex: 0.15 }]}>Prix</Text>
        <Text style={[styles.tableHeaderText, { flex: 0.15 }]}>Action</Text>
      </View>
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {items.map((item, index) => (
          <TableRow 
            key={item.id}
            item={item}
            onAddToCart={onAddToCart}
            isEven={index % 2 === 0}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const TableRow: React.FC<{
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  isEven: boolean;
}> = ({ item, onAddToCart, isEven }) => {
  return (
    <View style={[styles.tableRow, isEven && styles.tableRowEven]}>
      <View style={{ flex: 0.1 }}>
        {item.image_url && (
          <View style={styles.tableThumbnail} />
        )}
      </View>
      <Text style={[styles.tableCell, { flex: 0.35 }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.tableCell, { flex: 0.25 }]} numberOfLines={2}>
        {item.description || '-'}
      </Text>
      <Text style={[styles.tableCell, { flex: 0.15, fontWeight: '600' }]}>
        {parseFloat(item.price).toFixed(2)}€
      </Text>
      <View style={{ flex: 0.15, alignItems: 'center' }}>
        {item.is_available ? (
          <TouchableOpacity
            style={styles.tableAddButton}
            onPress={() => onAddToCart(item)}
          >
            <Text style={styles.tableAddText}>+</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.tableUnavailable}>-</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  scrollContent: {
    paddingBottom: 20,
  },
  
  categorySection: {
    marginBottom: 24,
  },
  
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    marginBottom: 12,
  },
  
  categoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  
  categoryCount: {
    backgroundColor: COLORS.variants.primary[50],
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  
  categoryCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  
  itemContainer: {
    paddingHorizontal: 8,
  },
  
  gridItem: {
    paddingVertical: 4,
  },
  
  row: {
    justifyContent: 'space-between',
  },
  
  // Masonry styles
  masonryContainer: {
    flex: 1,
  },
  
  masonryRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  
  masonryColumn: {
    paddingHorizontal: 4,
  },
  
  masonryItem: {
    marginBottom: 8,
  },
  
  // Table styles
  tableContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  
  tableHeaderText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  
  tableRowEven: {
    backgroundColor: COLORS.background,
  },
  
  tableThumbnail: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.border.light,
  },
  
  tableCell: {
    fontSize: 13,
    color: COLORS.text.secondary,
    paddingHorizontal: 8,
  },
  
  tableAddButton: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  tableAddText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  
  tableUnavailable: {
    color: COLORS.text.light,
    fontSize: 14,
  },
});

// Export des différents layouts
export const MenuItemsLayouts = {
  Grid: MenuItemsGrid,
  Masonry: MenuItemsMasonry,
  Table: MenuItemsTable,
};

export default MenuItemsGrid;