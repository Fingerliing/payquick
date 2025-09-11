import { apiClient } from './api';

export interface DailyMenuItem {
  id: string;
  menu_item: string;
  menu_item_name: string;
  menu_item_description: string;
  menu_item_category: string;
  menu_item_category_icon: string;
  menu_item_image: string | null;
  original_price: number;
  special_price: number | null;
  effective_price: number;
  has_discount: boolean;
  discount_percentage: number;
  is_available: boolean;
  display_order: number;
  special_note: string | null;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  allergens: string[];
}

export interface CategoryWithItems {
  name: string;
  icon: string;
  items: DailyMenuItem[];
}

export interface DailyMenu {
  id: string;
  restaurant: string;
  restaurant_name: string;
  restaurant_logo: string | null;
  date: string;
  title: string;
  description: string | null;
  is_active: boolean;
  special_price: number | null;
  daily_menu_items?: DailyMenuItem[];
  items_by_category: CategoryWithItems[];
  total_items_count: number;
  estimated_total_price: number;
  is_today: boolean;
  is_future: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDailyMenuData {
  restaurant: string;
  date: string;
  title: string;
  description?: string;
  is_active?: boolean;
  special_price?: number;
  items?: {
    menu_item: string;
    special_price?: number;
    display_order?: number;
    special_note?: string;
    is_available?: boolean;
  }[];
}

export interface PublicDailyMenu {
  id: string;
  restaurant_name: string;
  restaurant_logo: string | null;
  date: string;
  title: string;
  description: string | null;
  special_price: number | null;
  items_by_category: CategoryWithItems[];
  total_items_count: number;
  estimated_total_price: number;
}

export interface DailyMenuTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  day_of_week: number | null;
  default_special_price: number | null;
  usage_count: number;
  last_used: string | null;
  template_items: any[];
  created_at: string;
}

export class DailyMenuService {
  
  /**
   * Récupère tous les menus du jour du restaurateur
   */
  async getMyDailyMenus(): Promise<DailyMenu[]> {
    return apiClient.get('/api/v1/daily-menus/');
  }
  
  /**
   * Récupère un menu du jour spécifique
   */
  async getDailyMenu(id: string): Promise<DailyMenu> {
    return apiClient.get(`/api/v1/daily-menus/${id}/`);
  }
  
  /**
   * Récupère le menu du jour d'aujourd'hui pour un restaurant
   */
  async getTodayMenu(restaurantId: number): Promise<DailyMenu> {
    return apiClient.get(`/api/v1/daily-menus/today/?restaurant_id=${restaurantId}`);
  }
  
  /**
   * Crée un nouveau menu du jour
   */
  async createDailyMenu(data: CreateDailyMenuData): Promise<DailyMenu> {
    return apiClient.post('/api/v1/daily-menus/', data);
  }
  
  /**
   * Met à jour un menu du jour
   */
  async updateDailyMenu(id: string, data: Partial<CreateDailyMenuData>): Promise<DailyMenu> {
    return apiClient.patch(`/api/v1/daily-menus/${id}/`, data);
  }
  
  /**
   * Supprime un menu du jour
   */
  async deleteDailyMenu(id: string): Promise<void> {
    return apiClient.delete(`/api/v1/daily-menus/${id}/`);
  }
  
  /**
   * Toggle rapide de disponibilité d'un plat
   */
  async quickToggleItem(menuId: string, itemId: string): Promise<{
    success: boolean;
    item_id: string;
    is_available: boolean;
    message: string;
  }> {
    return apiClient.post(`/api/v1/daily-menus/${menuId}/quick_toggle_item/`, {
      item_id: itemId
    });
  }
  
  /**
   * Duplique un menu du jour pour une nouvelle date
   */
  async duplicateMenu(menuId: string, newDate: string): Promise<DailyMenu> {
    return apiClient.post(`/api/v1/daily-menus/${menuId}/duplicate/`, {
      date: newDate
    });
  }
  
  /**
   * Récupère des suggestions de plats pour un restaurant
   */
  async getSuggestions(restaurantId: number): Promise<{
    restaurant: string;
    suggestions: {
      popular: any[];
      seasonal: any[];
      new: any[];
    };
  }> {
    return apiClient.get(`/api/v1/daily-menus/suggestions/?restaurant_id=${restaurantId}`);
  }

  // === API PUBLIQUE ===
  
  /**
   * Récupère le menu du jour public d'un restaurant
   */
  async getPublicDailyMenu(restaurantId: number): Promise<PublicDailyMenu> {
    return apiClient.get(`/api/v1/daily-menus/public/restaurant/${restaurantId}/`);
  }
  
  /**
   * Liste des restaurants avec menu du jour aujourd'hui
   */
  async getRestaurantsWithTodayMenu(): Promise<{
    date: string;
    restaurants_count: number;
    restaurants: {
      restaurant_id: number;
      restaurant_name: string;
      restaurant_logo: string | null;
      menu_title: string;
      special_price: number | null;
      items_count: number;
    }[];
  }> {
    return apiClient.get('/api/v1/daily-menus/public/today_available/');
  }

  // === TEMPLATES ===
  
  /**
   * Récupère tous les templates de menus du jour
   */
  async getTemplates(): Promise<DailyMenuTemplate[]> {
    return apiClient.get('/api/v1/daily-menus/templates/');
  }
  
  /**
   * Applique un template pour créer un menu du jour
   */
  async applyTemplate(templateId: number, date: string): Promise<DailyMenu> {
    return apiClient.post(`/api/v1/daily-menus/templates/${templateId}/apply/`, { date });
  }

  // === MÉTHODES POUR LE CALENDRIER ===

  /**
   * Récupère le menu d'une date spécifique pour un restaurant
   */
  async getMenuByDate(restaurantId: number, date: string): Promise<DailyMenu> {
    return apiClient.get(`/api/v1/daily-menus/by-date/?restaurant_id=${restaurantId}&date=${date}`);
  }

  /**
   * Récupère les menus d'une période pour un restaurant
   */
  async getMenusByDateRange(
    restaurantId: number, 
    startDate: string, 
    endDate: string
  ): Promise<DailyMenu[]> {
    return apiClient.get(
      `/api/v1/daily-menus/range/?restaurant_id=${restaurantId}&start_date=${startDate}&end_date=${endDate}`
    );
  }

  /**
   * Vérifie si un menu existe pour une date donnée
   */
  async checkMenuExists(restaurantId: number, date: string): Promise<{ exists: boolean; menu_id?: string }> {
    try {
      const menu = await this.getMenuByDate(restaurantId, date);
      return { exists: true, menu_id: menu.id };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Copie un menu vers une nouvelle date
   */
  async copyMenuToDate(sourceMenuId: string, targetDate: string): Promise<DailyMenu> {
    return apiClient.post(`/api/v1/daily-menus/${sourceMenuId}/copy/`, {
      target_date: targetDate
    });
  }

  /**
   * Récupère le calendrier des menus du mois
   */
  async getMonthlyCalendar(
    restaurantId: number, 
    year: number, 
    month: number
  ): Promise<{
    dates_with_menu: string[];
    menu_summaries: {
      date: string;
      menu_id: string;
      title: string;
      items_count: number;
      is_active: boolean;
    }[];
  }> {
    return apiClient.get(
      `/api/v1/daily-menus/calendar/?restaurant_id=${restaurantId}&year=${year}&month=${month}`
    );
  }
}

export const dailyMenuService = new DailyMenuService();