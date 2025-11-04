import { Restaurant } from '@/types/restaurant';
import { SearchFilters, PaginatedResponse } from '@/types/common';
import { apiClient } from './api';
import {
  RestaurantStatistics,
  RestaurantDashboard,
  KPIs,
  DishesPerformance,
  Revenue,
  PeakHour,
  DailyPerformance,
  Recommendation,
  formatCurrency,
  formatDuration,
  calculatePercentage,
} from '@/types/restaurant-statistics';

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

/**
 * Normalise les données restaurant du backend vers le format frontend
 */
const normalizeRestaurantData = (data: any): Restaurant => {
  return {
    ...data,
    id: String(data.id),
    openingHours: data.openingHours || data.opening_hours || [],
    zipCode: data.zipCode || data.zip_code,
    priceRange: data.priceRange || data.price_range,
    reviewCount: data.reviewCount || data.review_count,
    isActive: data.isActive ?? data.is_active ?? true,
    createdAt: data.createdAt || data.created_at,
    updatedAt: data.updatedAt || data.updated_at,
    location: data.location || {
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
    },
    can_receive_orders: data.can_receive_orders ?? false,
  };
};

/**
 * Prépare les données pour le backend (conversion camelCase → snake_case)
 */
const prepareDataForBackend = (data: Partial<Restaurant>): any => {
  const backendData: any = { ...data };

  // Conversions camelCase → snake_case
  if (data.zipCode !== undefined) {
    backendData.zip_code = data.zipCode;
    delete backendData.zipCode;
  }
  if (data.priceRange !== undefined) {
    backendData.price_range = data.priceRange;
    delete backendData.priceRange;
  }
  if (data.isActive !== undefined) {
    backendData.is_active = data.isActive;
    delete backendData.isActive;
  }

  // Gestion des horaires d'ouverture
  if (data.openingHours && Array.isArray(data.openingHours)) {
    backendData.openingHours = data.openingHours.map((day: any) => ({
      dayOfWeek: day.dayOfWeek,
      isClosed: !!day.isClosed,
      periods: (day.periods || []).map((p: any) => ({
        startTime: p.startTime,
        endTime: p.endTime,
        name: p.name || '',
      })),
    }));
  }

  // Gestion location
  if (data.location) {
    backendData.latitude = data.location.latitude;
    backendData.longitude = data.location.longitude;
    delete backendData.location;
  }

  // Supprimer les champs en lecture seule
  const readOnlyFields = [
    'id',
    'ownerId',
    'owner_id',
    'createdAt',
    'updatedAt',
    'created_at',
    'updated_at',
    'can_receive_orders',
    'reviewCount',
    'review_count',
    'rating',
    'accepts_meal_vouchers_display',
    'lastStatusChangedBy',
    'lastStatusChangedAt',
  ];

  readOnlyFields.forEach((field) => delete backendData[field]);

  return backendData;
};

/**
 * Normalise les réponses paginées
 */
const normalizePaginatedResponse = (response: any): PaginatedResponse<Restaurant> => {
  // Cas 1: { data: [...], pagination: {...} }
  if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
    return {
      data: response.data.map(normalizeRestaurantData),
      pagination: response.pagination || {
        page: 1,
        limit: response.data.length,
        total: response.data.length,
        pages: 1,
      },
    };
  }

  // Cas 2: Tableau direct
  if (Array.isArray(response)) {
    return {
      data: response.map(normalizeRestaurantData),
      pagination: {
        page: 1,
        limit: response.length,
        total: response.length,
        pages: 1,
      },
    };
  }

  // Cas 3: { results: [...], count: n } (DRF)
  if (response && typeof response === 'object' && 'results' in response && Array.isArray(response.results)) {
    const total = response.count || response.results.length;
    const limit = response.results.length || response.page_size || total || 0;
    const pages = limit ? Math.ceil(total / limit) : 1;

    return {
      data: response.results.map(normalizeRestaurantData),
      pagination: {
        page: response.page || 1,
        limit,
        total,
        pages,
      },
    };
  }

  // Par défaut
  return {
    data: [],
    pagination: {
      page: 1,
      limit: 0,
      total: 0,
      pages: 0,
    },
  };
};

/**
 * Valide et normalise les statistiques reçues du backend
 */
const validateStatistics = (data: any): RestaurantStatistics => {
  // Validation de la structure de base
  if (!data || typeof data !== 'object') {
    throw new Error('Format de statistiques invalide');
  }

  // Valider les sections obligatoires
  const requiredSections = ['period', 'overview', 'kpis'];
  const missingSections = requiredSections.filter((section) => !data[section]);
  
  if (missingSections.length > 0) {
    console.warn(`⚠️ Sections manquantes dans les statistiques: ${missingSections.join(', ')}`);
  }

  return data as RestaurantStatistics;
};

/**
 * Enrichit les KPIs avec des métadonnées utiles
 */
const enrichKPIs = (kpis: KPIs): KPIs & { 
  insights: string[];
  alerts: { level: 'success' | 'warning' | 'critical'; message: string }[];
} => {
  const insights: string[] = [];
  const alerts: { level: 'success' | 'warning' | 'critical'; message: string }[] = [];

  // Analyse du taux d'annulation
  if (kpis.cancellation_rate > 15) {
    alerts.push({
      level: 'critical',
      message: `Taux d'annulation critique: ${kpis.cancellation_rate}%`,
    });
    insights.push('Identifiez les causes d\'annulation (délais, erreurs, communication)');
  } else if (kpis.cancellation_rate > 10) {
    alerts.push({
      level: 'warning',
      message: `Taux d'annulation élevé: ${kpis.cancellation_rate}%`,
    });
  } else {
    insights.push(`Excellent taux d'annulation: ${kpis.cancellation_rate}%`);
  }

  // Analyse du taux de paiement
  if (kpis.payment_rate < 80) {
    alerts.push({
      level: 'warning',
      message: `Taux de paiement faible: ${kpis.payment_rate}%`,
    });
    insights.push('Vérifiez les problèmes de paiement ou relancez les impayés');
  } else if (kpis.payment_rate > 95) {
    insights.push('Excellent taux de paiement !');
  }

  // Analyse de la disponibilité
  if (kpis.availability_rate < 70) {
    alerts.push({
      level: 'critical',
      message: `Disponibilité critique: ${kpis.availability_rate}%`,
    });
    insights.push('Urgent: Réapprovisionnez vos stocks ou retirez les plats indisponibles');
  } else if (kpis.availability_rate < 85) {
    alerts.push({
      level: 'warning',
      message: `Disponibilité à surveiller: ${kpis.availability_rate}%`,
    });
  }

  // Analyse du ticket moyen
  insights.push(`Ticket moyen: ${formatCurrency(kpis.avg_order_value)}`);

  // Analyse du temps de service
  if (kpis.avg_service_time_minutes !== null) {
    if (kpis.avg_service_time_minutes > 30) {
      alerts.push({
        level: 'warning',
        message: `Temps de service élevé: ${formatDuration(kpis.avg_service_time_minutes)}`,
      });
      insights.push('Optimisez votre processus de préparation');
    } else if (kpis.avg_service_time_minutes < 15) {
      insights.push(`Excellent temps de service: ${formatDuration(kpis.avg_service_time_minutes)}`);
    }
  }

  // Analyse de l'utilisation des tables
  if (kpis.table_usage_rate < 50) {
    insights.push(`Utilisation des tables faible: ${kpis.table_usage_rate}%`);
  } else if (kpis.table_usage_rate > 80) {
    insights.push(`Excellente utilisation des tables: ${kpis.table_usage_rate}%`);
  }

  return { ...kpis, insights, alerts };
};

/**
 * Génère un résumé textuel des performances
 */
const generatePerformanceSummary = (stats: RestaurantStatistics): {
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  summary: string;
  highlights: string[];
  concerns: string[];
} => {
  const highlights: string[] = [];
  const concerns: string[] = [];
  let score = 0;

  // Évaluation du CA
  if (stats.revenue.evolution_percent > 10) {
    highlights.push(`CA en hausse de ${stats.revenue.evolution_percent}%`);
    score += 2;
  } else if (stats.revenue.evolution_percent < -10) {
    concerns.push(`CA en baisse de ${Math.abs(stats.revenue.evolution_percent)}%`);
    score -= 2;
  }

  // Évaluation des KPIs
  if (stats.kpis.cancellation_rate < 5) {
    highlights.push('Taux d\'annulation excellent');
    score += 1;
  } else if (stats.kpis.cancellation_rate > 15) {
    concerns.push('Taux d\'annulation préoccupant');
    score -= 2;
  }

  if (stats.kpis.payment_rate > 95) {
    highlights.push('Excellent taux de paiement');
    score += 1;
  }

  if (stats.kpis.availability_rate < 80) {
    concerns.push('Disponibilité des plats insuffisante');
    score -= 1;
  }

  // Évaluation des plats
  if (stats.dishes_performance.never_ordered_count > 5) {
    concerns.push(`${stats.dishes_performance.never_ordered_count} plats jamais commandés`);
    score -= 1;
  }

  // Évaluation des recommandations urgentes
  const urgentRecommendations = stats.recommendations.filter((r) => r.priority === 'high');
  if (urgentRecommendations.length > 0) {
    concerns.push(`${urgentRecommendations.length} action(s) urgente(s) à réaliser`);
  }

  // Détermination du niveau global
  let overall: 'excellent' | 'good' | 'fair' | 'poor';
  let summary: string;

  if (score >= 3) {
    overall = 'excellent';
    summary = 'Excellentes performances ! Votre restaurant est sur la bonne voie.';
  } else if (score >= 1) {
    overall = 'good';
    summary = 'Bonnes performances globales avec quelques points d\'amélioration.';
  } else if (score >= -1) {
    overall = 'fair';
    summary = 'Performances correctes mais plusieurs aspects nécessitent votre attention.';
  } else {
    overall = 'poor';
    summary = 'Plusieurs indicateurs sont préoccupants. Priorisez les actions recommandées.';
  }

  return { overall, summary, highlights, concerns };
};

// ============================================================================
// SERVICE PRINCIPAL
// ============================================================================

export class RestaurantService {
  // ==========================================================================
  // MÉTHODES PUBLIQUES (pour clients/navigation)
  // ==========================================================================

  /**
   * Récupère la liste publique des restaurants (pour clients)
   */
  async getPublicRestaurants(params?: {
    page?: number;
    limit?: number;
    query?: string;
    filters?: SearchFilters;
    cuisine?: string;
    city?: string;
    accepts_meal_vouchers?: boolean;
  }): Promise<PaginatedResponse<Restaurant>> {
    const queryParams = {
      page: params?.page,
      limit: params?.limit,
      search: params?.query || params?.filters?.query,
      cuisine: params?.cuisine,
      city: params?.city,
      accepts_meal_vouchers: params?.accepts_meal_vouchers,
      ...params?.filters,
    };

    const response = await apiClient.get('api/v1/restaurants/public/', { params: queryParams });
    return normalizePaginatedResponse(response);
  }

  /**
   * Détails publics d'un restaurant (pour clients)
   */
  async getPublicRestaurant(id: string): Promise<Restaurant> {
    const response = await apiClient.get(`api/v1/restaurants/public/${id}/`);
    return normalizeRestaurantData(response);
  }

  /**
   * Recherche publique de restaurants
   */
  async searchPublicRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    const response = await apiClient.get('api/v1/restaurants/', {
      params: { search: query, ...filters },
    });

    if (Array.isArray(response)) {
      return response.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'data' in response && Array.isArray(response.data)) {
      return response.data.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'results' in response && Array.isArray(response.results)) {
      return response.results.map(normalizeRestaurantData);
    }

    return [];
  }

  /**
   * Types de cuisine disponibles (public)
   */
  async getAvailableCuisines(): Promise<{ value: string; label: string }[]> {
    return apiClient.get('api/v1/restaurants/public/cuisines/');
  }

  /**
   * Villes avec restaurants (public)
   */
  async getAvailableCities(): Promise<string[]> {
    return apiClient.get('api/v1/restaurants/public/cities/');
  }

  // ==========================================================================
  // MÉTHODES PRIVÉES (back-office restaurateur)
  // ==========================================================================

  /**
   * Liste des restaurants du restaurateur (privé)
   */
  async getRestaurants(params?: { 
    search?: string; 
    page?: number; 
    page_size?: number;
  }): Promise<PaginatedResponse<Restaurant>> {
    const response = await apiClient.get('api/v1/restaurants/', { params });
    return normalizePaginatedResponse(response);
  }

  /**
   * Détails restaurant — ESSAIE le privé puis bascule en public si 401/403
   */
  async getRestaurant(id: string): Promise<Restaurant> {
    try {
      const response = await apiClient.get(`api/v1/restaurants/${id}/`);
      return normalizeRestaurantData(response);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        return this.getPublicRestaurant(id);
      }
      throw err;
    }
  }

  /**
   * Crée un nouveau restaurant (privé - restaurateurs seulement)
   */
  async createRestaurant(data: any): Promise<Restaurant> {
    console.log('🚀 RestaurantService: Creating restaurant...');
    console.log('📥 Données reçues:', JSON.stringify(data, null, 2));

    // Validation basique côté client
    const requiredFields = ['name', 'address', 'city', 'zip_code', 'phone', 'email', 'cuisine'];
    const missingFields = requiredFields.filter((field) => !data[field] || String(data[field]).trim() === '');
    
    if (missingFields.length > 0) {
      console.error('❌ Champs requis manquants:', missingFields);
      throw new Error(`Champs requis manquants: ${missingFields.join(', ')}`);
    }

    // Préparer les données finales
    const finalData = {
      ...data,
      price_range: parseInt(data.price_range) || 2,
      latitude: parseFloat(data.latitude) || 0,
      longitude: parseFloat(data.longitude) || 0,
      rating: parseFloat(data.rating) || 0,
      review_count: parseInt(data.review_count) || 0,
      is_active: Boolean(data.is_active),
      accepts_meal_vouchers: Boolean(data.accepts_meal_vouchers),
      description: data.description || '',
      website: data.website || '',
      country: data.country || 'France',
      meal_voucher_info: data.meal_voucher_info || '',
      image: data.image || null,
      opening_hours: Array.isArray(data.opening_hours)
        ? data.opening_hours.map((hour: any) => ({
            day_of_week: parseInt(hour.day_of_week) || parseInt(hour.dayOfWeek) || 0,
            open_time: hour.open_time || hour.openTime || '09:00',
            close_time: hour.close_time || hour.closeTime || '18:00',
            is_closed: Boolean(hour.is_closed ?? hour.isClosed ?? false),
          }))
        : [],
    };

    console.log('📤 Données envoyées à l\'API:', JSON.stringify(finalData, null, 2));

    try {
      const response = await apiClient.post('api/v1/restaurants/', finalData);
      console.log('✅ Restaurant créé avec succès');
      return normalizeRestaurantData(response);
    } catch (error: any) {
      console.error('❌ Échec de la création');
      console.error('🔍 Détails:', {
        status: error?.response?.status,
        data: error?.response?.data,
      });

      if (error?.response?.data?.validation_errors) {
        error.validation_errors = error.response.data.validation_errors;
      }
      throw error;
    }
  }

  /**
   * Mise à jour d'un restaurant (privé)
   */
  async updateRestaurant(id: string, data: Partial<Restaurant>): Promise<Restaurant> {
    const payload = prepareDataForBackend(data);
    console.log('🔄 Mise à jour du restaurant', id);

    const response = await apiClient.patch(`api/v1/restaurants/${id}/`, payload);
    console.log('✅ Restaurant mis à jour');

    return normalizeRestaurantData(response);
  }

  /**
   * Suppression d'un restaurant (privé)
   */
  async deleteRestaurant(id: string): Promise<void> {
    await apiClient.delete(`api/v1/restaurants/${id}/`);
    console.log('✅ Restaurant supprimé');
  }

  /**
   * Recherche (privé)
   */
  async searchRestaurants(query: string, filters?: SearchFilters): Promise<Restaurant[]> {
    const response = await apiClient.get('api/v1/restaurants/', {
      params: { search: query, ...filters },
    });

    if (Array.isArray(response)) {
      return response.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'data' in response) {
      return response.data.map(normalizeRestaurantData);
    } else if (response && typeof response === 'object' && 'results' in response) {
      return response.results.map(normalizeRestaurantData);
    }

    return [];
  }

  // ==========================================================================
  // STATISTIQUES & ANALYTICS (OPTIMISÉ avec utilisation des types)
  // ==========================================================================

  /**
   * Récupère les statistiques complètes d'un restaurant avec validation
   * 
   * @param restaurantId - ID du restaurant
   * @param periodDays - Nombre de jours à analyser (défaut: 30)
   * @returns Statistiques complètes validées
   */
  async getRestaurantStatistics(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<RestaurantStatistics> {
    try {
      console.log(`📊 Chargement des statistiques (${periodDays} jours)`);

      const response = await apiClient.get(`api/v1/restaurants/${restaurantId}/statistics/`, {
        params: { period_days: periodDays },
      });

      // Validation et normalisation des données
      const stats = validateStatistics(response);
      
      console.log('✅ Statistiques chargées:', {
        periode: `${stats.period.days} jours`,
        commandes: stats.overview.orders.total,
        ca: formatCurrency(stats.revenue.current_period),
        recommandations: stats.recommendations.length,
      });

      return stats;
    } catch (error: any) {
      console.error('❌ Erreur de chargement des statistiques');
      throw error;
    }
  }

  /**
   * Récupère le dashboard complet d'un restaurant
   */
  async getRestaurantDashboard(restaurantId: string): Promise<RestaurantDashboard> {
    try {
      console.log('📈 Chargement du dashboard');

      const response = await apiClient.get(`api/v1/restaurants/${restaurantId}/dashboard/`);
      
      console.log('✅ Dashboard chargé:', {
        commandesRecentes: response.recent_orders?.length || 0,
        itemsPopulaires: response.popular_items?.length || 0,
        caAujourdhui: formatCurrency(response.revenue?.today || 0),
      });

      return response as RestaurantDashboard;
    } catch (error: any) {
      console.error('❌ Erreur de chargement du dashboard');
      throw error;
    }
  }

  /**
   * Récupère les KPIs avec enrichissement et insights
   */
  async getRestaurantKPIsEnriched(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<ReturnType<typeof enrichKPIs>> {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    return enrichKPIs(stats.kpis);
  }

  /**
   * Récupère un résumé de performance global
   */
  async getPerformanceSummary(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<ReturnType<typeof generatePerformanceSummary>> {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    return generatePerformanceSummary(stats);
  }

  /**
   * Récupère uniquement les recommandations triées par priorité
   */
  async getRecommendations(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<{ urgent: Recommendation[]; important: Recommendation[]; info: Recommendation[] }> {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    
    return {
      urgent: stats.recommendations.filter((r) => r.priority === 'high'),
      important: stats.recommendations.filter((r) => r.priority === 'medium'),
      info: stats.recommendations.filter((r) => r.priority === 'low'),
    };
  }

  /**
   * Récupère la performance des plats avec statistiques enrichies
   */
  async getDishesPerformance(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<
    DishesPerformance & {
      topDishRevenue: number;
      avgDishRevenue: number;
      performanceRate: number;
    }
  > {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    const dishes = stats.dishes_performance;

    // Calculs enrichis
    const topDishRevenue = dishes.top_dishes.reduce((sum, dish) => sum + dish.revenue, 0);
    const avgDishRevenue = dishes.top_dishes.length > 0 
      ? topDishRevenue / dishes.top_dishes.length 
      : 0;
    const totalDishes = stats.overview.menu_items.total || 1;
    const performanceRate = calculatePercentage(
      totalDishes - dishes.never_ordered_count,
      totalDishes
    );

    return {
      ...dishes,
      topDishRevenue,
      avgDishRevenue,
      performanceRate,
    };
  }

  /**
   * Analyse comparative des revenus avec insights
   */
  async getRevenueAnalysis(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<
    Revenue & {
      evolutionStatus: 'growth' | 'stable' | 'decline';
      insights: string[];
      projectedRevenue?: number;
    }
  > {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    const revenue = stats.revenue;

    // Déterminer le statut d'évolution
    let evolutionStatus: 'growth' | 'stable' | 'decline';
    if (revenue.evolution_percent > 5) {
      evolutionStatus = 'growth';
    } else if (revenue.evolution_percent < -5) {
      evolutionStatus = 'decline';
    } else {
      evolutionStatus = 'stable';
    }

    // Générer des insights
    const insights: string[] = [];
    
    if (evolutionStatus === 'growth') {
      insights.push(`Croissance de ${revenue.evolution_percent}% - Excellente tendance !`);
      insights.push(`CA actuel: ${formatCurrency(revenue.current_period)}`);
    } else if (evolutionStatus === 'decline') {
      insights.push(`Baisse de ${Math.abs(revenue.evolution_percent)}% - Action requise`);
      insights.push('Analysez les causes et lancez des promotions');
    } else {
      insights.push('Revenus stables - Cherchez des opportunités de croissance');
    }

    insights.push(`Ticket moyen: ${formatCurrency(revenue.avg_order_value)}`);
    insights.push(`${revenue.total_orders} commandes sur la période`);

    // Projection simple (si croissance)
    let projectedRevenue: number | undefined;
    if (evolutionStatus === 'growth' && revenue.evolution_percent > 0) {
      projectedRevenue = revenue.current_period * (1 + revenue.evolution_percent / 100);
    }

    return {
      ...revenue,
      evolutionStatus,
      insights,
      projectedRevenue,
    };
  }

  /**
   * Récupère les heures de pointe avec insights
   */
  async getPeakHoursAnalysis(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<{
    peakHours: PeakHour[];
    insights: string[];
    staffingRecommendations: string[];
  }> {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    const insights: string[] = [];
    const staffingRecommendations: string[] = [];

    if (stats.peak_hours.length > 0) {
      const topPeak = stats.peak_hours[0];
      insights.push(`Heure de pointe principale: ${topPeak.hour} (${topPeak.orders_count} commandes)`);
      
      // Recommandations de staffing
      stats.peak_hours.forEach((peak, index) => {
        if (peak.orders_count > 10) {
          staffingRecommendations.push(
            `Renforcez l'équipe à ${peak.hour} (${peak.orders_count} commandes attendues)`
          );
        }
      });
    }

    return {
      peakHours: stats.peak_hours,
      insights,
      staffingRecommendations,
    };
  }

  /**
   * Récupère la performance quotidienne avec comparaisons
   */
  async getDailyPerformanceAnalysis(
    restaurantId: string,
    periodDays: number = 30
  ): Promise<
    DailyPerformance & {
      insights: string[];
      recommendations: string[];
    }
  > {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    const daily = stats.daily_performance;
    const insights: string[] = [];
    const recommendations: string[] = [];

    if (daily.best_day && daily.worst_day) {
      insights.push(
        `Meilleur jour: ${daily.best_day.day} (${daily.best_day.orders_count} commandes)`
      );
      insights.push(
        `Jour le plus faible: ${daily.worst_day.day} (${daily.worst_day.orders_count} commandes)`
      );

      // Calcul de l'écart
      const gap = daily.best_day.orders_count - daily.worst_day.orders_count;
      const gapPercent = calculatePercentage(gap, daily.best_day.orders_count);

      if (gapPercent > 50) {
        recommendations.push(
          `Écart important entre le meilleur et le pire jour (${gapPercent}%). ` +
          `Proposez des promotions le ${daily.worst_day.day}.`
        );
      }
    }

    return {
      ...daily,
      insights,
      recommendations,
    };
  }

  /**
   * Export complet des statistiques (pour rapports/exports)
   */
  async exportStatistics(
    restaurantId: string,
    periodDays: number = 30,
    format: 'json' | 'summary' = 'summary'
  ): Promise<any> {
    const stats = await this.getRestaurantStatistics(restaurantId, periodDays);
    
    if (format === 'json') {
      return stats;
    }

    // Format résumé enrichi
    const performance = generatePerformanceSummary(stats);
    const enrichedKPIs = enrichKPIs(stats.kpis);

    return {
      restaurant: stats.overview.restaurant.name,
      periode: `${stats.period.days} jours`,
      dateDebut: stats.period.start_date,
      dateFin: stats.period.end_date,
      
      performance: {
        niveau: performance.overall,
        resume: performance.summary,
        pointsForts: performance.highlights,
        pointsFaibles: performance.concerns,
      },

      kpis: {
        tauxAnnulation: `${stats.kpis.cancellation_rate}%`,
        tauxPaiement: `${stats.kpis.payment_rate}%`,
        disponibilite: `${stats.kpis.availability_rate}%`,
        ticketMoyen: formatCurrency(stats.kpis.avg_order_value),
        tempsService: formatDuration(stats.kpis.avg_service_time_minutes),
        utilisationTables: `${stats.kpis.table_usage_rate}%`,
        insights: enrichedKPIs.insights,
        alertes: enrichedKPIs.alerts,
      },

      revenus: {
        actuel: formatCurrency(stats.revenue.current_period),
        precedent: formatCurrency(stats.revenue.previous_period),
        evolution: `${stats.revenue.evolution_percent > 0 ? '+' : ''}${stats.revenue.evolution_percent}%`,
        nombreCommandes: stats.revenue.total_orders,
      },

      topPlats: stats.dishes_performance.top_dishes.slice(0, 5).map((dish) => ({
        nom: dish.name,
        commandes: dish.total_orders,
        ca: formatCurrency(dish.revenue),
      })),

      recommandations: {
        urgentes: stats.recommendations.filter((r) => r.priority === 'high').length,
        importantes: stats.recommendations.filter((r) => r.priority === 'medium').length,
        info: stats.recommendations.filter((r) => r.priority === 'low').length,
        liste: stats.recommendations.map((r) => ({
          priorite: r.priority,
          categorie: r.category,
          titre: r.title,
          message: r.message,
        })),
      },
    };
  }
}

export const restaurantService = new RestaurantService();

// Export des fonctions utilitaires pour utilisation externe
export { formatCurrency, formatDuration, calculatePercentage, enrichKPIs, generatePerformanceSummary };