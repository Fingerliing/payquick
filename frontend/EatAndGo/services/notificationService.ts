import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationData {
  order_id?: number;
  restaurant_id?: number;
  session_id?: string;
  action?: string;
  screen?: string;
  [key: string]: any;
}

export interface PushNotification {
  id: string;
  notification_type: string;
  type_display: string;
  title: string;
  body: string;
  data: NotificationData;
  priority: 'low' | 'normal' | 'high' | 'critical';
  is_read: boolean;
  read_at: string | null;
  order_id: number | null;
  restaurant_id: number | null;
  created_at: string;
  time_ago: string;
}

export interface NotificationPreferences {
  order_updates: boolean;
  order_ready: boolean;
  payment_received: boolean;
  new_orders: boolean;
  promotions: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  sound_enabled: boolean;
  vibration_enabled: boolean;
}

export interface NotificationListResponse {
  results: PushNotification[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Configuration du comportement des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Clés de stockage
const STORAGE_KEYS = {
  EXPO_TOKEN: 'expo_push_token',
  NOTIFICATION_PERMISSIONS: 'notification_permissions',
  DEVICE_ID: 'device_id',
};

// =============================================================================
// SERVICE
// =============================================================================

class NotificationService {
  private expoPushToken: string | null = null;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;
  private onNotificationReceived: ((notification: Notifications.Notification) => void) | null = null;
  private onNotificationResponse: ((response: Notifications.NotificationResponse) => void) | null = null;

  // ===========================================================================
  // INITIALISATION
  // ===========================================================================

  /**
   * Initialiser le service de notifications
   * À appeler au démarrage de l'application
   */
  async initialize(): Promise<string | null> {
    try {
      console.log('📱 Initialisation du service de notifications...');

      // Vérifier si c'est un appareil physique
      if (!Device.isDevice) {
        console.warn('⚠️ Les notifications push ne fonctionnent que sur les appareils physiques');
        return null;
      }

      // Demander les permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.warn('⚠️ Permissions de notification refusées');
        return null;
      }

      // Obtenir le token Expo Push
      const token = await this.getExpoPushToken();
      if (!token) {
        console.error('❌ Impossible d\'obtenir le token push');
        return null;
      }

      this.expoPushToken = token;
      console.log('✅ Token push obtenu:', token.substring(0, 30) + '...');

      // Configurer les canaux Android
      if (Platform.OS === 'android') {
        await this.setupAndroidChannels();
      }

      // Configurer les listeners
      this.setupNotificationListeners();

      return token;
    } catch (error) {
      console.error('❌ Erreur initialisation notifications:', error);
      return null;
    }
  }

  /**
   * Nettoyer les listeners (à appeler lors du démontage)
   */
  cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  // ===========================================================================
  // PERMISSIONS
  // ===========================================================================

  /**
   * Demander les permissions de notification
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      const granted = finalStatus === 'granted';
      await AsyncStorage.setItem(
        STORAGE_KEYS.NOTIFICATION_PERMISSIONS,
        JSON.stringify({ granted, timestamp: Date.now() })
      );

      return granted;
    } catch (error) {
      console.error('❌ Erreur permissions:', error);
      return false;
    }
  }

  /**
   * Vérifier si les permissions sont accordées
   */
  async hasPermissions(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }

  // ===========================================================================
  // TOKEN MANAGEMENT
  // ===========================================================================

  /**
   * Obtenir le token Expo Push
   */
  async getExpoPushToken(): Promise<string | null> {
    try {
      // Vérifier le cache
      const cachedToken = await AsyncStorage.getItem(STORAGE_KEYS.EXPO_TOKEN);
      if (cachedToken) {
        return cachedToken;
      }

      // Obtenir un nouveau token
      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // Depuis app.json ou env
      });

      // Sauvegarder
      await AsyncStorage.setItem(STORAGE_KEYS.EXPO_TOKEN, token);

      return token;
    } catch (error) {
      console.error('❌ Erreur obtention token:', error);
      return null;
    }
  }

  /**
   * Enregistrer le token sur le serveur
   */
  async registerTokenOnServer(guestPhone?: string): Promise<boolean> {
    try {
      const token = this.expoPushToken || await this.getExpoPushToken();
      if (!token) {
        console.error('❌ Pas de token à enregistrer');
        return false;
      }

      // Obtenir l'ID de l'appareil
      const deviceId = await this.getDeviceId();

      const response = await apiClient.post('/api/v1/notifications/tokens/register/', {
        expo_token: token,
        device_id: deviceId,
        device_name: Device.deviceName || 'Unknown',
        device_platform: Platform.OS,
        guest_phone: guestPhone,
      });

      console.log('✅ Token enregistré sur le serveur');
      return true;
    } catch (error) {
      console.error('❌ Erreur enregistrement token:', error);
      return false;
    }
  }

  /**
   * Supprimer le token du serveur (déconnexion)
   */
  async unregisterTokenFromServer(): Promise<boolean> {
    try {
      const token = this.expoPushToken || await AsyncStorage.getItem(STORAGE_KEYS.EXPO_TOKEN);
      if (!token) {
        return true; // Pas de token à supprimer
      }

      await apiClient.post('/api/v1/notifications/tokens/unregister/', {
        expo_token: token,
      });

      console.log('✅ Token supprimé du serveur');
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression token:', error);
      return false;
    }
  }

  /**
   * Obtenir ou générer un ID d'appareil unique
   */
  private async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  }

  // ===========================================================================
  // LISTENERS
  // ===========================================================================

  /**
   * Configurer les listeners de notifications
   */
  private setupNotificationListeners(): void {
    // Notification reçue en foreground
    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('📬 Notification reçue:', notification.request.content.title);
        if (this.onNotificationReceived) {
          this.onNotificationReceived(notification);
        }
      }
    );

    // Réponse à une notification (tap)
    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('👆 Notification tapée:', response.notification.request.content.title);
        if (this.onNotificationResponse) {
          this.onNotificationResponse(response);
        }
      }
    );
  }

  /**
   * Définir le callback pour les notifications reçues
   */
  setOnNotificationReceived(callback: (notification: Notifications.Notification) => void): void {
    this.onNotificationReceived = callback;
  }

  /**
   * Définir le callback pour les réponses aux notifications
   */
  setOnNotificationResponse(callback: (response: Notifications.NotificationResponse) => void): void {
    this.onNotificationResponse = callback;
  }

  // ===========================================================================
  // CANAUX ANDROID
  // ===========================================================================

  /**
   * Configurer les canaux de notification Android
   */
  private async setupAndroidChannels(): Promise<void> {
    // Canal par défaut
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications générales',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4AF37', // Or EatQuickeR
      sound: 'default',
    });

    // Canal pour les commandes prêtes (haute priorité)
    await Notifications.setNotificationChannelAsync('orders', {
      name: 'Commandes',
      description: 'Notifications de suivi des commandes',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#22C55E', // Vert succès
      sound: 'default',
    });

    // Canal pour les paiements
    await Notifications.setNotificationChannelAsync('payments', {
      name: 'Paiements',
      description: 'Notifications de paiement',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#3B82F6', // Bleu
      sound: 'default',
    });

    // Canal pour les restaurateurs (nouvelles commandes)
    await Notifications.setNotificationChannelAsync('restaurant', {
      name: 'Restaurant',
      description: 'Notifications pour les restaurateurs',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 500, 1000],
      lightColor: '#EF4444', // Rouge urgent
      sound: 'default',
    });

    console.log('✅ Canaux Android configurés');
  }

  // ===========================================================================
  // API SERVEUR - PRÉFÉRENCES
  // ===========================================================================

  /**
   * Récupérer les préférences de notification
   */
  async getPreferences(): Promise<NotificationPreferences | null> {
    try {
      const response = await apiClient.get('/api/v1/notifications/preferences/');
      return response;
    } catch (error) {
      console.error('❌ Erreur récupération préférences:', error);
      return null;
    }
  }

  /**
   * Mettre à jour les préférences de notification
   */
  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<NotificationPreferences | null> {
    try {
      const response = await apiClient.patch('/api/v1/notifications/preferences/', preferences);
      return response;
    } catch (error) {
      console.error('❌ Erreur mise à jour préférences:', error);
      return null;
    }
  }

  // ===========================================================================
  // API SERVEUR - HISTORIQUE
  // ===========================================================================

  /**
   * Récupérer la liste des notifications
   */
  async getNotifications(params?: {
    page?: number;
    page_size?: number;
    unread_only?: boolean;
    type?: string;
  }): Promise<NotificationListResponse | null> {
    try {
      const response = await apiClient.get('/api/v1/notifications/', { params });
      return response;
    } catch (error) {
      console.error('❌ Erreur récupération notifications:', error);
      return null;
    }
  }

  /**
   * Récupérer le nombre de notifications non lues
   */
  async getUnreadCount(): Promise<number> {
    try {
      const response = await apiClient.get('/api/v1/notifications/unread-count/');
      return response.unread_count || 0;
    } catch (error) {
      console.error('❌ Erreur récupération compteur:', error);
      return 0;
    }
  }

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      await apiClient.post(`/api/v1/notifications/${notificationId}/read/`);
      return true;
    } catch (error) {
      console.error('❌ Erreur marquage lecture:', error);
      return false;
    }
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(): Promise<number> {
    try {
      const response = await apiClient.post('/api/v1/notifications/read-all/');
      return response.marked_count || 0;
    } catch (error) {
      console.error('❌ Erreur marquage tout lu:', error);
      return 0;
    }
  }

  /**
   * Supprimer une notification
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/v1/notifications/${notificationId}/`);
      return true;
    } catch (error) {
      console.error('❌ Erreur suppression notification:', error);
      return false;
    }
  }

  // ===========================================================================
  // NOTIFICATIONS LOCALES
  // ===========================================================================

  /**
   * Afficher une notification locale (pour les mises à jour WebSocket)
   */
  async showLocalNotification(
    title: string,
    body: string,
    data?: NotificationData,
    channelId: string = 'default'
  ): Promise<string> {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data as any,
        sound: 'default',
      },
      trigger: null, // Immédiat
    });

    return identifier;
  }

  /**
   * Mettre à jour le badge de l'application
   */
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  /**
   * Effacer toutes les notifications affichées
   */
  async clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
  }

  // ===========================================================================
  // UTILITAIRES
  // ===========================================================================

  /**
   * Obtenir le token actuel
   */
  getToken(): string | null {
    return this.expoPushToken;
  }

  /**
   * Vérifier si le service est initialisé
   */
  isInitialized(): boolean {
    return this.expoPushToken !== null;
  }
}

// Instance singleton
export const notificationService = new NotificationService();

// Export par défaut
export default notificationService;