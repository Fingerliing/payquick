import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/config';
import { router } from 'expo-router';

export interface ClientProfile {
  id: number;
  user: number;
  phone: string;
  type: 'client';
  has_validated_profile?: boolean;
}

export interface RestaurateurProfile {
  id: number;
  user: number;
  siret: string;
  is_validated: boolean;
  is_active: boolean;
  created_at: string;
  stripe_verified: boolean;
  stripe_account_id?: string;
  type: 'restaurateur';
  stripe_onboarding_completed?: boolean;
  stripe_account_created?: string | null;
  has_validated_profile?: boolean;
  nom?: string;
  telephone?: string;
}

export interface Restaurant {
  id: number;
  name: string;
  description: string;
  address: string;
  siret: string;
  total_orders: number;
  pending_orders: number;
  menus_count: number;
  can_receive_orders?: boolean;
  owner_stripe_validated?: boolean;
  is_stripe_active?: boolean;
}

export interface UserPermissions {
  is_staff: boolean;
  is_superuser: boolean;
  can_create_restaurant: boolean;
  can_manage_orders: boolean;
  groups: string[];
  user_permissions: string[];
}

export interface UserRoles {
  is_client: boolean;
  is_restaurateur: boolean;
  is_staff: boolean;
  is_admin: boolean;
  has_validated_profile: boolean;
}

export interface UserStats {
  // Pour les restaurateurs
  total_restaurants?: number;
  total_orders?: number;
  pending_orders?: number;
  active_restaurants?: number;
  stripe_validated?: boolean;
  stripe_onboarding_completed?: boolean;
  
  // Pour les clients  
  favorite_restaurants?: any[];
}

export interface RecentOrder {
  id: number;
  restaurant_name: string;
  restaurant_id?: number;
  table: string;
  status: 'pending' | 'in_progress' | 'served';
  is_paid: boolean;
  created_at: string;
  items_count: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  role: 'client' | 'restaurateur';
  profile: ClientProfile | RestaurateurProfile;
  restaurants: Restaurant[];
  stats: UserStats;
  permissions: UserPermissions;
  roles: UserRoles;
  recent_orders: RecentOrder[];
  is_authenticated: boolean;
}

export interface AuthResponse {
  user?: User;
  access: string;
  refresh: string;
  message?: string;
}

export interface RegisterData {
  username: string; // Email
  password: string;
  nom: string;
  role: 'client' | 'restaurateur';
  telephone?: string;
  siret?: string;
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
    logout: `${API_URL}/auth/logout/`,
    user: `${API_URL}/auth/me/`,
    refresh: `${API_URL}/auth/refresh/`,
  },
};

// Clés pour AsyncStorage
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

// Classe ApiClient améliorée
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

    const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
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
        const error = new Error(this.getErrorMessage(response.status, errorData));
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

  async logout(refreshToken: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(API_ENDPOINTS.auth.logout, {
      method: 'POST',
      body: JSON.stringify({ refresh: refreshToken }),
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

// Contexte d'authentification amélioré
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

  const navigateByRole = () => {
    if (user?.role === 'client') {
      router.replace('/(client)');
    } else if (user?.role === 'restaurateur') {
      router.replace('/(restaurant)');
    }
  };

  // Effacer les erreurs
  const clearError = () => setLastError(null);

  // Gestion des erreurs globales
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
      errorMessage = 'Votre session a expiré, veuillez vous reconnecter';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    setLastError(errorMessage);
    return errorMessage;
  };

  // Fonctions existantes avec gestion d'erreurs améliorée
  const clearAuthData = async () => {
    try {
      console.log('🗑️ Suppression des données auth');
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER_DATA,
      ]);
      setUser(null);
      setLastError(null);
      console.log('✅ Données auth supprimées');
    } catch (error) {
      console.error('❌ Erreur lors de la suppression des données d\'authentification:', error);
    }
  };

  const refreshTokens = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) {
        throw new Error('Aucun token de rafraîchissement disponible');
      }

      const response = await apiClient.refreshToken(refreshToken);
      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access);
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
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
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
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
      const accessToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

      if (userData && accessToken) {
        console.log('🔑 Données utilisateur trouvées dans le cache');
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        console.log('✅ Authentification restaurée depuis le cache');

        // Rediriger l'utilisateur vers la bonne section selon son rôle
        if (parsedUser.role === 'client') {
          router.replace('/(client)');
        } else if (parsedUser.role === 'restaurateur') {
          router.replace('/(restaurant)');
        }
        
        // Essayer de rafraîchir les données, mais ne pas échouer si 403
        try {
          await refreshUser();
        } catch (error: any) {
          if (error.code === 403) {
            console.log('⚠️ Accès limité - profil non validé, mais connexion maintenue');
          } else {
            console.warn('⚠️ Impossible de rafraîchir les données depuis le serveur:', error);
          }
        }
      } else {
        console.log('🔓 Aucune authentification trouvée');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la vérification de l\'authentification:', error);
      await clearAuthData();
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

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.ACCESS_TOKEN, response.access],
        [STORAGE_KEYS.REFRESH_TOKEN, response.refresh],
      ]);
      console.log('💾 Tokens enregistrés');

      const currentUser = await apiClient.getCurrentUser();
      await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
      setUser(currentUser);
      navigateByRole();

      console.log('✅ Inscription réussie avec données utilisateur complètes');
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

      await AsyncStorage.multiSet([
        [STORAGE_KEYS.ACCESS_TOKEN, response.access],
        [STORAGE_KEYS.REFRESH_TOKEN, response.refresh],
      ]);
      console.log('💾 Tokens enregistrés');

      const currentUser = await apiClient.getCurrentUser();
      if (currentUser) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(currentUser));
        setUser(currentUser);
        console.log('👤 Utilisateur récupéré depuis /auth/me/');
        navigateByRole();
      }

      console.log('✅ Connexion réussie avec données utilisateur complètes');
    } catch (error: any) {
      console.error('❌ Erreur lors de la connexion:', error);
      handleError(error, 'login');
      await clearAuthData();
      throw new Error(lastError || 'Erreur lors de la connexion');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      console.log('🚪 Déconnexion...');
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (refreshToken) {
        try {
          await apiClient.logout(refreshToken);
          console.log('✅ Déconnexion côté serveur réussie');
        } catch (error) {
          console.error('⚠️ Erreur lors de la déconnexion côté serveur:', error);
        }
      }
    } catch (error) {
      console.error('❌ Erreur lors de la déconnexion:', error);
    } finally {
      await clearAuthData();
      console.log('✅ Déconnexion locale terminée');
    }
  };

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

  // Utilitaires pour accéder aux données avec gestion d'erreurs
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

  // Méthodes pour charger des données avec gestion 403
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

// Hook avec gestion d'erreurs
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}

// Hook pour afficher les erreurs
export function useAuthError() {
  const { lastError, clearError } = useAuth();
  
  useEffect(() => {
    if (lastError) {
      console.log('🔔 Erreur d\'authentification:', lastError);
      // Vous pouvez ajouter ici une logique pour afficher un toast/alert
    }
  }, [lastError]);
  
  return { lastError, clearError };
}

//Hooks Stripe
export function useStripe() {
  const { 
    createStripeAccount, 
    getStripeAccountStatus, 
    createStripeOnboardingLink,
    user,
    isRestaurateur,
    hasValidatedProfile 
  } = useAuth();
  
  const getStripeValidationStatus = () => {
    if (!user || !isRestaurateur) return false;
    
    // Vérifier dans user.roles d'abord
    if (user.roles?.has_validated_profile !== undefined) {
      return user.roles.has_validated_profile;
    }
    
    // Puis dans le profil restaurateur
    if (user.profile?.type === 'restaurateur') {
      const profile = user.profile as RestaurateurProfile;
      return profile.stripe_verified || profile.has_validated_profile || false;
    }
    
    return false;
  };

  const getStripeAccountId = () => {
    if (!user || !isRestaurateur) return null;
    
    if (user.profile?.type === 'restaurateur') {
      const profile = user.profile as RestaurateurProfile;
      return profile.stripe_account_id || null;
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


// Hooks existants...
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