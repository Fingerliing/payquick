import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Alert, AlertWithAction, useAlert } from '@/components/ui/Alert';

// Services & Types
import { menuService } from '@/services/menuService';
import { categoryService } from '@/services/categoryService';
import { Menu, MenuItem } from '@/types/menu';
import { MenuCategory } from '@/types/category';

// Design System & Responsive
import { useResponsive } from '@/utils/responsive';
import {
  COLORS,
  BORDER_RADIUS,
  SHADOWS,
} from '@/utils/designSystem';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convertit une couleur hex en variante pastel (rgba avec alpha faible).
 * Fallback sur le doré du brand si la couleur est invalide.
 */
function pastelize(hex: string | undefined | null, opacity = 0.18): string {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) {
    return `rgba(212, 175, 55, ${opacity})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(212, 175, 55, ${opacity})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Emoji par défaut basé sur le nom de la catégorie si aucun emoji n'est défini */
function inferCategoryEmoji(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('entrée') || n.includes('entree') || n.includes('starter')) return '🥗';
  if (n.includes('dessert') || n.includes('sweet')) return '🍰';
  if (n.includes('boisson') || n.includes('drink') || n.includes('cocktail')) return '🍷';
  if (n.includes('vin') || n.includes('wine')) return '🍷';
  if (n.includes('café') || n.includes('cafe') || n.includes('coffee')) return '☕';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('burger')) return '🍔';
  if (n.includes('pasta') || n.includes('pâte') || n.includes('pate')) return '🍝';
  if (n.includes('viande') || n.includes('meat')) return '🥩';
  if (n.includes('poisson') || n.includes('fish')) return '🐟';
  if (n.includes('plat') || n.includes('main')) return '🍽️';
  return '🍴';
}

/** Catégorie « virtuelle » pour les plats sans catégorie associée */
const UNCATEGORIZED_ID = '__uncategorized__';

// ────────────────────────────────────────────────────────────────────────────
// DishCard — vignette d'un plat (image ou emoji+pastel + badges overlay)
// ────────────────────────────────────────────────────────────────────────────

interface DishCardProps {
  item: MenuItem;
  category?: MenuCategory;
  isToggling: boolean;
  isDeleting: boolean;
  onPress: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

const DishCard: React.FC<DishCardProps> = ({
  item,
  category,
  isToggling,
  isDeleting,
  onPress,
  onToggle,
  onDelete,
}) => {
  const emoji = category?.icon || inferCategoryEmoji(category?.name || '');
  const pastel = pastelize(category?.color, 0.22);
  const accent = category?.color || COLORS.secondary;

  const allergenCount = item.allergens?.length || 0;
  const dietaryTags: { label: string; color: string }[] = [];
  if (item.is_vegan) dietaryTags.push({ label: 'VG', color: '#16A34A' });
  else if (item.is_vegetarian) dietaryTags.push({ label: 'V', color: '#22C55E' });
  if (item.is_gluten_free) dietaryTags.push({ label: 'GF', color: '#F59E0B' });

  const priceFormatted = `${parseFloat(String(item.price || 0)).toFixed(2).replace('.', ',')} €`;

  return (
    <View style={styles.dishCard}>
      {/* Vignette (image ou emoji) */}
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.thumbWrapper}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={[styles.thumb, { backgroundColor: pastel }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbEmoji, { backgroundColor: pastel }]}>
            <Text style={styles.thumbEmojiText}>{emoji}</Text>
          </View>
        )}

        {/* Overlay : badge prix (haut droite) */}
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{priceFormatted}</Text>
        </View>

        {/* Overlay : badge allergènes (haut gauche) */}
        {allergenCount > 0 && (
          <View style={styles.allergenBadge}>
            <Ionicons name="warning" size={12} color="#92400E" />
            <Text style={styles.allergenBadgeText}>{allergenCount}</Text>
          </View>
        )}

        {/* Overlay : tags régime (bas gauche) */}
        {dietaryTags.length > 0 && (
          <View style={styles.dietaryRow}>
            {dietaryTags.map((tag) => (
              <View
                key={tag.label}
                style={[styles.dietaryTag, { backgroundColor: tag.color }]}
              >
                <Text style={styles.dietaryTagText}>{tag.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Overlay : indisponible (filtre gris) */}
        {!item.is_available && (
          <View style={styles.unavailableOverlay}>
            <View style={styles.unavailableBadge}>
              <Ionicons name="eye-off" size={12} color="#FFFFFF" />
              <Text style={styles.unavailableText}>Masqué</Text>
            </View>
          </View>
        )}

        {/* Bouton supprimer (apparaît au-dessus de l'image, discret) */}
        <TouchableOpacity
          style={styles.deleteIconBtn}
          onPress={onDelete}
          disabled={isDeleting}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={14} color={COLORS.error} />
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Bloc infos sous la vignette */}
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.dishInfo}>
        <View style={styles.dishNameRow}>
          <Text style={styles.dishName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.dishPrice, { color: accent }]} numberOfLines={1}>
            {priceFormatted}
          </Text>
        </View>

        {/* Toggle disponibilité */}
        <View style={styles.toggleRow}>
          <Switch
            value={!!item.is_available}
            onValueChange={onToggle}
            disabled={isToggling}
            trackColor={{ false: '#E5E7EB', true: '#10B981' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E5E7EB"
          />
          <Text
            style={[
              styles.toggleLabel,
              { color: item.is_available ? COLORS.text.primary : COLORS.text.secondary },
            ]}
          >
            {item.is_available ? 'Disponible' : 'Indisponible'}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Sidebar des catégories (desktop/tablette)
// ────────────────────────────────────────────────────────────────────────────

interface CategorySidebarProps {
  categories: { id: string; name: string; count: number; color?: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const CategorySidebar: React.FC<CategorySidebarProps> = ({ categories, selectedId, onSelect }) => {
  return (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarTitle}>CATÉGORIES</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {categories.map((cat) => {
          const isActive = cat.id === selectedId;
          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.7}
              onPress={() => onSelect(cat.id)}
              style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
            >
              {isActive && <View style={styles.sidebarActiveBar} />}
              <Text style={[styles.sidebarItemText, isActive && styles.sidebarItemTextActive]} numberOfLines={1}>
                {cat.name}
              </Text>
              {cat.count > 0 && (
                <View style={[styles.sidebarBadge, isActive && styles.sidebarBadgeActive]}>
                  <Text style={[styles.sidebarBadgeText, isActive && styles.sidebarBadgeTextActive]}>
                    {cat.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// Onglets horizontaux des catégories (mobile)
// ────────────────────────────────────────────────────────────────────────────

interface CategoryTabsProps {
  categories: { id: string; name: string; count: number; color?: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const CategoryTabs: React.FC<CategoryTabsProps> = ({ categories, selectedId, onSelect }) => {
  return (
    <View style={styles.tabsContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
      >
        {categories.map((cat) => {
          const isActive = cat.id === selectedId;
          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.7}
              onPress={() => onSelect(cat.id)}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
            >
              <Text style={[styles.tabItemText, isActive && styles.tabItemTextActive]}>
                {cat.name}
              </Text>
              {cat.count > 0 && (
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                    {cat.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MenuDetailScreen — composant principal
// ────────────────────────────────────────────────────────────────────────────

export default function MenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const responsive = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { alertState, showSuccess, showError, hideAlert } = useAlert();

  const [menu, setMenu] = useState<Menu | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MenuItem | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // ── Chargement ─────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadInitialData();
    }, [id])
  );

  const loadInitialData = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const menuData = await menuService.getMenu(parseInt(id));
      setMenu(menuData);

      if (menuData.restaurant) {
        const categoriesData = await categoryService.getCategoriesByRestaurant(
          String(menuData.restaurant)
        );
        setCategories(categoriesData.categories || []);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      showError('Impossible de charger le menu', 'Erreur');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  // ── Données dérivées ───────────────────────────────────────────────────────

  /** Index id → MenuCategory pour lookup rapide */
  const categoriesById = useMemo(() => {
    const map = new Map<string, MenuCategory>();
    categories.forEach((cat) => map.set(cat.id, cat));
    return map;
  }, [categories]);

  /** Items groupés par catégorie (catégories vides incluses) */
  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    categories.forEach((cat) => map.set(cat.id, []));

    if (menu?.items) {
      menu.items.forEach((item) => {
        const catId = item.category && categoriesById.has(String(item.category))
          ? String(item.category)
          : UNCATEGORIZED_ID;
        if (!map.has(catId)) map.set(catId, []);
        map.get(catId)!.push(item);
      });
    }
    return map;
  }, [menu, categories, categoriesById]);

  /** Liste des onglets affichables (catégories + uncategorized si besoin) */
  const tabs = useMemo(() => {
    const list: { id: string; name: string; count: number; color?: string }[] = categories
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        count: itemsByCategory.get(cat.id)?.length || 0,
        color: cat.color,
      }));

    const uncategorized = itemsByCategory.get(UNCATEGORIZED_ID) || [];
    if (uncategorized.length > 0) {
      list.push({
        id: UNCATEGORIZED_ID,
        name: 'Sans catégorie',
        count: uncategorized.length,
      });
    }
    return list;
  }, [categories, itemsByCategory]);

  /** Sélection auto de la première catégorie disponible */
  useEffect(() => {
    if (!selectedCategoryId && tabs.length > 0) {
      const firstWithItems = tabs.find((t) => t.count > 0) || tabs[0];
      setSelectedCategoryId(firstWithItems.id);
    } else if (selectedCategoryId && !tabs.find((t) => t.id === selectedCategoryId)) {
      // La catégorie sélectionnée a disparu (ex: toutes les items supprimés et catégorie vide retirée)
      setSelectedCategoryId(tabs[0]?.id || null);
    }
  }, [tabs, selectedCategoryId]);

  const currentItems = selectedCategoryId ? itemsByCategory.get(selectedCategoryId) || [] : [];
  const currentCategory =
    selectedCategoryId && selectedCategoryId !== UNCATEGORIZED_ID
      ? categoriesById.get(selectedCategoryId)
      : undefined;

  const totalItems = menu?.items?.length || 0;
  const availableCount = menu?.items?.filter((i) => i.is_available).length || 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleItemAvailability = async (item: MenuItem) => {
    if (togglingItemId) return;
    setTogglingItemId(item.id);
    try {
      const updated = await menuService.menuItems.toggleItemAvailability(item.id);
      setMenu((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === item.id ? { ...i, is_available: updated.is_available } : i
          ),
        };
      });
      showSuccess(
        `Plat ${updated.is_available ? 'activé' : 'désactivé'} avec succès`,
        'Succès'
      );
    } catch (error) {
      console.error('Toggle item error:', error);
      showError('Impossible de modifier le statut du plat', 'Erreur');
    } finally {
      setTogglingItemId(null);
    }
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    setDeletingItemId(itemToDelete.id);
    const itemName = itemToDelete.name;
    try {
      await menuService.menuItems.deleteMenuItem(itemToDelete.id);
      setMenu((prev) => {
        if (!prev) return null;
        return { ...prev, items: prev.items.filter((i) => i.id !== itemToDelete.id) };
      });
      setItemToDelete(null);
      showSuccess(`Le plat "${itemName}" a été supprimé`, 'Succès');
    } catch (error) {
      console.error('Delete item error:', error);
      showError('Impossible de supprimer le plat', 'Erreur');
    } finally {
      setDeletingItemId(null);
    }
  };

  const navigateToAdd = () => {
    if (!menu) return;
    const categoryParam =
      selectedCategoryId && selectedCategoryId !== UNCATEGORIZED_ID
        ? `&categoryId=${selectedCategoryId}`
        : '';
    router.push(
      `/menu/item/add?menuId=${menu.id}&restaurantId=${menu.restaurant}${categoryParam}` as any
    );
  };

  const navigateToEdit = (item: MenuItem) => {
    router.push(`/menu/item/edit/${item.id}` as any);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  /** Calcule le nombre de colonnes selon la largeur disponible pour la grille */
  const numColumns = useMemo(() => {
    if (responsive.isDesktop) return 3;
    if (responsive.isTablet) return responsive.isLandscape ? 3 : 2;
    return windowWidth >= 480 ? 2 : 1;
  }, [responsive.isDesktop, responsive.isTablet, responsive.isLandscape, windowWidth]);

  const renderGrid = () => {
    if (currentItems.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="restaurant-outline" size={48} color={COLORS.text.light} />
          </View>
          <Text style={styles.emptyTitle}>
            {totalItems === 0 ? 'Aucun plat dans ce menu' : 'Aucun plat dans cette catégorie'}
          </Text>
          <Text style={styles.emptyText}>
            {totalItems === 0
              ? 'Ajoutez votre premier plat pour commencer.'
              : 'Ajoutez un plat à cette catégorie ou sélectionnez-en une autre.'}
          </Text>
          <Button
            title="Ajouter un plat"
            onPress={navigateToAdd}
            variant="primary"
            leftIcon={<Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />}
          />
        </View>
      );
    }

    return (
      <View style={styles.grid}>
        {currentItems.map((item) => {
          const cat =
            item.category && categoriesById.has(String(item.category))
              ? categoriesById.get(String(item.category))
              : currentCategory;
          return (
            <View
              key={item.id}
              style={[styles.gridItem, { width: `${100 / numColumns}%` }]}
            >
              <DishCard
                item={item}
                category={cat}
                isToggling={togglingItemId === item.id}
                isDeleting={deletingItemId === item.id}
                onPress={() => navigateToEdit(item)}
                onToggle={() => handleToggleItemAvailability(item)}
                onDelete={() => setItemToDelete(item)}
              />
            </View>
          );
        })}
      </View>
    );
  };

  // ── Loading & not-found ────────────────────────────────────────────────────

  if (isLoading) {
    return <Loading fullScreen text="Chargement de la carte..." />;
  }

  if (!menu) {
    return (
      <View style={styles.container}>
        <Header
          title="Carte du restaurant"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
          includeSafeArea
        />
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={64} color={COLORS.text.light} />
          <Text style={styles.emptyTitle}>Menu introuvable</Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="outline"
            leftIcon={<Ionicons name="arrow-back" size={20} color={COLORS.primary} />}
          />
        </View>
      </View>
    );
  }

  // ── Render principal ───────────────────────────────────────────────────────

  const useSidebar = responsive.isDesktop || responsive.isTablet;

  return (
    <View style={styles.container}>
      <Header
        title="Carte du restaurant"
        subtitle={`${menu.name} · ${availableCount}/${totalItems} disponibles`}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="add-circle"
        onRightPress={navigateToAdd}
        includeSafeArea
      />

      {/* Bandeau "Ajouter un plat" — visible uniquement sur desktop/tablet (sinon icône header suffit) */}
      {useSidebar && (
        <View style={styles.actionBar}>
          <View style={styles.actionBarSpacer} />
          <Button
            title="+ Ajouter un plat"
            onPress={navigateToAdd}
            variant="primary"
            size="sm"
          />
        </View>
      )}

      {/* Onglets horizontaux (mobile uniquement) */}
      {!useSidebar && tabs.length > 0 && (
        <CategoryTabs
          categories={tabs}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      )}

      {/* Body : sidebar + grille (desktop/tablet) ou grille seule (mobile) */}
      <View style={[styles.body, useSidebar ? styles.bodyRow : styles.bodyColumn]}>
        {useSidebar && tabs.length > 0 && (
          <CategorySidebar
            categories={tabs}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
          />
        )}

        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={[
            styles.gridScrollContent,
            { paddingBottom: Math.max(insets.bottom + 24, 40) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Titre catégorie courante (mobile : déjà dans les tabs ; desktop : utile en plus) */}
          {useSidebar && currentCategory && (
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryHeaderTitle}>
                {currentCategory.icon || inferCategoryEmoji(currentCategory.name)}{' '}
                {currentCategory.name}
              </Text>
              <Text style={styles.categoryHeaderCount}>
                {currentItems.length} plat{currentItems.length > 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {renderGrid()}
        </ScrollView>
      </View>

      {/* Modal de confirmation suppression */}
      {itemToDelete && (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setItemToDelete(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <AlertWithAction
                variant="warning"
                title="Supprimer le plat"
                message={`Êtes-vous sûr de vouloir supprimer "${itemToDelete.name}" ?\n\nCette action est irréversible.`}
                showIcon
                primaryButton={{
                  text: 'Supprimer',
                  onPress: confirmDeleteItem,
                  variant: 'danger',
                }}
                secondaryButton={{
                  text: 'Annuler',
                  onPress: () => setItemToDelete(null),
                }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Toast d'alerte (success / error) — épinglé en haut, sous le notch */}
      {alertState && (
        <View
          pointerEvents="box-none"
          style={[styles.toastContainer, { top: insets.top + 8 }]}
        >
          <View style={styles.toastInner}>
            <Alert
              variant={alertState.variant || 'info'}
              title={alertState.title}
              message={alertState.message}
              onDismiss={hideAlert}
              autoDismiss
              autoDismissDuration={4000}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 220;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Action bar (bouton "Ajouter un plat" sur desktop/tablet)
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    backgroundColor: COLORS.surface,
  },
  actionBarSpacer: {
    flex: 1,
  },

  // Body (layout sidebar+grid ou colonne)
  body: {
    flex: 1,
  },
  bodyRow: {
    flexDirection: 'row',
  },
  bodyColumn: {
    flexDirection: 'column',
  },

  // Sidebar (desktop/tablet)
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.border.light,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sidebarTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text.light,
    letterSpacing: 1.2,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
    position: 'relative',
  },
  sidebarItemActive: {
    backgroundColor: COLORS.variants.primary[50],
  },
  sidebarActiveBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    backgroundColor: COLORS.secondary,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  sidebarItemText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text.primary,
    fontWeight: '500',
  },
  sidebarItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  sidebarBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: COLORS.variants.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarBadgeActive: {
    backgroundColor: COLORS.secondary,
  },
  sidebarBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text.secondary,
  },
  sidebarBadgeTextActive: {
    color: '#FFFFFF',
  },

  // Onglets horizontaux (mobile)
  tabsContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  tabItemActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },
  tabItemTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: COLORS.variants.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: COLORS.secondary,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text.secondary,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },

  // Zone droite (grille de plats)
  gridScroll: {
    flex: 1,
  },
  gridScrollContent: {
    padding: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  categoryHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: -0.3,
  },
  categoryHeaderCount: {
    fontSize: 13,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridItem: {
    paddingHorizontal: 6,
    paddingBottom: 12,
  },

  // Card d'un plat
  dishCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border.light,
    ...SHADOWS.sm,
  },
  thumbWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1.2,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbEmoji: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbEmojiText: {
    fontSize: 56,
  },

  // Badges overlay sur l'image
  priceBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    ...SHADOWS.sm,
  },
  priceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  allergenBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  allergenBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
  },
  dietaryRow: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    gap: 4,
  },
  dietaryTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  dietaryTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  unavailableOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(31, 41, 55, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  unavailableText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteIconBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },

  // Bloc infos sous l'image
  dishInfo: {
    padding: 12,
    gap: 10,
  },
  dishNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  dishName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text.primary,
    lineHeight: 18,
  },
  dishPrice: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.variants.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
  },

  // Toast (positionné en haut, au-dessus de tout)
  toastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  toastInner: {
    width: '100%',
    maxWidth: 480,
  },
});