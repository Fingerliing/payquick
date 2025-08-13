import { CreateMenuItemRequest, Menu, MenuItem, Allergen } from '@/types/menu';
import { apiClient } from './api';

export class MenuService {

  /**
   * Normalise les objets Menu provenant de l'API.
   */
  private normalizeMenu(raw: any): Menu {
    if (raw && typeof raw === 'object') {
      const hasIsAvailable = Object.prototype.hasOwnProperty.call(raw, 'is_available');
      const hasDisponible = Object.prototype.hasOwnProperty.call(raw, 'disponible');
      const normalized = { ...raw } as any;
      if (!hasIsAvailable && hasDisponible) {
        normalized.is_available = normalized.disponible;
      }
      return normalized as Menu;
    }
    return raw as Menu;
  }

  /**
   * Récupérer tous les menus du restaurateur connecté
   */
  async getMyMenus(): Promise<Menu[]> {
    const menus = await apiClient.get('/api/v1/menus/');
    return Array.isArray(menus) ? menus.map(menu => this.normalizeMenu(menu)) : [];
  }

  /**
   * Récupérer un menu spécifique avec ses items
   */
  async getMenu(id: number): Promise<Menu> {
    const menu = await apiClient.get(`/api/v1/menus/${id}/`);
    return this.normalizeMenu(menu);
  }

  /**
   * Créer un nouveau menu
   */
  async createMenu(data: { name: string; restaurant: number }): Promise<Menu> {
    const menu = await apiClient.post('/api/v1/menus/', data);
    return this.normalizeMenu(menu);
  }

  /**
   * Mettre à jour un menu
   */
  async updateMenu(id: number, data: Partial<Menu>): Promise<Menu> {
    const menu = await apiClient.patch(`/api/v1/menus/${id}/`, data);
    return this.normalizeMenu(menu);
  }

  /**
   * Supprimer un menu
   */
  async deleteMenu(id: number): Promise<void> {
    return apiClient.delete(`/api/v1/menus/${id}/`);
  }

  /**
   * Activer/Désactiver un menu (toggle)
   */
  async toggleMenuAvailability(id: number): Promise<{ id: number; is_available: boolean; message?: string }> {
    const result = await apiClient.post(`/api/v1/menus/${id}/toggle_is_available/`) as any;
    return {
      id: result.id,
      is_available: result.is_available,
      message: result.message
    };
  }

  /**
   * Récupérer les allergènes disponibles
   */
  async getAllergens(): Promise<Allergen[]> {
    return apiClient.get('/api/v1/menu-items/allergens/');
  }

  /**
   * Récupérer les items par allergène
   */
  async getItemsByAllergen(allergen: string): Promise<MenuItem[]> {
    return apiClient.get('/api/v1/menu-items/by_allergen/', { allergen });
  }

  /**
   * Récupérer les items par options diététiques
   */
  async getDietaryOptions(filters: {
    vegetarian?: boolean;
    vegan?: boolean;
    gluten_free?: boolean;
  }): Promise<MenuItem[]> {
    return apiClient.get('/api/v1/menu-items/dietary_options/', filters);
  }

  /**
   * Récupère les menus disponibles pour un restaurant côté client.
   * Essaye d'abord l'endpoint public, puis retombe sur le privé si erreur.
   */
  async getMenusByRestaurant(restaurantId: number): Promise<Menu[]> {
    try {
      // Endpoint public pensé pour les clients
      const menus = await apiClient.get(`/api/v1/restaurants/public/${restaurantId}/menus/`) as any;
      const list = Array.isArray(menus)
        ? menus
        : (menus?.results ?? menus?.data ?? []);
      return list.map((m: any) => this.normalizeMenu(m))
                 .filter((m: any) => m?.restaurant === restaurantId || m?.restaurant?.id === restaurantId);
    } catch (e: any) {
      // Fallback: ancien flux privé (auth requis)
      try {
        const allMenus = await this.getMyMenus();
        return allMenus.filter(menu => menu.restaurant === restaurantId);
      } catch {
        return [];
      }
    }
  }

  /**
   * Services pour les MenuItems
   */
  menuItems = {
    getMyMenuItems: (): Promise<MenuItem[]> => {
      return apiClient.get('/api/v1/menu-items/');
    },

    getMenuItem: (id: number): Promise<MenuItem> => {
      return apiClient.get(`/api/v1/menu-items/${id}/`);
    },

    createMenuItem: (data: CreateMenuItemRequest): Promise<MenuItem> => {
      return apiClient.post('/api/v1/menu-items/', data);
    },

    updateMenuItem: (id: number, data: Partial<MenuItem>): Promise<MenuItem> => {
      return apiClient.patch(`/api/v1/menu-items/${id}/`, data);
    },

    deleteMenuItem: (id: number): Promise<void> => {
      return apiClient.delete(`/api/v1/menu-items/${id}/`);
    },

    toggleItemAvailability: (id: number): Promise<{ id: number; is_available: boolean }> => {
      return apiClient.post(`/api/v1/menu-items/${id}/toggle/`);
    },
  };
}

export const menuService = new MenuService();
