export enum VATCategory {
  FOOD = 'FOOD',                     // Aliments (sur place et à emporter)
  DRINK_SOFT = 'DRINK_SOFT',         // Boissons sans alcool
  DRINK_ALCOHOL = 'DRINK_ALCOHOL',   // Boissons alcoolisées
  PACKAGED = 'PACKAGED'              // Produits préemballés
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string; // ID de la catégorie
  subcategory?: string; // ID de la sous-catégorie (optionnel)
  is_available: boolean;
  menu: number;
  allergens: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  preparation_time?: number; // Temps de préparation en minutes
  
  // === GESTION D'IMAGES ===
  image_url?: string; // URL de l'image principale
  image_alt?: string; // Texte alternatif pour l'accessibilité
  thumbnail_url?: string; // URL de la miniature (généré automatiquement)
  has_image: boolean; // Indicateur si l'item a une image
  
  // Métadonnées d'image (optionnelles, pour optimisation)
  image_metadata?: {
    width?: number;
    height?: number;
    file_size?: number; // En bytes
    format?: 'jpg' | 'png' | 'webp';
    uploaded_at?: string;
  };

  // Champs calculés/enrichis depuis le backend
  category_name?: string;
  category_icon?: string;
  subcategory_name?: string;
  allergen_display?: string[];
  dietary_tags?: string[];
  
  // Métadonnées
  created_at?: string;
  updated_at?: string;

  // TVA
  vat_category: VATCategory;
  vat_rate: number;              // Taux de TVA (ex: 0.10 pour 10%)
  price_excl_vat: number;         // Prix HT calculé
  vat_amount: number;             // Montant TVA
  vat_rate_display: string;       // Ex: "10.0%"
}

export interface Menu {
  id: number;
  name: string;
  restaurant: number;
  items: MenuItem[];
  created_at: string;
  updated_at: string;
  restaurant_owner_id: number;
  is_available?: boolean;
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
  is_available?: boolean;
}

export interface CreateMenuItemRequest {
  name: string;
  description: string;
  price: string;
  category: string; // ID de la catégorie (obligatoire)
  subcategory?: string; // ID de la sous-catégorie (optionnel)
  menu: number;
  allergens: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  preparation_time?: number;
}

export interface UpdateMenuItemRequest {
  name?: string;
  description?: string;
  price?: string;
  category?: string;
  subcategory?: string;
  is_available?: boolean;
  allergens?: string[];
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
  preparation_time?: number;
}

// Types pour les réponses API spécifiques
export interface MenuToggleResponse {
  id: number;
  is_available: boolean;
  message?: string;
}

export interface MenuItemToggleResponse {
  id: number;
  is_available: boolean;
}

// Types pour les filtres et recherches
export interface MenuItemFilters {
  category?: string;
  subcategory?: string;
  is_available?: boolean;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
  allergen_free?: string[]; // Liste des allergènes à exclure
  max_price?: number;
  min_price?: number;
  search?: string; // Recherche textuelle
}

export interface DietaryOptionsFilters {
  vegetarian?: boolean;
  vegan?: boolean;
  gluten_free?: boolean;
}

// Énumération pour les allergènes reconnus (basée sur la réglementation européenne)
export enum AllergenType {
  GLUTEN = 'gluten',
  CRUSTACEANS = 'crustaceans',
  EGGS = 'eggs',
  FISH = 'fish',
  PEANUTS = 'peanuts',
  SOYBEANS = 'soybeans',
  MILK = 'milk',
  NUTS = 'nuts',
  CELERY = 'celery',
  MUSTARD = 'mustard',
  SESAME = 'sesame',
  SULPHITES = 'sulphites',
  LUPIN = 'lupin',
  MOLLUSCS = 'molluscs'
}

// Types pour les options diététiques
export interface DietaryTags {
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  allergen_count: number;
  allergens: string[];
}

// Types pour l'affichage groupé par catégorie
export interface MenuItemsByCategory {
  category: {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    order: number;
  };
  subcategories?: Array<{
    id: string;
    name: string;
    order: number;
    items: MenuItem[];
  }>;
  items: MenuItem[]; // Items sans sous-catégorie
  total_items: number;
}

export interface GroupedMenu {
  menu: Menu;
  categories: MenuItemsByCategory[];
  total_items: number;
  dietary_summary: {
    vegetarian_count: number;
    vegan_count: number;
    gluten_free_count: number;
  };
}

// Types pour les statistiques de menu
export interface MenuStatistics {
  total_items: number;
  available_items: number;
  categories_used: number;
  subcategories_used: number;
  dietary_breakdown: {
    vegetarian: number;
    vegan: number;
    gluten_free: number;
  };
  allergen_breakdown: Record<string, number>;
  price_range: {
    min: number;
    max: number;
    average: number;
  };
}

// Types d'erreur spécifiques aux menus
export interface MenuItemValidationError {
  field: keyof CreateMenuItemRequest;
  message: string;
  code?: string;
}

export interface MenuValidationErrors {
  errors: MenuItemValidationError[];
  general_errors?: string[];
}