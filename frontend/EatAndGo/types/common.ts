
// Réponse standard "succès" (quand le backend l’utilise)
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

// Typeguards utiles
export const isDRFPaginated = <T>(r: ListResponse<T>): r is DRFPaginated<T> =>
  !!r && !Array.isArray(r) && 'results' in r && 'count' in r;

export const isFrontPaginated = <T>(r: ListResponse<T>): r is FrontPaginated<T> =>
  !!r && !Array.isArray(r) && 'data' in r && 'pagination' in r;

// Normaliseur pratique (à utiliser dans services/hooks)
export function normalizeListResponse<T>(
  resp: ListResponse<T>,
  fallback: { page?: number; limit?: number } = {}
): { data: T[]; pagination: { page: number; limit: number; total: number; pages: number } } {
  const page = fallback.page ?? 1;
  const limit = fallback.limit ?? 10;

  if (Array.isArray(resp)) {
    return { data: resp, pagination: { page, limit, total: resp.length, pages: 1 } };
  }
  if (isDRFPaginated<T>(resp)) {
    const total = resp.count ?? resp.results.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    return { data: resp.results, pagination: { page, limit, total, pages } };
  }
  if (isFrontPaginated<T>(resp)) {
    return { data: resp.data, pagination: resp.pagination };
  }
  // Fallback très défensif
  return { data: [], pagination: { page, limit, total: 0, pages: 1 } };
}

// ----------------------------------------------------------------------------
// Filtres usuels alignés avec OrderViewSet (status / restaurant / order_type / search)
// ----------------------------------------------------------------------------
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed';
export type OrderType = 'dine_in' | 'takeaway';

export interface OrderSearchFilters {
  status?: OrderStatus;
  restaurant?: number;       // id du restaurant
  order_type?: OrderType;
  search?: string;           // SearchFilter DRF (numéro, nom client, table…)
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiError {
  message: string;
  code: number;
  details?: Record<string, string[]>;
}

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

export interface OrderSearchFilters {
  // Recherche
  query?: string;
  search?: string;
  
  // Filtres de commande
  status?: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'cancelled';
  payment_status?: 'pending' | 'paid' | 'failed';
  order_type?: 'dine_in' | 'takeaway';
  restaurant?: number;
  customer_name?: string;
  
  // Pagination
  page?: number;
  limit?: number;
  
  // Tri
  sort_by?: 'created_at' | 'total_amount' | 'status';
  sort_direction?: 'asc' | 'desc';
  
  // Dates et montants
  date_range?: { start: string; end: string };
  amount_range?: { min: number; max: number };
}

export interface SortOption {
  field: string;
  direction: 'asc' | 'desc';
  label: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface AppConfig {
  apiUrl: string;
  stripePublicKey: string;
  googleMapsApiKey: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
}

// Navigation types
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