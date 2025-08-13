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

// Fonction pour préparer les données pour le backend (CRUD restaurateur)
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
  // Cas 1: { data: [...], pagination: {...} }
  if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
    return {
      data: response.data.map(normalizeRestaurantData),
      pagination: response.pagination || {
        page: 1,
        limit: response.data.length,
        total: response.data.length,
        pages: 1,
      },
    };
  }

  // Cas 2: Tableau direct
  if (Array.isArray(response)) {
    return {
      data: response.map(normalizeRestaurantData),
      pagination: {
        page: 1,
        limit: response.length,
        total: response.length,
        pages: 1,
      },
    };
  }

  // Cas 3: { results: [...], count: n } (DRF)
  if (response && typeof response === 'object' && 'results' in response && Array.isArray(response.results)) {
    const total = response.count || response.results.length;
    const limit = response.results.length || response.page_size || total || 0;
    const pages = limit ? Math.ceil(total / limit) : 1;

    return {
      data: response.results.map(normalizeRestaurantData),
      pagination: {
        page: response.page || 1,
        limit,
        total,
        pages,
      },
    };
  }

  // Par défaut
  return {
    data: [],
    pagination: {
      page: 1,
      limit: 0,
      total: 0,
      pages: 0,
    },
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
      ...params?.filters,
    };

    const response = await apiClient.get('api/v1/restaurants/public/', queryParams);
    return normalizePaginatedResponse(response);
  }

  /**
   * Détails publics d'un restaurant (pour clients)
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
   * Types de cuisine disponibles (public)
   */
  async getAvailableCuisines(): Promise<{ value: string; label: string }[]> {
    return apiClient.get('api/v1/restaurants/public/cuisines/');
  }

  /**
   * Villes avec restaurants (public)
   */
  async getAvailableCities(): Promise<string[]> {
    return apiClient.get('api/v1/restaurants/public/cities/');
  }

  // ============================================================================
  // MÉTHODES PRIVÉES (back-office restaurateur)
  // ============================================================================

  /**
   * Liste des restaurants du restaurateur (privé)
   */
  async getRestaurants(params?: { search?: string; page?: number; page_size?: number }): Promise<PaginatedResponse<Restaurant>> {
    const response = await apiClient.get('api/v1/restaurants/', params);
    return normalizePaginatedResponse(response);
  }

  /**
   * Détails restaurant — ESSAIE le privé puis bascule en public si 401/403.
   * (Permet d'éviter un 403 côté client quand l'utilisateur n'est pas restaurateur)
   */
  async getRestaurant(id: string): Promise<Restaurant> {
    try {
      const response = await apiClient.get(`api/v1/restaurants/${id}/`);
      return normalizeRestaurantData(response);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        // Fallback vers l'endpoint public
        return this.getPublicRestaurant(id);
      }
      throw err;
    }
  }

  /**
   * Crée un nouveau restaurant (privé - restaurateurs seulement)
   */
  async createRestaurant(data: any): Promise<Restaurant> {
    // Logs utiles en dev
    console.log('🚀 RestaurantService: Creating restaurant...');
    console.log('📥 Données reçues dans le service:', JSON.stringify(data, null, 2));

    // Validation basique côté client
    const requiredFields = ['name', 'address', 'city', 'zip_code', 'phone', 'email', 'cuisine'];
    const missingFields = requiredFields.filter((field) => !data[field] || String(data[field]).trim() === '');
    if (missingFields.length > 0) {
      console.error('❌ Champs requis manquants:', missingFields);
      throw new Error(`Champs requis manquants: ${missingFields.join(', ')}`);
    }

    // Préparer les données finales pour le backend
    const finalData = {
      ...data,
      // Typage / valeurs par défaut
      price_range: parseInt(data.price_range) || 2,
      latitude: parseFloat(data.latitude) || 0,
      longitude: parseFloat(data.longitude) || 0,
      rating: parseFloat(data.rating) || 0,
      review_count: parseInt(data.review_count) || 0,
      is_active: Boolean(data.is_active),
      accepts_meal_vouchers: Boolean(data.accepts_meal_vouchers),

      // Chaînes optionnelles
      description: data.description || '',
      website: data.website || '',
      country: data.country || 'France',
      meal_voucher_info: data.meal_voucher_info || '',
      image: data.image || null,

      // Horaires d'ouverture
      opening_hours: Array.isArray(data.opening_hours)
        ? data.opening_hours.map((hour: any) => ({
            day_of_week: parseInt(hour.day_of_week) || parseInt(hour.dayOfWeek) || 0,
            open_time: hour.open_time || hour.openTime || '09:00',
            close_time: hour.close_time || hour.closeTime || '18:00',
            is_closed: Boolean(hour.is_closed ?? hour.isClosed ?? false),
          }))
        : [],
    };

    console.log("📤 Données finales envoyées à l'API:", JSON.stringify(finalData, null, 2));

    try {
      const response = await apiClient.post('api/v1/restaurants/', finalData);
      console.log('✅ RestaurantService: Restaurant created successfully');
      console.log('📥 Réponse du backend:', JSON.stringify(response, null, 2));
      return normalizeRestaurantData(response);
    } catch (error: any) {
      console.error('❌ RestaurantService: Creation failed');
      console.error('📝 Error details:', {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        message: error?.message,
      });

      // Propager l'erreur avec infos de validation si dispo
      if (error?.response?.data?.validation_errors) {
        error.validation_errors = error.response.data.validation_errors;
      }
      throw error;
    }
  }

  /**
   * Mise à jour d'un restaurant (privé)
   */
  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<void> {
    const payload = prepareDataForBackend(data);
    await apiClient.patch(`api/v1/restaurants/${id}/`, payload);
  }

  /**
   * Suppression d'un restaurant (privé)
   */
  async deleteRestaurant(id: string): Promise<void> {
    await apiClient.delete(`api/v1/restaurants/${id}/`);
  }

  /**
   * Recherche (privé)
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
}

export const restaurantService = new RestaurantService();
