import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Pressable,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isToday,
  startOfMonth,
  endOfMonth,
  type Locale,
} from 'date-fns';
import {
  fr,
  enUS,
  es,
  eu,
  de,
  it,
  pt,
  nl,
  zhCN,
  ja,
  ar,
} from 'date-fns/locale';

import { Header } from '@/components/ui/Header';
import { DailyMenuManager } from '@/components/menu/DailyMenuManager';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  ANIMATIONS,
  type AppColors,
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';
import { dailyMenuService, DailyMenu } from '@/services/dailyMenuService';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

// ============================================================================
// date-fns locales mapping — pour format() dynamique par langue
// ============================================================================
const DATE_FNS_LOCALES: Record<string, Locale> = {
  fr,
  en: enUS,
  es,
  eu,
  de,
  it,
  pt,
  nl,
  zh: zhCN,
  ja,
  ar,
};

const getDateFnsLocale = (lang: string): Locale =>
  DATE_FNS_LOCALES[lang] || DATE_FNS_LOCALES[lang.split('-')[0]] || fr;

// ============================================================================
// Types pour le cache et les indicateurs
// ============================================================================
interface MenuCacheEntry {
  menu: DailyMenu | null;
  timestamp: number;
  isLoading?: boolean;
}

interface MonthlyMenuIndicators {
  [date: string]: {
    hasMenu: boolean;
    menuId?: string;
    title?: string;
    itemsCount?: number;
    isActive?: boolean;
  };
}

const CACHE_DURATION = 5 * 60 * 1000;
const PRELOAD_DAYS = 3;

// ============================================================================
// COMPOSANT INTERNE — toute la logique
// ============================================================================
function DailyMenuScreenContent({
  restaurant,
}: {
  restaurant: NonNullable<ReturnType<typeof useRestaurant>['currentRestaurant']>;
}) {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const responsive = useResponsive();

  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType, responsive),
    [colors, isDark, screenType, responsive],
  );

  // Locale date-fns dynamique
  const dateLocale = useMemo(() => getDateFnsLocale(i18n.language), [i18n.language]);

  // États principaux
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshKey, setRefreshKey] = useState(0);

  // Cache et optimisations
  const menuCache = useRef<Map<string, MenuCacheEntry>>(new Map());
  const [monthlyIndicators, setMonthlyIndicators] = useState<MonthlyMenuIndicators>({});
  const isLoadingIndicatorsRef = useRef(false);
  const preloadQueue = useRef<Set<string>>(new Set());
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ==================== GESTION DU CACHE ====================
  const getMenuFromCacheOrFetch = useCallback(
    async (date: Date): Promise<DailyMenu | null> => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const cached = menuCache.current.get(dateKey);

      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.menu;
      }

      if (cached?.isLoading) {
        return new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            const updatedCache = menuCache.current.get(dateKey);
            if (!updatedCache?.isLoading) {
              clearInterval(checkInterval);
              resolve(updatedCache?.menu || null);
            }
          }, 100);
        });
      }

      menuCache.current.set(dateKey, {
        menu: null,
        timestamp: Date.now(),
        isLoading: true,
      });

      try {
        const menu = await dailyMenuService.getMenuByDate(
          Number(restaurant.id),
          dateKey,
        );
        menuCache.current.set(dateKey, {
          menu,
          timestamp: Date.now(),
          isLoading: false,
        });
        return menu;
      } catch {
        menuCache.current.set(dateKey, {
          menu: null,
          timestamp: Date.now(),
          isLoading: false,
        });
        return null;
      }
    },
    [restaurant.id],
  );

  const invalidateCache = useCallback((date?: Date) => {
    if (date) {
      const dateKey = format(date, 'yyyy-MM-dd');
      menuCache.current.delete(dateKey);
    } else {
      menuCache.current.clear();
    }
  }, []);

  // ==================== PRÉCHARGEMENT INTELLIGENT ====================
  const preloadAdjacentMenus = useCallback(
    async (centerDate: Date) => {
      const datesToPreload: Date[] = [];
      for (let i = 1; i <= PRELOAD_DAYS; i++) {
        datesToPreload.push(subDays(centerDate, i));
        datesToPreload.push(addDays(centerDate, i));
      }

      datesToPreload.forEach(async (date) => {
        const dateKey = format(date, 'yyyy-MM-dd');
        if (preloadQueue.current.has(dateKey)) return;
        preloadQueue.current.add(dateKey);

        const cached = menuCache.current.get(dateKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
          preloadQueue.current.delete(dateKey);
          return;
        }

        try {
          await getMenuFromCacheOrFetch(date);
        } catch {
          // Préchargement best-effort
        } finally {
          preloadQueue.current.delete(dateKey);
        }
      });
    },
    [getMenuFromCacheOrFetch],
  );

  // ==================== INDICATEURS VISUELS ====================
  const loadMonthlyIndicators = useCallback(
    async (month: Date) => {
      if (isLoadingIndicatorsRef.current) return;

      isLoadingIndicatorsRef.current = true;
      try {
        const response = await dailyMenuService.getMonthlyCalendar(
          Number(restaurant.id),
          month.getFullYear(),
          month.getMonth() + 1,
        );

        const indicators: MonthlyMenuIndicators = {};
        response.menu_summaries.forEach((summary) => {
          indicators[summary.date] = {
            hasMenu: true,
            menuId: summary.menu_id,
            title: summary.title,
            itemsCount: summary.items_count,
            isActive: summary.is_active,
          };
        });

        setMonthlyIndicators((prev) => ({ ...prev, ...indicators }));
      } catch {
        // Indicateurs non critiques
      } finally {
        isLoadingIndicatorsRef.current = false;
      }
    },
    [restaurant.id],
  );

  // ==================== EFFETS ====================
  useEffect(() => {
    loadMonthlyIndicators(currentMonth);
  }, [currentMonth, loadMonthlyIndicators]);

  useEffect(() => {
    preloadAdjacentMenus(selectedDate);
  }, [selectedDate, preloadAdjacentMenus]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.3,
        duration: ANIMATIONS.duration.fast,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: ANIMATIONS.duration.fast,
        useNativeDriver: true,
      }),
    ]).start();
  }, [selectedDate]);

  const hasFocusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      invalidateCache(selectedDate);
      loadMonthlyIndicators(currentMonth);
      setRefreshKey((k) => k + 1);
    }, [selectedDate, currentMonth, invalidateCache, loadMonthlyIndicators]),
  );

  // ==================== NAVIGATION DE DATE ====================
  const handlePreviousDay = useCallback(() => {
    setSelectedDate((prev) => subDays(prev, 1));
  }, []);

  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, 1));
  }, []);

  const handleToday = useCallback(() => {
    setSelectedDate(new Date());
    setShowCalendar(false);
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  }, []);

  // ==================== CALENDRIER ====================
  const handlePreviousMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() - 1);
      return newMonth;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() + 1);
      return newMonth;
    });
  }, []);

  // Génère les jours du calendrier dans la locale courante (semaine
  // commençant lundi en FR, dimanche en EN, etc. — date-fns gère ça)
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { locale: dateLocale });
    const end = endOfWeek(endOfMonth(currentMonth), { locale: dateLocale });
    const days: Date[] = [];
    let current = start;
    while (current <= end) {
      days.push(current);
      current = addDays(current, 1);
    }
    return days;
  }, [currentMonth, dateLocale]);

  // Génère les initiales des jours de la semaine via Intl.DateTimeFormat
  // (respecte la locale et le firstDayOfWeek défini par date-fns)
  const weekdayLabels = useMemo(() => {
    try {
      const formatter = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
      // start of week pour la locale courante
      const weekStart = startOfWeek(new Date(2024, 0, 1), { locale: dateLocale });
      return Array.from({ length: 7 }, (_, i) => formatter.format(addDays(weekStart, i)));
    } catch {
      return ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    }
  }, [i18n.language, dateLocale]);

  const hasMenuOnDate = useCallback(
    (date: Date): boolean => {
      const dateKey = format(date, 'yyyy-MM-dd');
      return monthlyIndicators[dateKey]?.hasMenu || false;
    },
    [monthlyIndicators],
  );

  const getMenuInfo = useCallback(
    (date: Date) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      return monthlyIndicators[dateKey];
    },
    [monthlyIndicators],
  );

  // ==================== RENDER ====================
  return (
    <View style={styles.container}>
      <Header
        title={t('restaurantNav.dailyMenu')}
        subtitle={restaurant.name}
        rightIcon="swap-vertical"
        onRightPress={() =>
          router.push({
            pathname: '/menu/categories/reorder',
            params: { restaurantId: String(restaurant.id) },
          } as any)
        }
        showLanguageSwitcher
        showThemeSwitcher
      />

      {/* Sélecteur de date */}
      <View style={styles.dateSelector}>
        <TouchableOpacity onPress={handlePreviousDay} style={styles.dateArrow}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateDisplay}
          onPress={() => setShowCalendar(true)}
        >
          <View style={styles.dateDisplayContent}>
            <Ionicons name="calendar-outline" size={20} color={colors.text.golden} />
            <Text style={styles.dateText}>
              {format(selectedDate, 'EEEE d MMMM yyyy', { locale: dateLocale })}
            </Text>
            {hasMenuOnDate(selectedDate) && (
              <View style={styles.menuIndicatorBadge}>
                <Ionicons name="checkmark" size={12} color={colors.text.inverse} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleNextDay} style={styles.dateArrow}>
          <Ionicons name="chevron-forward" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Bouton aujourd'hui */}
      {!isToday(selectedDate) && (
        <View style={styles.todayButtonContainer}>
          <TouchableOpacity style={styles.todayButton} onPress={handleToday}>
            <Text style={styles.todayButtonText}>
              {t('restaurantDailyMenu.today')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Composant principal */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <DailyMenuManager
          restaurantId={restaurant.id}
          selectedDate={selectedDate}
          refreshKey={refreshKey}
          onNavigateToCreate={(selectedDate) =>
            router.push({
              pathname: '/menu/daily-menu/create',
              params: {
                restaurantId: restaurant.id,
                selectedDate: selectedDate.toISOString(),
              },
            })
          }
          onNavigateToEdit={(menuId) =>
            router.push(`/menu/daily-menu/edit/${menuId}`)
          }
          onMenuUpdated={() => {
            invalidateCache(selectedDate);
            loadMonthlyIndicators(currentMonth);
            setRefreshKey((k) => k + 1);
          }}
        />
      </Animated.View>

      {/* Modal Calendrier */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
        statusBarTranslucent
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowCalendar(false)}
        >
          <Pressable
            style={styles.calendarContainer}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={handlePreviousMonth} style={styles.monthNavButton}>
                <Ionicons name="chevron-back" size={24} color={colors.primary} />
              </TouchableOpacity>

              <View style={styles.monthTitleContainer}>
                <Text style={styles.monthTitle}>
                  {format(currentMonth, 'MMMM yyyy', { locale: dateLocale })}
                </Text>
                {isLoadingIndicatorsRef.current && (
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                    style={styles.monthLoader}
                  />
                )}
              </View>

              <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavButton}>
                <Ionicons name="chevron-forward" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekDaysRow}>
              {weekdayLabels.map((day, index) => (
                <Text key={index} style={styles.weekDayText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {calendarDays.map((day, index) => {
                const isSelected = isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const menuInfo = getMenuInfo(day);
                const hasMenu = menuInfo?.hasMenu;

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dayButton,
                      !isCurrentMonth && styles.dayButtonOtherMonth,
                      isSelected && styles.dayButtonSelected,
                      isTodayDate && !isSelected && styles.dayButtonToday,
                    ]}
                    onPress={() => handleDateSelect(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !isCurrentMonth && styles.dayTextOtherMonth,
                        isSelected && styles.dayTextSelected,
                        isTodayDate && !isSelected && styles.dayTextToday,
                      ]}
                    >
                      {day.getDate()}
                    </Text>

                    {hasMenu && (
                      <View style={styles.dayIndicatorContainer}>
                        <View
                          style={[
                            styles.dayMenuIndicator,
                            !menuInfo.isActive && styles.dayMenuIndicatorInactive,
                            isSelected && styles.dayMenuIndicatorSelected,
                          ]}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: colors.variants.secondary[500] },
                  ]}
                />
                <Text style={styles.legendText}>
                  {t('restaurantDailyMenu.legend.withMenu')}
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: colors.text.light }]}
                />
                <Text style={styles.legendText}>
                  {t('restaurantDailyMenu.legend.inactiveMenu')}
                </Text>
              </View>
            </View>

            <View style={styles.calendarFooter}>
              <TouchableOpacity style={styles.todayFooterButton} onPress={handleToday}>
                <LinearGradient
                  colors={[colors.secondary, colors.variants.secondary[700]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.todayGradient}
                >
                  <Ionicons name="today" size={18} color={colors.text.inverse} />
                  <Text style={styles.todayFooterText}>
                    {t('restaurantDailyMenu.today')}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowCalendar(false)}
              >
                <Text style={styles.closeButtonText}>
                  {t('restaurantDailyMenu.close')}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ============================================================================
// WRAPPER avec gestion automatique de la sélection du restaurant
// ============================================================================
export default function DailyMenuScreen() {
  const { t } = useTranslation();
  const { currentRestaurant } = useRestaurant();

  return (
    <RestaurantAutoSelector
      noRestaurantMessage={t('restaurantDailyMenu.noRestaurantMessage')}
      createButtonText={t('restaurantDailyMenu.createRestaurant')}
      onRestaurantSelected={(_restaurantId) => {
        /* noop */
      }}
    >
      {currentRestaurant && <DailyMenuScreenContent restaurant={currentRestaurant} />}
    </RestaurantAutoSelector>
  );
}

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ScreenType,
  responsive: any,
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: { flex: 1 },
    todayButtonContainer: {
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },

    // Date Selector — bandeau or qui ressort dans les 2 modes
    dateSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.goldenSurface,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 2,
      borderBottomColor: colors.border.golden,
    },
    dateArrow: {
      padding: getResponsiveValue(SPACING.sm, screenType),
    },
    dateDisplay: {
      flex: 1,
      marginHorizontal: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.golden,
      ...shadows.sm,
    },
    dateDisplayContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
    dateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.golden,
      marginHorizontal: getResponsiveValue(SPACING.xs, screenType),
      textTransform: 'capitalize',
    },
    menuIndicatorBadge: {
      width: 20,
      height: 20,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: colors.variants.secondary[500],
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
    },

    // Bouton "Aujourd'hui" pill or pâle
    todayButton: {
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.18)'
        : colors.variants.secondary[100],
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(212, 175, 55, 0.4)'
        : colors.variants.secondary[300],
    },
    todayButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.variants.secondary[700],
    },

    // Modal Calendrier
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
    },
    calendarContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      width: responsive.isMobile ? '100%' : Math.min(450, responsive.width * 0.9),
      maxWidth: 450,
      // En dark, hairline or 12% comme les autres modales
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.xl,
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    monthNavButton: {
      padding: getResponsiveValue(SPACING.sm, screenType),
    },
    monthTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    monthTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      // En dark, titre du mois en or chaud — cohérent avec la migration
      color: isDark ? colors.text.golden : colors.primary,
      textTransform: 'capitalize',
    },
    monthLoader: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },

    // Bandeau des jours de la semaine — fond or léger
    weekDaysRow: {
      flexDirection: 'row',
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: colors.goldenSurface,
    },
    weekDayText: {
      flex: 1,
      textAlign: 'center',
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.golden,
    },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: getResponsiveValue(SPACING.sm, screenType),
    },
    dayButton: {
      width: '14.28%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: getResponsiveValue(SPACING.xs, screenType),
      position: 'relative',
    },
    dayButtonOtherMonth: {
      opacity: 0.3,
    },
    dayButtonSelected: {
      backgroundColor: colors.variants.secondary[500],
      borderRadius: BORDER_RADIUS.full,
    },
    dayButtonToday: {
      borderWidth: 2,
      borderColor: colors.variants.secondary[400],
      borderRadius: BORDER_RADIUS.full,
    },
    dayText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.primary,
    },
    dayTextOtherMonth: {
      color: colors.text.light,
    },
    dayTextSelected: {
      color: colors.text.inverse,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
    dayTextToday: {
      color: colors.variants.secondary[600],
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },

    // Indicateurs de menu dans le calendrier
    dayIndicatorContainer: {
      position: 'absolute',
      bottom: 2,
      alignItems: 'center',
    },
    dayMenuIndicator: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.variants.secondary[500],
    },
    dayMenuIndicatorInactive: {
      backgroundColor: colors.text.light,
    },
    dayMenuIndicatorSelected: {
      backgroundColor: colors.text.inverse,
    },

    // Légende du calendrier
    calendarLegend: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: getResponsiveValue(SPACING.xs, screenType),
    },
    legendText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
    },

    // Footer du calendrier
    calendarFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
    todayFooterButton: {
      flex: 1,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    todayGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
    },
    todayFooterText: {
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.inverse,
    },
    closeButton: {
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    closeButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.primary,
    },
  });
};