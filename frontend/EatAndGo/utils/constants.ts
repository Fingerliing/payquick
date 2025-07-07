export const APP_CONFIG = {
  VERSION: '1.0.0',
  API_TIMEOUT: 10000,
  PAGINATION_LIMIT: 20,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  SUPPORTED_IMAGE_FORMATS: ['jpg', 'jpeg', 'png', 'webp'],
  MIN_PASSWORD_LENGTH: 8,
  MAX_CART_ITEMS: 50,
};

export const COLORS = {
  primary: '#3B82F6',
  secondary: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#8B5CF6',
  
  gray: {
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
  
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  title: 28,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
};

export const ORDER_STATUS_COLORS = {
  pending: '#F59E0B',
  confirmed: '#3B82F6',
  preparing: '#8B5CF6',
  ready: '#10B981',
  out_for_delivery: '#059669',
  delivered: '#10B981',
  cancelled: '#EF4444',
  refunded: '#6B7280',
};

export const CUISINE_TYPES = [
  'Française',
  'Italienne',
  'Japonaise',
  'Chinoise',
  'Indienne',
  'Mexicaine',
  'Américaine',
  'Libanaise',
  'Thaïlandaise',
  'Grecque',
  'Espagnole',
  'Marocaine',
  'Vietnamienne',
  'Coréenne',
  'Turque',
  'Autre',
];

export const ALLERGENS = [
  'Gluten',
  'Crustacés',
  'Œufs',
  'Poisson',
  'Arachides',
  'Soja',
  'Lait',
  'Fruits à coque',
  'Céleri',
  'Moutarde',
  'Graines de sésame',
  'Anhydride sulfureux et sulfites',
  'Lupin',
  'Mollusques',
];

export const PAYMENT_METHODS = [
  { id: 'credit_card', name: 'Carte de crédit', icon: 'card-outline' },
  { id: 'debit_card', name: 'Carte de débit', icon: 'card-outline' },
  { id: 'paypal', name: 'PayPal', icon: 'logo-paypal' },
  { id: 'apple_pay', name: 'Apple Pay', icon: 'logo-apple' },
  { id: 'google_pay', name: 'Google Pay', icon: 'logo-google' },
  { id: 'cash', name: 'Espèces', icon: 'cash-outline' },
];