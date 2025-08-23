export const COLORS = {
  // ✅ COULEURS PRINCIPALES IMPOSÉES
  primary: '#1E2A78',      // Bleu professionnel foncé
  secondary: '#FFC845',    // Jaune/Orange vibrant
  
  // ✅ PALETTE DÉRIVÉE RESPONSIVE
  primary_light: '#3B4A9A',     // Pour interactions
  primary_lighter: '#5D6BBF',   // Pour hover states
  primary_pale: '#E8EAFF',      // Backgrounds légers
  
  secondary_dark: '#E6B33D',    // Pour hover/focus
  secondary_light: '#FFD76B',   // États actifs
  secondary_pale: '#FFF4D6',    // Backgrounds d'accent
  
  // ✅ SYSTÈME DE COULEURS FONCTIONNELLES
  success: '#10B981',
  warning: '#F59E0B', 
  error: '#EF4444',
  info: '#3B82F6',
  
  // ✅ COULEURS NEUTRES MODERNES
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
  
  // ✅ COULEURS SÉMANTIQUES
  text: {
    primary: '#111827',
    secondary: '#4B5563', 
    tertiary: '#6B7280',
    light: '#9CA3AF',
    white: '#FFFFFF',
  },
  
  background: {
    primary: '#FFFFFF',
    secondary: '#F9FAFB',
    tertiary: '#F3F4F6',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  
  surface: {
    primary: '#FFFFFF',
    secondary: '#F9FAFB', 
    elevated: '#FFFFFF',
    disabled: '#F3F4F6',
  },
  
  border: {
    light: '#E5E7EB',
    medium: '#D1D5DB', 
    strong: '#9CA3AF',
    focus: '#3B82F6',
  },
  
  // ✅ COULEURS SPÉCIFIQUES MÉTIER
  status: {
    pending: '#F59E0B',      // Orange pour en attente
    confirmed: '#3B82F6',    // Bleu pour confirmé  
    preparing: '#8B5CF6',    // Violet pour en préparation
    ready: '#10B981',        // Vert pour prêt
    served: '#6B7280',       // Gris pour servi
    cancelled: '#EF4444',    // Rouge pour annulé
  },
  
  payment: {
    paid: '#10B981',
    pending: '#F59E0B', 
    failed: '#EF4444',
  },
} as const;