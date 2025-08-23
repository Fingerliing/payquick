export const APP_CONFIG = {
  name: 'Eat&Go',
  version: '1.0.0',
  api: {
    baseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
    timeout: 10000,
  },
  stripe: {
    publishableKeyDev: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_DEV,
    publishableKeyProd: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY_PROD,
  },
};

// Règles de validation
export const VALIDATION_RULES = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  phone: {
    pattern: /^(\+33|0)[1-9](\d{8})$/,
  },
  name: {
    minLength: 2,
    maxLength: 50,
  },
  password: {
    minLength: 8,
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

// Configuration Expo mise à jour
export const EXPO_CONFIG = {
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
      backgroundColor: '#1E2A78' // Couleur principale de la marque
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.yourcompany.eatandgo',
      buildNumber: '1.0.0'
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1E2A78' // Couleur principale de la marque
      },
      package: 'com.yourcompany.eatandgo',
      versionCode: 1
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      'expo-router',
      '@stripe/stripe-react-native',
    ],
    extra: {
      apiUrl: process.env.API_URL || 'http://localhost:8000',
      stripePublishableKeyDev: process.env.STRIPE_PUBLISHABLE_KEY_DEV,
      stripePublishableKeyProd: process.env.STRIPE_PUBLISHABLE_KEY_PROD,
    },
  },
};