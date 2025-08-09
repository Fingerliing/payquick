export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
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