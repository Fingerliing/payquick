import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Types de notifications
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface SessionNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

// Context pour gérer les notifications globalement
import { createContext, useContext } from 'react';

interface NotificationContextType {
  showNotification: (notification: Omit<SessionNotification, 'id'>) => void;
  hideNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

// Provider de notifications
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<SessionNotification[]>([]);

  const showNotification = useCallback((
    notification: Omit<SessionNotification, 'id'>
  ) => {
    const id = Math.random().toString(36).substring(7);
    const newNotification: SessionNotification = {
      ...notification,
      id,
      duration: notification.duration || 4000,
    };

    setNotifications((prev) => [...prev, newNotification]);

    // Auto-hide après duration
    if (newNotification.duration) {
      setTimeout(() => {
        hideNotification(id);
      }, newNotification.duration);
    }
  }, []);

  const hideNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{ showNotification, hideNotification, clearAll }}
    >
      {children}
      <NotificationContainer
        notifications={notifications}
        onHide={hideNotification}
      />
    </NotificationContext.Provider>
  );
};

// Container pour afficher les notifications
const NotificationContainer: React.FC<{
  notifications: SessionNotification[];
  onHide: (id: string) => void;
}> = ({ notifications, onHide }) => {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onHide={onHide}
        />
      ))}
    </View>
  );
};

// Carte de notification
const NotificationCard: React.FC<{
  notification: SessionNotification;
  onHide: (id: string) => void;
}> = ({ notification, onHide }) => {
  const [translateY] = useState(new Animated.Value(-100));
  const [opacity] = useState(new Animated.Value(0));

  useEffect(() => {
    // Animation d'entrée
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Animation de sortie avant suppression
    const timer = setTimeout(() => {
      handleHide();
    }, (notification.duration || 4000) - 300);

    return () => clearTimeout(timer);
  }, []);

  const handleHide = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide(notification.id);
    });
  };

  const getConfig = () => {
    switch (notification.type) {
      case 'success':
        return {
          backgroundColor: '#4CAF50',
          icon: notification.icon || 'checkmark-circle',
          iconColor: '#FFF',
        };
      case 'error':
        return {
          backgroundColor: '#F44336',
          icon: notification.icon || 'alert-circle',
          iconColor: '#FFF',
        };
      case 'warning':
        return {
          backgroundColor: '#FF9800',
          icon: notification.icon || 'warning',
          iconColor: '#FFF',
        };
      default:
        return {
          backgroundColor: '#2196F3',
          icon: notification.icon || 'information-circle',
          iconColor: '#FFF',
        };
    }
  };

  const config = getConfig();

  return (
    <Animated.View
      style={[
        styles.notificationCard,
        {
          backgroundColor: config.backgroundColor,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.notificationContent}>
        <Ionicons
          name={config.icon}
          size={24}
          color={config.iconColor}
          style={styles.notificationIcon}
        />
        <View style={styles.notificationText}>
          <Text style={styles.notificationTitle}>{notification.title}</Text>
          <Text style={styles.notificationMessage}>{notification.message}</Text>
        </View>
        <TouchableOpacity onPress={handleHide} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {notification.action && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            notification.action!.onPress();
            handleHide();
          }}
        >
          <Text style={styles.actionButtonText}>
            {notification.action.label}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

// Hook personnalisé pour les notifications de session
export const useSessionNotifications = (sessionId: string) => {
  const { showNotification } = useNotifications();
  const { on } = useSessionWebSocket(sessionId);

  useEffect(() => {
    // Participant rejoint
    const unsubJoined = on('participant_joined', (participant) => {
      showNotification({
        type: 'info',
        title: 'Nouveau participant',
        message: `${participant.display_name} a rejoint la session`,
        icon: 'person-add',
      });
    });

    // Participant parti
    const unsubLeft = on('participant_left', (participantId) => {
      showNotification({
        type: 'info',
        title: 'Participant parti',
        message: 'Un participant a quitté la session',
        icon: 'person-remove',
      });
    });

    // Nouvelle commande
    const unsubOrderCreated = on('order_created', (order) => {
      showNotification({
        type: 'success',
        title: 'Nouvelle commande',
        message: `${order.participant_name} vient de commander`,
        icon: 'receipt',
      });
    });

    // Commande mise à jour
    const unsubOrderUpdated = on('order_updated', (order) => {
      if (order.status === 'ready') {
        showNotification({
          type: 'success',
          title: 'Commande prête !',
          message: `La commande #${order.order_number} est prête`,
          icon: 'checkmark-circle',
        });
      }
    });

    // Session verrouillée
    const unsubLocked = on('session_locked', (lockedBy) => {
      showNotification({
        type: 'warning',
        title: 'Session verrouillée',
        message: 'Plus de nouveaux participants peuvent rejoindre',
        icon: 'lock-closed',
      });
    });

    // Session déverrouillée
    const unsubUnlocked = on('session_unlocked', () => {
      showNotification({
        type: 'info',
        title: 'Session déverrouillée',
        message: 'Les participants peuvent à nouveau rejoindre',
        icon: 'lock-open',
      });
    });

    // Session terminée
    const unsubCompleted = on('session_completed', () => {
      showNotification({
        type: 'success',
        title: 'Session terminée',
        message: 'Merci et à bientôt !',
        icon: 'checkmark-done',
        duration: 6000,
      });
    });

    return () => {
      unsubJoined();
      unsubLeft();
      unsubOrderCreated();
      unsubOrderUpdated();
      unsubLocked();
      unsubUnlocked();
      unsubCompleted();
    };
  }, [on, showNotification]);
};

// Helper pour notifications personnalisées
export const sessionNotifications = {
  participantJoined: (name: string) => ({
    type: 'info' as NotificationType,
    title: '👋 Nouveau participant',
    message: `${name} a rejoint la session`,
  }),

  participantLeft: (name: string) => ({
    type: 'info' as NotificationType,
    title: '👋 Participant parti',
    message: `${name} a quitté la session`,
  }),

  orderCreated: (participantName: string, orderNumber: string) => ({
    type: 'success' as NotificationType,
    title: '🛎️ Nouvelle commande',
    message: `${participantName} a commandé (#${orderNumber})`,
  }),

  orderReady: (orderNumber: string) => ({
    type: 'success' as NotificationType,
    title: '✅ Commande prête',
    message: `La commande #${orderNumber} est prête !`,
  }),

  sessionLocked: () => ({
    type: 'warning' as NotificationType,
    title: '🔒 Session verrouillée',
    message: 'Plus de nouveaux participants',
  }),

  sessionCompleted: () => ({
    type: 'success' as NotificationType,
    title: '🎉 Session terminée',
    message: 'Merci et à bientôt !',
  }),

  paymentRequired: (amount: number) => ({
    type: 'warning' as NotificationType,
    title: '💳 Paiement requis',
    message: `Montant à payer : ${amount.toFixed(2)}€`,
  }),

  error: (message: string) => ({
    type: 'error' as NotificationType,
    title: '❌ Erreur',
    message,
  }),
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 16,
  },
  notificationCard: {
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  notificationIcon: {
    marginRight: 12,
  },
  notificationText: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#FFF',
    opacity: 0.9,
  },
  closeButton: {
    padding: 4,
  },
  actionButton: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

// Import à ajouter pour utiliser WebSocket
import { useSessionWebSocket } from '@/services/sessionWebSocket';

// Exemple d'utilisation dans App.tsx
/*
import { NotificationProvider } from '@/components/SessionNotifications';

export default function App() {
  return (
    <NotificationProvider>
      <NavigationContainer>
        <Stack.Navigator>
          ...
        </Stack.Navigator>
      </NavigationContainer>
    </NotificationProvider>
  );
}
*/

// Exemple d'utilisation dans un composant
/*
import { useNotifications, sessionNotifications } from '@/components/SessionNotifications';

function MyComponent() {
  const { showNotification } = useNotifications();

  const handleSomething = () => {
    showNotification(sessionNotifications.orderReady('T5-01'));
    
    // Ou personnalisé
    showNotification({
      type: 'success',
      title: 'Succès',
      message: 'Action effectuée',
      action: {
        label: 'Voir',
        onPress: () => console.log('Action pressed'),
      },
    });
  };

  return <Button onPress={handleSomething}>Test Notification</Button>;
}
*/