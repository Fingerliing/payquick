/**
 * ThemeContext — Gestion du mode clair / sombre.
 *
 *  - 3 modes : 'light' | 'dark' | 'system' (suit le système iOS/Android).
 *  - Persistance dans AsyncStorage (clé : @eatquicker/theme-mode).
 *  - `isDark` est dérivé du mode + du `useColorScheme()` natif.
 *  - Le hook `useTheme()` est destiné aux primitives bas niveau ; les écrans
 *    consomment plutôt `useAppTheme()` depuis `@/utils/designSystem` qui
 *    renvoie aussi les couleurs résolues.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = '@eatquicker/theme-mode';

interface ThemeContextValue {
  /** Préférence utilisateur. */
  mode: ThemeMode;
  /** Résolution effective (mode 'system' inclus). */
  isDark: boolean;
  /** Définit le mode et persiste. */
  setMode: (mode: ThemeMode) => Promise<void>;
  /** Bascule light <-> dark (en partant de l'état effectif courant). */
  toggle: () => Promise<void>;
  /** True tant que la préférence n'a pas été chargée depuis AsyncStorage. */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveIsDark(mode: ThemeMode, system: ColorSchemeName): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return system === 'dark';
}

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Permet de forcer un mode par défaut (utile pour les tests). */
  initialMode?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialMode = 'system',
}) => {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );
  const [isLoading, setIsLoading] = useState(true);

  // 1) Charger la préférence persistée.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      } catch {
        // Best-effort : on garde initialMode.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // 2) Suivre les changements du thème système (utile en mode 'system').
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => sub.remove();
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort.
    }
  }, []);

  const isDark = resolveIsDark(mode, systemScheme);

  const toggle = useCallback(async () => {
    await setMode(isDark ? 'light' : 'dark');
  }, [isDark, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, isDark, setMode, toggle, isLoading }),
    [mode, isDark, setMode, toggle, isLoading],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * Hook bas niveau — préférer `useAppTheme()` (designSystem) dans les écrans,
 * qui retourne en plus les couleurs résolues.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme doit être utilisé dans un ThemeProvider');
  }
  return ctx;
}
