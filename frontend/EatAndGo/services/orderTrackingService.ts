import { apiClient } from "./api";

export interface CategoryProgress {
  category: string;
  category_icon: string;
  items_count: number;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    preparation_time: number;
  }>;
  estimated_time_minutes: number;
  progress_percentage: number;
  time_elapsed_minutes: number;
  time_remaining_minutes: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  status_label: string;
  achievement_unlocked: boolean;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface GamificationData {
  level: number;
  points: number;
  badges: Badge[];
  message: string;
  emoji: string;
  next_milestone: {
    progress: number;
    label: string;
    remaining: number;
  } | null;
}

export interface OrderTrackingResponse {
  order_id: number;
  order_status: string;
  table_number: string;
  created_at: string;
  global_progress: number;
  categories: CategoryProgress[];
  gamification: GamificationData;
  estimated_total_time: number;
}

class OrderTrackingService {
  /** GET /api/v1/orders/:id/progress/ — suivi gamifié */
  async getOrderProgress(orderId: number): Promise<OrderTrackingResponse> {
    const response = await apiClient.get(`/api/v1/orders/${orderId}/progress/`);
    return response;
  }

  /**
   * Abonnement temps réel au suivi de commande (polling)
   * Retourne une fonction pour arrêter le polling
   */
  subscribeToOrderProgress(
    orderId: number,
    callback: (data: OrderTrackingResponse) => void,
    intervalMs: number = 30000
  ): () => void {
    // Récupération immédiate
    this.getOrderProgress(orderId).then(callback).catch(console.error);

    // Polling régulier
    const interval = setInterval(async () => {
      try {
        const data = await this.getOrderProgress(orderId);
        callback(data);
      } catch (error) {
        console.error("Erreur lors du polling:", error);
      }
    }, intervalMs);

    // Fonction de désabonnement
    return () => clearInterval(interval);
  }

  /**
   * Calcule si un nouveau badge a été débloqué
   */
  hasNewBadges(previousBadges: Badge[], currentBadges: Badge[]): Badge[] {
    const previousIds = new Set(previousBadges.map((b) => b.id));
    return currentBadges.filter((badge) => !previousIds.has(badge.id));
  }

  /**
   * Formatte le temps restant de manière lisible
   */
  formatRemainingTime(minutes: number): string {
    if (minutes < 1) {
      return "Quelques secondes";
    } else if (minutes < 2) {
      return "1 minute";
    } else if (minutes < 60) {
      return `${Math.round(minutes)} minutes`;
    } else {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }
  }

  /**
   * Détermine si la commande est complète
   */
  isOrderComplete(data: OrderTrackingResponse): boolean {
    return data.order_status === "served" || data.global_progress >= 100;
  }

  /**
   * Obtient la catégorie la plus en retard
   */
  getSlowestCategory(data: OrderTrackingResponse): CategoryProgress | null {
    const activeCategories = data.categories.filter(
      (cat) => cat.status !== "completed"
    );

    if (activeCategories.length === 0) return null;

    return activeCategories.reduce((slowest, current) =>
      current.progress_percentage < slowest.progress_percentage
        ? current
        : slowest
    );
  }

  /**
   * Obtient des statistiques sur la commande
   */
  getOrderStats(data: OrderTrackingResponse) {
    const totalItems = data.categories.reduce(
      (sum, cat) => sum + cat.items_count,
      0
    );

    const completedCategories = data.categories.filter(
      (cat) => cat.achievement_unlocked
    ).length;

    const averageProgress =
      data.categories.reduce((sum, cat) => sum + cat.progress_percentage, 0) /
      data.categories.length;

    return {
      totalItems,
      totalCategories: data.categories.length,
      completedCategories,
      averageProgress: Math.round(averageProgress),
      estimatedTotalTime: data.estimated_total_time,
      currentLevel: data.gamification.level,
      totalPoints: data.gamification.points,
      badgesUnlocked: data.gamification.badges.length,
    };
  }
}

export const orderTrackingService = new OrderTrackingService();