import axios, { AxiosInstance, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, ApiResponse } from '../types/common';

class ApiClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor pour ajouter le token
    this.client.interceptors.request.use(
      async (config) => {
        const token = await AsyncStorage.getItem('access_token');
        console.log('TOKEN:', token);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor pour gérer les erreurs
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expiré, rediriger vers login
          await AsyncStorage.multiRemove(['auth_token', 'user_data']);
          // Navigation vers login sera gérée par l'AuthContext
        }
        
        const apiError: ApiError = {
          message: error.response?.data?.message || error.message || 'Une erreur est survenue',
          code: error.response?.status || 500,
          details: error.response?.data?.details,
        };
        
        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Extrait les données de la réponse de manière flexible
   * Gère les formats : { data: T } et T directement
   */
  private extractData<T>(response: AxiosResponse): T {
    const responseData = response.data;
    
    // Si la réponse a une structure { data: T }, extraire T
    if (responseData && typeof responseData === 'object' && 'data' in responseData && responseData.data !== undefined) {
      return responseData.data as T;
    }
    
    // Sinon, retourner la réponse directement
    return responseData as T;
  }

  async get<T>(url: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.get(url, { params });
    return this.extractData<T>(response);
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post(url, data);
    return this.extractData<T>(response);
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.put(url, data);
    return this.extractData<T>(response);
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.patch(url, data);
    return this.extractData<T>(response);
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete(url);
    return this.extractData<T>(response);
  }

  async upload<T>(url: string, formData: FormData, onProgress?: (progress: number) => void): Promise<T> {
    const response = await this.client.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return this.extractData<T>(response);
  }
}

export const apiClient = new ApiClient();