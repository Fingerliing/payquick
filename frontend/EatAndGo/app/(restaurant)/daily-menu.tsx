import { useState } from 'react';
import { 
  View, 
  StyleSheet, 
  Modal, 
  Text, 
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { DailyMenuManager } from '@/components/menu/DailyMenuManager';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, subDays, startOfWeek, endOfWeek, isSameDay, isToday } from 'date-fns';
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
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';

export default function DailyMenuScreen() {
  const { currentRestaurant } = useRestaurant();
  const screenType = useScreenType();
  const responsive = useResponsive();
  const styles = createStyles(screenType, responsive);
  
  // États
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Vérification du restaurant sélectionné
  if (!currentRestaurant) {
    router.replace('/(restaurant)/select' as any);
    return null;
  }

  const handleNavigateToCreate = () => {
    router.push({
      pathname: '/(restaurant)/daily-menu/create' as any,
      params: { 
        restaurantId: currentRestaurant.id,
        date: format(selectedDate, 'yyyy-MM-dd')
      }
    });
  };

  const handleNavigateToEdit = (menuId: string) => {
    router.push({
      pathname: '/(restaurant)/daily-menu/edit/[id]' as any,
      params: { id: menuId, restaurantId: currentRestaurant.id }
    });
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  };

  const navigateToToday = () => {
    setSelectedDate(new Date());
    setCurrentMonth(new Date());
  };

  const navigateToPreviousDay = () => {
    setSelectedDate(prev => subDays(prev, 1));
  };

  const navigateToNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1));
  };

  // Génération des jours du mois pour le calendrier
  const generateCalendarDays = () => {
    const start = startOfWeek(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1), { weekStartsOn: 1 });
    const end = endOfWeek(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0), { weekStartsOn: 1 });
    
    const days = [];
    let currentDate = start;
    
    while (currentDate <= end) {
      days.push(new Date(currentDate));
      currentDate = addDays(currentDate, 1);
    }
    
    return days;
  };

  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(newMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(newMonth.getMonth() + 1);
      }
      return newMonth;
    });
  };

  // Composant de navigation rapide par date
  const DateNavigator = () => (
    <View style={styles.dateNavigator}>
      <TouchableOpacity 
        style={styles.navButton} 
        onPress={navigateToPreviousDay}
      >
        <Ionicons name="chevron-back" size={20} color={COLORS.text.golden} />
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.dateDisplay}
        onPress={() => setShowCalendar(true)}
      >
        <LinearGradient
          colors={COLORS.gradients.subtleGold}
          style={styles.dateGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="calendar" size={16} color={COLORS.text.golden} />
          <Text style={styles.dateText}>
            {isToday(selectedDate) 
              ? "Aujourd'hui" 
              : format(selectedDate, 'EEEE dd MMMM', { locale: fr })}
          </Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.text.golden} />
        </LinearGradient>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.navButton} 
        onPress={navigateToNextDay}
      >
        <Ionicons name="chevron-forward" size={20} color={COLORS.text.golden} />
      </TouchableOpacity>
      
      {!isToday(selectedDate) && (
        <TouchableOpacity 
          style={styles.todayButton}
          onPress={navigateToToday}
        >
          <Text style={styles.todayButtonText}>Aujourd'hui</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Modal du calendrier
  const CalendarModal = () => {
    const calendarDays = generateCalendarDays();
    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    
    return (
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCalendar(false)}
        >
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity 
                onPress={() => changeMonth('prev')}
                style={styles.monthNavButton}
              >
                <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
              </TouchableOpacity>
              
              <Text style={styles.monthTitle}>
                {format(currentMonth, 'MMMM yyyy', { locale: fr })}
              </Text>
              
              <TouchableOpacity 
                onPress={() => changeMonth('next')}
                style={styles.monthNavButton}
              >
                <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.weekDaysRow}>
              {weekDays.map(day => (
                <Text key={day} style={styles.weekDayText}>{day}</Text>
              ))}
            </View>
            
            <View style={styles.daysGrid}>
              {calendarDays.map((day, index) => {
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const isSelected = isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);
                
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dayButton,
                      !isCurrentMonth && styles.dayButtonOtherMonth,
                      isSelected && styles.dayButtonSelected,
                      isTodayDate && styles.dayButtonToday,
                    ]}
                    onPress={() => handleDateSelect(day)}
                  >
                    <Text style={[
                      styles.dayText,
                      !isCurrentMonth && styles.dayTextOtherMonth,
                      isSelected && styles.dayTextSelected,
                      isTodayDate && styles.dayTextToday,
                    ]}>
                      {day.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <View style={styles.calendarFooter}>
              <TouchableOpacity
                style={styles.todayFooterButton}
                onPress={() => {
                  handleDateSelect(new Date());
                  setCurrentMonth(new Date());
                }}
              >
                <LinearGradient
                  colors={COLORS.gradients.goldenHorizontal}
                  style={styles.todayGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="today" size={20} color={COLORS.surface} />
                  <Text style={styles.todayFooterText}>Aller à aujourd'hui</Text>
                </LinearGradient>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowCalendar(false)}
              >
                <Text style={styles.closeButtonText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Menus du Jour"
        showBackButton
        rightIcon="add-circle"
        onRightPress={handleNavigateToCreate}
      />
      
      <DateNavigator />
      
      <DailyMenuManager
        restaurantId={String(currentRestaurant.id)}
        selectedDate={selectedDate}
        onNavigateToCreate={handleNavigateToCreate}
        onNavigateToEdit={handleNavigateToEdit}
      />
      
      <CalendarModal />
    </View>
  );
}

const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', responsive: any) => {
  const responsiveStyles = createResponsiveStyles(screenType);
  
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    
    // Date Navigator
    dateNavigator: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
      ...SHADOWS.sm,
    },
    navButton: {
      padding: getResponsiveValue(SPACING.sm, screenType),
    },
    dateDisplay: {
      flex: 1,
      marginHorizontal: getResponsiveValue(SPACING.sm, screenType),
    },
    dateGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
    },
    dateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.golden,
      marginHorizontal: getResponsiveValue(SPACING.xs, screenType),
      textTransform: 'capitalize',
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
      width: responsive.isMobile ? '100%' : Math.min(400, responsive.width * 0.9),
      maxWidth: 400,
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
    monthTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      textTransform: 'capitalize',
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
};