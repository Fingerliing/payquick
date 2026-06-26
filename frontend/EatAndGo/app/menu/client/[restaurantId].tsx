import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Pressable,
  Image,
  Modal,
  Share,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

// Contexts & hooks
import { useCart } from '@/contexts/CartContext';
import { useSession } from '@/contexts/SessionContext';
import { useCollaborativeSession } from '@/hooks/session/useCollaborativeSession';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';
import { useSessionCart } from '@/hooks/session/useSessionCart';
import { useSessionArchiving, useInactivityWarning } from '@/hooks/session/useSessionArchiving';

// Services
import { menuService } from '@/services/menuService';
import { restaurantService } from '@/services/restaurantService';
import { dailyMenuService, PublicDailyMenu } from '@/services/dailyMenuService';
import { computeFormulaStatus, formatFormulaMissingMessage } from '@/utils/dailyMenuFormula';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';
import {
  MENU_LANGUAGES,
  getMenuLanguage,
  collectAvailableLanguages,
  type MenuLanguage,
} from '@/utils/menuLocale';

// UI components conservés
import { SessionJoinModal } from '@/components/session/SessionJoinModal';
import { Loading } from '@/components/ui/Loading';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import { UnpaidOrderGate } from '@/components/guards/UnpaidOrderGate';

// Types
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';

// Design system
import { useAppTheme, type AppColors, BORDER_RADIUS } from '@/utils/designSystem';
import { useTranslation } from 'react-i18next';

// =============================================================================
// HELPERS VISUELS
// =============================================================================

/**
 * Palette pastel pour la vignette d'un plat selon son nom.
 * Matche les codes de la maquette : viande/rose, soupe/orange, salade/jaune, etc.
 */
function inferDishVisual(name: string): { emoji: string; bg: string } {
  const n = (name || '').toLowerCase();

  if (n.includes('steak') || n.includes('boeuf') || n.includes('bœuf') || n.includes('entrec')
      || n.includes('carpaccio') || n.includes('tartare') || n.includes('viande'))
    return { emoji: '🥩', bg: '#FDE2E4' };

  if (n.includes('frites') || n.includes('frite'))
    return { emoji: '🍟', bg: '#FEF3C7' };

  if (n.includes('risotto') || n.includes('pasta') || n.includes('pâte') || n.includes('pate'))
    return { emoji: '🍝', bg: '#FEF3C7' };

  if (n.includes('tarte') || n.includes('gâteau') || n.includes('gateau'))
    return { emoji: '🥧', bg: '#FDE2E4' };

  if (n.includes('crème') || n.includes('creme') || n.includes('brûlée') || n.includes('brulee'))
    return { emoji: '🍮', bg: '#FEF3C7' };

  if (n.includes('salade') || n.includes('césar') || n.includes('cesar'))
    return { emoji: '🥗', bg: '#FEF3C7' };

  if (n.includes('canard') || n.includes('magret') || n.includes('volaille') || n.includes('poulet'))
    return { emoji: '🍗', bg: '#FED7AA' };

  if (n.includes('poisson') || n.includes('saumon') || n.includes('thon') || n.includes('cabillaud')
      || n.includes('moules') || n.includes('huîtres') || n.includes('huitres'))
    return { emoji: '🐟', bg: '#DBEAFE' };

  if (n.includes('pizza'))
    return { emoji: '🍕', bg: '#FED7AA' };

  if (n.includes('burger'))
    return { emoji: '🍔', bg: '#FED7AA' };

  if (n.includes('foie'))
    return { emoji: '🥖', bg: '#FEF3C7' };

  if (n.includes('soupe') || n.includes('velout') || n.includes('oignon'))
    return { emoji: '🍲', bg: '#FED7AA' };

  if (n.includes('vin') || n.includes('cocktail'))
    return { emoji: '🍷', bg: '#F3E8FF' };

  if (n.includes('café') || n.includes('cafe'))
    return { emoji: '☕', bg: '#E7E0D6' };

  if (n.includes('dessert') || n.includes('mousse'))
    return { emoji: '🍰', bg: '#FCE7F3' };

  return { emoji: '🍽️', bg: '#FEF3C7' };
}

/** Emoji pour l'onglet d'une catégorie selon son nom. */
function inferCategoryEmoji(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('entrée') || n.includes('entree') || n.includes('starter')) return '🥗';
  if (n.includes('plat') || n.includes('main')) return '🍖';
  if (n.includes('dessert')) return '🍰';
  if (n.includes('boisson') || n.includes('drink')) return '🍷';
  if (n.includes('vin') || n.includes('wine')) return '🍷';
  if (n.includes('café') || n.includes('cafe')) return '☕';
  if (n.includes('pizza')) return '🍕';
  return '🍴';
}

/** Format prix en EUR avec virgule française. */
function formatPrice(value: any): string {
  const n = parseFloat(String(value ?? 0));
  return `${n.toFixed(2).replace('.', ',')} €`;
}

// =============================================================================
// TYPES
// =============================================================================

interface MenuCategory {
  id: string;          // identifiant interne (= name pour les vraies catégories, ou DAILY_TAB_ID)
  name: string;        // nom affiché
  emoji: string;
  count: number;
  items: MenuItem[];
}

const DAILY_TAB_ID = '__daily_menu__';

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function ClientRestaurantPage() {
  const { restaurantId, sessionId, tableNumber: tableNumberParam, fromQR } =
  useLocalSearchParams<{
    restaurantId: string;
    sessionId?: string;
    tableNumber?: string;  // passé par QRAccessButton et app/t/[code].tsx
    fromQR?: string;       // '1' si l'utilisateur arrive d'un scan QR
  }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ─── SessionContext : source de vérité pour le participantId en mémoire ───
  const { session: ctxSession, participantId: ctxParticipantId, clearSession } = useSession();

  // Le sessionId peut venir de l'URL ou du contexte. On le filtre ensuite sur
  // le statut connu : une session 'completed'/'cancelled' ne doit pas alimenter
  // le panier partagé (le backend renvoie 404 sur cart_add, ce qui ferait
  // disparaître instantanément les items ajoutés en optimiste).
  const rawEffectiveSessionId = (sessionId as string | null) ?? ctxSession?.id ?? null;
  const effectiveSessionId = useMemo(() => {
    if (!rawEffectiveSessionId) return null;
    if (
      ctxSession?.id === rawEffectiveSessionId &&
      ctxSession?.status &&
      ctxSession.status !== 'active' &&
      ctxSession.status !== 'locked'
    ) {
      return null;
    }
    return rawEffectiveSessionId;
  }, [rawEffectiveSessionId, ctxSession?.id, ctxSession?.status]);

  const isHostRef = useRef(false);

  // Ref vers showToast pour pouvoir l'appeler dans onSessionGone (le hook
  // useSessionCart est instancié AVANT la déclaration de showToast, donc on
  // ne peut pas le référencer directement sans TDZ).
  const showToastRef = useRef<
    (variant: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => void
  >(() => {});

  // ─── Session cart ──────────────────────────────────────────────────────────
  const sessionCart = useSessionCart({
    sessionId: effectiveSessionId ?? undefined,
    participantId: ctxParticipantId,
    enabled: !!effectiveSessionId,
    onPaymentRequested: () => {
      if (!isHostRef.current) {
        router.replace('/(client)/orders' as any);
      }
    },
    // Auto-purge si la session a disparu côté serveur (404 sur cart_add/etc.) :
    // on bascule l'utilisateur en mode solo sans qu'il reste coincé sur une
    // session zombie qui empêcherait tout ajout au panier.
    onSessionGone: () => {
      showToastRef.current('warning', t('clientMenu.sessionEndedTitle'), t('clientMenu.sessionEndedMsg'));
      clearSession();
    },
  });

  // ─── Session collaborative ─────────────────────────────────────────────────
  const { session, isHost, approveParticipant, rejectParticipant, refresh } =
    useCollaborativeSession({
      sessionId: effectiveSessionId ?? undefined,
      externalParticipantId: ctxParticipantId,
    });
  isHostRef.current = isHost;

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  const { on } = useSessionWebSocket(effectiveSessionId);

  // ─── Expiration / inactivité ───────────────────────────────────────────────
  const { expiredAlert, dismissExpiredAlert } = useSessionArchiving({
    sessionId: effectiveSessionId,
  });
  const { isInactivityExpired } = useInactivityWarning(effectiveSessionId);

  // ─── Mode "pré-session" pour le scan QR sans session active ──────────────
// Quand un client scanne un QR de table et arrive ici SANS sessionId dans
// l'URL, on doit :
//   1. lui laisser parcourir le menu librement,
//   2. l'informer si une session collaborative existe déjà sur la table,
//   3. lui proposer d'ouvrir/rejoindre une session à la demande via le CTA
//      "Commander ensemble" dans le header.
//
// L'auth n'est PAS requise pour rejoindre une session (le backend accepte
// les invités via guest_name + X-Participant-ID). Le SessionJoinModal gère
// l'invité côté frontend.
const [showSessionJoinModal, setShowSessionJoinModal] = useState(false);
const [activeSessionOnTable, setActiveSessionOnTable] = useState<any>(null);

// ─── Langue d'affichage du menu (multilingue) ──────────────────────────────
const [lang, setLang] = useState<string>('fr');
const [showLanguagePicker, setShowLanguagePicker] = useState(false);
const [availableLanguages, setAvailableLanguages] =
  useState<MenuLanguage[]>(MENU_LANGUAGES.slice(0, 1));

useEffect(() => {
  // Si on est déjà dans une session active (sessionId en URL ou contexte),
  // pas besoin de vérifier — c'est notre session, gérée par les hooks
  // useCollaborativeSession et useSessionCart au-dessus.
  if (effectiveSessionId) {
    setActiveSessionOnTable(null);
    return;
  }
  if (!restaurantId || !tableNumberParam) return;

  let cancelled = false;
  (async () => {
    try {
      const found = await collaborativeSessionService.checkActiveSession(
        parseInt(restaurantId),
        tableNumberParam
      );
      if (!cancelled) setActiveSessionOnTable(found ?? null);
    } catch {
      // 404 = aucune session active — comportement attendu, on ne loggue pas
      if (!cancelled) setActiveSessionOnTable(null);
    }
  })();

  return () => { cancelled = true; };
}, [effectiveSessionId, restaurantId, tableNumberParam]);

// ─── Handlers SessionJoinModal ───────────────────────────────────────────
// Réutilise la même logique que QRAccessButton, mais avec les params déjà
// connus depuis l'URL du menu.
const handleSessionJoinedFromMenu = useCallback((joinedSession: any) => {
  setShowSessionJoinModal(false);
  if (!restaurantId) return;
  router.replace({
    pathname: `/menu/client/${restaurantId}` as any,
    params: {
      restaurantId,
      tableNumber: tableNumberParam ?? joinedSession.table_number ?? '',
      sessionId: joinedSession.id,
    },
  });
}, [restaurantId, tableNumberParam]);

const handleOrderAloneFromMenu = useCallback(() => {
  setShowSessionJoinModal(false);
  // Pas de redirection : on reste sur le menu en mode solo
}, []);

  // ─── Auto-redirection ──────────────────────────────────────────────────────
  const redirectedRef = useRef(false);
  const splitPaymentAlertRef = useRef<any>(null);

  const redirectToHome = useCallback(() => {
    if (redirectedRef.current) return;
    if (splitPaymentAlertRef.current) return;
    redirectedRef.current = true;
    dismissExpiredAlert();
    clearSession();
    router.replace('/(client)');
  }, [clearSession, dismissExpiredAlert]);

  useEffect(() => {
    if (!effectiveSessionId) return;
    const unsubCompleted = on('session_completed', () => redirectToHome());
    const unsubArchived = on('session_archived', () => redirectToHome());
    return () => {
      unsubCompleted();
      unsubArchived();
    };
  }, [effectiveSessionId, on, redirectToHome]);

  useEffect(() => {
    if (effectiveSessionId && !ctxSession) {
      redirectToHome();
    }
  }, [ctxSession, effectiveSessionId, redirectToHome]);

  useEffect(() => {
    if (isInactivityExpired) redirectToHome();
  }, [isInactivityExpired, redirectToHome]);

  useEffect(() => {
    if (!effectiveSessionId) return;
    const unsub = on('session_update', (data: any) => {
      if (data?.event === 'participant_pending') {
        refresh();
      } else if (data?.event === 'payment' && !isHost) {
        router.replace('/(client)/orders' as any);
      }
    });
    const unsubSplit = on('split_payment_initiated' as any, (data: any) => {
      if (isHost) return;
      setSplitPaymentAlert({
        orderId: data.order_id,
        portionsCount: data.portions_count ?? 2,
        totalAmount: data.total_amount ?? '',
      });
    });
    return () => {
      unsub();
      unsubSplit();
    };
  }, [effectiveSessionId, on, refresh, isHost]);

  useEffect(() => {
    if (session?.status === 'payment' && !isHost) {
      router.replace('/(client)/orders' as any);
    }
  }, [session?.status, isHost]);

  // ─── Cart ──────────────────────────────────────────────────────────────────
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart } = useCart();

  // ─── État principal ────────────────────────────────────────────────────────
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [dailyMenu, setDailyMenu] = useState<PublicDailyMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // ─── États UI/alertes ──────────────────────────────────────────────────────
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
  const [pendingRequest, setPendingRequest] = useState<{ id: string; name: string } | null>(null);
  const [splitPaymentAlert, setSplitPaymentAlert] = useState<{
    orderId: string;
    portionsCount: number;
    totalAmount: string;
  } | null>(null);
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  splitPaymentAlertRef.current = splitPaymentAlert;
  const prevPendingCountRef = useRef(0);

  // Détecter les nouvelles demandes de participation (côté hôte)
  useEffect(() => {
    if (!session || !isHost) return;
    const pendingParticipants = session.participants?.filter((p) => p.status === 'pending') ?? [];
    const currentCount = pendingParticipants.length;
    if (currentCount > prevPendingCountRef.current) {
      const newest = pendingParticipants[currentCount - 1];
      setPendingRequest({
        id: newest.id,
        name: newest?.display_name ?? t('clientMenu.someone'),
      });
    }
    prevPendingCountRef.current = currentCount;
  }, [session?.participants, isHost]);

  // ─── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback(
    (variant: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
      setToast({ visible: true, variant, title, message });
      setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    },
    []
  );

  // Garder la ref de showToast synchronisée pour que onSessionGone (passé à
  // useSessionCart plus haut) puisse l'appeler une fois que la fonction existe.
  showToastRef.current = showToast;

  // ─── Chargement données ────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setIsLoading(true);
      const parsedId = parseInt(restaurantId, 10);

      // Le daily menu est optionnel : un 404 (pas de menu du jour aujourd'hui)
      // ne doit pas faire échouer le chargement de la page entière.
      const [restaurantData, menusData, dailyMenuRes] = await Promise.all([
        restaurantService.getPublicRestaurant(restaurantId),
        menuService.getPublicMenusByRestaurant(parsedId, lang),
        dailyMenuService.getPublicDailyMenu(parsedId).catch(() => null),
      ]);
      setRestaurant(restaurantData);

      // Résout les noms/descriptions dans la langue choisie : on écrase
      // `name`/`description` par les valeurs traduites (display_*), pour que
      // tout le reste de l'écran (DishCard, panier, recherche) les utilise
      // sans changement. Le nom français reste accessible via `_originalName`.
      const localizedMenus = (menusData || []).map((m: any) => ({
        ...m,
        items: (m.items || []).map((it: any) => ({
          ...it,
          _originalName: it.name,
          name: it.display_name || it.name,
          description: it.display_description || it.description || '',
        })),
      }));
      setMenus(localizedMenus);

      // Langues réellement disponibles, agrégées sur tous les plats.
      const allItems = (menusData || []).flatMap((m: any) => m.items || []);
      setAvailableLanguages(
        collectAvailableLanguages(allItems.map((it: any) => it.available_languages)),
      );

      setDailyMenu(dailyMenuRes);
    } catch (error) {
      showToast('error', t('common.error'), t('clientMenu.loadFailed'));
      setRestaurant(null);
      setMenus([]);
      setDailyMenu(null);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, showToast, lang]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Catégories ────────────────────────────────────────────────────────────
  const allMenuItems = useMemo(() => menus.flatMap(m => m.items || []), [menus]);

  const categories = useMemo<MenuCategory[]>(() => {
    // On capture l'ordre defini cote restaurateur (champ `category_order`
    // expose par MenuItemSerializer depuis l'ecran "Reorganiser les
    // categories"). Si plusieurs items d'une meme categorie portent un
    // ordre different (incoherence backend), on garde le plus petit.
    const map = new Map<string, MenuCategory & { _order: number }>();
    allMenuItems.forEach(item => {
      const catName = item.category_name || 'Autres';
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
      const cat = map.get(catName)!;
      cat.items.push(item);
      cat.count++;
      if (order < cat._order) cat._order = order;
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a._order !== b._order) return a._order - b._order;
      return a.name.localeCompare(b.name); // tie-breaker stable
    });
  }, [allMenuItems]);

  // ─── Menu du jour : config formule + items aplatis ─────────────────────
  /**
   * Configuration de la formule du menu du jour.
   * - is_formula: true si le menu a un special_price ET au moins une catégorie
   * - pricePerCategory: special_price / nb_catégories (le prix à afficher
   *   sur chaque DishCard du menu du jour)
   * - On retombe sur la propriété backend `is_formula` / `price_per_category`
   *   si dispo, sinon on recalcule côté client (compat avec ancien backend).
   */
  const dailyMenuConfig = useMemo(() => {
    if (!dailyMenu) {
      return { isFormula: false, pricePerCategory: null as number | null, categoriesCount: 0, totalPrice: null as number | null };
    }
    const cats = dailyMenu.items_by_category ?? [];
    const categoriesCount = (dailyMenu as any).categories_count ?? cats.length ?? 0;
    const totalPrice = dailyMenu.special_price != null
      ? Number(dailyMenu.special_price)
      : null;
    const backendFormula = (dailyMenu as any).is_formula;
    const isFormula = typeof backendFormula === 'boolean'
      ? backendFormula
      : (totalPrice != null && categoriesCount > 0);
    let pricePerCategory: number | null = (dailyMenu as any).price_per_category ?? null;
    if (pricePerCategory == null && isFormula && totalPrice != null && categoriesCount > 0) {
      pricePerCategory = Math.round((totalPrice / categoriesCount) * 100) / 100;
    }
    return { isFormula, pricePerCategory, categoriesCount, totalPrice };
  }, [dailyMenu]);

  // Items du menu du jour aplatis au format MenuItem pour réutiliser DishCard.
  // L'ID conservé est `menu_item` (l'ID du MenuItem original) — c'est cet
  // ID qui est attendu par sessionCart.addItem et par le panier solo.
  // Le prix appliqué est :
  //   - le prix de la formule (special_price / nb_catégories) si formule
  //   - sinon l'effective_price renvoyé par le backend
  const dailyMenuItems = useMemo<MenuItem[]>(() => {
    if (!dailyMenu) return [];
    const items: MenuItem[] = [];
    for (const cat of dailyMenu.items_by_category ?? []) {
      const catId = (cat as any).category_id ?? cat.name;
      for (const it of cat.items ?? []) {
        const formulaPrice = dailyMenuConfig.isFormula && dailyMenuConfig.pricePerCategory != null
          ? dailyMenuConfig.pricePerCategory
          : null;
        const displayPrice = formulaPrice != null
          ? formulaPrice
          : (it.effective_price ?? (it as any).price ?? 0);

        items.push({
          id: it.menu_item ?? (it as any).id,
          name: it.menu_item_name ?? (it as any).name ?? '',
          description: it.menu_item_description ?? (it as any).description ?? '',
          price: displayPrice,
          image_url: it.menu_item_image ?? (it as any).image_url ?? null,
          is_available: it.is_available !== false,
          category_name: it.menu_item_category ?? cat.name,
          // Marqueurs internes pour la logique "1 par catégorie"
          _dailyCategoryId: catId,
          _dailyCategoryName: cat.name,
        } as any);
      }
    }
    return items;
  }, [dailyMenu, dailyMenuConfig]);

  /**
   * Map menuItemId -> identifiant de la catégorie du menu du jour.
   * Permet de retrouver, pour un item présent dans le panier, à quel "slot"
   * de catégorie du menu du jour il correspond. Sert à appliquer la règle
   * "un seul item par catégorie dans le menu du jour".
   */
  const dailyCategoryByMenuItemId = useMemo(() => {
    const map = new Map<number, string>();
    for (const it of dailyMenuItems) {
      const id = Number((it as any).id);
      const catId = (it as any)._dailyCategoryId;
      if (Number.isFinite(id) && catId) {
        map.set(id, String(catId));
      }
    }
    return map;
  }, [dailyMenuItems]);

  // Onglets : Menu du jour (si présent et non vide) + catégories
  const tabs = useMemo<MenuCategory[]>(() => {
    const list: MenuCategory[] = [];
    if (dailyMenu && (dailyMenu.total_items_count ?? 0) > 0 && dailyMenuItems.length > 0) {
      list.push({
        id: DAILY_TAB_ID,
        name: dailyMenu.title || 'Menu du jour',
        emoji: '⭐',
        count: dailyMenuItems.length,
        items: dailyMenuItems,
      });
    }
    return [...list, ...categories];
  }, [dailyMenu, dailyMenuItems, categories]);

  // Initialiser l'onglet actif sur le premier disponible
  useEffect(() => {
    if (!activeTabId && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    } else if (activeTabId && !tabs.find(t => t.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id ?? null);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const isDailyTab = activeTabId === DAILY_TAB_ID;

  // ─── Cart total ────────────────────────────────────────────────────────────
  const totalCartItems = useMemo(
    () => effectiveSessionId ? sessionCart.items_count : (cart.itemCount || 0),
    [effectiveSessionId, sessionCart.items_count, cart.itemCount]
  );

  // Map menuItemId -> quantité actuelle dans le panier (pour afficher le badge
  // et basculer entre "+" et contrôles inline sur les DishCards).
  // En mode session, on ne compte QUE les items du participant courant.
  const cartQuantities = useMemo(() => {
    const map = new Map<number, number>();
    if (effectiveSessionId) {
      sessionCart.myItems.forEach((it) => {
        const id = Number(it.menu_item);
        if (Number.isFinite(id)) map.set(id, (map.get(id) ?? 0) + it.quantity);
      });
    } else {
      cart.items.forEach((it) => {
        const id = Number(it.menuItemId);
        if (Number.isFinite(id)) map.set(id, (map.get(id) ?? 0) + it.quantity);
      });
    }
    return map;
  }, [effectiveSessionId, sessionCart.myItems, cart.items]);

  const getCartQuantity = useCallback(
    (item: MenuItem) => {
      const id = typeof (item as any).id === 'number'
        ? (item as any).id
        : parseInt(String((item as any).id), 10);
      return cartQuantities.get(id) ?? 0;
    },
    [cartQuantities]
  );

  // ─── Données enrichies pour l'onglet menu du jour ──────────────────────────
  // Pour l'onglet "Menu du jour" on insère des en-têtes de catégorie entre
  // les groupes de plats afin que le client comprenne qu'il doit choisir
  // 1 plat par catégorie. Pour les onglets de la carte normale (une seule
  // catégorie par onglet par construction), on garde la liste plate.
  type DailyListRow =
    | { kind: 'header'; key: string; categoryId: string; name: string; completed: boolean }
    | { kind: 'item'; key: string; item: MenuItem };

  const dailyListData = useMemo<DailyListRow[]>(() => {
    if (!isDailyTab) return [];
    const items = (activeTab?.items ?? []) as MenuItem[];
    const rows: DailyListRow[] = [];
    let currentCatId: string | null = null;
    for (const item of items) {
      const catId = String((item as any)._dailyCategoryId ?? '');
      const catName = String((item as any)._dailyCategoryName ?? (item as any).category_name ?? '');
      if (catId && catId !== currentCatId) {
        currentCatId = catId;
        // Une catégorie est "complétée" si au moins un de ses plats est dans
        // le panier. La logique 1-par-catégorie côté handleAddToCart garantit
        // qu'il n'y en a qu'un à la fois.
        const completed = items.some(it => {
          const itCat = String((it as any)._dailyCategoryId ?? '');
          if (itCat !== catId) return false;
          const id = Number((it as any).id);
          return Number.isFinite(id) && (cartQuantities.get(id) ?? 0) > 0;
        });
        rows.push({
          kind: 'header',
          key: `h-${catId}`,
          categoryId: catId,
          name: catName,
          completed,
        });
      }
      rows.push({
        kind: 'item',
        key: `i-${(item as any).id}`,
        item,
      });
    }
    return rows;
  }, [isDailyTab, activeTab?.items, cartQuantities]);

  // ─── Validation de la formule menu du jour ─────────────────────────────────
  // Règle : dès qu'un plat de la formule est dans le panier, le client doit
  // avoir un plat par catégorie distincte avant de pouvoir passer commande.
  // Sinon il pourrait obtenir un plat à la carte moins cher en partie de formule.
  const formulaCartLines = useMemo(() => {
    const lines: Array<{ menuItemId: number; quantity: number }> = [];
    cartQuantities.forEach((qty, menuItemId) => {
      if (Number.isFinite(menuItemId) && qty > 0) {
        lines.push({ menuItemId, quantity: qty });
      }
    });
    return lines;
  }, [cartQuantities]);

  const formulaStatus = useMemo(
    () => computeFormulaStatus(dailyMenu, formulaCartLines),
    [dailyMenu, formulaCartLines]
  );

  // Verrou : bouton panier désactivé tant que la formule n'est pas valide.
  const cartLocked = !formulaStatus.isValid;

  // Animation pulse du panier flottant à chaque ajout (déclenchée via ref tick)
  const cartPulse = useRef(new Animated.Value(1)).current;
  const triggerCartPulse = useCallback(() => {
    cartPulse.stopAnimation();
    cartPulse.setValue(1);
    Animated.sequence([
      Animated.timing(cartPulse, {
        toValue: 1.08,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(cartPulse, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cartPulse]);

  // ─── Handlers cart ─────────────────────────────────────────────────────────
  const handleAddToCart = useCallback(
    async (item: MenuItem) => {
      const parsedRestaurantId = parseInt(restaurantId, 10);
      const menuItemId =
        typeof (item as any).id === 'number'
          ? (item as any).id
          : parseInt(String((item as any).id), 10);

      // ─── Logique formule "menu du jour" ──────────────────────────────
      // Si l'item provient de l'onglet menu du jour ET que le menu est en
      // mode formule (special_price défini), on applique deux règles :
      //   1) Quantité plafonnée à 1 par item (la formule = 1 plat / catégorie).
      //   2) Un seul item par catégorie de la formule : si une autre
      //      sélection occupe déjà le même "slot", on la remplace.
      const dailyCatId = (item as any)._dailyCategoryId as string | undefined;
      const isDailyFormulaItem = !!dailyCatId && dailyMenuConfig.isFormula;

      if (isDailyFormulaItem) {
        // Règle 1 : déjà sélectionné → ne rien faire
        if (effectiveSessionId) {
          const existing = sessionCart.myItems.find((ci) => Number(ci.menu_item) === menuItemId);
          if (existing && existing.quantity >= 1) {
            showToast('info', t('clientMenu.alreadySelectedTitle'), t('clientMenu.alreadySelectedMsg', { name: item.name }));
            return;
          }
        } else {
          const existing = cart.items.find((ci) => Number(ci.menuItemId) === menuItemId);
          if (existing && existing.quantity >= 1) {
            showToast('info', t('clientMenu.alreadySelectedTitle'), t('clientMenu.alreadySelectedMsg', { name: item.name }));
            return;
          }
        }

        // Règle 2 : retirer toute sélection actuelle du même slot de catégorie
        if (effectiveSessionId) {
          const conflicting = sessionCart.myItems.find((ci) => {
            const otherCatId = dailyCategoryByMenuItemId.get(Number(ci.menu_item));
            return !!otherCatId && otherCatId === dailyCatId;
          });
          if (conflicting) {
            try {
              await sessionCart.removeItem(conflicting.id);
            } catch {
              // best-effort, on continue à ajouter le nouveau choix
            }
          }
        } else {
          const conflicting = cart.items.find((ci) => {
            const otherCatId = dailyCategoryByMenuItemId.get(Number(ci.menuItemId));
            return !!otherCatId && otherCatId === dailyCatId;
          });
          if (conflicting) {
            removeFromCart(conflicting.id);
          }
        }
      }

      // Mode session collaborative
      if (effectiveSessionId) {
        try {
          await sessionCart.addItem({ menu_item: menuItemId, quantity: 1 });
          await sessionCart.refresh();
          triggerCartPulse();
          showToast('success', t('clientMenu.addedSharedTitle'), t('clientMenu.addedMsg', { name: item.name }));
        } catch (err) {
          showToast('error', t('common.error'), t('clientMenu.addSharedFailed'));
        }
        return;
      }

      // Mode solo : confirmation si panier d'un autre restaurant
      if (cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== parsedRestaurantId) {
        setConfirmCartSwitch({ visible: true, item });
        return;
      }

      const cartItem = {
        id: String(menuItemId),
        menuItemId,
        name: item.name,
        description: (item as any).description,
        price: parseFloat(String((item as any).price ?? 0)) || 0,
        image: (item as any).image_url,
        restaurantId: parsedRestaurantId,
        restaurantName: restaurant?.name || '',
        customizations: {},
        specialInstructions: '',
      };
      addToCart(cartItem);
      triggerCartPulse();
      showToast('success', t('clientMenu.addedTitle'), t('clientMenu.addedMsg', { name: item.name }));
    },
    [
      effectiveSessionId, sessionCart, cart.items, cart.restaurantId,
      restaurantId, restaurant, addToCart, removeFromCart, showToast, triggerCartPulse,
      dailyMenuConfig.isFormula, dailyCategoryByMenuItemId,
    ]
  );

  const proceedAddToCart = useCallback(
    (item: MenuItem) => {
      const parsedRestaurantId = parseInt(restaurantId, 10);
      clearCart();
      const menuItemId =
        typeof (item as any).id === 'number'
          ? (item as any).id
          : parseInt(String((item as any).id), 10);
      const cartItem = {
        id: String(menuItemId),
        menuItemId,
        name: item.name,
        description: (item as any).description,
        price: parseFloat(String((item as any).price ?? 0)) || 0,
        image: (item as any).image_url,
        restaurantId: parsedRestaurantId,
        restaurantName: restaurant?.name || '',
        customizations: {},
        specialInstructions: '',
      };
      addToCart(cartItem);
      triggerCartPulse();
      showToast('success', t('clientMenu.addedTitle'), t('clientMenu.addedMsg', { name: item.name }));
    },
    [clearCart, addToCart, restaurantId, restaurant, showToast, triggerCartPulse]
  );

  /**
   * Décrémente la quantité d'un plat depuis la DishCard.
   * - Mode solo : remove si qty == 1, sinon updateQuantity.
   * - Mode session : agit sur le PREMIER item du participant courant
   *   matchant ce menu_item.
   */
  const handleDecrementFromCart = useCallback(
    async (item: MenuItem) => {
      const id = typeof (item as any).id === 'number'
        ? (item as any).id
        : parseInt(String((item as any).id), 10);

      // Mode session collaborative
      if (effectiveSessionId) {
        const myItem = sessionCart.myItems.find((it) => Number(it.menu_item) === id);
        if (!myItem) return;
        try {
          if (myItem.quantity <= 1) {
            await sessionCart.removeItem(myItem.id);
          } else {
            await sessionCart.updateItem(myItem.id, { quantity: myItem.quantity - 1 });
          }
        } catch {
          showToast('error', t('common.error'), t('clientMenu.removeItemFailed'));
        }
        return;
      }

      // Mode solo
      const cartItem = cart.items.find((ci) => ci.menuItemId === id);
      if (!cartItem) return;
      if (cartItem.quantity <= 1) {
        removeFromCart(cartItem.id);
      } else {
        updateQuantity(cartItem.id, cartItem.quantity - 1);
      }
    },
    [effectiveSessionId, sessionCart, cart.items, removeFromCart, updateQuantity, showToast]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ─── Handlers session sheet ────────────────────────────────────────────────
  const handleCopyCode = useCallback(async () => {
    if (!session?.share_code) return;
    try {
      await Clipboard.setStringAsync(session.share_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      showToast('error', t('common.error'), t('clientMenu.copyCodeFailed'));
    }
  }, [session?.share_code, showToast]);

  const handleShareCode = useCallback(async () => {
    if (!session?.share_code || !restaurant) return;
    try {
      await Share.share({
        message: t('clientMenu.shareMessage', { name: restaurant.name, code: session.share_code }),
        title: t('clientMenu.shareTitle'),
      });
    } catch {
      // ignore cancel
    }
  }, [session?.share_code, restaurant]);

  // ─── Loading / not found ───────────────────────────────────────────────────
  if (isLoading) {
    return <Loading fullScreen text={t('clientMenu.loadingMenu')} />;
  }

  if (!restaurant) {
    return (
      <View style={styles.notFound}>
        <Ionicons name="restaurant-outline" size={64} color={colors.text.light} />
        <Text style={styles.notFoundTitle}>{t('clientMenu.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.notFoundBtn}>
          <Text style={styles.notFoundBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tableLabel = session?.table_number
    ? t('clientMenu.table', { number: String(session.table_number).padStart(2, '0') })
    : t('clientMenu.welcome');

  // ─── Rendu principal ───────────────────────────────────────────────────────
  return (
    <UnpaidOrderGate>
      <View style={styles.page}>
        {/* Toast */}
        {toast.visible && (
          <View style={[styles.toastContainer, { top: insets.top + 8 }]} pointerEvents="box-none">
            <View style={styles.toastInner}>
              <InlineAlert
                variant={toast.variant}
                title={toast.title}
                message={toast.message}
                onDismiss={() => setToast(prev => ({ ...prev, visible: false }))}
              />
            </View>
          </View>
        )}

        {/* Alertes critiques (split, expired, pending, confirmCartSwitch) */}
        {splitPaymentAlert && (
          <View style={styles.alertWrap}>
            <AlertWithAction
              variant="info"
              title={t('clientMenu.splitTitle')}
              message={
                splitPaymentAlert.totalAmount
                  ? t('clientMenu.splitMsgAmount', { amount: splitPaymentAlert.totalAmount, count: splitPaymentAlert.portionsCount })
                  : t('clientMenu.splitMsg', { count: splitPaymentAlert.portionsCount })
              }
              autoDismiss={false}
              primaryButton={{
                text: t('clientMenu.payMyShare'),
                variant: 'primary',
                onPress: () => {
                  const { orderId } = splitPaymentAlert;
                  setSplitPaymentAlert(null);
                  router.push(`/order/payment?orderId=${orderId}&splitView=member` as any);
                },
              }}
              secondaryButton={{
                text: t('clientMenu.later'),
                onPress: () => setSplitPaymentAlert(null),
              }}
            />
          </View>
        )}

        {expiredAlert && !splitPaymentAlert && (
          <View style={styles.alertWrap}>
            <AlertWithAction
              variant="warning"
              title={expiredAlert.title}
              message={expiredAlert.message}
              autoDismiss={false}
              primaryButton={{
                text: t('clientMenu.backHome'),
                variant: 'primary',
                onPress: async () => {
                  dismissExpiredAlert();
                  try { await clearSession(); } catch {}
                  router.replace('/(client)');
                },
              }}
            />
          </View>
        )}

        {pendingRequest && (
          <View style={styles.alertWrap}>
            <AlertWithAction
              variant="info"
              title={t('clientMenu.newRequestTitle')}
              message={t('clientMenu.newRequestMsg', { name: pendingRequest.name })}
              primaryButton={{
                text: t('clientMenu.accept'),
                variant: 'primary',
                onPress: async () => {
                  const id = pendingRequest.id;
                  setPendingRequest(null);
                  try { await approveParticipant(id); }
                  catch { showToast('error', t('common.error'), t('clientMenu.approveFailed')); }
                },
              }}
              secondaryButton={{
                text: t('clientMenu.reject'),
                onPress: async () => {
                  const id = pendingRequest.id;
                  setPendingRequest(null);
                  try { await rejectParticipant(id); }
                  catch { showToast('error', t('common.error'), t('clientMenu.rejectFailed')); }
                },
              }}
            />
          </View>
        )}

        {confirmCartSwitch.visible && (
          <View style={styles.alertWrap}>
            <AlertWithAction
              variant="warning"
              title={t('clientMenu.switchRestaurantTitle')}
              message={t('clientMenu.switchRestaurantMsg')}
              autoDismiss={false}
              onDismiss={() => setConfirmCartSwitch({ visible: false, item: null })}
              secondaryButton={{
                text: t('common.cancel'),
                onPress: () => setConfirmCartSwitch({ visible: false, item: null }),
              }}
              primaryButton={{
                text: t('common.continue'),
                variant: 'danger',
                onPress: () => {
                  if (confirmCartSwitch.item) proceedAddToCart(confirmCartSwitch.item);
                  setConfirmCartSwitch({ visible: false, item: null });
                },
              }}
            />
          </View>
        )}

        {/* ─── Header navy ──────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          {/* Côté droit : bouton "Commander ensemble" si pas en session,
              sinon placeholder pour équilibrer */}
          {!effectiveSessionId && tableNumberParam ? (
            <Pressable
              onPress={() => setShowSessionJoinModal(true)}
              style={({ pressed }) => [
                styles.headerActionButton,
                pressed && { opacity: 0.7 },
              ]}
              hitSlop={8}
            >
              <Ionicons name="people" size={20} color={colors.secondary} />
            </Pressable>
          ) : (
            <View style={styles.headerSide} />
          )}

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {restaurant.name}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {tableLabel}
            </Text>
          </View>

          {/* Sélecteur de langue (visible si plus d'une langue traduite) */}
          {availableLanguages.length > 1 ? (
            <Pressable
              onPress={() => setShowLanguagePicker(true)}
              style={styles.headerSide}
              hitSlop={8}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.inverse }}>
                {getMenuLanguage(lang).flag} {lang.toUpperCase()}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>

        {/* ─── Bandeau session active sur la table (hors session courante) ── */}
        {activeSessionOnTable && !effectiveSessionId && (
          <Pressable
            onPress={() => setShowSessionJoinModal(true)}
            style={({ pressed }) => [
              styles.activeSessionBanner,
              pressed && { opacity: 0.95 },
            ]}
            android_ripple={{ color: colors.success + '15' }}
          >
            <View style={styles.activeSessionBannerLeft}>
              <Ionicons name="people" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.activeSessionBannerTitle}>
                  {t('clientMenu.activeSessionTitle')}
                </Text>
                <Text style={styles.activeSessionBannerSubtitle}>
                  {t('clientMenu.participantsCount', { count: activeSessionOnTable.participant_count ?? 0 })}
                  {activeSessionOnTable.share_code ? t('clientMenu.codeSuffix', { code: activeSessionOnTable.share_code }) : ''}
                </Text>
              </View>
            </View>
            <View style={styles.activeSessionBannerCTA}>
              <Text style={styles.activeSessionBannerCTAText}>{t('clientMenu.join')}</Text>
              <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
            </View>
          </Pressable>
        )}

        {/* ─── Banner code de session (si session collaborative active) ──── */}
        {session?.share_code ? (
          <Pressable
            onPress={() => setSessionSheetOpen(true)}
            style={({ pressed }) => [styles.sessionBanner, pressed && { opacity: 0.95 }]}
            android_ripple={{ color: colors.primary + '15' }}
          >
            <View style={styles.sessionBannerLeft}>
              <Ionicons name="people" size={16} color={colors.secondary} />
              <View>
                <Text style={styles.sessionBannerLabel}>{t('clientMenu.sessionCode')}</Text>
                <Text style={styles.sessionBannerCode}>{session.share_code}</Text>
              </View>
            </View>
            <View style={styles.sessionBannerActions}>
              <Pressable
                onPress={(e) => { e.stopPropagation(); handleCopyCode(); }}
                style={({ pressed }) => [styles.sessionBannerAction, pressed && { opacity: 0.6 }]}
                hitSlop={6}
              >
                <Ionicons
                  name={codeCopied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={codeCopied ? colors.success : colors.primary}
                />
              </Pressable>
              <Pressable
                onPress={(e) => { e.stopPropagation(); handleShareCode(); }}
                style={({ pressed }) => [styles.sessionBannerAction, pressed && { opacity: 0.6 }]}
                hitSlop={6}
              >
                <Ionicons name="share-social-outline" size={18} color={colors.primary} />
              </Pressable>
              {(session.participant_count ?? 0) > 0 && (
                <View style={styles.sessionBannerCount}>
                  <Ionicons name="people-outline" size={14} color={colors.primary} />
                  <Text style={styles.sessionBannerCountText}>{session.participant_count}</Text>
                </View>
              )}
            </View>
          </Pressable>
        ) : null}

        {/* ─── Onglets catégories scrollables ───────────────────────────── */}
        <View style={styles.tabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {tabs.map(tab => {
              const isActive = tab.id === activeTabId;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTabId(tab.id)}
                  style={({ pressed }) => [
                    styles.tab,
                    isActive && styles.tabActive,
                    pressed && { opacity: 0.85 },
                  ]}
                  android_ripple={{ color: colors.primary + '20', borderless: false }}
                >
                  <Text style={styles.tabEmoji}>{tab.emoji}</Text>
                  <Text style={[styles.tabText, isActive && styles.tabTextActive]} numberOfLines={1}>
                    {tab.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── Liste de plats (commune aux onglets daily et catégories) ──── */}
        <FlatList<any>
          data={isDailyTab ? dailyListData : (activeTab?.items ?? [])}
          keyExtractor={(row: any) =>
            isDailyTab ? row.key : String(row?.id)
          }
          renderItem={({ item: row }: { item: any }) => {
            if (isDailyTab && row?.kind === 'header') {
              return (
                <View style={styles.dailyCategoryHeader}>
                  <View style={styles.dailyCategoryHeaderInner}>
                    <Text style={styles.dailyCategoryHeaderTitle}>{row.name}</Text>
                    {row.completed ? (
                      <View style={styles.dailyCategoryHeaderBadge}>
                        <Ionicons name="checkmark" size={12} color={colors.surface} />
                        <Text style={styles.dailyCategoryHeaderBadgeText}>{t('clientMenu.chosen')}</Text>
                      </View>
                    ) : (
                      <Text style={styles.dailyCategoryHeaderHint}>{t('clientMenu.chooseOne')}</Text>
                    )}
                  </View>
                  <View style={styles.dailyCategoryHeaderDivider} />
                </View>
              );
            }
            const item = isDailyTab ? row.item : row;
            return (
              <DishCard
                item={item}
                cartQuantity={getCartQuantity(item)}
                onAddToCart={handleAddToCart}
                onDecrement={handleDecrementFromCart}
                lockedQuantity={isDailyTab && dailyMenuConfig.isFormula && !!(item as any)._dailyCategoryId}
              />
            );
          }}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(120, insets.bottom + 100) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            isDailyTab && dailyMenuConfig.isFormula ? (
              <DailyFormulaBanner
                totalPrice={dailyMenuConfig.totalPrice ?? 0}
                pricePerCategory={dailyMenuConfig.pricePerCategory ?? 0}
                categoriesCount={dailyMenuConfig.categoriesCount}
                description={dailyMenu?.description ?? null}
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={48} color={colors.text.light} />
              <Text style={styles.emptyText}>
                {isDailyTab ? t('clientMenu.emptyDaily') : t('clientMenu.emptyCategory')}
              </Text>
            </View>
          }
        />

        {/* ─── Floating cart button ─────────────────────────────────────── */}
        {totalCartItems > 0 && (
          <Animated.View
            style={[
              styles.floatingCart,
              {
                bottom: Math.max(20, insets.bottom + 10),
                transform: [{ scale: cartPulse }],
                opacity: cartLocked ? 0.85 : 1,
              },
            ]}
          >
            <Pressable
              style={[
                styles.floatingCartInner,
                cartLocked && { backgroundColor: colors.text.secondary },
              ]}
              onPress={() => {
                if (cartLocked) {
                  const msg = formatFormulaMissingMessage(formulaStatus)
                    ?? t('clientMenu.completeFormula');
                  showToast('warning', t('clientMenu.formulaIncomplete'), msg);
                  return;
                }
                router.push('/(client)/cart' as any);
              }}
              android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
            >
              <View style={styles.cartLeft}>
                <View style={styles.cartBadge}>
                  {cartLocked ? (
                    <Ionicons name="lock-closed" size={14} color={colors.surface} />
                  ) : (
                    <Text style={styles.cartBadgeText}>{totalCartItems}</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.cartLabel}>
                    {cartLocked ? t('clientMenu.formulaIncomplete') : t('clientMenu.viewCart')}
                  </Text>
                  <Text style={styles.cartSubLabel}>
                    {cartLocked
                      ? t('clientMenu.categoriesChosen', { picked: formulaStatus.pickedCategories, total: formulaStatus.totalCategories, count: formulaStatus.totalCategories })
                      : t('clientMenu.articlesCount', { count: totalCartItems })}
                  </Text>
                </View>
              </View>
              <Text style={styles.cartTotal}>
                {formatPrice(effectiveSessionId ? sessionCart.total : cart.total)}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* ─── Session sheet (code partage + participants) ──────────────── */}
        <Modal
          visible={sessionSheetOpen}
          transparent
          animationType="slide"
          statusBarTranslucent
          onRequestClose={() => setSessionSheetOpen(false)}
        >
          <Pressable style={styles.sheetOverlay} onPress={() => setSessionSheetOpen(false)}>
          <Pressable
            style={[styles.sheetContainer, { paddingBottom: Math.max(40, insets.bottom + 32) }]}
            onPress={e => e.stopPropagation()}
          >
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{t('clientMenu.sessionTitle')}</Text>
                <Pressable onPress={() => setSessionSheetOpen(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={colors.text.secondary} />
                </Pressable>
              </View>

              <Text style={styles.sheetLabel}>{t('clientMenu.shareCode')}</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{session?.share_code ?? '------'}</Text>
                <View style={styles.codeActions}>
                  <Pressable onPress={handleCopyCode} style={styles.codeAction} hitSlop={6}>
                    <Ionicons
                      name={codeCopied ? 'checkmark' : 'copy-outline'}
                      size={20}
                      color={codeCopied ? colors.success : colors.primary}
                    />
                  </Pressable>
                  <Pressable onPress={handleShareCode} style={styles.codeAction} hitSlop={6}>
                    <Ionicons name="share-social-outline" size={20} color={colors.primary} />
                  </Pressable>
                </View>
              </View>

              {(session?.participants && session.participants.length > 0) ? (
                <>
                  <Text style={styles.sheetLabel}>
                    {t('clientMenu.participants', { count: session.participants.length })}
                  </Text>
                  {session.participants.map((p: any) => (
                    <View key={p.id} style={styles.participantRow}>
                      <View style={styles.participantAvatar}>
                        <Text style={styles.participantAvatarText}>
                          {(p.display_name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.participantName}>
                          {p.display_name ?? t('clientMenu.anonymous')}
                          {p.is_host && ' 👑'}
                        </Text>
                        <Text style={styles.participantStatus}>
                          {p.status === 'pending' ? t('clientMenu.statusPending') :
                           p.status === 'active' ? t('clientMenu.statusActive') :
                           p.status === 'left' ? t('clientMenu.statusLeft') : p.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
      {/* SessionJoinModal — déclenchée par le CTA "Commander ensemble" ou
          par le bandeau "Session active sur cette table" */}
      {showSessionJoinModal && restaurantId && tableNumberParam && (
        <SessionJoinModal
          visible={showSessionJoinModal}
          onClose={() => setShowSessionJoinModal(false)}
          restaurantId={parseInt(restaurantId)}
          tableNumber={tableNumberParam}
          activeSession={activeSessionOnTable}
          onSessionCreated={handleSessionJoinedFromMenu}
          onSessionJoined={handleSessionJoinedFromMenu}
          onOrderAlone={handleOrderAloneFromMenu}
        />
      )}

      {/* Sélecteur de langue du menu */}
      <Modal
        visible={showLanguagePicker}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <Pressable
          onPress={() => setShowLanguagePicker(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            paddingHorizontal: 32,
          }}
        >
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 12 }}>
              {t('clientMenu.menuLanguage')}
            </Text>
            {availableLanguages.map((language) => {
              const selected = language.code === lang;
              return (
                <Pressable
                  key={language.code}
                  onPress={() => {
                    setShowLanguagePicker(false);
                    if (language.code !== lang) setLang(language.code);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    backgroundColor: selected ? colors.primary + '15' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{language.flag}</Text>
                  <Text style={{
                    flex: 1,
                    fontSize: 15,
                    fontWeight: selected ? '700' : '500',
                    color: selected ? colors.primary : colors.text.primary,
                  }}>
                    {language.label}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </UnpaidOrderGate>
  );
}

// =============================================================================
// SOUS-COMPOSANT : DailyFormulaBanner
// =============================================================================

/**
 * Bandeau d'explication affiché au-dessus de la liste quand l'onglet
 * Menu du jour est en mode formule (special_price + plusieurs catégories).
 * Indique le prix total, le prix par catégorie et la règle "1 plat / catégorie".
 */
const DailyFormulaBanner: React.FC<{
  totalPrice: number;
  pricePerCategory: number;
  categoriesCount: number;
  description: string | null;
}> = React.memo(({ totalPrice, pricePerCategory, categoriesCount, description }) => {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const bannerStyles = useMemo(() => createBannerStyles(colors), [colors]);
  return (
    <View style={bannerStyles.wrap}>
      <View style={bannerStyles.iconCircle}>
        <Ionicons name="restaurant" size={18} color={colors.primary} />
      </View>
      <View style={bannerStyles.body}>
        <View style={bannerStyles.headerRow}>
          <Text style={bannerStyles.title}>{t('clientMenu.formulaOfDay')}</Text>
          <Text style={bannerStyles.totalPrice}>{formatPrice(totalPrice)}</Text>
        </View>
        <Text style={bannerStyles.subtitle}>
          {categoriesCount > 1
            ? t('clientMenu.formulaSubtitleMulti', { count: categoriesCount, price: formatPrice(pricePerCategory) })
            : t('clientMenu.formulaSubtitleSingle', { price: formatPrice(pricePerCategory) })}
        </Text>
        {description ? (
          <Text style={bannerStyles.description} numberOfLines={3}>{description}</Text>
        ) : null}
      </View>
    </View>
  );
});

// =============================================================================
// SOUS-COMPOSANT : DishCard
// =============================================================================

const DishCard: React.FC<{
  item: MenuItem;
  cartQuantity: number;
  onAddToCart: (item: MenuItem) => void;
  onDecrement: (item: MenuItem) => void;
  /**
   * Si true, l'item ne peut pas dépasser qty=1 (mode formule menu du jour).
   * Le contrôle qty (− N +) est remplacé par une pastille "Sélectionné" qui
   * sert aussi de bouton de désélection.
   */
  lockedQuantity?: boolean;
}> = React.memo(({ item, cartQuantity, onAddToCart, onDecrement, lockedQuantity = false }) => {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const cardStyles = useMemo(() => createCardStyles(colors), [colors]);
  const imageUrl = (item as any).image_url;
  const hasImage = !!imageUrl;
  const isAvailable = (item as any).is_available !== false;
  const inCart = cartQuantity > 0;

  // Animation pop de la carte à l'ajout (track la quantité pour pulser
  // uniquement quand la quantité augmente, pas quand on décrémente).
  const scale = useRef(new Animated.Value(1)).current;
  const prevQtyRef = useRef(cartQuantity);

  useEffect(() => {
    if (cartQuantity > prevQtyRef.current) {
      // Pop : grossit puis revient avec un léger rebond
      scale.stopAnimation();
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.04,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 4,
          tension: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevQtyRef.current = cartQuantity;
  }, [cartQuantity, scale]);

  const handleAddPress = useCallback(() => {
    onAddToCart(item);
  }, [item, onAddToCart]);

  const handleDecPress = useCallback(() => {
    onDecrement(item);
  }, [item, onDecrement]);

  return (
    <Animated.View
      style={[
        cardStyles.card,
        !hasImage && cardStyles.cardNoImage,
        inCart && cardStyles.cardInCart,
        !isAvailable && cardStyles.cardDisabled,
        { transform: [{ scale }] },
      ]}
    >
      {/* Vignette : uniquement si une image existe */}
      {hasImage && (
        <View style={cardStyles.thumb}>
          <Image source={{ uri: imageUrl }} style={cardStyles.thumbImage} resizeMode="cover" />
          {inCart && (
            <View style={cardStyles.qtyBadge}>
              <Text style={cardStyles.qtyBadgeText}>{cartQuantity}</Text>
            </View>
          )}
        </View>
      )}

      {/* Infos */}
      <View style={cardStyles.infoBlock}>
        <View style={cardStyles.dishNameRow}>
          {/* Pastille quantité quand pas de vignette pour rester visible */}
          {!hasImage && inCart && (
            <View style={cardStyles.qtyBadgeInline}>
              <Text style={cardStyles.qtyBadgeText}>{cartQuantity}</Text>
            </View>
          )}
          <Text style={cardStyles.dishName} numberOfLines={2}>
            {item.name}
          </Text>
        </View>
        {item.description ? (
          <Text style={cardStyles.dishDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View style={cardStyles.priceRow}>
          <Text style={cardStyles.priceText}>{formatPrice((item as any).price)}</Text>
          {!isAvailable && (
            <View style={cardStyles.unavailableBadge}>
              <Text style={cardStyles.unavailableText}>{t('common.unavailable')}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Action : "+" seul, contrôles inline (− qty +), ou pastille "Sélectionné" en formule */}
      {isAvailable && (
        <View style={cardStyles.actionWrap}>
          {inCart ? (
            lockedQuantity ? (
              // Mode formule : un seul plat par catégorie, qty plafonnée à 1.
              // La pastille fait double rôle : feedback "déjà choisi" + bouton de désélection.
              <Pressable
                onPress={handleDecPress}
                style={({ pressed }) => [
                  cardStyles.selectedPill,
                  pressed && cardStyles.selectedPillPressed,
                ]}
                hitSlop={6}
                accessibilityLabel={t('clientMenu.removeFromFormula', { name: item.name })}
              >
                <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                <Text style={cardStyles.selectedPillText}>{t('clientMenu.chosen')}</Text>
                <Ionicons name="close" size={14} color="#FFFFFF" />
              </Pressable>
            ) : (
              <View style={cardStyles.qtyControls}>
                <Pressable
                  onPress={handleDecPress}
                  style={({ pressed }) => [cardStyles.qtyBtn, pressed && cardStyles.qtyBtnPressed]}
                  hitSlop={6}
                  accessibilityLabel={t('clientMenu.removeItem', { name: item.name })}
                >
                  <Ionicons
                    name={cartQuantity === 1 ? 'trash-outline' : 'remove'}
                    size={18}
                    color={cartQuantity === 1 ? colors.error : colors.primary}
                  />
                </Pressable>
                <Text style={cardStyles.qtyText}>{cartQuantity}</Text>
                <Pressable
                  onPress={handleAddPress}
                  style={({ pressed }) => [
                    cardStyles.qtyBtn,
                    cardStyles.qtyBtnAdd,
                    pressed && cardStyles.qtyBtnPressed,
                  ]}
                  hitSlop={6}
                  accessibilityLabel={t('clientMenu.addOne', { name: item.name })}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            )
          ) : (
            <Pressable
              onPress={handleAddPress}
              style={({ pressed }) => [cardStyles.addBtn, pressed && cardStyles.addBtnPressed]}
              hitSlop={6}
              accessibilityLabel={t('clientMenu.addToCartLabel', { name: item.name })}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
});

// =============================================================================
// STYLES
// =============================================================================

const createStyles = (colors: AppColors) => StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ─── Header navy ─────────────────────────────────────────────────────────
  header: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerSide: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
    marginTop: 2,
    textAlign: 'center',
  },
  headerActionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.40)', // or léger
  },
  activeSessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    marginHorizontal: 14,
    marginTop: -10, // chevauche légèrement le header navy
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    borderColor: colors.success,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
    gap: 12,
    zIndex: 5,
  },
  activeSessionBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  activeSessionBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 2,
  },
  activeSessionBannerSubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  activeSessionBannerCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
  },
  activeSessionBannerCTAText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  sessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    marginHorizontal: 14,
    marginTop: -10, // chevauche légèrement le header navy pour la profondeur
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    gap: 12,
    zIndex: 5,
  },
  sessionBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  sessionBannerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.light,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sessionBannerCode: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 3,
    marginTop: 1,
  },
  sessionBannerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionBannerAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionBannerCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: colors.variants?.primary?.[50] ?? (colors.primary + '15'),
    marginLeft: 4,
  },
  sessionBannerCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  // ─── Onglets ─────────────────────────────────────────────────────────────
  tabsWrapper: {
    backgroundColor: colors.background,
    paddingVertical: 12,
  },
  tabsContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabEmoji: {
    fontSize: 14,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ─── Liste ───────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },

  // ─── En-têtes de catégorie pour l'onglet menu du jour ─────────────────
  dailyCategoryHeader: {
    marginTop: 16,
    marginBottom: 8,
  },
  dailyCategoryHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  dailyCategoryHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  dailyCategoryHeaderHint: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  dailyCategoryHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  dailyCategoryHeaderBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.surface,
    letterSpacing: 0.5,
  },
  dailyCategoryHeaderDivider: {
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
    opacity: 0.6,
  },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.secondary,
  },

  // ─── Toast / alertes ─────────────────────────────────────────────────────
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
  alertWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // ─── Floating cart ───────────────────────────────────────────────────────
  floatingCart: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    overflow: 'hidden',
  },
  floatingCartInner: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  cartLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cartSubLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  cartTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.secondary,
  },

  // ─── Not found ───────────────────────────────────────────────────────────
  notFound: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  notFoundTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  notFoundBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: colors.primary,
  },
  notFoundBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ─── Sheet session ───────────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingHorizontal: 20,
    paddingTop: 8,
    // paddingBottom est calculé dynamiquement avec insets.bottom (voir JSX)
    maxHeight: '80%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.default,
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.light,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  codeText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 4,
  },
  codeAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  participantName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  participantStatus: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
});

const createCardStyles = (colors: AppColors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  // Variante quand pas d'image : on resserre légèrement la carte
  cardNoImage: {
    paddingVertical: 14,
  },
  cardInCart: {
    borderColor: colors.primary + '40',
  },
  cardDisabled: {
    opacity: 0.55,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.background,
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  // Badge quantité posé sur la vignette (mode "avec image")
  qtyBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  // Pastille quantité inline (mode "sans image") : devant le nom
  qtyBadgeInline: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  qtyBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  infoBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  dishNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dishName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  dishDescription: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  unavailableBadge: {
    backgroundColor: colors.error + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  unavailableText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.error,
  },

  // ─── Action zone (+ ou contrôles inline) ───────────────────────────────
  actionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  addBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  qtyBtnAdd: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  qtyBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.92 }],
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    minWidth: 18,
    textAlign: 'center',
  },

  // ─── Pastille "Choisi" (mode formule menu du jour) ─────────────────────
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  selectedPillPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  selectedPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

// =============================================================================
// STYLES — Bandeau formule menu du jour
// =============================================================================

const createBannerStyles = (colors: AppColors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: colors.secondary + '18',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.secondary + '40',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary + '30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  description: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
    marginTop: 2,
  },
});