import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Restaurant, CUISINE_OPTIONS, CuisineType } from '@/types/restaurant';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const COLORS = {
  primary: '#1E2A78',
  secondary: '#D4AF37',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  goldenSurface: '#FFFCF0',
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF',
    inverse: '#FFFFFF',
    golden: '#B8941F',
  },
  border: {
    light: '#F3F4F6',
    default: '#E5E7EB',
    golden: '#E6D08A',
  },
  variants: {
    secondary: {
      50: '#FFFEF7',
      100: '#FFFBEB',
      500: '#D4AF37',
      700: '#A16207',
    },
  },
};

/**
 * Helper pour obtenir le label traduit d'un type de cuisine
 */
function getCuisineLabel(cuisine: CuisineType): string {
  const option = CUISINE_OPTIONS.find(opt => opt.value === cuisine);
  return option?.label || cuisine;
}

interface RestaurantAutoSelectorProps {
  /**
   * Composant enfant à afficher une fois qu'un restaurant est sélectionné
   */
  children: React.ReactNode;
  /**
   * Message personnalisé à afficher si aucun restaurant n'existe
   */
  noRestaurantMessage?: string;
  /**
   * Texte du bouton pour créer un restaurant
   */
  createButtonText?: string;
  /**
   * Callback appelé après la sélection automatique d'un restaurant
   */
  onRestaurantSelected?: (restaurantId: string) => void;
}

/**
 * Composant qui gère automatiquement la sélection du restaurant :
 * - Si un restaurant est déjà sélectionné, affiche les enfants
 * - S'il n'y a qu'un seul restaurant, le sélectionne automatiquement
 * - S'il y a plusieurs restaurants, affiche un sélecteur
 * - S'il n'y a aucun restaurant, affiche un message avec un bouton de création
 */
export function RestaurantAutoSelector({
  children,
  noRestaurantMessage = "Vous n'avez pas encore de restaurant",
  createButtonText = "Créer mon premier restaurant",
  onRestaurantSelected,
}: RestaurantAutoSelectorProps) {
  const {
    currentRestaurant,
    restaurants,
    isLoading,
    loadRestaurants,
    loadRestaurant,
  } = useRestaurant();

  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

  // Charger les restaurants au montage
  useEffect(() => {
    if (!isLoading && restaurants.length === 0) {
      loadRestaurants();
    }
  }, []);

  // Logique de sélection automatique
  useEffect(() => {
    // Si un restaurant est déjà sélectionné, ne rien faire
    if (currentRestaurant) {
      return;
    }

    // Si les restaurants sont en cours de chargement, attendre
    if (isLoading) {
      return;
    }

    // Si aucun restaurant, ne rien faire (l'UI affichera le message approprié)
    if (restaurants.length === 0) {
      return;
    }

    // Si un seul restaurant, le sélectionner automatiquement
    if (restaurants.length === 1 && !isAutoSelecting) {
      setIsAutoSelecting(true);
      const restaurant = restaurants[0];
      console.log('🎯 Sélection automatique du restaurant unique:', restaurant.name);
      
      loadRestaurant(restaurant.id)
        .then(() => {
          setIsAutoSelecting(false);
          if (onRestaurantSelected) {
            onRestaurantSelected(restaurant.id);
          }
        })
        .catch((error) => {
          console.error('Erreur lors de la sélection automatique:', error);
          setIsAutoSelecting(false);
          setShowSelector(true);
        });
      return;
    }

    // Si plusieurs restaurants, afficher le sélecteur
    if (restaurants.length > 1) {
      setShowSelector(true);
    }
  }, [currentRestaurant, restaurants, isLoading, isAutoSelecting, onRestaurantSelected]);

  // Fonction pour sélectionner un restaurant manuellement
  const handleSelectRestaurant = async (restaurantId: string) => {
    try {
      setIsAutoSelecting(true);
      await loadRestaurant(restaurantId);
      setShowSelector(false);
      if (onRestaurantSelected) {
        onRestaurantSelected(restaurantId);
      }
    } catch (error) {
      console.error('Erreur lors de la sélection du restaurant:', error);
    } finally {
      setIsAutoSelecting(false);
    }
  };

  // Afficher un loader pendant le chargement initial ou la sélection automatique
  if (isLoading || (isAutoSelecting && !showSelector)) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>
          {isAutoSelecting ? 'Sélection du restaurant...' : 'Chargement...'}
        </Text>
      </View>
    );
  }

  // Cas 1 : Aucun restaurant n'existe
  if (restaurants.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.emptyStateCard}>
          <LinearGradient
            colors={[COLORS.variants.secondary[100], COLORS.variants.secondary[50]]}
            style={styles.emptyIconContainer}
          >
            <Ionicons name="restaurant-outline" size={64} color={COLORS.secondary} />
          </LinearGradient>
          
          <Text style={styles.emptyTitle}>{noRestaurantMessage}</Text>
          <Text style={styles.emptyDescription}>
            Créez votre premier restaurant pour commencer à utiliser cette fonctionnalité.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/restaurant/create')}
          >
            <LinearGradient
              colors={[COLORS.secondary, COLORS.variants.secondary[700]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />
              <Text style={styles.primaryButtonText}>{createButtonText}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Cas 2 : Plusieurs restaurants, afficher le sélecteur
  if (showSelector) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sélectionner un restaurant</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.selectorDescription}>
            Veuillez sélectionner le restaurant pour lequel vous souhaitez gérer cette fonctionnalité.
          </Text>

          {restaurants.map((restaurant) => (
            <TouchableOpacity
              key={restaurant.id}
              style={styles.restaurantCard}
              onPress={() => handleSelectRestaurant(restaurant.id)}
              disabled={isAutoSelecting}
            >
              <View style={styles.restaurantCardContent}>
                {(restaurant.image || restaurant.image_url) ? (
                  <Image
                    source={{ uri: restaurant.image_url || restaurant.image as string }}
                    style={styles.restaurantLogo}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.restaurantLogo, styles.restaurantLogoPlaceholder]}>
                    <Ionicons name="restaurant" size={32} color={COLORS.secondary} />
                  </View>
                )}

                <View style={styles.restaurantInfo}>
                  <Text style={styles.restaurantName}>{restaurant.name}</Text>
                  {restaurant.address && (
                    <View style={styles.restaurantMeta}>
                      <Ionicons name="location-outline" size={14} color={COLORS.text.secondary} />
                      <Text style={styles.restaurantAddress} numberOfLines={1}>
                        {restaurant.full_address || `${restaurant.address}, ${restaurant.city}`}
                      </Text>
                    </View>
                  )}
                  {restaurant.cuisine && (
                    <View style={styles.restaurantMeta}>
                      <Ionicons name="fast-food-outline" size={14} color={COLORS.text.secondary} />
                      <Text style={styles.restaurantCuisine}>
                        {getCuisineLabel(restaurant.cuisine)}
                      </Text>
                    </View>
                  )}
                </View>

                <Ionicons name="chevron-forward" size={24} color={COLORS.text.light} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Cas 3 : Un restaurant est sélectionné, afficher les enfants
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 24,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  headerSpacer: {
    width: 40,
  },
  
  // Loading
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  
  // Empty State
  emptyStateCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 400,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  
  // Buttons
  primaryButton: {
    width: '100%',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.inverse,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },
  
  // Restaurant Selector
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  selectorDescription: {
    fontSize: 16,
    color: COLORS.text.secondary,
    marginBottom: 24,
    lineHeight: 24,
  },
  
  // Restaurant Card
  restaurantCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  restaurantCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  restaurantLogo: {
    width: 64,
    height: 64,
    borderRadius: 12,
    marginRight: 16,
  },
  restaurantLogoPlaceholder: {
    backgroundColor: COLORS.goldenSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantInfo: {
    flex: 1,
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  restaurantMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  restaurantAddress: {
    fontSize: 14,
    color: COLORS.text.secondary,
    flex: 1,
  },
  restaurantCuisine: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
});