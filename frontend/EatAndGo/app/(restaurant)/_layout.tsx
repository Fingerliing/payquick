import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useStripeDeepLink } from '@/app/hooks/useStripeDeepLink';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { isAuthenticated, isLoading, isRestaurateur, hasValidatedProfile } = useAuth();
  const insets = useSafeAreaInsets();
  
  useStripeDeepLink();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#D4AF37', // Couleur dorée pour l'actif
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          paddingBottom: Math.max(5, insets.bottom), // Safe area bottom
          paddingTop: 5,
          paddingLeft: insets.left, // Safe area gauche
          paddingRight: insets.right, // Safe area droite
          height: 60 + Math.max(0, insets.bottom), // Ajuster la hauteur avec safe area
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{
          title: 'Restaurants',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Commandes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menus',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />

      {isRestaurateur && hasValidatedProfile && (
        <Tabs.Screen
          name="daily-menu"
          options={{
            title: 'Menu du Jour',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons 
                name={focused ? "today" : "today-outline"} 
                size={size} 
                color={color} 
              />
            ),
          }}
        />
      )}

      <Tabs.Screen
        name="qrcodes"
        options={{
          title: 'QR Codes',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}