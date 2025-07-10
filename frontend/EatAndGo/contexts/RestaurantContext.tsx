import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Restaurant } from '@/types/restaurant';
import { SearchFilters } from '@/types/common';
import { restaurantService } from '@/services/restaurantService';

interface RestaurantState {
  restaurants: Restaurant[];
  currentRestaurant: Restaurant | null;
  isLoading: boolean;
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
}

type RestaurantAction =
  | { type: 'SET_LOADING'; payload: boolean }
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
    case 'SET_RESTAURANTS':
      return { ...state, restaurants: action.payload };
    case 'SET_CURRENT_RESTAURANT':
      return { ...state, currentRestaurant: action.payload };
    case 'ADD_RESTAURANT':
      return { ...state, restaurants: [action.payload, ...state.restaurants] };
    case 'UPDATE_RESTAURANT':
      return {
        ...state,
        restaurants: state.restaurants.map(r => 
          r.id === action.payload.id ? action.payload : r
        ),
        currentRestaurant: state.currentRestaurant?.id === action.payload.id 
          ? action.payload 
          : state.currentRestaurant,
      };
    case 'REMOVE_RESTAURANT':
      return {
        ...state,
        restaurants: state.restaurants.filter(r => r.id !== action.payload),
        currentRestaurant: state.currentRestaurant?.id === action.payload 
          ? null 
          : state.currentRestaurant,
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

  const loadRestaurants = async (filters?: SearchFilters, page = 1) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
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
      
      dispatch({ type: 'SET_RESTAURANTS', payload: response.data });
      dispatch({ type: 'SET_PAGINATION', payload: response.pagination });
      
      if (filters) {
        dispatch({ type: 'SET_FILTERS', payload: filters });
      }
    } catch (error) {
      console.error('Erreur lors du chargement des restaurants:', error);
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const loadRestaurant = async (id: string) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const restaurant = await restaurantService.getRestaurant(id);
      dispatch({ type: 'SET_CURRENT_RESTAURANT', payload: restaurant });
    } catch (error) {
      console.error('Erreur lors du chargement du restaurant:', error);
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const createRestaurant = async (data: Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const restaurant = await restaurantService.createRestaurant(data);
      dispatch({ type: 'ADD_RESTAURANT', payload: restaurant });
      return restaurant;
    } catch (error) {
      console.error('Erreur lors de la création du restaurant:', error);
      throw error;
    }
  };

  const updateRestaurant = async (id: string, data: Partial<Restaurant>) => {
    try {
      const restaurant = await restaurantService.updateRestaurant(id, data);
      dispatch({ type: 'UPDATE_RESTAURANT', payload: restaurant });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du restaurant:', error);
      throw error;
    }
  };

  const deleteRestaurant = async (id: string) => {
    try {
      await restaurantService.deleteRestaurant(id);
      dispatch({ type: 'REMOVE_RESTAURANT', payload: id });
    } catch (error) {
      console.error('Erreur lors de la suppression du restaurant:', error);
      throw error;
    }
  };

  const searchRestaurants = async (query: string, filters?: SearchFilters) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const restaurants = await restaurantService.searchRestaurants(query, filters);
      dispatch({ type: 'SET_RESTAURANTS', payload: restaurants });
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      throw error;
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
  };

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
};

export const useRestaurant = (): RestaurantContextType => {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant doit être utilisé dans un RestaurantProvider');
  }
  return context;
};