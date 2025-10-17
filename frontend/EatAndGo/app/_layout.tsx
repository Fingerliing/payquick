import React, { useEffect, useState } from 'react';
import { router, SplashScreen, Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { RestaurantProvider } from '@/contexts/RestaurantContext';
import { OrderProvider } from '@/contexts/OrderContext';
import { CartProvider } from '@/contexts/CartContext';
import { FirstLaunchLegalModal } from '@/components/legal/FirstLaunchLegalModal';
import { checkLegalUpdates, showLegalUpdateAlert } from '@/utils/legalNotifications';

SplashScreen.preventAutoHideAsync();

function SplashScreenManager({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading } = useAuth();
  const [hasTimeout, setHasTimeout] = useState(false);

  // Timeout de sécurité de 5 secondes
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn('⚠️ Splash screen timeout - forçage du masquage');
      setHasTimeout(true);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    // Cacher le splash screen si l'auth est chargée OU si on a timeout
    if (!authLoading || hasTimeout) {
      console.log(`📱 Masquage du splash screen - Auth chargée: ${!authLoading}, Timeout: ${hasTimeout}`);
      SplashScreen.hideAsync().catch(error => {
        console.error('Erreur lors du masquage du splash screen:', error);
      });
    }
  }, [authLoading, hasTimeout]);

  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    const checkUpdates = async () => {
      const needsUpdate = await checkLegalUpdates();
      if (needsUpdate) {
        showLegalUpdateAlert(() => {
          // Naviguer vers les CGU
          router.push('/(legal)/terms');
        });
      }
    };
    
    checkUpdates();
  }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RestaurantProvider>
          <OrderProvider>
            <SplashScreenManager>
              <CartProvider>
                <Stack>
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="(restaurant)" options={{ headerShown: false }} />
                  <Stack.Screen name="(client)" options={{ headerShown: false }} />
                  <Stack.Screen name="restaurant/[id]" options={{ title: 'Restaurant' }} />
                  <Stack.Screen name="restaurant/add" options={{ title: 'Ajouter un restaurant' }} />
                  <Stack.Screen name="restaurant/edit/[id]" options={{ title: 'Modifier le restaurant' }} />
                  <Stack.Screen name="menu/[id]" options={{ title: 'Menu' }} />
                  <Stack.Screen name="menu/edit/[id]" options={{ title: 'Editer un Menu' }} />
                  <Stack.Screen name="menu/add" options={{ title: 'Ajouter un menu' }} />
                  <Stack.Screen name="order/[id]" options={{ title: 'Commande' }} />
                  <Stack.Screen name="order/checkout" options={{ title: 'Finaliser la commande' }} />
                  <Stack.Screen name="order/success" options={{ title: 'Commande confirmée' }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <FirstLaunchLegalModal />
              </CartProvider>
            </SplashScreenManager>
          </OrderProvider>
        </RestaurantProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}