import { Restaurant, RestaurantStats } from '@/types/restaurant';
import { SearchFilters, PaginatedResponse } from '@/types/common';
import { apiClient } from './api';

export class RestaurantService {
  // ============================================================================
  // MÉTHODES PUBLIQUES (pour clients/navigation)
  // ============================================================================
  
  /**
   * Récupère la liste publique des restaurants (pour clients)
   */
  async getPublicRestaurants(params?: {
    page?: number;
    limit?: number;
    query?: string;
    filters?: SearchFilters;
    cuisine?: string;
    city?: string;
    accepts_meal_vouchers?: boolean;
  }): Promise<PaginatedResponse<Restaurant>> {
    const queryParams = {
      page: params?.page,
      limit: params?.limit,
      search: params?.query || params?.filters?.query,
      cuisine: params?.cuisine,
      city: params?.city,
      accepts_meal_vouchers: params?.accepts_meal_vouchers,
      ...params?.filters
    };
    
    return apiClient.get('api/v1/restaurants/public/', queryParams);
  }

  /**
   * Récupère les détails publics d'un restaurant (pour clients)
   */
  async getPublicRestaurant(id: string): Promise<Restaurant> {
    return apiClient.get(`api/v1/restaurants/public/${id}/`);
  }

  /**
   * Recherche publique de restaurants
   */
  async searchPublicRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    return apiClient.get('api/v1/restaurants/public/', { search: query, ...filters });
  }

  /**
   * Récupère les types de cuisine disponibles
   */
  async getAvailableCuisines(): Promise<{value: string, label: string}[]> {
    return apiClient.get('api/v1/restaurants/public/cuisines/');
  }

  /**
   * Récupère les villes avec restaurants
   */
  async getAvailableCities(): Promise<string[]> {
    return apiClient.get('api/v1/restaurants/public/cities/');
  }

  /**
   * Récupère les restaurants acceptant les titres-restaurant
   */
  async getMealVoucherRestaurants(): Promise<Restaurant[]> {
    return apiClient.get('api/v1/restaurants/public/meal_vouchers/');
  }

  // ============================================================================
  // MÉTHODES PRIVÉES (pour restaurateurs authentifiés)
  // ============================================================================

  /**
   * Récupère les restaurants du restaurateur connecté (privé)
   */
  async getRestaurants(params?: {
    page?: number;
    limit?: number;
    filters?: SearchFilters;
  }): Promise<PaginatedResponse<Restaurant>> {
    return apiClient.get('api/v1/restaurants/', params);
  }

  /**
   * Récupère un restaurant spécifique du restaurateur (privé)
   */
  async getRestaurant(id: string): Promise<Restaurant> {
    return apiClient.get(`api/v1/restaurants/${id}/`);
  }

  /**
   * Crée un nouveau restaurant (privé - restaurateurs seulement)
   */
  async createRestaurant(data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Restaurant> {
    return apiClient.post('api/v1/restaurants/', data);
  }

  /**
   * Met à jour un restaurant (privé - restaurateurs seulement)
   */
  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    return apiClient.patch(`api/v1/restaurants/${id}/`, data);
  }

  /**
   * Supprime un restaurant (privé - restaurateurs seulement)
   */
  async deleteRestaurant(id: string): Promise<void> {
    return apiClient.delete(`api/v1/restaurants/${id}/`);
  }

  /**
   * Récupère les statistiques d'un restaurant (privé)
   */
  async getRestaurantStats(id: string, period?: string): Promise<RestaurantStats> {
    return apiClient.get(`api/v1/restaurants/${id}/stats/`, { period });
  }

  /**
   * Upload une image de restaurant (privé)
   */
  async uploadRestaurantImage(id: string, file: FormData): Promise<Restaurant> {
    return apiClient.upload(`api/v1/restaurants/${id}/upload_image/`, file);
  }

  /**
   * Recherche dans les restaurants du restaurateur (privé)
   */
  async searchRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    return apiClient.get('api/v1/restaurants/', { search: query, ...filters });
  }

  /**
   * Active/désactive un restaurant (privé)
   */
  async toggleRestaurantStatus(id: string): Promise<Restaurant> {
    return apiClient.post(`api/v1/restaurants/${id}/toggle-status/`);
  }

  // ============================================================================
  // MÉTHODES HYBRIDES (avec choix public/privé)
  // ============================================================================

  /**
   * Méthode générique qui choisit automatiquement l'endpoint selon le contexte
   */
  async getRestaurantsForContext(
    isPublic: boolean = true,
    params?: {
      page?: number;
      limit?: number;
      filters?: SearchFilters;
      cuisine?: string;
      city?: string;
      accepts_meal_vouchers?: boolean;
    }
  ): Promise<PaginatedResponse<Restaurant>> {
    if (isPublic) {
      return this.getPublicRestaurants(params);
    } else {
      return this.getRestaurants(params);
    }
  }
}

export const restaurantService = new RestaurantService();