import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/**
 * Plat ajoutable, tel que renvoyé par l'endpoint `available_items` du menu du jour.
 * Forme distincte de `MenuItem` global : ne contient que les champs utiles au
 * sélecteur d'ajout.
 */
type AvailableMenuItem = {
  id: number;
  name: string;
  description: string;
  price: number | null;
  is_available: boolean;
  category: string | null;
  category_name: string;
  category_icon: string | null;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  allergens: string[];
  image_url: string | null;
};

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
  const insets = useSafeAreaInsets();
  const styles = createStyles(screenType, responsive, insets);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Ajout / suppression d'items
  const [availableItems, setAvailableItems] = useState<AvailableMenuItem[]>([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState<number | null>(null); // ID en cours d'ajout
  const [isRemovingItem, setIsRemovingItem] = useState<string | null>(null); // ID en cours de suppression

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
    if (id) {
      loadDailyMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // On ne charge les plats disponibles qu'au moment où le restaurateur ouvre
  // le modal d'ajout, pour éviter une requête inutile au chargement de l'écran.
  useEffect(() => {
    if (isAddModalOpen && id) {
      loadAvailableItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen, id]);

  const loadDailyMenu = async () => {
    try {
      setIsLoading(true);
      const menu = await dailyMenuService.getDailyMenu(id!);
      setDailyMenu(menu);
      setTitle(menu.title);
      setDescription(menu.description || '');
      setSpecialPrice(menu.special_price ? String(menu.special_price) : '');
      setIsActive(menu.is_active);
    } catch {
      pushAlert('error', 'Erreur', 'Impossible de charger le menu du jour', () => router.back());
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableItems = async () => {
    if (!id) return;
    try {
      setIsLoadingAvailable(true);
      const result = await dailyMenuService.getAvailableItemsForDailyMenu(id);
      // Log temporaire pour diagnostiquer un modal vide. À retirer une fois confirmé.
      // eslint-disable-next-line no-console
      console.log('[AVAILABLE_ITEMS]', {
        count: result?.count,
        itemsLength: Array.isArray(result?.items) ? result.items.length : 'not-array',
        firstItem: Array.isArray(result?.items) ? result.items[0] : null,
      });
      setAvailableItems(Array.isArray(result?.items) ? result.items : []);
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.warn('[AVAILABLE_ITEMS] error', error?.response?.status, error?.message);
      pushAlert(
        'error',
        'Erreur',
        `Impossible de charger la liste de vos plats${
          error?.response?.status ? ` (${error.response.status})` : ''
        }.`
      );
      setAvailableItems([]);
    } finally {
      setIsLoadingAvailable(false);
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

  const handleAddItem = async (menuItem: AvailableMenuItem) => {
    if (!id) return;
    const menuItemId = menuItem.id;
    if (!Number.isFinite(menuItemId)) {
      pushAlert('error', 'Erreur', 'Identifiant de plat invalide');
      return;
    }

    setIsAddingItem(menuItemId);
    try {
      await dailyMenuService.addItemToDailyMenu(id, menuItemId);
      // Recharger en parallèle le menu (pour mettre à jour l'affichage des
      // plats déjà présents) et la liste d'ajout (pour retirer le plat fraîchement
      // ajouté du sélecteur sans avoir à fermer/rouvrir le modal).
      await Promise.all([loadDailyMenu(), loadAvailableItems()]);
      pushAlert('success', 'Ajouté', `« ${menuItem.name} » a été ajouté au menu du jour`);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 409) {
        pushAlert('warning', 'Déjà présent', 'Ce plat fait déjà partie du menu du jour');
        // Recharger l'état pour resynchroniser
        await loadAvailableItems();
      } else {
        pushAlert(
          'error',
          'Erreur',
          error?.response?.data?.error || 'Impossible d\'ajouter ce plat'
        );
      }
    } finally {
      setIsAddingItem(null);
    }
  };

  const handleRemoveItem = (item: DailyMenuItem) => {
    pushAlert(
      'warning',
      'Retirer ce plat ?',
      `« ${item.menu_item_name} » sera retiré du menu du jour.`,
      async () => {
        if (!id) return;
        setIsRemovingItem(item.id);
        try {
          await dailyMenuService.removeItemFromDailyMenu(id, item.id);
          await loadDailyMenu();
          pushAlert('success', 'Retiré', `« ${item.menu_item_name} » a été retiré`);
        } catch {
          pushAlert('error', 'Erreur', 'Impossible de retirer ce plat');
        } finally {
          setIsRemovingItem(null);
        }
      }
    );
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

  // Groupage par catégorie pour le modal d'ajout.
  // `availableItems` est déjà filtré côté serveur (plats du restaurant non
  // encore présents dans le menu du jour), pas besoin de retraiter ici.
  const availableByCategory = useMemo(() => {
    const map = new Map<string, AvailableMenuItem[]>();
    availableItems.forEach(item => {
      const cat = item.category_name || 'Autres';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    });
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [availableItems]);

  const renderMenuItem = (item: DailyMenuItem) => {
    const removing = isRemovingItem === item.id;
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

          <TouchableOpacity
            onPress={() => handleRemoveItem(item)}
            disabled={removing}
            style={styles.removeButton}
            hitSlop={8}
            accessibilityLabel={`Retirer ${item.menu_item_name} du menu`}
          >
            {removing ? (
              <ActivityIndicator size="small" color={COLORS.error} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={COLORS.error} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderAddModal = () => (
    <Modal
      visible={isAddModalOpen}
      transparent
      animationType="slide"
      onRequestClose={() => setIsAddModalOpen(false)}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={() => setIsAddModalOpen(false)}
      >
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalGrabHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ajouter un plat</Text>
            <TouchableOpacity
              onPress={() => setIsAddModalOpen(false)}
              hitSlop={8}
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={24} color={COLORS.text.primary} />
            </TouchableOpacity>
          </View>

          {isLoadingAvailable ? (
            <View style={styles.modalEmpty}>
              <ActivityIndicator size="large" color={COLORS.variants.secondary[500]} />
              <Text style={styles.modalEmptyText}>Chargement des plats…</Text>
            </View>
          ) : availableByCategory.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Ionicons name="restaurant-outline" size={40} color={COLORS.text.light} />
              <Text style={styles.modalEmptyText}>
                Aucun plat ajoutable.
              </Text>
              <Text style={styles.modalEmptyHint}>
                Soit tous les plats de votre carte sont déjà dans ce menu du jour, soit
                vous n'avez pas encore créé de plats. Ajoutez d'abord des plats à votre
                menu pour pouvoir les sélectionner ici.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator
            >
              {availableByCategory.map(group => (
                <View key={group.name} style={styles.modalCategorySection}>
                  <Text style={styles.modalCategoryTitle}>{group.name}</Text>
                  {group.items.map(item => {
                    const adding = isAddingItem === item.id;
                    return (
                      <TouchableOpacity
                        key={String(item.id)}
                        style={styles.modalItem}
                        onPress={() => handleAddItem(item)}
                        disabled={isAddingItem !== null}
                        activeOpacity={0.7}
                      >
                        <View style={styles.modalItemInfo}>
                          <Text style={styles.modalItemName}>{item.name}</Text>
                          {!!item.description && (
                            <Text style={styles.modalItemDescription} numberOfLines={1}>
                              {item.description}
                            </Text>
                          )}
                        </View>
                        {adding ? (
                          <ActivityIndicator size="small" color={COLORS.variants.secondary[500]} />
                        ) : (
                          <Ionicons
                            name="add-circle"
                            size={26}
                            color={COLORS.variants.secondary[500]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

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
          <View style={styles.itemsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Plats du menu</Text>
              <Text style={styles.sectionSubtitle}>
                {dailyMenu.total_items_count} plat{dailyMenu.total_items_count > 1 ? 's' : ''} disponible{dailyMenu.total_items_count > 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsAddModalOpen(true)}
              style={styles.addItemButton}
              accessibilityLabel="Ajouter un plat"
            >
              <Ionicons name="add" size={18} color={COLORS.surface} />
              <Text style={styles.addItemButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>

          {dailyMenu.items_by_category.length === 0 ? (
            <View style={styles.emptyItems}>
              <Ionicons name="restaurant-outline" size={32} color={COLORS.text.light} />
              <Text style={styles.emptyItemsText}>
                Aucun plat dans ce menu du jour. Utilisez le bouton « Ajouter » pour en mettre.
              </Text>
            </View>
          ) : (
            dailyMenu.items_by_category.map(category => (
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
            ))
          )}
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

      {renderAddModal()}
    </View>
  );
}

const createStyles = (
  screenType: 'mobile' | 'tablet' | 'desktop',
  _responsive: any,
  insets: any
) => {
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
    itemsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    sectionSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
    addItemButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: COLORS.variants.secondary[500],
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
    },
    addItemButtonText: {
      color: COLORS.surface,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    emptyItems: {
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.xl, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    emptyItemsText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
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
    removeButton: {
      padding: 8,
      borderRadius: BORDER_RADIUS.sm,
    },
    footer: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: Math.max(insets?.bottom ?? 0, 16),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },

    // ─── Modal d'ajout ─────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      // Hauteur fixe : sans ça, sur certains devices RN, le bottom-sheet se
      // collapse à la hauteur de son seul contenu fixe (le header), donnant un
      // modal "fond blanc vide". On force une hauteur de 75% pour garantir que
      // la ScrollView interne ait toujours de l'espace pour s'étendre via flex:1.
      height: '75%',
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      paddingBottom: Math.max(insets?.bottom ?? 0, 16),
    },
    modalGrabHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: COLORS.border.default,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    modalTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
    },
    modalScroll: { flex: 1 },
    modalScrollContent: {
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
    },
    modalEmpty: {
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.xl, screenType) * 2,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    modalEmptyText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
    },
    modalEmptyHint: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.light,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: -8,
    },
    modalCategorySection: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    modalCategoryTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.secondary,
      textTransform: 'uppercase',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    modalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      gap: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.background,
      marginBottom: 6,
    },
    modalItemInfo: { flex: 1 },
    modalItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    modalItemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      marginTop: 2,
    },
  });
};