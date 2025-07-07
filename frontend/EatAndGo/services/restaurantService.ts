import { Restaurant, RestaurantStats } from '@/types/restaurant';
import { SearchFilters, PaginatedResponse } from '@/types/common';
import { apiClient } from './api';

export class RestaurantService {
  async getRestaurants(params?: {
    page?: number;
    limit?: number;
    filters?: SearchFilters;
  }): Promise<PaginatedResponse<Restaurant>> {
    return apiClient.get('/restaurants/', params);
  }

  async getRestaurant(id: string): Promise<Restaurant> {
    return apiClient.get(`/restaurants/${id}/`);
  }

  async createRestaurant(data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>): Promise<Restaurant> {
    return apiClient.post('/restaurants/', data);
  }

  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    return apiClient.patch(`/restaurants/${id}/`, data);
  }

  async deleteRestaurant(id: string): Promise<void> {
    return apiClient.delete(`/restaurants/${id}/`);
  }

  async getRestaurantStats(id: string, period?: string): Promise<RestaurantStats> {
    return apiClient.get(`/restaurants/${id}/stats/`, { period });
  }

  async uploadRestaurantImage(id: string, file: FormData): Promise<Restaurant> {
    return apiClient.upload(`/restaurants/${id}/image/`, file);
  }

  async searchRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    return apiClient.get('/restaurants/search/', { query, ...filters });
  }

  async toggleRestaurantStatus(id: string): Promise<Restaurant> {
    return apiClient.post(`/restaurants/${id}/toggle-status/`);
  }
}

export const restaurantService = new RestaurantService();
