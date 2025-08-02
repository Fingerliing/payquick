import { Restaurant, RestaurantStats } from '@/types/restaurant';
import { SearchFilters, PaginatedResponse } from '@/types/common';
import { apiClient } from './api';

// Fonction utilitaire pour normaliser les données restaurant
const normalizeRestaurantData = (data: any): Restaurant => {
  return {
    ...data,
    // S'assurer que l'ID est une string
    id: String(data.id),
    // Gérer les différents formats de nommage
    openingHours: data.openingHours || data.opening_hours || [],
    zipCode: data.zipCode || data.zip_code,
    priceRange: data.priceRange || data.price_range,
    reviewCount: data.reviewCount || data.review_count,
    isActive: data.isActive ?? data.is_active ?? true,
    createdAt: data.createdAt || data.created_at,
    updatedAt: data.updatedAt || data.updated_at,
    // Reconstruire location si nécessaire
    location: data.location || {
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
    },
    // S'assurer que can_receive_orders est défini
    can_receive_orders: data.can_receive_orders ?? false,
  };
};

// Fonction pour préparer les données pour le backend
const prepareDataForBackend = (data: Partial<Restaurant>): any => {
  const backendData: any = { ...data };
  
  // Convertir camelCase en snake_case
  if (data.zipCode !== undefined) {
    backendData.zip_code = data.zipCode;
    delete backendData.zipCode;
  }
  if (data.priceRange !== undefined) {
    backendData.price_range = data.priceRange;
    delete backendData.priceRange;
  }
  if (data.isActive !== undefined) {
    backendData.is_active = data.isActive;
    delete backendData.isActive;
  }
  
  // Gérer location
  if (data.location) {
    backendData.latitude = data.location.latitude;
    backendData.longitude = data.location.longitude;
    delete backendData.location;
  }
  
  // Supprimer les champs en lecture seule ou calculés
  delete backendData.id;
  delete backendData.ownerId;
  delete backendData.owner_id;
  delete backendData.createdAt;
  delete backendData.updatedAt;
  delete backendData.created_at;
  delete backendData.updated_at;
  delete backendData.can_receive_orders;
  delete backendData.reviewCount;
  delete backendData.review_count;
  delete backendData.rating;
  delete backendData.accepts_meal_vouchers_display;
  
  return backendData;
};

// Fonction utilitaire pour normaliser les réponses paginées
const normalizePaginatedResponse = (response: any): PaginatedResponse<Restaurant> => {
  // Cas 1: Réponse avec structure { data: [...], pagination: {...} }
  if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
    return {
      data: response.data.map(normalizeRestaurantData),
      pagination: response.pagination || {
        page: 1,
        limit: response.data.length,
        total: response.data.length,
        pages: 1
      }
    };
  }
  
  // Cas 2: Réponse directement un tableau
  if (Array.isArray(response)) {
    return {
      data: response.map(normalizeRestaurantData),
      pagination: {
        page: 1,
        limit: response.length,
        total: response.length,
        pages: 1
      }
    };
  }
  
  // Cas 3: Réponse avec structure { results: [...], count: number } (format DRF)
  if (response && typeof response === 'object' && 'results' in response && Array.isArray(response.results)) {
    const total = response.count || response.results.length;
    const limit = response.results.length;
    const pages = Math.ceil(total / limit);
    
    return {
      data: response.results.map(normalizeRestaurantData),
      pagination: {
        page: response.page || 1,
        limit,
        total,
        pages
      }
    };
  }
  
  // Cas par défaut: réponse vide
  return {
    data: [],
    pagination: {
      page: 1,
      limit: 0,
      total: 0,
      pages: 0
    }
  };
};

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
    
    const response = await apiClient.get('api/v1/restaurants/public/', queryParams);
    return normalizePaginatedResponse(response);
  }

  /**
   * Récupère les détails publics d'un restaurant (pour clients)
   */
  async getPublicRestaurant(id: string): Promise<Restaurant> {
    const response = await apiClient.get(`api/v1/restaurants/public/${id}/`);
    return normalizeRestaurantData(response);
  }

  /**
   * Recherche publique de restaurants
   */
  async searchPublicRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    const response = await apiClient.get('api/v1/restaurants/public/', { search: query, ...filters });
    
    if (Array.isArray(response)) {
      return response.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
      return response.data.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'results' in response && Array.isArray(response.results)) {
      return response.results.map(normalizeRestaurantData);
    }
    
    return [];
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
    const response = await apiClient.get('api/v1/restaurants/public/meal_vouchers/');
    
    if (Array.isArray(response)) {
      return response.map(normalizeRestaurantData);
    }
    
    return [];
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
    const response = await apiClient.get('api/v1/restaurants/', params);
    return normalizePaginatedResponse(response);
  }

  /**
   * Récupère un restaurant spécifique du restaurateur (privé)
   */
  async getRestaurant(id: string): Promise<Restaurant> {
    const response = await apiClient.get(`api/v1/restaurants/${id}/`);
    return normalizeRestaurantData(response);
  }

  /**
   * Crée un nouveau restaurant (privé - restaurateurs seulement)
   */
  async createRestaurant(data: any): Promise<Restaurant> {
    // Préparer les données pour le backend
    const backendData = prepareDataForBackend(data);
    
    // Gérer les horaires d'ouverture séparément
    const openingHours = data.openingHours || [];
    if (openingHours.length > 0) {
      backendData.openingHours = openingHours;
    }
    
    const response = await apiClient.post('api/v1/restaurants/', backendData);
    return normalizeRestaurantData(response);
  }

  /**
   * Met à jour un restaurant (privé - restaurateurs seulement)
   */
  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    // Préparer les données pour le backend
    const backendData = prepareDataForBackend(data);
    
    // Gérer les horaires d'ouverture si présents
    if (data.openingHours) {
      backendData.openingHours = data.openingHours;
    }
    
    const response = await apiClient.patch(`api/v1/restaurants/${id}/`, backendData);
    return normalizeRestaurantData(response);
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
    const response = await apiClient.upload(`api/v1/restaurants/${id}/upload_image/`, file);
    return normalizeRestaurantData(response);
  }

  /**
   * Recherche dans les restaurants du restaurateur (privé)
   */
  async searchRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    const response = await apiClient.get('api/v1/restaurants/', { search: query, ...filters });
    
    if (Array.isArray(response)) {
      return response.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
      return response.data.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'results' in response && Array.isArray(response.results)) {
      return response.results.map(normalizeRestaurantData);
    }
    
    return [];
  }

  /**
   * Active/désactive un restaurant (privé)
   */
  async toggleRestaurantStatus(id: string): Promise<Restaurant> {
    const response = await apiClient.post(`api/v1/restaurants/${id}/toggle-status/`);
    return normalizeRestaurantData(response);
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