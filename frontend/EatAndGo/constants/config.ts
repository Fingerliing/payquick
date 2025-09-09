import Constants from 'expo-constants';

// Configuration de l'API
export const API_BASE_URL = __DEV__ 
  ? process.env.EXPO_PUBLIC_API_BASE_URL || 'http://192.168.1.163:8000' // Développement
  : Constants.expoConfig?.extra?.apiUrl || 'https://your-production-api.com'; // Production

if (!API_BASE_URL) {
  console.warn('⚠️ API_BASE_URL est undefined ! Vérifie ton .env et que EXPO_PUBLIC_API_BASE_URL est bien défini.');
}

export const API_VERSION = 'v1';
export const API_TIMEOUT = 10000; // 10 secondes

// Configuration Stripe (si utilisé pour les paiements)
export const STRIPE_PUBLISHABLE_KEY = __DEV__
  ? Constants.expoConfig?.extra?.stripePublishableKeyDev
  : Constants.expoConfig?.extra?.stripePublishableKeyProd;

// Configuration générale de l'app
export const APP_CONFIG = {
  name: 'Eat&Go',
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

// Configuration des couleurs (peut être utilisé dans les composants UI)
export const COLORS = {
  primary: '#3B82F6',
  secondary: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#F9FAFB',
  surface: '#FFFFFF',
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    light: '#9CA3AF',
  },
};

// app.config.js (configuration Expo)
export default {
  expo: {
    name: 'Eat&Go',
    slug: 'eatandgo',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    assetBundlePatterns: [
      '**/*'
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.yourcompany.eatandgo',
      buildNumber: '1.0.0'
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFFFFF'
      },
      package: 'com.yourcompany.eatandgo',
      versionCode: 1
    },
    web: {
      favicon: './assets/favicon.png'
    },
    extra: {
      // Variables d'environnement accessibles via Constants.expoConfig.extra
      apiUrl: process.env.API_URL || 'http://localhost:8000',
      stripePublishableKeyDev: process.env.STRIPE_PUBLISHABLE_KEY_DEV,
      stripePublishableKeyProd: process.env.STRIPE_PUBLISHABLE_KEY_PROD,
    },
  },
};