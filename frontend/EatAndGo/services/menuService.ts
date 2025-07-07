import { Menu, Product, MenuCategory } from '@/types/restaurant';
import { apiClient } from './api';

export class MenuService {
  async getRestaurantMenus(restaurantId: string): Promise<Menu[]> {
    return apiClient.get(`/restaurants/${restaurantId}/menus/`);
  }

  async getMenu(menuId: string): Promise<Menu> {
    return apiClient.get(`/menus/${menuId}/`);
  }

  async createMenu(restaurantId: string, data: Omit<Menu, 'id' | 'createdAt' | 'updatedAt'>): Promise<Menu> {
    return apiClient.post(`/restaurants/${restaurantId}/menus/`, data);
  }

  async updateMenu(menuId: string, data: Partial<Menu>): Promise<Menu> {
    return apiClient.patch(`/menus/${menuId}/`, data);
  }

  async deleteMenu(menuId: string): Promise<void> {
    return apiClient.delete(`/menus/${menuId}/`);
  }

  // Categories
  async createCategory(menuId: string, data: Omit<MenuCategory, 'id' | 'products'>): Promise<MenuCategory> {
    return apiClient.post(`/menus/${menuId}/categories/`, data);
  }

  async updateCategory(categoryId: string, data: Partial<MenuCategory>): Promise<MenuCategory> {
    return apiClient.patch(`/categories/${categoryId}/`, data);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    return apiClient.delete(`/categories/${categoryId}/`);
  }

  // Products
  async getProducts(categoryId?: string): Promise<Product[]> {
    const params = categoryId ? { categoryId } : {};
    return apiClient.get('/products/', params);
  }

  async getProduct(productId: string): Promise<Product> {
    return apiClient.get(`/products/${productId}/`);
  }

  async createProduct(categoryId: string, data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Promise<Product> {
    return apiClient.post(`/categories/${categoryId}/products/`, data);
  }

  async updateProduct(productId: string, data: Partial<Product>): Promise<Product> {
    return apiClient.patch(`/products/${productId}/`, data);
  }

  async deleteProduct(productId: string): Promise<void> {
    return apiClient.delete(`/products/${productId}/`);
  }

  async uploadProductImage(productId: string, file: FormData): Promise<Product> {
    return apiClient.upload(`/products/${productId}/image/`, file);
  }

  async toggleProductAvailability(productId: string): Promise<Product> {
    return apiClient.post(`/products/${productId}/toggle-availability/`);
  }

  async reorderProducts(categoryId: string, productIds: string[]): Promise<void> {
    return apiClient.post(`/categories/${categoryId}/reorder-products/`, { productIds });
  }
}

export const menuService = new MenuService();