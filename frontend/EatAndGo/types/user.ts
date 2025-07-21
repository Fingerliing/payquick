export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  last_login: string | null;
  role: 'client' | 'restaurateur';
  profile: ClientProfile | RestaurateurProfile;
  restaurants: Restaurant[];
  stats: UserStats;
  permissions: UserPermissions;
  roles: UserRoles;
  recent_orders: RecentOrder[];
  is_authenticated: boolean;
}

export interface ClientProfile {
  id: number;
  user: number;
  phone: string;
  type: 'client';
  has_validated_profile: boolean;
}

export interface RestaurateurProfile {
  id: number;
  user: number;
  siret: string;
  is_validated: boolean;
  is_active: boolean;
  created_at: string;
  stripe_verified: boolean;
  stripe_account_id: string | null;
  type: 'restaurateur';
  stripe_onboarding_completed: boolean;
  stripe_account_created: string | null;
  has_validated_profile: boolean;
  nom: string;
  telephone: string;
}

export interface Restaurant {
  id: number;
  name: string;
  description: string;
  address: string;
  siret: string;
  total_orders: number;
  pending_orders: number;
  menus_count: number;
  can_receive_orders: boolean;
  owner_stripe_validated: boolean;
  is_stripe_active: boolean;
  // Optionnel : autres champs selon votre modèle
  created_at?: string;
  updated_at?: string;
  phone?: string;
  email?: string;
  image?: string;
  is_active?: boolean;
}

export interface UserStats {
  // Pour les restaurateurs
  total_restaurants?: number;
  total_orders?: number;
  pending_orders?: number;
  active_restaurants?: number;
  stripe_validated?: boolean;
  stripe_onboarding_completed?: boolean;
  
  // Pour les clients
  favorite_restaurants?: Restaurant[];
}

export interface UserPermissions {
  is_staff: boolean;
  is_superuser: boolean;
  can_create_restaurant: boolean;
  can_manage_orders: boolean;
  groups: string[];
  user_permissions: string[];
}

export interface UserRoles {
  is_client: boolean;
  is_restaurateur: boolean;
  is_staff: boolean;
  is_admin: boolean;
  has_validated_profile: boolean;
}

export interface RecentOrder {
  id: number;
  restaurant_name: string;
  restaurant_id: number | null;
  table: string;
  status: 'pending' | 'in_progress' | 'served' | 'delivered';
  is_paid: boolean;
  created_at: string;
  items_count: number;
  // Optionnel : propriétés compatibles avec votre contexte OrderContext
  restaurant?: {
    id: number;
    name: string;
  };
  total?: number;
  createdAt?: string; // Alias pour compatibilité
}

// Types additionnels pour Stripe
export interface StripeAccount {
  status: string;
  account_id?: string;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
  };
  has_validated_profile?: boolean;
  message?: string;
}

export interface StripeOnboarding {
  account_id: string;
  onboarding_url: string;
  message: string;
}

export interface StripeOnboardingLink {
  account_id: string;
  onboarding_url: string;
}

// Types pour les menus (optionnel selon vos besoins)
export interface Menu {
  id: number;
  name: string;
  restaurant: number;
  created_at: string;
  updated_at: string;
  disponible?: boolean;
  items?: MenuItem[];
}

export interface MenuItem {
  id: number;
  menu: number;
  name: string;
  description: string;
  price: number;
  category: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

// Types pour les tables (optionnel)
export interface Table {
  id: number;
  restaurant: number;
  identifiant: string;
  qr_code_file?: string;
  created_at: string;
}

// Types pour les commandes détaillées (optionnel)
export interface OrderItem {
  id: number;
  order: number;
  menu_item: MenuItem;
  quantity: number;
}

export interface DetailedOrder {
  id: number;
  restaurateur: number;
  restaurant: Restaurant | null;
  table: Table;
  status: 'pending' | 'in_progress' | 'served';
  is_paid: boolean;
  created_at: string;
  order_items: OrderItem[];
}

// Type utilitaire pour les réponses d'erreur API
export interface ApiError {
  message: string;
  code?: number;
  details?: any;
  username?: string[];
  password?: string[];
  siret?: string[];
  non_field_errors?: string[];
}

// Type pour les réponses API génériques
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: ApiError;
}

// Types pour l'authentification
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  password: string;
  nom: string;
  role: 'client' | 'restaurateur';
  telephone?: string;
  siret?: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

// Énumérations utiles
export enum UserRole {
  CLIENT = 'client',
  RESTAURATEUR = 'restaurateur'
}

export enum OrderStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress', 
  SERVED = 'served',
  DELIVERED = 'delivered'
}

export enum StripeAccountStatus {
  NO_ACCOUNT = 'no_account',
  ACCOUNT_EXISTS = 'account_exists',
  CLIENT_ACCOUNT = 'client_account',
  UNKNOWN_USER = 'unknown_user'
}

// Type guards utiles
export function isRestaurateurProfile(profile: ClientProfile | RestaurateurProfile): profile is RestaurateurProfile {
  return profile.type === 'restaurateur';
}

export function isClientProfile(profile: ClientProfile | RestaurateurProfile): profile is ClientProfile {
  return profile.type === 'client';
}

export function isRestaurateur(user: User): boolean {
  return user.role === 'restaurateur';
}

export function isClient(user: User): boolean {
  return user.role === 'client';
}

// Helper types pour les formulaires
export type RestaurantFormData = Pick<Restaurant, 'name' | 'description' | 'address' | 'siret'>;
export type MenuFormData = Pick<Menu, 'name'>;
export type MenuItemFormData = Pick<MenuItem, 'name' | 'description' | 'price' | 'category'>;

// Export par défaut pour faciliter l'import
export default User;