export const APP_CONFIG = {
  name: 'EatQuickeR',
  version: '1.1.1',
  api: {
    baseUrl: process.env.EXPO_PUBLIC_API_URL ||
      (__DEV__ ? 'http://localhost:8000' : 'https://api.eatquicker.fr'),
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
    email: "Format d'email invalide",
    passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères',
    passwordMismatch: 'Les mots de passe ne correspondent pas',
    phoneInvalid: 'Format de téléphone invalide',
    nameTooShort: 'Le nom doit contenir au moins 2 caractères',
  },
};