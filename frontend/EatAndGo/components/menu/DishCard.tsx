/**
 * DishCard — carte de plat partagée.
 *
 * Extraite de `app/menu/client/[restaurantId].tsx` pour être réutilisée telle
 * quelle par l'écran de prise de commande à table (`app/order/take.tsx`).
 *
 * Le composant est volontairement « contrôlé » : il ne connaît ni le
 * CartContext ni les sessions collaboratives. Il reçoit `cartQuantity` et
 * remonte `onAddToCart` / `onDecrement`. C'est ce qui permet de le brancher
 * indifféremment sur le panier client (contexte global) ou sur le panier
 * serveur (état local à l'écran de prise de commande).
 */
import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { MenuItem } from '@/types/menu';
import { useAppTheme, BORDER_RADIUS, type AppColors } from '@/utils/designSystem';

// =============================================================================
// HELPERS
// =============================================================================

/** Emoji pour l'onglet d'une catégorie selon son nom. */
export function inferCategoryEmoji(name: string): string {
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
export function formatPrice(value: any): string {
  const n = parseFloat(String(value ?? 0));
  return `${n.toFixed(2).replace('.', ',')} €`;
}

// =============================================================================
// TYPES
// =============================================================================

export interface MenuCategory {
  id: string;          // identifiant interne (= name pour les vraies catégories, ou DAILY_TAB_ID)
  name: string;        // nom affiché
  emoji: string;
  count: number;
  items: MenuItem[];
}

// =============================================================================
// COMPOSANT
// =============================================================================

export const DishCard: React.FC<{
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

export const createCardStyles = (colors: AppColors) => StyleSheet.create({
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