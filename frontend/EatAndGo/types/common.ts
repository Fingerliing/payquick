// ----------------------------------------------------------------------------
// RÉPONSES API STANDARDS
// ----------------------------------------------------------------------------

// Réponse standard "succès" (quand le backend l'utilise)
export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

// Pagination DRF classique
export interface DRFPaginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Ancien type front (pas garanti côté backend, on le garde pour compat éventuelle)
export interface FrontPaginated<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Union tolérante pour les listes potentiellement non paginées
export type ListResponse<T> = T[] | DRFPaginated<T> | FrontPaginated<T>;

// Réponse paginée normalisée
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ----------------------------------------------------------------------------
// TYPEGUARDS ET HELPERS POUR PAGINATION
// ----------------------------------------------------------------------------

export const isDRFPaginated = <T>(r: ListResponse<T>): r is DRFPaginated<T> =>
  !!r && !Array.isArray(r) && 'results' in r && 'count' in r;

export const isFrontPaginated = <T>(r: ListResponse<T>): r is FrontPaginated<T> =>
  !!r && !Array.isArray(r) && 'data' in r && 'pagination' in r;

// Normaliseur pratique (à utiliser dans services/hooks)
export function normalizeListResponse<T>(
  resp: ListResponse<T>,
  fallback: { page?: number; limit?: number } = {}
): PaginatedResponse<T> {
  const page = fallback.page ?? 1;
  const limit = fallback.limit ?? 10;

  if (Array.isArray(resp)) {
    return { 
      data: resp, 
      pagination: { page, limit, total: resp.length, pages: 1 } 
    };
  }
  
  if (isDRFPaginated<T>(resp)) {
    const total = resp.count ?? resp.results.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    return { 
      data: resp.results, 
      pagination: { page, limit, total, pages } 
    };
  }
  
  if (isFrontPaginated<T>(resp)) {
    return { 
      data: resp.data, 
      pagination: resp.pagination 
    };
  }
  
  // Fallback très défensif
  return { 
    data: [], 
    pagination: { page, limit, total: 0, pages: 1 } 
  };
}

// ----------------------------------------------------------------------------
// TYPES DE BASE POUR LES COMMANDES (alignés avec le backend Django)
// ----------------------------------------------------------------------------

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed';
export type OrderType = 'dine_in' | 'takeaway';

// ----------------------------------------------------------------------------
// FILTRES DE RECHERCHE
// ----------------------------------------------------------------------------

// Filtres génériques pour les recherches de restaurants
export interface SearchFilters {
  query?: string;
  cuisine?: string;
  priceRange?: number[];
  rating?: number;
  isOpen?: boolean;
  deliveryTime?: number;
  location?: {
    latitude: number;
    longitude: number;
    radius: number; // en km
  };
}

// Filtres spécifiques aux commandes (alignés avec OrderViewSet)
export interface OrderSearchFilters {
  // Recherche textuelle
  search?: string;           // SearchFilter DRF (numéro, nom client, table…)
  
  // Filtres de base
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  order_type?: OrderType;
  restaurant?: number;       // ID du restaurant
  customer_name?: string;
  table_number?: string;
  
  // Pagination
  page?: number;
  limit?: number;
  page_size?: number;        // Alternative DRF
  
  // Tri (aligné avec ordering_fields du ViewSet)
  ordering?: string;         // Format DRF: '-created_at', 'total_amount'
  sort_by?: 'created_at' | 'total_amount' | 'status';
  sort_direction?: 'asc' | 'desc';
  
  // Filtres avancés
  date_range?: { start: string; end: string };
  amount_range?: { min: number; max: number };
  created_at?: string;       // ISO date pour filtre par date
  updated_at?: string;       // ISO date pour filtre par date
}

// ----------------------------------------------------------------------------
// GESTION DES ERREURS
// ----------------------------------------------------------------------------

export interface ApiError {
  message: string;
  code?: number;
  status?: number;
  details?: Record<string, string[]>;
  validation_errors?: Record<string, string[]>;
}

// Helper pour extraire un message d'erreur lisible
export const extractErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  
  if (error?.message) return error.message;
  if (error?.detail) return error.detail;
  if (error?.error) return error.error;
  
  // Erreurs de validation Django
  if (error?.validation_errors || error?.details) {
    const errors = error.validation_errors || error.details;
    const messages = Object.values(errors).flat();
    return messages.join(', ');
  }
  
  return 'Une erreur inattendue s\'est produite';
};

// ----------------------------------------------------------------------------
// OPTIONS DE TRI
// ----------------------------------------------------------------------------

export interface SortOption {
  field: string;
  direction: 'asc' | 'desc';
  label: string;
}

// Options de tri pour les commandes
export const ORDER_SORT_OPTIONS: SortOption[] = [
  { field: 'created_at', direction: 'desc', label: 'Plus récentes' },
  { field: 'created_at', direction: 'asc', label: 'Plus anciennes' },
  { field: 'total_amount', direction: 'desc', label: 'Montant décroissant' },
  { field: 'total_amount', direction: 'asc', label: 'Montant croissant' },
  { field: 'status', direction: 'asc', label: 'Statut' },
];

// ----------------------------------------------------------------------------
// CONFIGURATION ET UPLOAD
// ----------------------------------------------------------------------------

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface AppConfig {
  apiUrl: string;
  stripePublicKey: string;
  googleMapsApiKey?: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
}

// ----------------------------------------------------------------------------
// TYPES DE NAVIGATION (React Native / Expo Router)
// ----------------------------------------------------------------------------

export type RootStackParamList = {
  '(tabs)': undefined;
  '(auth)': undefined;
  'restaurant/[id]': { id: string };
  'restaurant/add': undefined;
  'restaurant/edit/[id]': { id: string };
  'menu/[id]': { restaurantId: string; menuId: string };
  'menu/add': { restaurantId: string };
  'order/[id]': { id: string };
  'order/checkout': { restaurantId: string };
  'order/success': { orderId: string };
  '+not-found': undefined;
};

export type TabsParamList = {
  index: undefined;
  restaurants: undefined;
  orders: undefined;
  menu: undefined;
  profile: undefined;
};

export type AuthParamList = {
  login: undefined;
  register: undefined;
  'forgot-password': undefined;
};

// ----------------------------------------------------------------------------
// HELPERS UTILITAIRES
// ----------------------------------------------------------------------------

// Helper pour construire des URLs de pagination DRF
export const buildDRFParams = (filters: OrderSearchFilters): Record<string, any> => {
  const params: Record<string, any> = {};
  
  // Pagination
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.page_size = filters.limit;
  if (filters.page_size) params.page_size = filters.page_size;
  
  // Filtres de base
  if (filters.search) params.search = filters.search;
  if (filters.status) params.status = filters.status;
  if (filters.payment_status) params.payment_status = filters.payment_status;
  if (filters.order_type) params.order_type = filters.order_type;
  if (filters.restaurant) params.restaurant = filters.restaurant;
  
  // Tri
  if (filters.ordering) {
    params.ordering = filters.ordering;
  } else if (filters.sort_by && filters.sort_direction) {
    const prefix = filters.sort_direction === 'desc' ? '-' : '';
    params.ordering = `${prefix}${filters.sort_by}`;
  }
  
  return params;
};

// Helper pour valider les paramètres de pagination
export const validatePaginationParams = (
  page?: number, 
  limit?: number
): { page: number; limit: number } => {
  const validPage = Math.max(1, page || 1);
  const validLimit = Math.min(100, Math.max(1, limit || 10));
  return { page: validPage, limit: validLimit };
};

// Helper pour créer des filtres de recherche vides
export const createEmptyOrderFilters = (): OrderSearchFilters => ({
  page: 1,
  limit: 10,
});

// Type guard pour vérifier si une réponse est une erreur
export const isApiError = (response: any): response is ApiError => {
  return response && (
    typeof response.message === 'string' ||
    typeof response.error === 'string' ||
    typeof response.detail === 'string' ||
    response.validation_errors ||
    response.details
  );
};

export type MonetaryAmount = string; // Toujours string côté backend
export const parseAmount = (amount: MonetaryAmount | number): number => {
  return typeof amount === 'number' ? amount : parseFloat(amount);
};