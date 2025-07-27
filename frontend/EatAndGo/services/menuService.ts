import { CreateMenuItemRequest, Menu, MenuItem } from '@/types/menu';
import { apiClient } from './api';

export class MenuService {
  /**
   * Récupérer tous les menus du restaurateur connecté
   */
  async getMyMenus(): Promise<Menu[]> {
    return apiClient.get('/api/v1/menus/');
  }

  /**
   * Récupérer un menu spécifique avec ses items
   */
  async getMenu(id: number): Promise<Menu> {
    return apiClient.get(`/api/v1/menus/${id}/`);
  }

  /**
   * Créer un nouveau menu
   */
  async createMenu(data: { name: string; restaurant: number }): Promise<Menu> {
    return apiClient.post('/api/v1/menus/', data);
  }

  /**
   * Mettre à jour un menu
   */
  async updateMenu(id: number, data: Partial<Menu>): Promise<Menu> {
    return apiClient.patch(`/api/v1/menus/${id}/`, data);
  }

  /**
   * Supprimer un menu
   */
  async deleteMenu(id: number): Promise<void> {
    return apiClient.delete(`/api/v1/menus/${id}/`);
  }

  /**
   * Activer/Désactiver un menu (rend ce menu disponible et désactive les autres)
   */
  async toggleMenuAvailability(id: number): Promise<{ id: number; disponible: boolean }> {
    return apiClient.post(`/api/v1/menus/${id}/toggle_disponible/`);
  }

  /**
   * Services pour les MenuItems
   */
  menuItems = {
    /**
     * Récupérer tous les items du restaurateur
     */
    getMyMenuItems: (): Promise<MenuItem[]> => {
      return apiClient.get('/api/v1/menu-items/');
    },

    /**
     * Récupérer un item spécifique
     */
    getMenuItem: (id: number): Promise<MenuItem> => {
      return apiClient.get(`/api/v1/menu-items/${id}/`);
    },

    /**
     * Créer un item de menu
     */
    createMenuItem: (data: CreateMenuItemRequest): Promise<MenuItem> => {
      return apiClient.post('/api/v1/menu-items/', data);
    },

    /**
     * Mettre à jour un item
     */
    updateMenuItem: (id: number, data: Partial<MenuItem>): Promise<MenuItem> => {
      return apiClient.patch(`/api/v1/menu-items/${id}/`, data);
    },

    /**
     * Supprimer un item
     */
    deleteMenuItem: (id: number): Promise<void> => {
      return apiClient.delete(`/api/v1/menu-items/${id}/`);
    },

    /**
     * Activer/Désactiver un item
     */
    toggleItemAvailability: (id: number): Promise<{ id: number; is_available: boolean }> => {
      return apiClient.post(`/api/v1/menu-items/${id}/toggle/`);
    },
  };
}

export const menuService = new MenuService();