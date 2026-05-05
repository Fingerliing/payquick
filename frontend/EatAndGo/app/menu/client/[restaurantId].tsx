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

// UI components conservés
import { Loading } from '@/components/ui/Loading';
import { Alert as InlineAlert, AlertWithAction } from '@/components/ui/Alert';
import { UnpaidOrderGate } from '@/components/guards/UnpaidOrderGate';

// Types
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';

// Design system
import { COLORS, BORDER_RADIUS } from '@/utils/designSystem';

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
  const { restaurantId, sessionId } = useLocalSearchParams<{
    restaurantId: string;
    sessionId?: string;
  }>();
  const insets = useSafeAreaInsets();

  // ─── SessionContext : source de vérité pour le participantId en mémoire ───
  const { session: ctxSession, participantId: ctxParticipantId, clearSession } = useSession();
  const effectiveSessionId = (sessionId as string | null) ?? ctxSession?.id ?? null;
  const isHostRef = useRef(false);

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
  const { cart, addToCart, clearCart } = useCart();

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
        name: newest?.display_name ?? "Quelqu'un",
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
        menuService.getPublicMenusByRestaurant(parsedId),
        dailyMenuService.getPublicDailyMenu(parsedId).catch(() => null),
      ]);
      setRestaurant(restaurantData);
      setMenus(menusData);
      setDailyMenu(dailyMenuRes);
    } catch (error) {
      console.error('Error loading restaurant data:', error);
      showToast('error', 'Erreur', 'Impossible de charger le menu');
      setRestaurant(null);
      setMenus([]);
      setDailyMenu(null);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Catégories ────────────────────────────────────────────────────────────
  const allMenuItems = useMemo(() => menus.flatMap(m => m.items || []), [menus]);

  const categories = useMemo<MenuCategory[]>(() => {
    const map = new Map<string, MenuCategory>();
    allMenuItems.forEach(item => {
      const catName = item.category_name || 'Autres';
      if (!map.has(catName)) {
        map.set(catName, {
          id: catName,
          name: catName,
          emoji: inferCategoryEmoji(catName),
          count: 0,
          items: [],
        });
      }
      const cat = map.get(catName)!;
      cat.items.push(item);
      cat.count++;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allMenuItems]);

  // Items du menu du jour aplatis au format MenuItem pour réutiliser DishCard.
  // L'ID conservé est `menu_item` (l'ID du MenuItem original) et non l'ID du
  // DailyMenuItem — c'est cet ID qui est attendu par sessionCart.addItem
  // et par le panier solo.
  const dailyMenuItems = useMemo<MenuItem[]>(() => {
    if (!dailyMenu) return [];
    const items: MenuItem[] = [];
    for (const cat of dailyMenu.items_by_category ?? []) {
      for (const it of cat.items ?? []) {
        items.push({
          id: it.menu_item,
          name: it.menu_item_name,
          description: it.menu_item_description,
          price: it.effective_price,
          image_url: it.menu_item_image,
          is_available: it.is_available,
          category_name: it.menu_item_category,
        } as any);
      }
    }
    return items;
  }, [dailyMenu]);

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

  // ─── Handlers cart ─────────────────────────────────────────────────────────
  const handleAddToCart = useCallback(
    async (item: MenuItem) => {
      const parsedRestaurantId = parseInt(restaurantId, 10);
      const menuItemId =
        typeof (item as any).id === 'number'
          ? (item as any).id
          : parseInt(String((item as any).id), 10);

      // Mode session collaborative
      if (effectiveSessionId) {
        try {
          await sessionCart.addItem({ menu_item: menuItemId, quantity: 1 });
          await sessionCart.refresh();
          showToast('success', 'Ajouté au panier partagé', `${item.name} a été ajouté`);
        } catch (err) {
          showToast('error', 'Erreur', "Impossible d'ajouter au panier partagé");
        }
        return;
      }

      // Mode solo : confirmation si panier d'un autre restaurant
      if (cart.items.length > 0 && cart.restaurantId && cart.restaurantId !== parsedRestaurantId) {
        setConfirmCartSwitch({ visible: true, item });
        return;
      }

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
    [effectiveSessionId, sessionCart, cart.items.length, cart.restaurantId, restaurantId, restaurant, addToCart, showToast]
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

  // ─── Handlers session sheet ────────────────────────────────────────────────
  const handleCopyCode = useCallback(async () => {
    if (!session?.share_code) return;
    try {
      await Clipboard.setStringAsync(session.share_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      showToast('error', 'Erreur', 'Impossible de copier le code');
    }
  }, [session?.share_code, showToast]);

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

  // ─── Loading / not found ───────────────────────────────────────────────────
  if (isLoading) {
    return <Loading fullScreen text="Chargement de la carte..." />;
  }

  if (!restaurant) {
    return (
      <View style={styles.notFound}>
        <Ionicons name="restaurant-outline" size={64} color={COLORS.text.light} />
        <Text style={styles.notFoundTitle}>Restaurant introuvable</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.notFoundBtn}>
          <Text style={styles.notFoundBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tableLabel = session?.table_number
    ? `Table ${String(session.table_number).padStart(2, '0')}`
    : 'Bienvenue';

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
              title="💳 Paiement de la note"
              message={
                splitPaymentAlert.totalAmount
                  ? `L'hôte a divisé la note (${splitPaymentAlert.totalAmount}€) en ${splitPaymentAlert.portionsCount} parts. Payez votre part maintenant.`
                  : `L'hôte a divisé la note en ${splitPaymentAlert.portionsCount} parts. Payez votre part maintenant.`
              }
              autoDismiss={false}
              primaryButton={{
                text: 'Payer ma part',
                variant: 'primary',
                onPress: () => {
                  const { orderId } = splitPaymentAlert;
                  setSplitPaymentAlert(null);
                  router.push(`/order/payment?orderId=${orderId}&splitView=member` as any);
                },
              }}
              secondaryButton={{
                text: 'Plus tard',
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
                text: "Retour à l'accueil",
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
              title="🔔 Nouvelle demande"
              message={`${pendingRequest.name} souhaite rejoindre votre session.`}
              primaryButton={{
                text: '✅ Accepter',
                variant: 'primary',
                onPress: async () => {
                  const id = pendingRequest.id;
                  setPendingRequest(null);
                  try { await approveParticipant(id); }
                  catch { showToast('error', 'Erreur', "Impossible d'accepter la demande"); }
                },
              }}
              secondaryButton={{
                text: '❌ Refuser',
                onPress: async () => {
                  const id = pendingRequest.id;
                  setPendingRequest(null);
                  try { await rejectParticipant(id); }
                  catch { showToast('error', 'Erreur', 'Impossible de refuser la demande'); }
                },
              }}
            />
          </View>
        )}

        {confirmCartSwitch.visible && (
          <View style={styles.alertWrap}>
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
          </View>
        )}

        {/* ─── Header navy ──────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerSide}>
            <Ionicons name="restaurant-outline" size={22} color="#FFFFFF" />
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {restaurant.name}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {tableLabel}
            </Text>
          </View>

          {/* Espace équilibré (le code session a son propre banner sous le header) */}
          <View style={styles.headerSide} />
        </View>

        {/* ─── Banner code de session (si session collaborative active) ──── */}
        {session?.share_code ? (
          <Pressable
            onPress={() => setSessionSheetOpen(true)}
            style={({ pressed }) => [styles.sessionBanner, pressed && { opacity: 0.95 }]}
            android_ripple={{ color: COLORS.primary + '15' }}
          >
            <View style={styles.sessionBannerLeft}>
              <Ionicons name="people" size={16} color={COLORS.secondary} />
              <View>
                <Text style={styles.sessionBannerLabel}>Code de session</Text>
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
                  color={codeCopied ? COLORS.success : COLORS.primary}
                />
              </Pressable>
              <Pressable
                onPress={(e) => { e.stopPropagation(); handleShareCode(); }}
                style={({ pressed }) => [styles.sessionBannerAction, pressed && { opacity: 0.6 }]}
                hitSlop={6}
              >
                <Ionicons name="share-social-outline" size={18} color={COLORS.primary} />
              </Pressable>
              {(session.participant_count ?? 0) > 0 && (
                <View style={styles.sessionBannerCount}>
                  <Ionicons name="people-outline" size={14} color={COLORS.primary} />
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
                  android_ripple={{ color: COLORS.primary + '20', borderless: false }}
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
        <FlatList
          data={activeTab?.items ?? []}
          keyExtractor={(item) => String((item as any).id)}
          renderItem={({ item }) => (
            <DishCard item={item} onAddToCart={handleAddToCart} />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(120, insets.bottom + 100) }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="restaurant-outline" size={48} color={COLORS.text.light} />
              <Text style={styles.emptyText}>
                {isDailyTab ? 'Aucun plat dans le menu du jour' : 'Aucun plat dans cette catégorie'}
              </Text>
            </View>
          }
        />

        {/* ─── Floating cart button ─────────────────────────────────────── */}
        {totalCartItems > 0 && (
          <Pressable
            style={[styles.floatingCart, { bottom: Math.max(20, insets.bottom + 10) }]}
            onPress={() => router.push('/(client)/cart' as any)}
          >
            <View style={styles.cartLeft}>
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{totalCartItems}</Text>
              </View>
              <View>
                <Text style={styles.cartLabel}>Voir le panier</Text>
                <Text style={styles.cartSubLabel}>
                  {totalCartItems} article{totalCartItems > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.cartTotal}>
              {(effectiveSessionId ? sessionCart.total : cart.total).toFixed(2)} €
            </Text>
          </Pressable>
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
                <Text style={styles.sheetTitle}>Session collaborative</Text>
                <Pressable onPress={() => setSessionSheetOpen(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={COLORS.text.secondary} />
                </Pressable>
              </View>

              <Text style={styles.sheetLabel}>Code de partage</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{session?.share_code ?? '------'}</Text>
                <View style={styles.codeActions}>
                  <Pressable onPress={handleCopyCode} style={styles.codeAction} hitSlop={6}>
                    <Ionicons
                      name={codeCopied ? 'checkmark' : 'copy-outline'}
                      size={20}
                      color={codeCopied ? COLORS.success : COLORS.primary}
                    />
                  </Pressable>
                  <Pressable onPress={handleShareCode} style={styles.codeAction} hitSlop={6}>
                    <Ionicons name="share-social-outline" size={20} color={COLORS.primary} />
                  </Pressable>
                </View>
              </View>

              {(session?.participants && session.participants.length > 0) ? (
                <>
                  <Text style={styles.sheetLabel}>
                    Participants ({session.participants.length})
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
                          {p.display_name ?? 'Anonyme'}
                          {p.is_host && ' 👑'}
                        </Text>
                        <Text style={styles.participantStatus}>
                          {p.status === 'pending' ? 'En attente' :
                           p.status === 'active' ? 'Actif' :
                           p.status === 'left' ? 'Parti' : p.status}
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
    </UnpaidOrderGate>
  );
}

// =============================================================================
// SOUS-COMPOSANT : DishCard
// =============================================================================

const DishCard: React.FC<{
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
}> = React.memo(({ item, onAddToCart }) => {
  const visual = useMemo(() => inferDishVisual(item.name), [item.name]);
  const imageUrl = (item as any).image_url;
  const isAvailable = (item as any).is_available !== false;

  return (
    <Pressable
      onPress={() => isAvailable && onAddToCart(item)}
      style={({ pressed }) => [
        cardStyles.card,
        pressed && isAvailable && cardStyles.cardPressed,
        !isAvailable && cardStyles.cardDisabled,
      ]}
      android_ripple={{ color: COLORS.primary + '10' }}
      disabled={!isAvailable}
    >
      {/* Vignette */}
      <View style={[cardStyles.thumb, { backgroundColor: visual.bg }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={cardStyles.thumbImage} resizeMode="cover" />
        ) : (
          <Text style={cardStyles.thumbEmoji}>{visual.emoji}</Text>
        )}
      </View>

      {/* Infos */}
      <View style={cardStyles.infoBlock}>
        <Text style={cardStyles.dishName} numberOfLines={2}>
          {item.name}
        </Text>
        {item.description ? (
          <Text style={cardStyles.dishDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <View style={cardStyles.priceRow}>
          <Text style={cardStyles.priceText}>{formatPrice((item as any).price)}</Text>
          {!isAvailable && (
            <View style={cardStyles.unavailableBadge}>
              <Text style={cardStyles.unavailableText}>Indisponible</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ─── Header navy ─────────────────────────────────────────────────────────
  header: {
    backgroundColor: COLORS.primary,
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
    color: COLORS.secondary,
    marginTop: 2,
    textAlign: 'center',
  },
  sessionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    marginHorizontal: 14,
    marginTop: -10, // chevauche légèrement le header navy pour la profondeur
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border.light,
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
    color: COLORS.text.light,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sessionBannerCode: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
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
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.variants?.primary?.[50] ?? (COLORS.primary + '15'),
    marginLeft: 4,
  },
  sessionBannerCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // ─── Onglets ─────────────────────────────────────────────────────────────
  tabsWrapper: {
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabEmoji: {
    fontSize: 14,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.primary,
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
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.text.secondary,
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
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
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
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
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
    color: COLORS.secondary,
  },

  // ─── Not found ───────────────────────────────────────────────────────────
  notFound: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  notFoundTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  notFoundBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.border.default,
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
    color: COLORS.text.primary,
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text.light,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  codeText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
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
    borderBottomColor: COLORS.border.light,
  },
  participantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
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
    color: COLORS.text.primary,
  },
  participantStatus: {
    fontSize: 12,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
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
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
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
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbEmoji: {
    fontSize: 38,
  },
  infoBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  dishName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  dishDescription: {
    fontSize: 13,
    color: COLORS.text.secondary,
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
    color: COLORS.primary,
  },
  unavailableBadge: {
    backgroundColor: COLORS.error + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  unavailableText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.error,
  },
});