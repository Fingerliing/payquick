import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Restaurant } from '@/types/restaurant';
import { Table } from '@/types/table'
import { SearchFilters, PaginatedResponse } from '@/types/common';
import { restaurantService } from '@/services/restaurantService';
import { tableService } from '@/services/tableService';
import { useAuth } from './AuthContext';

interface ValidationStatus {
  needsValidation: boolean;
  message: string;
  canCreateRestaurant: boolean;
  stripeVerified?: boolean;
  isActive?: boolean;
}

interface RestaurantState {
  restaurants: Restaurant[];
  currentRestaurant: Restaurant | null;
  isLoading: boolean;
  error: string | null;
  filters: SearchFilters;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  isPublicMode: boolean;
  validationStatus: ValidationStatus | null;
}

export interface RestaurantContextType extends RestaurantState {
  // Méthodes publiques (pour clients)
  loadPublicRestaurants: (filters?: SearchFilters, page?: number) => Promise<void>;
  loadPublicRestaurant: (id: string) => Promise<void>;
  searchPublicRestaurants: (query: string, filters?: SearchFilters) => Promise<void>;
  
  // Méthodes privées (pour restaurateurs)
  loadRestaurants: (filters?: SearchFilters, page?: number) => Promise<void>;
  loadRestaurant: (id: string) => Promise<void>;
  createRestaurant: (data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt' | 'can_receive_orders' | 'ownerId'>) => Promise<Restaurant>;
  updateRestaurant: (id: string, data: Partial<Restaurant>) => Promise<void>;
  deleteRestaurant: (id: string) => Promise<void>;
  searchRestaurants: (query: string, filters?: SearchFilters) => Promise<void>;
  
  // Méthodes communes
  setFilters: (filters: SearchFilters) => void;
  clearCurrentRestaurant: () => void;
  refreshRestaurants: () => Promise<void>;
  setPublicMode: (isPublic: boolean) => void;

  // Méthodes pour les tables
  loadRestaurantTables: (restaurantId: string) => Promise<Table[]>;
  createTables: (restaurantId: string, tableCount: number, startNumber?: number) => Promise<Table[]>;
  deleteTable: (tableId: string) => Promise<void>;
  toggleTableStatus: (tableId: string) => Promise<void>;

  // Helpers pour le statut de validation
  clearValidationStatus: () => void;
  isRestaurateurValidated: () => boolean;
}

type RestaurantAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_RESTAURANTS'; payload: Restaurant[] }
  | { type: 'SET_CURRENT_RESTAURANT'; payload: Restaurant | null }
  | { type: 'ADD_RESTAURANT'; payload: Restaurant }
  | { type: 'UPDATE_RESTAURANT'; payload: Restaurant }
  | { type: 'REMOVE_RESTAURANT'; payload: string }
  | { type: 'SET_FILTERS'; payload: SearchFilters }
  | { type: 'SET_PAGINATION'; payload: { page: number; limit: number; total: number; pages: number } }
  | { type: 'SET_PUBLIC_MODE'; payload: boolean }
  | { type: 'SET_VALIDATION_STATUS'; payload: ValidationStatus | null };

const initialState: RestaurantState = {
  restaurants: [],
  currentRestaurant: null,
  isLoading: false,
  error: null,
  filters: {},
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  },
  isPublicMode: true,
  validationStatus: null,
};

const restaurantReducer = (state: RestaurantState, action: RestaurantAction): RestaurantState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_RESTAURANTS':
      return { 
        ...state, 
        restaurants: Array.isArray(action.payload) ? action.payload : [],
        error: null 
      };
    case 'SET_CURRENT_RESTAURANT':
      return { ...state, currentRestaurant: action.payload };
    case 'ADD_RESTAURANT':
      return { 
        ...state, 
        restaurants: [action.payload, ...state.restaurants],
        error: null 
      };
    case 'UPDATE_RESTAURANT':
      return {
        ...state,
        restaurants: state.restaurants.map(r => 
          r.id === action.payload.id ? action.payload : r
        ),
        currentRestaurant: state.currentRestaurant?.id === action.payload.id 
          ? action.payload 
          : state.currentRestaurant,
        error: null
      };
    case 'REMOVE_RESTAURANT':
      return {
        ...state,
        restaurants: state.restaurants.filter(r => r.id !== action.payload),
        currentRestaurant: state.currentRestaurant?.id === action.payload 
          ? null 
          : state.currentRestaurant,
        error: null
      };
    case 'SET_FILTERS':
      return { ...state, filters: action.payload };
    case 'SET_PAGINATION':
      return { ...state, pagination: action.payload };
    case 'SET_PUBLIC_MODE':
      return { ...state, isPublicMode: action.payload };
    case 'SET_VALIDATION_STATUS':
      return { ...state, validationStatus: action.payload };
    default:
      return state;
  }
};

// Fonction utilitaire pour normaliser les données de restaurant
const normalizeRestaurantData = (data: any): Restaurant => {
  return {
    ...data,
    id: String(data.id), // S'assurer que l'id est toujours une string
    openingHours: data.openingHours || data.opening_hours || [],
    // Gérer location si pas présent
    location: data.location || {
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
    },
    // S'assurer que can_receive_orders est toujours défini
    can_receive_orders: data.can_receive_orders ?? false,
  };
};

// Type guards pour vérifier les types de réponse
const isPaginatedResponse = (response: any): response is PaginatedResponse<Restaurant> => {
  return response && 
         typeof response === 'object' && 
         'data' in response && 
         Array.isArray(response.data) &&
         'pagination' in response;
};

const isRestaurantArray = (response: any): response is Restaurant[] => {
  return Array.isArray(response);
};

// Fonction utilitaire pour extraire les données de restaurant de manière sécurisée
const extractRestaurantData = (response: any): { restaurants: Restaurant[], pagination?: any } => {
  if (isPaginatedResponse(response)) {
    return {
      restaurants: response.data.map(normalizeRestaurantData),
      pagination: response.pagination
    };
  }
  
  if (isRestaurantArray(response)) {
    return {
      restaurants: response.map(normalizeRestaurantData),
      pagination: {
        page: 1,
        limit: response.length,
        total: response.length,
        pages: 1
      }
    };
  }
  
  // Fallback pour les formats inattendus
  return {
    restaurants: [],
    pagination: {
      page: 1,
      limit: 0,
      total: 0,
      pages: 0
    }
  };
};

export const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(restaurantReducer, initialState);
  
  const { userRole, isAuthenticated } = useAuth();

  useEffect(() => {
  }, [state.restaurants, state.isLoading, state.error, state.isPublicMode]);

  useEffect(() => {
    if (isAuthenticated && userRole) {
      const shouldBePublicMode = userRole === 'client';
      
      if (state.isPublicMode !== shouldBePublicMode) {
        dispatch({ type: 'SET_PUBLIC_MODE', payload: shouldBePublicMode });
      }
    }
  }, [userRole, isAuthenticated, state.isPublicMode]);

  // ============================================================================
  // MÉTHODES PUBLIQUES
  // ============================================================================

  const loadPublicRestaurants = async (filters?: SearchFilters, page = 1) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const response = await restaurantService.getPublicRestaurants({
        page,
        limit: state.pagination.limit,
        filters: filters || state.filters,
      });
      
      
      const { restaurants, pagination } = extractRestaurantData(response);
      
      
      dispatch({ type: 'SET_RESTAURANTS', payload: restaurants });
      dispatch({ type: 'SET_PAGINATION', payload: pagination || state.pagination });
      
      if (filters) {
        dispatch({ type: 'SET_FILTERS', payload: filters });
      }
      
    } catch (error: any) {
      console.error('RestaurantContext: Public load error:', error?.message ?? error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement des restaurants' });
      dispatch({ type: 'SET_RESTAURANTS', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadPublicRestaurant = async (id: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurant = await restaurantService.getPublicRestaurant(id);
      
      dispatch({ type: 'SET_CURRENT_RESTAURANT', payload: normalizeRestaurantData(restaurant) });
    } catch (error: any) {
      console.error('RestaurantContext: Public load single error:', error?.message ?? error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement du restaurant' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const searchPublicRestaurants = async (query: string, filters?: SearchFilters) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurants = await restaurantService.searchPublicRestaurants(query, filters);
      
      // searchPublicRestaurants retourne directement un Restaurant[]
      const restaurantData = isRestaurantArray(restaurants) 
        ? restaurants.map(normalizeRestaurantData) 
        : [];
        
      dispatch({ type: 'SET_RESTAURANTS', payload: restaurantData });
    } catch (error: any) {
      console.error('RestaurantContext: Public search error:', error?.message ?? error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la recherche' });
      dispatch({ type: 'SET_RESTAURANTS', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // ============================================================================
  // MÉTHODES PRIVÉES
  // ============================================================================

  const loadRestaurants = async (filters?: SearchFilters, page = 1) => {
    // Vérifier que l'utilisateur est bien restaurateur
    if (userRole !== 'restaurateur') {
      return loadPublicRestaurants(filters, page);
    }
  
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const response = await restaurantService.getRestaurants({
        page,
        page_size: state.pagination.limit,
      });
      
      
      const { restaurants, pagination } = extractRestaurantData(response);
      
      
      dispatch({ type: 'SET_RESTAURANTS', payload: restaurants });
      dispatch({ type: 'SET_PAGINATION', payload: pagination || state.pagination });
      
      if (filters) {
        dispatch({ type: 'SET_FILTERS', payload: filters });
      }
      
    } catch (error: any) {
      
      // Gestion spécifique des erreurs 403 pour restaurateurs non validés
      if (error.code === 403) {
        
        // Au lieu de mettre une erreur, on met un état spécial
        dispatch({ type: 'SET_RESTAURANTS', payload: [] });
        dispatch({ type: 'SET_ERROR', payload: null }); // Pas d'erreur affichée
        
        // On pourrait ajouter un state spécial pour indiquer le statut
        dispatch({ 
          type: 'SET_VALIDATION_STATUS', 
          payload: {
            needsValidation: true,
            message: 'Votre profil restaurateur est en cours de validation',
            canCreateRestaurant: false
          }
        });
        
        return; // Sortir sans afficher d'erreur
      }
      
      console.error('RestaurantContext: Private load error:', error?.message ?? error);
      
      // Pour les autres erreurs, comportement normal
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement des restaurants' });
      dispatch({ type: 'SET_RESTAURANTS', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };
  
  const loadRestaurant = async (id: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurant = await restaurantService.getRestaurant(id);
      
      dispatch({ type: 'SET_CURRENT_RESTAURANT', payload: normalizeRestaurantData(restaurant) });
    } catch (error: any) {
      console.error('RestaurantContext: Private load single error:', error?.message ?? error);
      
      // NOUVEAU: Gestion spécifique des erreurs 403
      if (error.code === 403) {
        dispatch({ type: 'SET_ERROR', payload: 'Accès restreint - profil en cours de validation' });
      } else {
        dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement du restaurant' });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const createRestaurant = async (data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt' | 'can_receive_orders' | 'ownerId'>) => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      // Préparer les données pour le backend
      // Le serializer RestaurantCreateSerializer attend les champs en camelCase
      const backendData: any = {
        name: data.name,
        description: data.description || '',
        cuisine: data.cuisine,
        priceRange: data.priceRange,       // serializer: priceRange -> price_range
        address: data.address,
        city: data.city,
        zipCode: data.zipCode,             // serializer: zipCode -> zip_code
        country: data.country || 'France',
        latitude: data.location?.latitude || 0,
        longitude: data.location?.longitude || 0,
        phone: data.phone,
        email: data.email,
        website: data.website || '',
        openingHours: data.openingHours || [], // view: pop('openingHours')
        accepts_meal_vouchers: data.accepts_meal_vouchers || false,
        meal_voucher_info: data.meal_voucher_info || '',
        image: data.image || null,
      };
      
      const restaurant = await restaurantService.createRestaurant(backendData);
      
      const normalizedRestaurant = normalizeRestaurantData(restaurant);
      dispatch({ type: 'ADD_RESTAURANT', payload: normalizedRestaurant });
      return normalizedRestaurant;
    } catch (error: any) {
      console.error('RestaurantContext: Create error:', error?.message ?? error);
      
      // Log des détails de l'erreur pour diagnostiquer
      if (error.response) {
      }
      
      let errorMessage = 'Erreur lors de la création du restaurant';
      
      // Gestion spécifique des erreurs backend
      if (error.response?.data) {
        const errorData = error.response.data;
        
        if (errorData.validation_errors || errorData.errors) {
          errorMessage = 'Erreurs de validation des données';
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const updateRestaurant = async (id: string, data: Partial<Restaurant>) => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      // Le service gère maintenant toute la préparation des données
      const restaurant = await restaurantService.updateRestaurant(id, data);
      
      dispatch({ type: 'UPDATE_RESTAURANT', payload: normalizeRestaurantData(restaurant) });
    } catch (error: any) {
      console.error('RestaurantContext: Update error:', error?.message ?? error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la mise à jour du restaurant' });
      throw error;
    }
  };

  const deleteRestaurant = async (id: string) => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      await restaurantService.deleteRestaurant(id);
      
      dispatch({ type: 'REMOVE_RESTAURANT', payload: id });
    } catch (error: any) {
      console.error('RestaurantContext: Delete error:', error?.message ?? error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la suppression du restaurant' });
      throw error;
    }
  };

  const searchRestaurants = async (query: string, filters?: SearchFilters) => {
    // Utiliser la recherche appropriée selon le rôle
    if (userRole !== 'restaurateur') {
      return searchPublicRestaurants(query, filters);
    }

    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurants = await restaurantService.searchRestaurants(query, filters);
      
      // searchRestaurants retourne directement un Restaurant[]
      const restaurantData = isRestaurantArray(restaurants) 
        ? restaurants.map(normalizeRestaurantData) 
        : [];
        
      dispatch({ type: 'SET_RESTAURANTS', payload: restaurantData });
    } catch (error: any) {
      console.error('RestaurantContext: Private search error:', error?.message ?? error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la recherche' });
      dispatch({ type: 'SET_RESTAURANTS', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  // ============================================================================
  // MÉTHODES COMMUNES
  // ============================================================================

  const setFilters = (filters: SearchFilters) => {
    dispatch({ type: 'SET_FILTERS', payload: filters });
  };

  const clearCurrentRestaurant = () => {
    dispatch({ type: 'SET_CURRENT_RESTAURANT', payload: null });
  };

  const setPublicMode = (isPublic: boolean) => {
    dispatch({ type: 'SET_PUBLIC_MODE', payload: isPublic });
  };

  const refreshRestaurants = async () => {
    // Utiliser le bon mode selon le rôle utilisateur
    if (state.isPublicMode || userRole === 'client') {
      await loadPublicRestaurants(state.filters, state.pagination.page);
    } else {
      await loadRestaurants(state.filters, state.pagination.page);
    }
  };

  // Nouvelles méthodes pour gérer le statut de validation
  const clearValidationStatus = () => {
    dispatch({ type: 'SET_VALIDATION_STATUS', payload: null });
  };

  const isRestaurateurValidated = (): boolean => {
    return state.validationStatus === null || !state.validationStatus.needsValidation;
  };

  const loadRestaurantTables = async (restaurantId: string): Promise<Table[]> => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const tables = await tableService.getRestaurantTables(restaurantId) as any;
      
      return Array.isArray(tables) ? tables : [];
    } catch (error: any) {
      console.error('RestaurantContext: Load tables error:', error);
      
      // Si erreur 404, cela signifie qu'il n'y a pas de tables pour ce restaurant
      // C'est un comportement normal, pas une vraie erreur
      if (error.response?.status === 404 || error.message?.includes('404')) {
        return []; // Retourner un tableau vide au lieu de lancer une erreur
      }
      
      // Pour les autres erreurs, on lance bien l'erreur
      let errorMessage = 'Erreur lors du chargement des tables';
      
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const createTables = async (
    restaurantId: string, 
    tableCount: number, 
    startNumber: number = 1
  ): Promise<Table[]> => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const tables = await tableService.createTables(restaurantId, tableCount, startNumber) as any;
      
      return tables;
    } catch (error: any) {
      console.error('RestaurantContext: Create tables error:', error);
      
      let errorMessage = 'Erreur lors de la création des tables';
      
      if (error.response?.data) {
        const errorData = error.response.data;
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const deleteTable = async (tableId: string): Promise<void> => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      await tableService.deleteTable(tableId);
      
    } catch (error: any) {
      console.error('RestaurantContext: Delete table error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la suppression de la table' });
      throw error;
    }
  };

  const toggleTableStatus = async (tableId: string): Promise<void> => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      
      await tableService.toggleTableStatus(tableId);
      
    } catch (error: any) {
      console.error('RestaurantContext: Toggle table status error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du changement de statut de la table' });
      throw error;
    }
  };

  useEffect(() => {
    
    // Attendre que l'authentification soit chargée
    if (isAuthenticated && userRole) {
      if (userRole === 'client') {
        loadPublicRestaurants();
      } else if (userRole === 'restaurateur') {
        loadRestaurants();
      }
    } else if (!isAuthenticated) {
      // Utilisateur non connecté, charger en mode public
      loadPublicRestaurants();
    }
  }, [userRole, isAuthenticated]);

  const value: RestaurantContextType = {
    ...state,
    loadPublicRestaurants,
    loadPublicRestaurant,
    searchPublicRestaurants,
    loadRestaurants,
    loadRestaurant,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    searchRestaurants,
    setFilters,
    clearCurrentRestaurant,
    refreshRestaurants,
    setPublicMode,
    loadRestaurantTables,
    createTables,
    deleteTable,
    toggleTableStatus,
    clearValidationStatus,
    isRestaurateurValidated,
  };

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
};

export const useRestaurant = (): RestaurantContextType => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant doit être utilisé dans un RestaurantProvider');
  }
  
  return {
    ...context,
    restaurants: Array.isArray(context.restaurants) ? context.restaurants : [],
  };
};