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
  Platform,
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
  COMPONENT_STYLES,
  ANIMATIONS
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';

interface Props {
  restaurantId: string;
  selectedDate?: Date;
  onNavigateToCreate: () => void;
  onNavigateToEdit: (menuId: string) => void;
}

export const DailyMenuManager: React.FC<Props> = ({
  restaurantId,
  selectedDate = new Date(),
  onNavigateToCreate,
  onNavigateToEdit,
}) => {
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTogglingItem, setIsTogglingItem] = useState<string | null>(null);
  // const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Hooks responsive
  const screenType = useScreenType();
  const responsive = useResponsive();
  const styles = createStyles(screenType, responsive);

  useEffect(() => {
    loadDailyMenu();
  }, [restaurantId, selectedDate]);

  const loadDailyMenu = async () => {
    try {
      setIsLoading(true);
      const dateString = format(selectedDate, 'yyyy-MM-dd');
      const menu = await dailyMenuService.getTodayMenu(Number(restaurantId));
      setDailyMenu(menu);
      // Expand all categories by default on desktop
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
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de modifier la disponibilité du plat');
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
              
              // Récupérer le menu de la veille
              const previousMenu = await dailyMenuService.getMenuByDate(
                Number(restaurantId),
                previousDate
              );
              
              if (previousMenu) {
                // Dupliquer vers la date sélectionnée
                await dailyMenuService.duplicateMenu(previousMenu.id, currentDate);
                Alert.alert('Succès', 'Menu dupliqué avec succès');
                await loadDailyMenu();
              } else {
                Alert.alert('Information', 'Aucun menu trouvé pour la date précédente');
              }
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de dupliquer le menu');
            }
          }
        }
      ]
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <LinearGradient
        colors={[COLORS.surface, COLORS.goldenSurface]}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <Text style={styles.title}>
            ✨ Menu du Jour
          </Text>
          <Text style={styles.dateText}>
            {format(selectedDate, 'EEEE dd MMMM yyyy', { locale: fr })}
          </Text>
        </View>
        {dailyMenu?.special_price && (
          <View style={styles.specialPriceBadge}>
            <Text style={styles.specialMenuPrice}>
              Menu Complet : {dailyMenu.special_price}€
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );

  const renderQuickActions = () => (
    <View style={styles.quickActions}>
      <ScrollView 
        horizontal={responsive.isMobile}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.actionsContainer}
      >
        <TouchableOpacity 
          style={[styles.actionButton, styles.primaryAction]} 
          onPress={onNavigateToCreate}
        >
          <LinearGradient
            colors={COLORS.gradients.subtleGold}
            style={styles.actionGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="add-circle" size={24} color={COLORS.primary} />
            <Text style={styles.actionButtonText}>Nouveau Menu</Text>
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={duplicateYesterday}
        >
          <Ionicons name="copy-outline" size={20} color={COLORS.variants.secondary[600]} />
          <Text style={styles.actionButtonText}>Dupliquer Hier</Text>
        </TouchableOpacity>
        
        {dailyMenu && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onNavigateToEdit(dailyMenu.id)}
          >
            <Ionicons name="create-outline" size={20} color={COLORS.variants.secondary[600]} />
            <Text style={styles.actionButtonText}>Modifier</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );

  const renderMenuItem = ({ item }: { item: DailyMenuItem }) => (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Switch
          value={item.is_available}
          onValueChange={() => toggleItemAvailability(item.id)}
          disabled={isTogglingItem === item.id}
          trackColor={{ 
            false: COLORS.border.default, 
            true: COLORS.variants.secondary[400] 
          }}
          thumbColor={item.is_available ? COLORS.variants.secondary[500] : COLORS.text.light}
          ios_backgroundColor={COLORS.border.default}
        />
      </View>
      
      <View style={styles.itemInfo}>
        <Text style={[
          styles.itemName, 
          !item.is_available && styles.itemDisabled
        ]}>
          {item.menu_item_name}
        </Text>
        {item.special_note && (
          <Text style={styles.specialNote}>
            <Ionicons name="information-circle" size={12} color={COLORS.text.golden} />
            {' '}{item.special_note}
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
        <ActivityIndicator 
          size="small" 
          color={COLORS.variants.secondary[500]} 
          style={styles.loader}
        />
      )}
    </View>
  );

  const renderCategorySection = (category: any) => {
    const isExpanded = expandedCategories.has(category.name);
    const itemCount = category.items.length;
    const availableCount = category.items.filter((i: DailyMenuItem) => i.is_available).length;

    return (
      <View key={category.name} style={styles.categorySection}>
        <TouchableOpacity 
          style={styles.categoryHeader}
          onPress={() => toggleCategory(category.name)}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={[COLORS.goldenSurface, COLORS.surface]}
            style={styles.categoryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.categoryTitleContainer}>
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text style={styles.categoryTitle}>{category.name.toUpperCase()}</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryCount}>
                  {availableCount}/{itemCount}
                </Text>
              </View>
            </View>
            <Ionicons 
              name={isExpanded ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={COLORS.text.golden}
            />
          </LinearGradient>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.categoryItems}>
            {responsive.isMobile ? (
              category.items.map((item: DailyMenuItem) => (
                <View key={item.id}>
                  {renderMenuItem({ item })}
                </View>
              ))
            ) : (
              <FlatList
                data={category.items}
                renderItem={renderMenuItem}
                keyExtractor={item => item.id}
                scrollEnabled={false}
              />
            )}
          </View>
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    const isDateToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    const isFutureDate = selectedDate > new Date();
    
    return (
      <View style={styles.noMenuContainer}>
        <LinearGradient
          colors={COLORS.gradients.subtleGold}
          style={styles.emptyStateGradient}
        >
          <Ionicons name="restaurant" size={64} color={COLORS.variants.secondary[400]} />
          <Text style={styles.noMenuTitle}>
            {isFutureDate ? 'Menu non configuré' : 'Aucun menu du jour'}
          </Text>
          <Text style={styles.noMenuSubtitle}>
            {isDateToday 
              ? 'Créez votre menu du jour pour attirer plus de clients'
              : isFutureDate
              ? `Planifiez le menu pour le ${format(selectedDate, 'dd MMMM', { locale: fr })}`
              : `Aucun menu n'était disponible le ${format(selectedDate, 'dd MMMM', { locale: fr })}`
            }
          </Text>
          <TouchableOpacity 
            style={styles.createButton} 
            onPress={onNavigateToCreate}
          >
            <LinearGradient
              colors={COLORS.gradients.goldenHorizontal}
              style={styles.createButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="add-circle" size={24} color={COLORS.surface} />
              <Text style={styles.createButtonText}>
                {isFutureDate ? 'Planifier ce menu' : 'Créer un menu du jour'}
              </Text>
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
        <LinearGradient
          colors={[COLORS.surface, COLORS.goldenSurface]}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <Text style={styles.title}>
              ✨ Menu du Jour
            </Text>
            <Text style={styles.dateText}>
              {format(selectedDate, 'EEEE dd MMMM yyyy', { locale: fr })}
            </Text>
          </View>
          {dailyMenu?.special_price && (
            <View style={styles.specialPriceBadge}>
              <Text style={styles.specialMenuPrice}>
                Menu Complet : {dailyMenu.special_price}€
              </Text>
            </View>
          )}
        </LinearGradient>
      </View>

      {renderQuickActions()}

      {!dailyMenu ? (
        renderEmptyState()
      ) : (
        <View style={styles.menuContent}>
          {dailyMenu.description && (
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

          {responsive.isDesktop ? (
            <View style={styles.categoriesGrid}>
              {dailyMenu.items_by_category.map(renderCategorySection)}
            </View>
          ) : (
            dailyMenu.items_by_category.map(renderCategorySection)
          )}
        </View>
      )}
    </>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl 
          refreshing={isRefreshing} 
          onRefresh={handleRefresh}
          colors={[COLORS.variants.secondary[500]]}
          tintColor={COLORS.variants.secondary[500]}
        />
      }
      showsVerticalScrollIndicator={!responsive.isMobile}
    >
      {responsive.isDesktop ? (
        <View style={styles.desktopContainer}>
          {content}
        </View>
      ) : content}
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
      backgroundColor: COLORS.goldenSurface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      marginRight: responsive.isMobile ? getResponsiveValue(SPACING.sm, screenType) : 0,
    },
    primaryAction: {
      ...SHADOWS.goldenGlow,
    },
    actionGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
    },
    actionButtonText: {
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      color: COLORS.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    noMenuContainer: {
      flex: 1,
      margin: getResponsiveValue(SPACING.xl, screenType),
    },
    emptyStateGradient: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING['2xl'], screenType),
      borderRadius: BORDER_RADIUS.xl,
      minHeight: 400,
    },
    noMenuTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      marginTop: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    noMenuSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING['2xl'], screenType),
      maxWidth: responsive.isMobile ? '100%' : 400,
    },
    createButton: {
      marginTop: getResponsiveValue(SPACING.lg, screenType),
      ...SHADOWS.button,
    },
    createButtonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.xl, screenType),
      borderRadius: BORDER_RADIUS.full,
    },
    createButtonText: {
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
    menuContent: {
      padding: getResponsiveValue(SPACING.container, screenType),
    },
    descriptionCard: {
      backgroundColor: COLORS.goldenSurface,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      borderLeftWidth: 4,
      borderLeftColor: COLORS.variants.secondary[500],
    },
    menuDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.secondary,
      fontStyle: 'italic',
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType) * TYPOGRAPHY.lineHeight.relaxed,
    },
    statsCard: {
      flexDirection: 'row',
      backgroundColor: COLORS.surface,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      justifyContent: 'center',
      alignItems: 'center',
      ...SHADOWS.sm,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
    },
    statDivider: {
      width: 1,
      height: 24,
      backgroundColor: COLORS.border.golden,
      marginHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
    statsText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
    },
    categoriesGrid: {
      flexDirection: responsive.isDesktop ? 'row' : 'column',
      flexWrap: 'wrap',
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    categorySection: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      overflow: 'hidden',
      ...SHADOWS.card,
      flex: responsive.isDesktop ? 0.48 : 1,
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
      flex: 1,
    },
    categoryIcon: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    categoryTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      flex: 1,
    },
    categoryBadge: {
      backgroundColor: COLORS.variants.secondary[200],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.full,
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
    categoryCount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.variants.secondary[700],
    },
    categoryItems: {
      backgroundColor: COLORS.surface,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    itemLeft: {
      marginRight: getResponsiveValue(SPACING.md, screenType),
    },
    itemInfo: {
      flex: 1,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    itemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.primary,
      marginBottom: 2,
    },
    itemDisabled: {
      opacity: 0.5,
      textDecorationLine: 'line-through',
    },
    specialNote: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      fontStyle: 'italic',
      marginTop: 2,
      flexDirection: 'row',
      alignItems: 'center',
    },
    priceContainer: {
      alignItems: 'flex-end',
      minWidth: responsive.isMobile ? 80 : 100,
    },
    discountContainer: {
      alignItems: 'flex-end',
    },
    itemPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    originalPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.light,
      textDecorationLine: 'line-through',
      marginBottom: 2,
    },
    specialPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.variants.secondary[600],
    },
    discountBadge: {
      backgroundColor: COLORS.success,
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 4,
    },
    discountText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
    loader: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
  });
};