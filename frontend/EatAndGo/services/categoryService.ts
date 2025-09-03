import { apiClient } from './api';

import { 
  MenuCategory,
  MenuSubCategory,
  CreateMenuCategoryRequest,
  CreateMenuSubCategoryRequest,
  CategoryByRestaurantResponse,
  UpdateMenuCategoryRequest,
  SubCategoryByCategoryResponse,
  UpdateMenuSubCategoryRequest,
  CategoryReorderRequest,
  CategoryReorderResponse,
  SubCategoryReorderRequest,
  SubCategoryReorderResponse,
  CategoryBulkToggleRequest,
  CategoryBulkToggleResponse,
  CategoryStatistics
} from '@/types/category'

export class CategoryService {
  
  /**
   * Récupérer toutes les catégories du restaurateur connecté
   */
  async getCategories(restaurantId?: string): Promise<MenuCategory[]> {
    const params = restaurantId ? { restaurant_id: restaurantId } : undefined;
    return apiClient.get('/api/v1/menu/categories/', { params });
  }

  /**
   * Récupérer les catégories d'un restaurant spécifique
   */
  async getCategoriesByRestaurant(restaurantId: string): Promise<CategoryByRestaurantResponse> {
    return apiClient.get(`/api/v1/menu/categories/restaurant/${restaurantId}/`);
  }

  /**
   * Créer une nouvelle catégorie
   * Note: restaurant_id doit être passé dans les query params ou le body selon l'API
   */
  async createCategory(data: CreateMenuCategoryRequest, restaurantId?: string): Promise<MenuCategory> {
    const params = restaurantId ? { restaurant_id: restaurantId } : {};
    return apiClient.post('/api/v1/menu/categories/', data, { params });
  }

  /**
   * Mettre à jour une catégorie
   */
  async updateCategory(id: string, data: UpdateMenuCategoryRequest): Promise<MenuCategory> {
    return apiClient.patch(`/api/v1/menu/categories/${id}/`, data);
  }

  /**
   * Supprimer une catégorie
   */
  async deleteCategory(id: string): Promise<void> {
    return apiClient.delete(`/api/v1/menu/categories/${id}/`);
  }

  /**
   * Récupérer toutes les sous-catégories
   */
  async getSubCategories(categoryId?: string, restaurantId?: string): Promise<MenuSubCategory[]> {
    const params = {
      ...(categoryId && { category_id: categoryId }),
      ...(restaurantId && { restaurant_id: restaurantId }),
    };
    return apiClient.get('/api/v1/menu/subcategories/', { params });
  }

  /**
   * Récupérer les sous-catégories d'une catégorie spécifique
   */
  async getSubCategoriesByCategory(categoryId: string): Promise<SubCategoryByCategoryResponse> {
    return apiClient.get('/api/v1/menu/subcategories/by_category/', {
      params: { category_id: categoryId },
    });
  }

  /**
   * Créer une nouvelle sous-catégorie
   */
  async createSubCategory(data: CreateMenuSubCategoryRequest): Promise<MenuSubCategory> {
    return apiClient.post('/api/v1/menu/subcategories/', data);
  }

  /**
   * Mettre à jour une sous-catégorie
   */
  async updateSubCategory(id: string, data: UpdateMenuSubCategoryRequest): Promise<MenuSubCategory> {
    return apiClient.patch(`/api/v1/menu/subcategories/${id}/`, data);
  }

  /**
   * Supprimer une sous-catégorie
   */
  async deleteSubCategory(id: string): Promise<void> {
    return apiClient.delete(`/api/v1/menu/subcategories/${id}/`);
  }

  /**
   * Réorganiser l'ordre des catégories
   */
  async reorderCategories(request: CategoryReorderRequest): Promise<CategoryReorderResponse> {
    return apiClient.post('/api/v1/menu/categories/reorder/', request);
  }

  /**
   * Réorganiser l'ordre des sous-catégories
   */
  async reorderSubCategories(request: SubCategoryReorderRequest): Promise<SubCategoryReorderResponse> {
    return apiClient.post('/api/v1/menu/subcategories/reorder/', request);
  }

  /**
   * Activer/désactiver plusieurs catégories
   */
  async bulkToggleCategories(request: CategoryBulkToggleRequest): Promise<CategoryBulkToggleResponse> {
    return apiClient.post('/api/v1/menu/categories/bulk_toggle_active/', request);
  }

  /**
   * Obtenir des statistiques sur les catégories
   */
  async getCategoryStatistics(restaurantId: string): Promise<CategoryStatistics> {
    return apiClient.get('/api/v1/menu/categories/statistics/', {
      params: { restaurant_id: restaurantId },
    });
  }
}

export const categoryService = new CategoryService();