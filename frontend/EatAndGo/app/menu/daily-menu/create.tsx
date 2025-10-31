import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';

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

interface SelectedItem {
  menuItemId: string;
  specialPrice?: number;
  specialNote?: string;
  isAvailable: boolean;
}

type AppAlertVariant = 'success' | 'error' | 'warning' | 'info';
type LocalAlert = {
  id: string;
  variant: AppAlertVariant;
  title?: string;
  message: string;
  onDismiss?: () => void; // optionnel : action au dismiss
};

export default function CreateDailyMenuScreen() {
  const { restaurantId, selectedDate: selectedDateParam } = useLocalSearchParams<{ restaurantId: string; selectedDate?: string }>();
  const screenType = useScreenType();
  const responsive = useResponsive();
  const insets = useSafeAreaInsets();
  const styles = createStyles(screenType, responsive, insets);

  // Initialiser avec la date passée en paramètre ou aujourd'hui
  const initialDate = selectedDateParam ? new Date(selectedDateParam) : new Date();

  // États
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState(`Menu du ${format(initialDate, 'dd MMMM', { locale: fr })}`);
  const [description, setDescription] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Pile d'alertes (top screen)
  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const pushAlert = (variant: AppAlertVariant, title: string, message: string, onDismiss?: () => void) => {
    setAlerts(prev => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        variant,
        title,
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
  }, [restaurantId]);

  useEffect(() => {
    // Mettre à jour automatiquement le titre quand la date sélectionnée change
    setTitle(`Menu du ${format(selectedDate, 'dd MMMM', { locale: fr })}`);
  }, [selectedDate]);

  const loadMenuItems = async () => {
    if (!restaurantId) return;
    try {
      setIsLoading(true);
      // Charger tous les plats du restaurant
      const items = await menuService.menuItems.getMyMenuItems();
      setMenuItems(items);

      // Grouper par catégorie et expandre toutes les catégories
      const categories = new Set(items.map((item: MenuItem) => item.category_name || 'Autres'));
      setExpandedCategories(categories);
    } catch (error) {
      console.error('Erreur lors du chargement des plats:', error);
      pushAlert('error', 'Erreur', 'Impossible de charger les plats du menu');
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
        specialPrice: undefined,
        specialNote: '',
        isAvailable: true,
      });
    }

    setSelectedItems(newSelected);
  };

  const updateItemSpecialPrice = (itemId: string, price: string) => {
    const newSelected = new Map(selectedItems);
    const item = newSelected.get(itemId);
    if (item) {
      item.specialPrice = price ? parseFloat(price) : undefined;
      newSelected.set(itemId, item);
      setSelectedItems(newSelected);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      pushAlert('error', 'Erreur', 'Le titre du menu est requis');
      return;
    }

    if (selectedItems.size === 0) {
      pushAlert('error', 'Erreur', 'Veuillez sélectionner au moins un plat');
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
        special_price: specialPrice ? parseFloat(specialPrice) : undefined,
        items: Array.from(selectedItems.values()).map(item => ({
          menu_item: item.menuItemId,
          special_price: item.specialPrice,
          special_note: item.specialNote,
          is_available: item.isAvailable,
          display_order: 0,
        })),
      };

      await dailyMenuService.createDailyMenu(menuData);

      // Succès : afficher l'alerte puis revenir en arrière au dismiss
      pushAlert('success', 'Succès', 'Le menu du jour a été créé avec succès', () => router.back());
    } catch (error: any) {
      console.error('Erreur lors de la création du menu:', error);
      pushAlert(
        'error',
        'Erreur',
        error?.response?.data?.message || 'Impossible de créer le menu du jour'
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
    const selectedItem = selectedItems.get(itemId);

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.menuItem, isSelected && styles.menuItemSelected]}
        onPress={() => toggleItemSelection(item)}
      >
        <View style={styles.menuItemHeader}>
          <View style={styles.menuItemCheckbox}>
            {isSelected && (
              <Ionicons name="checkmark" size={16} color={COLORS.variants.secondary[600]} />
            )}
          </View>
          <View style={styles.menuItemInfo}>
            <Text style={styles.menuItemName}>{item.name}</Text>
            {item.description && (
              <Text style={styles.menuItemDescription} numberOfLines={1}>
                {item.description}
              </Text>
            )}
            <Text style={styles.menuItemPrice}>Prix normal : {item.price}€</Text>
          </View>
        </View>

        {isSelected && (
          <View style={styles.menuItemOptions}>
            <View style={styles.specialPriceContainer}>
              <Text style={styles.optionLabel}>Prix spécial (optionnel) :</Text>
              <TextInput
                style={styles.priceInput}
                value={selectedItem?.specialPrice?.toString() || ''}
                onChangeText={(text) => updateItemSpecialPrice(itemId, text)}
                keyboardType="numeric"
                placeholder={String(item.price)}
                placeholderTextColor={COLORS.text.light}
              />
              <Text style={styles.currency}>€</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.variants.secondary[500]} />
        <Text style={styles.loadingText}>Chargement des plats...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Créer un Menu du Jour"
        showBackButton
      />

      {/* Zone d'alertes (en haut de page) */}
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
          <Text style={styles.sectionTitle}>Informations générales</Text>

          <Input
            label="Titre du menu"
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Menu du jour"
            leftIcon="restaurant"
          />

          <Input
            label="Description (optionnel)"
            value={description}
            onChangeText={setDescription}
            placeholder="Ex: Entrée + Plat + Dessert"
            multiline
            numberOfLines={3}
            leftIcon="document-text"
          />

          <Input
            label="Prix du menu complet (optionnel)"
            value={specialPrice}
            onChangeText={setSpecialPrice}
            keyboardType="numeric"
            placeholder="Ex: 19.90"
            leftIcon="pricetag"
          />
        </Card>

        <Card variant="surface" style={styles.selectionCard}>
          <Text style={styles.sectionTitle}>Sélection des plats</Text>
          <Text style={styles.selectionSubtitle}>
            {selectedItems.size} plat{selectedItems.size > 1 ? 's' : ''} sélectionné{selectedItems.size > 1 ? 's' : ''}
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
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={COLORS.text.secondary}
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
        <LinearGradient
          colors={[COLORS.surface, COLORS.goldenSurface]}
          style={styles.footerGradient}
        >
          <Button
            title={isSaving ? "Création en cours..." : "Créer le menu du jour"}
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving || selectedItems.size === 0}
            variant="primary"
            fullWidth
            leftIcon={<Ionicons name="checkmark-circle" size={20} color={COLORS.surface} />}
          />
        </LinearGradient>
      </View>
    </View>
  );
}

const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', responsive: any, insets: any) => {
  const responsiveStyles = createResponsiveStyles(screenType);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    // Conteneur des alertes custom (marge sous le Header)
    alertsContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingTop: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: 100 + insets.bottom, // Ajouter la safe area bottom
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },
    formCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    selectionCard: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    selectionSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    categorySection: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: COLORS.border.light,
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
      padding: getResponsiveValue(SPACING.sm, screenType),
    },
    menuItem: {
      backgroundColor: COLORS.surface,
      padding: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    menuItemSelected: {
      borderColor: COLORS.variants.secondary[400],
      backgroundColor: COLORS.goldenSurface,
      ...SHADOWS.goldenGlow,
    },
    menuItemHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    menuItemCheckbox: {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 2,
      borderColor: COLORS.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.surface,
    },
    menuItemInfo: {
      flex: 1,
    },
    menuItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.primary,
      marginBottom: 2,
    },
    menuItemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginBottom: 4,
    },
    menuItemPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    menuItemOptions: {
      marginTop: getResponsiveValue(SPACING.md, screenType),
      paddingTop: getResponsiveValue(SPACING.md, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    specialPriceContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    optionLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    priceInput: {
      flex: 1,
      height: 36,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.primary,
      backgroundColor: COLORS.surface,
    },
    currency: {
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: COLORS.surface,
      ...SHADOWS.lg,
    },
    footerGradient: {
      padding: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: getResponsiveValue(SPACING.xl, screenType) + insets.bottom, // Ajouter la safe area bottom
    },
  });
};