/**
 * Design System EatQuickeR — Light + Dark
 *
 * Ce fichier est un SUPERSET STRICT de la version legacy : tous les exports
 * existants (COLORS, SHADOWS, COMPONENT_STYLES, ANIMATIONS, createResponsiveStyles,
 * helpers mt/mb/.../py, etc.) sont conservés à l'identique pour ne PAS casser
 * les centaines d'imports déjà en place dans l'app.
 *
 * Architecture du theming :
 *  - LIGHT_COLORS / DARK_COLORS : deux palettes complètes, structure identique
 *  - COLORS (legacy) = LIGHT_COLORS → les anciens écrans restent en mode clair
 *  - useAppTheme()   : nouveau hook React, retourne { colors, isDark, mode, setMode, toggle }
 *  - makeShadows(colors) : fabrique d'ombres theme-aware (pour les écrans migrés)
 *  - SHADOWS legacy  = makeShadows(LIGHT_COLORS) → identique à avant
 *  - createResponsiveStylesThemed(screenType, colors) : version thème-aware de
 *    createResponsiveStyles ; l'original reste figé sur LIGHT_COLORS
 *
 * Pour migrer un écran : remplacer
 *   import { COLORS, ... } from '@/utils/designSystem';
 * par
 *   import { useAppTheme, ... } from '@/utils/designSystem';
 *   const { colors } = useAppTheme();
 * et déplacer la création des StyleSheet dans une fabrique `(colors) => StyleSheet.create({...})`.
 *
 * Voir docs/THEME_I18N_MIGRATION.md.
 */
import { useWindowDimensions } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

// ──────────────────────────────────────────────────────────────────────────
// BREAKPOINTS RESPONSIVE
// ──────────────────────────────────────────────────────────────────────────
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// TYPE PUBLIC DE LA PALETTE
//
// On déclare AppColors explicitement avec des `string` (et non avec
// `typeof LIGHT_COLORS as const`) sinon TypeScript fige LIGHT_COLORS sur
// des littéraux (primary: "#1E2A78") et refuse toute autre valeur pour
// DARK_COLORS. La structure ci-dessous doit rester en miroir avec
// LIGHT_COLORS / DARK_COLORS.
// ──────────────────────────────────────────────────────────────────────────
export interface ColorScale {
  50:  string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

export interface AppColors {
  primary: string;
  secondary: string;

  success: string;
  warning: string;
  error: string;
  info: string;
  card: string;

  background: string;
  surface: string;
  overlay: string;
  goldenSurface: string;

  text: {
    primary: string;
    secondary: string;
    light: string;
    inverse: string;
    golden: string;
  };

  border: {
    light: string;
    default: string;
    dark: string;
    golden: string;
  };

  shadow: {
    light: string;
    default: string;
    medium: string;
    dark: string;
    golden: string;
  };

  progress: {
    pending: string;
    preparing: string;
    ready: string;
    completed: string;
  };

  variants: {
    primary: ColorScale;
    secondary: ColorScale;
  };

  gradients: {
    goldenHorizontal: readonly string[];
    goldenVertical: readonly string[];
    goldenRadial: readonly string[];
    premiumGold: readonly string[];
    subtleGold: readonly string[];
  };
}

// ──────────────────────────────────────────────────────────────────────────
// PALETTE LIGHT — strictement identique à l'ancien COLORS (valeurs)
// ──────────────────────────────────────────────────────────────────────────
export const LIGHT_COLORS: AppColors = {
  // Couleurs principales de la marque
  primary: '#1E2A78',      // Bleu principal
  secondary: '#D4AF37',    // Or classique

  // Couleurs système
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  card: '#FFFFFF',

  // Couleurs de surface avec touches dorées
  background: '#F9FAFB',
  surface: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.5)',
  goldenSurface: '#FFFCF0',

  // Couleurs de texte
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF',
    inverse: '#FFFFFF',
    golden: '#B8941F',
  },

  // Couleurs de bordure et séparateurs
  border: {
    light: '#F3F4F6',
    default: '#E5E7EB',
    dark: '#D1D5DB',
    golden: '#E6D08A',
  },

  // Couleurs d'ombre
  shadow: {
    light: 'rgba(0, 0, 0, 0.05)',
    default: 'rgba(0, 0, 0, 0.1)',
    medium: 'rgba(0, 0, 0, 0.15)',
    dark: 'rgba(0, 0, 0, 0.25)',
    golden: 'rgba(212, 175, 55, 0.15)',
  },

  progress: {
    pending: '#cbd5e1',
    preparing: '#3b82f6',
    ready: '#10b981',
    completed: '#8b5cf6',
  },

  // Variantes des couleurs principales
  variants: {
    primary: {
      50:  '#F0F3FF',
      100: '#E0E7FF',
      200: '#C7D2FE',
      300: '#A5B4FC',
      400: '#818CF8',
      500: '#1E2A78',
      600: '#1A2563',
      700: '#15204E',
      800: '#111B39',
      900: '#0D1629',
    },
    secondary: {
      50:  '#FFFEF7',
      100: '#FFFBEB',
      200: '#FEF3C7',
      300: '#FDE68A',
      400: '#FACC15',
      500: '#D4AF37',
      600: '#CA8A04',
      700: '#A16207',
      800: '#854D0E',
      900: '#713F12',
    },
  },

  // Gradients dorés
  gradients: {
    goldenHorizontal: ['#FFD700', '#D4AF37', '#B8941F'],
    goldenVertical:   ['#F4E17B', '#D4AF37', '#A16207'],
    goldenRadial:     ['#FACC15', '#D4AF37', '#854D0E'],
    premiumGold:      ['#FFE55C', '#D4AF37', '#8B7355'],
    subtleGold:       ['#FAF7E8', '#F4E17B', '#E6D08A'],
  },
};

// ──────────────────────────────────────────────────────────────────────────
// PALETTE DARK — fidèle au logo EatQuickeR (navy quasi-noir + or premium)
//
// Lecture du logo :
//  - Fond : noir bleuté très profond, texture papier kraft, presque pure obscurité
//  - Or : différents tons (or jaune lumineux pour les highlights, or cuivré/oxydé
//    pour les ornements). On garde le D4AF37 historique comme accent principal.
//  - Texte : blanc cassé, légèrement chaud mais PAS jaunâtre — il faut un contraste
//    franc avec le navy, pas une harmonie tiède.
//
// Choix structurants :
//  - background = noir bleuté quasi-pur (#070B18) pour reproduire la profondeur du logo
//  - surface = un cran plus clair (#0F1528) pour les cartes, modales
//  - surfaceElevated implicite via shadow + élévation
//  - primary = bleu indigo clair pour les CTAs (pas l'or, sinon collision avec secondary)
//  - secondary (or) conservé en #D4AF37 — c'est notre signature
//  - text.primary = blanc cassé chaud très lumineux (#F5F2E8) qui rappelle la dorure
//    du logo SANS être jaunâtre comme avant
// ──────────────────────────────────────────────────────────────────────────
export const DARK_COLORS: AppColors = {
  primary: '#A5B4FC',      // indigo clair, lisible sur fond quasi-noir
  secondary: '#D4AF37',    // or signature conservé

  success: '#34D399',
  warning: '#FBBF24',
  error:   '#F87171',
  info:    '#60A5FA',
  card:    '#0F1528',

  background:    '#070B18', // noir bleuté quasi pur (texture du logo)
  surface:       '#0F1528', // navy très sombre, cartes et modales
  goldenSurface: '#1A1A2E', // surface "or" en dark = navy à peine teinté
  overlay:       'rgba(0, 0, 0, 0.78)',

  text: {
    primary:   '#F2EBD5', // blanc cassé chaud, rappelle subtilement la dorure du logo
    secondary: '#B8B8C8', // gris-bleu doux pour le secondaire
    light:     '#7A7A8E', // gris-bleu plus sombre pour les meta
    inverse:   '#070B18', // texte sur fonds clairs (boutons or par ex.)
    golden:    '#E6C76B', // accent or pour les titres "premium"
  },

  border: {
    light:   '#161D33', // bordures subtiles, presque invisibles
    default: '#222B47', // bordures par défaut
    dark:    '#2D3760', // bordures plus marquées
    golden:  '#8B6F1F', // bordure dorée vieillie (ton des feuilles de laurier)
  },

  shadow: {
    // En dark, les ombres très sombres créent l'élévation par contraste avec le fond.
    light:   'rgba(0, 0, 0, 0.4)',
    default: 'rgba(0, 0, 0, 0.55)',
    medium:  'rgba(0, 0, 0, 0.7)',
    dark:    'rgba(0, 0, 0, 0.85)',
    golden:  'rgba(212, 175, 55, 0.35)', // halo or pour les éléments premium
  },

  progress: {
    pending:   '#475569',
    preparing: '#60A5FA',
    ready:     '#34D399',
    completed: '#A78BFA',
  },

  variants: {
    // Échelle inversée pour conserver la sémantique "50 = subtil, 900 = saturé"
    primary: {
      50:  '#070B18',
      100: '#0F1528',
      200: '#161D33',
      300: '#1E2A78',
      400: '#3A4CB8',
      500: '#A5B4FC',  // accent principal en dark
      600: '#C7D2FE',
      700: '#E0E7FF',
      800: '#F0F3FF',
      900: '#FFFFFF',
    },
    secondary: {
      // On va du brun-or oxydé (les feuilles de laurier du logo) à l'or éclatant (la cuillère)
      50:  '#2B1F08',
      100: '#3F2D0C',
      200: '#5C4818',
      300: '#7A6020',
      400: '#A88A2E',
      500: '#D4AF37',  // or signature
      600: '#E6C76B',
      700: '#F4E17B',
      800: '#FBEFA8',
      900: '#FFFBEB',
    },
  },

  gradients: {
    goldenHorizontal: ['#8B6F1F', '#D4AF37', '#F4E17B'],
    goldenVertical:   ['#5C4818', '#D4AF37', '#FFE55C'],
    goldenRadial:     ['#3F2D0C', '#D4AF37', '#FACC15'],
    premiumGold:      ['#7A6020', '#D4AF37', '#FFE55C'],
    subtleGold:       ['#161D33', '#3F2D0C', '#8B6F1F'],
  },
};

// ──────────────────────────────────────────────────────────────────────────
// COLORS (export legacy) — pointe sur LIGHT_COLORS
// Les écrans non migrés gardent ainsi un comportement strictement identique.
// ──────────────────────────────────────────────────────────────────────────
export const COLORS = LIGHT_COLORS;

// ──────────────────────────────────────────────────────────────────────────
// useAppTheme — hook public pour les écrans migrés
// ──────────────────────────────────────────────────────────────────────────
/**
 * Retourne :
 *  - colors   : palette courante (LIGHT_COLORS ou DARK_COLORS)
 *  - isDark   : booléen, mode dark effectif
 *  - mode     : 'light' | 'dark' | 'system' (réglage utilisateur)
 *  - setMode  : changer le mode (persisté en AsyncStorage)
 *  - toggle   : bascule light ↔ dark (sans toucher au mode 'system')
 *  - isLoading: true tant que la préférence n'est pas chargée
 */
export function useAppTheme() {
  const ctx = useTheme();
  return {
    colors: ctx.isDark ? DARK_COLORS : LIGHT_COLORS,
    isDark: ctx.isDark,
    mode:   ctx.mode,
    setMode: ctx.setMode,
    toggle:  ctx.toggle,
    isLoading: ctx.isLoading,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// TYPOGRAPHIE RESPONSIVE
// ──────────────────────────────────────────────────────────────────────────
export const TYPOGRAPHY = {
  fontSize: {
    xs:    { mobile: 10, tablet: 11, desktop: 12 },
    sm:    { mobile: 12, tablet: 13, desktop: 14 },
    base:  { mobile: 14, tablet: 15, desktop: 16 },
    md:    { mobile: 16, tablet: 17, desktop: 18 },
    lg:    { mobile: 18, tablet: 20, desktop: 22 },
    xl:    { mobile: 20, tablet: 22, desktop: 24 },
    '2xl': { mobile: 24, tablet: 28, desktop: 32 },
    '3xl': { mobile: 28, tablet: 32, desktop: 36 },
    '4xl': { mobile: 32, tablet: 36, desktop: 42 },
  },
  fontWeight: {
    normal:    '400',
    medium:    '500',
    semibold:  '600',
    bold:      '700',
    extrabold: '800',
  },
  lineHeight: {
    tight:   1.2,
    normal:  1.4,
    relaxed: 1.6,
    loose:   1.8,
  },
} as const;

export const getLineHeight = (
  fontSizeToken: keyof typeof TYPOGRAPHY.fontSize,
  screenType: 'mobile' | 'tablet' | 'desktop',
  factor: keyof typeof TYPOGRAPHY.lineHeight = 'normal',
) => {
  const size = getResponsiveValue(TYPOGRAPHY.fontSize[fontSizeToken], screenType);
  return Math.round(size * TYPOGRAPHY.lineHeight[factor]);
};

// ──────────────────────────────────────────────────────────────────────────
// ESPACEMENTS RESPONSIVE
// ──────────────────────────────────────────────────────────────────────────
export const SPACING = {
  xs:    { mobile: 4,  tablet: 6,  desktop: 8 },
  sm:    { mobile: 8,  tablet: 10, desktop: 12 },
  md:    { mobile: 12, tablet: 16, desktop: 20 },
  lg:    { mobile: 16, tablet: 20, desktop: 24 },
  xl:    { mobile: 20, tablet: 24, desktop: 32 },
  '2xl': { mobile: 24, tablet: 32, desktop: 40 },
  '3xl': { mobile: 32, tablet: 40, desktop: 48 },
  '4xl': { mobile: 40, tablet: 48, desktop: 64 },

  container: { mobile: 16, tablet: 24, desktop: 32 },
  section:   { mobile: 16, tablet: 20, desktop: 24 },
  card:      { mobile: 12, tablet: 16, desktop: 20 },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// RAYONS DE BORDURE
// ──────────────────────────────────────────────────────────────────────────
export const BORDER_RADIUS = {
  none:  0,
  sm:    4,
  md:    6,
  lg:    8,
  xl:    12,
  '2xl': 16,
  '3xl': 20,
  full:  9999,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// OMBRES — fabrique theme-aware + export legacy figé sur LIGHT
// ──────────────────────────────────────────────────────────────────────────
export const makeShadows = (c: AppColors) => ({
  none: {
    shadowColor:   'transparent',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius:  0,
    elevation:     0,
  },
  sm: {
    shadowColor:   c.shadow.light,
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius:  2,
    elevation:     1,
  },
  md: {
    shadowColor:   c.shadow.default,
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius:  4,
    elevation:     2,
  },
  lg: {
    shadowColor:   c.shadow.default,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius:  8,
    elevation:     4,
  },
  xl: {
    shadowColor:   c.shadow.medium,
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius:  16,
    elevation:     8,
  },
  card: {
    shadowColor:   c.shadow.default,
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius:  8,
    elevation:     3,
  },
  button: {
    shadowColor:   c.shadow.medium,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius:  8,
    elevation:     4,
  },
  goldenGlow: {
    shadowColor:   c.shadow.golden,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius:  12,
    elevation:     6,
  },
  premiumCard: {
    shadowColor:   c.variants.secondary[300],
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius:  20,
    elevation:     8,
  },
});

/**
 * SHADOWS legacy — figé sur LIGHT_COLORS pour rétrocompat absolue.
 * Les écrans migrés utilisent `makeShadows(colors)` à la place.
 */
export const SHADOWS = makeShadows(LIGHT_COLORS);

// ──────────────────────────────────────────────────────────────────────────
// HOOK POUR DÉTECTER LE TYPE D'ÉCRAN
// ──────────────────────────────────────────────────────────────────────────
export const useScreenType = () => {
  const { width } = useWindowDimensions();
  if (width >= BREAKPOINTS.desktop) return 'desktop' as const;
  if (width >= BREAKPOINTS.tablet)  return 'tablet' as const;
  return 'mobile' as const;
};

// ──────────────────────────────────────────────────────────────────────────
// HELPER POUR OBTENIR UNE VALEUR RESPONSIVE
// ──────────────────────────────────────────────────────────────────────────
export const getResponsiveValue = <T,>(
  values: { mobile: T; tablet: T; desktop: T },
  screenType: 'mobile' | 'tablet' | 'desktop',
): T => values[screenType];

// ──────────────────────────────────────────────────────────────────────────
// FABRIQUE DE STYLES RESPONSIVES — version LEGACY (figée sur LIGHT)
// ──────────────────────────────────────────────────────────────────────────
export const createResponsiveStyles = (screenType: 'mobile' | 'tablet' | 'desktop') =>
  buildResponsiveStyles(screenType, LIGHT_COLORS, SHADOWS);

// ──────────────────────────────────────────────────────────────────────────
// FABRIQUE DE STYLES RESPONSIVES — version THEME-AWARE
// À utiliser dans les écrans migrés :
//   const { colors } = useAppTheme();
//   const screenType = useScreenType();
//   const styles = useMemo(
//     () => createResponsiveStylesThemed(screenType, colors),
//     [screenType, colors],
//   );
// ──────────────────────────────────────────────────────────────────────────
export const createResponsiveStylesThemed = (
  screenType: 'mobile' | 'tablet' | 'desktop',
  colors: AppColors,
) => buildResponsiveStyles(screenType, colors, makeShadows(colors));

// ──────────────────────────────────────────────────────────────────────────
// Implémentation partagée (sémantique strictement équivalente à l'original)
// ──────────────────────────────────────────────────────────────────────────
const buildResponsiveStyles = (
  screenType: 'mobile' | 'tablet' | 'desktop',
  c: AppColors,
  s: ReturnType<typeof makeShadows>,
) => {
  const isTabletOrLarger = screenType !== 'mobile';
  const isDesktop = screenType === 'desktop';

  return {
    container: {
      padding: getResponsiveValue(SPACING.container, screenType),
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center' as const,
      width: '100%',
    },
    flexRow:    { flexDirection: 'row' as const },
    flexColumn: { flexDirection: 'column' as const },

    grid: {
      flexDirection: isTabletOrLarger ? ('row' as const) : ('column' as const),
      gap: getResponsiveValue(SPACING.lg, screenType),
    },
    gridItem: { flex: 1 },

    // Cartes
    card: {
      backgroundColor: c.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.card, screenType),
      ...s.card,
    },
    premiumCard: {
      backgroundColor: c.goldenSurface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.card, screenType),
      borderWidth: 1,
      borderColor: c.border.golden,
      ...s.premiumCard,
    },

    // Boutons
    button: {
      paddingVertical:   getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      minHeight: isTabletOrLarger ? 48 : 44,
    },
    buttonPrimary:   { backgroundColor: c.primary },
    buttonSecondary: { backgroundColor: c.secondary },
    buttonGolden: {
      backgroundColor: c.variants.secondary[500],
      ...s.goldenGlow,
    },
    buttonGoldenOutline: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: c.variants.secondary[500],
    },

    // Textes
    textTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: c.text.primary,
      lineHeight: getLineHeight('2xl', screenType, 'tight'),
    },
    textTitleGolden: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: c.text.golden,
      lineHeight: getLineHeight('2xl', screenType, 'tight'),
    },
    textSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: c.text.primary,
      lineHeight: getLineHeight('lg', screenType, 'normal'),
    },
    textBody: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: c.text.secondary,
      lineHeight: getLineHeight('base', screenType, 'normal'),
    },
    textCaption: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: c.text.light,
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },
    textGoldenAccent: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: c.text.golden,
      lineHeight: getLineHeight('base', screenType, 'normal'),
    },

    // États
    disabled: { opacity: 0.5 },
    loading:  { opacity: 0.7 },

    // Utilitaires d'espacement
    mt: (size: keyof typeof SPACING) => ({
      marginTop: getResponsiveValue(SPACING[size], screenType),
    }),
    mb: (size: keyof typeof SPACING) => ({
      marginBottom: getResponsiveValue(SPACING[size], screenType),
    }),
    mx: (size: keyof typeof SPACING) => ({
      marginHorizontal: getResponsiveValue(SPACING[size], screenType),
    }),
    my: (size: keyof typeof SPACING) => ({
      marginVertical: getResponsiveValue(SPACING[size], screenType),
    }),
    pt: (size: keyof typeof SPACING) => ({
      paddingTop: getResponsiveValue(SPACING[size], screenType),
    }),
    pb: (size: keyof typeof SPACING) => ({
      paddingBottom: getResponsiveValue(SPACING[size], screenType),
    }),
    px: (size: keyof typeof SPACING) => ({
      paddingHorizontal: getResponsiveValue(SPACING[size], screenType),
    }),
    py: (size: keyof typeof SPACING) => ({
      paddingVertical: getResponsiveValue(SPACING[size], screenType),
    }),
  };
};

// ──────────────────────────────────────────────────────────────────────────
// COMPONENT_STYLES — LEGACY (figé sur LIGHT)
// Pour la version theme-aware, voir makeComponentStyles(colors) ci-dessous.
// ──────────────────────────────────────────────────────────────────────────
export const makeComponentStyles = (c: AppColors) => {
  const s = makeShadows(c);
  return {
    statusBadge: {
      base: {
        paddingHorizontal: 8,
        paddingVertical:   4,
        borderRadius: BORDER_RADIUS.full,
        alignSelf: 'flex-start' as const,
      },
      pending: {
        backgroundColor: c.variants.secondary[100],
        borderColor:     c.variants.secondary[300],
        borderWidth: 1,
      },
      confirmed: {
        backgroundColor: c.variants.primary[100],
        borderColor:     c.variants.primary[300],
        borderWidth: 1,
      },
      preparing: {
        backgroundColor: c.variants.secondary[200],
        borderColor:     c.variants.secondary[500],
        borderWidth: 1,
      },
      ready: {
        backgroundColor: '#D1FAE5',
        borderColor:     c.success,
        borderWidth: 1,
      },
      served: {
        backgroundColor: '#D1FAE5',
        borderColor:     c.success,
        borderWidth: 1,
      },
      cancelled: {
        backgroundColor: '#FEE2E2',
        borderColor:     c.error,
        borderWidth: 1,
      },
      premium: {
        backgroundColor: c.variants.secondary[100],
        borderColor:     c.variants.secondary[500],
        borderWidth: 2,
        ...s.goldenGlow,
      },
    },

    input: {
      base: {
        borderWidth: 1,
        borderColor: c.border.default,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: c.surface,
        paddingHorizontal: 12,
        paddingVertical:   10,
        fontSize: 16,
        color: c.text.primary,
      },
      focused: {
        borderColor: c.primary,
        borderWidth: 2,
      },
      error: {
        borderColor: c.error,
        borderWidth: 2,
      },
      golden: {
        borderColor: c.border.golden,
        backgroundColor: c.goldenSurface,
        borderWidth: 1,
      },
      goldenFocused: {
        borderColor: c.variants.secondary[500],
        borderWidth: 2,
        ...s.goldenGlow,
      },
    },

    timeline: {
      icon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: c.border.default,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      },
      iconCompleted: { backgroundColor: c.success },
      iconGolden: {
        backgroundColor: c.variants.secondary[500],
        ...s.goldenGlow,
      },
      line: {
        width: 2,
        height: 20,
        backgroundColor: c.border.default,
        marginTop: 4,
      },
      lineCompleted: { backgroundColor: c.success },
      lineGolden:    { backgroundColor: c.variants.secondary[400] },
    },
  };
};

export const COMPONENT_STYLES = makeComponentStyles(LIGHT_COLORS);

// ──────────────────────────────────────────────────────────────────────────
// HELPER POUR LES ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────
export const ANIMATIONS = {
  duration: {
    fast:   150,
    normal: 250,
    slow:   400,
  },
  easing: {
    easeInOut: 'ease-in-out',
    easeIn:    'ease-in',
    easeOut:   'ease-out',
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// CONSTANTES POUR LES COMPOSANTS
// ──────────────────────────────────────────────────────────────────────────
export const COMPONENT_CONSTANTS = {
  minTouchTarget: 44,

  headerHeight:  { mobile: 56, tablet: 64, desktop: 72 },
  tabBarHeight:  { mobile: 49, tablet: 56, desktop: 64 },
  buttonHeight:  { mobile: 44, tablet: 48, desktop: 52 },

  maxContentWidth: 1200,
  maxCardWidth:    400,

  zIndex: {
    dropdown:      1000,
    sticky:        1020,
    fixed:         1030,
    modalBackdrop: 1040,
    modal:         1050,
    popover:       1060,
    tooltip:       1070,
  },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Export default — identique à l'original (rétrocompat de l'import default)
// ──────────────────────────────────────────────────────────────────────────
export default {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  BREAKPOINTS,
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  COMPONENT_STYLES,
  ANIMATIONS,
  COMPONENT_CONSTANTS,
};