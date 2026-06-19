import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  FlatList,
  Dimensions,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { MenuItem } from '@/types/menu';
import { MenuItemCard } from './MenuItemCard';
import {
  useAppTheme,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

const { width: screenWidth } = Dimensions.get('window');

interface MenuItemsGridProps {
  items: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
  categoryName?: string;
  layout?: 'grid' | 'list' | 'auto';
  showCategoryHeaders?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Hook helper : formatage devise locale-aware (mémoïsé)
// ──────────────────────────────────────────────────────────────────────────
const useCurrencyFormatter = () => {
  const { i18n } = useTranslation();
  return useMemo(() => {
    let fmt: Intl.NumberFormat | null = null;
    try {
      fmt = new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'EUR',
      });
    } catch {
      fmt = null;
    }
    return (price: string | number) => {
      const num = typeof price === 'string' ? parseFloat(price) : price;
      if (Number.isNaN(num)) return String(price);
      return fmt ? fmt.format(num) : `${num.toFixed(2)} €`;
    };
  }, [i18n.language]);
};

// ============================================================================
// MenuItemsGrid — liste/grille standard
// ============================================================================

export const MenuItemsGrid: React.FC<MenuItemsGridProps> = ({
  items,
  onAddToCart,
  categoryName,
  layout = 'auto',
  showCategoryHeaders = true,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeGridStyles(colors, isDark), [colors, isDark]);

  const [allergenStates, setAllergenStates] = React.useState<{
    [key: string]: boolean;
  }>({});

  const getNumColumns = () => {
    if (layout === 'list') return 1;
    if (layout === 'grid') {
      if (screenWidth >= 1200) return 4;
      if (screenWidth >= 900) return 3;
      if (screenWidth >= 600) return 2;
      return 1;
    }
    if (screenWidth >= 1200) return 3;
    if (screenWidth >= 768) return 2;
    return 1;
  };

  const numColumns = getNumColumns();
  const isCompact = numColumns > 1 || layout === 'list';

  const toggleAllergens = (itemId: string) => {
    setAllergenStates((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const renderItem = ({ item }: { item: MenuItem }) => {
    const itemId = item.id.toString();
    return (
      <View
        style={[
          styles.itemContainer,
          numColumns > 1 && styles.gridItem,
          {
            width:
              numColumns > 1 ? (`${100 / numColumns}%` as `${number}%`) : '100%',
          },
        ]}
      >
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

  // Grouper par catégorie
  const groupedItems = useMemo(() => {
    if (!showCategoryHeaders) {
      return {
        [categoryName || t('menuGrid.otherCategory')]: items,
      };
    }
    const groups: { [key: string]: MenuItem[] } = {};
    items.forEach((item) => {
      const category = item.category_name || t('menuGrid.otherCategory');
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });
    return groups;
  }, [items, categoryName, showCategoryHeaders, t]);

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
                    {t('dailyMenuDisplay.dishesCount', {
                      count: categoryItems.length,
                    })}
                  </Text>
                </View>
              </View>
            )}

            {numColumns === 1 ? (
              <View>
                {categoryItems.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onAddToCart={onAddToCart}
                    compact
                    showAllergens={allergenStates[item.id.toString()] || false}
                    onToggleAllergens={() =>
                      toggleAllergens(item.id.toString())
                    }
                  />
                ))}
              </View>
            ) : (
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

// ============================================================================
// MenuItemsMasonry — affichage Pinterest-like
// ============================================================================

export const MenuItemsMasonry: React.FC<MenuItemsGridProps> = ({
  items,
  onAddToCart,
}) => {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeGridStyles(colors, isDark), [colors, isDark]);

  const numColumns =
    screenWidth >= 1200 ? 4 : screenWidth >= 768 ? 3 : 2;
  const [allergenStates, setAllergenStates] = React.useState<{
    [key: string]: boolean;
  }>({});

  const toggleAllergens = (itemId: string) => {
    setAllergenStates((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const columns = useMemo(() => {
    const cols: MenuItem[][] = Array(numColumns)
      .fill(null)
      .map(() => []);
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
          <View
            key={colIndex}
            style={[
              styles.masonryColumn,
              { width: `${100 / numColumns}%` as `${number}%` },
            ]}
          >
            {column.map((item) => (
              <View key={item.id} style={styles.masonryItem}>
                <MenuItemCard
                  item={item}
                  onAddToCart={onAddToCart}
                  compact={false}
                  showAllergens={allergenStates[item.id.toString()] || false}
                  onToggleAllergens={() =>
                    toggleAllergens(item.id.toString())
                  }
                />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// ============================================================================
// MenuItemsTable — vue tableau dense
// ============================================================================

export const MenuItemsTable: React.FC<MenuItemsGridProps> = ({
  items,
  onAddToCart,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeTableStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={styles.tableContainer}>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderText, { flex: 0.1 }]}>
          {t('menuGrid.table.photo')}
        </Text>
        <Text style={[styles.tableHeaderText, { flex: 0.35 }]}>
          {t('menuGrid.table.name')}
        </Text>
        <Text style={[styles.tableHeaderText, { flex: 0.25 }]}>
          {t('menuGrid.table.description')}
        </Text>
        <Text style={[styles.tableHeaderText, { flex: 0.15 }]}>
          {t('menuGrid.table.price')}
        </Text>
        <Text style={[styles.tableHeaderText, { flex: 0.15 }]}>
          {t('menuGrid.table.action')}
        </Text>
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
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeTableStyles(colors, isDark), [colors, isDark]);
  const formatPrice = useCurrencyFormatter();

  return (
    <View style={[styles.tableRow, isEven && styles.tableRowEven]}>
      <View style={{ flex: 0.1 }}>
        {!!item.image_url && <View style={styles.tableThumbnail} />}
      </View>
      <Text style={[styles.tableCell, { flex: 0.35 }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.tableCell, { flex: 0.25 }]} numberOfLines={2}>
        {item.description || '-'}
      </Text>
      <Text style={[styles.tableCell, { flex: 0.15, fontWeight: '600' }]}>
        {formatPrice(item.price)}
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

// ──────────────────────────────────────────────────────────────────────────
// STYLES (factories theme-aware)
// ──────────────────────────────────────────────────────────────────────────

const makeGridStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingBottom: 20 },
    categorySection: { marginBottom: 24 },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.background,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      marginBottom: 12,
    },
    categoryTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
    },
    categoryCount: {
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.18)'
        : colors.variants.primary[50],
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
    },
    categoryCountText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    itemContainer: { paddingHorizontal: 8 },
    gridItem: { paddingVertical: 4 },
    row: { justifyContent: 'space-between' },

    masonryContainer: { flex: 1 },
    masonryRow: { flexDirection: 'row', paddingHorizontal: 8 },
    masonryColumn: { paddingHorizontal: 4 },
    masonryItem: { marginBottom: 8 },
  });

const makeTableStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    tableContainer: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    tableHeaderText: {
      // Texte blanc stable sur fond primary saturé
      color: '#FFFFFF',
      fontWeight: '600',
      fontSize: 12,
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    tableRowEven: { backgroundColor: colors.background },
    tableThumbnail: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.border.light,
    },
    tableCell: {
      fontSize: 13,
      color: colors.text.secondary,
      paddingHorizontal: 8,
    },
    tableAddButton: {
      width: 28,
      height: 28,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tableAddText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    tableUnavailable: {
      color: colors.text.light,
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