import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { MenuItem } from '@/types/menu';
import {
  MenuItemsGrid,
  MenuItemsMasonry,
  MenuItemsTable,
} from './MenuItemGrid';
import {
  useAppTheme,
  makeShadows,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

const { width: screenWidth } = Dimensions.get('window');

type ViewMode = 'compact' | 'grid' | 'masonry' | 'table';

interface MenuDisplayProps {
  items: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
  restaurantName?: string;
  menuTitle?: string;
}

// ============================================================================
// OptimizedMenuDisplay
// ============================================================================

export const OptimizedMenuDisplay: React.FC<MenuDisplayProps> = ({
  items,
  onAddToCart,
  restaurantName,
  menuTitle,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [viewMode, setViewMode] = React.useState<ViewMode>('compact');
  const [groupByCategory, setGroupByCategory] = React.useState(true);

  // Fallbacks i18n pour les props optionnelles
  const effectiveMenuTitle = menuTitle ?? t('menu.dailyMenu');
  const effectiveRestaurantName = restaurantName ?? t('menuGrid.defaultRestaurantName');

  const displayItems = items;

  // Stats rapides
  const stats = useMemo(() => {
    const available = items.filter((item) => item.is_available);
    const withImages = items.filter((item) => item.image_url);
    const categories = [...new Set(items.map((item) => item.category_name))];
    return {
      total: items.length,
      available: available.length,
      withImages: withImages.length,
      categories: categories.length,
    };
  }, [items]);

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
        color={isActive ? colors.primary : colors.text.secondary}
      />
      <Text
        style={[styles.viewModeLabel, isActive && styles.viewModeLabelActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <Text style={styles.restaurantName}>{effectiveRestaurantName}</Text>
          <Text style={styles.menuTitle}>{effectiveMenuTitle}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Ionicons name="restaurant" size={16} color={colors.primary} />
            <Text style={styles.statText}>
              {t('dailyMenuDisplay.dishesCount', { count: stats.total })}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={colors.success}
            />
            <Text style={styles.statText}>
              {t('menuGrid.stats.availableShort', { count: stats.available })}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="camera" size={16} color={colors.secondary} />
            <Text style={styles.statText}>
              {t('menuGrid.stats.photos', { count: stats.withImages })}
            </Text>
          </View>
        </View>
      </View>

      {/* Contrôles */}
      <View style={styles.controls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.viewModeSelector}
        >
          <ViewModeButton
            mode="compact"
            icon="list"
            label={t('menuGrid.viewModes.list')}
            isActive={viewMode === 'compact'}
          />
          <ViewModeButton
            mode="grid"
            icon="grid"
            label={t('menuGrid.viewModes.grid')}
            isActive={viewMode === 'grid'}
          />
          {screenWidth >= 768 && (
            <>
              <ViewModeButton
                mode="masonry"
                icon="apps"
                label={t('menuGrid.viewModes.masonry')}
                isActive={viewMode === 'masonry'}
              />
              <ViewModeButton
                mode="table"
                icon="reorder-four"
                label={t('menuGrid.viewModes.table')}
                isActive={viewMode === 'table'}
              />
            </>
          )}
        </ScrollView>

        <View style={styles.toggles}>
          <View style={styles.toggleItem}>
            <Text style={styles.toggleLabel}>
              {t('menuGrid.groupToggle')}
            </Text>
            <Switch
              value={groupByCategory}
              onValueChange={setGroupByCategory}
              trackColor={{
                false: colors.border.default,
                true: colors.primary,
              }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
            />
          </View>
        </View>
      </View>

      {/* Zone d'affichage */}
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
          <MenuItemsTable items={displayItems} onAddToCart={onAddToCart} />
        )}
      </View>

      {/* Barre flottante mobile */}
      {screenWidth < 768 && (
        <View style={styles.floatingInfo}>
          <Text style={styles.floatingText}>
            {t('menuGrid.stats.availableLong', { count: stats.available })}
          </Text>
          <TouchableOpacity style={styles.filterButton}>
            <Ionicons name="filter" size={18} color={colors.primary} />
            <Text style={styles.filterButtonText}>
              {t('menuGrid.filters')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ============================================================================
// CategoryAccordionDisplay
// ============================================================================

export const CategoryAccordionDisplay: React.FC<MenuDisplayProps> = ({
  items,
  onAddToCart,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [expandedCategories, setExpandedCategories] = React.useState<
    Set<string>
  >(new Set());

  const categories = useMemo(() => {
    const groups: { [key: string]: MenuItem[] } = {};
    items.forEach((item) => {
      const category = item.category_name || t('menuGrid.otherCategory');
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });
    return groups;
  }, [items, t]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
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
          <Ionicons name="expand" size={16} color={colors.primary} />
          <Text style={styles.controlButtonText}>
            {t('menuGrid.accordion.expandAll')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={collapseAll} style={styles.controlButton}>
          <Ionicons name="contract" size={16} color={colors.primary} />
          <Text style={styles.controlButtonText}>
            {t('menuGrid.accordion.collapseAll')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Catégories accordéon */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {Object.entries(categories).map(([category, categoryItems]) => {
          const isExpanded = expandedCategories.has(category);
          const availableCount = categoryItems.filter(
            (item) => item.is_available,
          ).length;

          return (
            <View key={category} style={styles.accordionSection}>
              <TouchableOpacity
                style={styles.accordionHeader}
                onPress={() => toggleCategory(category)}
              >
                <View style={styles.accordionHeaderLeft}>
                  <Ionicons
                    name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={20}
                    color={colors.primary}
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

// ──────────────────────────────────────────────────────────────────────────
// STYLES (factory theme-aware)
// ──────────────────────────────────────────────────────────────────────────

const makeStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // Header
    header: {
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
      ...shadows.sm,
    },
    titleSection: { marginBottom: 12 },
    restaurantName: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    menuTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
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
      color: colors.text.secondary,
      fontWeight: '500',
    },
    statDivider: {
      width: 1,
      height: 16,
      backgroundColor: colors.border.light,
      marginHorizontal: 12,
    },

    // Contrôles
    controls: {
      backgroundColor: colors.surface,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
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
      backgroundColor: colors.background,
      gap: 6,
    },
    viewModeButtonActive: {
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.28)'
        : colors.variants.primary[100],
    },
    viewModeLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    viewModeLabelActive: {
      color: colors.primary,
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
      color: colors.text.secondary,
    },
    content: {
      flex: 1,
      paddingTop: 12,
    },

    // Barre flottante mobile
    floatingInfo: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      right: 20,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.lg,
    },
    floatingText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      gap: 6,
    },
    filterButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },

    // Accordéon
    accordionContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    accordionControls: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      padding: 12,
      gap: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    controlButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background,
    },
    controlButtonText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '500',
    },
    accordionSection: {
      marginBottom: 4,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      marginHorizontal: 8,
      marginTop: 8,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.sm,
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
      color: colors.text.primary,
    },
    accordionHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    badge: {
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.28)'
        : colors.variants.primary[100],
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    accordionContent: {
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
  });
};

export default OptimizedMenuDisplay;