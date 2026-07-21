import React, { useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useStripeDeepLink } from '@/app/hooks/useStripeDeepLink';
import {
  useAppTheme,
  makeShadows,
  type AppColors,
} from '@/utils/designSystem';

// ============================================================================
// CUSTOM TAB BAR — paginée 4 onglets/page, navy + or dans les 2 modes
// ============================================================================

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeTabBarStyles(colors, isDark), [colors, isDark]);

  const [currentPage, setCurrentPage] = useState(0);

  const TABS_PER_PAGE = 4;
  const totalPages = Math.ceil(state.routes.length / TABS_PER_PAGE);

  const startIndex = currentPage * TABS_PER_PAGE;
  const endIndex = startIndex + TABS_PER_PAGE;
  const visibleRoutes = state.routes.slice(startIndex, endIndex);

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  // Or D4AF37 stable : c'est l'accent identitaire de la TabBar restaurateur,
  // indépendamment du thème — souligne le caractère "premium" de l'espace pro.
  const ACCENT_GOLD = colors.secondary; // = '#D4AF37'
  const INACTIVE_GREY = colors.text.secondary;

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom: Math.max(5, insets.bottom),
          paddingLeft: insets.left,
          paddingRight: insets.right,
          height: 60 + Math.max(0, insets.bottom),
        },
      ]}
    >
      {/* Bouton précédent */}
      {currentPage > 0 && (
        <TouchableOpacity
          style={styles.navButton}
          onPress={handlePrevPage}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={ACCENT_GOLD} />
        </TouchableOpacity>
      )}

      {/* Onglets visibles */}
      <View style={styles.tabsContainer}>
        {visibleRoutes.map((route, index) => {
          const actualIndex = startIndex + index;
          const isFocused = state.index === actualIndex;
          const { options } = descriptors[route.key];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const color = isFocused ? ACCENT_GOLD : INACTIVE_GREY;

          let label: string;
          if (typeof options.tabBarLabel === 'string') {
            label = options.tabBarLabel;
          } else if (typeof options.title === 'string') {
            label = options.title;
          } else {
            label = route.name;
          }

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              style={styles.tab}
              activeOpacity={0.7}
            >
              {options.tabBarIcon &&
                options.tabBarIcon({
                  focused: isFocused,
                  color,
                  size: 24,
                })}
              <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bouton suivant */}
      {currentPage < totalPages - 1 && (
        <TouchableOpacity
          style={styles.navButton}
          onPress={handleNextPage}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={24} color={ACCENT_GOLD} />
        </TouchableOpacity>
      )}

      {/* Indicateur de page */}
      <View style={styles.pageIndicator}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.pageIndicatorDot,
              i === currentPage && styles.pageIndicatorDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ============================================================================
// MAIN LAYOUT
// ============================================================================

export default function TabLayout() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading, isRestaurateur, hasValidatedProfile } = useAuth();
  console.log('🔐 Auth Status:', { isAuthenticated, isRestaurateur, hasValidatedProfile });

  useStripeDeepLink();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('restaurantNav.home'),
          tabBarLabel: t('restaurantNav.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="restaurants"
        options={{
          title: t('restaurantNav.restaurants'),
          tabBarLabel: t('restaurantNav.restaurants'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="orders"
        options={{
          title: t('restaurantNav.orders'),
          tabBarLabel: t('restaurantNav.orders'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="menu"
        options={{
          title: t('restaurantNav.menus'),
          tabBarLabel: t('restaurantNav.menus'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily-menu"
        options={{
          title: t('restaurantNav.dailyMenu'),
          tabBarLabel: t('restaurantNav.dailyMenuShort'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'today' : 'today-outline'}
              size={size}
              color={color}
            />
          ),
          href: isRestaurateur && hasValidatedProfile ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="statistics"
        options={{
          title: t('restaurantNav.statistics'),
          tabBarLabel: t('restaurantNav.statisticsShort'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={size}
              color={color}
            />
          ),
          href: isRestaurateur && hasValidatedProfile ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="qrcodes"
        options={{
          title: t('restaurantNav.qrcodes'),
          tabBarLabel: t('restaurantNav.qrcodes'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="floor-plan"
        options={{
          title: t('restaurantNav.floorPlan'),
          tabBarLabel: t('restaurantNav.floorPlanShort'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'grid' : 'grid-outline'}
              size={size}
              color={color}
            />
          ),
          href: isRestaurateur && hasValidatedProfile ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="reservations"
        options={{
          title: t('restaurantNav.reservations'),
          tabBarLabel: t('restaurantNav.reservationsShort'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={color}
            />
          ),
          href: isRestaurateur && hasValidatedProfile ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: t('restaurantNav.profile'),
          tabBarLabel: t('restaurantNav.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="comptabilite"
        options={{
          title: t('restaurantNav.accounting'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="calculator" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================
const makeTabBarStyles = (colors: AppColors, isDark: boolean) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      // En dark, on glisse une nuance or très subtile sur la bordure
      // supérieure pour rappeler la dorure du logo (cohérent avec le LegalFooter)
      borderTopColor: isDark ? 'rgba(212, 175, 55, 0.15)' : colors.border.light,
      paddingTop: 5,
      alignItems: 'center',
      position: 'relative',
      ...shadows.lg,
    },
    tabsContainer: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
    },
    tabLabel: {
      fontSize: 11,
      marginTop: 4,
      fontWeight: '500',
    },
    navButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pageIndicator: {
      position: 'absolute',
      bottom: 2,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
    },
    pageIndicatorDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border.default,
    },
    pageIndicatorDotActive: {
      backgroundColor: colors.secondary, // or — stable identitaire
      width: 6,
      height: 6,
      borderRadius: 3,
    },
  });
};