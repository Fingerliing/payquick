import { Restaurant, RestaurantStats } from '@/types/restaurant';
import { SearchFilters, PaginatedResponse } from '@/types/common';
import { apiClient } from './api';

export class RestaurantService {
  async getRestaurants(params?: {
    page?: number;
    limit?: number;
    filters?: SearchFilters;
  }): Promise<PaginatedResponse<Restaurant>> {
    return apiClient.get('api/v1/restaurants/', params);
  }

  async getRestaurant(id: string): Promise<Restaurant> {
    return apiClient.get(`api/v1/restaurants/${id}/`);
  }

  async createRestaurant(data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Restaurant> {
    return apiClient.post('api/v1/restaurants/', data);
  }

  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    return apiClient.patch(`api/v1/restaurants/${id}/`, data);
  }

  async deleteRestaurant(id: string): Promise<void> {
    return apiClient.delete(`api/v1/restaurants/${id}/`);
  }

  async getRestaurantStats(id: string, period?: string): Promise<RestaurantStats> {
    return apiClient.get(`api/v1/restaurants/${id}/stats/`, { period });
  }

  async uploadRestaurantImage(id: string, file: FormData): Promise<Restaurant> {
    return apiClient.upload(`api/v1/restaurants/${id}/image/`, file);
  }

  async searchRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    return apiClient.get('api/v1/restaurants/search/', { query, ...filters });
  }

  async toggleRestaurantStatus(id: string): Promise<Restaurant> {
    return apiClient.post(`api/v1/restaurants/${id}/toggle-status/`);
  }
}

export const restaurantService = new RestaurantService();
