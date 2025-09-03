import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, ApiResponse } from '../types/common';

/**
 * ApiClient
 * - Gère la baseURL (EXPO_PUBLIC_API_URL ou localhost)
 * - Ajoute automatiquement le Bearer token si présent dans AsyncStorage
 * - Normalise les chemins pour éviter les doubles slashs
 * - Expose des helpers génériques: get/post/put/patch/delete/options
 */
class ApiClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Intercepteur requêtes: injecte le token s'il existe
    this.client.interceptors.request.use(async (config) => {
      // Essaye plusieurs clés possibles sans casser si absentes
      const token =
        (await AsyncStorage.getItem('access_token')) ||
        (await AsyncStorage.getItem('auth_token')) ||
        (await AsyncStorage.getItem('token')) ||
        undefined;

      if (token) {
        config.headers = config.headers ?? {};
        (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
      }

      // Normalise l'URL pour éviter les // ou les chemins relatifs
      if (config.url) {
        config.url = this.buildUrl(config.url);
      }
      return config;
    });

    // Intercepteur réponses: laisse passer, la gestion d'erreur se fait dans handleError
    this.client.interceptors.response.use(
      (response) => response,
      (error) => Promise.reject(this.handleError(error))
    );
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
        ? (data?.code ?? data?.error ?? data?.type ?? status)
        : status;
      const code = this.coerceErrorCode(rawCode, status);
      const details = this.extractDetails(data);
      return { message, code, details };
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
    // ✅ CORRECTION: Gérer FormData spécialement
    let requestConfig = { ...config };
    
    if (data instanceof FormData) {
      // Pour FormData, ne pas définir Content-Type - Axios le gère automatiquement
      requestConfig.headers = {
        ...requestConfig.headers,
        // Ne PAS définir Content-Type pour FormData
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
    const response = await this.client.put<ApiResponse<T> | T>(
      this.buildUrl(url),
      data,
      config
    );
    return this.extractData<T>(response);
  }

  async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.patch<ApiResponse<T> | T>(
      this.buildUrl(url),
      data,
      config
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

  /**
   * Méthode OPTIONS pour récupérer les métadonnées d'un endpoint
   */
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
}

export const apiClient = new ApiClient();