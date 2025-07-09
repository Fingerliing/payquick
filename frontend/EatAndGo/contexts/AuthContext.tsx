import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/config';

// Types correspondant au backend Django
export interface User {
  id: number;
  username: string; // Email qui sert de username
  first_name: string; // Le champ "nom" du backend
  email?: string;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
  // Profils selon le rôle
  profile?: ClientProfile | RestaurateurProfile;
}

export interface ClientProfile {
  id: number;
  user: number;
  phone: string;
  // Autres champs spécifiques aux clients
}

export interface RestaurateurProfile {
  id: number;
  user: number;
  siret: string;
  // Autres champs spécifiques aux restaurateurs
}

export interface AuthResponse {
  user: User;
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

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  userRole: 'client' | 'restaurateur' | null;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
}

// Configuration API
const API_VERSION = 'v1';
const cleanBase = API_BASE_URL.replace(/\/+$/, '');
console.log('API_BASE_URL =', API_BASE_URL);
const API_URL = `${cleanBase}/api/${API_VERSION}`;
console.log('Envoi inscription vers:', API_URL );

const API_ENDPOINTS = {
  auth: {
    register: `${API_URL}/auth/register/`,
    login: `${API_URL}/auth/login/`,
    logout: `${API_URL}/auth/logout/`,
    user: `${API_URL}/auth/user/`,
    refresh: `${API_URL}/auth/refresh/`,
  },
};

// Clés pour AsyncStorage
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
};

// Classe pour gérer les appels API
class ApiClient {
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

    // Ajouter le token d'authentification si disponible
    const token = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    try {
      const response = await fetch(endpoint, config);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { message: `HTTP error! status: ${response.status}` };
        }
        
        // Si le token a expiré, essayer de le rafraîchir
        if (response.status === 401 && token) {
          throw new Error('TOKEN_EXPIRED');
        }
        
        // Créer une erreur avec les détails du backend
        const error = new Error(errorData.message || `HTTP error! status: ${response.status}`);
        (error as any).response = { status: response.status, data: errorData };
        throw error;
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    console.log('📡 POST vers :', API_ENDPOINTS.auth.register);
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

  async getCurrentUser(): Promise<{ user: User }> {
    return this.request<{ user: User }>(API_ENDPOINTS.auth.user);
  }

  async refreshToken(refreshToken: string): Promise<{ access: string }> {
    return this.request<{ access: string }>(API_ENDPOINTS.auth.refresh, {
      method: 'POST',
      body: JSON.stringify({ refresh: refreshToken }),
    });
  }
}

const apiClient = new ApiClient();

// Contexte d'authentification
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;
  
  // Déterminer le rôle de l'utilisateur
  const userRole: 'client' | 'restaurateur' | null = React.useMemo(() => {
    if (!user?.profile) return null;
    
    // Déterminer le rôle en fonction du type de profil
    if ('phone' in user.profile) return 'client';
    if ('siret' in user.profile) return 'restaurateur';
    
    return null;
  }, [user]);

  // Sauvegarder les tokens et les données utilisateur
  const saveAuthData = async (authResponse: AuthResponse) => {
    try {
      const access = authResponse.access;
      const refresh = authResponse.refresh;
      const user = authResponse.user;
  
      if (!user) {
        console.warn('⚠️ authResponse.user est undefined, stockage annulé pour user_data.');
      }
  
      const itemsToStore = [
        [STORAGE_KEYS.ACCESS_TOKEN, access],
        [STORAGE_KEYS.REFRESH_TOKEN, refresh],
      ];
  
      if (user) {
        itemsToStore.push([STORAGE_KEYS.USER_DATA, JSON.stringify(user)]);
      }
  
      await AsyncStorage.multiSet(itemsToStore as [string, string][]);
      if (user) setUser(user);
    } catch (error) {
      console.error("❌ Erreur lors de la sauvegarde des données d'authentification:", error);
      throw new Error('Erreur de sauvegarde des données');
    }
  };

  // Effacer les données d'authentification
  const clearAuthData = async () => {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER_DATA,
      ]);
      setUser(null);
    } catch (error) {
      console.error('Erreur lors de la suppression des données d\'authentification:', error);
    }
  };

  // Rafraîchir les tokens
  const refreshTokens = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) {
        throw new Error('Aucun token de rafraîchissement disponible');
      }

      const response = await apiClient.refreshToken(refreshToken);
      await AsyncStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, response.access);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du token:', error);
      await clearAuthData();
      throw error;
    }
  };

  // Vérifier l'authentification au chargement de l'app
  const checkAuth = async () => {
    try {
      const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
      const accessToken = await AsyncStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

      if (userData && accessToken) {
        // Vérifier si le token est toujours valide
        try {
          const response = await apiClient.getCurrentUser();
          setUser(response.user);
        } catch (error: any) {
          if (error.message === 'TOKEN_EXPIRED') {
            // Essayer de rafraîchir le token
            try {
              await refreshTokens();
              const response = await apiClient.getCurrentUser();
              setUser(response.user);
            } catch (refreshError) {
              await clearAuthData();
            }
          } else {
            await clearAuthData();
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'authentification:', error);
      await clearAuthData();
    } finally {
      setIsLoading(false);
    }
  };

  // Inscription
  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true);
      const response = await apiClient.register(data);
      await saveAuthData(response);
    } catch (error: any) {
      console.error('Erreur lors de l\'inscription:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Connexion
  const login = async (data: LoginData) => {
    try {
      setIsLoading(true);
      const response = await apiClient.login(data);
      await saveAuthData(response);
    } catch (error: any) {
      console.error('Erreur lors de la connexion:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Déconnexion
  const logout = async () => {
    try {
      const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (refreshToken) {
        try {
          await apiClient.logout(refreshToken);
        } catch (error) {
          console.error('Erreur lors de la déconnexion côté serveur:', error);
          // Continuer la déconnexion locale même si l'API échoue
        }
      }
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      await clearAuthData();
    }
  };

  // Vérifier l'authentification au montage du composant
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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook pour utiliser le contexte d'authentification
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}

// Export des API endpoints pour une utilisation externe si nécessaire
export { API_ENDPOINTS, apiClient };