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
 * Horaires d'ouverture pour un jour donné - MODIFIÉ
 */
export interface OpeningHours {
  id?: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  isClosed: boolean;
  periods: OpeningPeriod[]; // NOUVEAU: Peut avoir plusieurs périodes (midi, soir, etc.)
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
  price_range?: 1 | 2 | 3 | 4; // Snake case pour compatibilité backend
  
  // Adresse et localisation
  address: string;
  city: string;
  zipCode: string;
  zip_code?: string; // Snake case pour compatibilité backend
  country: string;
  full_address?: string; // Calculé par le backend
  
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
  review_count?: number; // Snake case pour compatibilité backend
  
  // Statut et gestion
  isActive: boolean;
  is_active?: boolean; // Snake case pour compatibilité backend
  can_receive_orders: boolean;
  is_stripe_active?: boolean;
  
  // Fermetures manuelles (NOUVEAU)
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
  opening_hours?: OpeningHours[]; // Snake case pour compatibilité backend
  
  // Titres-restaurant
  accepts_meal_vouchers: boolean;
  meal_voucher_info?: string;
  accepts_meal_vouchers_display?: string;
  
  // Métadonnées
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
  
  // SIRET (pour les restaurateurs français)
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
 * Statistiques d'un restaurant
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

/**
 * Templates pour horaires prédéfinis
 */
export interface RestaurantHoursTemplate {
  id: string;
  name: string;
  description: string;
  category: RestaurantCategory;
  openingHours: OpeningHours[];
  isDefault?: boolean;
}

export type RestaurantCategory = 
  | 'traditional' 
  | 'brasserie' 
  | 'fast_food' 
  | 'gastronomic' 
  | 'cafe' 
  | 'bar' 
  | 'custom';

/**
 * Configuration par type de restaurant
 */
export interface RestaurantTypeConfig {
  type: RestaurantCategory;
  displayName: string;
  description: string;
  recommendedTemplate: string;
  characteristics: {
    typicalServices: string[];
    peakHours: string[];
    commonClosureDays: number[];
    suggestedPeriods: SuggestedPeriod[];
  };
}

export interface SuggestedPeriod {
  name: string;
  startTime: string;
  endTime: string;
  category: 'lunch' | 'dinner' | 'continuous' | 'brunch';
}

/**
 * Validation des périodes d'ouverture
 */
export interface PeriodValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  conflicts: PeriodConflict[];
}

export interface PeriodConflict {
  type: 'overlap' | 'gap_too_small' | 'invalid_order' | 'too_short' | 'too_long';
  period1?: OpeningPeriod;
  period2?: OpeningPeriod;
  message: string;
  severity: 'error' | 'warning';
}

export interface HoursValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  dayValidations: { [dayOfWeek: number]: PeriodValidationResult };
  openDays: number;
}

/**
 * Erreurs de validation pour création/modification
 */
export interface RestaurantValidationErrors {
  name?: string[];
  description?: string[];
  address?: string[];
  city?: string[];
  zipCode?: string[];
  phone?: string[];
  email?: string[];
  website?: string[];
  cuisine?: string[];
  priceRange?: string[];
  image?: string[];
  opening_hours?: string[];
  latitude?: string[];
  longitude?: string[];
  accepts_meal_vouchers?: string[];
  meal_voucher_info?: string[];
  non_field_errors?: string[];
}

/**
 * Réponse d'erreur de l'API
 */
export interface RestaurantApiError {
  error: string;
  details?: string;
  validation_errors?: RestaurantValidationErrors;
  received_data?: any;
  help?: string;
}

/**
 * Filtres de recherche pour restaurants
 */
export interface RestaurantFilters {
  search?: string;
  cuisine?: CuisineType;
  city?: string;
  accepts_meal_vouchers?: boolean;
  price_range?: 1 | 2 | 3 | 4;
  is_active?: boolean;
  has_image?: boolean;
  ordering?: 'name' | '-name' | 'rating' | '-rating' | 'created_at' | '-created_at';
}

/**
 * Paramètres de pagination pour restaurants
 */
export interface RestaurantPaginationParams {
  page?: number;
  limit?: number;
  page_size?: number;
}

/**
 * Réponse paginée de restaurants
 */
export interface PaginatedRestaurantResponse {
  data: Restaurant[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Paramètres pour charger des restaurants
 */
export interface LoadRestaurantsParams extends RestaurantPaginationParams {
  filters?: RestaurantFilters;
}

/**
 * Export des données restaurant
 */
export interface RestaurantExportData {
  restaurant: Restaurant;
  tables: Array<{
    id: string;
    identifiant: string;
  }>;
  menus: Array<{
    id: string;
    name: string;
    is_available: boolean;
  }>;
  recent_orders: Array<{
    id: string;
    status: string;
    created_at: string;
  }>;
  opening_hours: Array<{
    day_of_week: number;
    day_name: string;
    is_closed: boolean;
    periods: OpeningPeriod[];
    opening_time?: string;
    closing_time?: string;
  }>;
  export_date: string;
  exported_by: string;
}

/**
 * Statut de validation Stripe
 */
export interface RestaurantValidationStatus {
  restaurant: {
    id: string;
    name: string;
    is_stripe_active: boolean;
    can_receive_orders: boolean;
  };
  owner_validation: {
    stripe_verified: boolean;
    stripe_onboarding_completed: boolean;
    is_active: boolean;
    has_stripe_account: boolean;
  };
  capabilities: {
    can_create_orders: boolean;
    can_receive_payments: boolean;
  };
}

/**
 * Health check du restaurant
 */
export interface RestaurantHealthCheck {
  restaurant: {
    id: string;
    name: string;
  };
  status: 'healthy' | 'needs_attention';
  checks: {
    restaurant_active: boolean;
    stripe_configured: boolean;
    owner_verified: boolean;
    has_image: boolean;
    has_tables: boolean;
    has_menus: boolean;
    can_receive_orders: boolean;
    has_opening_hours: boolean;
    not_manually_closed: boolean;
  };
  score: number;
}

/**
 * Templates prédéfinis d'horaires
 */
export const RESTAURANT_HOURS_TEMPLATES: RestaurantHoursTemplate[] = [
  {
    id: 'traditional_restaurant',
    name: 'Restaurant traditionnel',
    description: 'Service midi et soir, fermé dimanche',
    category: 'traditional',
    isDefault: true,
    openingHours: [
      // Dimanche - Fermé
      { dayOfWeek: 0, isClosed: true, periods: [] },
      // Lundi au Jeudi - Service midi et soir
      { 
        dayOfWeek: 1, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      { 
        dayOfWeek: 2, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      { 
        dayOfWeek: 3, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      { 
        dayOfWeek: 4, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      // Vendredi Samedi - Horaires étendus
      { 
        dayOfWeek: 5, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '23:00', name: 'Service soir' }
        ]
      },
      { 
        dayOfWeek: 6, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '23:00', name: 'Service soir' }
        ]
      },
    ]
  },
  
  {
    id: 'brasserie',
    name: 'Brasserie/Bistrot',
    description: 'Service continu midi-soir',
    category: 'brasserie',
    openingHours: [
      // Dimanche - Service réduit
      { 
        dayOfWeek: 0, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '17:00', name: 'Service dominical' }
        ]
      },
      // Lundi au Jeudi - Service continu
      { 
        dayOfWeek: 1, 
        isClosed: false, 
        periods: [
          { startTime: '11:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 2, 
        isClosed: false, 
        periods: [
          { startTime: '11:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 3, 
        isClosed: false, 
        periods: [
          { startTime: '11:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 4, 
        isClosed: false, 
        periods: [
          { startTime: '11:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      // Vendredi Samedi - Horaires étendus
      { 
        dayOfWeek: 5, 
        isClosed: false, 
        periods: [
          { startTime: '11:30', endTime: '00:30', name: 'Service étendu' }
        ]
      },
      { 
        dayOfWeek: 6, 
        isClosed: false, 
        periods: [
          { startTime: '11:30', endTime: '00:30', name: 'Service étendu' }
        ]
      },
    ]
  },

  {
    id: 'gastronomic',
    name: 'Restaurant gastronomique',
    description: 'Service soir uniquement, fermé dimanche-lundi',
    category: 'gastronomic',
    openingHours: [
      { dayOfWeek: 0, isClosed: true, periods: [] }, // Dimanche fermé
      { dayOfWeek: 1, isClosed: true, periods: [] }, // Lundi fermé
      { 
        dayOfWeek: 2, 
        isClosed: false, 
        periods: [
          { startTime: '19:30', endTime: '22:00', name: 'Service gastronomique' }
        ]
      },
      { 
        dayOfWeek: 3, 
        isClosed: false, 
        periods: [
          { startTime: '19:30', endTime: '22:00', name: 'Service gastronomique' }
        ]
      },
      { 
        dayOfWeek: 4, 
        isClosed: false, 
        periods: [
          { startTime: '19:30', endTime: '22:00', name: 'Service gastronomique' }
        ]
      },
      { 
        dayOfWeek: 5, 
        isClosed: false, 
        periods: [
          { startTime: '19:30', endTime: '22:30', name: 'Service gastronomique' }
        ]
      },
      { 
        dayOfWeek: 6, 
        isClosed: false, 
        periods: [
          // Service midi weekend
          { startTime: '12:30', endTime: '14:00', name: 'Service déjeuner' },
          { startTime: '19:30', endTime: '22:30', name: 'Service gastronomique' }
        ]
      },
    ]
  },

  {
    id: 'fast_food',
    name: 'Fast-food/Restauration rapide',
    description: 'Horaires élargis, service continu',
    category: 'fast_food',
    openingHours: [
      // Tous les jours service continu avec horaires variables
      { 
        dayOfWeek: 0, 
        isClosed: false, 
        periods: [
          { startTime: '11:00', endTime: '22:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 1, 
        isClosed: false, 
        periods: [
          { startTime: '10:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 2, 
        isClosed: false, 
        periods: [
          { startTime: '10:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 3, 
        isClosed: false, 
        periods: [
          { startTime: '10:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 4, 
        isClosed: false, 
        periods: [
          { startTime: '10:30', endTime: '23:00', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 5, 
        isClosed: false, 
        periods: [
          { startTime: '10:30', endTime: '23:30', name: 'Service continu' }
        ]
      },
      { 
        dayOfWeek: 6, 
        isClosed: false, 
        periods: [
          { startTime: '10:30', endTime: '23:30', name: 'Service continu' }
        ]
      },
    ]
  }
];

/**
 * Configurations par type de restaurant
 */
export const RESTAURANT_TYPE_CONFIGS: RestaurantTypeConfig[] = [
  {
    type: 'traditional',
    displayName: 'Restaurant traditionnel',
    description: 'Service midi et soir avec pause entre les services',
    recommendedTemplate: 'traditional_restaurant',
    characteristics: {
      typicalServices: ['Service midi', 'Service soir'],
      peakHours: ['12:00-14:30', '19:00-22:30'],
      commonClosureDays: [0], // Dimanche
      suggestedPeriods: [
        { name: 'Service midi', startTime: '12:00', endTime: '14:30', category: 'lunch' },
        { name: 'Service soir', startTime: '19:00', endTime: '22:30', category: 'dinner' }
      ]
    }
  },
  {
    type: 'brasserie',
    displayName: 'Brasserie/Bistrot',
    description: 'Service continu avec possibilité de manger à toute heure',
    recommendedTemplate: 'brasserie',
    characteristics: {
      typicalServices: ['Service continu'],
      peakHours: ['12:00-14:00', '19:00-21:00'],
      commonClosureDays: [],
      suggestedPeriods: [
        { name: 'Service continu', startTime: '11:30', endTime: '23:00', category: 'continuous' }
      ]
    }
  },
  {
    type: 'gastronomic',
    displayName: 'Restaurant gastronomique',
    description: 'Service soir principalement, parfois déjeuner weekend',
    recommendedTemplate: 'gastronomic',
    characteristics: {
      typicalServices: ['Service gastronomique'],
      peakHours: ['19:30-22:00'],
      commonClosureDays: [0, 1], // Dimanche et lundi
      suggestedPeriods: [
        { name: 'Service gastronomique', startTime: '19:30', endTime: '22:00', category: 'dinner' }
      ]
    }
  },
  {
    type: 'fast_food',
    displayName: 'Restauration rapide',
    description: 'Horaires élargis, service continu toute la journée',
    recommendedTemplate: 'fast_food',
    characteristics: {
      typicalServices: ['Service continu'],
      peakHours: ['12:00-14:00', '19:00-21:00'],
      commonClosureDays: [],
      suggestedPeriods: [
        { name: 'Service continu', startTime: '10:30', endTime: '23:00', category: 'continuous' }
      ]
    }
  },
  {
    type: 'cafe',
    displayName: 'Café',
    description: 'Ouvert toute la journée, service petit-déjeuner à apéritif',
    recommendedTemplate: 'cafe',
    characteristics: {
      typicalServices: ['Service café'],
      peakHours: ['08:00-10:00', '12:00-14:00', '16:00-18:00'],
      commonClosureDays: [],
      suggestedPeriods: [
        { name: 'Service café', startTime: '07:00', endTime: '20:00', category: 'continuous' }
      ]
    }
  },
  {
    type: 'bar',
    displayName: 'Bar',
    description: 'Ouvert en soirée principalement',
    recommendedTemplate: 'bar',
    characteristics: {
      typicalServices: ['Service bar'],
      peakHours: ['18:00-02:00'],
      commonClosureDays: [0, 1], // Dimanche et lundi souvent
      suggestedPeriods: [
        { name: 'Service bar', startTime: '16:00', endTime: '02:00', category: 'dinner' }
      ]
    }
  }
];

/**
 * Helpers pour la migration des horaires
 */
export function migrateOpeningHours(oldHours: any[]): OpeningHours[] {
  return oldHours.map(day => {
    if (day.isClosed) {
      return {
        dayOfWeek: day.dayOfWeek,
        isClosed: true,
        periods: []
      };
    }

    return {
      dayOfWeek: day.dayOfWeek,
      isClosed: false,
      periods: [{
        startTime: day.openTime || '09:00',
        endTime: day.closeTime || '19:00',
        name: 'Service principal'
      }]
    };
  });
}

export function convertToLegacyFormat(newHours: OpeningHours[]): any[] {
  return newHours.map(day => {
    if (day.isClosed || day.periods.length === 0) {
      return {
        dayOfWeek: day.dayOfWeek,
        isClosed: true,
        openTime: '09:00',
        closeTime: '19:00'
      };
    }

    // Pour la compatibilité, prendre la première période
    const firstPeriod = day.periods[0];
    return {
      dayOfWeek: day.dayOfWeek,
      isClosed: false,
      openTime: firstPeriod.startTime,
      closeTime: firstPeriod.endTime
    };
  });
}

/**
 * Fonctions utilitaires pour la validation
 */
export function validateOpeningHours(hours: OpeningHours[]): HoursValidationResult {
  const result: HoursValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: [],
    dayValidations: {},
    openDays: 0
  };

  if (!hours || hours.length !== 7) {
    result.isValid = false;
    result.errors.push('Les horaires doivent couvrir les 7 jours de la semaine');
    return result;
  }

  // Valider chaque jour
  hours.forEach(day => {
    if (!day.isClosed) {
      result.openDays++;
    }

    const dayValidation = validateDayPeriods(day);
    result.dayValidations[day.dayOfWeek] = dayValidation;

    if (!dayValidation.isValid) {
      result.isValid = false;
      result.errors.push(...dayValidation.errors);
    }
    result.warnings.push(...dayValidation.warnings);
  });

  // Vérifications métier
  if (result.openDays === 0) {
    result.warnings.push('Restaurant fermé toute la semaine');
  } else if (result.openDays < 5) {
    result.warnings.push('Restaurant ouvert moins de 5 jours par semaine');
  }

  return result;
}

function validateDayPeriods(day: OpeningHours): PeriodValidationResult {
  const result: PeriodValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    conflicts: []
  };

  if (day.isClosed || !day.periods || day.periods.length === 0) {
    return result;
  }

  // Trier les périodes par heure de début
  const sortedPeriods = [...day.periods].sort((a, b) => 
    a.startTime.localeCompare(b.startTime)
  );

  // Valider chaque période
  sortedPeriods.forEach((period, index) => {
    // Valider format des heures
    if (!isValidTimeFormat(period.startTime) || !isValidTimeFormat(period.endTime)) {
      result.isValid = false;
      result.errors.push(`Format d'heure invalide pour la période ${index + 1}`);
      return;
    }

    // Valider durée minimale
    const duration = calculatePeriodDuration(period);
    if (duration < 30) {
      result.conflicts.push({
        type: 'too_short',
        period1: period,
        message: `Période trop courte: ${duration} minutes`,
        severity: 'warning'
      });
      result.warnings.push(`Période ${index + 1} très courte: ${duration} minutes`);
    }

    // Vérifier chevauchements avec autres périodes
    if (index > 0) {
      const previousPeriod = sortedPeriods[index - 1];
      if (period.startTime < previousPeriod.endTime) {
        result.isValid = false;
        result.conflicts.push({
          type: 'overlap',
          period1: previousPeriod,
          period2: period,
          message: 'Chevauchement de périodes',
          severity: 'error'
        });
        result.errors.push(`Chevauchement entre périodes ${index} et ${index + 1}`);
      }
    }
  });

  return result;
}

function isValidTimeFormat(time: string): boolean {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

function calculatePeriodDuration(period: OpeningPeriod): number {
  const start = timeToMinutes(period.startTime);
  const end = timeToMinutes(period.endTime);
  
  if (end > start) {
    return end - start;
  } else {
    // Période qui traverse minuit
    return (24 * 60) - start + end;
  }
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}