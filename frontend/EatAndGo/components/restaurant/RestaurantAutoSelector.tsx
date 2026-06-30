import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { useRestaurant } from '@/contexts/RestaurantContext';
import { CUISINE_OPTIONS, CuisineType } from '@/types/restaurant';
import { Header } from '@/components/ui/Header';
import {
  useAppTheme,
  type AppColors,
} from '@/utils/designSystem';

// ──────────────────────────────────────────────────────────────────────────
// Palette gold *stable* dans les 2 modes — identité visuelle premium de
// l'écran de sélection. On garde cette palette indépendante du thème pour
// préserver le caractère "salon doré" du composant.
// ──────────────────────────────────────────────────────────────────────────
const GOLD_STABLE = {
  50:  '#FFFEF7',
  100: '#FFF8DC',
  200: '#F5E6A3',
  500: '#D4AF37',
  600: '#BC9A2E',
  700: '#8B6E14',
} as const;

const NAVY_STABLE = {
  primary:      '#1E2A78',
  primaryLight: '#2D3E9E',
} as const;

function getCuisineLabel(cuisine: CuisineType): string {
  const option = CUISINE_OPTIONS.find((opt) => opt.value === cuisine);
  return option?.label || cuisine;
}

interface RestaurantAutoSelectorProps {
  children: React.ReactNode;
  /** Si non fourni, fallback sur `t('restaurantSelector.noRestaurantTitle')`. */
  noRestaurantMessage?: string;
  /** Si non fourni, fallback sur `t('restaurantSelector.createFirst')`. */
  createButtonText?: string;
  onRestaurantSelected?: (restaurantId: string) => void;
}

// ──────────────────────────────────────────────────────────────────────────
// LoadingScreen — orbe pulsée or-sur-navy (identitaire)
// ──────────────────────────────────────────────────────────────────────────
function LoadingScreen({ message }: { message: string }) {
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.loadingContainer}>
      <Animated.View style={[styles.loadingOrb, { opacity: pulseAnim }]}>
        <LinearGradient
          colors={[NAVY_STABLE.primary, NAVY_STABLE.primaryLight]}
          style={styles.loadingOrbInner}
        >
          <Ionicons name="restaurant" size={28} color={GOLD_STABLE[500]} />
        </LinearGradient>
      </Animated.View>
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// RestaurantCard interne — anim d'entrée slide + fade
// ──────────────────────────────────────────────────────────────────────────
function RestaurantCardItem({
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
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

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
  }, [slideAnim, fadeAnim, index]);

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
              colors={[GOLD_STABLE[100], GOLD_STABLE[200]]}
              style={styles.cardImagePlaceholder}
            >
              <Ionicons name="restaurant" size={28} color={GOLD_STABLE[500]} />
            </LinearGradient>
          )}
          {/* Overlay arrondi qui pioche dans la surface du thème courant
              pour fondre l'image dans la carte */}
          <View style={styles.cardImageOverlay} />
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>
            {restaurant.name}
          </Text>

          {restaurant.address && (
            <View style={styles.cardMeta}>
              <Ionicons name="location" size={12} color={GOLD_STABLE[500]} />
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
            colors={[NAVY_STABLE.primary, NAVY_STABLE.primaryLight]}
            style={styles.cardArrowInner}
          >
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </LinearGradient>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────
export function RestaurantAutoSelector({
  children,
  noRestaurantMessage,
  createButtonText,
  onRestaurantSelected,
}: RestaurantAutoSelectorProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const { currentRestaurant, restaurants, isLoading, loadRestaurants, loadRestaurant } =
    useRestaurant();

  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const [showSelector, setShowSelector]       = useState(false);

  const emptyFadeAnim  = useRef(new Animated.Value(0)).current;
  const emptyScaleAnim = useRef(new Animated.Value(0.92)).current;

  // Defaults i18n
  const effectiveNoRestaurantMessage =
    noRestaurantMessage ?? t('restaurantSelector.noRestaurantTitle');
  const effectiveCreateButtonText =
    createButtonText ?? t('restaurantSelector.createFirst');

  useEffect(() => {
    if (!isLoading && restaurants.length === 0) {
      loadRestaurants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [isLoading, restaurants.length, emptyFadeAnim, emptyScaleAnim]);

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
  }, [currentRestaurant, restaurants, isLoading, isAutoSelecting, loadRestaurant, onRestaurantSelected]);

  const handleSelectRestaurant = async (restaurantId: string) => {
    try {
      setIsAutoSelecting(true);
      await loadRestaurant(restaurantId);
      setShowSelector(false);
      onRestaurantSelected?.(restaurantId);
    } catch {
      // Erreur silencieuse — l'utilisateur peut retenter via le sélecteur
    } finally {
      setIsAutoSelecting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading || (isAutoSelecting && !showSelector)) {
    return (
      <LoadingScreen
        message={
          isAutoSelecting
            ? t('restaurantSelector.selecting')
            : t('common.loading')
        }
      />
    );
  }

  // ── Cas 1 : aucun restaurant ─────────────────────────────────────────
  if (restaurants.length === 0) {
    // Dégradé subtil derrière la carte : on prend deux teintes proches du
    // background pour conserver l'effet "respirant" dans les 2 modes.
    const backgroundGradient: [string, string] = isDark
      ? ['#1A1F33', colors.background]
      : ['#EEF0FB', colors.background];

    return (
      <View style={styles.emptyContainer}>
        <LinearGradient
          colors={backgroundGradient}
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
              colors={[NAVY_STABLE.primary, NAVY_STABLE.primaryLight]}
              style={styles.emptyIconBg}
            >
              <Ionicons name="storefront-outline" size={40} color={GOLD_STABLE[500]} />
            </LinearGradient>
            <View style={styles.emptyIconGlow} />
          </View>

          <Text style={styles.emptyTitle}>{effectiveNoRestaurantMessage}</Text>
          <Text style={styles.emptySubtitle}>
            {t('restaurantSelector.noRestaurantSubtitle')}
          </Text>

          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/restaurant/create')}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[GOLD_STABLE[500], GOLD_STABLE[600]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaGradient}
            >
              <Ionicons name="add" size={22} color={NAVY_STABLE.primary} />
              <Text style={styles.ctaText}>{effectiveCreateButtonText}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Ionicons
              name="arrow-back-outline"
              size={16}
              color={colors.text.secondary}
            />
            <Text style={styles.backLinkText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── Cas 2 : plusieurs restaurants ────────────────────────────────────
  if (showSelector) {
    return (
      <View style={styles.selectorContainer}>
        <Header
          title={t('restaurantSelector.chooseTitle')}
          showBackButton
          includeSafeArea
        />

        <ScrollView
          style={styles.selectorScroll}
          contentContainerStyle={styles.selectorScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.selectorHint}>
            {t('restaurantSelector.chooseHint')}
          </Text>

          {restaurants.map((restaurant, index) => (
            <RestaurantCardItem
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

  // ── Cas 3 : restaurant sélectionné ───────────────────────────────────
  return <>{children}</>;
}

// ──────────────────────────────────────────────────────────────────────────
// STYLES (fabrique theme-aware)
// ──────────────────────────────────────────────────────────────────────────
const makeStyles = (colors: AppColors, isDark: boolean) =>
  StyleSheet.create({
    // ── Loading ────────────────────────────────────────────────────────
    loadingContainer: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
    },
    loadingOrb: {
      width: 80,
      height: 80,
      borderRadius: 40,
      shadowColor: NAVY_STABLE.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.5 : 0.3,
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
      color: colors.text.secondary,
      fontWeight: '500',
      letterSpacing: 0.3,
    },

    // ── Empty state ────────────────────────────────────────────────────
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 36,
      alignItems: 'center',
      maxWidth: 380,
      width: '100%',
      shadowColor: NAVY_STABLE.primary,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 32,
      elevation: 6,
      borderWidth: 1,
      // Hairline dorée subtile en dark, neutre en light
      borderColor: isDark
        ? 'rgba(212, 175, 55, 0.12)'
        : colors.border.light,
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
      backgroundColor: NAVY_STABLE.primary,
      opacity: isDark ? 0.25 : 0.12,
    },
    emptyTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 12,
      letterSpacing: -0.4,
    },
    emptySubtitle: {
      fontSize: 15,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 23,
      marginBottom: 32,
    },
    ctaButton: {
      width: '100%',
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 16,
      shadowColor: GOLD_STABLE[500],
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
      // Texte foncé stable sur fond or — lisibilité optimale
      color: NAVY_STABLE.primary,
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
      color: colors.text.secondary,
    },

    // ── Selector ───────────────────────────────────────────────────────
    selectorContainer: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: colors.text.secondary,
      marginBottom: 20,
      lineHeight: 21,
    },

    // ── Restaurant card ────────────────────────────────────────────────
    cardWrapper: {
      marginBottom: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      flexDirection: 'row',
      alignItems: 'center',
      overflow: 'hidden',
      shadowColor: NAVY_STABLE.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.06,
      shadowRadius: 14,
      elevation: 3,
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(212, 175, 55, 0.12)'
        : colors.border.light,
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
    // Overlay arrondi qui fond l'image dans la carte — utilise la
    // surface du thème courant
    cardImageOverlay: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 16,
      backgroundColor: colors.surface,
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
      color: colors.text.primary,
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
      flex: 1,
      fontSize: 12,
      color: colors.text.secondary,
    },
    cuisineBadge: {
      alignSelf: 'flex-start',
      // Badge or stable — identité visuelle
      backgroundColor: isDark ? 'rgba(212, 175, 55, 0.12)' : GOLD_STABLE[100],
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.30)' : GOLD_STABLE[200],
    },
    cuisineBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      // Or chaud lisible dans les 2 modes
      color: isDark ? GOLD_STABLE[500] : GOLD_STABLE[700],
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
  });