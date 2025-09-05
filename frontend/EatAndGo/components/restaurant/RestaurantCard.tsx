import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Restaurant } from '@/types/restaurant';
import { Card } from '../ui/Card';

// Import du design system unifié
import {
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  COLORS,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  SHADOWS,
  getLineHeight,
} from '@/utils/designSystem';

interface RestaurantCardProps {
  restaurant: Restaurant;
  onPress: () => void;
  showDistance?: boolean;
  distance?: number;
  variant?: 'default' | 'featured' | 'compact';
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({
  restaurant,
  onPress,
  showDistance = false,
  distance,
  variant = 'default',
}) => {
  const screenType = useScreenType();
  const responsiveStyles = createResponsiveStyles(screenType);
  const [imageError, setImageError] = useState(false);

  // Fonction améliorée pour obtenir l'URL d'image
  const getRestaurantImageUri = (): string => {
    if (imageError) {
      return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=250&q=80';
    }

    // Priorité à image_url calculée côté backend
    if ((restaurant as any).image_url) {
      return (restaurant as any).image_url;
    }
    
    // Construction d'URL absolue depuis image relative
    if (restaurant.image) {
      if (typeof restaurant.image === 'string' && restaurant.image.startsWith('http')) {
        return restaurant.image;
      }
      // Utiliser une variable d'environnement au lieu d'IP hardcodée
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.163:8000';
      return `${baseUrl}${restaurant.image}`;
    }
    
    // Image par défaut
    return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=250&q=80';
  };

  const getPriceRangeText = (priceRange: number): string => {
    return '€'.repeat(Math.max(1, Math.min(4, priceRange)));
  };

  const getStatusColor = (): string => {
    return restaurant.isActive ? COLORS.success : COLORS.error;
  };

  const getStatusText = (): string => {
    return restaurant.isActive ? 'Ouvert' : 'Fermé';
  };

  // Styles responsifs
  const styles = StyleSheet.create({
    container: {
      backgroundColor: variant === 'featured' ? COLORS.goldenSurface : COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: variant === 'featured' ? 2 : 1,
      borderColor: variant === 'featured' ? COLORS.border.golden : COLORS.border.light,
      ...(variant === 'featured' ? SHADOWS.premiumCard : SHADOWS.card),
    },

    imageContainer: {
      position: 'relative',
      backgroundColor: COLORS.border.light,
    },

    image: {
      width: '100%',
      height: variant === 'compact' ? 120 : 160,
      backgroundColor: COLORS.border.light,
    },

    imagePlaceholder: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.border.light,
    },

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
      ...SHADOWS.sm,
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
      color: COLORS.text.primary,
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
      color: COLORS.text.primary,
      lineHeight: getLineHeight('md', screenType, 'tight'),
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },

    ratingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.variants.secondary[100],
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.sm,
    },

    ratingText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.variants.secondary[700],
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
      color: COLORS.text.secondary,
      marginLeft: 6,
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },

    priceRange: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.success,
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
      color: COLORS.text.light,
      fontWeight: TYPOGRAPHY.fontWeight.normal,
    },

    distanceContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.variants.primary[100],
      paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
    },

    distanceText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      marginLeft: 2,
    },
  });

  return (
    <TouchableOpacity 
      onPress={onPress} 
      activeOpacity={0.7}
      style={styles.container}
    >
      {/* Image avec gestion d'erreur améliorée */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: getRestaurantImageUri() }}
          style={styles.image}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
        
        {/* Placeholder si image en erreur */}
        {imageError && (
          <View style={styles.imagePlaceholder}>
            <Ionicons 
              name="restaurant-outline" 
              size={32} 
              color={COLORS.text.light} 
            />
          </View>
        )}

        {/* Indicateur de statut en overlay */}
        <View style={styles.statusIndicator}>
          <View 
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor() }
            ]} 
          />
          <Text style={styles.statusText}>
            {getStatusText()}
          </Text>
        </View>
      </View>
      
      {/* Contenu de la carte */}
      <View style={styles.content}>
        {/* En-tête avec nom et note */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {restaurant.name}
          </Text>
          
          {typeof restaurant.rating === 'number' && restaurant.rating > 0 && (
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={12} color={COLORS.variants.secondary[700]} />
              <Text style={styles.ratingText}>
                {restaurant.rating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>

        {/* Localisation */}
        <View style={styles.infoRow}>
          <Ionicons 
            name="location-outline" 
            size={14} 
            color={COLORS.text.secondary} 
          />
          <Text style={styles.infoText} numberOfLines={1}>
            {restaurant.address}, {restaurant.city}
          </Text>
        </View>

        {/* Type de cuisine et gamme de prix */}
        <View style={styles.infoRow}>
          <Ionicons 
            name="restaurant-outline" 
            size={14} 
            color={COLORS.text.secondary} 
          />
          <Text style={styles.infoText} numberOfLines={1}>
            {restaurant.cuisine}
          </Text>
          <Text style={styles.priceRange}>
            {getPriceRangeText(restaurant.priceRange)}
          </Text>
        </View>

        {/* Distance si affichée */}
        {showDistance && distance !== undefined && (
          <View style={styles.infoRow}>
            <Ionicons 
              name="walk-outline" 
              size={14} 
              color={COLORS.text.secondary} 
            />
            <Text style={styles.infoText}>
              {typeof distance === 'number' ? distance.toFixed(1) : '0.0'} km
            </Text>
          </View>
        )}

        {/* Pied avec nombre d'avis et éventuellement distance */}
        <View style={styles.footer}>
          <Text style={styles.reviewCount}>
            {restaurant.reviewCount} avis
          </Text>
          
          {showDistance && distance !== undefined && (
            <View style={styles.distanceContainer}>
              <Ionicons 
                name="time-outline" 
                size={12} 
                color={COLORS.primary} 
              />
              <Text style={styles.distanceText}>
                {Math.ceil((distance || 0) * 12)} min
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};