/**
 * Flux en deux temps :
 *   1. Choix de la table (liste des tables du restaurant + saisie libre).
 *      On interroge la session de table pour afficher le cumul en cours :
 *      un service génère plusieurs commandes successives sur la même table.
 *   2. Menu du restaurant + panier local, puis validation avec choix
 *      d'encaissement (différé au comptoir, ou immédiat via /order/payment).
 *
 * Choix d'implémentation notables :
 *
 * - Le panier est un ÉTAT LOCAL, pas le `CartContext`. Le contexte porte le
 *   panier *client* (restaurant unique, sessions collaboratives,
 *   UnpaidOrderGate). Un serveur enchaîne les tables sur le même appareil :
 *   passer par le contexte polluerait le panier client et déclencherait les
 *   garde-fous côté client.
 *
 * - Le menu est réutilisé tel quel : `menuService.getPublicMenusByRestaurant`
 *   + le composant partagé `DishCard` extrait de l'écran client.
 *
 * - La commande part sur `/api/v1/table-orders/add_table_order/` (gestion des
 *   sessions de table côté backend), avec repli sur `/api/v1/orders/` si
 *   l'endpoint table-orders n'est pas exposé.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Contexts
import { useAuth } from '@/contexts/AuthContext';

// Services
import { menuService } from '@/services/menuService';
import { restaurantService } from '@/services/restaurantService';
import { tableService, type Table } from '@/services/tableService';
import { tableOrderService, type TableSession } from '@/services/tableOrderService';
import { clientOrderService } from '@/services/clientOrderService';

// Types
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';
import {
  type CreateOrderRequest,
  type CreateOrderItemInput,
  isValidCreateOrderRequest,
} from '@/types/order';

// UI
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import {
  DishCard,
  formatPrice,
  inferCategoryEmoji,
  type MenuCategory,
} from '@/components/menu/DishCard';
import {
  printKitchenTicket,
  type KitchenTicketData,
} from '@/components/receipt/KitchenTicket';

// Design system
import { useAppTheme, BORDER_RADIUS, type AppColors } from '@/utils/designSystem';

// =============================================================================
// TYPES LOCAUX
// =============================================================================

/** Ligne du panier serveur : le plat complet + sa quantité. */
interface WaiterCartLine {
  item: MenuItem;
  quantity: number;
}

type AlertItem = {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
};

/** Ce que le serveur fait de la commande une fois créée. */
type CheckoutMode = 'later' | 'now';

// CTA dorée : mêmes valeurs que le bouton « Prendre une commande » du Kanban.
// Le doré plein éblouit sur les fonds sombres, on l'assourdit en dark ; l'encre
// posée dessus est FIXE (navy de l'emblème). La dériver de `colors.primary`
// dégrade le contraste en dark, où le token s'éclaircit.
const GOLD_FILL_LIGHT = '#D4AF37';
const GOLD_FILL_DARK = '#C9A227';
const INK_ON_GOLD = '#0C1219';

const ALL_CATEGORIES_ID = '__all__';

/** Extrait un ID numérique fiable depuis un MenuItem (backend mixe string/number). */
function menuItemIdOf(item: MenuItem): number {
  const raw = (item as any).id;
  return typeof raw === 'number' ? raw : parseInt(String(raw), 10);
}

// =============================================================================
// ÉCRAN
// =============================================================================

export default function TakeOrderScreen() {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { isRestaurateur } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const restaurantId = params.restaurantId ?? '';
  const parsedRestaurantId = parseInt(restaurantId, 10);

  // Langue du menu : celle de l'app, repli sur 'fr'.
  const lang = useMemo(() => (i18n.language || 'fr').split('-')[0], [i18n.language]);

  // ─── Étape ────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<'table' | 'menu'>('table');

  // ─── Tables ───────────────────────────────────────────────────────────────
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [manualTable, setManualTable] = useState('');
  const [tableSession, setTableSession] = useState<TableSession | null>(null);

  // ─── Menu ─────────────────────────────────────────────────────────────────
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string>(ALL_CATEGORIES_ID);

  // ─── Panier serveur (local) ───────────────────────────────────────────────
  const [cart, setCart] = useState<Record<number, WaiterCartLine>>({});

  // ─── Validation ───────────────────────────────────────────────────────────
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>('later');
  const [discardConfirm, setDiscardConfirm] = useState(false);
  // Bon conservé après un échec d'impression : les imprimantes thermiques
  // tombent souvent (papier, Bluetooth), et la commande est déjà partie en
  // base. On garde de quoi relancer sans ressaisir.
  const [reprintTicket, setReprintTicket] = useState<KitchenTicketData | null>(null);

  // ─── Alertes ──────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const pushAlert = useCallback(
    (variant: AlertItem['variant'], title: string | undefined, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setAlerts(prev => [{ id, variant, title, message }, ...prev]);
    },
    [],
  );
  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Chargement des tables
  // ───────────────────────────────────────────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setIsLoadingTables(true);
      const data = await tableService.getRestaurantTables(restaurantId);
      setTables(data.filter(tbl => tbl.is_active !== false));
    } catch {
      // Pas bloquant : la saisie manuelle reste disponible.
      pushAlert('warning', t('common.error'), t('takeOrder.tablesLoadFailed'));
      setTables([]);
    } finally {
      setIsLoadingTables(false);
    }
  }, [restaurantId, pushAlert, t]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  // ───────────────────────────────────────────────────────────────────────────
  // Chargement du menu (une seule fois, dès l'entrée sur l'écran)
  // ───────────────────────────────────────────────────────────────────────────
  const loadMenu = useCallback(async () => {
    if (!restaurantId || isNaN(parsedRestaurantId)) return;
    try {
      setIsLoadingMenu(true);
      const [restaurantData, menusData] = await Promise.all([
        restaurantService.getPublicRestaurant(restaurantId),
        menuService.getPublicMenusByRestaurant(parsedRestaurantId, lang),
      ]);
      setRestaurant(restaurantData);

      // Même normalisation que l'écran client : on écrase name/description par
      // les variantes traduites quand le backend les expose.
      const localized = (menusData || []).map((m: any) => ({
        ...m,
        items: (m.items || []).map((it: any) => ({
          ...it,
          name: it.display_name || it.name,
          description: it.display_description || it.description || '',
        })),
      }));
      setMenus(localized);
    } catch {
      pushAlert('error', t('common.error'), t('takeOrder.menuLoadFailed'));
      setMenus([]);
    } finally {
      setIsLoadingMenu(false);
      setRefreshing(false);
    }
  }, [restaurantId, parsedRestaurantId, lang, pushAlert, t]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadMenu();
  }, [loadMenu]);

  // ───────────────────────────────────────────────────────────────────────────
  // Sélection d'une table
  // ───────────────────────────────────────────────────────────────────────────
  const selectTable = useCallback(
    async (num: string) => {
      const clean = num.trim();
      if (!clean) return;
      setTableNumber(clean);
      setStep('menu');
      setTableSession(null);

      // Récupération best-effort de la session en cours : purement informatif,
      // un échec ne doit pas empêcher la prise de commande.
      try {
        const res = await tableOrderService.getTableSession(parsedRestaurantId, clean);
        setTableSession(res?.has_active_session ? res.session ?? null : null);
      } catch {
        setTableSession(null);
      }
    },
    [parsedRestaurantId],
  );

  const changeTable = useCallback(() => {
    setStep('table');
    setTableSession(null);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Catégories & filtrage
  // ───────────────────────────────────────────────────────────────────────────
  const allMenuItems = useMemo(() => menus.flatMap(m => m.items || []), [menus]);

  const categories = useMemo<MenuCategory[]>(() => {
    // On respecte l'ordre défini côté restaurateur (`category_order`), en
    // gardant le plus petit ordre quand plusieurs items d'une même catégorie
    // portent des valeurs divergentes.
    const map = new Map<string, MenuCategory & { _order: number }>();
    allMenuItems.forEach(item => {
      const catName = (item as any).category_name || t('takeOrder.otherCategory');
      const itemOrder = (item as any).category_order;
      const order = typeof itemOrder === 'number' ? itemOrder : Number.MAX_SAFE_INTEGER;
      if (!map.has(catName)) {
        map.set(catName, {
          id: catName,
          name: catName,
          emoji: inferCategoryEmoji(catName),
          count: 0,
          items: [],
          _order: order,
        });
      }
      const entry = map.get(catName)!;
      entry.items.push(item);
      entry.count += 1;
      if (order < entry._order) entry._order = order;
    });
    return Array.from(map.values()).sort((a, b) => a._order - b._order);
  }, [allMenuItems, t]);

  const visibleItems = useMemo(() => {
    const base =
      activeCategoryId === ALL_CATEGORIES_ID
        ? allMenuItems
        : categories.find(c => c.id === activeCategoryId)?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(item => {
      const name = String((item as any).name || '').toLowerCase();
      const desc = String((item as any).description || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [activeCategoryId, allMenuItems, categories, search]);

  // ───────────────────────────────────────────────────────────────────────────
  // Panier
  // ───────────────────────────────────────────────────────────────────────────
  const addToCart = useCallback((item: MenuItem) => {
    const id = menuItemIdOf(item);
    if (isNaN(id) || id <= 0) return;
    setCart(prev => {
      const existing = prev[id];
      return {
        ...prev,
        [id]: { item, quantity: existing ? existing.quantity + 1 : 1 },
      };
    });
  }, []);

  const decrementFromCart = useCallback((item: MenuItem) => {
    const id = menuItemIdOf(item);
    setCart(prev => {
      const existing = prev[id];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: { ...existing, quantity: existing.quantity - 1 } };
    });
  }, []);

  const cartLines = useMemo(() => Object.values(cart), [cart]);

  const cartCount = useMemo(
    () => cartLines.reduce((acc, l) => acc + l.quantity, 0),
    [cartLines],
  );

  const cartTotal = useMemo(
    () =>
      cartLines.reduce(
        (acc, l) => acc + (parseFloat(String((l.item as any).price ?? 0)) || 0) * l.quantity,
        0,
      ),
    [cartLines],
  );

  const resetCart = useCallback(() => {
    setCart({});
    setNotes('');
    setGuestCount('');
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Envoi de la commande
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Envoie le payload sur l'endpoint table-orders (qui gère les sessions de
   * table) et retombe sur la création de commande standard si cet endpoint
   * n'existe pas côté backend. On ne retombe QUE sur un 404/405 : un 400 est
   * une vraie erreur de validation qu'il faut remonter telle quelle.
   */
  const submitPayload = useCallback(async (payload: CreateOrderRequest) => {
    try {
      return await tableOrderService.addTableOrder(payload);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        return await clientOrderService.createOrder(payload);
      }
      throw err;
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!tableNumber || cartLines.length === 0 || submitting) return;

    const items: CreateOrderItemInput[] = cartLines.map(line => ({
      menu_item: menuItemIdOf(line.item),
      quantity: line.quantity,
      customizations: {},
      special_instructions: '',
    }));

    // Le nombre de couverts n'a pas de champ dédié sur CreateOrderRequest :
    // on le préfixe aux notes de commande, visible en cuisine et sur le ticket.
    const guests = parseInt(guestCount, 10);
    const notesParts: string[] = [];
    if (!isNaN(guests) && guests > 0) {
      notesParts.push(t('takeOrder.guestsNote', { count: guests }));
    }
    if (notes.trim()) notesParts.push(notes.trim());

    const payload: CreateOrderRequest = {
      restaurant: parsedRestaurantId,
      order_type: 'dine_in',
      table_number: tableNumber,
      customer_name: t('takeOrder.tableLabel', { number: tableNumber }),
      payment_method: 'cash',
      notes: notesParts.join(' — '),
      items,
    };

    if (!isValidCreateOrderRequest(payload)) {
      pushAlert('error', t('common.error'), t('takeOrder.invalidPayload'));
      return;
    }

    try {
      setSubmitting(true);
      const created: any = await submitPayload(payload);
      const orderId = created?.id;

      // Bon de cuisine — construit AVANT resetCart(), qui vide `cartLines`.
      // Le rang d'envoi vient du backend quand table-orders répond ; sinon on
      // le déduit du cumul de session affiché dans le bandeau.
      const ticket: KitchenTicketData = {
        restaurantName: restaurant?.name,
        tableNumber,
        orderNumber: created?.order_number,
        createdAt: new Date(),
        guestCount: !isNaN(guests) && guests > 0 ? guests : null,
        sequence: created?.order_sequence ?? (tableSession?.orders_count ?? 0) + 1,
        notes: notes.trim(),
        items: cartLines.map(line => ({
          name: String((line.item as any).name ?? ''),
          quantity: line.quantity,
        })),
      };

      setReviewOpen(false);
      resetCart();

      // L'envoi en cuisine ne doit jamais dépendre du succès de l'impression :
      // la commande est enregistrée, un échec papier se rattrape.
      try {
        await printKitchenTicket(ticket);
      } catch {
        setReprintTicket(ticket);
      }

      if (checkoutMode === 'now' && orderId) {
        router.replace(`/order/payment?orderId=${orderId}` as any);
        return;
      }

      pushAlert(
        'success',
        t('takeOrder.successTitle'),
        t('takeOrder.successMessage', {
          table: tableNumber,
          number: created?.order_number ?? orderId,
        }),
      );

      // La table peut recommander : on rafraîchit le cumul de session.
      try {
        const res = await tableOrderService.getTableSession(parsedRestaurantId, tableNumber);
        setTableSession(res?.has_active_session ? res.session ?? null : null);
      } catch {
        /* informatif uniquement */
      }
    } catch (err: any) {
      pushAlert('error', t('common.error'), err?.message || t('takeOrder.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [
    tableNumber, cartLines, submitting, guestCount, notes, parsedRestaurantId,
    checkoutMode, submitPayload, resetCart, pushAlert, t, restaurant, tableSession,
  ]);

  /** Relance l'impression du dernier bon après un échec. */
  const handleReprint = useCallback(async () => {
    if (!reprintTicket) return;
    const ticket = reprintTicket;
    setReprintTicket(null);
    try {
      await printKitchenTicket(ticket);
    } catch {
      setReprintTicket(ticket);
    }
  }, [reprintTicket]);

  // ───────────────────────────────────────────────────────────────────────────
  // Sortie d'écran (avec garde si panier non vide)
  // ───────────────────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (cartLines.length > 0) {
      setDiscardConfirm(true);
      return;
    }
    router.back();
  }, [cartLines.length]);

  // ═══ Rendu ════════════════════════════════════════════════════════════════
  // Garde d'accès APRÈS tous les hooks (règles des hooks).
  if (!isRestaurateur) {
    return (
      <View style={styles.page}>
        <Header
          title={t('takeOrder.title')}
          includeSafeArea
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={64} color={colors.secondary} />
          <Text style={styles.centeredText}>{t('takeOrder.forbidden')}</Text>
        </View>
      </View>
    );
  }

  if (!restaurantId || isNaN(parsedRestaurantId)) {
    return (
      <View style={styles.page}>
        <Header
          title={t('takeOrder.title')}
          includeSafeArea
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          <Text style={styles.centeredText}>{t('takeOrder.missingRestaurant')}</Text>
        </View>
      </View>
    );
  }

  // ─── Étape 1 : choix de la table ──────────────────────────────────────────
  const renderTableStep = () => (
    <ScrollView
      contentContainerStyle={[styles.tableStepContent, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepTitle}>{t('takeOrder.chooseTableTitle')}</Text>
      <Text style={styles.stepSubtitle}>{t('takeOrder.chooseTableSubtitle')}</Text>

      {isLoadingTables ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tables.length > 0 ? (
        <View style={styles.tableGrid}>
          {tables.map(tbl => (
            <Pressable
              key={tbl.id}
              style={styles.tableChip}
              onPress={() => selectTable(tbl.number)}
              android_ripple={{ color: colors.primary + '20' }}
              accessibilityRole="button"
              accessibilityLabel={t('takeOrder.tableLabel', { number: tbl.number })}
            >
              <Ionicons name="restaurant-outline" size={20} color={colors.primary} />
              <Text style={styles.tableChipNumber}>{tbl.number}</Text>
              <Text style={styles.tableChipCapacity}>
                {t('takeOrder.seats', { count: tbl.capacity })}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="grid-outline" size={32} color={colors.text.light} />
          <Text style={styles.emptyText}>{t('takeOrder.noTables')}</Text>
        </View>
      )}

      <View style={styles.manualBox}>
        <Text style={styles.manualLabel}>{t('takeOrder.manualTableLabel')}</Text>
        <View style={styles.manualRow}>
          <TextInput
            value={manualTable}
            onChangeText={setManualTable}
            placeholder={t('takeOrder.manualTablePlaceholder')}
            placeholderTextColor={colors.text.light}
            style={styles.manualInput}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={() => selectTable(manualTable)}
          />
          <Button
            title={t('takeOrder.confirmTable')}
            onPress={() => selectTable(manualTable)}
            disabled={!manualTable.trim()}
            size="sm"
          />
        </View>
      </View>
    </ScrollView>
  );

  // ─── Étape 2 : menu + panier ──────────────────────────────────────────────
  const renderMenuStep = () => (
    <>
      {/* Bandeau table : rappel permanent de la table servie + cumul session */}
      <Pressable style={styles.tableBar} onPress={changeTable} accessibilityRole="button">
        <View style={styles.tableBarLeft}>
          <Ionicons name="restaurant" size={18} color={colors.secondary} />
          <Text style={styles.tableBarTitle}>
            {t('takeOrder.tableLabel', { number: tableNumber })}
          </Text>
        </View>
        {tableSession ? (
          <Text style={styles.tableBarSession}>
            {t('takeOrder.sessionRunning', {
              count: tableSession.orders_count ?? 0,
              amount: formatPrice(tableSession.total_amount ?? 0),
            })}
          </Text>
        ) : null}
        <View style={styles.tableBarChange}>
          <Text style={styles.tableBarChangeText}>{t('takeOrder.changeTable')}</Text>
          <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
        </View>
      </Pressable>

      {/* Recherche — hors FlatList pour éviter tout remontage du champ */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.text.light} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('takeOrder.searchPlaceholder')}
          placeholderTextColor={colors.text.light}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.text.light} />
          </Pressable>
        )}
      </View>

      {/* Onglets de catégories */}
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[
              styles.tab,
              activeCategoryId === ALL_CATEGORIES_ID && styles.tabActive,
            ]}
            onPress={() => setActiveCategoryId(ALL_CATEGORIES_ID)}
          >
            <Text
              style={[
                styles.tabText,
                activeCategoryId === ALL_CATEGORIES_ID && styles.tabTextActive,
              ]}
            >
              {t('takeOrder.allCategories')}
            </Text>
          </Pressable>
          {categories.map(cat => {
            const isActive = cat.id === activeCategoryId;
            return (
              <Pressable
                key={cat.id}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveCategoryId(cat.id)}
              >
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {cat.emoji} {cat.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Liste des plats */}
      {isLoadingMenu && menus.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centeredText}>{t('takeOrder.loadingMenu')}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={item => String(menuItemIdOf(item))}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: (cartCount > 0 ? 96 : 16) + insets.bottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <DishCard
              item={item}
              cartQuantity={cart[menuItemIdOf(item)]?.quantity ?? 0}
              onAddToCart={addToCart}
              onDecrement={decrementFromCart}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="fast-food-outline" size={32} color={colors.text.light} />
              <Text style={styles.emptyText}>{t('takeOrder.noDishes')}</Text>
            </View>
          }
        />
      )}

      {/* Barre panier flottante */}
      {cartCount > 0 && (
        <Pressable
          style={[styles.cartBar, { bottom: insets.bottom + 12 }]}
          onPress={() => setReviewOpen(true)}
          android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
          accessibilityRole="button"
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
          <Text style={styles.cartBarText}>{t('takeOrder.reviewOrder')}</Text>
          <Text style={styles.cartBarTotal}>{formatPrice(cartTotal)}</Text>
        </Pressable>
      )}
    </>
  );

  return (
    <View style={styles.page}>
      <Header
        title={t('takeOrder.title')}
        subtitle={restaurant?.name}
        includeSafeArea
        leftIcon="close"
        onLeftPress={handleClose}
      />

      {alerts.length > 0 && (
        <View style={styles.alertsWrap}>
          {alerts.map(a => (
            <InlineAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id)}
            />
          ))}
        </View>
      )}

      {step === 'table' ? renderTableStep() : renderMenuStep()}

      {/* ─── Récapitulatif & validation ──────────────────────────────────── */}
      <Modal
        visible={reviewOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setReviewOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {t('takeOrder.reviewTitle', { table: tableNumber })}
              </Text>
              <Pressable onPress={() => setReviewOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
              {cartLines.map(line => {
                const unit = parseFloat(String((line.item as any).price ?? 0)) || 0;
                return (
                  <View key={menuItemIdOf(line.item)} style={styles.reviewLine}>
                    <View style={styles.reviewQtyBox}>
                      <Text style={styles.reviewQtyText}>{line.quantity}</Text>
                    </View>
                    <View style={styles.reviewInfo}>
                      <Text style={styles.reviewName} numberOfLines={2}>
                        {(line.item as any).name}
                      </Text>
                      <Text style={styles.reviewUnit}>{formatPrice(unit)}</Text>
                    </View>
                    <Text style={styles.reviewLineTotal}>
                      {formatPrice(unit * line.quantity)}
                    </Text>
                    <View style={styles.reviewControls}>
                      <Pressable
                        onPress={() => decrementFromCart(line.item)}
                        style={styles.reviewCtrlBtn}
                        hitSlop={6}
                      >
                        <Ionicons
                          name={line.quantity === 1 ? 'trash-outline' : 'remove'}
                          size={16}
                          color={line.quantity === 1 ? colors.error : colors.primary}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => addToCart(line.item)}
                        style={[styles.reviewCtrlBtn, styles.reviewCtrlBtnAdd]}
                        hitSlop={6}
                      >
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  </View>
                );
              })}

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{t('takeOrder.guestsLabel')}</Text>
                <TextInput
                  value={guestCount}
                  onChangeText={setGuestCount}
                  placeholder={t('takeOrder.guestsPlaceholder')}
                  placeholderTextColor={colors.text.light}
                  style={styles.fieldInput}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{t('takeOrder.notesLabel')}</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={t('takeOrder.notesPlaceholder')}
                  placeholderTextColor={colors.text.light}
                  style={[styles.fieldInput, styles.fieldInputMultiline]}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                />
              </View>

              {/* Encaissement */}
              <Text style={styles.fieldLabel}>{t('takeOrder.checkoutLabel')}</Text>
              {(['later', 'now'] as CheckoutMode[]).map(mode => {
                const selected = checkoutMode === mode;
                return (
                  <Pressable
                    key={mode}
                    style={[styles.payOption, selected && styles.payOptionSelected]}
                    onPress={() => setCheckoutMode(mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Ionicons
                      name={mode === 'later' ? 'time-outline' : 'card-outline'}
                      size={20}
                      color={selected ? colors.primary : colors.text.secondary}
                    />
                    <View style={styles.payOptionText}>
                      <Text style={[styles.payOptionTitle, selected && styles.payOptionTitleSel]}>
                        {t(`takeOrder.checkout.${mode}Title`)}
                      </Text>
                      <Text style={styles.payOptionDesc}>
                        {t(`takeOrder.checkout.${mode}Desc`)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('takeOrder.total')}</Text>
                <Text style={styles.totalValue}>{formatPrice(cartTotal)}</Text>
              </View>
              <Button
                title={
                  checkoutMode === 'now'
                    ? t('takeOrder.submitAndPay')
                    : t('takeOrder.submitToKitchen')
                }
                onPress={handleSubmit}
                loading={submitting}
                disabled={submitting || cartLines.length === 0}
                style={styles.submitButton}
                textStyle={{ color: INK_ON_GOLD }}
                leftIcon={
                  <Ionicons
                    name={checkoutMode === 'now' ? 'card' : 'send'}
                    size={18}
                    color={INK_ON_GOLD}
                  />
                }
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Échec d'impression du bon ───────────────────────────────────── */}
      <Modal
        visible={reprintTicket !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReprintTicket(null)}
      >
        <View style={styles.confirmOverlay}>
          <AlertWithAction
            variant="warning"
            title={t('takeOrder.printFailedTitle')}
            message={t('takeOrder.printFailedMessage', {
              table: reprintTicket?.tableNumber ?? '',
            })}
            secondaryButton={{
              text: t('takeOrder.printDismiss'),
              onPress: () => setReprintTicket(null),
            }}
            primaryButton={{
              text: t('common.retry'),
              onPress: handleReprint,
              variant: 'primary',
            }}
          />
        </View>
      </Modal>

      {/* ─── Confirmation d'abandon ──────────────────────────────────────── */}
      <Modal
        visible={discardConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscardConfirm(false)}
      >
        <View style={styles.confirmOverlay}>
          <AlertWithAction
            variant="warning"
            title={t('takeOrder.discardTitle')}
            message={t('takeOrder.discardMessage', { count: cartCount })}
            secondaryButton={{
              text: t('common.cancel'),
              onPress: () => setDiscardConfirm(false),
            }}
            primaryButton={{
              text: t('takeOrder.discardConfirm'),
              onPress: () => {
                setDiscardConfirm(false);
                resetCart();
                router.back();
              },
              variant: 'primary',
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const createStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },

    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
    centeredText: {
      fontSize: 15,
      color: colors.text.secondary,
      textAlign: 'center',
    },

    alertsWrap: { paddingHorizontal: 16, paddingTop: 8 },

    // ── Étape table ────────────────────────────────────────────────────────
    tableStepContent: { padding: 16, gap: 4 },
    stepTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 4,
    },
    stepSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 16,
    },
    tableGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    tableChip: {
      width: 96,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    tableChipNumber: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text.primary,
    },
    tableChipCapacity: { fontSize: 11, color: colors.text.light },

    manualBox: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.light,
      padding: 14,
      gap: 10,
    },
    manualLabel: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    manualRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    manualInput: {
      flex: 1,
      height: 44,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.light,
      backgroundColor: colors.background,
      color: colors.text.primary,
      fontSize: 16,
    },

    emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
    emptyText: { fontSize: 14, color: colors.text.light, textAlign: 'center' },

    // ── Bandeau table ──────────────────────────────────────────────────────
    tableBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.primary,
    },
    tableBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tableBarTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
    tableBarSession: {
      flex: 1,
      fontSize: 12,
      color: 'rgba(255,255,255,0.75)',
    },
    tableBarChange: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 'auto',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    tableBarChangeText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },

    // ── Recherche & onglets ────────────────────────────────────────────────
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      margin: 12,
      marginBottom: 8,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text.primary },

    tabsWrap: { paddingHorizontal: 12, paddingBottom: 8 },
    tab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginRight: 8,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.light,
    },
    tabActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
    tabTextActive: { color: '#FFFFFF' },

    listContent: { paddingHorizontal: 12, gap: 10 },

    // ── Barre panier ───────────────────────────────────────────────────────
    cartBar: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      height: 56,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.primary,
      elevation: 6,
      shadowColor: colors.shadow.default,
      shadowOpacity: isDark ? 0.5 : 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    cartBadge: {
      minWidth: 26,
      height: 26,
      paddingHorizontal: 6,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? GOLD_FILL_DARK : GOLD_FILL_LIGHT,
    },
    cartBadgeText: { fontSize: 13, fontWeight: '800', color: INK_ON_GOLD },
    cartBarText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
    cartBarTotal: { fontSize: 16, fontWeight: '800', color: colors.secondary },

    // ── Feuille de récapitulatif ───────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '90%',
      backgroundColor: colors.background,
      borderTopLeftRadius: BORDER_RADIUS.xl,
      borderTopRightRadius: BORDER_RADIUS.xl,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.light,
      marginBottom: 12,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
    sheetScroll: { flexGrow: 0 },

    reviewLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    reviewQtyBox: {
      minWidth: 28,
      height: 28,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    reviewQtyText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
    reviewInfo: { flex: 1 },
    reviewName: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    reviewUnit: { fontSize: 12, color: colors.text.light, marginTop: 2 },
    reviewLineTotal: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
    reviewControls: { flexDirection: 'row', gap: 6 },
    reviewCtrlBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border.light,
      backgroundColor: colors.surface,
    },
    reviewCtrlBtnAdd: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },

    fieldBlock: { marginTop: 16 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 6,
      marginTop: 16,
    },
    fieldInput: {
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.light,
      backgroundColor: colors.surface,
      color: colors.text.primary,
      fontSize: 15,
    },
    fieldInputMultiline: { minHeight: 80, textAlignVertical: 'top' },

    payOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      marginBottom: 8,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.light,
      backgroundColor: colors.surface,
    },
    payOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + (isDark ? '22' : '0D'),
    },
    payOptionText: { flex: 1 },
    payOptionTitle: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
    payOptionTitleSel: { color: colors.primary, fontWeight: '700' },
    payOptionDesc: { fontSize: 12, color: colors.text.secondary, marginTop: 2 },

    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border.default,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { borderColor: colors.primary },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },

    sheetFooter: {
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
      gap: 10,
    },
    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    submitButton: {
      backgroundColor: isDark ? GOLD_FILL_DARK : GOLD_FILL_LIGHT,
    },
    totalLabel: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
    totalValue: { fontSize: 22, fontWeight: '800', color: colors.text.primary },

    confirmOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
  });