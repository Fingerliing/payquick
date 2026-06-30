import Constants from 'expo-constants';

// ──────────────────────────────────────────────────────────────────────────
// Résolution de l'hôte de l'API en dev
// ──────────────────────────────────────────────────────────────────────────
const DEV_API_PORT = 8000;
const DEV_WS_PORT = 8000;

// Hôte de Metro, ex: "192.168.43.12" depuis "192.168.43.12:8081"
const metroHost = Constants.expoConfig?.hostUri?.split(':')[0];

function resolveDevHost(): string | null {
  // hostUri d'abord → suit le réseau automatiquement
  if (metroHost) return metroHost;
  // sinon, hôte explicite extrait de l'URL d'env (si fournie)
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) {
    try {
      return new URL(fromEnv).hostname;
    } catch {
      return null;
    }
  }
  return null;
}

const devHost = resolveDevHost();

if (__DEV__ && !devHost) {
  console.warn(
    '⚠️ Impossible de dériver l\'hôte de Metro ni de lire EXPO_PUBLIC_API_BASE_URL — ' +
    'fallback sur 192.168.1.163. Vérifie ta connexion Metro.'
  );
}

// Configuration de l'API
export const API_BASE_URL = __DEV__
  ? `http://${devHost ?? '192.168.1.163'}:${DEV_API_PORT}`
  : Constants.expoConfig?.extra?.apiUrl || 'https://api.eatquicker.fr';

// URL WebSocket — même hôte que l'API en dev
export const WS_BASE_URL = __DEV__
  ? `ws://${devHost ?? '192.168.1.163'}:${DEV_WS_PORT}`
  : 'wss://ws.eatquicker.fr';

if (!API_BASE_URL) {
  console.warn('⚠️ API_BASE_URL est undefined ! Vérifie ta connexion Metro et ton .env.');
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