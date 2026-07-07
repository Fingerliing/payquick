import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Header } from '@/components/ui/Header';
import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  type AppColors,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
} from '@/utils/designSystem';
import { useTranslation } from 'react-i18next';
import { useLocation } from '@/app/hooks/useLocation';
import { StarRating } from '@/components/restaurant/StarRating';
import { RestaurantMap } from '@/components/restaurant/RestaurantMap';
import {
  restaurantDirectoryService,
  type DirectoryRestaurant,
} from '@/services/restaurantDirectoryService';

const MAX_CONTENT_WIDTH = 1200;
const NEARBY_RADIUS_KM = 15;


// =============================================================================
// Couleurs (theme-aware)
// =============================================================================
const makeColors = (c: AppColors, isDark: boolean) => ({
  primary: c.primary,
  secondary: c.secondary,
  background: c.background,
  cardBg: c.surface,
  text: c.text.primary,
  textSecondary: c.text.secondary,
  textMuted: c.text.light,
  border: c.border.light,
  chipBg: isDark ? c.variants.primary[100] : c.variants.primary[50],
  chipActiveBg: c.primary,
  star: '#D4AF37',
});
type DirColors = ReturnType<typeof makeColors>;
type ScreenType = ReturnType<typeof useScreenType>;

function columnsFor(screenType: ScreenType): number {
  return screenType === 'desktop' ? 3 : screenType === 'tablet' ? 2 : 1;
}

export default function RestaurantDirectoryScreen() {
  const { colors: C, isDark } = useAppTheme();
  const { t } = useTranslation();
  const cuisineLabel = useCallback(
    (v: string) => t('addRestaurant.cuisines.' + v, { defaultValue: v }),
    [t]
  );
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const colors = useMemo(() => makeColors(C, isDark), [C, isDark]);

  const numColumns = useMemo(() => columnsFor(screenType), [screenType]);
  const styles = useMemo(
    () => createStyles(colors, screenType, insets, width, numColumns),
    [colors, screenType, insets, width, numColumns]
  );

  // Tailles pilotées par le rendu (props de composants, pas des styles)
  const starSize = getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType);

  const location = useLocation();

  const [all, setAll] = useState<DirectoryRestaurant[]>([]);
  const [nearby, setNearby] = useState<DirectoryRestaurant[] | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locating, setLocating] = useState(false);

  // ── Chargement ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    const data = await restaurantDirectoryService.getDirectory();
    setAll(data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadAll();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  }, [loadAll]);

  // ── Villes & cuisines dérivées ───────────────────────────────────────────
  const cities = useMemo(() => {
    const set = new Set<string>();
    all.forEach((r) => {
      const city = (r.city || '').trim();
      if (city) set.add(city);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [all]);

  const cuisines = useMemo(() => {
    const set = new Set<string>();
    all.forEach((r) => {
      const cu = (r.cuisine || '').trim();
      if (cu) set.add(cu);
    });
    return Array.from(set).sort((a, b) => cuisineLabel(a).localeCompare(cuisineLabel(b), 'fr'));
  }, [all, cuisineLabel]);

  // ── Filtrage ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (selectedCity && (r.city || '').trim() !== selectedCity) return false;
      if (selectedCuisine && (r.cuisine || '').trim() !== selectedCuisine) return false;
      if (q && !(r.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, selectedCity, selectedCuisine, search]);

  // ── « Autour de moi » ────────────────────────────────────────────────────
  const openNearbyMap = useCallback(async () => {
    setLocating(true);
    try {
      await location.getCurrentLocation();
      const loc = location.location;
      if (loc) {
        const res = await restaurantDirectoryService.getNearby(
          loc.latitude,
          loc.longitude,
          NEARBY_RADIUS_KM,
          selectedCuisine || undefined
        );
        setNearby(res.results);
      } else {
        setNearby(null);
      }
      setViewMode('map');
    } catch {
      setNearby(null);
      setViewMode('map');
    } finally {
      setLocating(false);
    }
  }, [location, selectedCuisine]);

  const userLoc = location.location
    ? { latitude: location.location.latitude, longitude: location.location.longitude }
    : null;

  const mapRestaurants = useMemo(() => {
    const base = nearby ?? filtered;
    return base.filter((r) => r.latitude != null && r.longitude != null);
  }, [nearby, filtered]);

  const shownCount = viewMode === 'map' ? mapRestaurants.length : filtered.length;

  const openRestaurant = useCallback((id: string) => {
    // Écran menu client (app/menu/client/[restaurantId].tsx).
    router.push(`/menu/client/${id}` as any);
  }, []);

  // ── Carte restaurant ─────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: DirectoryRestaurant }) => {
      const rating = Number(item.rating ?? 0);
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => openRestaurant(String(item.id))}
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {rating > 0 ? (
              <View style={styles.ratingWrap}>
                <StarRating value={rating} size={starSize} />
                <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                {item.reviewCount != null ? (
                  <Text style={styles.reviewCount}>({item.reviewCount})</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.noRating}>{t('directory.new')}</Text>
            )}
          </View>

          <View style={styles.metaRow}>
            {item.cuisine ? <Text style={styles.metaText}>{cuisineLabel(item.cuisine)}</Text> : null}
            {item.cuisine && item.city ? <Text style={styles.metaDot}>·</Text> : null}
            {item.city ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.city}
                </Text>
              </View>
            ) : null}
          </View>

          {item.address ? (
            <Text style={styles.address} numberOfLines={1}>
              {item.address}
            </Text>
          ) : null}

          {item.distance_km != null ? (
            <View style={styles.distanceRow}>
              <Ionicons name="navigate" size={13} color={colors.primary} />
              <Text style={styles.distanceText}>{item.distance_km.toFixed(1)} km</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [styles, colors, openRestaurant, starSize, cuisineLabel]
  );

  // Bloc de filtres partagé (rendu dans une zone centrée/bornée).
  const renderFilters = () => (
    <View style={styles.contentWrap}>
      {/* Recherche + Autour de moi */}
      <View style={styles.topRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('directory.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.nearbyBtn}
          onPress={openNearbyMap}
          activeOpacity={0.85}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="navigate" size={18} color="#fff" />
              {screenType !== 'mobile' ? (
                <Text style={styles.nearbyBtnText}>{t('directory.nearby')}</Text>
              ) : null}
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Filtre par ville */}
      {cities.length > 0 ? (
        <>
          <Text style={styles.filterLabel}>{t('directory.filterCity')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Chip label={t('directory.all')} active={selectedCity === null} onPress={() => setSelectedCity(null)} styles={styles} />
            {cities.map((city) => (
              <Chip key={city} label={city} active={selectedCity === city} onPress={() => setSelectedCity(city)} styles={styles} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Filtre par cuisine */}
      {cuisines.length > 0 ? (
        <>
          <Text style={styles.filterLabel}>{t('directory.filterCuisine')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <Chip label={t('directory.all')} active={selectedCuisine === null} onPress={() => setSelectedCuisine(null)} styles={styles} />
            {cuisines.map((cu) => (
              <Chip key={cu} label={cuisineLabel(cu)} active={selectedCuisine === cu} onPress={() => setSelectedCuisine(cu)} styles={styles} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Barre liste / carte */}
      <View style={styles.viewToggleRow}>
        <Text style={styles.resultCount}>
          {t('directory.resultCount', { count: shownCount })}
        </Text>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons name="list" size={18} color={viewMode === 'list' ? '#fff' : colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'map' && styles.viewToggleBtnActive]}
            onPress={() => setViewMode('map')}
          >
            <Ionicons name="map" size={18} color={viewMode === 'map' ? '#fff' : colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <Header
        title={t('directory.title')}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        includeSafeArea
      />

      {renderFilters()}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : viewMode === 'map' ? (
        <View style={styles.mapFill}>
          {!userLoc && !nearby ? (
            <TouchableOpacity style={styles.locateCta} onPress={openNearbyMap} activeOpacity={0.85}>
              <Ionicons name="navigate" size={16} color={colors.primary} />
              <Text style={styles.locateCtaText}>{t('directory.activateNearby')}</Text>
            </TouchableOpacity>
          ) : null}
          <RestaurantMap
            restaurants={mapRestaurants}
            userLocation={userLoc}
            fill
            onSelectRestaurant={openRestaurant}
          />
        </View>
      ) : (
        <FlatList
          key={`cols-${numColumns}`}
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="restaurant-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {selectedCity
                  ? t('directory.emptyCity', { city: selectedCity })
                  : t('directory.emptySearch')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// =============================================================================
// Sous-composant : puce de filtre
// =============================================================================
function Chip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// =============================================================================
// Styles responsive
// =============================================================================
function createStyles(
  colors: DirColors,
  screenType: ScreenType,
  insets: EdgeInsets,
  width: number,
  numColumns: number
) {
  // Espacements responsive (SPACING.* = { mobile, tablet, desktop }).
  const s = {
    xs: getResponsiveValue(SPACING.xs, screenType),
    sm: getResponsiveValue(SPACING.sm, screenType),
    md: getResponsiveValue(SPACING.md, screenType),
    lg: getResponsiveValue(SPACING.lg, screenType),
  };
  const pad = getResponsiveValue(SPACING.container, screenType);

  // Typographie responsive (TYPOGRAPHY.fontSize.* = { mobile, tablet, desktop }).
  const fs = {
    title: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
    base: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    sm: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    xs: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
  };

  // Largeur d'une carte en grille (bornée à MAX_CONTENT_WIDTH puis centrée).
  const contentW = Math.min(width, MAX_CONTENT_WIDTH);
  const colGap = s.sm;
  const cardWidth =
    numColumns > 1 ? (contentW - pad * 2 - colGap * (numColumns - 1)) / numColumns : undefined;

  // Conteneur centré/borné réutilisé pour les zones fixes et scrollables.
  const centered = {
    width: '100%' as const,
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center' as const,
  };

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },

    contentWrap: { ...centered, paddingHorizontal: pad },

    topRow: { flexDirection: 'row', alignItems: 'center', gap: s.sm, paddingTop: s.sm },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: s.sm,
      backgroundColor: colors.cardBg,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: s.md,
      height: 46,
    },
    searchInput: { flex: 1, color: colors.text, fontSize: fs.base, paddingVertical: 0 },
    nearbyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 46,
      minWidth: 46,
      paddingHorizontal: screenType === 'mobile' ? 0 : s.md,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.primary,
    },
    nearbyBtnText: { color: '#fff', fontSize: fs.sm, fontWeight: '600' },

    filterLabel: {
      color: colors.textSecondary,
      fontSize: fs.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      paddingTop: s.sm,
    },
    chipsRow: { paddingTop: s.xs, paddingBottom: s.xs, gap: s.sm },
    chip: {
      paddingHorizontal: s.md,
      paddingVertical: s.xs,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.chipBg,
    },
    chipActive: { backgroundColor: colors.chipActiveBg },
    chipText: { color: colors.primary, fontSize: fs.sm, fontWeight: '600' },
    chipTextActive: { color: '#fff' },

    viewToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: s.sm,
      paddingBottom: s.xs,
    },
    resultCount: { color: colors.textSecondary, fontSize: fs.sm },
    viewToggle: { flexDirection: 'row', gap: s.xs },
    viewToggleBtn: {
      width: 38,
      height: 34,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.cardBg,
    },
    viewToggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },

    // Liste / grille
    listContent: {
      ...centered,
      paddingHorizontal: pad,
      paddingTop: s.sm,
      paddingBottom: Math.max(insets.bottom, 20),
      gap: s.sm,
    },
    columnWrapper: { gap: colGap },

    mapFill: {
      ...centered,
      flex: 1,
      paddingHorizontal: pad,
      paddingTop: s.sm,
      paddingBottom: Math.max(insets.bottom, 12),
      gap: s.sm,
    },
    locateCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.sm,
      paddingVertical: s.sm,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.cardBg,
    },
    locateCtaText: { color: colors.primary, fontSize: fs.base, fontWeight: '600' },

    card: {
      width: cardWidth,
      flexGrow: 0,
      backgroundColor: colors.cardBg,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: s.md,
      gap: s.xs,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { flex: 1, color: colors.text, fontSize: fs.title, fontWeight: '700', marginRight: s.sm },
    ratingWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    ratingText: { color: colors.text, fontSize: fs.sm, fontWeight: '700' },
    reviewCount: { color: colors.textMuted, fontSize: fs.xs },
    noRating: { color: colors.textMuted, fontSize: fs.xs, fontStyle: 'italic' },

    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    metaText: { color: colors.textSecondary, fontSize: fs.sm },
    metaDot: { color: colors.textMuted },
    address: { color: colors.textMuted, fontSize: fs.xs },

    distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    distanceText: { color: colors.primary, fontSize: fs.sm, fontWeight: '600' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: s.lg, gap: s.sm, paddingHorizontal: pad },
    emptyText: { color: colors.textSecondary, fontSize: fs.base, textAlign: 'center' },
  });
}