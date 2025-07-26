import { Menu, MenuItem } from '@/types/menu';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Récupérer le token d'authentification (à adapter selon votre système d'auth)
const getAuthToken = () => {
  // Remplacez par votre logique de récupération de token
  return localStorage.getItem('authToken') || '';
};

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getAuthToken()}`,
});

export const menuService = {
  // Récupérer tous les menus du restaurateur connecté
  async getMyMenus(): Promise<Menu[]> {
    const response = await fetch(`${API_BASE_URL}/api/menus/`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch menus');
    return response.json();
  },

  // Récupérer un menu spécifique avec ses items
  async getMenu(id: number): Promise<Menu> {
    const response = await fetch(`${API_BASE_URL}/api/menus/${id}/`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch menu');
    return response.json();
  },

  // Créer un nouveau menu
  async createMenu(data: { name: string; restaurant: number }): Promise<Menu> {
    const response = await fetch(`${API_BASE_URL}/api/menus/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create menu');
    return response.json();
  },

  // Mettre à jour un menu
  async updateMenu(id: number, data: Partial<Menu>): Promise<Menu> {
    const response = await fetch(`${API_BASE_URL}/api/menus/${id}/`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update menu');
    return response.json();
  },

  // Supprimer un menu
  async deleteMenu(id: number): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/menus/${id}/`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete menu');
  },

  // Activer/Désactiver un menu (rend ce menu disponible et désactive les autres)
  async toggleMenuAvailability(id: number): Promise<{ id: number; disponible: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/menus/${id}/toggle_disponible/`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to toggle menu availability');
    return response.json();
  },

  // Services pour les MenuItems
  menuItems: {
    // Récupérer tous les items du restaurateur
    async getMyMenuItems(): Promise<MenuItem[]> {
      const response = await fetch(`${API_BASE_URL}/api/menu-items/`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch menu items');
      return response.json();
    },

    // Créer un item de menu
    async createMenuItem(data: {
      name: string;
      description: string;
      price: string;
      category: string;
      menu: number;
    }): Promise<MenuItem> {
      const response = await fetch(`${API_BASE_URL}/api/menu-items/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create menu item');
      return response.json();
    },

    // Mettre à jour un item
    async updateMenuItem(id: number, data: Partial<MenuItem>): Promise<MenuItem> {
      const response = await fetch(`${API_BASE_URL}/api/menu-items/${id}/`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update menu item');
      return response.json();
    },

    // Supprimer un item
    async deleteMenuItem(id: number): Promise<void> {
      const response = await fetch(`${API_BASE_URL}/api/menu-items/${id}/`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to delete menu item');
    },

    // Activer/Désactiver un item
    async toggleItemAvailability(id: number): Promise<{ id: number; is_available: boolean }> {
      const response = await fetch(`${API_BASE_URL}/api/menu-items/${id}/toggle/`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to toggle item availability');
      return response.json();
    },
  }
};

// Service pour les restaurants (si besoin)
export const restaurantService = {
  async getMyRestaurants(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/restaurants/`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch restaurants');
    return response.json();
  },
};