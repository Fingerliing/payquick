import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------- Types
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // Expo: 1 = Sunday … 7 = Saturday

export interface NotificationSystemConfig {
  enableDailySummary?: boolean;
  dailyHour?: number;   // 0-23
  dailyMinute?: number; // 0-59
}

export interface BaseNotificationContent {
  title: string;
  body?: string;
  data?: Record<string, any>;
}

// ---------- Constantes (clés de persistance)
const STORAGE_KEYS = {
  DAILY_SUMMARY_ID: 'notif:daily_summary_id',
};

// ---------- Configuration de base d'affichage (foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export class NotificationSystem {
  private responseListener?: Notifications.Subscription;
  private receivedListener?: Notifications.Subscription;
  private config: NotificationSystemConfig = {
    enableDailySummary: false,
    dailyHour: 18,
    dailyMinute: 0,
  };

  // --------- Cycle de vie
  async init(config?: NotificationSystemConfig) {
    if (config) this.config = { ...this.config, ...config };

    const granted = await this.requestPermissions();
    if (!granted) {
      console.warn('Notifications non autorisées par l’utilisateur.');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications par défaut',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: undefined,
        vibrationPattern: [200, 100, 200],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    // Listeners utiles (optionnels)
    this.receivedListener = Notifications.addNotificationReceivedListener((_n) => {
      // console.log('Notification reçue au foreground:', _n);
    });

    this.responseListener = Notifications.addNotificationResponseReceivedListener((resp) => {
      // console.log('Réponse à la notification:', resp);
    });

    // (Re)programmer le récap quotidien si nécessaire
    if (this.config.enableDailySummary) {
      await this.ensureDailySummaryScheduled();
    } else {
      await this.cancelStored(STORAGE_KEYS.DAILY_SUMMARY_ID);
    }
  }

  async destroy() {
    this.receivedListener?.remove();
    this.responseListener?.remove();
  }

  // --------- Permissions
  async requestPermissions(): Promise<boolean> {
    try {
      if (!Device.isDevice) {
        console.warn('Les notifications ne fonctionnent pas sur un simulateur iOS.');
      }

      const settings = await Notifications.getPermissionsAsync();
      if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
        return true;
      }

      const req = await Notifications.requestPermissionsAsync();
      return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL || false;
    } catch (e) {
      console.error('Erreur de permission notifications:', e);
      return false;
    }
  }

  // --------- Helpers génériques
  async cancel(id: string) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (e) {
      console.error('Échec annulation notification:', id, e);
    }
  }

  async cancelAll() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    } catch (e) {
      console.error('Échec annulation de toutes les notifications:', e);
    }
  }

  private async storeId(key: string, id: string) {
    try { await AsyncStorage.setItem(key, id); } catch {}
  }
  private async readId(key: string) {
    try { return await AsyncStorage.getItem(key); } catch { return null; }
  }
  private async cancelStored(key: string) {
    const existing = await this.readId(key);
    if (existing) {
      await this.cancel(existing);
      await AsyncStorage.removeItem(key);
    }
  }

  // --------- Programmation simple
  async sendNow(content: BaseNotificationContent): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content,
      trigger: null, // immédiate
    });
  }

  async sendIn(seconds: number, content: BaseNotificationContent): Promise<string> {
    if (seconds < 1) seconds = 1;
    return Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false }, // ⏱️ délai (timeInterval)
    });
  }

  async sendDaily(hour: number, minute: number, content: BaseNotificationContent): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute }, // 📅 quotidien (calendar)
    });
  }

  async sendWeekly(weekday: Weekday, hour: number, minute: number, content: BaseNotificationContent): Promise<string> {
    return Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute }, // 📆 hebdomadaire (calendar)
    });
  }

  // --------- Cas d’usage : récap quotidien
  private async ensureDailySummaryScheduled() {
    // Recréer proprement (annuler l’ancien si existe)
    await this.cancelStored(STORAGE_KEYS.DAILY_SUMMARY_ID);

    const id = await this.sendDaily(
      this.config.dailyHour ?? 18,
      this.config.dailyMinute ?? 0,
      {
        title: '📊 Résumé quotidien',
        body: "Vos statistiques du jour sont prêtes.",
        data: { type: 'daily_summary' },
      }
    );

    await this.storeId(STORAGE_KEYS.DAILY_SUMMARY_ID, id);
  }

  async enableDailySummary(hour = 18, minute = 0) {
    this.config.enableDailySummary = true;
    this.config.dailyHour = hour;
    this.config.dailyMinute = minute;
    await this.ensureDailySummaryScheduled();
  }

  async disableDailySummary() {
    this.config.enableDailySummary = false;
    await this.cancelStored(STORAGE_KEYS.DAILY_SUMMARY_ID);
  }
}

export const notificationSystem = new NotificationSystem();
