import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Restaurant } from '@/types/restaurant';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  getLineHeight,
  type AppColors,
} from '@/utils/designSystem';

import { API_BASE_URL } from '@/constants/config';

interface RestaurantCardProps {
  restaurant: Restaurant;
  onPress: () => void;
  showDistance?: boolean;
  distance?: number;
  variant?: 'default' | 'featured' | 'compact';
}

// Image de fallback (vue restaurant générique)
const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=250&q=80';

export const RestaurantCard: React.FC<RestaurantCardProps> = ({
  restaurant,
  onPress,
  showDistance = false,
  distance,
  variant = 'default',
}) => {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const [imageError, setImageError] = useState(false);

  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType, variant),
    [colors, isDark, screenType, variant],
  );

  // ── Helpers ──────────────────────────────────────────────────────────
  const getRestaurantImageUri = (): string => {
    if (imageError) return FALLBACK_IMAGE;

    // Priorité à image_url calculée côté backend
    const imageUrl = (restaurant as any).image_url;
    if (imageUrl) return imageUrl;

    if (restaurant.image) {
      if (typeof restaurant.image === 'string' && restaurant.image.startsWith('http')) {
        return restaurant.image;
      }
      const baseUrl = API_BASE_URL;
      return `${baseUrl}${restaurant.image}`;
    }

    return FALLBACK_IMAGE;
  };

  const getPriceRangeText = (priceRange: number): string =>
    '€'.repeat(Math.max(1, Math.min(4, priceRange)));

  const isOpen = restaurant.isActive;
  const statusColor = isOpen ? colors.success : colors.error;
  const statusText = isOpen
    ? t('restaurant.openNow')
    : t('restaurant.closedNow');

  // ── Formatages localisés ─────────────────────────────────────────────
  const formattedDistance = useMemo(() => {
    if (distance === undefined || distance === null) return null;
    try {
      return new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(distance);
    } catch {
      return distance.toFixed(1);
    }
  }, [distance, i18n.language]);

  const formattedRating = useMemo(() => {
    if (typeof restaurant.rating !== 'number' || restaurant.rating <= 0) return null;
    try {
      return new Intl.NumberFormat(i18n.language, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(restaurant.rating);
    } catch {
      return restaurant.rating.toFixed(1);
    }
  }, [restaurant.rating, i18n.language]);

  const walkingMinutes =
    distance !== undefined && distance !== null
      ? Math.ceil(distance * 12)
      : null;

  const reviewsLabel = useMemo(() => {
    const count = restaurant.reviewCount ?? 0;
    // Plurielisation CLDR via i18next : `restaurant.reviews_one` / `_other`
    return t('restaurant.reviews', { count });
  }, [restaurant.reviewCount, t, i18n.language]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Image */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: getRestaurantImageUri() }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />

        {imageError && (
          <View style={styles.imagePlaceholder}>
            <Ionicons
              name="restaurant-outline"
              size={32}
              color={colors.text.light}
            />
          </View>
        )}

        {/* Indicateur statut en overlay (fond clair stable dans les 2 modes
            pour préserver la lisibilité par-dessus l'image) */}
        <View style={styles.statusIndicator}>
          <View
            style={[styles.statusDot, { backgroundColor: statusColor }]}
          />
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </View>

      {/* Contenu */}
      <View style={styles.content}>
        {/* En-tête : nom + note */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {restaurant.name}
          </Text>

          {formattedRating !== null && (
            <View style={styles.ratingContainer}>
              <Ionicons
                name="star"
                size={12}
                color={colors.variants.secondary[700]}
              />
              <Text style={styles.ratingText}>{formattedRating}</Text>
            </View>
          )}
        </View>

        {/* Localisation */}
        <View style={styles.infoRow}>
          <Ionicons
            name="location-outline"
            size={14}
            color={colors.text.secondary}
          />
          <Text style={styles.infoText} numberOfLines={1}>
            {restaurant.address}, {restaurant.city}
          </Text>
        </View>

        {/* Cuisine + gamme de prix */}
        <View style={styles.infoRow}>
          <Ionicons
            name="restaurant-outline"
            size={14}
            color={colors.text.secondary}
          />
          <Text style={styles.infoText} numberOfLines={1}>
            {restaurant.cuisine}
          </Text>
          <Text style={styles.priceRange}>
            {getPriceRangeText(restaurant.priceRange)}
          </Text>
        </View>

        {/* Distance */}
        {showDistance && formattedDistance !== null && (
          <View style={styles.infoRow}>
            <Ionicons
              name="walk-outline"
              size={14}
              color={colors.text.secondary}
            />
            <Text style={styles.infoText}>
              {t('restaurantCard.distanceKm', { distance: formattedDistance })}
            </Text>
          </View>
        )}

        {/* Pied : nombre d'avis + temps à pied éventuel */}
        <View style={styles.footer}>
          <Text style={styles.reviewCount}>{reviewsLabel}</Text>

          {showDistance && walkingMinutes !== null && (
            <View style={styles.distanceContainer}>
              <Ionicons name="time-outline" size={12} color={colors.primary} />
              <Text style={styles.distanceText}>
                {t('restaurantCard.walkingMinutes', { minutes: walkingMinutes })}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// STYLES (fabrique theme-aware)
// ──────────────────────────────────────────────────────────────────────────
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
  variant: 'default' | 'featured' | 'compact',
) => {
  const shadows = makeShadows(colors);
  const isFeatured = variant === 'featured';

  return StyleSheet.create({
    container: {
      backgroundColor: isFeatured ? colors.goldenSurface : colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: isFeatured ? 2 : 1,
      // En dark, hairline dorée subtile sur les cartes neutres (cohérent avec
      // la convention Card.tsx). En light, bordure neutre classique.
      borderColor: isFeatured
        ? colors.border.golden
        : (isDark ? 'rgba(212, 175, 55, 0.12)' : colors.border.light),
      ...(isFeatured ? shadows.premiumCard : shadows.card),
    },

    imageContainer: {
      position: 'relative',
      backgroundColor: colors.border.light,
    },

    image: {
      width: '100%',
      height: variant === 'compact'
        ? getResponsiveValue({ mobile: 120, tablet: 140, desktop: 160 }, screenType)
        : getResponsiveValue({ mobile: 160, tablet: 200, desktop: 240 }, screenType),
      backgroundColor: colors.border.light,
    },

    imagePlaceholder: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.border.light,
    },

    // Overlay sur image : fond clair stable dans les 2 thèmes pour conserver
    // un contraste fort par-dessus n'importe quelle photo.
    statusIndicator: {
      position: 'absolute',
      top: getResponsiveValue(SPACING.sm, screenType),
      right: getResponsiveValue(SPACING.sm, screenType),
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      ...shadows.sm,
    },

    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 4,
    },

    statusText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      // Texte foncé stable (fond overlay clair fixe)
      color: '#1F2937',
    },

    content: {
      padding: getResponsiveValue(SPACING.md, screenType),
    },

    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },

    title: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
      lineHeight: getLineHeight('md', screenType, 'tight'),
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.variants.secondary[100],
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.sm,
    },

    ratingText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.variants.secondary[700],
      marginLeft: 2,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },

    infoText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginLeft: 6,
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },

    priceRange: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.success,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },

    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },

    reviewCount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.light,
      fontWeight: TYPOGRAPHY.fontWeight.normal,
    },

    distanceContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.variants.primary[100],
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
    },

    distanceText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      marginLeft: 2,
    },
  });
};