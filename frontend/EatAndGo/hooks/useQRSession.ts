import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SessionData {
  restaurantId: string;
  restaurantName?: string;
  tableNumber?: string;
  originalCode: string;
  timestamp: number;
}

const STORAGE_KEYS = {
  SESSION_DATA: '@qr_session_data',
  TABLE_NUMBER: '@table_number',
  RESTAURANT_ID: '@restaurant_id'
};

export const useQRSession = () => {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Charger les données au démarrage
  useEffect(() => {
    loadSessionData();
  }, []);

  const loadSessionData = async () => {
    try {
      setIsLoading(true);
      
      // Charger les données complètes
      const sessionDataStr = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_DATA);
      const sessionData = sessionDataStr ? JSON.parse(sessionDataStr) : null;
      
      // Charger les données individuelles
      const tableNum = await AsyncStorage.getItem(STORAGE_KEYS.TABLE_NUMBER);
      const restId = await AsyncStorage.getItem(STORAGE_KEYS.RESTAURANT_ID);
      
      setSessionData(sessionData);
      setTableNumber(tableNum);
      setRestaurantId(restId);
      
      console.log('📱 Session loaded:', {
        hasSession: !!sessionData,
        tableNumber: tableNum,
        restaurantId: restId
      });
      
    } catch (error) {
      console.error('Error loading session data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSessionData = async (data: SessionData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SESSION_DATA, JSON.stringify(data));
      
      if (data.tableNumber) {
        await AsyncStorage.setItem(STORAGE_KEYS.TABLE_NUMBER, data.tableNumber);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.RESTAURANT_ID, data.restaurantId);
      
      setSessionData(data);
      setTableNumber(data.tableNumber || null);
      setRestaurantId(data.restaurantId);
      
      console.log('✅ Session saved:', data);
    } catch (error) {
      console.error('❌ Error saving session data:', error);
      throw error;
    }
  };

  const updateTableNumber = async (newTableNumber: string) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TABLE_NUMBER, newTableNumber);
      setTableNumber(newTableNumber);
      
      // Mettre à jour les données de session complètes si elles existent
      if (sessionData) {
        const updatedSessionData = {
          ...sessionData,
          tableNumber: newTableNumber
        };
        await AsyncStorage.setItem(STORAGE_KEYS.SESSION_DATA, JSON.stringify(updatedSessionData));
        setSessionData(updatedSessionData);
      }
      
      console.log('✅ Table number updated:', newTableNumber);
    } catch (error) {
      console.error('❌ Error updating table number:', error);
      throw error;
    }
  };

  const clearSession = async () => {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.SESSION_DATA,
        STORAGE_KEYS.TABLE_NUMBER,
        STORAGE_KEYS.RESTAURANT_ID
      ]);
      
      setSessionData(null);
      setTableNumber(null);
      setRestaurantId(null);
      
      console.log('✅ Session cleared');
    } catch (error) {
      console.error('❌ Error clearing session:', error);
      throw error;
    }
  };

  const isSessionValid = () => {
    if (!sessionData) return false;
    
    const now = Date.now();
    const sessionAge = now - sessionData.timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 heures
    
    return sessionAge < maxAge;
  };

  return {
    // État
    sessionData,
    tableNumber,
    restaurantId,
    isLoading,
    
    // Actions
    saveSessionData,
    updateTableNumber,
    clearSession,
    loadSessionData,
    
    // Helpers
    isSessionValid: isSessionValid(),
    hasValidSession: isSessionValid() && !!sessionData
  };
};