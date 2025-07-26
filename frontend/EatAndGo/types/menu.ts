export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  is_available: boolean;
  menu: number;
}

export interface Menu {
  id: number;
  name: string;
  restaurant: number;
  items: MenuItem[];
  created_at: string;
  updated_at: string;
  restaurant_owner_id: number;
  disponible?: boolean;
}

// Types utilitaires pour les formulaires
export interface CreateMenuRequest {
  name: string;
  restaurant: number;
}

export interface UpdateMenuRequest {
  name?: string;
  disponible?: boolean;
}

export interface CreateMenuItemRequest {
  name: string;
  description: string;
  price: string;
  category: string;
  menu: number;
}

export interface UpdateMenuItemRequest {
  name?: string;
  description?: string;
  price?: string;
  category?: string;
  is_available?: boolean;
}

// Types pour les réponses API spécifiques
export interface MenuToggleResponse {
  id: number;
  disponible: boolean;
}

export interface MenuItemToggleResponse {
  id: number;
  is_available: boolean;
}

// Énumération pour les catégories (optionnel mais utile)
export enum MenuItemCategory {
  ENTREE = 'Entrée',
  PLAT = 'Plat principal',
  DESSERT = 'Dessert',
  BOISSON = 'Boisson',
  APERITIF = 'Apéritif',
  FROMAGE = 'Fromage'
}