import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import secureStorage from '@/utils/secureStorage';
import { router } from 'expo-router';
import { ApiError, ApiResponse } from '../types/common';

// Clés de stockage (doit correspondre à AuthContext)
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
};

/**
 * ApiClient
 * - Gère la baseURL (EXPO_PUBLIC_API_URL ou localhost)
 * - Ajoute automatiquement le Bearer token si présent dans le stockage sécurisé
 * - Normalise les chemins pour éviter les doubles slashs
 * - Gère automatiquement le refresh token et la redirection vers login en cas d'expiration
 * - Expose des helpers génériques: get/post/put/patch/delete/options
 */
class ApiClient {
  private client: AxiosInstance;
  private baseURL: string;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  }> = [];

  constructor() {
    this.baseURL = process.env.EXPO_PUBLIC_API_URL ||
      (__DEV__ ? 'http://localhost:8000' : (() => { throw new Error('[EatQuickeR] EXPO_PUBLIC_API_URL non défini en production'); })());

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Intercepteur requêtes: injecte le token s'il existe
    this.client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      
      // Pour FormData, supprimer le Content-Type afin qu'Axios le génère
      // automatiquement avec le boundary correct (multipart/form-data; boundary=...)
      if (config.data instanceof FormData) {
        delete (config.headers as Record<string, string>)['Content-Type'];
      }

      // Ne pas injecter le token sur les endpoints publics
      const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];
      const isPublicEndpoint = PUBLIC_ENDPOINTS.some(ep => config.url?.includes(ep));

      if (!isPublicEndpoint) {
        const token =
          (await secureStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)) ||
          (await secureStorage.getItem('auth_token')) ||
          (await secureStorage.getItem('token')) ||
          undefined;

        if (token) {
          config.headers = config.headers ?? {};
          (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
        }
      }

      if (config.url) {
        config.url = this.buildUrl(config.url);
      }
      return config;
    });

    // Intercepteur réponses: gère les erreurs 401 avec refresh token automatique
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Si c'est une erreur 401 et qu'on n'a pas déjà essayé de refresh
        if (error.response?.status === 401 && !originalRequest._retry) {
          // Ne pas intercepter les requêtes de login ou de refresh
          const isAuthEndpoint = originalRequest.url?.includes('/auth/login') || 
                                  originalRequest.url?.includes('/auth/refresh') ||
                                  originalRequest.url?.includes('/auth/register');
          
          if (isAuthEndpoint) {
            return Promise.reject(this.handleError(error));
          }

          // Si on est déjà en train de rafraîchir, mettre la requête en file d'attente
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then((token) => {
                originalRequest.headers['Authorization'] = `Bearer ${token}`;
                return this.client(originalRequest);
              })
              .catch((err) => Promise.reject(err));
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const newToken = await this.attemptTokenRefresh();
            
            if (newToken) {
              // Succès du refresh - réessayer la requête originale
              this.processQueue(null, newToken);
              originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              return this.client(originalRequest);
            } else {
              // Échec du refresh - rediriger vers login
              this.processQueue(new Error('Token refresh failed'), null);
              await this.handleSessionExpired();
              return Promise.reject(this.handleError(error));
            }
          } catch (refreshError) {
            this.processQueue(refreshError as Error, null);
            await this.handleSessionExpired();
            return Promise.reject(this.handleError(error));
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Tente de rafraîchir le token d'accès
   */
  private async attemptTokenRefresh(): Promise<string | null> {
    try {
      const refreshToken = await secureStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      
      if (!refreshToken) {
        console.log('🔑 Pas de refresh token disponible');
        return null;
      }

      console.log('🔄 Tentative de rafraîchissement du token...');
      
      // Appel direct sans passer par l'intercepteur
      const response = await axios.post(
        `${this.baseURL}/api/v1/auth/refresh/`,
        { refresh: refreshToken },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );

      const newAccessToken = response.data?.access;
      
      if (newAccessToken) {
        await secureStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, newAccessToken);
        console.log('✅ Token rafraîchi avec succès');
        return newAccessToken;
      }

      return null;
    } catch (error: any) {
      console.error('❌ Échec du rafraîchissement du token:', error?.response?.status || error.message);
      return null;
    }
  }

  /**
   * Traite la file d'attente des requêtes en attente
   */
  private processQueue(error: Error | null, token: string | null): void {
    this.failedQueue.forEach((promise) => {
      if (error) {
        promise.reject(error);
      } else {
        promise.resolve(token);
      }
    });
    this.failedQueue = [];
  }

  /**
   * Gère l'expiration de session - nettoie les données et redirige vers login
   */
  private async handleSessionExpired(): Promise<void> {
    console.log('🚪 Session expirée - redirection vers la page de connexion...');
    
    try {
      // Nettoyer toutes les données d'authentification
      await secureStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      await secureStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      await secureStorage.removeItem(STORAGE_KEYS.USER_DATA);
      console.log('🗑️ Données d\'authentification supprimées');
    } catch (cleanupError) {
      console.error('⚠️ Erreur lors du nettoyage des données:', cleanupError);
    }

    // Rediriger vers la page de connexion
    // Utiliser setTimeout pour éviter les problèmes de navigation pendant le rendu
    setTimeout(() => {
      try {
        router.replace({ pathname: '/(auth)/login', params: { reason: 'session_expired' } });
        console.log('✅ Redirection vers login effectuée');
      } catch (navError) {
        console.error('❌ Erreur de navigation:', navError);
        // Fallback: essayer une navigation alternative
        try {
          router.push({ pathname: '/(auth)/login', params: { reason: 'session_expired' } });
        } catch (fallbackError) {
          console.error('❌ Erreur navigation fallback:', fallbackError);
        }
      }
    }, 100);
  }

  /** Évite les doubles slashs et gère les URLs absolues */
  private buildUrl(path: string): string {
    if (!path) return this.baseURL;
    if (/^https?:\/\//i.test(path)) return path; // déjà absolue
    const slash = this.baseURL.endsWith('/') ? '' : '/';
    return `${this.baseURL}${slash}${path.replace(/^\//, '')}`;
  }

  /** Force a numeric error code */
  private coerceErrorCode(input: any, fallback: number): number {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string') {
      const n = Number.parseInt(input, 10);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }

  /** Extract field errors into a Record<string, string[]> if possible */
  private extractDetails(data: any): Record<string, string[]> | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const details: Record<string, string[]> = {};
    const src = (data as any).errors ?? (data as any).detail ?? data;
    const keys = Object.keys(src);
    let found = false;
    for (const k of keys) {
      const v: any = (src as any)[k];
      if (Array.isArray(v)) {
        const arr = v.map((x) => String(x));
        if (arr.length) { details[k] = arr; found = true; }
      } else if (typeof v === 'string') {
        details[k] = [v]; found = true;
      }
    }
    return found ? details : undefined;
  }

  /** Normalize any error to ApiError { message, code, details? } */
  private handleError(error: any): ApiError {
    if (error?.response) {
      const status: number = error.response.status;
      const data = error.response.data;
      const message =
        (typeof data === 'string' && data) ||
        (data?.detail ?? data?.message ?? 'Request failed');
      const rawCode = (typeof data === 'object')
        ? (data?.code ?? data?.type ?? status)
        : status;
      const code = this.coerceErrorCode(rawCode, status);
      // extractDetails ne gère que les valeurs string/array — les objets imbriqués
      // comme validation_errors sont ignorés. On les préserve manuellement.
      const details: Record<string, any> = {
        ...(this.extractDetails(data) ?? {}),
        ...(data?.validation_errors ? { validation_errors: data.validation_errors } : {}),
      };
      return { message, code, details: Object.keys(details).length ? details : undefined };
    }
    const message =
      error?.message ||
      (error?.code === 'ECONNABORTED' ? 'Request timeout' : 'Network or unknown error');
    const code = this.coerceErrorCode(error?.code, 0);
    return { message, code };
  }

  /** Dédupe la donnée utile de la réponse */
  private extractData<T>(response: AxiosResponse<ApiResponse<T> | T>): T {
    const payload: any = response.data;
    // Si l'API enveloppe sous { data, ... }, on extrait
    if (payload && typeof payload === 'object' && 'data' in payload) {
      return (payload as ApiResponse<T>).data as T;
    }
    return payload as T;
  }

  // ======================
  //  Helpers HTTP publics
  // ======================

  async get<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.get<ApiResponse<T> | T>(
      this.buildUrl(url),
      config
    );
    return this.extractData<T>(response);
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    // Gérer FormData spécialement
    let requestConfig = { ...config };
    
    if (data instanceof FormData) {
      // Pour FormData, ne pas définir Content-Type - Axios le gère automatiquement
      requestConfig.headers = {
        ...requestConfig.headers,
      };
      // Supprimer le Content-Type par défaut s'il existe
      delete requestConfig.headers?.['Content-Type'];
    }

    const response = await this.client.post<ApiResponse<T> | T>(
      this.buildUrl(url),
      data,
      requestConfig
    );
    return this.extractData<T>(response);
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    let requestConfig = { ...config };
    
    if (data instanceof FormData) {
      requestConfig.headers = {
        ...requestConfig.headers,
      };
      delete requestConfig.headers?.['Content-Type'];
    }

    const response = await this.client.put<ApiResponse<T> | T>(
      this.buildUrl(url),
      data,
      requestConfig
    );
    return this.extractData<T>(response);
  }

  async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    let requestConfig = { ...config };
    
    if (data instanceof FormData) {
      requestConfig.headers = {
        ...requestConfig.headers,
      };
      delete requestConfig.headers?.['Content-Type'];
    }

    const response = await this.client.patch<ApiResponse<T> | T>(
      this.buildUrl(url),
      data,
      requestConfig
    );
    return this.extractData<T>(response);
  }

  async delete<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.delete<ApiResponse<T> | T>(
      this.buildUrl(url),
      config
    );
    return this.extractData<T>(response);
  }

  async options<T = any>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.options<ApiResponse<T> | T>(
      this.buildUrl(url),
      config
    );
    return this.extractData<T>(response);
  }

  /**
   * Méthode utilitaire pour forcer la déconnexion depuis l'extérieur
   * Utile si d'autres parties de l'app détectent une session expirée
   */
  async forceLogout(): Promise<void> {
    await this.handleSessionExpired();
  }

  /**
   * Vérifie si le token actuel est probablement valide
   * Ne garantit pas la validité côté serveur
   */
  async hasValidToken(): Promise<boolean> {
    const token = await secureStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    return !!token;
  }
}

export const apiClient = new ApiClient();