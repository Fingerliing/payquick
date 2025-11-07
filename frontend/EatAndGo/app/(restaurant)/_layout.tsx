import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useStripeDeepLink } from '@/app/hooks/useStripeDeepLink';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  View, 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// ============================================================================
// CUSTOM TAB BAR COMPONENT
// ============================================================================

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [currentPage, setCurrentPage] = useState(0);
  
  const TABS_PER_PAGE = 4;
  const totalPages = Math.ceil(state.routes.length / TABS_PER_PAGE);
  
  // Calculer les onglets à afficher pour la page courante
  const startIndex = currentPage * TABS_PER_PAGE;
  const endIndex = startIndex + TABS_PER_PAGE;
  const visibleRoutes = state.routes.slice(startIndex, endIndex);
  
  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <View 
      style={[
        styles.tabBar,
        {
          paddingBottom: Math.max(5, insets.bottom),
          paddingLeft: insets.left,
          paddingRight: insets.right,
          height: 60 + Math.max(0, insets.bottom),
        }
      ]}
    >
      {/* Bouton précédent */}
      {currentPage > 0 && (
        <TouchableOpacity
          style={styles.navButton}
          onPress={handlePrevPage}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#D4AF37" />
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

          const color = isFocused ? '#D4AF37' : '#6B7280';

          // Obtenir le label (en gérant le cas où c'est une fonction)
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
              {options.tabBarIcon && options.tabBarIcon({ 
                focused: isFocused, 
                color, 
                size: 24 
              })}
              <Text 
                style={[
                  styles.tabLabel, 
                  { color }
                ]}
                numberOfLines={1}
              >
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
          <Ionicons name="chevron-forward" size={24} color="#D4AF37" />
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
// MAIN LAYOUT COMPONENT
// ============================================================================

export default function TabLayout() {
  const { isAuthenticated, isLoading, isRestaurateur, hasValidatedProfile } = useAuth();
  console.log('🔐 Auth Status:', { isAuthenticated, isRestaurateur, hasValidatedProfile });
  
  useStripeDeepLink();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="restaurants"
        options={{
          title: 'Restaurants',
          tabBarLabel: 'Restaurants',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Commandes',
          tabBarLabel: 'Commandes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menus',
          tabBarLabel: 'Menus',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="daily-menu"
        options={{
          title: 'Menu du Jour',
          tabBarLabel: 'Menu Jour',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "today" : "today-outline"} 
              size={size} 
              color={color} 
            />
          ),
          href: (isRestaurateur && hasValidatedProfile) ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="statistics"
        options={{
          title: 'Statistiques',
          tabBarLabel: 'Stats',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons 
              name={focused ? "stats-chart" : "stats-chart-outline"} 
              size={size} 
              color={color} 
            />
          ),
          href: (isRestaurateur && hasValidatedProfile) ? undefined : null,
        }}
      />

      <Tabs.Screen
        name="qrcodes"
        options={{
          title: 'QR Codes',
          tabBarLabel: 'QR Codes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="comptabilite"
        options={{
          title: 'Comptabilité',
          tabBarIcon: ({ color }) => (
            <Ionicons name="calculator" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 5,
    alignItems: 'center',
    position: 'relative',
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
    backgroundColor: '#D1D5DB',
  },
  pageIndicatorDotActive: {
    backgroundColor: '#D4AF37',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});