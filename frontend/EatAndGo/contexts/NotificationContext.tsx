import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  notificationService,
  PushNotification,
  NotificationPreferences,
  NotificationData,
} from '@/services/notificationService';
import { useAuth } from './AuthContext';

// =============================================================================
// TYPES
// =============================================================================

interface NotificationContextType {
  // État
  isInitialized: boolean;
  isLoading: boolean;
  expoPushToken: string | null;
  notifications: PushNotification[];
  unreadCount: number;
  preferences: NotificationPreferences | null;
  hasPermissions: boolean;

  // Actions
  initialize: () => Promise<void>;
  requestPermissions: () => Promise<boolean>;
  refreshNotifications: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  showLocalNotification: (title: string, body: string, data?: NotificationData) => Promise<void>;
  clearBadge: () => Promise<void>;

  // Pour les invités
  registerGuestToken: (phone: string) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// =============================================================================
// PROVIDER
// =============================================================================

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  // État
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [hasPermissions, setHasPermissions] = useState(false);

  // Refs pour éviter les re-rendus
  const appState = useRef(AppState.currentState);
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ===========================================================================
  // INITIALISATION
  // ===========================================================================

  const initialize = useCallback(async () => {
    if (isInitialized) return;

    try {
      setIsLoading(true);
      console.log('🔔 Initialisation du contexte de notifications...');

      // Initialiser le service
      const token = await notificationService.initialize();
      setExpoPushToken(token);
      setHasPermissions(!!token);

      if (token) {
        // Enregistrer le token sur le serveur si authentifié
        if (isAuthenticated) {
          await notificationService.registerTokenOnServer();
        }

        // Configurer les callbacks
        setupNotificationCallbacks();
      }

      setIsInitialized(true);
      console.log('✅ Contexte de notifications initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation contexte:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, isInitialized]);

  // ===========================================================================
  // CALLBACKS DE NOTIFICATIONS
  // ===========================================================================

  const setupNotificationCallbacks = useCallback(() => {
    // Notification reçue en foreground
    notificationService.setOnNotificationReceived((notification) => {
      console.log('📬 Notification reçue en foreground:', notification.request.content.title);
      
      // Rafraîchir le compteur
      refreshUnreadCount();
      
      // Optionnel: Ajouter à la liste locale
      // (la notification sera aussi récupérée du serveur)
    });

    // Notification tapée
    notificationService.setOnNotificationResponse((response) => {
      const data = response.notification.request.content.data as NotificationData;
      console.log('👆 Navigation depuis notification:', data);

      handleNotificationNavigation(data);
    });
  }, []);

  /**
   * Gérer la navigation depuis une notification
   */
  const handleNotificationNavigation = useCallback((data: NotificationData) => {
    if (!data) return;

    // Navigation basée sur les données de la notification
    if (data.screen) {
      switch (data.screen) {
        case 'order_detail':
        case 'order_tracking':
          if (data.order_id) {
            router.push(`/order/tracking/${data.order_id}`);
          }
          break;

        case 'order_rating':
          if (data.order_id) {
            router.push(`/order/rating/${data.order_id}`);
          }
          break;

        case 'restaurant_orders':
          router.push('/(restaurant)/orders');
          break;

        case 'view_session':
          if (data.session_id) {
            router.push(`/session/${data.session_id}`);
          }
          break;

        default:
          // Écran par défaut basé sur l'action
          if (data.action === 'view_order' && data.order_id) {
            router.push(`/order/${data.order_id}`);
          }
      }
    } else if (data.action === 'view_order' && data.order_id) {
      router.push(`/order/${data.order_id}`);
    }
  }, [router]);

  // ===========================================================================
  // PERMISSIONS
  // ===========================================================================

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const granted = await notificationService.requestPermissions();
    setHasPermissions(granted);

    if (granted && !expoPushToken) {
      const token = await notificationService.getExpoPushToken();
      setExpoPushToken(token);

      if (token && isAuthenticated) {
        await notificationService.registerTokenOnServer();
      }
    }

    return granted;
  }, [expoPushToken, isAuthenticated]);

  // ===========================================================================
  // RÉCUPÉRATION DES DONNÉES
  // ===========================================================================

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const response = await notificationService.getNotifications({
        page: 1,
        page_size: 50,
      });

      if (response) {
        setNotifications(response.results);
      }
    } catch (error) {
      console.error('❌ Erreur récupération notifications:', error);
    }
  }, [isAuthenticated]);

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);

      // Mettre à jour le badge
      await notificationService.setBadgeCount(count);
    } catch (error) {
      console.error('❌ Erreur récupération compteur:', error);
    }
  }, [isAuthenticated]);

  const refreshPreferences = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const prefs = await notificationService.getPreferences();
      if (prefs) {
        setPreferences(prefs);
      }
    } catch (error) {
      console.error('❌ Erreur récupération préférences:', error);
    }
  }, [isAuthenticated]);

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  const markAsRead = useCallback(async (notificationId: string) => {
    const success = await notificationService.markAsRead(notificationId);
    if (success) {
      // Mettre à jour localement
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    const count = await notificationService.markAllAsRead();
    if (count > 0) {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
      await notificationService.setBadgeCount(0);
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId: string) => {
    const success = await notificationService.deleteNotification(notificationId);
    if (success) {
      const notification = notifications.find((n) => n.id === notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      
      if (notification && !notification.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    }
  }, [notifications]);

  const updatePreferences = useCallback(async (prefs: Partial<NotificationPreferences>) => {
    const updated = await notificationService.updatePreferences(prefs);
    if (updated) {
      setPreferences(updated);
    }
  }, []);

  const showLocalNotification = useCallback(async (
    title: string,
    body: string,
    data?: NotificationData
  ) => {
    await notificationService.showLocalNotification(title, body, data);
  }, []);

  const clearBadge = useCallback(async () => {
    await notificationService.setBadgeCount(0);
  }, []);

  const registerGuestToken = useCallback(async (phone: string): Promise<boolean> => {
    return await notificationService.registerTokenOnServer(phone);
  }, []);

  // ===========================================================================
  // EFFETS
  // ===========================================================================

  // Initialiser au montage
  useEffect(() => {
    initialize();

    return () => {
      notificationService.cleanup();
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, []);

  // Charger les données quand l'utilisateur est authentifié
  useEffect(() => {
    if (isAuthenticated && isInitialized) {
      // Enregistrer le token
      if (expoPushToken) {
        notificationService.registerTokenOnServer();
      }

      // Charger les données
      refreshNotifications();
      refreshUnreadCount();
      refreshPreferences();

      // Rafraîchir périodiquement
      refreshInterval.current = setInterval(() => {
        refreshUnreadCount();
      }, 60000); // Toutes les minutes
    } else {
      // Nettoyer si déconnecté
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
        refreshInterval.current = null;
      }
      setNotifications([]);
      setUnreadCount(0);
      setPreferences(null);
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [isAuthenticated, isInitialized, expoPushToken]);

  // Rafraîchir quand l'app revient au premier plan
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isAuthenticated
      ) {
        console.log('📱 App revenue au premier plan - rafraîchissement...');
        refreshUnreadCount();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  // Supprimer le token du serveur à la déconnexion
  useEffect(() => {
    if (!isAuthenticated && expoPushToken) {
      notificationService.unregisterTokenFromServer();
    }
  }, [isAuthenticated, expoPushToken]);

  // ===========================================================================
  // VALEUR DU CONTEXTE
  // ===========================================================================

  const value: NotificationContextType = {
    // État
    isInitialized,
    isLoading,
    expoPushToken,
    notifications,
    unreadCount,
    preferences,
    hasPermissions,

    // Actions
    initialize,
    requestPermissions,
    refreshNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updatePreferences,
    showLocalNotification,
    clearBadge,
    registerGuestToken,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications doit être utilisé dans un NotificationProvider');
  }
  return context;
}

// =============================================================================
// HOOKS UTILITAIRES
// =============================================================================

/**
 * Hook pour afficher le badge de notification
 */
export function useUnreadNotificationCount(): number {
  const { unreadCount } = useNotifications();
  return unreadCount;
}

/**
 * Hook pour vérifier si les notifications sont activées
 */
export function useNotificationPermissions(): {
  hasPermissions: boolean;
  requestPermissions: () => Promise<boolean>;
} {
  const { hasPermissions, requestPermissions } = useNotifications();
  return { hasPermissions, requestPermissions };
}

export default NotificationProvider;