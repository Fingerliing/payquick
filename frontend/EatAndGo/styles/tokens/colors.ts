export const COLORS = {
  // Couleurs principales imposées par la charte
  primary: '#1E2A78',       // Bleu principal
  secondary: '#FFC845',     // Jaune/Orange
  
  // Variantes des couleurs principales
  primary_light: '#3B4695',
  primary_dark: '#12194D',
  primary_pale: '#E8EBF7',
  primary_accent: '#2938A3',
  
  secondary_light: '#FFD666',
  secondary_dark: '#E6B73A',
  secondary_pale: '#FFF8E1',
  secondary_accent: '#FF9500',
  
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
  
  // Surfaces
  surface: {
    primary: '#FFFFFF',
    secondary: '#F9FAFB',
    elevated: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  
  // Bordures
  border: {
    light: '#E5E7EB',
    medium: '#D1D5DB',
    dark: '#9CA3AF',
  },
  
  // Texte
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    tertiary: '#9CA3AF',
    white: '#FFFFFF',
    inverse: '#FFFFFF',
  },
  
  // États d'interaction
  states: {
    hover: 'rgba(30, 42, 120, 0.08)',
    pressed: 'rgba(30, 42, 120, 0.12)',
    focus: 'rgba(30, 42, 120, 0.12)',
    disabled: '#F3F4F6',
  },
  
  // Couleurs contextuelles
  background: '#F9FAFB',
  card: '#FFFFFF',
  notification: '#EF4444',
} as const;