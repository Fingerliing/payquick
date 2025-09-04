import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useScreenType, getResponsiveValue, COLORS, COMPONENT_CONSTANTS } from '@/utils/designSystem';

export default function ClientLayout() {
  const { user, isClient } = useAuth();
  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  // Rediriger vers l'interface restaurant si pas client
  if (user && !isClient) {
    return <Redirect href="/(restaurant)" />;
  }

  // Configuration responsive pour les tabs
  const tabBarConfig = {
    activeTintColor: COLORS.primary,
    inactiveTintColor: COLORS.text.secondary,
    style: {
      height: getResponsiveValue(
        COMPONENT_CONSTANTS.tabBarHeight,
        screenType
      ) + insets.bottom, // ✅ Ajouter la safe area du bas
      paddingBottom: Math.max(screenType === 'mobile' ? 4 : 6, insets.bottom), // ✅ Safe area bottom
      paddingTop: screenType === 'mobile' ? 4 : 6,
      paddingLeft: insets.left, // ✅ Safe area gauche
      paddingRight: insets.right, // ✅ Safe area droite
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
      elevation: screenType === 'mobile' ? 8 : 4,
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    labelStyle: {
      fontSize: getResponsiveValue(
        { mobile: 10, tablet: 12, desktop: 14 },
        screenType
      ),
      fontWeight: '500' as const,
      marginTop: screenType === 'mobile' ? 2 : 4,
    },
    iconStyle: {
    },
  };

  // Taille des icônes responsive
  const iconSize = getResponsiveValue(
    { mobile: 24, tablet: 26, desktop: 28 },
    screenType
  );

  // Pour tablette en paysage, utiliser un layout différent si nécessaire
  const isTabletLandscape = screenType === 'tablet' && width > 1000;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tabBarConfig.activeTintColor,
        tabBarInactiveTintColor: tabBarConfig.inactiveTintColor,
        tabBarStyle: tabBarConfig.style,
        tabBarLabelStyle: tabBarConfig.labelStyle,
        tabBarIconStyle: tabBarConfig.iconStyle,
        headerShown: false,
        tabBarHideOnKeyboard: screenType === 'mobile',
        tabBarAllowFontScaling: false,
        tabBarItemStyle: {
          paddingVertical: screenType === 'mobile' ? 4 : 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons 
              name={focused ? 'qr-code' : 'qr-code-outline'} 
              size={iconSize} 
              color={color} 
            />
          ),
          tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
        }}
      />
      
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Restaurants',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons 
              name={focused ? 'restaurant' : 'restaurant-outline'} 
              size={iconSize} 
              color={color} 
            />
          ),
          tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
        }}
      />
      
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Commandes',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons 
              name={focused ? 'receipt' : 'receipt-outline'} 
              size={iconSize} 
              color={color} 
            />
          ),
          tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
        }}
      />
      
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Panier',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons 
              name={focused ? 'bag' : 'bag-outline'} 
              size={iconSize} 
              color={color} 
            />
          ),
          tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons 
              name={focused ? 'person' : 'person-outline'} 
              size={iconSize} 
              color={color} 
            />
          ),
          tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
        }}
      />
    </Tabs>
  );
}