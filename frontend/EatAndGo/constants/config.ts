import Constants from 'expo-constants';

// Configuration de l'API
export const API_BASE_URL = __DEV__ 
  ? process.env.EXPO_PUBLIC_API_BASE_URL!
  : Constants.expoConfig?.extra?.apiUrl || 'https://api.eatquicker.fr';

// URL WebSocket
export const WS_BASE_URL = __DEV__
  ? process.env.EXPO_PUBLIC_WS_BASE_URL!
  : 'wss://ws.eatquicker.fr';

if (!API_BASE_URL) {
  console.warn('⚠️ API_BASE_URL est undefined ! Vérifie ton .env et que EXPO_PUBLIC_API_BASE_URL est bien défini.');
}

export const API_VERSION = 'v1';
export const API_TIMEOUT = 10000; // 10 secondes

// Configuration Stripe
export const STRIPE_PUBLISHABLE_KEY = __DEV__
  ? process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV
  : process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_PROD;

// Configuration générale de l'app
export const APP_CONFIG = {
  name: 'EatQuickeR',
  version: Constants.expoConfig?.version || '1.0.0',
  buildNumber: Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1',
};

// Validation des champs
export const VALIDATION_RULES = {
  password: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false,
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  phone: {
    // Pattern pour les numéros français
    pattern: /^(\+33|0)[1-9](\d{8})$/,
  },
  name: {
    minLength: 2,
    maxLength: 50,
  },
};

// Messages d'erreur
export const ERROR_MESSAGES = {
  network: 'Erreur de connexion réseau',
  timeout: 'La requête a expiré',
  serverError: 'Erreur serveur, veuillez réessayer',
  unauthorized: 'Session expirée, veuillez vous reconnecter',
  validation: {
    required: 'Ce champ est obligatoire',
    email: 'Format d\'email invalide',
    passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères',
    passwordMismatch: 'Les mots de passe ne correspondent pas',
    phoneInvalid: 'Format de téléphone invalide',
    nameTooShort: 'Le nom doit contenir au moins 2 caractères',
  },
};