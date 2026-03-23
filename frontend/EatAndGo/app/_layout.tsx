import React, { useEffect, useState } from 'react';
import { router, SplashScreen, Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { RestaurantProvider } from '@/contexts/RestaurantContext';
import { ComptabiliteProvider } from '@/contexts/ComptabiliteContext';
import { OrderProvider } from '@/contexts/OrderContext';
import { CartProvider } from '@/contexts/CartContext';
import { LegalAcceptanceProvider } from '@/contexts/LegalAcceptanceContext';
import { FirstLaunchLegalModal } from '@/components/legal/FirstLaunchLegalModal';
import { NotificationProvider as SessionNotificationProvider } from '@/components/session/SessionNotifications';
import { NotificationProvider as PushNotificationProvider } from '@/contexts/NotificationContext';
import { SessionProvider } from '@/contexts/SessionContext';

try {
  SplashScreen.preventAutoHideAsync();
} catch {
}

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
      SplashScreen.hideAsync().catch(() => {
        // console.error('Erreur lors du masquage du splash screen:', error);
      });
    }
  }, [authLoading, hasTimeout]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LegalAcceptanceProvider>
        <AuthProvider>
          <RestaurantProvider>
            <ComptabiliteProvider>
              <OrderProvider>
                <SessionProvider>
                  <SplashScreenManager>
                    <CartProvider>
                      <PushNotificationProvider>
                        <SessionNotificationProvider>
                          <Stack>
                            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                            <Stack.Screen name="(restaurant)" options={{ headerShown: false }} />
                            <Stack.Screen name="(client)" options={{ headerShown: false }} />
                            <Stack.Screen name="restaurant/[id]" options={{ headerShown: false }} />
                            <Stack.Screen name="restaurant/add" options={{ headerShown: false }} />
                            <Stack.Screen name="restaurant/edit/[id]" options={{ headerShown: false }} />
                            <Stack.Screen name="menu/[id]" options={{ headerShown: false }} />
                            <Stack.Screen name="menu/edit/[id]" options={{ headerShown: false }} />
                            <Stack.Screen name="menu/item/add" options={{ headerShown: false }} />
                            <Stack.Screen name="menu/item/edit/[id]" options={{ headerShown: false }} />
                            <Stack.Screen name="menu/client/[restaurantId]" options={{ headerShown: false }} />
                            <Stack.Screen name="menu/client/[restaurantId]/[sessionId]" options={{ headerShown: false }} />
                            <Stack.Screen name="menu/add" options={{ headerShown: false }} />
                            <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
                            <Stack.Screen name="order/checkout" options={{ headerShown: false }} />
                            <Stack.Screen name="order/success" options={{ headerShown: false }} />
                            <Stack.Screen name="notifications" options={{ headerShown: false }} />
                            <Stack.Screen name="notifications/preferences" options={{ headerShown: false }} />
                            <Stack.Screen name="help/help" options={{ headerShown: false }} />
                            <Stack.Screen name="+not-found" />
                          </Stack>
                          <FirstLaunchLegalModal />
                        </SessionNotificationProvider>
                      </PushNotificationProvider>
                    </CartProvider>
                  </SplashScreenManager>
                </SessionProvider>
              </OrderProvider>
            </ComptabiliteProvider>
          </RestaurantProvider>
        </AuthProvider>
      </LegalAcceptanceProvider>
    </SafeAreaProvider>
  );
}