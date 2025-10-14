import { useWindowDimensions } from 'react-native';

// BREAKPOINTS RESPONSIVE
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

// COULEURS DE LA CHARTE AVEC EFFETS DORÉS
export const COLORS = {
  // Couleurs principales de la marque
  primary: '#1E2A78',      // Bleu principal
  secondary: '#D4AF37',    // Or classique (remplace le jaune)
  
  // Couleurs système
  success: '#10B981',      // Vert pour succès
  warning: '#F59E0B',      // Orange pour avertissements
  error: '#EF4444',        // Rouge pour erreurs
  info: '#3B82F6',         // Bleu pour informations
  card: '#FFFFFF',
  
  // Couleurs de surface avec touches dorées
  background: '#F9FAFB',   // Arrière-plan principal
  surface: '#FFFFFF',      // Surfaces des cartes, modales
  overlay: 'rgba(0, 0, 0, 0.5)', // Overlay pour modales
  goldenSurface: '#FFFCF0', // Surface avec teinte dorée subtile
  
  // Couleurs de texte
  text: {
    primary: '#111827',    // Texte principal (titres, labels importants)
    secondary: '#6B7280',  // Texte secondaire (descriptions, sous-titres)
    light: '#9CA3AF',      // Texte léger (placeholders, métadonnées)
    inverse: '#FFFFFF',    // Texte inversé (sur fonds sombres)
    golden: '#B8941F',     // Texte doré pour les accents
  },
  
  // Couleurs de bordure et séparateurs
  border: {
    light: '#F3F4F6',      // Bordures très légères
    default: '#E5E7EB',    // Bordures normales
    dark: '#D1D5DB',       // Bordures plus visibles
    golden: '#E6D08A',     // Bordure dorée subtile
  },
  
  // Couleurs d'ombre avec reflets dorés
  shadow: {
    light: 'rgba(0, 0, 0, 0.05)',
    default: 'rgba(0, 0, 0, 0.1)',
    medium: 'rgba(0, 0, 0, 0.15)',
    dark: 'rgba(0, 0, 0, 0.25)',
    golden: 'rgba(212, 175, 55, 0.15)', // Ombre dorée
  },

  progress: {
    pending: '#cbd5e1',
    preparing: '#3b82f6',
    ready: '#10b981',
    completed: '#8b5cf6'
  },
  
  // Variantes des couleurs principales
  variants: {
    primary: {
      50: '#F0F3FF',
      100: '#E0E7FF',
      200: '#C7D2FE',
      300: '#A5B4FC',
      400: '#818CF8',
      500: '#1E2A78',  // Couleur principale
      600: '#1A2563',
      700: '#15204E',
      800: '#111B39',
      900: '#0D1629',
    },
    secondary: {
      50: '#FFFEF7',   // Or presque blanc
      100: '#FFFBEB',  // Or très pâle
      200: '#FEF3C7',  // Or pâle
      300: '#FDE68A',  // Or clair
      400: '#FACC15',  // Or moyen
      500: '#D4AF37',  // Or classique (couleur principale)
      600: '#CA8A04',  // Or intense
      700: '#A16207',  // Or foncé
      800: '#854D0E',  // Or très foncé
      900: '#713F12',  // Or profond
    },
  },
  
  // Gradients dorés pour les effets premium
  gradients: {
    goldenHorizontal: ['#FFD700', '#D4AF37', '#B8941F'],
    goldenVertical: ['#F4E17B', '#D4AF37', '#A16207'],
    goldenRadial: ['#FACC15', '#D4AF37', '#854D0E'],
    premiumGold: ['#FFE55C', '#D4AF37', '#8B7355'],
    subtleGold: ['#FAF7E8', '#F4E17B', '#E6D08A'],
  },
} as const;

// TYPOGRAPHIE RESPONSIVE
export const TYPOGRAPHY = {
  // Tailles de police responsive
  fontSize: {
    xs: { mobile: 10, tablet: 11, desktop: 12 },
    sm: { mobile: 12, tablet: 13, desktop: 14 },
    base: { mobile: 14, tablet: 15, desktop: 16 },
    md: { mobile: 16, tablet: 17, desktop: 18 },
    lg: { mobile: 18, tablet: 20, desktop: 22 },
    xl: { mobile: 20, tablet: 22, desktop: 24 },
    '2xl': { mobile: 24, tablet: 28, desktop: 32 },
    '3xl': { mobile: 28, tablet: 32, desktop: 36 },
    '4xl': { mobile: 32, tablet: 36, desktop: 42 },
  },
  
  // Poids de police
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  
  // Hauteurs de ligne
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
    loose: 1.8,
  },
} as const;

export const getLineHeight = (
  fontSizeToken: keyof typeof TYPOGRAPHY.fontSize,
  screenType: 'mobile' | 'tablet' | 'desktop',
  factor: keyof typeof TYPOGRAPHY.lineHeight = 'normal'
) => {
  const size = getResponsiveValue(TYPOGRAPHY.fontSize[fontSizeToken], screenType);
  return Math.round(size * TYPOGRAPHY.lineHeight[factor]);
};

// ESPACEMENTS RESPONSIVE
export const SPACING = {
  // Espacements de base (en points)
  xs: { mobile: 4, tablet: 6, desktop: 8 },
  sm: { mobile: 8, tablet: 10, desktop: 12 },
  md: { mobile: 12, tablet: 16, desktop: 20 },
  lg: { mobile: 16, tablet: 20, desktop: 24 },
  xl: { mobile: 20, tablet: 24, desktop: 32 },
  '2xl': { mobile: 24, tablet: 32, desktop: 40 },
  '3xl': { mobile: 32, tablet: 40, desktop: 48 },
  '4xl': { mobile: 40, tablet: 48, desktop: 64 },
  
  // Espacements spéciaux
  container: { mobile: 16, tablet: 24, desktop: 32 },
  section: { mobile: 16, tablet: 20, desktop: 24 },
  card: { mobile: 12, tablet: 16, desktop: 20 },
} as const;

// RAYONS DE BORDURE
export const BORDER_RADIUS = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 20,
  full: 9999,
} as const;

// OMBRES AVEC EFFETS DORÉS
export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: COLORS.shadow.light,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.shadow.default,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: COLORS.shadow.default,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  xl: {
    shadowColor: COLORS.shadow.medium,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  card: {
    shadowColor: COLORS.shadow.default,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  button: {
    shadowColor: COLORS.shadow.medium,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  // Ombres dorées pour les éléments premium
  goldenGlow: {
    shadowColor: COLORS.shadow.golden,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  premiumCard: {
    shadowColor: COLORS.variants.secondary[300],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

// HOOK POUR DÉTECTER LE TYPE D'ÉCRAN
export const useScreenType = () => {
  const { width } = useWindowDimensions();
  
  if (width >= BREAKPOINTS.desktop) return 'desktop' as const;
  if (width >= BREAKPOINTS.tablet) return 'tablet' as const;
  return 'mobile' as const;
};

// HELPER POUR OBTENIR UNE VALEUR RESPONSIVE
export const getResponsiveValue = <T>(
  values: { mobile: T; tablet: T; desktop: T },
  screenType: 'mobile' | 'tablet' | 'desktop'
): T => {
  return values[screenType];
};

// HELPER POUR CRÉER DES STYLES RESPONSIVE
export const createResponsiveStyles = (screenType: 'mobile' | 'tablet' | 'desktop') => {
  const isTabletOrLarger = screenType !== 'mobile';
  const isDesktop = screenType === 'desktop';
  
  return {
    // Helpers de layout
    container: {
      padding: getResponsiveValue(SPACING.container, screenType),
      maxWidth: isDesktop ? 1200 : undefined,
      alignSelf: 'center' as const,
      width: '100%',
    },
    
    flexRow: {
      flexDirection: 'row' as const,
    },
    
    flexColumn: {
      flexDirection: 'column' as const,
    },
    
    // Layout en grille responsive
    grid: {
      flexDirection: isTabletOrLarger ? 'row' as const : 'column' as const,
      gap: getResponsiveValue(SPACING.lg, screenType),
    },
    
    gridItem: {
      flex: 1,
    },
    
    // Cartes avec options dorées
    card: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.card, screenType),
      ...SHADOWS.card,
    },
    
    premiumCard: {
      backgroundColor: COLORS.goldenSurface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.card, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      ...SHADOWS.premiumCard,
    },
    
    // Boutons avec variantes dorées
    button: {
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      minHeight: isTabletOrLarger ? 48 : 44,
    },
    
    buttonPrimary: {
      backgroundColor: COLORS.primary,
    },
    
    buttonSecondary: {
      backgroundColor: COLORS.secondary,
    },
    
    buttonGolden: {
      backgroundColor: COLORS.variants.secondary[500],
      ...SHADOWS.goldenGlow,
    },
    
    buttonGoldenOutline: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: COLORS.variants.secondary[500],
    },
    
    // Textes avec options dorées
    textTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      lineHeight: getLineHeight('2xl', screenType, 'tight'),
    },
    
    textTitleGolden: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.golden,
      lineHeight: getLineHeight('2xl', screenType, 'tight'),
    },
    
    textSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      lineHeight: getLineHeight('lg', screenType, 'normal'),
    },
    
    textBody: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: COLORS.text.secondary,
      lineHeight: getLineHeight('base', screenType, 'normal'),
    },
    
    textCaption: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: COLORS.text.light,
      lineHeight: getLineHeight('sm', screenType, 'normal'),
    },
    
    textGoldenAccent: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.golden,
      lineHeight: getLineHeight('base', screenType, 'normal'),
    },
    
    // États
    disabled: {
      opacity: 0.5,
    },
    
    loading: {
      opacity: 0.7,
    },
    
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

// COMPOSANTS DE STYLES PRÉDÉFINIS AVEC EFFETS DORÉS
export const COMPONENT_STYLES = {
  // Styles pour StatusBadge avec variantes dorées
  statusBadge: {
    base: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BORDER_RADIUS.full,
      alignSelf: 'flex-start' as const,
    },
    pending: {
      backgroundColor: COLORS.variants.secondary[100],
      borderColor: COLORS.variants.secondary[300],
      borderWidth: 1,
    },
    confirmed: {
      backgroundColor: COLORS.variants.primary[100],
      borderColor: COLORS.variants.primary[300],
      borderWidth: 1,
    },
    preparing: {
      backgroundColor: COLORS.variants.secondary[200],
      borderColor: COLORS.variants.secondary[500],
      borderWidth: 1,
    },
    ready: {
      backgroundColor: '#D1FAE5',
      borderColor: COLORS.success,
      borderWidth: 1,
    },
    served: {
      backgroundColor: '#D1FAE5',
      borderColor: COLORS.success,
      borderWidth: 1,
    },
    cancelled: {
      backgroundColor: '#FEE2E2',
      borderColor: COLORS.error,
      borderWidth: 1,
    },
    premium: {
      backgroundColor: COLORS.variants.secondary[100],
      borderColor: COLORS.variants.secondary[500],
      borderWidth: 2,
      ...SHADOWS.goldenGlow,
    },
  },
  
  // Styles pour les formulaires avec touches dorées
  input: {
    base: {
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: COLORS.text.primary,
    },
    focused: {
      borderColor: COLORS.primary,
      borderWidth: 2,
    },
    error: {
      borderColor: COLORS.error,
      borderWidth: 2,
    },
    golden: {
      borderColor: COLORS.border.golden,
      backgroundColor: COLORS.goldenSurface,
      borderWidth: 1,
    },
    goldenFocused: {
      borderColor: COLORS.variants.secondary[500],
      borderWidth: 2,
      ...SHADOWS.goldenGlow,
    },
  },
  
  // Styles pour la timeline avec accents dorés
  timeline: {
    icon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: COLORS.border.default,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    iconCompleted: {
      backgroundColor: COLORS.success,
    },
    iconGolden: {
      backgroundColor: COLORS.variants.secondary[500],
      ...SHADOWS.goldenGlow,
    },
    line: {
      width: 2,
      height: 20,
      backgroundColor: COLORS.border.default,
      marginTop: 4,
    },
    lineCompleted: {
      backgroundColor: COLORS.success,
    },
    lineGolden: {
      backgroundColor: COLORS.variants.secondary[400],
    },
  },
} as const;

// HELPER POUR LES ANIMATIONS
export const ANIMATIONS = {
  duration: {
    fast: 150,
    normal: 250,
    slow: 400,
  },
  easing: {
    easeInOut: 'ease-in-out',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
  },
} as const;

// CONSTANTES POUR LES COMPOSANTS
export const COMPONENT_CONSTANTS = {
  // Tailles minimales pour les éléments tactiles
  minTouchTarget: 44,
  
  // Hauteurs standard
  headerHeight: { mobile: 56, tablet: 64, desktop: 72 },
  tabBarHeight: { mobile: 49, tablet: 56, desktop: 64 },
  buttonHeight: { mobile: 44, tablet: 48, desktop: 52 },
  
  // Largeurs maximales
  maxContentWidth: 1200,
  maxCardWidth: 400,
  
  // Z-index
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
} as const;

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