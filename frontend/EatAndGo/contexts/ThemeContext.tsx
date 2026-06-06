import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = '@eatquicker/theme-mode';

interface ThemeContextValue {
  /** Mode courant ('light' ou 'dark'). */
  mode: ThemeMode;
  /** Alias commode : true si mode === 'dark'. */
  isDark: boolean;
  /** Définit le mode et persiste. */
  setMode: (mode: ThemeMode) => Promise<void>;
  /** Bascule light <-> dark. */
  toggle: () => Promise<void>;
  /** True tant que la préférence n'a pas été chargée depuis AsyncStorage. */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Permet de forcer un mode par défaut (utile pour les tests). */
  initialMode?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialMode,
}) => {
  // Si initialMode fourni → l'utiliser ; sinon valeur sentinel le temps du chargement.
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? 'light');
  const [isLoading, setIsLoading] = useState(initialMode === undefined);

  // 1) Charger la préférence persistée OU, à défaut, le thème système courant.
  useEffect(() => {
    if (initialMode !== undefined) return; // bypass pour les tests

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          setModeState(stored);
        } else {
          // Pas de préférence → on adopte le thème système comme initial.
          const sys = Appearance.getColorScheme();
          setModeState(sys === 'dark' ? 'dark' : 'light');
        }
      } catch {
        // Best-effort : on reste sur 'light'.
      } finally {
        setIsLoading(false);
      }
    })();
  }, [initialMode]);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort.
    }
  }, []);

  const toggle = useCallback(async () => {
    await setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, isDark: mode === 'dark', setMode, toggle, isLoading }),
    [mode, setMode, toggle, isLoading],
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