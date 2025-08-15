// utils/qrSessionUtils.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const QR_SESSION_KEY = "@qr_session_data";

export interface QRSessionData {
  restaurantId: string;
  restaurantName?: string;
  tableNumber?: string;
  originalCode: string;
  timestamp: number;
}

export const QRSessionUtils = {
  /**
   * Sauvegarde les données de session QR
   */
  async saveSession(data: QRSessionData): Promise<void> {
    try {
      await AsyncStorage.setItem(QR_SESSION_KEY, JSON.stringify(data));
      console.log('✅ QR session saved:', data);
    } catch (error) {
      console.error('❌ Error saving QR session:', error);
      throw error;
    }
  },

  /**
   * Récupère les données de session QR
   */
  async getSession(): Promise<QRSessionData | null> {
    try {
      const data = await AsyncStorage.getItem(QR_SESSION_KEY);
      if (!data) return null;

      const sessionData: QRSessionData = JSON.parse(data);
      
      // Vérifier la validité (24h)
      const now = Date.now();
      const sessionAge = now - sessionData.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 heures
      
      if (sessionAge > maxAge) {
        // Session expirée
        await this.clearSession();
        console.log('🕐 QR session expired');
        return null;
      }

      return sessionData;
    } catch (error) {
      console.error('❌ Error getting QR session:', error);
      return null;
    }
  },

  /**
   * Met à jour le numéro de table dans la session
   */
  async updateTableNumber(tableNumber: string): Promise<void> {
    try {
      const existingSession = await this.getSession();
      if (existingSession) {
        const updatedSession = { ...existingSession, tableNumber };
        await this.saveSession(updatedSession);
        console.log('✅ Table number updated in QR session:', tableNumber);
      }
    } catch (error) {
      console.error('❌ Error updating table number:', error);
      throw error;
    }
  },

  /**
   * Supprime la session QR
   */
  async clearSession(): Promise<void> {
    try {
      await AsyncStorage.removeItem(QR_SESSION_KEY);
      console.log('✅ QR session cleared');
    } catch (error) {
      console.error('❌ Error clearing QR session:', error);
    }
  },

  /**
   * Vérifie si une session est valide
   */
  async isSessionValid(): Promise<boolean> {
    const session = await this.getSession();
    return !!session;
  },

  /**
   * Parse un code QR et crée une session
   */
  async createSessionFromCode(codeData: string): Promise<QRSessionData | null> {
    try {
      let restaurantId: string | null = null;
      let tableNumber: string | null = null;
      let parsedSuccessfully = false;

      // 1. Essayer de parser comme URL QR complète
      try {
        const url = new URL(codeData);
        const searchParams = url.searchParams;
        
        restaurantId = searchParams.get('restaurant') || searchParams.get('r');
        tableNumber = searchParams.get('table') || searchParams.get('t');
        
        if (restaurantId) {
          parsedSuccessfully = true;
        }
      } catch {
        // Pas une URL valide, continuer avec d'autres formats
      }

      // 2. Essayer les patterns dans l'URL path
      if (!parsedSuccessfully) {
        const restaurantMatch = codeData.match(/(?:restaurant|r)[\/=](\d+)/i);
        const tableMatch = codeData.match(/(?:table|t)[\/=](\d+)/i);
        
        if (restaurantMatch) {
          restaurantId = restaurantMatch[1];
          tableNumber = tableMatch ? tableMatch[1] : null;
          parsedSuccessfully = true;
        }
      }

      // 3. Essayer les formats de codes simples
      if (!parsedSuccessfully) {
        // Format: R123T05 (Restaurant 123, Table 5)
        const formatRTMatch = codeData.match(/^R(\d+)T(\d+)$/i);
        if (formatRTMatch) {
          restaurantId = formatRTMatch[1];
          tableNumber = formatRTMatch[2];
          parsedSuccessfully = true;
        }
        
        // Format: R123 (Restaurant 123 seulement)
        if (!parsedSuccessfully) {
          const formatRMatch = codeData.match(/^R(\d+)$/i);
          if (formatRMatch) {
            restaurantId = formatRMatch[1];
            parsedSuccessfully = true;
          }
        }
        
        // Format: Code numérique simple (assume restaurant ID)
        if (!parsedSuccessfully && /^\d+$/.test(codeData)) {
          restaurantId = codeData;
          parsedSuccessfully = true;
        }
      }

      if (parsedSuccessfully && restaurantId) {
        // Normaliser le numéro de table (supprimer les zéros en préfixe)
        const normalizedTableNumber = tableNumber ? parseInt(tableNumber, 10).toString() : undefined;
        
        const sessionData: QRSessionData = {
          restaurantId,
          tableNumber: normalizedTableNumber,
          originalCode: codeData,
          timestamp: Date.now()
        };

        await this.saveSession(sessionData);
        console.log('📋 QR session created:', sessionData);
        return sessionData;
      }

      return null;
    } catch (error) {
      console.error('❌ Error creating session from code:', error);
      return null;
    }
  }
};