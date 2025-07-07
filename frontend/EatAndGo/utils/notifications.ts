import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { StorageUtils } from './storage';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class NotificationService {
  static async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return false;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('orders', {
          name: 'Commandes',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#3B82F6',
        });

        await Notifications.setNotificationChannelAsync('promotions', {
          name: 'Promotions',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  static async getExpoPushToken(): Promise<string | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-expo-project-id', // Remplacez par votre project ID
      });

      await StorageUtils.setItem('expoPushToken', token.data);
      return token.data;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  static async scheduleOrderNotification(orderId: string, restaurantName: string, estimatedTime: string) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Commande confirmée !',
          body: `Votre commande chez ${restaurantName} sera prête vers ${estimatedTime}`,
          data: { orderId, type: 'order_confirmed' },
          sound: true,
        },
        trigger: null, // Immédiat
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  static async scheduleOrderReadyNotification(orderId: string, restaurantName: string) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Commande prête !',
          body: `Votre commande chez ${restaurantName} est prête pour la livraison`,
          data: { orderId, type: 'order_ready' },
          sound: true,
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  }

  static async schedulePromotionNotification(title: string, body: string, restaurantId?: string) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { restaurantId, type: 'promotion' },
          sound: false,
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Error scheduling promotion notification:', error);
    }
  }

  static async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error canceling notifications:', error);
    }
  }

  static async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  static async setBadgeCount(count: number) {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }
}