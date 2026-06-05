/**
 * LanguageContext — préférence de langue persistée + gestion RTL.
 *
 * Responsabilités :
 *  - Charger la langue persistée (AsyncStorage) au démarrage, sinon détecter
 *    via expo-localization.
 *  - Appeler `i18n.changeLanguage()` et persister.
 *  - Gérer la bascule LTR <-> RTL pour l'arabe (via I18nManager).
 *    Le changement RTL nécessite un reload de l'app → on tente
 *    `Updates.reloadAsync()` (expo-updates) puis on retombe sur une alerte
 *    "Veuillez redémarrer l'application".
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Alert, I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { useTranslation } from 'react-i18next';

import i18n, {
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  type LanguageCode,
  isRTL,
} from '@/i18n';

const STORAGE_KEY = '@eatquicker/language';

interface LanguageContextValue {
  /** Code langue courant. */
  language: LanguageCode;
  /** Métadonnées (label, drapeau, RTL). */
  languageInfo: (typeof SUPPORTED_LANGUAGES)[number];
  /** Change la langue, persiste et gère RTL si nécessaire. */
  setLanguage: (code: LanguageCode) => Promise<void>;
  /** Liste exposée pour les sélecteurs. */
  available: typeof SUPPORTED_LANGUAGES;
  /** True tant que la langue n'a pas été chargée. */
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

/** Détecte la langue device et la mappe sur une langue supportée. */
function detectDeviceLanguage(): LanguageCode {
  try {
    const locales = Localization.getLocales();
    for (const loc of locales) {
      const code = (loc.languageCode ?? '').toLowerCase();
      if ((SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code)) {
        return code as LanguageCode;
      }
    }
  } catch {
    // Ignore — fallback fr.
  }
  return 'fr';
}

async function applyRTL(code: LanguageCode): Promise<boolean> {
  const shouldBeRTL = isRTL(code);
  const isCurrentlyRTL = I18nManager.isRTL;
  if (shouldBeRTL === isCurrentlyRTL) return false;

  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);

  // Reload l'app pour appliquer la direction (RN ne re-layout pas à chaud).
  try {
    // Import dynamique pour éviter un échec si expo-updates absent.
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
    return true;
  } catch {
    Alert.alert(
      'Redémarrage requis',
      "Veuillez fermer puis rouvrir l'application pour appliquer le changement de langue.",
    );
    return true;
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<LanguageCode>('fr');
  const [isLoading, setIsLoading] = useState(true);

  // Chargement initial.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const initial =
          stored && (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(stored)
            ? (stored as LanguageCode)
            : detectDeviceLanguage();

        await i18n.changeLanguage(initial);
        setLanguageState(initial);
      } catch {
        // Fallback FR.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setLanguage = useCallback(async (code: LanguageCode) => {
    if (!(SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(code)) return;

    await i18n.changeLanguage(code);
    setLanguageState(code);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, code);
    } catch {
      // Best-effort.
    }
    // Bascule RTL si nécessaire (peut déclencher un reload).
    await applyRTL(code);
  }, []);

  const languageInfo = useMemo(
    () =>
      SUPPORTED_LANGUAGES.find((l) => l.code === language) ??
      SUPPORTED_LANGUAGES[0],
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      languageInfo,
      setLanguage,
      available: SUPPORTED_LANGUAGES,
      isLoading,
    }),
    [language, languageInfo, setLanguage, isLoading],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage doit être utilisé dans un LanguageProvider');
  }
  return ctx;
}

/**
 * Re-export pour réduire les imports dans les écrans :
 *   const { t } = useT();
 *   <Text>{t('common.save')}</Text>
 */
export function useT() {
  return useTranslation();
}
