import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { Restaurant } from '@/types/restaurant';
import { SearchFilters } from '@/types/common';
import { restaurantService } from '@/services/restaurantService';

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
}

export interface RestaurantContextType extends RestaurantState {
  loadRestaurants: (filters?: SearchFilters, page?: number) => Promise<void>;
  loadRestaurant: (id: string) => Promise<void>;
  createRestaurant: (data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Restaurant>;
  updateRestaurant: (id: string, data: Partial<Restaurant>) => Promise<void>;
  deleteRestaurant: (id: string) => Promise<void>;
  searchRestaurants: (query: string, filters?: SearchFilters) => Promise<void>;
  setFilters: (filters: SearchFilters) => void;
  clearCurrentRestaurant: () => void;
  refreshRestaurants: () => Promise<void>;
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
  | { type: 'SET_PAGINATION'; payload: any };

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
    default:
      return state;
  }
};

export const RestaurantContext = createContext<RestaurantContextType | undefined>(undefined);

export const RestaurantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(restaurantReducer, initialState);

  useEffect(() => {
    console.log('🔍 RestaurantContext state change:', {
      restaurants: state.restaurants.length,
      isLoading: state.isLoading,
      error: state.error,
      isArray: Array.isArray(state.restaurants)
    });
  }, [state.restaurants, state.isLoading, state.error]);

  const loadRestaurants = async (filters?: SearchFilters, page = 1) => {
    try {
      console.log('🚀 RestaurantContext: Starting loadRestaurants...', { filters, page });
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      console.log('📤 Requête vers getRestaurants avec :', {
        page,
        limit: state.pagination.limit,
        filters: filters || state.filters,
      });
      
      const response = await restaurantService.getRestaurants({
        page,
        limit: state.pagination.limit,
        filters: filters || state.filters,
      });
      
      console.log('📥 RestaurantService response:', response);
      
      let restaurantData: Restaurant[] = [];
      let paginationData = state.pagination;
      
      if (response && typeof response === 'object') {
        // Cas 1: Structure {data: [], pagination: {}}
        if (Array.isArray(response.data)) {
          restaurantData = response.data;
          paginationData = response.pagination || state.pagination;
        }
        // Cas 2: Array direct
        else if (Array.isArray(response)) {
          restaurantData = response;
        }
      }
      // Cas 3: Response est directement un array
      else if (Array.isArray(response)) {
        restaurantData = response;
      }
      
      console.log('✅ RestaurantContext: Processed data:', {
        restaurantCount: restaurantData.length,
        pagination: paginationData
      });
      
      dispatch({ type: 'SET_RESTAURANTS', payload: restaurantData });
      dispatch({ type: 'SET_PAGINATION', payload: paginationData });
      
      if (filters) {
        dispatch({ type: 'SET_FILTERS', payload: filters });
      }
      
    } catch (error: any) {
      console.error('❌ RestaurantContext: Load error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement des restaurants' });
      dispatch({ type: 'SET_RESTAURANTS', payload: [] }); // ✅ Fallback sur array vide
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadRestaurant = async (id: string) => {
    try {
      console.log('🚀 RestaurantContext: Loading single restaurant:', id);
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurant = await restaurantService.getRestaurant(id);
      console.log('✅ RestaurantContext: Single restaurant loaded:', restaurant);
      
      dispatch({ type: 'SET_CURRENT_RESTAURANT', payload: restaurant });
    } catch (error: any) {
      console.error('❌ RestaurantContext: Load single error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors du chargement du restaurant' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const createRestaurant = async (data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      console.log('🚀 RestaurantContext: Creating restaurant:', data);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurant = await restaurantService.createRestaurant(data);
      console.log('✅ RestaurantContext: Restaurant created:', restaurant);
      
      dispatch({ type: 'ADD_RESTAURANT', payload: restaurant });
      return restaurant;
    } catch (error: any) {
      console.error('❌ RestaurantContext: Create error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la création du restaurant' });
      throw error;
    }
  };

  const updateRestaurant = async (id: string, data: Partial<Restaurant>) => {
    try {
      console.log('🚀 RestaurantContext: Updating restaurant:', id, data);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurant = await restaurantService.updateRestaurant(id, data);
      console.log('✅ RestaurantContext: Restaurant updated:', restaurant);
      
      dispatch({ type: 'UPDATE_RESTAURANT', payload: restaurant });
    } catch (error: any) {
      console.error('❌ RestaurantContext: Update error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la mise à jour du restaurant' });
      throw error;
    }
  };

  const deleteRestaurant = async (id: string) => {
    try {
      console.log('🚀 RestaurantContext: Deleting restaurant:', id);
      dispatch({ type: 'SET_ERROR', payload: null });
      
      await restaurantService.deleteRestaurant(id);
      console.log('✅ RestaurantContext: Restaurant deleted:', id);
      
      dispatch({ type: 'REMOVE_RESTAURANT', payload: id });
    } catch (error: any) {
      console.error('❌ RestaurantContext: Delete error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la suppression du restaurant' });
      throw error;
    }
  };

  const searchRestaurants = async (query: string, filters?: SearchFilters) => {
    try {
      console.log('🚀 RestaurantContext: Searching restaurants:', query, filters);
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
      
      const restaurants = await restaurantService.searchRestaurants(query, filters);
      console.log('✅ RestaurantContext: Search results:', restaurants.length);
      
      const restaurantData = Array.isArray(restaurants) ? restaurants : [];
      dispatch({ type: 'SET_RESTAURANTS', payload: restaurantData });
    } catch (error: any) {
      console.error('❌ RestaurantContext: Search error:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Erreur lors de la recherche' });
      dispatch({ type: 'SET_RESTAURANTS', payload: [] });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const setFilters = (filters: SearchFilters) => {
    dispatch({ type: 'SET_FILTERS', payload: filters });
  };

  const clearCurrentRestaurant = () => {
    dispatch({ type: 'SET_CURRENT_RESTAURANT', payload: null });
  };

  const refreshRestaurants = async () => {
    console.log('🔄 RestaurantContext: Refreshing restaurants...');
    await loadRestaurants(state.filters, state.pagination.page);
  };

  useEffect(() => {
    console.log('🎬 RestaurantProvider mounted, loading initial data...');
    loadRestaurants();
  }, []); // Chargement initial automatique

  const value: RestaurantContextType = {
    ...state,
    loadRestaurants,
    loadRestaurant,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    searchRestaurants,
    setFilters,
    clearCurrentRestaurant,
    refreshRestaurants,
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