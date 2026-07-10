import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import secureStorage from '@/utils/secureStorage';
import { API_BASE_URL } from '../constants/config';
import { router } from 'expo-router';
import {
  hasPendingConsentSync,
  markConsentSynced,
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} from '@/utils/legalNotifications';
import { legalService } from '@/services/legalService';
import { notificationService } from '@/services/notificationService';
// Importé uniquement pour piloter le refresh proactif (anti-expiration en plein
// service). Le client local fetch-based (défini plus bas) reste utilisé pour les
// appels HTTP de ce contexte. Renommé pour éviter la collision de nom.
import { apiClient as sessionMonitor } from '@/services/api';
import {
  signInWithGoogle,
  signOutFromGoogle,
  GoogleSignInError,
} from '@/services/googleAuthService';
import {
  signInWithApple,
  AppleSignInError,
} from '@/services/appleAuthService';
import {
  User,
  RestaurateurProfile,
  Restaurant,
  UserStats,
  RegisterData,
} from '@/types/user';

export interface AuthResponse {
  user?: User;
  access: string;
  refresh: string;
  message?: string;
}

export interface LoginData {
  username: string; // Email
  password: string;
}

// Configuration API
const API_VERSION = 'v1';
const API_URL = `${API_BASE_URL}/api/${API_VERSION}`;

const API_ENDPOINTS = {
  auth: {
    register: `${API_URL}/auth/register/`,
    login: `${API_URL}/auth/login/`,
    google: `${API_URL}/auth/google/`,
    apple: `${API_URL}/auth/apple/`,
    user: `${API_URL}/auth/me/`,
    refresh: `${API_URL}/auth/refresh/`,
    profile: `${API_URL}/auth/profile/`,
  },
};

// Clés de stockage sécurisé (expo-secure-store via secureStorage)
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  userRole: 'client' | 'restaurateur' | null;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  googleLogin: () => Promise<void>;
  appleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (firstName: string) => Promise<void>;
  
  // Utilitaires spécifiques
  isClient: boolean;
  isRestaurateur: boolean;
  hasValidatedProfile: boolean;
  canCreateRestaurant: boolean;
  canManageOrders: boolean;

  // Helpers de navigation
  navigateByRole: () => void;
  
  // Données spécifiques
  getUserRestaurants: () => Restaurant[];
  getUserStats: () => UserStats | null;
  getPendingOrdersCount: () => number;

  //Stripe
  createStripeAccount: () => Promise<{ account_id: string; onboarding_url: string; message: string }>;
  getStripeAccountStatus: () => Promise<any>;
  createStripeOnboardingLink: () => Promise<{ onboarding_url: string }>;
  
  // Gestion des erreurs
  lastError: string | null;
  clearError: () => void;
}

class ApiClient {
  async createStripeAccount(): Promise<{ account_id: string; onboarding_url: string; message: string }> {
    return this.request(`${API_URL}/stripe/create-account/`, {
      method: 'POST',
    });
  }

  async getStripeAccountStatus(): Promise<any> {
    return this.request(`${API_URL}/stripe/account-status/`, {
      method: 'GET',
    });
  }

  async createStripeOnboardingLink(): Promise<{ onboarding_url: string }> {
    return this.request(`${API_URL}/stripe/onboarding-link/`, {
      method: 'POST',
    });
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };
  
    // Ne pas injecter le token sur les endpoints publics
    const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/google', '/auth/apple'];
    const isPublicEndpoint = PUBLIC_ENDPOINTS.some(ep => endpoint.includes(ep));

    let token: string | null = null;
  
    if (!isPublicEndpoint) {
      const token = await secureStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }
    }

    try {
      console.log(`🔄 API Request: ${endpoint}`, { 
        method: config.method || 'GET', 
        hasAuth: !!token,
        endpoint: endpoint
      });
      
      const response = await fetch(endpoint, config);
      
      console.log(`📡 API Response: ${response.status} for ${endpoint}`);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: `HTTP error! status: ${response.status}` };
        }
        
        console.error(`❌ API Error ${response.status}:`, errorData);
        
        // Créer une erreur structurée
        const method = String(config.method || 'GET').toUpperCase();
        const isLoginCall = endpoint === API_ENDPOINTS.auth.login && method === 'POST';
        
        let message = this.getErrorMessage(response.status, errorData);
        
        // Si appel login → garder "Identifiants invalides." (ou message serveur)
        if (response.status === 401 && isLoginCall) {
          message = errorData?.detail || errorData?.message || 'Identifiants invalides.';
        }
        
        const error = new Error(message);
        (error as any).code = response.status;
        (error as any).response = { status: response.status, data: errorData };
        throw error;
      }

      const data = await response.json();
      console.log('✅ API Success:', { endpoint, dataKeys: Object.keys(data) });
      return data;
    } catch (error) {
      console.error('💥 API request failed:', error);
      throw error;
    }
  }

  private getErrorMessage(status: number, errorData: any): string {
    switch (status) {
      case 400:
        return errorData.message || 'Données invalides';
      case 401:
        return 'Session expirée, veuillez vous reconnecter';
      case 403:
        return 'Accès refusé - permissions insuffisantes';
      case 404:
        return 'Ressource non trouvée';
      case 500:
        return 'Erreur serveur, veuillez réessayer';
      default:
        return errorData.message || `Erreur ${status}`;
    }
  }

  // Méthode pour gérer les erreurs 403 spécifiquement
  async requestWithFallback<T>(
    endpoint: string,
    options: RequestInit = {},
    fallbackValue: T | null = null
  ): Promise<T | null> {
    try {
      return await this.request<T>(endpoint, options);
    } catch (error: any) {
      if (error.code === 403) {
        console.log('🚫 Accès refusé - utilisation de la valeur de fallback');
        return fallbackValue;
      }
      throw error;
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    return this.request<AuthResponse>(API_ENDPOINTS.auth.register, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: LoginData): Promise<AuthResponse> {
    return this.request<AuthResponse>(API_ENDPOINTS.auth.login, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async googleLogin(idToken: string): Promise<AuthResponse & { is_new_user?: boolean }> {
    return this.request<AuthResponse & { is_new_user?: boolean }>(
      API_ENDPOINTS.auth.google,
      {
        method: 'POST',
        body: JSON.stringify({ id_token: idToken }),
      }
    );
  }

  async appleLogin(
    identityToken: string,
    givenName?: string | null,
  ): Promise<AuthResponse & { is_new_user?: boolean }> {
    return this.request<AuthResponse & { is_new_user?: boolean }>(
      API_ENDPOINTS.auth.apple,
      {
        method: 'POST',
        body: JSON.stringify({
          identity_token: identityToken,
          given_name: givenName ?? '',
        }),
      }
    );
  }

  async getCurrentUser(): Promise<User> {
    return this.request<User>(API_ENDPOINTS.auth.user);
  }

  async updateProfile(firstName: string): Promise<{ first_name: string }> {
    return this.request<{ first_name: string }>(API_ENDPOINTS.auth.profile, {
      method: 'PATCH',
      body: JSON.stringify({ first_name: firstName }),
    });
  }

  async refreshToken(refreshToken: string): Promise<{ access: string }> {
    return this.request<{ access: string }>(API_ENDPOINTS.auth.refresh, {
      method: 'POST',
      body: JSON.stringify({ refresh: refreshToken }),
    });
  }

  // Nouvelles méthodes pour gérer les ressources avec permissions
  async getUserRestaurants(): Promise<Restaurant[] | null> {
    return this.requestWithFallback<Restaurant[]>(
      `${API_URL}/restaurants/`,
      { method: 'GET' },
      []
    );
  }

  async getUserOrders(): Promise<any[] | null> {
    return this.requestWithFallback<any[]>(
      `${API_URL}/orders/`,
      { method: 'GET' },
      []
    );
  }
}

const apiClient = new ApiClient();

// Contexte d'authentification avec navigation améliorée
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const isAuthenticated = !!user?.is_authenticated;
  const userRole = user?.role || null;
  
  const isClient = user?.roles?.is_client || false;
  const isRestaurateur = user?.roles?.is_restaurateur || false;
  const hasValidatedProfile = user?.roles?.has_validated_profile || false;
  const canCreateRestaurant = user?.permissions?.can_create_restaurant || false;
  const canManageOrders = user?.permissions?.can_manage_orders || false;

  // ── Navigation sécurisée (poll-and-retry jusqu'au mount du navigator) ─
  // Workaround pour l'erreur "Attempted to navigate before mounting the
  // Root Layout component". Au démarrage, l'AuthProvider peut tenter une
  // navigation avant que <Stack>/<Tabs>/<Slot> du root layout ne soit
  // monté (race condition).
  //
  // Stratégie : on tente directement le router.replace. Si ça throw avec
  // "not ready", on stocke l'intention et on démarre un polling court qui
  // re-tente toutes les 50ms jusqu'à succès (ou abandon après 5s).
  //
  // On ne se fie PAS à useRootNavigationState : selon la structure des
  // providers et le moment du render, son `.key` peut rester undefined
  // alors que le navigator est réellement prêt. Le try/catch sur le
  // comportement réel du router est la seule source de vérité fiable.
  //
  // Si plusieurs safeNavigate sont appelés avant le ready, seul le dernier
  // l'emporte (la dernière intention de navigation gagne).
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushAttemptsRef = useRef(0);

  const MAX_FLUSH_ATTEMPTS = 100; // 100 × 50ms = 5s avant abandon
  const FLUSH_INTERVAL_MS = 50;

  const stopFlushPoll = () => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
    flushAttemptsRef.current = 0;
  };

  const startFlushPoll = () => {
    if (flushIntervalRef.current) return; // déjà en cours
    flushAttemptsRef.current = 0;

    flushIntervalRef.current = setInterval(() => {
      const fn = pendingNavigationRef.current;
      if (!fn) {
        stopFlushPoll();
        return;
      }

      flushAttemptsRef.current += 1;
      if (flushAttemptsRef.current > MAX_FLUSH_ATTEMPTS) {
        console.warn(
          `⏰ Navigation différée abandonnée après ${MAX_FLUSH_ATTEMPTS} tentatives (5s) — root navigator jamais prêt`,
        );
        pendingNavigationRef.current = null;
        stopFlushPoll();
        return;
      }

      try {
        fn();
        pendingNavigationRef.current = null;
        stopFlushPoll();
        console.log(
          `🧭 Navigation différée exécutée après ${flushAttemptsRef.current} tentative(s)`,
        );
      } catch {
        // pas encore prêt, on retente au prochain tick
      }
    }, FLUSH_INTERVAL_MS);
  };

  const safeNavigate = (fn: () => void) => {
    try {
      fn();
    } catch (error: any) {
      const msg = String(error?.message || '');
      if (msg.includes('before mounting') || msg.includes('Root Layout')) {
        console.log('⏳ Root navigator pas prêt, navigation différée (polling)');
        pendingNavigationRef.current = fn;
        startFlushPoll();
      } else {
        console.error('❌ Erreur de navigation:', error);
      }
    }
  };

  // Cleanup au démontage : stoppe le polling si le provider est démonté
  useEffect(() => {
    return () => stopFlushPoll();
  }, []);

  // Navigation améliorée avec délai et vérifications
  const navigateByRole = (u?: User) => {
    const target = u ?? user;
    if (!target) {
      console.log("🚫 Pas d'utilisateur pour la navigation");
      return;
    }
  
    console.log('🧭 Navigation par rôle:', { role: target.role, isAuthenticated: target.is_authenticated });
    try {
      if (target.role === 'client') {
        console.log('👤 Redirection vers client');
        safeNavigate(() => router.replace('/(client)'));
      } else if (target.role === 'restaurateur') {
        console.log('🍽️ Redirection vers restaurateur');
        safeNavigate(() => router.replace('/(restaurant)'));
      } else {
        console.log('❓ Rôle inconnu:', target.role);
      }
    } catch (error) {
      console.error('❌ Erreur de navigation:', error);
      safeNavigate(() => router.replace('/(restaurant)'));
    }
  };

  // Effacer les erreurs
  const clearError = () => setLastError(null);

  // ── Synchro consentement légal en attente ────────────────────────────────
  const syncPendingLegalConsent = async () => {
    try {
      const pending = await hasPendingConsentSync();
      if (!pending) return;

      console.log('📋 Consentement légal en attente — synchro backend...');
      await legalService.recordConsent({
        terms_version: CURRENT_TERMS_VERSION,
        privacy_version: CURRENT_PRIVACY_VERSION,
        consent_date: new Date().toISOString(),
      });
      await markConsentSynced();
      console.log('✅ Consentement légal synchronisé après connexion');
    } catch (error) {
      // Non bloquant : on re-tentera au prochain login
      console.warn('⚠️ Synchro consentement échouée (sera re-tentée):', error);
    }
  };

  // Gestion des erreurs globales (inchangée)
  const handleError = (error: any, context: string) => {
    console.error(`❌ Erreur dans ${context}:`, error);
    
    let errorMessage = 'Une erreur inattendue s\'est produite';
    
    if (error.code === 403) {
      if (userRole === 'restaurateur' && !hasValidatedProfile) {
        errorMessage = 'Votre profil restaurateur doit être validé pour accéder à cette fonctionnalité';
      } else {
        errorMessage = 'Vous n\'avez pas les permissions nécessaires';
      }
    } else if (error.code === 401) {
      if (context === 'login') {
        // garder le message du backend si présent
        errorMessage = error?.response?.data?.detail || error?.response?.data?.message || 'Identifiants invalides.';
      } else {
        errorMessage = 'Votre session a expiré, veuillez vous reconnecter';
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    setLastError(errorMessage);
    return errorMessage;
  };

  // Fonctions de gestion auth avec navigation améliorée
  const clearAuthData = async () => {
    try {
      console.log('🗑️ Suppression des données auth');
      // Stop monitoring avant de purger pour éviter des refresh dans le vide
      sessionMonitor.stopSessionMonitoring();
      await secureStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      await secureStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      await secureStorage.removeItem(STORAGE_KEYS.USER_DATA);
      setUser(null);
      setLastError(null);
      console.log('✅ Données auth supprimées');
    } catch (error) {
      console.error('❌ Erreur lors de la suppression des données d\'authentification:', error);
    }
  };

  const refreshTokens = async () => {
    try {
      const refreshToken = await secureStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) {
        throw new Error('Aucun token de rafraîchissement disponible');
      }

      const response = await apiClient.refreshToken(refreshToken);
      await secureStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access);
      // SimpleJWT avec ROTATE_REFRESH_TOKENS=True renvoie un nouveau refresh.
      // Si on ne le persiste pas, l'ancien sera blacklisté à la prochaine
      // rotation → erreurs aléatoires.
      const newRefresh = (response as any)?.refresh;
      if (newRefresh) {
        await secureStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, newRefresh);
      }
      console.log('🔄 Token rafraîchi avec succès');
      clearError();
    } catch (error) {
      console.error('❌ Erreur lors du rafraîchissement du token:', error);
      handleError(error, 'refreshTokens');
      await clearAuthData();
      throw error;
    }
  };

  const refreshUser = async (): Promise<void> => {
    try {
      console.log('🔄 Rafraîchissement des données utilisateur...');
      const currentUser = await apiClient.getCurrentUser();
      if (currentUser) {
        await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
        setUser(currentUser);
        console.log('✅ Données utilisateur rafraîchies');
        clearError();
      }
    } catch (error) {
      console.error('❌ Erreur lors du rafraîchissement des données utilisateur:', error);
      handleError(error, 'refreshUser');
      throw error;
    }
  };

  const updateProfile = async (firstName: string): Promise<void> => {
    try {
      clearError();
      console.log('✏️ Mise à jour du nom...');

      const response = await apiClient.updateProfile(firstName);

      setUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, first_name: response.first_name };
        secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(updated));
        return updated;
      });

      console.log('✅ Nom mis à jour avec succès');
    } catch (error: any) {
      console.error('❌ Erreur lors de la mise à jour du nom:', error);
      handleError(error, 'updateProfile');
      throw new Error(lastError || 'Erreur lors de la mise à jour du nom');
    }
  };

  const checkAuth = async () => {
    try {
      console.log('🔍 Vérification de l\'authentification...');
      const userData = await secureStorage.getItem(STORAGE_KEYS.USER_DATA);
      const accessToken = await secureStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  
      if (userData && accessToken) {
        console.log('🔑 Données utilisateur trouvées dans le cache');
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        console.log('✅ Authentification restaurée depuis le cache');

        // Démarrer la surveillance de session (refresh proactif anti-expiration).
        // Si le token est déjà expiré, sera rafraîchi immédiatement.
        await sessionMonitor.startSessionMonitoring();

        // Synchro consentement légal en attente (fire-and-forget)
        syncPendingLegalConsent();

        // Redirection immédiate après setUser avec vérification du rôle
        setTimeout(() => {
          if (parsedUser.role) {
            console.log(`🎯 Navigation pour utilisateur ${parsedUser.role}`);
            navigateByRole(parsedUser);
          } else {
            console.log('⚠️ Utilisateur sans rôle défini, redirection vers login');
            safeNavigate(() => router.replace('/(auth)/login'));
          }
        }, 200);
        
        // Essayer de rafraîchir les données, mais ne pas échouer si 403
        try {
          await refreshUser();
          // Re-naviguer après refresh si le rôle a changé
          const currentUser = await secureStorage.getItem(STORAGE_KEYS.USER_DATA);
          if (currentUser) {
            const refreshedUser = JSON.parse(currentUser);
            if (refreshedUser.role !== parsedUser.role) {
              console.log('🔄 Rôle mis à jour après refresh, re-navigation');
              setTimeout(() => navigateByRole(refreshedUser), 100);
            }
          }
        } catch (error: any) {
          if (error.code === 403) {
            console.log('⚠️ Accès limité - profil non validé, mais connexion maintenue');
          } else {
            console.warn('⚠️ Impossible de rafraîchir les données depuis le serveur:', error);
          }
        }
      } else {
        console.log('🔓 Aucune authentification trouvée');
        // S'assurer qu'on est sur la page de login
        safeNavigate(() => router.replace('/(auth)/login'));
      }
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de l\'authentification:', error);
      await clearAuthData();
      safeNavigate(() => router.replace('/(auth)/login'));
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true);
      clearError();
      console.log('📝 Tentative d\'inscription...');

      const response = await apiClient.register(data);

      await secureStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access);
      await secureStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refresh);
      console.log('💾 Tokens enregistrés');

      // Démarrer la surveillance de session (refresh proactif anti-expiration)
      await sessionMonitor.startSessionMonitoring();

      const currentUser = await apiClient.getCurrentUser();
      await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
      setUser(currentUser);
      
      console.log('✅ Inscription réussie avec données utilisateur complètes');
      
      // Synchro consentement légal si accepté avant inscription
      await syncPendingLegalConsent();

      // Navigation après inscription
      setTimeout(() => navigateByRole(), 300);

    } catch (error: any) {
      console.error('❌ Erreur lors de l\'inscription:', error);
      handleError(error, 'register');
      await clearAuthData();
      throw new Error(lastError || 'Erreur lors de l\'inscription');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (data: LoginData) => {
    try {
      setIsLoading(true);
      clearError();
      console.log('🔐 Tentative de connexion...');

      const response = await apiClient.login(data);

      await secureStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access);
      await secureStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refresh);
      console.log('💾 Tokens enregistrés');

      // Démarrer la surveillance de session (refresh proactif anti-expiration)
      await sessionMonitor.startSessionMonitoring();

      const currentUser = await apiClient.getCurrentUser();
      if (currentUser) {
        await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
        setUser(currentUser);
        console.log('👤 Utilisateur récupéré depuis /auth/me/', {
          role: currentUser.role,
          isAuthenticated: currentUser.is_authenticated
        });
        
        console.log('✅ Connexion réussie avec données utilisateur complètes');
        
        // Synchro consentement légal si accepté avant connexion
        await syncPendingLegalConsent();

        // Navigation après connexion
        navigateByRole(currentUser);
      }

    } catch (error: any) {
      console.error('❌ Erreur lors de la connexion:', error);
      handleError(error, 'login');
      throw new Error(lastError || 'Erreur lors de la connexion');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Connexion via Google Sign-In ─────────────────────────────────────────
  // 1. Le SDK Google ouvre la modal native et retourne un idToken signé.
  // 2. On envoie cet idToken à /auth/google/, qui le vérifie auprès de Google
  //    et retourne nos JWT EatQuickeR (créant le compte si nécessaire).
  // 3. Suite du flow identique à login() : surveillance de session, /auth/me/,
  //    syncho consentement, navigation par rôle.
  const googleLogin = async () => {
    try {
      setIsLoading(true);
      clearError();
      console.log('🔐 Tentative de connexion via Google...');

      // 1. SDK Google → idToken
      const { idToken } = await signInWithGoogle();
      console.log('✅ idToken Google obtenu');

      // 2. Backend → JWT EatQuickeR
      const response = await apiClient.googleLogin(idToken);

      await secureStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access);
      await secureStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refresh);
      console.log('💾 Tokens EatQuickeR enregistrés', {
        isNewUser: response.is_new_user,
      });

      // 3. Démarrer la surveillance de session (refresh proactif anti-expiration)
      await sessionMonitor.startSessionMonitoring();

      const currentUser = await apiClient.getCurrentUser();
      if (currentUser) {
        await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
        setUser(currentUser);
        console.log('👤 Utilisateur récupéré (login Google)', {
          role: currentUser.role,
          isAuthenticated: currentUser.is_authenticated,
        });

        console.log('✅ Connexion Google réussie');

        // Synchro consentement légal si accepté avant connexion
        await syncPendingLegalConsent();

        // Navigation après connexion
        navigateByRole(currentUser);
      }
    } catch (error: any) {
      // Annulation utilisateur : on remonte tel quel pour que le composant
      // décide de ne pas afficher d'alerte. On ne nettoie pas les données
      // d'auth puisqu'aucune session n'a été ouverte.
      if (error instanceof GoogleSignInError && error.code === 'CANCELLED') {
        console.log('ℹ️ Connexion Google annulée par l\'utilisateur');
        throw error;
      }

      console.error('❌ Erreur lors du login Google:', error);
      handleError(error, 'login');
      await clearAuthData();
      throw new Error(lastError || 'Erreur lors de la connexion Google');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Connexion via Sign in with Apple ─────────────────────────────────────
  // 1. Le SDK Apple ouvre la feuille native et retourne un identityToken
  //    signé (+ givenName, uniquement au tout premier sign-in — jamais dans
  //    le token, d'où sa transmission séparée au backend).
  // 2. On envoie ces données à /auth/apple/, qui vérifie le token auprès des
  //    clés publiques Apple et retourne nos JWT EatQuickeR (créant le compte
  //    client si nécessaire — email relais privé accepté).
  // 3. Suite du flow identique à googleLogin() : surveillance de session,
  //    /auth/me/, synchro consentement, navigation par rôle.
  const appleLogin = async () => {
    try {
      setIsLoading(true);
      clearError();
      console.log('🔐 Tentative de connexion via Apple...');

      // 1. SDK Apple → identityToken (+ givenName au premier sign-in)
      const { identityToken, givenName } = await signInWithApple();
      console.log('✅ identityToken Apple obtenu');

      // 2. Backend → JWT EatQuickeR
      const response = await apiClient.appleLogin(identityToken, givenName);

      await secureStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access);
      await secureStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, response.refresh);
      console.log('💾 Tokens EatQuickeR enregistrés', {
        isNewUser: response.is_new_user,
      });

      // 3. Démarrer la surveillance de session (refresh proactif anti-expiration)
      await sessionMonitor.startSessionMonitoring();

      const currentUser = await apiClient.getCurrentUser();
      if (currentUser) {
        await secureStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
        setUser(currentUser);
        console.log('👤 Utilisateur récupéré (login Apple)', {
          role: currentUser.role,
          isAuthenticated: currentUser.is_authenticated,
        });

        console.log('✅ Connexion Apple réussie');

        // Synchro consentement légal si accepté avant connexion
        await syncPendingLegalConsent();

        // Navigation après connexion
        navigateByRole(currentUser);
      }
    } catch (error: any) {
      // Annulation utilisateur : on remonte tel quel pour que le composant
      // décide de ne pas afficher d'alerte. On ne nettoie pas les données
      // d'auth puisqu'aucune session n'a été ouverte.
      if (error instanceof AppleSignInError && error.code === 'CANCELLED') {
        console.log('ℹ️ Connexion Apple annulée par l\'utilisateur');
        throw error;
      }

      console.error('❌ Erreur lors du login Apple:', error);
      handleError(error, 'login');
      await clearAuthData();
      throw new Error(lastError || 'Erreur lors de la connexion Apple');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      console.log('🚪 Déconnexion...');

      // Best-effort : déconnexion du SDK Google (no-op si pas connecté via Google).
      // Avant de purger les tokens locaux pour que `getCurrentUser()` côté SDK
      // puisse encore vérifier l'état de connexion Google.
      await signOutFromGoogle();

      // Arrêter la surveillance de session avant de purger les tokens
      sessionMonitor.stopSessionMonitoring();

      // Désinscrire le push token PENDANT qu'on a encore le JWT
      try {
        await notificationService.unregisterTokenFromServer();
      } catch (e) {
        console.warn('⚠️ Échec désinscription push token:', e);
      }
      
      // Nettoyer les données locales
      await secureStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      await secureStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      await secureStorage.removeItem(STORAGE_KEYS.USER_DATA);
      
      setUser(null);
      setLastError(null);
      console.log('✅ Déconnexion locale réussie');
      
      safeNavigate(() => router.replace('/(auth)/login'));
    } catch (error) {
      console.error('❌ Erreur lors de la déconnexion:', error);
      // Même en cas d'erreur, essayer de nettoyer et rediriger
      setUser(null);
      safeNavigate(() => router.replace('/(auth)/login'));
    }
  };
  

  // Stripe methods (inchangées)
  const createStripeAccount = async () => {
    try {
      clearError();
      console.log('💳 Création du compte Stripe...');
      const result = await apiClient.createStripeAccount();
      console.log('✅ Compte Stripe créé');
      
      // Rafraîchir les données utilisateur après création
      try {
        await refreshUser();
      } catch (error: any) {
        if (error.code !== 403) {
          console.warn('⚠️ Impossible de rafraîchir après création Stripe:', error);
        }
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Erreur création compte Stripe:', error);
      handleError(error, 'createStripeAccount');
      throw error;
    }
  };

  const getStripeAccountStatus = async () => {
    try {
      clearError();
      console.log('🔍 Vérification statut Stripe...');
      const result = await apiClient.getStripeAccountStatus();
      console.log('✅ Statut Stripe récupéré');
      return result;
    } catch (error: any) {
      console.error('❌ Erreur statut Stripe:', error);
      handleError(error, 'getStripeAccountStatus');
      throw error;
    }
  };

  const createStripeOnboardingLink = async () => {
    try {
      clearError();
      console.log('🔗 Création lien onboarding Stripe...');
      const result = await apiClient.createStripeOnboardingLink();
      console.log('✅ Lien onboarding Stripe créé');
      return result;
    } catch (error: any) {
      console.error('❌ Erreur lien onboarding Stripe:', error);
      handleError(error, 'createStripeOnboardingLink');
      throw error;
    }
  };

  // Utilitaires pour accéder aux données (inchangées)
  const getUserRestaurants = (): Restaurant[] => {
    return user?.restaurants || [];
  };

  const getUserStats = (): UserStats | null => {
    return user?.stats || null;
  };

  const getPendingOrdersCount = (): number => {
    if (isRestaurateur && user?.stats) {
      return (user.stats as UserStats).pending_orders || 0;
    }
    return 0;
  };

  // Méthodes pour charger des données avec gestion 403 (inchangée)
  const loadRestaurantsWithFallback = async (): Promise<Restaurant[]> => {
    try {
      const restaurants = await apiClient.getUserRestaurants();
      return restaurants || getUserRestaurants();
    } catch (error) {
      handleError(error, 'loadRestaurants');
      return getUserRestaurants();
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    userRole,
    login,
    register,
    googleLogin,
    appleLogin,
    logout,
    refreshTokens,
    refreshUser,
    updateProfile,
    
    // Utilitaires
    isClient,
    isRestaurateur,
    hasValidatedProfile,
    canCreateRestaurant,
    canManageOrders,
    
    // Données spécifiques
    getUserRestaurants,
    getUserStats,
    getPendingOrdersCount,

    // Helpers de navigation
    navigateByRole,
    
    // Gestion des erreurs
    lastError,
    clearError,

    //Stripe
    createStripeAccount,
    getStripeAccountStatus,
    createStripeOnboardingLink,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hooks (inchangés)
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}

export function useAuthError() {
  const { lastError, clearError } = useAuth();
  
  useEffect(() => {
    if (lastError) {
      console.log('🔔 Erreur d\'authentification:', lastError);
    }
  }, [lastError]);
  
  return { lastError, clearError };
}

export function useStripe() {
  const { 
    createStripeAccount, 
    getStripeAccountStatus, 
    createStripeOnboardingLink,
    user,
    isRestaurateur,
    hasValidatedProfile 
  } = useAuth();
  
  // Helper pour accéder au profil restaurateur de manière sécurisée
  const getRestaurateurProfile = (): RestaurateurProfile | null => {
    if (!user || !isRestaurateur) return null;
    if (user.profile?.type === 'restaurateur') {
      return user.profile as RestaurateurProfile;
    }
    return null;
  };
  
  const getStripeValidationStatus = () => {
    if (!user || !isRestaurateur) return false;
    
    if (user.roles?.has_validated_profile !== undefined) {
      return user.roles.has_validated_profile;
    }
    
    const restaurateurProfile = getRestaurateurProfile();
    if (restaurateurProfile) {
      return restaurateurProfile.stripe_verified || restaurateurProfile.has_validated_profile || false;
    }
    
    return false;
  };

  const getStripeAccountId = () => {
    if (!user || !isRestaurateur) return null;
    
    const restaurateurProfile = getRestaurateurProfile();
    if (restaurateurProfile) {
      return restaurateurProfile.stripe_account_id || null;
    }
    
    return null;
  };

  return {
    createStripeAccount,
    getStripeAccountStatus,
    createStripeOnboardingLink,
    isStripeValidated: getStripeValidationStatus(),
    stripeAccountId: getStripeAccountId(),
    canConfigureStripe: isRestaurateur,
  };
}

export function useUserRestaurants() {
  const { getUserRestaurants } = useAuth();
  return getUserRestaurants();
}

export function useUserStats() {
  const { getUserStats } = useAuth();
  return getUserStats();
}

export function useRestaurateurStats(): UserStats | null {
  const { user, isRestaurateur } = useAuth();
  if (isRestaurateur && user?.stats) {
    return user.stats as UserStats;
  }
  return null;
}

export function usePendingOrders() {
  const { getPendingOrdersCount } = useAuth();
  return getPendingOrdersCount();
}

export { API_ENDPOINTS, apiClient };