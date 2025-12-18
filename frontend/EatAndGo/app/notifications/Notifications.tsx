import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from '@/contexts/NotificationContext';
import { PushNotification } from '@/services/notificationService';

// =============================================================================
// CONSTANTES
// =============================================================================

const COLORS = {
  primary: '#1E3A5F',      // Bleu EatQuickeR
  gold: '#D4AF37',         // Or premium
  background: '#F8F9FA',
  cardBg: '#FFFFFF',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  unread: '#EFF6FF',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

// Icônes par type de notification
const NOTIFICATION_ICONS: Record<string, { name: string; color: string }> = {
  order_created: { name: 'receipt-outline', color: COLORS.info },
  order_confirmed: { name: 'checkmark-circle-outline', color: COLORS.success },
  order_preparing: { name: 'restaurant-outline', color: COLORS.warning },
  order_ready: { name: 'fast-food-outline', color: COLORS.success },
  order_served: { name: 'checkmark-done-outline', color: COLORS.success },
  order_cancelled: { name: 'close-circle-outline', color: COLORS.error },
  payment_received: { name: 'card-outline', color: COLORS.success },
  payment_failed: { name: 'alert-circle-outline', color: COLORS.error },
  split_payment_update: { name: 'people-outline', color: COLORS.info },
  session_joined: { name: 'person-add-outline', color: COLORS.info },
  session_left: { name: 'person-remove-outline', color: COLORS.textMuted },
  promotion: { name: 'pricetag-outline', color: COLORS.gold },
  system: { name: 'notifications-outline', color: COLORS.primary },
  new_orders: { name: 'restaurant-outline', color: COLORS.warning },
};

// =============================================================================
// COMPOSANT NOTIFICATION ITEM
// =============================================================================

interface NotificationItemProps {
  notification: PushNotification;
  onPress: (notification: PushNotification) => void;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}

function NotificationItem({
  notification,
  onPress,
  onMarkRead,
  onDelete,
}: NotificationItemProps) {
  const iconConfig = NOTIFICATION_ICONS[notification.notification_type] || NOTIFICATION_ICONS.system;

  const handleLongPress = () => {
    Alert.alert(
      'Actions',
      'Que voulez-vous faire ?',
      [
        {
          text: notification.is_read ? 'Déjà lu' : 'Marquer comme lu',
          onPress: () => !notification.is_read && onMarkRead(notification.id),
          style: notification.is_read ? 'cancel' : 'default',
        },
        {
          text: 'Supprimer',
          onPress: () => onDelete(notification.id),
          style: 'destructive',
        },
        {
          text: 'Annuler',
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !notification.is_read && styles.notificationUnread,
      ]}
      onPress={() => onPress(notification)}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {/* Indicateur non lu */}
      {!notification.is_read && <View style={styles.unreadDot} />}

      {/* Icône */}
      <View style={[styles.iconContainer, { backgroundColor: `${iconConfig.color}15` }]}>
        <Ionicons
          name={iconConfig.name as any}
          size={24}
          color={iconConfig.color}
        />
      </View>

      {/* Contenu */}
      <View style={styles.notificationContent}>
        <Text
          style={[
            styles.notificationTitle,
            !notification.is_read && styles.notificationTitleUnread,
          ]}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text style={styles.notificationBody} numberOfLines={2}>
          {notification.body}
        </Text>
        <Text style={styles.notificationTime}>{notification.time_ago}</Text>
      </View>

      {/* Flèche */}
      <Ionicons
        name="chevron-forward"
        size={20}
        color={COLORS.textMuted}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const [refreshing, setRefreshing] = useState(false);

  // Rafraîchir les notifications
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshNotifications();
    setRefreshing(false);
  }, [refreshNotifications]);

  // Gérer le tap sur une notification
  const handleNotificationPress = useCallback(
    async (notification: PushNotification) => {
      // Marquer comme lu
      if (!notification.is_read) {
        await markAsRead(notification.id);
      }

      // Navigation basée sur les données
      const data = notification.data;

      if (data?.screen) {
        switch (data.screen) {
          case 'order_tracking':
          case 'order_detail':
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
        }
      } else if (data?.order_id) {
        router.push(`/order/${data.order_id}`);
      }
    },
    [markAsRead, router]
  );

  // Marquer tout comme lu
  const handleMarkAllRead = useCallback(() => {
    if (unreadCount === 0) return;

    Alert.alert(
      'Tout marquer comme lu',
      `Marquer ${unreadCount} notification${unreadCount > 1 ? 's' : ''} comme lue${unreadCount > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: markAllAsRead,
        },
      ]
    );
  }, [unreadCount, markAllAsRead]);

  // Supprimer une notification
  const handleDelete = useCallback(
    async (notificationId: string) => {
      await deleteNotification(notificationId);
    },
    [deleteNotification]
  );

  // Grouper les notifications par date
  const groupedNotifications = useMemo(() => {
    const groups: { title: string; data: PushNotification[] }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let currentGroup: PushNotification[] = [];
    let currentTitle = '';

    notifications.forEach((notification) => {
      const date = new Date(notification.created_at);
      let title = '';

      if (date.toDateString() === today.toDateString()) {
        title = "Aujourd'hui";
      } else if (date.toDateString() === yesterday.toDateString()) {
        title = 'Hier';
      } else {
        title = date.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
      }

      if (title !== currentTitle) {
        if (currentGroup.length > 0) {
          groups.push({ title: currentTitle, data: currentGroup });
        }
        currentTitle = title;
        currentGroup = [notification];
      } else {
        currentGroup.push(notification);
      }
    });

    if (currentGroup.length > 0) {
      groups.push({ title: currentTitle, data: currentGroup });
    }

    return groups;
  }, [notifications]);

  // Rendu de l'en-tête
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.headerTop}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={handleMarkAllRead}
          >
            <Text style={styles.markAllText}>Tout lire</Text>
          </TouchableOpacity>
        )}
      </View>
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>
            {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );

  // Rendu d'une section
  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  // Rendu d'une notification
  const renderNotification = ({ item }: { item: PushNotification }) => (
    <NotificationItem
      notification={item}
      onPress={handleNotificationPress}
      onMarkRead={markAsRead}
      onDelete={handleDelete}
    />
  );

  // Rendu état vide
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="notifications-off-outline" size={64} color={COLORS.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>Aucune notification</Text>
      <Text style={styles.emptyText}>
        Vous n'avez pas encore reçu de notifications.{'\n'}
        Elles apparaîtront ici.
      </Text>
    </View>
  );

  // Rendu chargement
  if (isLoading && notifications.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotification}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  headerContainer: {
    backgroundColor: COLORS.cardBg,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 16,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  unreadBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Liste
  listContent: {
    paddingVertical: 8,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 76,
  },

  // Section
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Notification Item
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.cardBg,
  },
  notificationUnread: {
    backgroundColor: COLORS.unread,
  },
  unreadDot: {
    position: 'absolute',
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
    marginRight: 8,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
  },
  notificationTitleUnread: {
    fontWeight: '700',
  },
  notificationBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  chevron: {
    marginLeft: 4,
  },

  // États vides et chargement
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${COLORS.textMuted}10`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});