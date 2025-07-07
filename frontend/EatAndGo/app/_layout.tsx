import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/contexts/AuthContext';
import { RestaurantProvider } from '@/contexts/RestaurantContext';
import { OrderProvider } from '@/contexts/OrderContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RestaurantProvider>
          <OrderProvider>
            <Stack>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="restaurant/[id]" options={{ title: 'Restaurant' }} />
              <Stack.Screen name="restaurant/add" options={{ title: 'Ajouter un restaurant' }} />
              <Stack.Screen name="restaurant/edit/[id]" options={{ title: 'Modifier le restaurant' }} />
              <Stack.Screen name="menu/[id]" options={{ title: 'Menu' }} />
              <Stack.Screen name="menu/add" options={{ title: 'Ajouter un menu' }} />
              <Stack.Screen name="order/[id]" options={{ title: 'Commande' }} />
              <Stack.Screen name="order/checkout" options={{ title: 'Finaliser la commande' }} />
              <Stack.Screen name="order/success" options={{ title: 'Commande confirmée' }} />
              <Stack.Screen name="+not-found" />
            </Stack>
          </OrderProvider>
        </RestaurantProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}