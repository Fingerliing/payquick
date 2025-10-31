import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dailyMenuService, DailyMenu, DailyMenuItem } from '@/services/dailyMenuService';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';

interface Props {
  restaurantId: string;
  selectedDate?: Date;
  onNavigateToCreate: (selectedDate: Date) => void;
  onNavigateToEdit: (menuId: string) => void;
  onMenuUpdated?: () => void;
}

export const DailyMenuManager: React.FC<Props> = ({
  restaurantId,
  selectedDate = new Date(),
  onNavigateToCreate,
  onNavigateToEdit,
  onMenuUpdated,
}) => {
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTogglingItem, setIsTogglingItem] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const screenType = useScreenType();
  const responsive = useResponsive();
  const styles = createStyles(screenType, responsive);

  useEffect(() => {
    loadDailyMenu();
  }, [restaurantId, selectedDate?.toISOString?.()]);

  const loadDailyMenu = async () => {
    try {
      setIsLoading(true);
      const dateString = format(selectedDate, 'yyyy-MM-dd');
      const menu = await dailyMenuService.getMenuByDate(Number(restaurantId), dateString);
      setDailyMenu(menu);

      if (responsive.isDesktop && menu?.items_by_category) {
        setExpandedCategories(new Set(menu.items_by_category.map((cat: any) => cat.name)));
      }
    } catch (error) {
      setDailyMenu(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDailyMenu();
    setIsRefreshing(false);
  };

  const toggleItemAvailability = async (itemId: string) => {
    if (!dailyMenu || isTogglingItem) return;

    setIsTogglingItem(itemId);
    try {
      await dailyMenuService.quickToggleItem(dailyMenu.id, itemId);
      await loadDailyMenu();
      onMenuUpdated?.();
    } catch (error) {
      Alert.alert('Erreur', "Impossible de modifier la disponibilité du plat");
    } finally {
      setIsTogglingItem(null);
    }
  };

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  const duplicateYesterday = async () => {
    Alert.alert(
      'Dupliquer le menu précédent',
      `Voulez-vous copier le menu du ${format(subDays(selectedDate, 1), 'dd MMMM', { locale: fr })} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Dupliquer',
          onPress: async () => {
            try {
              const previousDate = format(subDays(selectedDate, 1), 'yyyy-MM-dd');
              const currentDate = format(selectedDate, 'yyyy-MM-dd');
              const previousMenu = await dailyMenuService.getMenuByDate(Number(restaurantId), previousDate);

              if (previousMenu) {
                await dailyMenuService.duplicateMenu(previousMenu.id, currentDate);
                Alert.alert('Succès', 'Menu dupliqué avec succès');
                await loadDailyMenu();
                onMenuUpdated?.();
              } else {
                Alert.alert('Information', 'Aucun menu trouvé pour la date précédente');
              }
            } catch (error) {
              Alert.alert('Erreur', "Impossible de dupliquer le menu");
            }
          },
        },
      ],
    );
  };

  const renderMenuItem = ({ item }: { item: DailyMenuItem }) => (
    <View style={styles.itemRow} collapsable={false}>
      <View style={styles.itemLeft}>
        <Switch
          value={item.is_available}
          onValueChange={() => toggleItemAvailability(item.id)}
          disabled={isTogglingItem === item.id}
          trackColor={{ false: COLORS.border.default, true: COLORS.variants.secondary[400] }}
          thumbColor={item.is_available ? COLORS.variants.secondary[500] : COLORS.text.light}
          ios_backgroundColor={COLORS.border.default}
        />
      </View>

      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, !item.is_available && styles.itemDisabled]}>
          {item.menu_item_name}
        </Text>
        {!!item.special_note && (
          <Text style={styles.specialNote}>
            <Ionicons name="information-circle" size={12} color={COLORS.text.secondary} />{' '}
            {item.special_note}
          </Text>
        )}
      </View>

      <View style={styles.priceContainer}>
        {item.has_discount ? (
          <View style={styles.discountContainer}>
            <Text style={styles.originalPrice}>{item.original_price}€</Text>
            <Text style={styles.specialPrice}>{item.effective_price}€</Text>
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{item.discount_percentage}%</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.itemPrice}>{item.effective_price}€</Text>
        )}
      </View>

      {isTogglingItem === item.id && (
        <ActivityIndicator size="small" color={COLORS.variants.secondary[500]} style={styles.loader} />
      )}
    </View>
  );

  const renderCategorySection = (category: any, categoryIndex: number) => {
    const isExpanded = expandedCategories.has(category.name);
    const itemCount = category.items.length;
    const availableCount = category.items.filter((i: DailyMenuItem) => i.is_available).length;

    return (
      <View key={`section::${categoryIndex}::${category.name}`} style={styles.categorySection} collapsable={false}>
        <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCategory(category.name)} activeOpacity={0.7}>
          <View style={styles.categoryTitleContainer}>
            <Text style={styles.categoryTitle}>{category.name}</Text>
            {itemCount > 0 && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{availableCount}/{itemCount}</Text>
              </View>
            )}
          </View>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.text.secondary} />
        </TouchableOpacity>

        {isExpanded && (
          <FlatList
            data={category.items}
            renderItem={renderMenuItem}
            keyExtractor={(item, index) => `${category.name}::${item.id}::${index}`}
            scrollEnabled={false}
            removeClippedSubviews={false}
            contentContainerStyle={styles.categoryItems}
          />
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    const isDateToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

    return (
      <View style={styles.noMenuContainer}>
        <View style={styles.emptyStateContent}>
          <Ionicons name="restaurant-outline" size={48} color={COLORS.text.secondary} />
          <Text style={styles.noMenuTitle}>Aucun menu pour cette date</Text>
          <Text style={styles.noMenuSubtitle}>
            {isDateToday
              ? "Créez le menu du jour pour commencer"
              : `Créez un menu pour le ${format(selectedDate, 'dd MMMM yyyy', { locale: fr })}`}
          </Text>
          <TouchableOpacity style={styles.createButton} onPress={() => onNavigateToCreate(selectedDate)}>
            <View style={styles.createButtonContent}>
              <Ionicons name="add-circle" size={20} color={COLORS.surface} />
              <Text style={styles.createButtonText}>Créer le menu</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.variants.secondary[500]} />
      </View>
    );
  }

  if (!dailyMenu) {
    return (
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
      >
        {renderEmptyState()}
      </ScrollView>
    );
  }

  const totalItems = dailyMenu.items_by_category?.reduce((acc: number, cat: any) => acc + cat.items.length, 0) || 0;
  const availableItems = dailyMenu.items_by_category?.reduce(
    (acc: number, cat: any) => acc + cat.items.filter((i: DailyMenuItem) => i.is_available).length,
    0
  ) || 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={() => onNavigateToEdit(dailyMenu.id)}>
            <Ionicons name="create-outline" size={20} color={COLORS.text.primary} />
            <Text style={styles.actionButtonText}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={duplicateYesterday}>
            <Ionicons name="copy-outline" size={20} color={COLORS.text.primary} />
            <Text style={styles.actionButtonText}>Dupliquer</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.menuContent}>
        {dailyMenu.description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.menuDescription}>{dailyMenu.description}</Text>
          </View>
        )}

        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Ionicons name="restaurant-outline" size={16} color={COLORS.text.secondary} />
            <Text style={styles.statsText}>{totalItems} plats</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
            <Text style={styles.statsText}>{availableItems} disponibles</Text>
          </View>
        </View>

        <View style={styles.categoriesGrid}>
          {dailyMenu.items_by_category?.map((category: any, index: number) =>
            renderCategorySection(category, index)
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', responsive: any) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: COLORS.background,
    },
    header: {
      backgroundColor: COLORS.surface,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      ...SHADOWS.sm,
    },
    actionsContainer: {
      flexDirection: 'row',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border.default,
    },
    actionButtonText: {
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      color: COLORS.text.primary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },
    menuContent: {
      gap: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    descriptionCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderLeftWidth: 3,
      borderLeftColor: COLORS.primary,
    },
    menuDescription: {
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontStyle: 'italic',
    },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    statDivider: {
      width: 1,
      height: 20,
      backgroundColor: COLORS.border.light,
    },
    statsText: {
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    categoriesGrid: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    categorySection: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: COLORS.border.light,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    categoryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.goldenSurface,
    },
    categoryTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    categoryTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    categoryBadge: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.variants.secondary[200],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
    },
    categoryBadgeText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.variants.secondary[700],
    },
    categoryItems: {
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    itemLeft: {
      width: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemInfo: {
      flex: 1,
      paddingRight: getResponsiveValue(SPACING.sm, screenType),
    },
    itemName: {
      color: COLORS.text.primary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },
    itemDisabled: {
      color: COLORS.text.secondary,
      textDecorationLine: 'line-through',
    },
    specialNote: {
      marginTop: 2,
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    priceContainer: {
      minWidth: 90,
      alignItems: 'flex-end',
      paddingRight: getResponsiveValue(SPACING.md, screenType),
    },
    itemPrice: {
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    discountContainer: {
      alignItems: 'flex-end',
    },
    originalPrice: {
      textDecorationLine: 'line-through',
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    specialPrice: {
      color: COLORS.success,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
    discountBadge: {
      backgroundColor: COLORS.warning + '20',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 2,
    },
    discountText: {
      color: COLORS.warning,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    loader: {
      marginRight: getResponsiveValue(SPACING.md, screenType),
    },
    noMenuContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      margin: getResponsiveValue(SPACING.container, screenType),
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    emptyStateContent: {
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    noMenuTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },
    noMenuSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
    },
    createButton: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: COLORS.primary,
      ...SHADOWS.button,
    },
    createButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
    },
    createButtonText: {
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },
  });
};

export default DailyMenuManager;