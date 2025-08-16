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
}

export interface Restaurant {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  zipCode: string;
  country: string;
  phone: string;
  email: string;
  website?: string;
  image?: string;
  cuisine: string;
  priceRange: 1 | 2 | 3 | 4;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  can_receive_orders: boolean;
  openingHours: OpeningHours[]; // MODIFIÉ: Nouveau format
  location: {
    latitude: number;
    longitude: number;
  };
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  accepts_meal_vouchers: boolean;
  meal_voucher_info?: string;
  accepts_meal_vouchers_display: string;
  
  // NOUVEAU: Gestion des fermetures manuelles
  isManuallyOverridden?: boolean;
  manualOverrideReason?: string;
  manualOverrideUntil?: string;
  lastStatusChangedBy?: string;
  lastStatusChangedAt?: string;
}

// NOUVEAU: Templates pour restaurants
export interface RestaurantHoursTemplate {
  id: string;
  name: string;
  description: string;
  category: 'traditional' | 'brasserie' | 'fast_food' | 'cafe' | 'bar' | 'custom';
  openingHours: OpeningHours[];
  isDefault?: boolean;
}

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
      // Lundi - Service midi et soir
      { 
        dayOfWeek: 1, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      // Mardi
      { 
        dayOfWeek: 2, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      // Mercredi
      { 
        dayOfWeek: 3, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      // Jeudi
      { 
        dayOfWeek: 4, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '22:30', name: 'Service soir' }
        ]
      },
      // Vendredi
      { 
        dayOfWeek: 5, 
        isClosed: false, 
        periods: [
          { startTime: '12:00', endTime: '14:30', name: 'Service midi' },
          { startTime: '19:00', endTime: '23:00', name: 'Service soir' }
        ]
      },
      // Samedi
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
    category: 'traditional',
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

// NOUVEAU: Types pour les validations
export interface PeriodValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  conflicts: {
    type: 'overlap' | 'gap_too_small' | 'invalid_order' | 'too_short' | 'too_long';
    period1?: OpeningPeriod;
    period2?: OpeningPeriod;
    message: string;
    severity: 'error' | 'warning';
  }[];
}

export interface HoursValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  dayValidations: { [dayOfWeek: number]: PeriodValidationResult };
}

// NOUVEAU: Configurations par type de restaurant
export interface RestaurantTypeConfig {
  type: 'traditional' | 'brasserie' | 'fast_food' | 'gastronomic' | 'cafe' | 'bar';
  displayName: string;
  description: string;
  recommendedTemplate: string;
  characteristics: {
    typicalServices: string[];
    peakHours: string[];
    commonClosureDays: number[];
    suggestedPeriods: any[];
  };
}

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
  }
];

// NOUVEAU: Helpers pour la migration
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