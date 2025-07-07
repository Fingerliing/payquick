import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, AuthState, LoginCredentials, RegisterData } from '@/types/auth';
import { authService } from '@/services/authService';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

type AuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_USER'; payload: User }
  | { type: 'SET_TOKEN'; payload: string }
  | { type: 'SET_AUTHENTICATED'; payload: boolean }
  | { type: 'CLEAR_AUTH' };

const initialState: AuthState = {
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload, isAuthenticated: true };
    case 'SET_TOKEN':
      return { ...state, token: action.payload };
    case 'SET_AUTHENTICATED':
      return { ...state, isAuthenticated: action.payload };
    case 'CLEAR_AUTH':
      return { ...initialState, isLoading: false };
    default:
      return state;
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userData = await AsyncStorage.getItem('user_data');

      if (token && userData) {
        const user = JSON.parse(userData);
        dispatch({ type: 'SET_TOKEN', payload: token });
        dispatch({ type: 'SET_USER', payload: user });
        
        // Vérifier si le token est encore valide
        try {
          const currentUser = await authService.getCurrentUser();
          dispatch({ type: 'SET_USER', payload: currentUser });
        } catch (error) {
          // Token invalide, nettoyer le storage
          await clearAuthData();
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification de l\'état d\'authentification:', error);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const clearAuthData = async () => {
    await AsyncStorage.multiRemove(['auth_token', 'user_data']);
    dispatch({ type: 'CLEAR_AUTH' });
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await authService.login(credentials);
      
      await AsyncStorage.setItem('auth_token', response.token);
      await AsyncStorage.setItem('user_data', JSON.stringify(response.user));
      
      dispatch({ type: 'SET_TOKEN', payload: response.token });
      dispatch({ type: 'SET_USER', payload: response.user });
    } catch (error) {
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const register = async (data: RegisterData) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const response = await authService.register(data);
      
      await AsyncStorage.setItem('auth_token', response.token);
      await AsyncStorage.setItem('user_data', JSON.stringify(response.user));
      
      dispatch({ type: 'SET_TOKEN', payload: response.token });
      dispatch({ type: 'SET_USER', payload: response.user });
    } catch (error) {
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      // Ignorer les erreurs de logout côté serveur
    } finally {
      await clearAuthData();
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    try {
      const updatedUser = await authService.updateProfile(data);
      await AsyncStorage.setItem('user_data', JSON.stringify(updatedUser));
      dispatch({ type: 'SET_USER', payload: updatedUser });
    } catch (error) {
      throw error;
    }
  };

  const refreshUser = async () => {
    try {
      const user = await authService.getCurrentUser();
      await AsyncStorage.setItem('user_data', JSON.stringify(user));
      dispatch({ type: 'SET_USER', payload: user });
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    updateProfile,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
};