import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  Switch,
  Modal,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { menuTranslationService } from '@/services/menuTranslationService';
import {
  MENU_LANGUAGES,
  getMenuLanguage,
  collectAvailableLanguages,
  type MenuLanguage,
} from '@/utils/menuLocale';
import { Menu, MenuItem } from '@/types/menu';
import { MenuCategory } from '@/types/category';

// Design System & Responsive
import { useResponsive } from '@/utils/responsive';
import {
  useAppTheme,
  type AppColors,
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
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const emoji = category?.icon || inferCategoryEmoji(category?.name || '');
  const pastel = pastelize(category?.color, 0.22);
  const accent = category?.color || colors.secondary;

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
              <Text style={styles.unavailableText}>{t('menuDetail.hidden')}</Text>
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
          <Ionicons name="trash-outline" size={14} color={colors.error} />
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
              { color: item.is_available ? colors.text.primary : colors.text.secondary },
            ]}
          >
            {item.is_available ? t('menuDetail.available') : t('menuDetail.unavailable')}
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
  onReorderPress?: () => void;
}

const CategorySidebar: React.FC<CategorySidebarProps> = ({ categories, selectedId, onSelect, onReorderPress }) => {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>{t('menuDetail.categoriesHeader')}</Text>
        {!!onReorderPress && categories.length > 1 && (
          <TouchableOpacity
            onPress={onReorderPress}
            style={styles.sidebarReorderButton}
            hitSlop={8}
            accessibilityLabel={t('menuDetail.reorderCategories')}
          >
            <Ionicons name="swap-vertical" size={16} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
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
  onReorderPress?: () => void;
}

const CategoryTabs: React.FC<CategoryTabsProps> = ({ categories, selectedId, onSelect, onReorderPress }) => {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.tabsContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContent}
        style={{ flex: 1 }}
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
      {!!onReorderPress && categories.length > 1 && (
        <TouchableOpacity
          onPress={onReorderPress}
          style={styles.tabsReorderButton}
          hitSlop={6}
          accessibilityLabel={t('menuDetail.reorderCategories')}
        >
          <Ionicons name="swap-vertical" size={20} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MenuDetailScreen — composant principal
// ────────────────────────────────────────────────────────────────────────────

export default function MenuDetailScreen() {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  // ── Traduction automatique du menu (IA) ────────────────────────────────────
  const [translating, setTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);
  const translationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Aperçu multilingue (lecture seule, comme le client) ────────────────────
  const [previewLang, setPreviewLang] = useState<string>('fr');
  const [showPreviewPicker, setShowPreviewPicker] = useState(false);
  const [availableLanguages, setAvailableLanguages] =
    useState<MenuLanguage[]>(MENU_LANGUAGES.slice(0, 1));

  // ── Sélection des langues à traduire (popup avant lancement) ───────────────
  const [showLangSelector, setShowLangSelector] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en', 'es', 'de', 'it']);

  // ── Chargement ─────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadInitialData();
    }, [id, previewLang])
  );

  const loadInitialData = async () => {
    if (!id) return;
    try {
      setIsLoading(true);

      // ── Étape 1 : le menu ───────────────────────────────────────────────
      // `Menu.id` est un entier auto-incrémenté côté backend -> parseInt OK.
      const menuId = parseInt(id, 10);
      if (Number.isNaN(menuId)) {
        console.error('[menu/[id]] ID de menu invalide:', id);
        showError(t('menuDetail.invalidMenuId'), t('menuItemForm.error'));
        router.back();
        return;
      }

      let menuData: Menu;
      try {
        menuData = await menuService.getMenu(menuId, previewLang);
      } catch (menuError: any) {
        console.error(
          '[menu/[id]] Échec getMenu — id:', menuId,
          '| code:', menuError?.code,
          '| message:', menuError?.message,
        );
        showError(t('menuDetail.menuNotFoundToast'), t('menuItemForm.error'));
        router.back();
        return;
      }
      // Résout les noms/descriptions dans la langue d'aperçu : on écrase
      // name/description par les valeurs traduites (display_*), pour que
      // l'affichage existant les utilise sans modification.
      const rawItems: any[] = (menuData as any)?.items || [];
      const localizedMenu: any = {
        ...menuData,
        items: rawItems.map((it: any) => ({
          ...it,
          name: it.display_name || it.name,
          description: it.display_description ?? it.description ?? '',
        })),
      };
      setMenu(localizedMenu);

      // Langues réellement traduites (agrégées sur les plats du menu), pour
      // alimenter le sélecteur d'aperçu en lecture seule.
      setAvailableLanguages(
        collectAvailableLanguages(rawItems.map((it: any) => it.available_languages)),
      );

      // ── Étape 2 : les catégories du restaurant (non bloquant) ───────────
      // Un échec ici ne doit PAS empêcher l'affichage du menu : on continue
      // avec une liste de catégories vide.
      if (menuData.restaurant) {
        try {
          const categoriesData = await categoryService.getCategoriesByRestaurant(
            String(menuData.restaurant),
          );
          // La réponse peut être { categories: [...] } ou directement un tableau.
          const list = Array.isArray(categoriesData)
            ? categoriesData
            : categoriesData?.categories ?? [];
          setCategories(list);
        } catch (catError: any) {
          console.warn(
            '[menu/[id]] Échec getCategoriesByRestaurant — restaurant:',
            menuData.restaurant,
            '| code:', catError?.code,
            '| message:', catError?.message,
          );
          setCategories([]);
        }
      } else {
        setCategories([]);
      }
    } catch (error: any) {
      console.error('Erreur lors du chargement des données:', error);
      showError(t('menuForm.loadError'), t('menuItemForm.error'));
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
        name: t('menuDetail.uncategorized'),
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
        updated.is_available ? t('menuDetail.dishActivatedMsg') : t('menuDetail.dishDeactivatedMsg'),
        t('menuItemForm.success')
      );
    } catch (error) {
      console.error('Toggle item error:', error);
      showError(t('menuDetail.toggleStatusError'), t('menuItemForm.error'));
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
      showSuccess(t('menuDetail.dishDeleted', { name: itemName }), t('menuItemForm.success'));
    } catch (error) {
      console.error('Delete item error:', error);
      showError(t('menuDetail.deleteDishError'), t('menuItemForm.error'));
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

  const navigateToReorder = () => {
    if (!menu?.restaurant) return;
    router.push({
      pathname: '/menu/categories/reorder',
      params: { restaurantId: String(menu.restaurant) },
    } as any);
  };

  /** Ouvre l'import de carte par photo (IA) pour le restaurant du menu. */
  const navigateToScan = () => {
    if (!menu?.restaurant) return;
    // On transmet aussi l'id du menu courant : l'import sera appliqué à CE
    // menu, et non au premier menu du restaurant.
    const menuParam = menu?.id ? `&menuId=${menu.id}` : '';
    router.push(`/menu/scan?restaurantId=${menu.restaurant}${menuParam}` as any);
  };

  // Nettoyage du polling de traduction au démontage.
  useEffect(() => {
    return () => {
      if (translationPollRef.current) {
        clearInterval(translationPollRef.current);
        translationPollRef.current = null;
      }
    };
  }, []);

  /**
   * Lance la traduction automatique du menu : complète par IA toutes les
   * langues manquantes des plats et catégories. Suit l'avancement par polling.
   */
  /** Ouvre le popup de choix des langues avant de lancer la traduction. */
  const handleTranslateMenu = useCallback(() => {
    if (translating) return;
    setShowLangSelector(true);
  }, [translating]);

  /** Bascule une langue dans la sélection. */
  const toggleSelectedLang = useCallback((code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }, []);

  /** Lance effectivement la traduction avec les langues choisies. */
  const launchTranslation = useCallback(async () => {
    if (!menu?.restaurant || translating || selectedLangs.length === 0) return;

    setShowLangSelector(false);
    setTranslating(true);
    setTranslationProgress(0);
    try {
      const job = await menuTranslationService.start(
        String(menu.restaurant),
        selectedLangs,
      );

      // Polling de l'avancement, toutes les 2,5 s (plafond ~5 min).
      let attempts = 0;
      const maxAttempts = 120;
      translationPollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const fresh = await menuTranslationService.get(job.id);
          setTranslationProgress(fresh.progress_percent || 0);

          if (fresh.status === 'done' || fresh.status === 'failed' || attempts >= maxAttempts) {
            if (translationPollRef.current) {
              clearInterval(translationPollRef.current);
              translationPollRef.current = null;
            }
            setTranslating(false);

            if (fresh.status === 'done') {
              const r = fresh.report as any;
              const total =
                (r?.items_translated || 0) +
                (r?.categories_translated || 0) +
                (r?.subcategories_translated || 0);
              showSuccess(
                total > 0
                  ? t('menuDetail.translatedCount', { count: total, langs: fresh.target_languages.length })
                  : t('menuDetail.allAlreadyTranslated'),
                t('menuDetail.translationDone'),
              );
              loadInitialData();
            } else if (fresh.status === 'failed') {
              showError(
                fresh.error_message || t('menuDetail.translationFailed'),
                t('menuItemForm.error'),
              );
            } else {
              showError(t('menuDetail.translationTimeout'), t('menuDetail.timeout'));
            }
          }
        } catch {
          /* erreur réseau ponctuelle : on retentera au prochain tick */
        }
      }, 2500);
    } catch (error: any) {
      setTranslating(false);
      showError(error?.message || t('menuDetail.translationStartError'), t('menuItemForm.error'));
    }
  }, [menu?.restaurant, translating, selectedLangs, showSuccess, showError]);

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
            <Ionicons name="restaurant-outline" size={48} color={colors.text.light} />
          </View>
          <Text style={styles.emptyTitle}>
            {totalItems === 0 ? t('menuDetail.emptyMenuTitle') : t('menuDetail.emptyCategoryTitle')}
          </Text>
          <Text style={styles.emptyText}>
            {totalItems === 0
              ? t('menuDetail.emptyMenuText')
              : t('menuDetail.emptyCategoryText')}
          </Text>
          <Button
            title={t('menuDetail.addDish')}
            onPress={navigateToAdd}
            variant="primary"
            leftIcon={<Ionicons name="add-circle-outline" size={20} color={colors.text.inverse} />}
          />
          {totalItems === 0 && (
            <Button
              title={t('menuDetail.importMenuPhoto')}
              onPress={navigateToScan}
              variant="outline"
              leftIcon={<Ionicons name="sparkles-outline" size={20} color={colors.primary} />}
              style={{ marginTop: 12 }}
            />
          )}
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
    return <Loading fullScreen text={t('menuDetail.loadingCard')} />;
  }

  if (!menu) {
    return (
      <View style={styles.container}>
        <Header
          title={t('menuDetail.restaurantMenuTitle')}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
          includeSafeArea
        />
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={64} color={colors.text.light} />
          <Text style={styles.emptyTitle}>{t('menuDetail.menuNotFound')}</Text>
          <Button
            title={t('menuItemForm.back')}
            onPress={() => router.back()}
            variant="outline"
            leftIcon={<Ionicons name="arrow-back" size={20} color={colors.primary} />}
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
        title={t('menuDetail.restaurantMenuTitle')}
        subtitle={t('menuDetail.menuSubtitle', { name: menu.name, available: availableCount, total: totalItems })}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="add-circle"
        onRightPress={navigateToAdd}
        includeSafeArea
      />

      {/* Bandeau "Ajouter un plat" — visible uniquement sur desktop/tablet (sinon icône header suffit) */}
      {useSidebar && (
        <View style={styles.actionBar}>
          <Button
            title={t('menuDetail.importPhoto')}
            onPress={navigateToScan}
            variant="outline"
            size="sm"
            leftIcon={<Ionicons name="sparkles-outline" size={16} color={colors.primary} />}
          />
          <Button
            title={translating ? t('menuDetail.translatingProgress', { progress: translationProgress }) : t('menuDetail.translateMenu')}
            onPress={handleTranslateMenu}
            variant="outline"
            size="sm"
            disabled={translating}
            leftIcon={<Ionicons name="language-outline" size={16} color={colors.primary} />}
            style={{ marginLeft: 8 }}
          />
          {availableLanguages.length > 1 && (
            <Button
              title={`${t('menuDetail.previewPrefix')} ${getMenuLanguage(previewLang).flag} ${previewLang.toUpperCase()}`}
              onPress={() => setShowPreviewPicker(true)}
              variant="ghost"
              size="sm"
              leftIcon={<Ionicons name="eye-outline" size={16} color={colors.primary} />}
              style={{ marginLeft: 8 }}
            />
          )}
          <View style={styles.actionBarSpacer} />
          <Button
            title={t('menuDetail.addDishShort')}
            onPress={navigateToAdd}
            variant="primary"
            size="sm"
          />
        </View>
      )}

      {/* Barre d'accès à l'import par photo — mobile uniquement */}
      {!useSidebar && (
        <View style={styles.scanBar}>
          <TouchableOpacity
            style={styles.scanBarButton}
            onPress={navigateToScan}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={16} color={colors.primary} />
            <Text style={styles.scanBarText}>{t('menuDetail.importMenuPhoto')}</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.text.secondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.scanBarButton, { marginTop: 8 }]}
            onPress={handleTranslateMenu}
            activeOpacity={0.8}
            disabled={translating}
          >
            {translating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="language-outline" size={16} color={colors.primary} />
            )}
            <Text style={styles.scanBarText}>
              {translating ? t('menuDetail.translatingProgressLong', { progress: translationProgress }) : t('menuDetail.translateMenu')}
            </Text>
            {!translating && (
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
            )}
          </TouchableOpacity>

          {availableLanguages.length > 1 && (
            <TouchableOpacity
              style={[styles.scanBarButton, { marginTop: 8 }]}
              onPress={() => setShowPreviewPicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="eye-outline" size={16} color={colors.primary} />
              <Text style={styles.scanBarText}>
                {t('menuDetail.previewPrefix')} {getMenuLanguage(previewLang).flag} {getMenuLanguage(previewLang).label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Onglets horizontaux (mobile uniquement) */}
      {!useSidebar && tabs.length > 0 && (
        <CategoryTabs
          categories={tabs}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
          onReorderPress={navigateToReorder}
        />
      )}

      {/* Body : sidebar + grille (desktop/tablet) ou grille seule (mobile) */}
      <View style={[styles.body, useSidebar ? styles.bodyRow : styles.bodyColumn]}>
        {useSidebar && tabs.length > 0 && (
          <CategorySidebar
            categories={tabs}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            onReorderPress={navigateToReorder}
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
                title={t('menuDetail.deleteDishTitle')}
                message={t('menuDetail.deleteDishMessage', { name: itemToDelete.name })}
                showIcon
                primaryButton={{
                  text: t('menuItemForm.delete'),
                  onPress: confirmDeleteItem,
                  variant: 'danger',
                }}
                secondaryButton={{
                  text: t('menuDetail.cancel'),
                  onPress: () => setItemToDelete(null),
                }}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Modal — sélection des langues à traduire */}
      <Modal
        visible={showLangSelector}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowLangSelector(false)}
      >
        <View style={styles.langModalOverlay}>
          <View style={styles.langModalCard}>
            <Text style={styles.langModalTitle}>{t('menuDetail.langsToTranslate')}</Text>
            <Text style={styles.langModalSubtitle}>
              {t('menuDetail.onlyUntranslated')}
            </Text>
            <View style={styles.langChipsWrap}>
              {MENU_LANGUAGES.filter((l) => l.code !== 'fr').map((language) => {
                const selected = selectedLangs.includes(language.code);
                return (
                  <TouchableOpacity
                    key={language.code}
                    onPress={() => toggleSelectedLang(language.code)}
                    activeOpacity={0.8}
                    style={[styles.langChip, selected && styles.langChipSelected]}
                  >
                    {selected && (
                      <Ionicons name="checkmark-circle" size={15} color={colors.primary} />
                    )}
                    <Text style={[styles.langChipText, selected && styles.langChipTextSelected]}>
                      {language.flag} {language.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.langModalActions}>
              <Button
                title={t('menuDetail.cancel')}
                onPress={() => setShowLangSelector(false)}
                variant="ghost"
                size="sm"
              />
              <Button
                title={t('menuDetail.translateButton', { count: selectedLangs.length })}
                onPress={launchTranslation}
                variant="primary"
                size="sm"
                disabled={selectedLangs.length === 0}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal — aperçu langue (lecture seule) */}
      <Modal
        visible={showPreviewPicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowPreviewPicker(false)}
      >
        <Pressable
          onPress={() => setShowPreviewPicker(false)}
          style={styles.langModalOverlay}
        >
          <View style={styles.langModalCard}>
            <Text style={styles.langModalTitle}>{t('menuDetail.menuPreview')}</Text>
            <Text style={styles.langModalSubtitle}>
              {t('menuDetail.previewSubtitle')}
            </Text>
            {availableLanguages.map((language) => {
              const selected = language.code === previewLang;
              return (
                <TouchableOpacity
                  key={language.code}
                  onPress={() => {
                    setShowPreviewPicker(false);
                    if (language.code !== previewLang) setPreviewLang(language.code);
                  }}
                  activeOpacity={0.8}
                  style={[styles.previewRow, selected && styles.previewRowSelected]}
                >
                  <Text style={{ fontSize: 20 }}>{language.flag}</Text>
                  <Text style={[styles.previewRowText, selected && { color: colors.primary, fontWeight: '700' }]}>
                    {language.label}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

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

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Action bar (bouton "Ajouter un plat" sur desktop/tablet)
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.surface,
  },
  actionBarSpacer: {
    flex: 1,
  },

  // Barre d'accès à l'import de carte par photo (mobile)
  scanBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  scanBarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.goldenSurface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: colors.border.golden,
  },
  scanBarText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },

  // Modaux de langue (sélection + aperçu)
  langModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  langModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
  },
  langModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  langModalSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
    marginBottom: 14,
  },
  langChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.background,
  },
  langChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '12',
  },
  langChipText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  langChipTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  langModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 18,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  previewRowSelected: {
    backgroundColor: colors.primary + '12',
  },
  previewRowText: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '500',
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
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border.light,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sidebarTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.light,
    letterSpacing: 1.2,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sidebarReorderButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.variants.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: colors.variants.primary[50],
  },
  sidebarActiveBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    backgroundColor: colors.secondary,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  sidebarItemText: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '500',
  },
  sidebarItemTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  sidebarBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.variants.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarBadgeActive: {
    backgroundColor: colors.secondary,
  },
  sidebarBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  sidebarBadgeTextActive: {
    color: '#FFFFFF',
  },

  // Onglets horizontaux (mobile)
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tabsReorderButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.variants.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  tabItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  tabItemTextActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.variants.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: colors.secondary,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
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
    color: colors.primary,
    letterSpacing: -0.3,
  },
  categoryHeaderCount: {
    fontSize: 13,
    color: colors.text.secondary,
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
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.light,
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
    color: colors.primary,
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
    color: colors.text.primary,
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
    backgroundColor: colors.variants.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
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