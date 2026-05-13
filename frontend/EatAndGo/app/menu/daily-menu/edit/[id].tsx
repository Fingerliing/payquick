import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// UI Components
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Header } from '@/components/ui/Header';
import { Alert as AppAlert } from '@/components/ui/Alert';

// Services & Types
import { dailyMenuService, DailyMenu, DailyMenuItem } from '@/services/dailyMenuService';

// Design System
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';

type AppAlertVariant = 'success' | 'error' | 'warning' | 'info';
type LocalAlert = {
  id: string;
  variant: AppAlertVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
};

export default function EditDailyMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const screenType = useScreenType();
  const responsive = useResponsive();
  const styles = createStyles(screenType, responsive);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [isActive, setIsActive] = useState(true);

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
    if (id) loadDailyMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadDailyMenu = async () => {
    try {
      setIsLoading(true);
      const menu = await dailyMenuService.getDailyMenu(id!);
      setDailyMenu(menu);
      setTitle(menu.title);
      setDescription(menu.description || '');
      setSpecialPrice(menu.special_price ? String(menu.special_price) : '');
      setIsActive(menu.is_active);
    } catch (error) {
      console.error('Erreur lors du chargement du menu:', error);
      pushAlert('error', 'Erreur', 'Impossible de charger le menu du jour', () => router.back());
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemAvailability = async (itemId: string) => {
    if (!id) return;
    try {
      await dailyMenuService.quickToggleItem(id, itemId);
      await loadDailyMenu();
    } catch {
      pushAlert('error', 'Erreur', 'Impossible de modifier la disponibilité');
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      pushAlert('error', 'Erreur', 'Le titre du menu est requis');
      return;
    }

    if (!specialPrice || parseFloat(specialPrice) <= 0) {
      pushAlert(
        'error',
        'Prix requis',
        'Le prix total du menu du jour doit être renseigné et strictement positif.'
      );
      return;
    }

    if (!id) return;

    try {
      setIsSaving(true);
      await dailyMenuService.updateDailyMenu(id, {
        title: title.trim(),
        description: description.trim() || undefined,
        special_price: parseFloat(specialPrice),
        is_active: isActive,
      });

      pushAlert('success', 'Succès', 'Le menu du jour a été mis à jour', () => router.back());
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour:', error);
      pushAlert(
        'error',
        'Erreur',
        error?.response?.data?.message ||
          error?.response?.data?.special_price?.[0] ||
          error?.response?.data?.detail ||
          'Impossible de mettre à jour le menu'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    pushAlert(
      'warning',
      'Confirmation',
      'Êtes-vous sûr de vouloir supprimer ce menu du jour ?',
      async () => {
        if (!id) return;
        try {
          await dailyMenuService.deleteDailyMenu(id);
          pushAlert('success', 'Supprimé', 'Menu supprimé avec succès', () => router.back());
        } catch {
          pushAlert('error', 'Erreur', 'Impossible de supprimer le menu');
        }
      }
    );
  };

  // Calcul aperçu formule
  const categoriesCount = dailyMenu?.items_by_category?.length ?? 0;
  const pricePerCategory =
    specialPrice && categoriesCount > 0
      ? (parseFloat(specialPrice) / categoriesCount).toFixed(2)
      : null;

  const renderMenuItem = (item: DailyMenuItem) => {
    return (
      <View key={item.id} style={styles.menuItem}>
        <View style={styles.menuItemHeader}>
          <Switch
            value={item.is_available}
            onValueChange={() => toggleItemAvailability(item.id)}
            trackColor={{
              false: COLORS.border.default,
              true: COLORS.variants.secondary[400],
            }}
            thumbColor={item.is_available ? COLORS.variants.secondary[500] : COLORS.text.light}
          />
          <View style={styles.menuItemInfo}>
            <Text
              style={[styles.menuItemName, !item.is_available && styles.menuItemDisabled]}
            >
              {item.menu_item_name}
            </Text>
            <Text style={styles.menuItemCategory}>{item.menu_item_category}</Text>
          </View>
        </View>
        {/* ⚠️ Plus de champ prix par plat — la formule fixe le prix global */}
      </View>
    );
  };

  if (isLoading) return <Loading fullScreen text="Chargement du menu..." />;

  if (!dailyMenu) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Menu introuvable</Text>
        <Button title="Retour" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Modifier le Menu du Jour"
        showBackButton
        rightIcon="trash"
        onRightPress={handleDelete}
      />

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
          <View style={styles.dateHeader}>
            <Ionicons name="calendar" size={20} color={COLORS.text.golden} />
            <Text style={styles.dateText}>
              {format(new Date(dailyMenu.date), 'EEEE dd MMMM yyyy', { locale: fr })}
            </Text>
          </View>

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
            label="Prix total du menu (€) *"
            value={specialPrice}
            onChangeText={setSpecialPrice}
            keyboardType="numeric"
            placeholder="Ex: 19.90"
            leftIcon="pricetag"
          />

          {!!pricePerCategory && categoriesCount > 0 && (
            <View style={styles.formulaPreview}>
              <Ionicons name="information-circle" size={16} color={COLORS.text.golden} />
              <Text style={styles.formulaPreviewText}>
                {categoriesCount > 1
                  ? `${categoriesCount} catégories • ${pricePerCategory}€ par plat`
                  : `1 plat à ${pricePerCategory}€`}
              </Text>
            </View>
          )}

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Menu actif</Text>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              trackColor={{
                false: COLORS.border.default,
                true: COLORS.variants.secondary[400],
              }}
              thumbColor={isActive ? COLORS.variants.secondary[500] : COLORS.text.light}
            />
          </View>
        </Card>

        <Card variant="surface" style={styles.itemsCard}>
          <Text style={styles.sectionTitle}>Plats du menu</Text>
          <Text style={styles.sectionSubtitle}>
            {dailyMenu.total_items_count} plats disponibles
          </Text>

          {dailyMenu.items_by_category.map(category => (
            <View key={category.name} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={styles.categoryTitle}>{category.name}</Text>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{category.items.length}</Text>
                </View>
              </View>

              <View style={styles.categoryItems}>
                {category.items.map(renderMenuItem)}
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          variant="primary"
          fullWidth
          leftIcon={<Ionicons name="save" size={20} color={COLORS.surface} />}
        />
      </View>
    </View>
  );
}

const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', _responsive: any) => {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
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
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
    },
    errorText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    formCard: { marginBottom: getResponsiveValue(SPACING.lg, screenType) },
    itemsCard: { marginBottom: getResponsiveValue(SPACING.lg, screenType) },
    dateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.goldenSurface,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    dateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    sectionSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    formulaPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.goldenSurface,
      padding: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
    formulaPreviewText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      flex: 1,
    },
    switchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
    },
    switchLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    categorySection: { marginTop: getResponsiveValue(SPACING.md, screenType) },
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    categoryIcon: { fontSize: 18 },
    categoryTitle: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    categoryBadge: {
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
    categoryItems: { paddingTop: getResponsiveValue(SPACING.sm, screenType) },
    menuItem: {
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    menuItemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    menuItemInfo: { flex: 1 },
    menuItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    menuItemDisabled: {
      color: COLORS.text.secondary,
      textDecorationLine: 'line-through',
    },
    menuItemCategory: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      marginTop: 2,
    },
    footer: {
      padding: getResponsiveValue(SPACING.container, screenType),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
  });
};