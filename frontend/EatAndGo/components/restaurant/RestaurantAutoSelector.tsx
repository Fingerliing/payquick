import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { CUISINE_OPTIONS, CuisineType } from '@/types/restaurant';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Header } from '@/components/ui/Header';

const COLORS = {
  primary: '#1E2A78',
  primaryLight: '#2D3E9E',
  secondary: '#D4AF37',
  background: '#F7F8FC',
  surface: '#FFFFFF',
  goldenSurface: '#FFFCF0',
  text: {
    primary: '#0D1117',
    secondary: '#5A6478',
    light: '#A0ABBE',
    inverse: '#FFFFFF',
    golden: '#A8841A',
  },
  border: {
    light: '#ECEEF4',
    default: '#D8DCE8',
    golden: '#E6D08A',
  },
  gold: {
    50: '#FFFEF7',
    100: '#FFF8DC',
    200: '#F5E6A3',
    500: '#D4AF37',
    600: '#BC9A2E',
    700: '#8B6E14',
  },
};

function getCuisineLabel(cuisine: CuisineType): string {
  const option = CUISINE_OPTIONS.find(opt => opt.value === cuisine);
  return option?.label || cuisine;
}

interface RestaurantAutoSelectorProps {
  children: React.ReactNode;
  noRestaurantMessage?: string;
  createButtonText?: string;
  onRestaurantSelected?: (restaurantId: string) => void;
}

// ─── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen({ message }: { message: string }) {
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={[styles.loadingOrb, { opacity: pulseAnim }]}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryLight]}
          style={styles.loadingOrbInner}
        >
          <Ionicons name="restaurant" size={28} color={COLORS.secondary} />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

// ─── Restaurant card ───────────────────────────────────────────────────────────
function RestaurantCard({
  restaurant,
  onPress,
  disabled,
  index,
}: {
  restaurant: any;
  onPress: () => void;
  disabled: boolean;
  index: number;
}) {
  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 380,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 380,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.975, useNativeDriver: true, speed: 50 }).start();

  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  const hasImage = !!(restaurant.image || restaurant.image_url);

  return (
    <Animated.View
      style={[
        styles.cardWrapper,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={1}
        style={styles.card}
      >
        <View style={styles.cardImageContainer}>
          {hasImage ? (
            <Image
              source={{ uri: restaurant.image_url || (restaurant.image as string) }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[COLORS.gold[100], COLORS.gold[200]]}
              style={styles.cardImagePlaceholder}
            >
              <Ionicons name="restaurant" size={28} color={COLORS.secondary} />
            </LinearGradient>
          )}
          <View style={styles.cardImageOverlay} />
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {restaurant.name}
          </Text>

          {restaurant.address && (
            <View style={styles.cardMeta}>
              <Ionicons name="location" size={12} color={COLORS.secondary} />
              <Text style={styles.cardMetaText} numberOfLines={1}>
                {restaurant.full_address || `${restaurant.address}, ${restaurant.city}`}
              </Text>
            </View>
          )}

          {restaurant.cuisine && (
            <View style={styles.cuisineBadge}>
              <Text style={styles.cuisineBadgeText}>
                {getCuisineLabel(restaurant.cuisine)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardArrow}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryLight]}
            style={styles.cardArrowInner}
          >
            <Ionicons name="arrow-forward" size={16} color={COLORS.text.inverse} />
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function RestaurantAutoSelector({
  children,
  noRestaurantMessage = "Vous n'avez pas encore de restaurant",
  createButtonText = 'Créer mon premier restaurant',
  onRestaurantSelected,
}: RestaurantAutoSelectorProps) {
  const { currentRestaurant, restaurants, isLoading, loadRestaurants, loadRestaurant } =
    useRestaurant();

  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [showSelector, setShowSelector]       = useState(false);

  const emptyFadeAnim  = useRef(new Animated.Value(0)).current;
  const emptyScaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (!isLoading && restaurants.length === 0) {
      loadRestaurants();
    }
  }, []);

  useEffect(() => {
    if (!isLoading && restaurants.length === 0) {
      Animated.parallel([
        Animated.timing(emptyFadeAnim, {
          toValue: 1,
          duration: 500,
          delay: 100,
          useNativeDriver: true,
        }),
        Animated.spring(emptyScaleAnim, {
          toValue: 1,
          delay: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isLoading, restaurants.length]);

  useEffect(() => {
    if (currentRestaurant || isLoading || restaurants.length === 0 || isAutoSelecting) return;

    if (restaurants.length === 1) {
      setIsAutoSelecting(true);
      const restaurant = restaurants[0];
      loadRestaurant(restaurant.id)
        .then(() => {
          setIsAutoSelecting(false);
          onRestaurantSelected?.(restaurant.id);
        })
        .catch(() => {
          setIsAutoSelecting(false);
          setShowSelector(true);
        });
      return;
    }

    if (restaurants.length > 1) {
      setShowSelector(true);
    }
  }, [currentRestaurant, restaurants, isLoading, isAutoSelecting, onRestaurantSelected]);

  const handleSelectRestaurant = async (restaurantId: string) => {
    try {
      setIsAutoSelecting(true);
      await loadRestaurant(restaurantId);
      setShowSelector(false);
      onRestaurantSelected?.(restaurantId);
    } catch {
    } finally {
      setIsAutoSelecting(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading || (isAutoSelecting && !showSelector)) {
    return (
      <LoadingScreen
        message={isAutoSelecting ? 'Sélection en cours…' : 'Chargement…'}
      />
    );
  }

  // ── Cas 1 : aucun restaurant ───────────────────────────────────────────────
  if (restaurants.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <LinearGradient
          colors={['#EEF0FB', COLORS.background]}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          style={[
            styles.emptyCard,
            { opacity: emptyFadeAnim, transform: [{ scale: emptyScaleAnim }] },
          ]}
        >
          <View style={styles.emptyIconWrapper}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryLight]}
              style={styles.emptyIconBg}
            >
              <Ionicons name="storefront-outline" size={40} color={COLORS.secondary} />
            </LinearGradient>
            <View style={styles.emptyIconGlow} />
          </View>

          <Text style={styles.emptyTitle}>{noRestaurantMessage}</Text>
          <Text style={styles.emptySubtitle}>
            Créez votre premier restaurant pour commencer à gérer vos menus et commandes.
          </Text>

          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/restaurant/create')}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[COLORS.secondary, COLORS.gold[600]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGradient}
            >
              <Ionicons name="add" size={22} color={COLORS.primary} />
              <Text style={styles.ctaText}>{createButtonText}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Ionicons name="arrow-back-outline" size={16} color={COLORS.text.secondary} />
            <Text style={styles.backLinkText}>Retour</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── Cas 2 : plusieurs restaurants ─────────────────────────────────────────
  if (showSelector) {
    return (
      <View style={styles.selectorContainer}>
        <Header
          title="Choisir un restaurant"
          showBackButton
          includeSafeArea
        />

        <ScrollView
          style={styles.selectorScroll}
          contentContainerStyle={styles.selectorScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.selectorHint}>
            Sélectionnez le restaurant que vous souhaitez gérer.
          </Text>

          {restaurants.map((restaurant, index) => (
            <RestaurantCard
              key={restaurant.id}
              restaurant={restaurant}
              onPress={() => handleSelectRestaurant(restaurant.id)}
              disabled={isAutoSelecting}
              index={index}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Cas 3 : restaurant sélectionné ────────────────────────────────────────
  return <>{children}</>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Loading
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  loadingOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  loadingOrbInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: COLORS.text.secondary,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    maxWidth: 380,
    width: '100%',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 6,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  emptyIconWrapper: {
    position: 'relative',
    marginBottom: 28,
  },
  emptyIconBg: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconGlow: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -32,
    width: 64,
    height: 20,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    opacity: 0.12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 32,
  },
  ctaButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    paddingHorizontal: 28,
    gap: 10,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.2,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },

  // Selector
  selectorContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  selectorGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  selectorScroll: {
    flex: 1,
  },
  selectorScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  selectorHint: {
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 20,
    lineHeight: 21,
  },

  // Restaurant card
  cardWrapper: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  cardImageContainer: {
    width: 80,
    height: 80,
    position: 'relative',
  },
  cardImage: {
    width: 80,
    height: 80,
  },
  cardImagePlaceholder: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageOverlay: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 16,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
  },
  cardBody: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 5,
    letterSpacing: -0.2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 7,
  },
  cardMetaText: {
    fontSize: 12,
    color: COLORS.text.secondary,
    flex: 1,
  },
  cuisineBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold[100],
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.gold[200],
  },
  cuisineBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text.golden,
    letterSpacing: 0.2,
  },
  cardArrow: {
    paddingRight: 16,
  },
  cardArrowInner: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Footer
  selectorFooter: {
    marginTop: 8,
    alignItems: 'center',
  },
});