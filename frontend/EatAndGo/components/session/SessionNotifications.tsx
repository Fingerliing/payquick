/**
 * Système de notifications toast pour les sessions collaboratives
 */

import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSessionWebSocket } from '@/hooks/session/useSessionWebSocket';

// ============================================================================
// TYPES
// ============================================================================

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

interface NotificationContextType {
  showNotification: (notification: Omit<SessionNotification, 'id'>) => void;
  hideNotification: (id: string) => void;
  clearAll: () => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<SessionNotification[]>([]);

  const showNotification = useCallback((notification: Omit<SessionNotification, 'id'>) => {
    const id = Math.random().toString(36).substring(7);
    const newNotification: SessionNotification = {
      ...notification,
      id,
      duration: notification.duration || 4000,
    };

    setNotifications((prev) => [...prev, newNotification]);

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
    <NotificationContext.Provider value={{ showNotification, hideNotification, clearAll }}>
      {children}
      <NotificationContainer notifications={notifications} onHide={hideNotification} />
    </NotificationContext.Provider>
  );
};

// ============================================================================
// NOTIFICATION CONTAINER
// ============================================================================

const NotificationContainer: React.FC<{
  notifications: SessionNotification[];
  onHide: (id: string) => void;
}> = ({ notifications, onHide }) => {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {notifications.map((notification) => (
        <NotificationCard key={notification.id} notification={notification} onHide={onHide} />
      ))}
    </View>
  );
};

// ============================================================================
// NOTIFICATION CARD
// ============================================================================

const NotificationCard: React.FC<{
  notification: SessionNotification;
  onHide: (id: string) => void;
}> = ({ notification, onHide }) => {
  const [translateY] = useState(new Animated.Value(-100));
  const [opacity] = useState(new Animated.Value(0));

  useEffect(() => {
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
        <Ionicons name={config.icon} size={24} color={config.iconColor} style={styles.notificationIcon} />
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
          <Text style={styles.actionButtonText}>{notification.action.label}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

// ============================================================================
// HOOK: useSessionNotifications
// ============================================================================

export const useSessionNotifications = (sessionId: string | null) => {
  const { showNotification } = useNotifications();
  const { on } = useSessionWebSocket(sessionId);

  useEffect(() => {
    if (!sessionId) return;

    const unsubJoined = on('participant_joined', (participant: any) => {
      showNotification({
        type: 'info',
        title: 'Nouveau participant',
        message: `${participant.display_name} a rejoint la session`,
        icon: 'person-add',
      });
    });

    const unsubPending = on('session_update', (data: any) => {
      if (data.event === 'participant_pending') {
        const name = data.actor || 'Quelqu\'un';
        showNotification({
          type: 'warning',
          title: '⏳ Demande d\'accès',
          message: `${name} souhaite rejoindre la session`,
          icon: 'person-add-outline',
          duration: 8000,
        });
      }
    });

    const unsubLeft = on('participant_left', () => {
      showNotification({
        type: 'info',
        title: 'Participant parti',
        message: 'Un participant a quitté la session',
        icon: 'person-remove',
      });
    });

    const unsubOrderCreated = on('order_created', (order: any) => {
      showNotification({
        type: 'success',
        title: 'Nouvelle commande',
        message: `${order.participant_name} vient de commander`,
        icon: 'receipt',
      });
    });

    const unsubOrderUpdated = on('order_updated', (order: any) => {
      if (order.status === 'ready') {
        showNotification({
          type: 'success',
          title: 'Commande prête !',
          message: `La commande #${order.order_number} est prête`,
          icon: 'checkmark-circle',
        });
      }
    });

    const unsubLocked = on('session_locked', () => {
      showNotification({
        type: 'warning',
        title: 'Session verrouillée',
        message: 'Plus de nouveaux participants peuvent rejoindre',
        icon: 'lock-closed',
      });
    });

    const unsubUnlocked = on('session_unlocked', () => {
      showNotification({
        type: 'info',
        title: 'Session déverrouillée',
        message: 'Les participants peuvent à nouveau rejoindre',
        icon: 'lock-open',
      });
    });

    const unsubCompleted = on('session_completed', (data: any) => {
      const archiveTime = data?.will_archive_in ? Math.floor(data.will_archive_in / 60000) : 30;
      showNotification({
        type: 'success',
        title: 'Session terminée',
        message: `Merci et à bientôt ! La session sera archivée dans ${archiveTime} minutes.`,
        icon: 'checkmark-done',
        duration: 6000,
      });
    });

    const unsubArchived = on('session_archived', (data: any) => {
      showNotification({
        type: 'warning',
        title: '🗄️ Session archivée',
        message: data?.message || 'Cette session a été archivée et n\'est plus accessible.',
        icon: 'archive',
        duration: 8000,
        action: data?.redirect_suggested ? {
          label: 'Retour à l\'accueil',
          onPress: () => console.log('Navigate to home'),
        } : undefined,
      });
    });

    const unsubTableReleased = on('table_released', (data: any) => {
      showNotification({
        type: 'info',
        title: '🆓 Table libérée',
        message: data?.message || `La table ${data?.table_number || ''} a été libérée.`,
        icon: 'checkmark-circle',
        duration: 5000,
      });
    });

    return () => {
      unsubJoined();
      unsubPending();
      unsubLeft();
      unsubOrderCreated();
      unsubOrderUpdated();
      unsubLocked();
      unsubUnlocked();
      unsubCompleted();
      unsubArchived();
      unsubTableReleased();
    };
  }, [sessionId, on, showNotification]);
};

// ============================================================================
// NOTIFICATION HELPERS
// ============================================================================

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
    title: '🛒 Nouvelle commande',
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

  sessionCompleted: (archiveMinutes: number = 30) => ({
    type: 'success' as NotificationType,
    title: '🎉 Session terminée',
    message: `Merci et à bientôt ! Archivage dans ${archiveMinutes} min.`,
  }),

  sessionArchived: (message?: string) => ({
    type: 'warning' as NotificationType,
    title: '🗄️ Session archivée',
    message: message || 'Cette session a été archivée et n\'est plus accessible.',
  }),

  tableReleased: (tableNumber: string) => ({
    type: 'info' as NotificationType,
    title: '🆓 Table libérée',
    message: `La table ${tableNumber} est maintenant disponible`,
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

// ============================================================================
// STYLES
// ============================================================================

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