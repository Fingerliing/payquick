import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// UI Components
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Alert as AppAlert } from '@/components/ui/Alert';

// Services & Types
import { dailyMenuService, CreateDailyMenuData } from '@/services/dailyMenuService';
import { menuService } from '@/services/menuService';
import { MenuItem } from '@/types/menu';

// Design System
import {
  useAppTheme,
  type AppColors,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';

interface SelectedItem {
  menuItemId: string;
  // ⚠️ Plus de specialPrice : la formule fixe le prix total au niveau du menu
  specialNote?: string;
  isAvailable: boolean;
}

type AppAlertVariant = 'success' | 'error' | 'warning' | 'info';
type LocalAlert = {
  id: string;
  variant: AppAlertVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
};

export default function CreateDailyMenuScreen() {
  const { restaurantId, selectedDate: selectedDateParam } = useLocalSearchParams<{
    restaurantId: string;
    selectedDate?: string;
  }>();
  const screenType = useScreenType();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const styles = createStyles(colors, screenType, responsive, insets);

  const initialDate = selectedDateParam ? new Date(selectedDateParam) : new Date();

  // États
  const [selectedDate] = useState(initialDate);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState(`Menu du ${format(initialDate, 'dd MMMM', { locale: fr })}`);
  const [description, setDescription] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Alertes
  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const pushAlert = (variant: AppAlertVariant, alertTitle: string, message: string, onDismiss?: () => void) => {
    setAlerts(prev => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        variant,
        title: alertTitle,
        message,
        onDismiss,
      },
      ...prev,
    ]);
  };
  const dismissAlert = (alertId: string, callback?: () => void) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    callback?.();
  };

  useEffect(() => {
    loadMenuItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const loadMenuItems = async () => {
    if (!restaurantId) return;
    try {
      setIsLoading(true);
      const items = await menuService.menuItems.getMyMenuItems();
      setMenuItems(items);

      const categories = new Set(items.map((item: MenuItem) => item.category_name || 'Autres'));
      setExpandedCategories(categories);
    } catch (error) {
      console.error('Erreur lors du chargement des plats:', error);
      pushAlert('error', t('menuItemForm.error'), t('dailyMenuForm.loadItemsError'));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemSelection = (item: MenuItem) => {
    const newSelected = new Map(selectedItems);
    const itemId = String(item.id);

    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.set(itemId, {
        menuItemId: itemId,
        specialNote: '',
        isAvailable: true,
      });
    }

    setSelectedItems(newSelected);
  };

  // ─── Aperçu formule en direct ────────────────────────────────────────
  const selectedItemsArray = Array.from(selectedItems.values());
  const selectedMenuItems = selectedItemsArray
    .map(s => menuItems.find(m => String(m.id) === s.menuItemId))
    .filter(Boolean) as MenuItem[];
  const distinctCategories = new Set(
    selectedMenuItems.map(m => m.category_name || 'Autres')
  );
  const categoriesCount = distinctCategories.size;
  const pricePerCategory =
    specialPrice && categoriesCount > 0
      ? (parseFloat(specialPrice) / categoriesCount).toFixed(2)
      : null;

  const handleSave = async () => {
    if (!title.trim()) {
      pushAlert('error', t('menuItemForm.error'), t('dailyMenuForm.titleRequired'));
      return;
    }

    if (!specialPrice || parseFloat(specialPrice) <= 0) {
      pushAlert(
        'error',
        t('dailyMenuForm.priceRequiredTitle'),
        t('dailyMenuForm.priceRequiredMessage')
      );
      return;
    }

    if (selectedItems.size === 0) {
      pushAlert('error', t('menuItemForm.error'), t('dailyMenuForm.selectAtLeastOne'));
      return;
    }

    if (!restaurantId) return;

    try {
      setIsSaving(true);

      const menuData: CreateDailyMenuData = {
        restaurant: restaurantId,
        date: format(selectedDate, 'yyyy-MM-dd'),
        title: title.trim(),
        description: description.trim() || undefined,
        is_active: true,
        special_price: parseFloat(specialPrice),
        items: Array.from(selectedItems.values()).map(item => ({
          menu_item: item.menuItemId,
          special_note: item.specialNote,
          is_available: item.isAvailable,
          display_order: 0,
        })),
      };

      await dailyMenuService.createDailyMenu(menuData);

      pushAlert('success', t('menuItemForm.success'), t('dailyMenuForm.created'), () => router.back());
    } catch (error: any) {
      console.error('Erreur lors de la création du menu:', error);
      pushAlert(
        'error',
        t('menuItemForm.error'),
        error?.response?.data?.message ||
          error?.response?.data?.special_price?.[0] ||
          error?.response?.data?.detail ||
          t('dailyMenuForm.createError')
      );
    } finally {
      setIsSaving(false);
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

  // Grouper les plats par catégorie
  const itemsByCategory = menuItems.reduce((acc, item) => {
    const category = item.category_name || 'Autres';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  const renderMenuItem = (item: MenuItem) => {
    const itemId = String(item.id);
    const isSelected = selectedItems.has(itemId);

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.menuItem, isSelected && styles.menuItemSelected]}
        onPress={() => toggleItemSelection(item)}
      >
        <View style={styles.menuItemInfo}>
          <Text style={styles.menuItemName}>{item.name}</Text>
          {!!item.description && (
            <Text style={styles.menuItemDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}
        </View>

        <View style={styles.menuItemRight}>
          {isSelected ? (
            <Ionicons name="checkmark-circle" size={24} color={colors.success} />
          ) : (
            <Ionicons name="ellipse-outline" size={24} color={colors.text.light} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.variants.secondary[500]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={t('dailyMenuForm.createTitle')} showBackButton />

      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map(a => (
            <AppAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id, a.onDismiss)}
              autoDismiss
            />
          ))}
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={!responsive.isMobile}
      >
        <Card variant="premium" style={styles.formCard}>
          <Text style={styles.sectionTitle}>{t('dailyMenuForm.generalInfo')}</Text>

          <Input
            label={t('dailyMenuForm.titleLabel')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('dailyMenuForm.titlePlaceholder')}
            leftIcon="restaurant"
          />

          <Input
            label={t('dailyMenuForm.descLabel')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('dailyMenuForm.descPlaceholder')}
            multiline
            numberOfLines={3}
            leftIcon="document-text"
          />

          <Input
            label={t('dailyMenuForm.priceLabel')}
            value={specialPrice}
            onChangeText={setSpecialPrice}
            keyboardType="numeric"
            placeholder={t('dailyMenuForm.pricePlaceholder')}
            leftIcon="pricetag"
          />

          {/* Aperçu de la formule en direct */}
          {!!pricePerCategory && categoriesCount > 0 && (
            <View style={styles.formulaPreview}>
              <Ionicons name="information-circle" size={16} color={colors.text.golden} />
              <Text style={styles.formulaPreviewText}>
                {categoriesCount > 1
                  ? t('dailyMenuForm.priceSummaryMulti', { count: categoriesCount, price: pricePerCategory })
                  : t('dailyMenuForm.priceSummarySingle', { price: pricePerCategory })}
              </Text>
            </View>
          )}

          <Text style={styles.helperText}>
            {t('dailyMenuForm.clientPriceHint')}
          </Text>
        </Card>

        <Card variant="surface" style={styles.selectionCard}>
          <Text style={styles.sectionTitle}>{t('dailyMenuForm.dishSelection')}</Text>
          <Text style={styles.selectionSubtitle}>
            {t('dailyMenuForm.selectedDishes', { count: selectedItems.size })}
            {selectedItems.size > 1 ? 's' : ''}
            {categoriesCount > 0 && t('dailyMenuForm.categoriesSuffix', { count: categoriesCount })}
          </Text>

          {Object.entries(itemsByCategory).map(([category, items]) => {
            const isExpanded = expandedCategories.has(category);
            const selectedCount = items.filter(item => selectedItems.has(String(item.id))).length;

            return (
              <View key={category} style={styles.categorySection}>
                <TouchableOpacity
                  style={styles.categoryHeader}
                  onPress={() => toggleCategory(category)}
                >
                  <View style={styles.categoryTitleContainer}>
                    <Text style={styles.categoryTitle}>{category}</Text>
                    {selectedCount > 0 && (
                      <View style={styles.categoryBadge}>
                        <Text style={styles.categoryBadgeText}>{selectedCount}</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.categoryItems}>
                    {items.map(renderMenuItem)}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSaving ? t('dailyMenuForm.saving') : t('dailyMenuForm.createButton')}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          variant="primary"
          fullWidth
          leftIcon={<Ionicons name="checkmark-circle" size={20} color={colors.surface} />}
        />
      </View>
    </View>
  );
}

const createStyles = (
  colors: AppColors,
  screenType: 'mobile' | 'tablet' | 'desktop',
  _responsive: any,
  insets: any
) => {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    alertsContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingTop: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    scrollView: { flex: 1 },
    scrollContent: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: 100,
    },
    formCard: { marginBottom: getResponsiveValue(SPACING.lg, screenType) },
    selectionCard: { marginBottom: getResponsiveValue(SPACING.lg, screenType) },
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    selectionSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    formulaPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: colors.goldenSurface,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
    formulaPreviewText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      flex: 1,
    },
    helperText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      fontStyle: 'italic',
    },
    categorySection: { marginBottom: getResponsiveValue(SPACING.md, screenType) },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    categoryTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    categoryTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    categoryBadge: {
      backgroundColor: colors.variants.secondary[500],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
    },
    categoryBadgeText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.surface,
    },
    categoryItems: {
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    menuItemSelected: {
      borderColor: colors.success,
      backgroundColor: colors.success + '10',
    },
    menuItemInfo: { flex: 1, paddingRight: getResponsiveValue(SPACING.sm, screenType) },
    menuItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    menuItemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginTop: 2,
    },
    menuItemRight: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: Math.max(insets?.bottom ?? 0, 20),
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
  });
};