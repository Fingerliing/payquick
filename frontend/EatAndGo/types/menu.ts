export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  is_available: boolean;
  menu: number;
  allergens: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  created_at?: string;
  updated_at?: string;
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
export interface Allergen {
  id: string;
  name: string;
  icon: string;
  description: string;
}

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
  allergens: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
}

export interface UpdateMenuItemRequest {
  name?: string;
  description?: string;
  price?: string;
  category?: string;
  is_available?: boolean;
  allergens?: string[];
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
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