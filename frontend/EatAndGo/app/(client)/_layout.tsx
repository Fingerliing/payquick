import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';

export default function ClientLayout() {
  const { user, isClient } = useAuth();
  
  // Rediriger vers l'interface restaurant si pas client
  if (user && !isClient) {
    return <Redirect href="/(restaurant)" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.tint,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'qr-code' : 'qr-code-outline'} 
              size={28} 
              color={color} 
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Restaurants',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'restaurant' : 'restaurant-outline'} 
              size={28} 
              color={color} 
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Commandes',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'receipt' : 'receipt-outline'} 
              size={28} 
              color={color} 
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Panier',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'bag' : 'bag-outline'} 
              size={28} 
              color={color} 
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? 'person' : 'person-outline'} 
              size={28} 
              color={color} 
            />
          ),
        }}
      />
    </Tabs>
  );
}