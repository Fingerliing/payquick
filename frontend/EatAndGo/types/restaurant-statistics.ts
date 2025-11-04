/**
 * ============================================================================
 * TYPES RESTAURANT - VERSION UNIFIÉE ET ÉTENDUE
 * ============================================================================
 * 
 * Ce fichier combine:
 * - Types de base restaurant (existants)
 * - Types de statistiques avancées (nouveaux)
 * - Types pour analytics et KPIs
 * 
 * Compatibilité backend Django maintenue
 */

// ============================================================================
// TYPES DE BASE RESTAURANT (EXISTANTS - CONSERVÉS)
// ============================================================================

/**
 * Période d'ouverture dans une journée
 */
export interface OpeningPeriod {
  id?: string;
  startTime: string; // Format "HH:MM"
  endTime: string;   // Format "HH:MM"
  name?: string;     // Ex: "Service midi", "Service soir"
}

/**
 * Horaires d'ouverture pour un jour donné
 */
export interface OpeningHours {
  id?: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  isClosed: boolean;
  periods: OpeningPeriod[]; // Peut avoir plusieurs périodes (midi, soir, etc.)
  // Rétrocompatibilité
  openTime?: string;
  closeTime?: string;
  day_name?: string;
}

/**
 * Interface Restaurant complète alignée avec le backend Django
 */
export interface Restaurant {
  // Identifiants
  id: string;
  ownerId?: string;
  owner_id?: string;
  owner_name?: string;
  
  // Informations de base
  name: string;
  description?: string;
  cuisine: CuisineType;
  priceRange: 1 | 2 | 3 | 4;
  price_range?: 1 | 2 | 3 | 4;
  
  // Adresse et localisation
  address: string;
  city: string;
  zipCode: string;
  zip_code?: string;
  country: string;
  full_address?: string;
  
  // Géolocalisation
  latitude?: number;
  longitude?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
  
  // Contact
  phone: string;
  email: string;
  website?: string;
  
  // Images et médias
  image?: string | File | null;
  image_url?: string;
  image_name?: string;
  image_size?: number;
  
  // Évaluation et avis
  rating: number;
  reviewCount: number;
  review_count?: number;
  
  // Statut et gestion
  isActive: boolean;
  is_active?: boolean;
  can_receive_orders: boolean;
  is_stripe_active?: boolean;
  
  // Fermetures manuelles
  isManuallyOverridden?: boolean;
  is_manually_overridden?: boolean;
  manualOverrideReason?: string;
  manual_override_reason?: string;
  manualOverrideUntil?: string;
  manual_override_until?: string;
  lastStatusChangedBy?: string;
  last_status_changed_by?: string;
  lastStatusChangedAt?: string;
  last_status_changed_at?: string;
  
  // Horaires d'ouverture
  openingHours: OpeningHours[];
  opening_hours?: OpeningHours[];
  
  // Titres-restaurant
  accepts_meal_vouchers: boolean;
  meal_voucher_info?: string;
  accepts_meal_vouchers_display?: string;
  
  // Métadonnées
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
  
  // SIRET
  siret?: string;
}

/**
 * Données pour créer un restaurant
 */
export interface CreateRestaurantData {
  name: string;
  description?: string;
  address: string;
  city: string;
  zipCode: string;
  country?: string;
  phone: string;
  email: string;
  website?: string;
  cuisine: CuisineType;
  priceRange: 1 | 2 | 3 | 4;
  latitude?: number;
  longitude?: number;
  image?: File | null;
  accepts_meal_vouchers?: boolean;
  meal_voucher_info?: string;
  openingHours?: OpeningHours[];
}

/**
 * Données pour mettre à jour un restaurant
 */
export interface UpdateRestaurantData extends Partial<CreateRestaurantData> {
  id?: string;
}

/**
 * Types de cuisine disponibles
 */
export type CuisineType = 
  | 'french'
  | 'italian' 
  | 'asian'
  | 'mexican'
  | 'indian'
  | 'american'
  | 'mediterranean'
  | 'japanese'
  | 'chinese'
  | 'thai'
  | 'other';

/**
 * Options de cuisine avec labels
 */
export interface CuisineOption {
  value: CuisineType;
  label: string;
}

export const CUISINE_OPTIONS: CuisineOption[] = [
  { value: 'french', label: 'Française' },
  { value: 'italian', label: 'Italienne' },
  { value: 'asian', label: 'Asiatique' },
  { value: 'mexican', label: 'Mexicaine' },
  { value: 'indian', label: 'Indienne' },
  { value: 'american', label: 'Américaine' },
  { value: 'mediterranean', label: 'Méditerranéenne' },
  { value: 'japanese', label: 'Japonaise' },
  { value: 'chinese', label: 'Chinoise' },
  { value: 'thai', label: 'Thaïlandaise' },
  { value: 'other', label: 'Autre' }
];

/**
 * Options de gamme de prix
 */
export interface PriceRangeOption {
  value: 1 | 2 | 3 | 4;
  label: string;
  symbol: string;
}

export const PRICE_RANGE_OPTIONS: PriceRangeOption[] = [
  { value: 1, label: 'Économique', symbol: '€' },
  { value: 2, label: 'Modéré', symbol: '€€' },
  { value: 3, label: 'Cher', symbol: '€€€' },
  { value: 4, label: 'Très cher', symbol: '€€€€' }
];

// ============================================================================
// TYPES STATISTIQUES BASIQUES (EXISTANTS - ÉTENDUS)
// ============================================================================

/**
 * Statistiques de base d'un restaurant (format simple)
 */
export interface RestaurantStats {
  orders: {
    total: number;
    active: number;
    pending: number;
    in_progress: number;
    served: number;
    paid: number;
    unpaid: number;
  };
  tables: {
    total: number;
    active?: number;
  };
  menus: {
    total: number;
    active: number;
  };
  menu_items?: {
    total: number;
    available: number;
  };
}

/**
 * Restaurant avec statistiques pour le dashboard
 */
export interface RestaurantWithStats extends Restaurant {
  stats?: RestaurantStats;
  active_orders?: number;
  total_tables?: number;
  has_image?: boolean;
}

// ============================================================================
// TYPES STATISTIQUES AVANCÉES (NOUVEAUX)
// ============================================================================

/**
 * Période d'analyse des statistiques
 */
export interface Period {
  days: number;
  start_date: string;
  end_date: string;
}

/**
 * Statistiques détaillées des commandes
 */
export interface OrdersStats {
  total: number;
  total_last_period: number;
  pending: number;
  in_progress: number;
  served: number;
  cancelled: number;
  paid: number;
  unpaid: number;
}

/**
 * Statistiques des menus
 */
export interface MenusStats {
  total: number;
  active: number;
}

/**
 * Statistiques des items de menu
 */
export interface MenuItemsStats {
  total: number;
  available: number;
}

/**
 * Statistiques des tables
 */
export interface TablesStats {
  total: number;
}

/**
 * Informations du restaurant pour les stats
 */
export interface RestaurantInfo {
  name: string;
  can_receive_orders: boolean;
  is_stripe_active: boolean;
}

/**
 * Vue d'ensemble des statistiques
 */
export interface Overview {
  orders: OrdersStats;
  menus: MenusStats;
  menu_items: MenuItemsStats;
  tables: TablesStats;
  restaurant: RestaurantInfo;
}

// ============================================================================
// KPIs (Indicateurs Clés de Performance)
// ============================================================================

/**
 * Indicateurs clés de performance d'un restaurant
 */
export interface KPIs {
  cancellation_rate: number;        // Taux d'annulation (%)
  payment_rate: number;              // Taux de paiement (%)
  availability_rate: number;         // Taux de disponibilité des plats (%)
  avg_order_value: number;           // Ticket moyen (€)
  avg_service_time_minutes: number | null; // Temps de service moyen (min)
  table_usage_rate: number;          // Taux d'utilisation des tables (%)
}

// ============================================================================
// PERFORMANCE DES PLATS
// ============================================================================

/**
 * Plat le plus commandé (top performer)
 */
export interface TopDish {
  id: number;
  name: string;
  price: number;
  total_orders: number;   // Quantité totale commandée
  revenue: number;        // CA généré
  orders_count: number;   // Nombre de commandes distinctes
}

/**
 * Plat sous-performant
 */
export interface UnderperformingDish {
  id: number;
  name: string;
  price: number;
  orders_count: number;
}

/**
 * Analyse de la performance des plats
 */
export interface DishesPerformance {
  top_dishes: TopDish[];
  underperforming_dishes: UnderperformingDish[];
  never_ordered_count: number;
}

// ============================================================================
// REVENUS ET FINANCES
// ============================================================================

/**
 * Analyse détaillée des revenus
 */
export interface Revenue {
  current_period: number;      // CA période actuelle
  previous_period: number;     // CA période précédente
  evolution_percent: number;   // Évolution en %
  avg_order_value: number;     // Ticket moyen
  total_orders: number;        // Nombre total de commandes
}

// ============================================================================
// HEURES DE POINTE
// ============================================================================

/**
 * Heure de pointe identifiée
 */
export interface PeakHour {
  hour: string;           // Format "HH:00"
  orders_count: number;   // Nombre de commandes
}

/**
 * Distribution horaire des commandes
 */
export interface HourlyDistribution {
  hour: number;           // Heure (0-23)
  orders_count: number;   // Nombre de commandes
}

// ============================================================================
// TABLES POPULAIRES
// ============================================================================

/**
 * Table la plus utilisée
 */
export interface PopularTable {
  table_id: number;
  table_number: string;
  orders_count: number;
  revenue: number;
}

// ============================================================================
// PERFORMANCE QUOTIDIENNE
// ============================================================================

/**
 * Distribution par jour de la semaine
 */
export interface DayDistribution {
  day: string;              // Ex: "Lundi", "Mardi"
  orders_count: number;
  revenue: number;
}

/**
 * Meilleur/Pire jour
 */
export interface BestWorstDay {
  day: string;
  orders_count: number;
}

/**
 * Performance par jour de la semaine
 */
export interface DailyPerformance {
  distribution: DayDistribution[];
  best_day: BestWorstDay | null;
  worst_day: BestWorstDay | null;
}

// ============================================================================
// RECOMMANDATIONS
// ============================================================================

export type RecommendationType = 'success' | 'warning' | 'info' | 'error';
export type RecommendationCategory = 'commandes' | 'menu' | 'service' | 'tables' | 'revenus' | 'general';
export type RecommendationPriority = 'high' | 'medium' | 'low';

/**
 * Recommandation personnalisée pour améliorer les performances
 */
export interface Recommendation {
  type: RecommendationType;
  category: RecommendationCategory;
  title: string;
  message: string;
  priority: RecommendationPriority;
}

// ============================================================================
// STATISTIQUES COMPLÈTES
// ============================================================================

/**
 * Objet complet de statistiques d'un restaurant
 * Retourné par GET /api/v1/restaurants/{id}/statistics/
 */
export interface RestaurantStatistics {
  period: Period;
  overview: Overview;
  kpis: KPIs;
  dishes_performance: DishesPerformance;
  revenue: Revenue;
  peak_hours: PeakHour[];
  hourly_distribution: HourlyDistribution[];
  popular_tables: PopularTable[];
  daily_performance: DailyPerformance;
  recommendations: Recommendation[];
}

// ============================================================================
// DASHBOARD COMPLET
// ============================================================================

/**
 * Commande récente pour le dashboard
 */
export interface RecentOrder {
  id: number;
  table_number: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  is_paid: boolean;
}

/**
 * Item populaire pour le dashboard
 */
export interface PopularItem {
  name: string;
  quantity: number;
}

/**
 * Stats de revenus pour le dashboard
 */
export interface RevenueStats {
  today: number;
  week: number;
  month: number;
}

/**
 * Dashboard complet d'un restaurant
 * Retourné par GET /api/v1/restaurants/{id}/dashboard/
 */
export interface RestaurantDashboard {
  statistics: RestaurantStatistics;
  recent_orders: RecentOrder[];
  popular_items: PopularItem[];
  revenue: RevenueStats;
}

// ============================================================================
// STATUT EN TEMPS RÉEL
// ============================================================================

/**
 * Statut en temps réel d'un restaurant
 */
export interface RestaurantRealtimeStatus {
  restaurant: {
    id: string;
    name: string;
    isActive: boolean;
    isManuallyOverridden: boolean;
    manualOverrideReason?: string;
    manualOverrideUntil?: string;
    can_receive_orders: boolean;
  };
  status: {
    isOpen: boolean;
    status: string;
    shortStatus: string;
    type: 'open' | 'closed_schedule' | 'manual_override' | 'inactive' | 'error';
    currentPeriod?: {
      name?: string;
      startTime: string;
      endTime: string;
    };
    nextOpening?: string;
    error?: string;
  };
  timestamp: string;
}

/**
 * Données pour fermeture manuelle
 */
export interface ManualCloseData {
  reason: string;
  until?: string;
  duration_hours?: number;
}

/**
 * Réponse de fermeture manuelle
 */
export interface ManualCloseResponse {
  success: boolean;
  message: string;
  restaurant: {
    id: string;
    name: string;
    isManuallyOverridden: boolean;
    manualOverrideReason?: string;
    manualOverrideUntil?: string;
    can_receive_orders: boolean;
  };
}

// ============================================================================
// HELPERS & UTILITIES
// ============================================================================

/**
 * Calcule le pourcentage entre deux nombres
 */
export const calculatePercentage = (part: number, total: number): number => {
  if (!total || total === 0) return 0;
  return Math.round((part / total) * 100);
};

/**
 * Formate un montant en euros
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

/**
 * Formate une durée en minutes
 */
export const formatDuration = (minutes: number | null): string => {
  if (minutes === null) return 'N/A';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}min`;
};

/**
 * Obtient la couleur selon le type de recommandation
 */
export const getRecommendationColor = (type: RecommendationType): string => {
  const colors = {
    success: '#10b981',
    warning: '#f59e0b',
    info: '#3b82f6',
    error: '#ef4444',
  };
  return colors[type];
};

/**
 * Obtient l'icône selon la catégorie de recommandation
 */
export const getRecommendationIcon = (category: RecommendationCategory): string => {
  const icons = {
    commandes: 'cart-outline',
    menu: 'restaurant-outline',
    service: 'time-outline',
    tables: 'grid-outline',
    revenus: 'trending-up-outline',
    general: 'information-circle-outline',
  };
  return icons[category];
};

/**
 * Détermine le niveau de performance d'un KPI
 */
export const getKPILevel = (
  value: number,
  thresholds: { good: number; warning: number },
  higherIsBetter: boolean = true
): 'good' | 'warning' | 'critical' => {
  if (higherIsBetter) {
    if (value >= thresholds.good) return 'good';
    if (value >= thresholds.warning) return 'warning';
    return 'critical';
  } else {
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.warning) return 'warning';
    return 'critical';
  }
};

/**
 * Formate un nom de jour en abrégé
 */
export const formatDayShort = (day: string): string => {
  const days: { [key: string]: string } = {
    'Lundi': 'Lun',
    'Mardi': 'Mar',
    'Mercredi': 'Mer',
    'Jeudi': 'Jeu',
    'Vendredi': 'Ven',
    'Samedi': 'Sam',
    'Dimanche': 'Dim',
  };
  return days[day] || day.substring(0, 3);
};

/**
 * Obtient la couleur selon le niveau de performance
 */
export const getPerformanceColor = (level: 'good' | 'warning' | 'critical'): string => {
  const colors = {
    good: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
  };
  return colors[level];
};