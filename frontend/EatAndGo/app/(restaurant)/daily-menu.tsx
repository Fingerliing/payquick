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
import { router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { DailyMenuManager } from '@/components/menu/DailyMenuManager';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays, startOfWeek, endOfWeek, isSameDay, isToday, startOfMonth, endOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  ANIMATIONS,
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';
import { dailyMenuService, DailyMenu } from '@/services/dailyMenuService';

// Types pour le cache et les indicateurs
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

// Configuration du cache
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const PRELOAD_DAYS = 3; // Nombre de jours à précharger avant et après

// Composant interne qui contient toute la logique
function DailyMenuScreenContent({ restaurant }: { restaurant: NonNullable<ReturnType<typeof useRestaurant>['currentRestaurant']> }) {
  const screenType = useScreenType();
  const responsive = useResponsive();
  const styles = createStyles(screenType, responsive);
  
  // États principaux
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Cache et optimisations
  const menuCache = useRef<Map<string, MenuCacheEntry>>(new Map());
  const [monthlyIndicators, setMonthlyIndicators] = useState<MonthlyMenuIndicators>({});
  const isLoadingIndicatorsRef = useRef(false);
  const preloadQueue = useRef<Set<string>>(new Set());
  const fadeAnim = useRef(new Animated.Value(1)).current;
  
  // ==================== GESTION DU CACHE ====================
  
  /**
   * Récupère un menu depuis le cache ou l'API
   */
  const getMenuFromCacheOrFetch = useCallback(async (date: Date): Promise<DailyMenu | null> => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const cached = menuCache.current.get(dateKey);
    
    // Vérifier si le cache est valide
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`📦 Menu trouvé dans le cache pour ${dateKey}`);
      return cached.menu;
    }
    
    // Si déjà en cours de chargement, attendre
    if (cached?.isLoading) {
      console.log(`⏳ Chargement déjà en cours pour ${dateKey}`);
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
    
    // Marquer comme en cours de chargement
    menuCache.current.set(dateKey, {
      menu: null,
      timestamp: Date.now(),
      isLoading: true
    });
    
    try {
      console.log(`🌐 Chargement du menu depuis l'API pour ${dateKey}`);
      const menu = await dailyMenuService.getMenuByDate(
        Number(restaurant.id),
        dateKey
      );
      
      // Mettre à jour le cache
      menuCache.current.set(dateKey, {
        menu,
        timestamp: Date.now(),
        isLoading: false
      });
      
      return menu;
    } catch (error) {
      // Même en cas d'erreur, on cache le résultat null
      menuCache.current.set(dateKey, {
        menu: null,
        timestamp: Date.now(),
        isLoading: false
      });
      return null;
    }
  }, [restaurant.id]);

  /**
   * Invalide le cache pour une date spécifique
   */
  const invalidateCache = useCallback((date?: Date) => {
    if (date) {
      const dateKey = format(date, 'yyyy-MM-dd');
      menuCache.current.delete(dateKey);
      console.log(`🗑️ Cache invalidé pour ${dateKey}`);
    } else {
      menuCache.current.clear();
      console.log('🗑️ Tout le cache a été vidé');
    }
  }, []);

  // ==================== PRÉCHARGEMENT INTELLIGENT ====================
  
  /**
   * Précharge les menus des jours adjacents
   */
  const preloadAdjacentMenus = useCallback(async (centerDate: Date) => {
    const datesToPreload: Date[] = [];
    
    // Générer les dates à précharger (avant et après)
    for (let i = 1; i <= PRELOAD_DAYS; i++) {
      datesToPreload.push(subDays(centerDate, i));
      datesToPreload.push(addDays(centerDate, i));
    }
    
    // Précharger en arrière-plan
    datesToPreload.forEach(async (date) => {
      const dateKey = format(date, 'yyyy-MM-dd');
      
      // Éviter les doublons
      if (preloadQueue.current.has(dateKey)) return;
      preloadQueue.current.add(dateKey);
      
      // Vérifier si pas déjà en cache
      const cached = menuCache.current.get(dateKey);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        preloadQueue.current.delete(dateKey);
        return;
      }
      
      try {
        console.log(`🔄 Préchargement du menu pour ${dateKey}`);
        await getMenuFromCacheOrFetch(date);
      } catch (error) {
        console.log(`❌ Erreur préchargement pour ${dateKey}:`, error);
      } finally {
        preloadQueue.current.delete(dateKey);
      }
    });
  }, [getMenuFromCacheOrFetch]);

  // ==================== INDICATEURS VISUELS ====================
  
  /**
   * Charge les indicateurs de menus pour le mois en cours
   */
  const loadMonthlyIndicators = useCallback(async (month: Date) => {
    if (isLoadingIndicatorsRef.current) return;
    
    isLoadingIndicatorsRef.current = true;
    try {
      console.log(`📅 Chargement des indicateurs pour ${format(month, 'MMMM yyyy', { locale: fr })}`);
      
      const response = await dailyMenuService.getMonthlyCalendar(
        Number(restaurant.id),
        month.getFullYear(),
        month.getMonth() + 1 // L'API attend un mois de 1 à 12
      );
      
      // Transformer la réponse en map d'indicateurs
      const indicators: MonthlyMenuIndicators = {};
      
      response.menu_summaries.forEach(summary => {
        indicators[summary.date] = {
          hasMenu: true,
          menuId: summary.menu_id,
          title: summary.title,
          itemsCount: summary.items_count,
          isActive: summary.is_active
        };
      });
      
      setMonthlyIndicators(prev => ({
        ...prev,
        ...indicators
      }));
      
      console.log(`✅ ${response.menu_summaries.length} menus trouvés pour le mois`);
    } catch (error) {
      console.error('Erreur lors du chargement des indicateurs:', error);
    } finally {
      isLoadingIndicatorsRef.current = false;
    }
  }, [restaurant.id]);

  // ==================== EFFETS ====================
  
  // Charger les indicateurs quand le mois change
  useEffect(() => {
    loadMonthlyIndicators(currentMonth);
  }, [currentMonth, loadMonthlyIndicators]);
  
  // Précharger les menus adjacents quand la date change
  useEffect(() => {
    preloadAdjacentMenus(selectedDate);
  }, [selectedDate, preloadAdjacentMenus]);
  
  // Animation de transition lors du changement de date
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

  // ==================== NAVIGATION DE DATE ====================

  const handlePreviousDay = useCallback(() => {
    setSelectedDate(prev => subDays(prev, 1));
  }, []);

  const handleNextDay = useCallback(() => {
    setSelectedDate(prev => addDays(prev, 1));
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
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() - 1);
      return newMonth;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(prev.getMonth() + 1);
      return newMonth;
    });
  }, []);

  // Générer les jours du calendrier
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { locale: fr });
    const end = endOfWeek(endOfMonth(currentMonth), { locale: fr });
    const days: Date[] = [];
    
    let current = start;
    while (current <= end) {
      days.push(current);
      current = addDays(current, 1);
    }
    
    return days;
  }, [currentMonth]);

  // Vérifier si une date a un menu
  const hasMenuOnDate = useCallback((date: Date): boolean => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return monthlyIndicators[dateKey]?.hasMenu || false;
  }, [monthlyIndicators]);

  // Obtenir les infos du menu pour une date
  const getMenuInfo = useCallback((date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return monthlyIndicators[dateKey];
  }, [monthlyIndicators]);

  // ==================== RENDER ====================

  return (
    <View style={styles.container}>
      <Header 
        title="Menu du Jour"
        subtitle={restaurant.name}
      />

      {/* Sélecteur de date */}
      <View style={styles.dateSelector}>
        <TouchableOpacity 
          onPress={handlePreviousDay}
          style={styles.dateArrow}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateDisplay}
          onPress={() => setShowCalendar(true)}
        >
          <View style={styles.dateDisplayContent}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.text.golden} />
            <Text style={styles.dateText}>
              {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
            </Text>
            {hasMenuOnDate(selectedDate) && (
              <View style={styles.menuIndicatorBadge}>
                <Ionicons name="checkmark" size={12} color={COLORS.surface} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={handleNextDay}
          style={styles.dateArrow}
        >
          <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Bouton aujourd'hui */}
      {!isToday(selectedDate) && (
        <View style={styles.todayButtonContainer}>
          <TouchableOpacity 
            style={styles.todayButton}
            onPress={handleToday}
          >
            <Text style={styles.todayButtonText}>Aujourd'hui</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Composant principal - ✅ CORRECTION ICI */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <DailyMenuManager
          restaurantId={restaurant.id}
          selectedDate={selectedDate}
          onNavigateToCreate={() => router.push('/menu/daily-menu/create')}
          onNavigateToEdit={(menuId) => router.push(`/menu/daily-menu/edit/${menuId}`)}
          onMenuUpdated={() => invalidateCache(selectedDate)}
        />
      </Animated.View>

      {/* Modal Calendrier */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowCalendar(false)}
        >
          <Pressable style={styles.calendarContainer} onPress={(e) => e.stopPropagation()}>
            {/* Header du calendrier */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={handlePreviousMonth} style={styles.monthNavButton}>
                <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
              </TouchableOpacity>
              
              <View style={styles.monthTitleContainer}>
                <Text style={styles.monthTitle}>
                  {format(currentMonth, 'MMMM yyyy', { locale: fr })}
                </Text>
                {isLoadingIndicatorsRef.current && (
                  <ActivityIndicator 
                    size="small" 
                    color={COLORS.primary}
                    style={styles.monthLoader}
                  />
                )}
              </View>
              
              <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavButton}>
                <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {/* Jours de la semaine */}
            <View style={styles.weekDaysRow}>
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
                <Text key={index} style={styles.weekDayText}>{day}</Text>
              ))}
            </View>

            {/* Grille des jours */}
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

            {/* Légende */}
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.variants.secondary[500] }]} />
                <Text style={styles.legendText}>Avec menu</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS.text.light }]} />
                <Text style={styles.legendText}>Menu inactif</Text>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.calendarFooter}>
              <TouchableOpacity 
                style={styles.todayFooterButton}
                onPress={handleToday}
              >
                <LinearGradient
                  colors={[COLORS.secondary, COLORS.variants.secondary[700]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.todayGradient}
                >
                  <Ionicons name="today" size={18} color={COLORS.surface} />
                  <Text style={styles.todayFooterText}>Aujourd'hui</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowCalendar(false)}
              >
                <Text style={styles.closeButtonText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// Composant wrapper avec gestion automatique de la sélection du restaurant
export default function DailyMenuScreen() {
  const { currentRestaurant } = useRestaurant();
  
  return (
    <RestaurantAutoSelector
      noRestaurantMessage="Aucun restaurant pour gérer les menus"
      createButtonText="Créer mon restaurant"
      onRestaurantSelected={(restaurantId) => {
        console.log('Restaurant sélectionné pour les menus du jour:', restaurantId);
      }}
    >
      {currentRestaurant && <DailyMenuScreenContent restaurant={currentRestaurant} />}
    </RestaurantAutoSelector>
  );
}

// Styles (identiques à votre version originale)
function createStyles(screenType: any, responsive: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1,
    },
    todayButtonContainer: {
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    
    // Date Selector
    dateSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: COLORS.goldenSurface,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 2,
      borderBottomColor: COLORS.border.golden,
    },
    dateArrow: {
      padding: getResponsiveValue(SPACING.sm, screenType),
    },
    dateDisplay: {
      flex: 1,
      marginHorizontal: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      ...SHADOWS.sm,
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
      color: COLORS.text.golden,
      marginHorizontal: getResponsiveValue(SPACING.xs, screenType),
      textTransform: 'capitalize',
    },
    menuIndicatorBadge: {
      width: 20,
      height: 20,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: COLORS.variants.secondary[500],
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
    },
    todayButton: {
      backgroundColor: COLORS.variants.secondary[100],
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.variants.secondary[300],
    },
    todayButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.variants.secondary[700],
    },
    
    // Calendar Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
    },
    calendarContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      width: responsive.isMobile ? '100%' : Math.min(450, responsive.width * 0.9),
      maxWidth: 450,
      ...SHADOWS.xl,
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
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
      color: COLORS.primary,
      textTransform: 'capitalize',
    },
    monthLoader: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
    weekDaysRow: {
      flexDirection: 'row',
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.goldenSurface,
    },
    weekDayText: {
      flex: 1,
      textAlign: 'center',
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.golden,
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
      backgroundColor: COLORS.variants.secondary[500],
      borderRadius: BORDER_RADIUS.full,
    },
    dayButtonToday: {
      borderWidth: 2,
      borderColor: COLORS.variants.secondary[400],
      borderRadius: BORDER_RADIUS.full,
    },
    dayText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.primary,
    },
    dayTextOtherMonth: {
      color: COLORS.text.light,
    },
    dayTextSelected: {
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
    dayTextToday: {
      color: COLORS.variants.secondary[600],
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
      backgroundColor: COLORS.variants.secondary[500],
    },
    dayMenuIndicatorInactive: {
      backgroundColor: COLORS.text.light,
    },
    dayMenuIndicatorSelected: {
      backgroundColor: COLORS.surface,
    },
    
    // Légende du calendrier
    calendarLegend: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
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
      color: COLORS.text.secondary,
    },
    
    // Footer du calendrier
    calendarFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
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
      color: COLORS.surface,
    },
    closeButton: {
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.default,
    },
    closeButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.primary,
    },
  });
}