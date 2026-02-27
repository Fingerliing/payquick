import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Switch,
  Platform,
  Dimensions,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

// UI Components
import { useCart } from '@/contexts/CartContext';
import { useSession } from '@/contexts/SessionContext';
import { menuService } from '@/services/menuService';
import { useCollaborativeSession } from '@/hooks/session/useCollaborativeSession';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { DailyMenuDisplay } from '@/components/menu/DailyMenuDisplay';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import { CategoryAccordionDisplay } from '@/components/menu/MenuDisplay';
import { MenuItemsGrid, MenuItemsMasonry, MenuItemsTable } from '@/components/menu/MenuItemGrid';

// Types
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';

// Design System
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY,
} from '@/utils/designSystem';

const { width: screenWidth } = Dimensions.get('window');

// =============================================================================
// TYPES ET INTERFACES
// =============================================================================
interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  count: number;
  items: MenuItem[];
}

interface FilterOptions {
  selectedCategory: string | null;
  hideAllergens: string[];
  showVegetarianOnly: boolean;
  showVeganOnly: boolean;
  showGlutenFreeOnly: boolean;
  showAvailableOnly: boolean;
  searchQuery: string;
}

type ViewMode = 'compact' | 'grid' | 'masonry' | 'accordion' | 'table';

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================
export default function OptimizedRestaurantPage() {
  const { restaurantId, sessionId } = useLocalSearchParams<{
    restaurantId: string;
    sessionId?: string;
  }>();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();

  // ─── SessionContext : source de vérité pour le participantId en mémoire ─
  // participantId est stocké en mémoire React par SessionContext, même après
  // que AsyncStorage ait été vidé (restart appli, archivage de session...).
  const { participantId: ctxParticipantId } = useSession();

  // ─── Session collaborative ────────────────────────────────────────────────
  const { session, isHost, approveParticipant, rejectParticipant, refresh } =
    useCollaborativeSession({
      sessionId: sessionId as string | undefined,
      externalParticipantId: ctxParticipantId,
    });

  // ─── WebSocket ────────────────────────────────────────────────────────────
  // Connexion INCONDITIONNELLE dès que sessionId est présent.
  // On ne gate PAS sur isHost : isHost peut être calculé de façon asynchrone
  // (lecture AsyncStorage) et serait faux au premier rendu, empêchant la
  // connexion même quand l'utilisateur est bien l'hôte.
  const { on } = useSessionWebSocket((sessionId as string | null) ?? null);

  useEffect(() => {
    if (!sessionId) return;

    const unsub = on('session_update', (data: any) => {
      if (data?.event === 'participant_pending') {
        console.log('[WS] participant_pending reçu → refresh session');
        // Rafraîchir la session pour déclencher l'alerte ci-dessous
        refresh();
      }
    });

    return () => unsub();
  }, [sessionId, on, refresh]);

  const { cart, addToCart, clearCart } = useCart();

  // États principaux
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // États pour l'affichage optimisé
  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [showDailyMenuFirst, setShowDailyMenuFirst] = useState(true);
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [quickFilterMode, setQuickFilterMode] = useState<'all' | 'available' | 'dietary'>('all');

  // États des filtres
  const [filters, setFilters] = useState<FilterOptions>({
    selectedCategory: null,
    hideAllergens: [],
    showVegetarianOnly: false,
    showVeganOnly: false,
    showGlutenFreeOnly: false,
    showAvailableOnly: false,
    searchQuery: '',
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // États UI
  const [toast, setToast] = useState({
    visible: false,
    variant: 'success' as 'success' | 'error' | 'info' | 'warning',
    title: '',
    message: '',
  });
  const [confirmCartSwitch, setConfirmCartSwitch] = useState({
    visible: false,
    item: null as MenuItem | null,
  });

  // Session banner
  const [codeCopied, setCodeCopied] = useState(false);

  // Ref pour tracker les pending précédents
  const prevPendingCountRef = useRef(0);

  // =============================================================================
  // ALERTE HÔTE — nouveaux participants en attente
  //
  // Déclenchée par :
  //   - le polling HTTP automatique (autoRefresh toutes les 10s)
  //   - le refresh() appelé depuis le listener WebSocket ci-dessus
  //
  // Fonctionne maintenant car isHost est correctement résolu via le fallback
  // sur @eatandgo_participant_id dans useCollaborativeSession.
  // =============================================================================
  useEffect(() => {
    if (!session || !isHost) return;

    const pendingParticipants = session.participants?.filter(
      (p) => p.status === 'pending'
    ) ?? [];

    const currentCount = pendingParticipants.length;

    if (currentCount > prevPendingCountRef.current) {
      const newest = pendingParticipants[currentCount - 1];

      Alert.alert(
        '🔔 Nouvelle demande',
        `${newest?.display_name ?? 'Quelqu\'un'} souhaite rejoindre votre session.`,
        [
          {
            text: '❌ Refuser',
            style: 'destructive',
            onPress: async () => {
              try {
                await rejectParticipant(newest.id);
              } catch {
                Alert.alert('Erreur', 'Impossible de refuser la demande');
              }
            },
          },
          {
            text: '✅ Accepter',
            onPress: async () => {
              try {
                await approveParticipant(newest.id);
              } catch {
                Alert.alert('Erreur', 'Impossible d\'accepter la demande');
              }
            },
          },
        ]
      );
    }

    prevPendingCountRef.current = currentCount;
  }, [session?.participants, isHost]);

  // =============================================================================
  // HELPERS TOAST
  // =============================================================================
  const showToast = useCallback(
    (variant: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
      setToast({ visible: true, variant, title, message });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    },
    []
  );

  // =============================================================================
  // CHARGEMENT DES DONNÉES
  // =============================================================================
  const loadData = useCallback(async () => {
    if (!restaurantId) return;

    try {
      setIsLoading(true);

      console.log('[RestaurantScreen] restaurantId =', restaurantId);

      const [restaurantData, menusData] = await Promise.all([
        restaurantService.getPublicRestaurant(restaurantId),
        menuService.getMenusByRestaurant(parseInt(restaurantId, 10)),
      ]);

      console.log('[RestaurantScreen] restaurantData =', restaurantData);
      console.log('[RestaurantScreen] menusData =', menusData);

      setRestaurant(restaurantData);
      setMenus(menusData);
    } catch (error) {
      console.error('Error loading restaurant data:', error);
      showToast('error', 'Erreur', 'Impossible de charger le menu');
      setRestaurant(null);
      setMenus([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // =============================================================================
  // DONNÉES TRANSFORMÉES ET FILTRÉES
  // =============================================================================
  const allMenuItems = useMemo(() => {
    return menus.flatMap(menu => menu.items || []);
  }, [menus]);

  const categoriesWithItems = useMemo(() => {
    const catMap = new Map<string, MenuCategory>();

    allMenuItems.forEach(item => {
      const catName = item.category_name || 'Autres';
      if (!catMap.has(catName)) {
        catMap.set(catName, { id: catName, name: catName, icon: '🍽️', count: 0, items: [] });
      }
      const cat = catMap.get(catName)!;
      cat.items.push(item);
      cat.count++;
    });

    return Array.from(catMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allMenuItems]);

  const filteredItems = useMemo(() => {
    let items = [...allMenuItems];

    if (quickFilterMode === 'available') {
      items = items.filter(item => item.is_available);
    } else if (quickFilterMode === 'dietary') {
      items = items.filter(item => item.is_vegan || item.is_vegetarian || item.is_gluten_free);
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      items = items.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      );
    }

    if (filters.selectedCategory) {
      items = items.filter(item => item.category_name === filters.selectedCategory);
    }

    if (filters.showVeganOnly)        items = items.filter(item => item.is_vegan);
    if (filters.showVegetarianOnly)   items = items.filter(item => item.is_vegetarian);
    if (filters.showGlutenFreeOnly)   items = items.filter(item => item.is_gluten_free);
    if (filters.showAvailableOnly)    items = items.filter(item => item.is_available);

    if (filters.hideAllergens.length > 0) {
      items = items.filter(item => {
        const itemAllergens = item.allergens || [];
        return !filters.hideAllergens.some(allergen => itemAllergens.includes(allergen));
      });
    }

    return items;
  }, [allMenuItems, filters, quickFilterMode]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.selectedCategory) count++;
    if (filters.showVegetarianOnly) count++;
    if (filters.showVeganOnly) count++;
    if (filters.showGlutenFreeOnly) count++;
    if (filters.showAvailableOnly) count++;
    if (filters.hideAllergens.length > 0) count++;
    if (filters.searchQuery) count++;
    return count;
  }, [filters]);

  const totalCartItems = useMemo(() => cart.itemCount || 0, [cart.itemCount]);

  // =============================================================================
  // HANDLERS
  // =============================================================================
  const handleAddToCart = useCallback(
    (item: MenuItem) => {
      const parsedRestaurantId = parseInt(restaurantId, 10);

      if (cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== parsedRestaurantId) {
        setConfirmCartSwitch({ visible: true, item });
        return;
      }

      const menuItemId =
        typeof (item as any).id === 'number'
          ? (item as any).id
          : parseInt(String((item as any).id), 10);

      const cartItem: any = {
        id: String(menuItemId),
        menuItemId,
        name: item.name,
        price: (item as any).price,
        restaurantId: parsedRestaurantId,
        restaurantName: restaurant?.name || '',
        imageUrl: (item as any).image_url,
        isAvailable: (item as any).is_available,
        customizations: {},
        specialInstructions: '',
      };

      addToCart(cartItem);
      showToast('success', 'Ajouté au panier', `${item.name} a été ajouté`);
    },
    [cart.items.length, cart.restaurantId, restaurantId, restaurant, addToCart, showToast]
  );

  const proceedAddToCart = useCallback(
    (item: MenuItem) => {
      const parsedRestaurantId = parseInt(restaurantId, 10);
      clearCart();

      const menuItemId =
        typeof (item as any).id === 'number'
          ? (item as any).id
          : parseInt(String((item as any).id), 10);

      const cartItem: any = {
        id: String(menuItemId),
        menuItemId,
        name: item.name,
        price: (item as any).price,
        restaurantId: parsedRestaurantId,
        restaurantName: restaurant?.name || '',
        imageUrl: (item as any).image_url,
        isAvailable: (item as any).is_available,
        customizations: {},
        specialInstructions: '',
      };

      addToCart(cartItem);
      showToast('success', 'Ajouté au panier', `${item.name} a été ajouté`);
    },
    [clearCart, addToCart, restaurantId, restaurant, showToast]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleViewModeChange = (mode: ViewMode) => setViewMode(mode);
  const handleQuickFilter = (mode: 'all' | 'available' | 'dietary') => setQuickFilterMode(mode);
  const handleCategorySelect = (categoryId: string | null) =>
    setFilters(prev => ({ ...prev, selectedCategory: categoryId }));
  const handleSearchChange = (text: string) =>
    setFilters(prev => ({ ...prev, searchQuery: text }));

  const toggleDietaryFilter = (filter: 'vegan' | 'vegetarian' | 'glutenFree') => {
    setFilters(prev => {
      switch (filter) {
        case 'vegan':        return { ...prev, showVeganOnly: !prev.showVeganOnly };
        case 'vegetarian':   return { ...prev, showVegetarianOnly: !prev.showVegetarianOnly };
        case 'glutenFree':   return { ...prev, showGlutenFreeOnly: !prev.showGlutenFreeOnly };
        default:             return prev;
      }
    });
  };

  const clearAllFilters = () => {
    setFilters({
      selectedCategory: null,
      hideAllergens: [],
      showVegetarianOnly: false,
      showVeganOnly: false,
      showGlutenFreeOnly: false,
      showAvailableOnly: false,
      searchQuery: '',
    });
    setQuickFilterMode('all');
  };

  // =============================================================================
  // HANDLERS SESSION BANNER
  // =============================================================================
  const handleCopyCode = useCallback(async () => {
    if (!session?.share_code) return;
    try {
      await Clipboard.setStringAsync(session.share_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      Alert.alert('Erreur', 'Impossible de copier le code');
    }
  }, [session?.share_code]);

  const handleShareCode = useCallback(async () => {
    if (!session?.share_code || !restaurant) return;
    try {
      await Share.share({
        message: `🍽️ Rejoins-moi au restaurant ${restaurant.name} !\n\nCode de session : ${session.share_code}\n\nEntre ce code dans EatQuickeR pour rejoindre ma table.`,
        title: 'Rejoins notre table',
      });
    } catch {
      // ignore cancel
    }
  }, [session?.share_code, restaurant]);

  // =============================================================================
  // STYLES
  // =============================================================================
  const styles = useMemo(
    () => ({
      page: {
        flex: 1,
        backgroundColor: COLORS.background,
      },
      restaurantHeader: {
        backgroundColor: COLORS.goldenSurface,
        paddingTop: getResponsiveValue(SPACING.xl, screenType),
        paddingBottom: getResponsiveValue(SPACING.lg, screenType),
        paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
        borderBottomLeftRadius: BORDER_RADIUS['3xl'],
        borderBottomRightRadius: BORDER_RADIUS['3xl'],
        ...SHADOWS.premiumCard,
        borderBottomWidth: 3,
        borderBottomColor: COLORS.border.golden,
      },
      restaurantName: {
        fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
        fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
        color: COLORS.primary,
        textAlign: 'center' as const,
        marginBottom: getResponsiveValue(SPACING.xs, screenType),
        letterSpacing: 0.5,
      },
      restaurantSubtitle: {
        fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
        fontWeight: TYPOGRAPHY.fontWeight.medium as any,
        color: COLORS.text.golden,
        textAlign: 'center' as const,
        fontStyle: 'italic' as const,
      },
      sessionBanner: {
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        borderRadius: 12,
        backgroundColor: '#1E2A78',
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        shadowColor: '#1E2A78',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
      },
      sessionBannerLeft: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 6,
        flex: 1,
      },
      sessionBannerLabel: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        fontWeight: '500' as const,
      },
      sessionCodeRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 8,
      },
      sessionCodeText: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold' as const,
        letterSpacing: 5,
      },
      sessionIconBtn: {
        padding: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
      },
      displayControls: {
        backgroundColor: COLORS.surface,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border.light,
        ...SHADOWS.sm,
      },
      viewModeButton: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginRight: 8,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: COLORS.background,
      },
      viewModeButtonActive: {
        backgroundColor: COLORS.variants?.primary?.[50] ?? COLORS.primary + '20',
        borderWidth: 1,
        borderColor: COLORS.primary,
      },
      viewModeText: {
        fontSize: 13,
        color: COLORS.text.secondary,
        marginLeft: 4,
        fontWeight: '500' as const,
      },
      viewModeTextActive: {
        color: COLORS.primary,
        fontWeight: '600' as const,
      },
      quickFilterButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        borderRadius: BORDER_RADIUS.full,
        backgroundColor: COLORS.background,
        borderWidth: 1,
        borderColor: COLORS.border.light,
      },
      quickFilterButtonActive: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
      },
      quickFilterText: {
        fontSize: 12,
        color: COLORS.text.secondary,
        fontWeight: '500' as const,
      },
      quickFilterTextActive: {
        color: '#fff',
        fontWeight: '600' as const,
      },
      settingsPanel: {
        backgroundColor: COLORS.background,
        borderRadius: BORDER_RADIUS.lg,
        padding: 12,
        marginTop: 8,
        gap: 12,
      },
      settingRow: {
        flexDirection: 'row' as const,
        justifyContent: 'space-between' as const,
        alignItems: 'center' as const,
      },
      settingLabel: {
        fontSize: 14,
        color: COLORS.text.primary,
        flex: 1,
      },
      floatingCart: {
        position: 'absolute' as const,
        left: 20,
        right: 20,
        backgroundColor: COLORS.primary,
        borderRadius: BORDER_RADIUS.xl,
        paddingHorizontal: 20,
        paddingVertical: 14,
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
        ...SHADOWS.lg,
      },
      cartInfo: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 12,
      },
      cartBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
      cartBadgeText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: 'bold' as const,
      },
      cartText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600' as const,
      },
      cartTotal: {
        color: '#fff',
        fontSize: 17,
        fontWeight: 'bold' as const,
      },
    }),
    [screenType]
  );

  // =============================================================================
  // RENDU
  // =============================================================================
  if (isLoading) {
    return (
      <SafeAreaView style={styles.page}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading />
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={styles.page}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.text.light} />
          <Text style={{ fontSize: 18, color: COLORS.text.secondary, marginTop: 16, textAlign: 'center' }}>
            Restaurant introuvable
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <Header
        title={restaurant.name}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />

      {/* Toast */}
      {toast.visible && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <InlineAlert variant={toast.variant} title={toast.title} message={toast.message} />
        </View>
      )}

      {/* Alerte confirmation changement de restaurant */}
      {confirmCartSwitch.visible && (
        <AlertWithAction
          variant="warning"
          title="Changer de restaurant ?"
          message="Voulez-vous vider votre panier ?"
          autoDismiss={false}
          onDismiss={() => setConfirmCartSwitch({ visible: false, item: null })}
          secondaryButton={{
            text: 'Annuler',
            onPress: () => setConfirmCartSwitch({ visible: false, item: null }),
          }}
          primaryButton={{
            text: 'Continuer',
            variant: 'danger',
            onPress: () => {
              if (confirmCartSwitch.item) proceedAddToCart(confirmCartSwitch.item);
              setConfirmCartSwitch({ visible: false, item: null });
            },
          }}
        />
      )}

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
      >
        {/* Restaurant Header */}
        <View style={styles.restaurantHeader}>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          <Text style={styles.restaurantSubtitle}>
            {session?.share_code
              ? `Table ${session.table_number} • ${session.participant_count} participant(s)`
              : 'Bienvenue'}
          </Text>
        </View>

        {/* Session Collaborative Banner */}
        {session?.share_code && (
          <View style={styles.sessionBanner}>
            <View style={styles.sessionBannerLeft}>
              <Ionicons name="people" size={18} color="#fff" />
              <Text style={styles.sessionBannerLabel}>Session collaborative</Text>
            </View>
            <View style={styles.sessionCodeRow}>
              <Text style={styles.sessionCodeText}>{session.share_code}</Text>
              <TouchableOpacity style={styles.sessionIconBtn} onPress={handleCopyCode} activeOpacity={0.7}>
                <Ionicons
                  name={codeCopied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={codeCopied ? '#4CAF50' : '#fff'}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.sessionIconBtn} onPress={handleShareCode} activeOpacity={0.7}>
                <Ionicons name="share-social-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Display Controls */}
        <View style={styles.displayControls}>
          {/* View Mode Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {(['compact', 'grid', 'accordion'] as ViewMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.viewModeButton, viewMode === mode && styles.viewModeButtonActive]}
                onPress={() => handleViewModeChange(mode)}
              >
                <Ionicons
                  name={mode === 'compact' ? 'list' : mode === 'grid' ? 'grid' : 'layers'}
                  size={18}
                  color={viewMode === mode ? COLORS.primary : COLORS.text.secondary}
                />
                <Text style={[styles.viewModeText, viewMode === mode && styles.viewModeTextActive]}>
                  {mode === 'compact' ? 'Liste' : mode === 'grid' ? 'Grille' : 'Catégories'}
                </Text>
              </TouchableOpacity>
            ))}
            {screenWidth >= 768 && (
              <>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'masonry' && styles.viewModeButtonActive]}
                  onPress={() => handleViewModeChange('masonry')}
                >
                  <Ionicons name="apps" size={18} color={viewMode === 'masonry' ? COLORS.primary : COLORS.text.secondary} />
                  <Text style={[styles.viewModeText, viewMode === 'masonry' && styles.viewModeTextActive]}>Masonry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'table' && styles.viewModeButtonActive]}
                  onPress={() => handleViewModeChange('table')}
                >
                  <Ionicons name="tablet-landscape" size={18} color={viewMode === 'table' ? COLORS.primary : COLORS.text.secondary} />
                  <Text style={[styles.viewModeText, viewMode === 'table' && styles.viewModeTextActive]}>Tableau</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          {/* Quick Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {(['all', 'available', 'dietary'] as const).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.quickFilterButton, quickFilterMode === mode && styles.quickFilterButtonActive]}
                onPress={() => handleQuickFilter(mode)}
              >
                <Text style={[styles.quickFilterText, quickFilterMode === mode && styles.quickFilterTextActive]}>
                  {mode === 'all' ? 'Tout' : mode === 'available' ? 'Disponibles' : '🥗 Diétiques'}
                </Text>
              </TouchableOpacity>
            ))}
            {categoriesWithItems.map(category => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.quickFilterButton,
                  filters.selectedCategory === category.name && styles.quickFilterButtonActive,
                ]}
                onPress={() =>
                  handleCategorySelect(filters.selectedCategory === category.name ? null : category.name)
                }
              >
                <Text
                  style={[
                    styles.quickFilterText,
                    filters.selectedCategory === category.name && styles.quickFilterTextActive,
                  ]}
                >
                  {category.name} ({category.count})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Advanced Filters Toggle */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
              backgroundColor: COLORS.surface,
              borderRadius: BORDER_RADIUS.lg,
              marginBottom: 4,
            }}
            onPress={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            <Ionicons
              name="options"
              size={18}
              color={activeFiltersCount > 0 ? COLORS.warning : COLORS.text.secondary}
            />
            <Text style={{ marginLeft: 6, fontSize: 13, color: activeFiltersCount > 0 ? COLORS.warning : COLORS.text.secondary, fontWeight: '600' }}>
              Filtres avancés{activeFiltersCount > 0 && ` (${activeFiltersCount})`}
            </Text>
            <Ionicons
              name={showAdvancedFilters ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={COLORS.text.secondary}
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>

          {showAdvancedFilters && (
            <View style={styles.settingsPanel}>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>🥗 Végétarien uniquement</Text>
                <Switch
                  value={filters.showVegetarianOnly}
                  onValueChange={() => toggleDietaryFilter('vegetarian')}
                  trackColor={{ false: COLORS.border.default, true: COLORS.success }}
                />
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>🌱 Vegan uniquement</Text>
                <Switch
                  value={filters.showVeganOnly}
                  onValueChange={() => toggleDietaryFilter('vegan')}
                  trackColor={{ false: COLORS.border.default, true: COLORS.success }}
                />
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>🚫🌾 Sans gluten uniquement</Text>
                <Switch
                  value={filters.showGlutenFreeOnly}
                  onValueChange={() => toggleDietaryFilter('glutenFree')}
                  trackColor={{ false: COLORS.border.default, true: COLORS.success }}
                />
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Disponibles uniquement</Text>
                <Switch
                  value={filters.showAvailableOnly}
                  onValueChange={value => setFilters(prev => ({ ...prev, showAvailableOnly: value }))}
                  trackColor={{ false: COLORS.border.default, true: COLORS.primary }}
                />
              </View>
              {activeFiltersCount > 0 && (
                <TouchableOpacity
                  style={{ marginTop: 12, backgroundColor: COLORS.primary, padding: 10, borderRadius: BORDER_RADIUS.lg, alignItems: 'center' }}
                  onPress={clearAllFilters}
                >
                  <Text style={{ color: 'white', fontWeight: '600' }}>Réinitialiser tous les filtres</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Daily Menu Display */}
        {showDailyMenuFirst && (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <DailyMenuDisplay
              restaurantId={parseInt(restaurantId, 10)}
              restaurantName={restaurant.name}
              onAddToCart={handleAddToCart}
              isInRestaurantView={true}
            />
          </View>
        )}

        {/* Main Content */}
        <View style={{ paddingHorizontal: 16, marginTop: 16, paddingBottom: 100 }}>
          {filteredItems.length > 0 ? (
            <>
              {viewMode === 'compact' && (
                <MenuItemsGrid items={filteredItems} onAddToCart={handleAddToCart} layout="list" showCategoryHeaders={groupByCategory} />
              )}
              {viewMode === 'grid' && (
                <MenuItemsGrid items={filteredItems} onAddToCart={handleAddToCart} layout="grid" showCategoryHeaders={groupByCategory} />
              )}
              {viewMode === 'masonry' && screenWidth >= 768 && (
                <MenuItemsMasonry items={filteredItems} onAddToCart={handleAddToCart} />
              )}
              {viewMode === 'accordion' && (
                <CategoryAccordionDisplay items={filteredItems} onAddToCart={handleAddToCart} menuTitle="Menu à la carte" />
              )}
              {viewMode === 'table' && screenWidth >= 768 && (
                <MenuItemsTable items={filteredItems} onAddToCart={handleAddToCart} />
              )}
            </>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="search" size={64} color={COLORS.text.light} />
              <Text style={{ fontSize: 16, color: COLORS.text.secondary, marginTop: 16, textAlign: 'center' }}>
                Aucun plat ne correspond à vos critères
              </Text>
              {activeFiltersCount > 0 && (
                <TouchableOpacity
                  onPress={clearAllFilters}
                  style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.lg }}
                >
                  <Text style={{ color: 'white', fontWeight: '600' }}>Réinitialiser les filtres</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Floating Cart Button */}
      {totalCartItems > 0 && (
        <Pressable
          style={[styles.floatingCart, { bottom: Math.max(20, insets.bottom + 10) }]}
          onPress={() => router.push('/(client)/cart')}
        >
          <View style={styles.cartInfo}>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{totalCartItems}</Text>
            </View>
            <View>
              <Text style={styles.cartText}>Voir le panier</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                {totalCartItems} article{totalCartItems > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          <Text style={styles.cartTotal}>{cart.total.toFixed(2)}€</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}