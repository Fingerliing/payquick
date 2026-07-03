// ⚠️ Ces deux imports DOIVENT rester les premiers du fichier.
//   1) intl-pluralrules : polyfill Intl.PluralRules requis par i18next sous Hermes
//   2) @/i18n            : initialisation i18next (effet de bord)
import 'intl-pluralrules';
import '@/i18n';

import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';

import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
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
import { configureGoogleSignIn } from '@/services/googleAuthService';
import { useAppTheme } from '@/utils/designSystem';
import SplashIntro from '@/components/intro/SplashIntro';

try {
  SplashScreen.preventAutoHideAsync();
} catch {
}

// Transition douce (fade) quand on masque le splash natif, pour éviter
// un cut brutal juste avant que SplashIntro prenne le relais.
try {
  SplashScreen.setOptions({ duration: 250, fade: true });
} catch {
}

// ────────────────────────────────────────────────────────────────────────────
// Pilote la barre de navigation Android (boutons) + le fond de fenêtre
// derrière les barres système, en fonction du thème courant.
// Doit être monté SOUS ThemeProvider pour pouvoir lire useAppTheme().
// ────────────────────────────────────────────────────────────────────────────
function SystemBarsManager() {
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Fond de fenêtre derrière les barres système (edge-to-edge) :
    // c'est lui qui rend la zone de la barre de nav "bleu nuit" en dark.
    SystemUI.setBackgroundColorAsync(colors.background);

    // Icônes des boutons : clairs sur fond navy, sombres en mode clair.
    NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
  }, [isDark, colors.background]);

  return null;
}

function SplashOverlay() {
  const { isLoading: authLoading } = useAuth();
  const [hasTimeout, setHasTimeout] = useState(false);
  const [nativeSplashHidden, setNativeSplashHidden] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  // Timeout de sécurité de 5 secondes
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.warn('⚠️ Splash screen timeout - forçage du masquage');
      setHasTimeout(true);
    }, 5000);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if ((!authLoading || hasTimeout) && !nativeSplashHidden) {
      console.log(`📱 Masquage du splash natif - Auth chargée: ${!authLoading}, Timeout: ${hasTimeout}`);
      SplashScreen.hideAsync()
        .catch(() => {
          // console.error('Erreur lors du masquage du splash screen:', error);
        })
        .finally(() => setNativeSplashHidden(true));
    }
  }, [authLoading, hasTimeout, nativeSplashHidden]);

  if (!nativeSplashHidden || introDone) {
    return null;
  }

  // IMPORTANT : overlay flottant au-dessus du Stack déjà monté, pas un gate.
  // Le root navigator d'expo-router doit rester monté dès le départ pour que
  // AuthContext.checkAuth() puisse naviguer sans race condition ("before
  // mounting Root Layout") — c'était la cause de la boucle précédente.
  return <SplashIntro onFinish={() => setIntroDone(true)} />;
}

export default function RootLayout() {
  // Initialisation du SDK Google Sign-In au démarrage de l'app.
  // Idempotent : safe en cas de re-render.
  useEffect(() => {
    configureGoogleSignIn();
  }, []);

  return (
    <SafeAreaProvider>
      {/*
        ThemeProvider et LanguageProvider sont placés au plus haut niveau
        (juste sous SafeAreaProvider) pour que TOUS les écrans, modales et
        FirstLaunchLegalModal puissent lire le thème courant via useAppTheme()
        et les traductions via useTranslation().
      */}
      <ThemeProvider>
        {/* Synchronise la barre de nav Android avec le thème (Android uniquement) */}
        <SystemBarsManager />
        <LanguageProvider>
          <LegalAcceptanceProvider>
            <AuthProvider>
              <RestaurantProvider>
                <ComptabiliteProvider>
                  <OrderProvider>
                    <SessionProvider>
                      <CartProvider>
                        <PushNotificationProvider>
                          <SessionNotificationProvider>
                            <Stack screenOptions={{ headerShown: false }}>
                              <Stack.Screen name="+not-found" />
                            </Stack>
                            <FirstLaunchLegalModal />
                            {/* Overlay flottant, ne bloque jamais le montage du Stack ci-dessus */}
                            <SplashOverlay />
                          </SessionNotificationProvider>
                        </PushNotificationProvider>
                      </CartProvider>
                    </SessionProvider>
                  </OrderProvider>
                </ComptabiliteProvider>
              </RestaurantProvider>
            </AuthProvider>
          </LegalAcceptanceProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}