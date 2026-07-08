// ⚠️ Ces deux imports DOIVENT rester les premiers du fichier.
//   1) intl-pluralrules : polyfill Intl.PluralRules requis par i18next sous Hermes
//   2) @/i18n            : initialisation i18next (effet de bord)
import 'intl-pluralrules';
import '@/i18n';

import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SystemBars } from 'react-native-edge-to-edge';
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
// Pilote les barres système Android (status bar + nav bar) selon le thème.
// Avec edgeToEdgeEnabled, expo-navigation-bar.setButtonStyleAsync est déprécié
// et sans effet : on passe par <SystemBars> (react-native-edge-to-edge), qui
// gère les icônes des DEUX barres. Les écrans peuvent surcharger localement en
// montant leur propre <SystemBars> (empilé, restauré au démontage).
// Doit être monté SOUS ThemeProvider pour pouvoir lire useAppTheme().
// ────────────────────────────────────────────────────────────────────────────
function SystemBarsManager() {
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Fond de fenêtre derrière les barres système (edge-to-edge) :
    // utile sur nav 3 boutons / anciens Android, "bleu nuit" en dark.
    SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  // 'light' = icônes claires (fond sombre), 'dark' = icônes sombres (fond clair)
  return <SystemBars style={isDark ? 'light' : 'dark'} />;
}

function SplashOverlay() {
  const { isLoading: authLoading } = useAuth();
  const [hasTimeout, setHasTimeout] = useState(false);
  const nativeHideRequestedRef = useRef(false);
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
    // Ne déclenche hideAsync() qu'une seule fois, dès que prêt.
    if ((!authLoading || hasTimeout) && !nativeHideRequestedRef.current) {
      nativeHideRequestedRef.current = true;
      console.log(`📱 Masquage du splash natif - Auth chargée: ${!authLoading}, Timeout: ${hasTimeout}`);
      SplashScreen.hideAsync().catch(() => {
        // console.error('Erreur lors du masquage du splash screen:', error);
      });
    }
  }, [authLoading, hasTimeout]);

  if (introDone) {
    return null;
  }

  // IMPORTANT : monté dès le premier rendu, PAS seulement après hideAsync().
  // SplashIntro est donc déjà peint (et opaque) sous le splash natif avant
  // même que celui-ci commence à s'effacer — aucune fenêtre où le Stack en
  // dessous pourrait apparaître entre la disparition du splash natif et le
  // montage de l'overlay JS.
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
        statusBarTranslucent / navigationBarTranslucent : sans ces props,
        KeyboardProvider ré-applique un padding haut/bas "à la RN classique",
        ce qui crée une bande blanche derrière la status bar et casse
        l'edge-to-edge (les icônes système deviennent invisibles en light).
      */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
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
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}