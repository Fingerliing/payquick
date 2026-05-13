import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { 
  dailyMenuService, 
  PublicDailyMenu, 
  CategoryWithItems 
} from '@/services/dailyMenuService';
import { 
  COLORS, 
  TYPOGRAPHY, 
  SPACING, 
  BORDER_RADIUS, 
  SHADOWS,
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles 
} from '@/utils/designSystem';

interface Props {
  restaurantId: number;
  restaurantName?: string;
  onAddToCart?: (item: any) => void;
  isInRestaurantView?: boolean;
}

export const DailyMenuDisplay: React.FC<Props> = ({
  restaurantId,
  restaurantName,
  onAddToCart,
  isInRestaurantView = false,
}) => {
  const [menu, setMenu] = useState<PublicDailyMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  const screenType = useScreenType();
  const styles = createStyles(screenType);

  useEffect(() => {
    loadMenu();
  }, [restaurantId]);

  const loadMenu = async () => {
    try {
      setIsLoading(true);
      const dailyMenu = await dailyMenuService.getPublicDailyMenu(restaurantId);
      setMenu(dailyMenu);
      // Expand all categories by default
      if (dailyMenu?.items_by_category) {
        setExpandedCategories(new Set(dailyMenu.items_by_category.map(cat => cat.name)));
      }
    } catch (error) {
      setMenu(null);
    } finally {
      setIsLoading(false);
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

  const handleAddToCart = (item: any) => {
    if (onAddToCart) {
      onAddToCart({
        ...item,
        restaurantId,
        restaurantName: menu?.restaurant_name || restaurantName,
      });
    }
  };

  const renderDietaryTags = (item: any) => {
    const tags = [];
    if (item.is_vegan) tags.push({ label: '🌱 Vegan', color: COLORS.success });
    else if (item.is_vegetarian) tags.push({ label: '🥬 Végétarien', color: COLORS.info });
    if (item.is_gluten_free) tags.push({ label: '🌾 Sans gluten', color: COLORS.warning });
    
    if (tags.length === 0) return null;
    
    return (
      <View style={styles.dietaryTags}>
        {tags.map((tag, index) => (
          <View key={index} style={[styles.dietaryTag, { backgroundColor: tag.color + '20' }]}>
            <Text style={[styles.dietaryTagText, { color: tag.color }]}>
              {tag.label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderMenuItem = (item: any) => (
    <TouchableOpacity
      key={item.id}
      style={styles.menuItem}
      onPress={() => setSelectedItem(item)}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemContent}>
        <View style={styles.menuItemInfo}>
          <Text style={styles.menuItemName}>{item.menu_item_name || item.name}</Text>
          {!!(item.menu_item_description || item.description) && (
            <Text style={styles.menuItemDescription} numberOfLines={2}>
              {item.menu_item_description || item.description}
            </Text>
          )}

          {!!item.special_note && (
            <View style={styles.specialNoteContainer}>
              <Ionicons name="star" size={12} color={COLORS.warning} />
              <Text style={styles.specialNote}>{item.special_note}</Text>
            </View>
          )}

          {renderDietaryTags(item)}
        </View>

        {/* Plus de prix par plat : le prix est annoncé au niveau du menu (formule).
            On garde uniquement un bouton "Ajouter" si onAddToCart est fourni. */}
        <View style={styles.priceSection}>
          {onAddToCart && (
            <TouchableOpacity
              style={styles.addToCartButton}
              onPress={() => handleAddToCart(item)}
            >
              <Ionicons name="add-circle" size={28} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!!(item.menu_item_image || item.image_url) && (
        <Image
          source={{ uri: item.menu_item_image || item.image_url }}
          style={styles.menuItemImage}
          resizeMode="cover"
        />
      )}
    </TouchableOpacity>
  );

  const renderCategory = (category: CategoryWithItems) => {
    const isExpanded = expandedCategories.has(category.name);
    
    return (
      <View key={category.name} style={styles.categoryContainer}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => toggleCategory(category.name)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.primary + '10', COLORS.surface]}
            style={styles.categoryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.categoryTitle}>
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text style={styles.categoryName}>{category.name}</Text>
              <View style={styles.itemCountBadge}>
                <Text style={styles.itemCount}>{category.items.length}</Text>
              </View>
            </View>
            <Ionicons 
              name={isExpanded ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={COLORS.text.secondary}
            />
          </LinearGradient>
        </TouchableOpacity>
        
        {isExpanded && (
          <View style={styles.categoryItems}>
            {category.items.map(renderMenuItem)}
          </View>
        )}
      </View>
    );
  };

  const renderItemModal = () => {
    if (!selectedItem) return null;

    const itemName = selectedItem.menu_item_name || selectedItem.name;
    const itemDesc = selectedItem.menu_item_description || selectedItem.description;
    const itemImage = selectedItem.menu_item_image || selectedItem.image_url;

    return (
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedItem(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedItem(null)}
        >
          <BlurView intensity={95} style={StyleSheet.absoluteFillObject} />
          <View style={styles.modalContent}>
            {!!itemImage && (
              <Image
                source={{ uri: itemImage }}
                style={styles.modalImage}
                resizeMode="cover"
              />
            )}

            <View style={styles.modalInfo}>
              <Text style={styles.modalTitle}>{itemName}</Text>

              {!!itemDesc && (
                <Text style={styles.modalDescription}>{itemDesc}</Text>
              )}

              {renderDietaryTags(selectedItem)}

              {selectedItem.allergens && selectedItem.allergens.length > 0 && (
                <View style={styles.allergensContainer}>
                  <Text style={styles.allergensTitle}>⚠️ Allergènes:</Text>
                  <Text style={styles.allergensText}>
                    {selectedItem.allergens.join(', ')}
                  </Text>
                </View>
              )}

              <View style={styles.modalFooter}>
                {/* Plus de prix par plat dans le menu du jour : on ne montre que
                    le CTA "Ajouter au panier". Le prix global de la formule est
                    affiché en haut de l'écran. */}
                <View style={{ flex: 1 }} />

                {onAddToCart && (
                  <TouchableOpacity
                    style={styles.modalAddButton}
                    onPress={() => {
                      handleAddToCart(selectedItem);
                      setSelectedItem(null);
                    }}
                  >
                    <LinearGradient
                      colors={COLORS.gradients.goldenHorizontal}
                      style={styles.modalButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Ionicons name="cart" size={20} color={COLORS.surface} />
                      <Text style={styles.modalButtonText}>Ajouter au panier</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Chargement du menu...</Text>
      </View>
    );
  }

  if (!menu) {
    return null;
  }

  return (
    <>
      <ScrollView 
        style={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {!isInRestaurantView && (
          <View style={styles.header}>
            <LinearGradient
              colors={[COLORS.primary + '15', COLORS.surface]}
              style={styles.headerGradient}
            >
              <Text style={styles.headerTitle}>✨ Menu du Jour</Text>
              <Text style={styles.headerDate}>
                {format(new Date(menu.date), 'EEEE dd MMMM', { locale: fr })}
              </Text>
              
              {menu.restaurant_name && (
                <Text style={styles.restaurantName}>{menu.restaurant_name}</Text>
              )}
            </LinearGradient>
          </View>
        )}
        
        {menu.special_price && (
          <View style={styles.specialPriceCard}>
            <LinearGradient
              colors={COLORS.gradients.goldenHorizontal}
              style={styles.specialPriceGradient}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.specialPriceLabel}>🎯 Formule complète</Text>
                {!!menu.is_formula && !!menu.price_per_category && menu.categories_count > 1 && (
                  <Text style={{
                    color: COLORS.surface,
                    fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
                    opacity: 0.9,
                    marginTop: 2,
                  }}>
                    1 plat par catégorie • {Number(menu.price_per_category).toFixed(2)}€ / plat
                  </Text>
                )}
              </View>
              <Text style={styles.specialPriceValue}>{menu.special_price}€</Text>
            </LinearGradient>
          </View>
        )}
        
        {menu.description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.description}>{menu.description}</Text>
          </View>
        )}
        
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Ionicons name="restaurant" size={16} color={COLORS.text.secondary} />
            <Text style={styles.statText}>{menu.total_items_count} plats</Text>
          </View>
          {!!menu.is_formula && menu.categories_count > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="grid-outline" size={16} color={COLORS.text.secondary} />
                <Text style={styles.statText}>
                  {menu.categories_count} catégorie{menu.categories_count > 1 ? 's' : ''}
                </Text>
              </View>
            </>
          )}
        </View>
        
        <View style={styles.categoriesSection}>
          {menu.items_by_category.map(renderCategory)}
        </View>
      </ScrollView>
      
      {renderItemModal()}
    </>
  );
};

const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop') => {
  const baseSpacing = getResponsiveValue(SPACING.md, screenType);
  
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: baseSpacing * 2,
    },
    loadingText: {
      marginTop: baseSpacing,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: baseSpacing * 3,
    },
    emptyTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginTop: baseSpacing,
    },
    emptySubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      marginTop: baseSpacing / 2,
    },
    header: {
      backgroundColor: COLORS.surface,
      marginBottom: baseSpacing,
      ...SHADOWS.sm,
    },
    headerGradient: {
      padding: baseSpacing * 1.5,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      marginBottom: baseSpacing / 2,
    },
    headerDate: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.secondary,
      textTransform: 'capitalize',
    },
    restaurantName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginTop: baseSpacing / 2,
    },
    specialPriceCard: {
      marginHorizontal: baseSpacing,
      marginBottom: baseSpacing,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      ...SHADOWS.md,
    },
    specialPriceGradient: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: baseSpacing * 1.5,
    },
    specialPriceLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.surface,
    },
    specialPriceValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.surface,
    },
    descriptionCard: {
      backgroundColor: COLORS.surface,
      marginHorizontal: baseSpacing,
      marginBottom: baseSpacing,
      padding: baseSpacing,
      borderRadius: BORDER_RADIUS.md,
      borderLeftWidth: 3,
      borderLeftColor: COLORS.primary,
    },
    description: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      fontStyle: 'italic',
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      marginHorizontal: baseSpacing,
      marginBottom: baseSpacing,
      padding: baseSpacing,
      borderRadius: BORDER_RADIUS.md,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: baseSpacing,
    },
    statDivider: {
      width: 1,
      height: 20,
      backgroundColor: COLORS.border.light,
    },
    statText: {
      marginLeft: baseSpacing / 2,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
    categoriesSection: {
      paddingHorizontal: baseSpacing,
      paddingBottom: baseSpacing * 2,
    },
    categoryContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: baseSpacing,
      overflow: 'hidden',
      ...SHADOWS.sm,
    },
    categoryHeader: {
      overflow: 'hidden',
    },
    categoryGradient: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: baseSpacing,
    },
    categoryTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    categoryIcon: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      marginRight: baseSpacing / 2,
    },
    categoryName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      flex: 1,
    },
    itemCountBadge: {
      backgroundColor: COLORS.primary + '20',
      paddingHorizontal: baseSpacing / 2,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
      marginLeft: baseSpacing / 2,
    },
    itemCount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.primary,
    },
    categoryItems: {
      paddingVertical: baseSpacing / 2,
    },
    menuItem: {
      paddingHorizontal: baseSpacing,
      paddingVertical: baseSpacing,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    menuItemContent: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    menuItemInfo: {
      flex: 1,
      marginRight: baseSpacing,
    },
    menuItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    menuItemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType) * 1.4,
      marginBottom: baseSpacing / 2,
    },
    menuItemImage: {
      width: 80,
      height: 80,
      borderRadius: BORDER_RADIUS.md,
      marginTop: baseSpacing / 2,
    },
    specialNoteContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    specialNote: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.warning,
      fontStyle: 'italic',
      marginLeft: 4,
    },
    dietaryTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: baseSpacing / 2,
    },
    dietaryTag: {
      paddingHorizontal: baseSpacing / 2,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      marginRight: baseSpacing / 2,
      marginBottom: 4,
    },
    dietaryTagText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    priceSection: {
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    regularPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    discountContainer: {
      alignItems: 'flex-end',
    },
    discountBadge: {
      backgroundColor: COLORS.success,
      paddingHorizontal: baseSpacing / 2,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 4,
    },
    discountPercentage: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.surface,
    },
    originalPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.light,
      textDecorationLine: 'line-through',
    },
    discountedPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.success,
    },
    addToCartButton: {
      marginTop: baseSpacing / 2,
    },
    
    // Modal styles
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      width: screenType === 'mobile' ? '90%' : '80%',
      maxWidth: 500,
      maxHeight: '80%',
      ...SHADOWS.xl,
    },
    modalImage: {
      width: '100%',
      height: 200,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
    },
    modalInfo: {
      padding: baseSpacing * 1.5,
    },
    modalTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: baseSpacing,
    },
    modalDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
      marginBottom: baseSpacing,
    },
    allergensContainer: {
      backgroundColor: COLORS.warning + '10',
      padding: baseSpacing,
      borderRadius: BORDER_RADIUS.md,
      marginTop: baseSpacing,
    },
    allergensTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.warning,
      marginBottom: 4,
    },
    allergensText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: baseSpacing * 1.5,
      paddingTop: baseSpacing,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    modalPriceContainer: {
      flexDirection: 'column',
    },
    modalOriginalPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.light,
      textDecorationLine: 'line-through',
    },
    modalPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },
    modalAddButton: {
      flex: 1,
      marginLeft: baseSpacing,
    },
    modalButtonGradient: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: baseSpacing,
      paddingHorizontal: baseSpacing * 1.5,
      borderRadius: BORDER_RADIUS.full,
    },
    modalButtonText: {
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      marginLeft: baseSpacing / 2,
    },
  });
};