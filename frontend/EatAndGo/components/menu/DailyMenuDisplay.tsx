import React, { useEffect, useMemo, useState } from 'react';
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
import { format, type Locale } from 'date-fns';
import {
  fr as dfFR,
  enUS as dfEN,
  es as dfES,
  eu as dfEU,
  de as dfDE,
  it as dfIT,
  pt as dfPT,
  nl as dfNL,
  zhCN as dfZH,
  ja as dfJA,
  arSA as dfAR,
} from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';

import {
  dailyMenuService,
  PublicDailyMenu,
  CategoryWithItems,
} from '@/services/dailyMenuService';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

// ──────────────────────────────────────────────────────────────────────────
// Mapping i18n.language → locale date-fns
// (À extraire dans @/utils/dateLocale si réutilisé ailleurs.)
// ──────────────────────────────────────────────────────────────────────────
const DATE_FNS_LOCALES: Record<string, Locale> = {
  fr: dfFR,
  en: dfEN,
  es: dfES,
  eu: dfEU,
  de: dfDE,
  it: dfIT,
  pt: dfPT,
  nl: dfNL,
  zh: dfZH,
  ja: dfJA,
  ar: dfAR,
};

const getDateFnsLocale = (lang: string): Locale =>
  DATE_FNS_LOCALES[lang] ?? dfFR;

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
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => createStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );

  // Locale dérivée de la langue active
  const dateLocale = useMemo(() => getDateFnsLocale(i18n.language), [i18n.language]);

  // Formatage devise locale-aware
  const currencyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'EUR',
      });
    } catch {
      return null;
    }
  }, [i18n.language]);
  const formatCurrency = (amount: number): string =>
    currencyFormatter ? currencyFormatter.format(amount) : `${amount.toFixed(2)} €`;

  // ── State ────────────────────────────────────────────────────────────
  const [menu, setMenu] = useState<PublicDailyMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const loadMenu = async () => {
    try {
      setIsLoading(true);
      const dailyMenu = await dailyMenuService.getPublicDailyMenu(restaurantId);
      setMenu(dailyMenu);
      if (dailyMenu?.items_by_category) {
        setExpandedCategories(
          new Set(dailyMenu.items_by_category.map((cat) => cat.name)),
        );
      }
    } catch {
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

  // ── Dietary tags (réutilise les clés `menu.*` existantes) ────────────
  const renderDietaryTags = (item: any) => {
    const tags: Array<{ label: string; color: string }> = [];
    if (item.is_vegan) {
      tags.push({ label: `🌱 ${t('menu.vegan')}`, color: colors.success });
    } else if (item.is_vegetarian) {
      tags.push({ label: `🥬 ${t('menu.vegetarian')}`, color: colors.info });
    }
    if (item.is_gluten_free) {
      tags.push({ label: `🌾 ${t('menu.glutenFree')}`, color: colors.warning });
    }

    if (tags.length === 0) return null;

    return (
      <View style={styles.dietaryTags}>
        {tags.map((tag, index) => (
          <View
            key={index}
            style={[styles.dietaryTag, { backgroundColor: tag.color + '20' }]}
          >
            <Text style={[styles.dietaryTagText, { color: tag.color }]}>
              {tag.label}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // ── Item card ────────────────────────────────────────────────────────
  const renderMenuItem = (item: any) => (
    <TouchableOpacity
      key={item.id}
      style={styles.menuItem}
      onPress={() => setSelectedItem(item)}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemContent}>
        <View style={styles.menuItemInfo}>
          <Text style={styles.menuItemName}>
            {item.menu_item_name || item.name}
          </Text>
          {!!(item.menu_item_description || item.description) && (
            <Text style={styles.menuItemDescription} numberOfLines={2}>
              {item.menu_item_description || item.description}
            </Text>
          )}

          {!!item.special_note && (
            <View style={styles.specialNoteContainer}>
              <Ionicons name="star" size={12} color={colors.warning} />
              <Text style={styles.specialNote}>{item.special_note}</Text>
            </View>
          )}

          {renderDietaryTags(item)}
        </View>

        {/* Pas de prix par plat : le prix est annoncé au niveau du menu (formule). */}
        <View style={styles.priceSection}>
          {onAddToCart && (
            <TouchableOpacity
              style={styles.addToCartButton}
              onPress={() => handleAddToCart(item)}
            >
              <Ionicons name="add-circle" size={28} color={colors.primary} />
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

  // ── Category section ─────────────────────────────────────────────────
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
            colors={[colors.primary + '10', colors.surface]}
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
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.text.secondary}
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

  // ── Item detail modal ────────────────────────────────────────────────
  const renderItemModal = () => {
    if (!selectedItem) return null;

    const itemName = selectedItem.menu_item_name || selectedItem.name;
    const itemDesc = selectedItem.menu_item_description || selectedItem.description;
    const itemImage = selectedItem.menu_item_image || selectedItem.image_url;

    return (
      <Modal
        visible={!!selectedItem}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setSelectedItem(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedItem(null)}
        >
          <BlurView
            intensity={95}
            tint={isDark ? 'dark' : 'default'}
            style={StyleSheet.absoluteFillObject}
          />
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
                  <Text style={styles.allergensTitle}>
                    ⚠️ {t('menu.allergens')} :
                  </Text>
                  <Text style={styles.allergensText}>
                    {selectedItem.allergens.join(', ')}
                  </Text>
                </View>
              )}

              <View style={styles.modalFooter}>
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
                      colors={
                        colors.gradients.goldenHorizontal as readonly [
                          string,
                          string,
                          ...string[],
                        ]
                      }
                      style={styles.modalButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Ionicons name="cart" size={20} color="#FFFFFF" />
                      <Text style={styles.modalButtonText}>
                        {t('menu.addToCart')}
                      </Text>
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

  // ── Rendu principal ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          {t('dailyMenuDisplay.loading')}
        </Text>
      </View>
    );
  }

  if (!menu) {
    return null;
  }

  return (
    <>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {!isInRestaurantView && (
          <View style={styles.header}>
            <LinearGradient
              colors={[colors.primary + '15', colors.surface]}
              style={styles.headerGradient}
            >
              <Text style={styles.headerTitle}>
                ✨ {t('menu.dailyMenu')}
              </Text>
              <Text style={styles.headerDate}>
                {format(new Date(menu.date), 'EEEE dd MMMM', {
                  locale: dateLocale,
                })}
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
              colors={
                colors.gradients.goldenHorizontal as readonly [
                  string,
                  string,
                  ...string[],
                ]
              }
              style={styles.specialPriceGradient}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.specialPriceLabel}>
                  🎯 {t('dailyMenuDisplay.completeFormula')}
                </Text>
                {!!menu.is_formula &&
                  !!menu.price_per_category &&
                  menu.categories_count > 1 && (
                    <Text style={styles.formulaHint}>
                      {t('dailyMenuDisplay.formulaHint', {
                        price: formatCurrency(Number(menu.price_per_category)),
                      })}
                    </Text>
                  )}
              </View>
              <Text style={styles.specialPriceValue}>
                {formatCurrency(Number(menu.special_price))}
              </Text>
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
            <Ionicons
              name="restaurant"
              size={16}
              color={colors.text.secondary}
            />
            <Text style={styles.statText}>
              {t('dailyMenuDisplay.dishesCount', {
                count: menu.total_items_count,
              })}
            </Text>
          </View>
          {!!menu.is_formula && menu.categories_count > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons
                  name="grid-outline"
                  size={16}
                  color={colors.text.secondary}
                />
                <Text style={styles.statText}>
                  {t('dailyMenuDisplay.categoriesCount', {
                    count: menu.categories_count,
                  })}
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

// ──────────────────────────────────────────────────────────────────────────
// STYLES (fabrique theme-aware)
// ──────────────────────────────────────────────────────────────────────────
const createStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: 'mobile' | 'tablet' | 'desktop',
) => {
  const baseSpacing = getResponsiveValue(SPACING.md, screenType);
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: baseSpacing * 2,
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: baseSpacing,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.secondary,
    },
    header: {
      backgroundColor: colors.surface,
      marginBottom: baseSpacing,
      borderBottomWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderBottomColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.sm,
    },
    headerGradient: {
      padding: baseSpacing * 1.5,
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.primary,
      marginBottom: baseSpacing / 2,
    },
    headerDate: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: colors.text.secondary,
      textTransform: 'capitalize',
    },
    restaurantName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      marginTop: baseSpacing / 2,
    },
    specialPriceCard: {
      marginHorizontal: baseSpacing,
      marginBottom: baseSpacing,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      ...shadows.md,
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
      // Texte blanc stable sur fond or — lisibilité optimale
      color: '#FFFFFF',
    },
    formulaHint: {
      color: '#FFFFFF',
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      opacity: 0.9,
      marginTop: 2,
    },
    specialPriceValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: '#FFFFFF',
    },
    descriptionCard: {
      backgroundColor: colors.surface,
      marginHorizontal: baseSpacing,
      marginBottom: baseSpacing,
      padding: baseSpacing,
      borderRadius: BORDER_RADIUS.md,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    description: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.secondary,
      fontStyle: 'italic',
      lineHeight:
        getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: baseSpacing,
      marginBottom: baseSpacing,
      padding: baseSpacing,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: baseSpacing,
    },
    statDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.border.light,
    },
    statText: {
      marginLeft: baseSpacing / 2,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
    },
    categoriesSection: {
      paddingHorizontal: baseSpacing,
      paddingBottom: baseSpacing * 2,
    },
    categoryContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: baseSpacing,
      overflow: 'hidden',
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.sm,
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
      color: colors.text.primary,
      flex: 1,
    },
    itemCountBadge: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: baseSpacing / 2,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
      marginLeft: baseSpacing / 2,
    },
    itemCount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.primary,
    },
    categoryItems: {
      paddingVertical: baseSpacing / 2,
    },
    menuItem: {
      paddingHorizontal: baseSpacing,
      paddingVertical: baseSpacing,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
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
      color: colors.text.primary,
      marginBottom: 4,
    },
    menuItemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      lineHeight:
        getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType) * 1.4,
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
      color: colors.warning,
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
    addToCartButton: {
      marginTop: baseSpacing / 2,
    },

    // ─── Modal ────────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      width: screenType === 'mobile' ? '90%' : '80%',
      maxWidth: 500,
      maxHeight: '80%',
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.xl,
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
      color: colors.text.primary,
      marginBottom: baseSpacing,
    },
    modalDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.secondary,
      lineHeight:
        getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
      marginBottom: baseSpacing,
    },
    allergensContainer: {
      backgroundColor: colors.warning + '15',
      padding: baseSpacing,
      borderRadius: BORDER_RADIUS.md,
      marginTop: baseSpacing,
    },
    allergensTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.warning,
      marginBottom: 4,
    },
    allergensText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: baseSpacing * 1.5,
      paddingTop: baseSpacing,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
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
      color: '#FFFFFF',
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      marginLeft: baseSpacing / 2,
    },
  });
};

export default DailyMenuDisplay;