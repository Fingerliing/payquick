export const COLORS = {
  // Couleurs principales imposées par la charte
  primary: '#1E2A78',       // Bleu principal
  secondary: '#D4AF37',     // Or classique (remplace le jaune)
  
  // Variantes des couleurs principales
  primary_light: '#3B4695',
  primary_dark: '#12194D',
  primary_pale: '#E8EBF7',
  primary_accent: '#2938A3',
  
  // Gamme dorée complète
  secondary_light: '#F4E17B',     // Or clair lumineux
  secondary_dark: '#B8941F',      // Or foncé profond
  secondary_pale: '#FAF7E8',      // Or très pâle, presque crème
  secondary_accent: '#FFD700',    // Or pur éclatant
  
  // Couleurs système
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  
  // Couleurs neutres adaptatives
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  
  // Surfaces avec touches dorées
  surface: {
    primary: '#FFFFFF',
    secondary: '#F9FAFB',
    elevated: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.5)',
    golden: '#FFFCF0',        // Surface avec teinte dorée subtile
  },
  
  // Bordures
  border: {
    light: '#E5E7EB',
    medium: '#D1D5DB',
    dark: '#9CA3AF',
    golden: '#E6D08A',        // Bordure dorée subtile
  },
  
  // Texte avec options dorées
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    white: '#FFFFFF',
    inverse: '#FFFFFF',
    golden: '#B8941F',        // Texte doré pour les accents
  },
  
  // États d'interaction avec touches dorées
  states: {
    hover: 'rgba(30, 42, 120, 0.08)',
    pressed: 'rgba(30, 42, 120, 0.12)',
    focus: 'rgba(30, 42, 120, 0.12)',
    disabled: '#F3F4F6',
    goldenHover: 'rgba(212, 175, 55, 0.12)',    // Hover doré
    goldenPressed: 'rgba(212, 175, 55, 0.20)',  // Press doré
  },
  
  // Couleurs contextuelles
  background: '#F9FAFB',
  card: '#FFFFFF',
  notification: '#EF4444',
  
  // Palette dorée étendue pour effets sophistiqués
  golden: {
    50: '#FFFEF7',      // Or presque blanc
    100: '#FFFBEB',     // Or très pâle
    200: '#FEF3C7',     // Or pâle
    300: '#FDE68A',     // Or clair
    400: '#FACC15',     // Or moyen
    500: '#D4AF37',     // Or classique (couleur principale)
    600: '#CA8A04',     // Or intense
    700: '#A16207',     // Or foncé
    800: '#854D0E',     // Or très foncé
    900: '#713F12',     // Or profond
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