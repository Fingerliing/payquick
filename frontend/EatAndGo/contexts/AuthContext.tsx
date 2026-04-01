import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
    user: `${API_URL}/auth/me/`,
    refresh: `${API_URL}/auth/refresh/`,
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
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  refreshUser: () => Promise<void>;
  
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
    const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];
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

  async getCurrentUser(): Promise<User> {
    return this.request<User>(API_ENDPOINTS.auth.user);
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
        router.replace('/(client)');
      } else if (target.role === 'restaurateur') {
        console.log('🍽️ Redirection vers restaurateur');
        router.replace('/(restaurant)');
      } else {
        console.log('❓ Rôle inconnu:', target.role);
      }
    } catch (error) {
      console.error('❌ Erreur de navigation:', error);
      setTimeout(() => router.replace('/(restaurant)'), 100);
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
  
        // Synchro consentement légal en attente (fire-and-forget)
        syncPendingLegalConsent();

        // Redirection immédiate après setUser avec vérification du rôle
        setTimeout(() => {
          if (parsedUser.role) {
            console.log(`🎯 Navigation pour utilisateur ${parsedUser.role}`);
            navigateByRole(parsedUser);
          } else {
            console.log('⚠️ Utilisateur sans rôle défini, redirection vers login');
            router.replace('/(auth)/login');
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
        router.replace('/(auth)/login');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de l\'authentification:', error);
      await clearAuthData();
      router.replace('/(auth)/login');
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

  const logout = async () => {
    try {
      console.log('🚪 Déconnexion...');
      
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
      
      router.replace('/(auth)/login');
    } catch (error) {
      console.error('❌ Erreur lors de la déconnexion:', error);
      // Même en cas d'erreur, essayer de nettoyer et rediriger
      setUser(null);
      router.replace('/(auth)/login');
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
    logout,
    refreshTokens,
    refreshUser,
    
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