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
import { LinearGradient } from 'expo-linear-gradient';
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
  ANIMATIONS,
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';

interface Props {
  restaurantId: string;
  selectedDate?: Date;
  onNavigateToCreate: () => void;
  onNavigateToEdit: (menuId: string) => void;
  onMenuUpdated?: () => void;
}

/**
 * IMPORTANT — Correctifs inclus:
 * 1) Keys vraiment uniques par item (namespacing par catégorie) pour éviter
 *    "The specified child already has a parent" (Fabric) côté Android.
 * 2) Chargement du menu par date sélectionnée au lieu de getTodayMenu.
 */
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

  // Hooks responsive
  const screenType = useScreenType();
  const responsive = useResponsive();
  const styles = createStyles(screenType, responsive);

  useEffect(() => {
    loadDailyMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, selectedDate?.toISOString?.()]);

  const loadDailyMenu = async () => {
    try {
      setIsLoading(true);
      const dateString = format(selectedDate, 'yyyy-MM-dd');

      // ✅ Correctif: charger par date sélectionnée
      const menu = await dailyMenuService.getMenuByDate(Number(restaurantId), dateString);

      setDailyMenu(menu);

      // Étendre toutes les catégories par défaut sur desktop
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
            <Ionicons name="information-circle" size={12} color={COLORS.text.golden} />{' '}
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
          <LinearGradient colors={[COLORS.goldenSurface, COLORS.surface]} style={styles.categoryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <View style={styles.categoryTitleContainer}>
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text style={styles.categoryTitle}>{category.name.toUpperCase()}</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryCount}>{availableCount}/{itemCount}</Text>
              </View>
            </View>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.text.golden} />
          </LinearGradient>
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
    const isFutureDate = selectedDate > new Date();

    return (
      <View style={styles.noMenuContainer}>
        <LinearGradient colors={COLORS.gradients.subtleGold} style={styles.emptyStateGradient}>
          <Ionicons name="restaurant" size={64} color={COLORS.variants.secondary[400]} />
          <Text style={styles.noMenuTitle}>{isFutureDate ? 'Menu non configuré' : 'Aucun menu du jour'}</Text>
          <Text style={styles.noMenuSubtitle}>
            {isDateToday
              ? 'Créez votre menu du jour pour attirer plus de clients'
              : isFutureDate
              ? `Planifiez le menu pour le ${format(selectedDate, 'dd MMMM', { locale: fr })}`
              : `Aucun menu n\'était disponible le ${format(selectedDate, 'dd MMMM', { locale: fr })}`}
          </Text>
          <TouchableOpacity style={styles.createButton} onPress={onNavigateToCreate}>
            <LinearGradient colors={COLORS.gradients.goldenHorizontal} style={styles.createButtonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="add-circle" size={24} color={COLORS.surface} />
              <Text style={styles.createButtonText}>{isFutureDate ? 'Planifier ce menu' : 'Créer un menu du jour'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.variants.secondary[500]} />
        <Text style={styles.loadingText}>Chargement du menu du jour...</Text>
      </View>
    );
  }

  const content = (
    <>
      <View style={styles.header}>
        <LinearGradient colors={[COLORS.surface, COLORS.goldenSurface]} style={styles.headerGradient}>
          <View style={styles.headerContent}>
            <Text style={styles.title}>✨ Menu du Jour</Text>
            <Text style={styles.dateText}>{format(selectedDate, 'EEEE dd MMMM yyyy', { locale: fr })}</Text>
          </View>
          {dailyMenu?.special_price && (
            <View style={styles.specialPriceBadge}>
              <Text style={styles.specialMenuPrice}>Menu Complet : {dailyMenu.special_price}€</Text>
            </View>
          )}
        </LinearGradient>
      </View>

      {/* Actions rapides */}
      <View style={styles.quickActions}>
        <ScrollView horizontal={responsive.isMobile} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionsContainer}>
          <TouchableOpacity style={[styles.actionButton, styles.primaryAction]} onPress={onNavigateToCreate}>
            <LinearGradient colors={COLORS.gradients.subtleGold} style={styles.actionGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="add-circle" size={24} color={COLORS.primary} />
              <Text style={styles.actionButtonText}>Nouveau Menu</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={duplicateYesterday}>
            <Ionicons name="copy-outline" size={20} color={COLORS.variants.secondary[600]} />
            <Text style={styles.actionButtonText}>Dupliquer Hier</Text>
          </TouchableOpacity>

          {dailyMenu && (
            <TouchableOpacity style={styles.actionButton} onPress={() => onNavigateToEdit(dailyMenu.id)}>
              <Ionicons name="create-outline" size={20} color={COLORS.variants.secondary[600]} />
              <Text style={styles.actionButtonText}>Modifier</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {!dailyMenu ? (
        renderEmptyState()
      ) : (
        <View style={styles.menuContent}>
          {!!dailyMenu.description && (
            <View style={styles.descriptionCard}>
              <Text style={styles.menuDescription}>{dailyMenu.description}</Text>
            </View>
          )}

          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Ionicons name="restaurant" size={20} color={COLORS.text.golden} />
              <Text style={styles.statsText}>{dailyMenu.total_items_count} plats</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="pricetag" size={20} color={COLORS.text.golden} />
              <Text style={styles.statsText}>~{dailyMenu.estimated_total_price}€</Text>
            </View>
          </View>

          <View style={responsive.isDesktop ? styles.categoriesGrid : undefined}>
            {dailyMenu.items_by_category.map((cat: any, index: number) => renderCategorySection(cat, index))}
          </View>
        </View>
      )}
    </>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[COLORS.variants.secondary[500]]} tintColor={COLORS.variants.secondary[500]} />}
      showsVerticalScrollIndicator={!responsive.isMobile}
    >
      {responsive.isDesktop ? <View style={styles.desktopContainer}>{content}</View> : content}
    </ScrollView>
  );
};

const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', responsive: any) => {
  const responsiveStyles = createResponsiveStyles(screenType);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    desktopContainer: {
      maxWidth: 1200,
      alignSelf: 'center',
      width: '100%',
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
    },
    loadingText: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },
    header: {
      backgroundColor: COLORS.surface,
      ...SHADOWS.md,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    headerGradient: {
      padding: getResponsiveValue(SPACING.lg, screenType),
    },
    headerContent: {
      flexDirection: responsive.isMobile ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: responsive.isMobile ? 'center' : 'flex-start',
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    dateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      textTransform: 'capitalize',
    },
    specialPriceBadge: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.variants.secondary[100],
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 2,
      borderColor: COLORS.variants.secondary[300],
      ...SHADOWS.goldenGlow,
    },
    specialMenuPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.variants.secondary[700],
      textAlign: 'center',
    },
    quickActions: {
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
      borderColor: COLORS.border.light,
    },
    primaryAction: {
      borderColor: COLORS.variants.secondary[300],
    },
    actionGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.md,
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
      color: COLORS.text.golden,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    categoriesGrid: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    categorySection: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      ...SHADOWS.sm,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    categoryHeader: {
      overflow: 'hidden',
    },
    categoryGradient: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
    },
    categoryTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
      flex: 1,
    },
    categoryIcon: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
    },
    categoryTitle: {
      color: COLORS.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      letterSpacing: 0.5,
    },
    categoryBadge: {
      backgroundColor: COLORS.variants.secondary[100],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue({ mobile: 4, tablet: 6, desktop: 8 }, screenType),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.variants.secondary[200],
    },
    categoryCount: {
      color: COLORS.variants.secondary[700],
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    categoryItems: {
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    // Item row
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
      color: COLORS.text.golden,
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
    // Empty state
    noMenuContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    emptyStateGradient: {
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
    },
    createButtonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
    },
    createButtonText: {
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
  });
};

export default DailyMenuManager;