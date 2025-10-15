import { apiClient } from "./api";

// ========== INTERFACES AMÉLIORÉES ==========

export interface PreparationStage {
  id: string;
  label: string;
  icon: string;
  completed: boolean;
  in_progress: boolean;
  threshold: number;
}

export interface CategoryProgress {
  category: string;
  category_icon: string;
  items_count: number;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    preparation_time: number;
    complexity: number;
  }>;
  estimated_time_minutes: number;
  progress_percentage: number;
  time_elapsed_minutes: number;
  time_remaining_minutes: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  status_label: string;
  achievement_unlocked: boolean;
  preparation_stages: PreparationStage[];
  complexity_score: number;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'royal' | 'special';
  unlocked_at: string;
}

export interface ProgressTier {
  name: string;
  color: string;
}

export interface PerformanceMetrics {
  time_efficiency: number | null;
  completion_rate: number;
  experience_quality: number;
  service_speed_score: number | null;
  preparation_quality: number;
}

export interface NextMilestone {
  progress: number;
  title: string;
  label: string;
  tier: string;
  remaining: number;
}

export interface StreakData {
  current_streak: number;
  next_milestone: number;
  bonus_active: boolean;
}

export interface AchievementsSummary {
  total_badges: number;
  total_points: number;
  badges_by_tier: Record<string, number>;
  rarity_score: number;
}

export interface RealTimeInsight {
  type: string;
  icon: string;
  message: string;
  category?: string;
  minutes?: number;
  step?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface CompletionPrediction {
  completed: boolean;
  estimated_remaining_minutes?: number;
  predicted_completion_time?: string;
  confidence?: number;
  completion_time?: string;
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
  streak_data: StreakData;
  achievements_summary: AchievementsSummary;
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
  real_time_insights: RealTimeInsight[];
  completion_prediction: CompletionPrediction;
}

// ========== TYPES POUR L'HISTORIQUE ==========

interface ProgressSnapshot {
  timestamp: number;
  progress: number;
  status: string;
}

interface ProgressHistory {
  snapshots: ProgressSnapshot[];
  startTime: number;
}

// ========== SERVICE AMÉLIORÉ ==========

class OrderTrackingService {
  private progressHistory: Map<number, ProgressHistory> = new Map();
  private activePolling: Map<number, NodeJS.Timeout> = new Map();

  /** Récupère le suivi gamifié avec toutes les données améliorées */
  async getOrderProgress(orderId: number): Promise<OrderTrackingResponse> {
    const response = await apiClient.get(`/api/v1/orders/${orderId}/progress/`);
    
    // Enregistrer dans l'historique
    this.recordProgressSnapshot(orderId, response.global_progress, response.order_status);
    
    return response;
  }

  /**
   * Abonnement intelligent avec polling adaptatif
   * Réduit la fréquence si pas de changement
   */
  subscribeToOrderProgress(
    orderId: number,
    callback: (data: OrderTrackingResponse) => void,
    options: {
      initialInterval?: number;
      minInterval?: number;
      maxInterval?: number;
      adaptivePolling?: boolean;
    } = {}
  ): () => void {
    const {
      initialInterval = 30000,
      minInterval = 15000,
      maxInterval = 60000,
      adaptivePolling = true,
    } = options;

    let currentInterval = initialInterval;
    let consecutiveNoChanges = 0;
    let lastProgress = -1;

    // Récupération immédiate
    this.getOrderProgress(orderId)
      .then((data) => {
        callback(data);
        lastProgress = data.global_progress;
      })
      .catch(console.error);

    const poll = async () => {
      try {
        const data = await this.getOrderProgress(orderId);
        callback(data);

        // Polling adaptatif
        if (adaptivePolling) {
          if (Math.abs(data.global_progress - lastProgress) < 1) {
            consecutiveNoChanges++;
            // Ralentir le polling si pas de changement
            if (consecutiveNoChanges >= 3) {
              currentInterval = Math.min(currentInterval * 1.5, maxInterval);
            }
          } else {
            // Accélérer si changement détecté
            consecutiveNoChanges = 0;
            currentInterval = minInterval;
          }
        }

        lastProgress = data.global_progress;

        // Arrêter le polling si commande terminée
        if (data.order_status === 'served' || data.global_progress >= 100) {
          this.stopPolling(orderId);
        } else {
          // Replanifier avec le nouvel intervalle
          this.scheduleNextPoll(orderId, poll, currentInterval);
        }
      } catch (error) {
        console.error("Erreur lors du polling:", error);
        // Réessayer avec intervalle augmenté en cas d'erreur
        this.scheduleNextPoll(orderId, poll, currentInterval * 2);
      }
    };

    // Démarrer le polling
    this.scheduleNextPoll(orderId, poll, currentInterval);

    // Fonction de désabonnement
    return () => this.stopPolling(orderId);
  }

  private scheduleNextPoll(orderId: number, pollFn: () => void, interval: number) {
    // Nettoyer l'ancien timeout
    this.stopPolling(orderId);
    
    // Créer un nouveau timeout
    const timeout = setTimeout(pollFn, interval) as any;
    this.activePolling.set(orderId, timeout);
  }

  private stopPolling(orderId: number) {
    const timeout = this.activePolling.get(orderId);
    if (timeout) {
      clearTimeout(timeout);
      this.activePolling.delete(orderId);
    }
  }

  /**
   * Enregistre un snapshot de progression
   */
  private recordProgressSnapshot(orderId: number, progress: number, status: string) {
    let history = this.progressHistory.get(orderId);
    
    if (!history) {
      history = {
        snapshots: [],
        startTime: Date.now(),
      };
      this.progressHistory.set(orderId, history);
    }

    history.snapshots.push({
      timestamp: Date.now(),
      progress,
      status,
    });

    // Garder seulement les 50 derniers snapshots
    if (history.snapshots.length > 50) {
      history.snapshots.shift();
    }
  }

  /**
   * Analyse la vitesse de progression
   */
  getProgressionRate(orderId: number): number | null {
    const history = this.progressHistory.get(orderId);
    if (!history || history.snapshots.length < 2) {
      return null;
    }

    const recent = history.snapshots.slice(-5);
    if (recent.length < 2) return null;

    const first = recent[0];
    const last = recent[recent.length - 1];

    const progressDelta = last.progress - first.progress;
    const timeDelta = (last.timestamp - first.timestamp) / 1000 / 60; // minutes

    if (timeDelta === 0) return null;

    // % de progression par minute
    return progressDelta / timeDelta;
  }

  /**
   * Prédit le temps restant basé sur le taux de progression
   */
  predictRemainingTime(data: OrderTrackingResponse): number | null {
    const rate = this.getProgressionRate(data.order_id);
    
    if (!rate || rate <= 0) {
      // Fallback sur les données du serveur
      if (data.completion_prediction && !data.completion_prediction.completed) {
        return data.completion_prediction.estimated_remaining_minutes || null;
      }
      return null;
    }

    const remainingProgress = 100 - data.global_progress;
    return remainingProgress / rate;
  }

  /**
   * Détecte si la progression a stagné
   */
  isProgressStagnant(orderId: number, thresholdMinutes: number = 5): boolean {
    const history = this.progressHistory.get(orderId);
    if (!history || history.snapshots.length < 2) {
      return false;
    }

    const recent = history.snapshots.slice(-3);
    if (recent.length < 2) return false;

    const progressChange = recent[recent.length - 1].progress - recent[0].progress;
    const timeElapsed = (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000 / 60;

    return timeElapsed > thresholdMinutes && progressChange < 5;
  }

  /**
   * Détecte les nouveaux badges débloqués
   */
  hasNewBadges(previousBadges: Badge[], currentBadges: Badge[]): Badge[] {
    const previousIds = new Set(previousBadges.map((b) => b.id));
    return currentBadges.filter((badge) => !previousIds.has(badge.id));
  }

  /**
   * Analyse les étapes de préparation
   */
  getCurrentPreparationStage(category: CategoryProgress): PreparationStage | null {
    const inProgressStage = category.preparation_stages.find(s => s.in_progress);
    if (inProgressStage) return inProgressStage;

    const lastCompleted = [...category.preparation_stages]
      .reverse()
      .find(s => s.completed);
    
    return lastCompleted || null;
  }

  /**
   * Obtient l'étape suivante à franchir
   */
  getNextPreparationStage(category: CategoryProgress): PreparationStage | null {
    return category.preparation_stages.find(s => !s.completed) || null;
  }

  /**
   * Formate le temps de manière élégante
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
   * Formate le temps de complétion prédit
   */
  formatPredictedCompletionTime(prediction: CompletionPrediction): string {
    if (prediction.completed) {
      return "Commande servie";
    }

    if (prediction.estimated_remaining_minutes !== undefined) {
      return `Prête dans ${this.formatRemainingTime(prediction.estimated_remaining_minutes)}`;
    }

    if (prediction.predicted_completion_time) {
      const time = new Date(prediction.predicted_completion_time);
      return `Prête vers ${time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    return "Calcul en cours...";
  }

  /**
   * Vérifie si la commande est complète
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
   * Obtient la catégorie la plus rapide
   */
  getFastestCategory(data: OrderTrackingResponse): CategoryProgress | null {
    if (data.categories.length === 0) return null;

    return data.categories.reduce((fastest, current) =>
      current.progress_percentage > fastest.progress_percentage
        ? current
        : fastest
    );
  }

  /**
   * Analyse les insights en temps réel
   */
  getHighPriorityInsights(data: OrderTrackingResponse): RealTimeInsight[] {
    return data.real_time_insights.filter(
      (insight) => insight.priority === 'high'
    );
  }

  /**
   * Obtient des statistiques détaillées
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

    const averageComplexity =
      data.categories.reduce((sum, cat) => sum + cat.complexity_score, 0) /
      data.categories.length;

    const totalTimeRemaining = data.categories.reduce(
      (sum, cat) => sum + cat.time_remaining_minutes,
      0
    );

    return {
      totalItems,
      totalCategories: data.categories.length,
      completedCategories,
      averageProgress: Math.round(averageProgress),
      averageComplexity: Math.round(averageComplexity * 10) / 10,
      estimatedTotalTime: data.estimated_total_time,
      totalTimeRemaining: Math.round(totalTimeRemaining),
      currentLevel: data.gamification.level,
      levelTitle: data.gamification.level_title,
      totalPoints: data.gamification.points,
      badgesUnlocked: data.gamification.badges.length,
      progressTier: data.gamification.progress_tier.name,
      experienceQuality: data.gamification.performance_metrics.experience_quality,
      timeEfficiency: data.gamification.performance_metrics.time_efficiency,
      serviceSpeedScore: data.gamification.performance_metrics.service_speed_score,
      preparationQuality: data.gamification.performance_metrics.preparation_quality,
      currentStreak: data.gamification.streak_data.current_streak,
      rarityScore: data.gamification.achievements_summary.rarity_score,
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
   * Obtient les badges récents (dernières 24h)
   */
  getRecentBadges(badges: Badge[], hoursAgo: number = 24): Badge[] {
    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000);
    
    return badges.filter(badge => {
      const unlockedTime = new Date(badge.unlocked_at).getTime();
      return unlockedTime >= cutoffTime;
    });
  }

  /**
   * Groupe les badges par tier
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
    
    const weights = {
      quality: 0.30,
      completion: 0.25,
      efficiency: 0.15,
      speed: 0.15,
      preparation: 0.15,
    };

    let score = 
      (performance_metrics.experience_quality * weights.quality) +
      (performance_metrics.completion_rate * weights.completion) +
      (performance_metrics.preparation_quality * weights.preparation);

    if (performance_metrics.time_efficiency !== null) {
      score += (performance_metrics.time_efficiency * weights.efficiency);
    } else {
      // Redistribuer le poids
      score = (score / (1 - weights.efficiency));
    }

    if (performance_metrics.service_speed_score !== null) {
      score += (performance_metrics.service_speed_score * weights.speed);
    } else {
      // Redistribuer le poids
      score = (score / (1 - weights.speed));
    }

    return Math.round(Math.min(score, 100));
  }

  /**
   * Génère un message motivationnel personnalisé
   */
  getMotivationalMessage(data: OrderTrackingResponse): string {
    const { global_progress, gamification } = data;
    const tier = gamification.progress_tier.name;
    const points = gamification.points;

    if (global_progress >= 100) {
      return `${gamification.emoji} Expérience ${tier} accomplie ! ${points.toLocaleString()} points`;
    } else if (global_progress >= 85) {
      return `${gamification.emoji} Excellence imminente - ${Math.round(100 - global_progress)}% restants`;
    } else if (global_progress >= 60) {
      return `${gamification.emoji} ${Math.round(global_progress)}% - Progression remarquable !`;
    } else if (global_progress >= 35) {
      return `${gamification.emoji} Évolution constante - Tier ${tier}`;
    } else {
      return `${gamification.emoji} ${gamification.message}`;
    }
  }

  /**
   * Formate les points avec séparateurs
   */
  formatPoints(points: number): string {
    return points.toLocaleString('fr-FR');
  }

  /**
   * Obtient la couleur du tier
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
   * Obtient la couleur du badge par tier
   */
  getBadgeTierColor(tier: string): string {
    const colors: Record<string, string> = {
      bronze: '#CD7F32',
      silver: '#C0C0C0',
      gold: '#FFD700',
      platinum: '#E5E4E2',
      royal: '#9333EA',
      special: '#10B981'
    };
    return colors[tier] || '#94A3B8';
  }

  /**
   * Génère un résumé textuel détaillé
   */
  getProgressSummary(data: OrderTrackingResponse): string {
    const { global_progress, gamification } = data;
    const stats = this.getOrderStats(data);
    const prediction = this.formatPredictedCompletionTime(data.completion_prediction);

    return `
📊 SUIVI DÉTAILLÉ

Progression Globale
├─ ${Math.round(global_progress)}% complété
├─ Niveau ${gamification.level_title} (${stats.currentLevel})
└─ Tier ${gamification.progress_tier.name}

Performance
├─ Qualité: ${gamification.performance_metrics.experience_quality}/100
├─ Préparation: ${gamification.performance_metrics.preparation_quality}/100
${gamification.performance_metrics.time_efficiency ? `├─ Efficacité: ${Math.round(gamification.performance_metrics.time_efficiency)}%` : ''}
${gamification.performance_metrics.service_speed_score ? `└─ Vitesse: ${Math.round(gamification.performance_metrics.service_speed_score)}/100` : ''}

Composition
├─ ${stats.totalItems} article${stats.totalItems > 1 ? 's' : ''}
├─ ${stats.completedCategories}/${stats.totalCategories} catégories prêtes
└─ Complexité: ${stats.averageComplexity}/2.0

Accomplissements
├─ ${this.formatPoints(gamification.points)} points
├─ ${stats.badgesUnlocked} distinction${stats.badgesUnlocked > 1 ? 's' : ''}
├─ Score rareté: ${stats.rarityScore}/100
└─ Série: ${stats.currentStreak} commande${stats.currentStreak > 1 ? 's' : ''}

⏱️ ${prediction}
${data.completion_prediction.confidence ? `   Confiance: ${data.completion_prediction.confidence}%` : ''}
    `.trim();
  }

  /**
   * Analyse la santé de la commande
   */
  getOrderHealthStatus(data: OrderTrackingResponse): {
    status: 'excellent' | 'good' | 'warning' | 'critical';
    message: string;
    color: string;
  } {
    const overallScore = this.calculateOverallScore(data);
    const isStagnant = this.isProgressStagnant(data.order_id);
    
    if (isStagnant) {
      return {
        status: 'warning',
        message: 'Progression ralentie',
        color: '#F59E0B'
      };
    }

    if (overallScore >= 85) {
      return {
        status: 'excellent',
        message: 'Expérience exceptionnelle',
        color: '#10B981'
      };
    } else if (overallScore >= 70) {
      return {
        status: 'good',
        message: 'Tout se déroule bien',
        color: '#3B82F6'
      };
    } else if (overallScore >= 50) {
      return {
        status: 'warning',
        message: 'Progression normale',
        color: '#F59E0B'
      };
    } else {
      return {
        status: 'critical',
        message: 'Attention requise',
        color: '#EF4444'
      };
    }
  }

  /**
   * Nettoie l'historique d'une commande
   */
  clearProgressHistory(orderId: number) {
    this.progressHistory.delete(orderId);
    this.stopPolling(orderId);
  }

  /**
   * Nettoie tout l'historique
   */
  clearAllHistory() {
    this.progressHistory.clear();
    this.activePolling.forEach(timeout => clearTimeout(timeout));
    this.activePolling.clear();
  }
}

export const orderTrackingService = new OrderTrackingService();