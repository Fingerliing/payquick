export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active: boolean;
  order: number;
  restaurant: string;
  restaurant_name?: string;
  subcategories?: MenuSubCategory[];
  active_subcategories_count?: number;
  total_menu_items_count?: number;
  created_at: string;
  updated_at: string;
}

export interface MenuSubCategory {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  order: number;
  category?: string; // ID de la catégorie parente
  menu_items_count?: number;
  restaurant_id?: string;
  created_at: string;
  updated_at: string;
}

// Types pour les requêtes de création
export interface CreateMenuCategoryRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active?: boolean;
  order?: number;
}

export interface CreateMenuSubCategoryRequest {
  category: string; // ID de la catégorie parente
  name: string;
  description?: string;
  is_active?: boolean;
  order?: number;
}

// Types pour les requêtes de mise à jour
export interface UpdateMenuCategoryRequest {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  is_active?: boolean;
  order?: number;
}

export interface UpdateMenuSubCategoryRequest {
  name?: string;
  description?: string;
  is_active?: boolean;
  order?: number;
}

// Types pour les réponses API spécifiques
export interface CategoryByRestaurantResponse {
  restaurant: {
    id: string;
    name: string;
  };
  categories: MenuCategory[];
  total_count: number;
}

export interface SubCategoryByCategoryResponse {
  category: {
    id: string;
    name: string;
    icon?: string;
    color?: string;
  };
  subcategories: MenuSubCategory[];
  total_count: number;
}

export interface CategoryReorderRequest {
  restaurant_id: string;
  categories: Array<{
    id: string;
    order: number;
  }>;
}

export interface SubCategoryReorderRequest {
  category_id: string;
  subcategories: Array<{
    id: string;
    order: number;
  }>;
}

export interface CategoryReorderResponse {
  message: string;
  updated_count: number;
  restaurant_id: string;
}

export interface SubCategoryReorderResponse {
  message: string;
  updated_count: number;
  category_id: string;
}

export interface CategoryBulkToggleRequest {
  restaurant_id: string;
  category_ids: string[];
  is_active: boolean;
}

export interface CategoryBulkToggleResponse {
  message: string;
  updated_count: number;
  restaurant_id: string;
}

export interface CategoryStatistics {
  restaurant: {
    id: string;
    name: string;
  };
  totals: {
    categories: number;
    active_categories: number;
    subcategories: number;
    active_subcategories: number;
    menu_items: number;
    available_menu_items: number;
  };
  categories_breakdown: Array<{
    id: string;
    name: string;
    icon?: string;
    color?: string;
    is_active: boolean;
    order: number;
    subcategories_count: number;
    active_subcategories_count: number;
    menu_items_count: number;
    available_menu_items_count: number;
  }>;
}

// Énumération pour les couleurs de catégories prédéfinies
export enum CategoryColor {
  RED = '#EF4444',
  ORANGE = '#F97316',
  AMBER = '#F59E0B',
  YELLOW = '#EAB308',
  LIME = '#84CC16',
  GREEN = '#22C55E',
  EMERALD = '#10B981',
  TEAL = '#14B8A6',
  CYAN = '#06B6D4',
  SKY = '#0EA5E9',
  BLUE = '#3B82F6',
  INDIGO = '#6366F1',
  VIOLET = '#8B5CF6',
  PURPLE = '#A855F7',
  FUCHSIA = '#D946EF',
  PINK = '#EC4899',
  ROSE = '#F43F5E'
}

// Types utilitaires pour l'interface utilisateur
export interface CategoryFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface SubCategoryFormData {
  name: string;
  description: string;
}