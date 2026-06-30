import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { MenuItem } from '@/types/menu';
import {
  useAppTheme,
  makeShadows,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

const { width: screenWidth } = Dimensions.get('window');

interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  showAllergens?: boolean;
  onToggleAllergens?: () => void;
  compact?: boolean;
}

export const MenuItemCard = React.memo<MenuItemCardProps>(
  ({ item, onAddToCart, showAllergens = false, onToggleAllergens, compact = false }) => {
    const { t, i18n } = useTranslation();
    const { colors, isDark } = useAppTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

    const [showImageModal, setShowImageModal] = useState(false);
    const hasImage = Boolean(item.image_url);

    // Allergens : utilise allergen_display si présent (backend localisé), sinon fallback
    const displayAllergens =
      (item as any).allergen_display || item.allergens || [];
    const hasAllergens = displayAllergens.length > 0;

    // Formatage devise localisé
    const currencyFormatter = useMemo(() => {
      try {
        return new Intl.NumberFormat(i18n.language, {
          style: 'currency',
          currency: 'EUR',
        });
      } catch {
        return null;
      }
    }, [i18n.language]);

    const formatPrice = (price: string | number): string => {
      const num = typeof price === 'string' ? parseFloat(price) : price;
      if (Number.isNaN(num)) return String(price);
      return currencyFormatter ? currencyFormatter.format(num) : `${num.toFixed(2)} €`;
    };

    // ── Layout compact : ligne avec thumbnail (ou pas d'image) ──────────
    if (compact || !hasImage) {
      return (
        <View style={styles.compactCard}>
          {hasImage && (
            <TouchableOpacity
              onPress={() => setShowImageModal(true)}
              style={styles.thumbnailContainer}
            >
              <Image
                source={{ uri: item.image_url }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.zoomIcon}>
                <Ionicons name="expand" size={12} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}

          <View style={[styles.compactContent, !hasImage && styles.noImageContent]}>
            <View style={styles.headerRow}>
              <Text style={styles.compactName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.compactPrice}>{formatPrice(item.price)}</Text>
            </View>

            {item.description && (
              <Text style={styles.compactDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}

            <View style={styles.compactFooter}>
              <View style={styles.compactTags}>
                {item.is_vegan && (
                  <View style={styles.miniTag}>
                    <Text style={styles.miniTagText}>🌱</Text>
                  </View>
                )}
                {item.is_vegetarian && !item.is_vegan && (
                  <View style={styles.miniTag}>
                    <Text style={styles.miniTagText}>🥗</Text>
                  </View>
                )}
                {item.is_gluten_free && (
                  <View style={styles.miniTag}>
                    <Text style={styles.miniTagText}>🚫🌾</Text>
                  </View>
                )}
                {hasAllergens && (
                  <TouchableOpacity
                    style={styles.allergenBadge}
                    onPress={onToggleAllergens}
                  >
                    <Text style={styles.allergenBadgeText}>
                      ⚠️ {displayAllergens.length}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {item.is_available ? (
                <TouchableOpacity
                  style={styles.compactAddButton}
                  onPress={() => onAddToCart(item)}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <View style={styles.unavailableBadge}>
                  <Text style={styles.unavailableText}>
                    {t('menuItem.unavailableShort')}
                  </Text>
                </View>
              )}
            </View>

            {showAllergens && hasAllergens && (
              <View style={styles.allergensExpanded}>
                {displayAllergens.map((allergen: string, index: number) => (
                  <Text key={index} style={styles.allergenItem}>
                    • {allergen}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {hasImage && (
            <Modal
              visible={showImageModal}
              transparent
              statusBarTranslucent
              animationType="fade"
              onRequestClose={() => setShowImageModal(false)}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setShowImageModal(false)}
              >
                <View style={styles.modalContent}>
                  <Image
                    source={{ uri: item.image_url! }}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.modalTitle}>{item.name}</Text>
                  {item.description && (
                    <Text style={styles.modalDescription}>{item.description}</Text>
                  )}
                </View>
              </Pressable>
            </Modal>
          )}
        </View>
      );
    }

    // ── Layout grande image (tablette / affichage élargi) ──────────────
    return (
      <View style={styles.fullCard}>
        <TouchableOpacity
          onPress={() => setShowImageModal(true)}
          style={styles.largeImageContainer}
        >
          <Image
            source={{ uri: item.image_url! }}
            style={styles.largeImage}
            resizeMode="cover"
          />
          <View style={styles.categoryOverlay}>
            <Text style={styles.categoryOverlayText}>{item.category_name}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.fullContent}>
          <View style={styles.fullHeader}>
            <Text style={styles.fullName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.fullPrice}>{formatPrice(item.price)}</Text>
          </View>

          {item.description && (
            <Text style={styles.fullDescription} numberOfLines={3}>
              {item.description}
            </Text>
          )}

          {(item.is_vegan || item.is_vegetarian || item.is_gluten_free) && (
            <View style={styles.fullTags}>
              {item.is_vegan && (
                <View style={styles.dietTag}>
                  <Text style={styles.dietTagText}>🌱 {t('menu.vegan')}</Text>
                </View>
              )}
              {item.is_vegetarian && !item.is_vegan && (
                <View style={styles.dietTag}>
                  <Text style={styles.dietTagText}>🥗 {t('menu.vegetarian')}</Text>
                </View>
              )}
              {item.is_gluten_free && (
                <View style={styles.dietTag}>
                  <Text style={styles.dietTagText}>{t('menu.glutenFree')}</Text>
                </View>
              )}
            </View>
          )}

          {item.is_available ? (
            <TouchableOpacity
              style={styles.fullAddButton}
              onPress={() => onAddToCart(item)}
            >
              <Ionicons name="add-circle" size={20} color="#FFFFFF" />
              <Text style={styles.fullAddText}>{t('menuItem.add')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.fullUnavailable}>
              <Text style={styles.fullUnavailableText}>
                {t('menuItem.unavailable')}
              </Text>
            </View>
          )}
        </View>

        <Modal
          visible={showImageModal}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setShowImageModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowImageModal(false)}
          >
            <View style={styles.modalContent}>
              <Image
                source={{ uri: item.image_url! }}
                style={styles.modalImage}
                resizeMode="contain"
              />
              <Text style={styles.modalTitle}>{item.name}</Text>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  },
);

MenuItemCard.displayName = 'MenuItemCard';

// ──────────────────────────────────────────────────────────────────────────
// STYLES (fabrique theme-aware)
//
// Fix de bug : l'original utilisait `COLORS.error[50]` et `COLORS.warning[50]`
// alors que `colors.error` / `colors.warning` sont des *strings* dans le
// designSystem (pas des objets indexés par poids). L'accès `[50]` retournait
// un caractère arbitraire de la string hex — fond invisible. On utilise
// maintenant des `rgba(...)` theme-aware.
// ──────────────────────────────────────────────────────────────────────────
const makeStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    // ── Compact card ──────────────────────────────────────────────────
    compactCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: 8,
      padding: 12,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.sm,
    },
    thumbnailContainer: {
      position: 'relative',
      marginRight: 12,
    },
    thumbnail: {
      width: 80,
      height: 80,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background,
    },
    zoomIcon: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderRadius: BORDER_RADIUS.sm,
      padding: 4,
    },
    compactContent: {
      flex: 1,
      justifyContent: 'space-between',
    },
    noImageContent: {
      paddingVertical: 4,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 4,
    },
    compactName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      flex: 1,
      marginRight: 8,
    },
    compactPrice: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
    },
    compactDescription: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
      marginBottom: 8,
    },
    compactFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    compactTags: {
      flexDirection: 'row',
      gap: 4,
      flex: 1,
    },
    miniTag: {
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.18)'
        : colors.variants.primary[50],
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    miniTagText: {
      fontSize: 12,
    },
    allergenBadge: {
      // FIX : remplace COLORS.warning[50] (bug — accès string indexé) par rgba
      backgroundColor: isDark
        ? 'rgba(245, 158, 11, 0.18)'
        : 'rgba(245, 158, 11, 0.12)',
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    allergenBadgeText: {
      fontSize: 11,
      color: colors.warning,
      fontWeight: '600',
    },
    compactAddButton: {
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.full,
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.sm,
    },
    unavailableBadge: {
      // FIX : remplace COLORS.error[50] par rgba theme-aware
      backgroundColor: isDark
        ? 'rgba(239, 68, 68, 0.18)'
        : 'rgba(239, 68, 68, 0.12)',
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    unavailableText: {
      fontSize: 11,
      color: colors.error,
      fontWeight: '600',
    },
    allergensExpanded: {
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
    allergenItem: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 16,
    },

    // ── Full card (grande image) ──────────────────────────────────────
    fullCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.md,
    },
    largeImageContainer: {
      position: 'relative',
      height: 150,
    },
    largeImage: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.background,
    },
    // Note : l'original avait `imageOverlay` avec un `linear-gradient(...)`
    // en `backgroundColor`. C'est invalide en RN (silencieusement ignoré).
    // Style supprimé — pour un vrai dégradé, utiliser <LinearGradient>.
    categoryOverlay: {
      position: 'absolute',
      top: 8,
      right: 8,
      // Fond clair stable cross-thème (lisibilité sur image variable)
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    categoryOverlayText: {
      fontSize: 11,
      fontWeight: '600',
      // Texte foncé stable sur fond overlay clair
      color: '#1F2937',
    },
    fullContent: {
      padding: 12,
    },
    fullHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    fullName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
      flex: 1,
      marginRight: 8,
    },
    fullPrice: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.secondary,
    },
    fullDescription: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
      marginBottom: 8,
    },
    fullTags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 10,
    },
    dietTag: {
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.18)'
        : colors.variants.primary[50],
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    dietTagText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
    fullAddButton: {
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      gap: 6,
      ...shadows.sm,
    },
    fullAddText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    fullUnavailable: {
      // FIX : remplace COLORS.error[50] par rgba theme-aware
      backgroundColor: isDark
        ? 'rgba(239, 68, 68, 0.18)'
        : 'rgba(239, 68, 68, 0.12)',
      borderRadius: BORDER_RADIUS.lg,
      paddingVertical: 10,
      alignItems: 'center',
    },
    fullUnavailableText: {
      color: colors.error,
      fontSize: 14,
      fontWeight: '600',
    },

    // ── Modal ─────────────────────────────────────────────────────────
    modalOverlay: {
      flex: 1,
      // Overlay sombre stable cross-thème
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 500,
      alignItems: 'center',
    },
    modalImage: {
      width: '100%',
      height: 300,
      borderRadius: BORDER_RADIUS.xl,
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      // Texte blanc stable sur overlay sombre
      color: '#FFFFFF',
      textAlign: 'center',
      marginBottom: 8,
    },
    modalDescription: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.8)',
      textAlign: 'center',
      lineHeight: 20,
    },
  });
};

export default MenuItemCard;