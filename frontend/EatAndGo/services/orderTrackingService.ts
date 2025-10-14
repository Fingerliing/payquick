import { apiClient } from "./api";

// Interfaces avec système premium
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
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'royal' | 'special';
}

export interface ProgressTier {
  name: string;
  color: string;
}

export interface PerformanceMetrics {
  time_efficiency: number | null;
  completion_rate: number;
  experience_quality: number;
}

export interface NextMilestone {
  progress: number;
  title: string;
  label: string;
  tier: string;
  remaining: number;
}

export interface GamificationData {
  level: number;
  level_title: string;
  points: number;
  badges: Badge[];
  message: string;
  emoji: string;
  progress_tier: ProgressTier;
  performance_metrics: PerformanceMetrics;
  next_milestone: NextMilestone | null;
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
  /** GET /api/v1/orders/:id/progress/ — suivi gamifié premium */
  async getOrderProgress(orderId: number): Promise<OrderTrackingResponse> {
    const response = await apiClient.get(`/api/v1/orders/${orderId}/progress/`);
    return response;
  }

  /**
   * Abonnement temps réel au suivi de commande (polling intelligent)
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
   * Formate le temps restant de manière lisible et élégante
   */
  formatRemainingTime(minutes: number): string {
    if (minutes < 1) {
      return "Quelques instants";
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
   * Obtient des statistiques détaillées sur la commande
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
      levelTitle: data.gamification.level_title,
      totalPoints: data.gamification.points,
      badgesUnlocked: data.gamification.badges.length,
      progressTier: data.gamification.progress_tier.name,
      experienceQuality: data.gamification.performance_metrics.experience_quality,
      timeEfficiency: data.gamification.performance_metrics.time_efficiency,
    };
  }

  /**
   * Obtient le badge de plus haut tier
   */
  getHighestTierBadge(badges: Badge[]): Badge | null {
    if (badges.length === 0) return null;

    const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'royal', 'special'];
    
    return badges.reduce((highest, current) => {
      const highestIndex = tierOrder.indexOf(highest.tier);
      const currentIndex = tierOrder.indexOf(current.tier);
      return currentIndex > highestIndex ? current : highest;
    });
  }

  /**
   * Obtient des badges par catégorie de tier
   */
  getBadgesByTier(badges: Badge[]): Record<string, Badge[]> {
    return badges.reduce((acc, badge) => {
      if (!acc[badge.tier]) acc[badge.tier] = [];
      acc[badge.tier].push(badge);
      return acc;
    }, {} as Record<string, Badge[]>);
  }

  /**
   * Calcule le score global d'expérience (0-100)
   */
  calculateOverallScore(data: OrderTrackingResponse): number {
    const { performance_metrics } = data.gamification;
    
    // Pondération des facteurs
    const qualityWeight = 0.4;
    const completionWeight = 0.4;
    const efficiencyWeight = 0.2;

    let score = 
      (performance_metrics.experience_quality * qualityWeight) +
      (performance_metrics.completion_rate * completionWeight);

    if (performance_metrics.time_efficiency !== null) {
      score += (performance_metrics.time_efficiency * efficiencyWeight);
    } else {
      // Si pas encore servi, redistribuer le poids
      score = 
        (performance_metrics.experience_quality * 0.5) +
        (performance_metrics.completion_rate * 0.5);
    }

    return Math.round(score);
  }

  /**
   * Génère un message motivationnel personnalisé
   */
  getMotivationalMessage(data: OrderTrackingResponse): string {
    const { global_progress, gamification } = data;
    const tier = gamification.progress_tier.name;

    if (global_progress >= 100) {
      return `${gamification.emoji} Expérience ${tier} accomplie avec excellence !`;
    } else if (global_progress >= 85) {
      return `${gamification.emoji} Excellence imminente - Tier ${tier} en vue !`;
    } else if (global_progress >= 60) {
      return `${gamification.emoji} Progression remarquable vers le tier ${tier} !`;
    } else if (global_progress >= 35) {
      return `${gamification.emoji} Évolution constante dans votre parcours ${tier}`;
    } else {
      return `${gamification.emoji} ${gamification.message}`;
    }
  }

  /**
   * Formate les points avec séparateurs de milliers
   */
  formatPoints(points: number): string {
    return points.toLocaleString('fr-FR');
  }

  /**
   * Obtient la couleur du tier de progression
   */
  getTierColor(tierName: string): string {
    const colors: Record<string, string> = {
      'Bronze': '#CD7F32',
      'Argent': '#C0C0C0',
      'Or': '#FFD700',
      'Platine': '#E5E4E2',
      'Diamant': '#B9F2FF'
    };
    return colors[tierName] || '#CBD5E1';
  }

  /**
   * Génère un résumé textuel de la progression
   */
  getProgressSummary(data: OrderTrackingResponse): string {
    const { global_progress, gamification } = data;
    const stats = this.getOrderStats(data);

    return `
Niveau ${gamification.level_title} (${stats.currentLevel}) • ${this.formatPoints(gamification.points)} points
Tier ${gamification.progress_tier.name} • ${Math.round(global_progress)}% complété
Qualité d'expérience: ${gamification.performance_metrics.experience_quality}/100
${stats.badgesUnlocked} distinction${stats.badgesUnlocked > 1 ? 's' : ''} obtenue${stats.badgesUnlocked > 1 ? 's' : ''}
    `.trim();
  }
}

export const orderTrackingService = new OrderTrackingService();