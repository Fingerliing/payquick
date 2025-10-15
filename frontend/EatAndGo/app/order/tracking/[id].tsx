import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Animated,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

import GamifiedOrderTracking from '@/components/order/GamifiedOrderTracking';
import { 
  orderTrackingService,
  OrderTrackingResponse, 
  Badge 
} from '@/services/orderTrackingService';

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = parseInt(id);

  const [trackingData, setTrackingData] = useState<OrderTrackingResponse | null>(null);
  const [previousBadges, setPreviousBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [progressRate, setProgressRate] = useState<number | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const healthPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!orderId) return;

    setLoading(true);
    setError(null);

    // Animation d'entrée
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      })
    ]).start();

    // S'abonner avec polling adaptatif
    const unsubscribe = orderTrackingService.subscribeToOrderProgress(
      orderId,
      handleTrackingUpdate,
      {
        initialInterval: 30000,
        minInterval: 15000,
        maxInterval: 60000,
        adaptivePolling: true,
      }
    );

    // Timeout de sécurité
    const timeout = setTimeout(() => {
      if (loading && !trackingData) {
        setError("Le chargement prend trop de temps. Vérifiez votre connexion.");
        setLoading(false);
      }
    }, 10000);

    // Nettoyage
    return () => {
      unsubscribe();
      clearTimeout(timeout);
      orderTrackingService.clearProgressHistory(orderId);
    };
  }, [orderId]);

  // Animation de pulsation pour l'indicateur de santé
  useEffect(() => {
    if (trackingData) {
      const health = orderTrackingService.getOrderHealthStatus(trackingData);
      if (health.status === 'warning' || health.status === 'critical') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(healthPulseAnim, {
              toValue: 1.2,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(healthPulseAnim, {
              toValue: 1,
              duration: 800,
              useNativeDriver: true,
            })
          ])
        ).start();
      }
    }
  }, [trackingData]);

  const handleTrackingUpdate = async (data: OrderTrackingResponse) => {
    console.log('📦 Tracking data received');
    
    setLoading(false);
    setError(null);

    // Calculer le taux de progression
    const rate = orderTrackingService.getProgressionRate(data.order_id);
    setProgressRate(rate);

    // Vérifier les nouveaux badges
    if (trackingData) {
      const newBadges = orderTrackingService.hasNewBadges(
        previousBadges,
        data.gamification.badges
      );

      // Notifier et célébrer les nouveaux badges
      for (const badge of newBadges) {
        await celebrateNewBadge(badge);
      }

      // Vérifier si la progression a stagné
      const isStagnant = orderTrackingService.isProgressStagnant(data.order_id, 5);
      if (isStagnant && data.order_status === 'preparing') {
        await sendNotification(
          '⏳ Mise à jour',
          'Votre commande est en cours de préparation minutieuse'
        );
      }
    }

    // Notifier les étapes importantes
    await handleMilestoneNotifications(data);

    setPreviousBadges(data.gamification.badges);
    setTrackingData(data);
  };

  const celebrateNewBadge = async (badge: Badge) => {
    const tierEmoji = {
      bronze: '🥉',
      silver: '🥈',
      gold: '🥇',
      platinum: '💎',
      royal: '👑',
      special: '⭐'
    }[badge.tier] || '🏆';

    // Notification
    await sendNotification(
      `${tierEmoji} Nouvelle distinction débloquée !`,
      `${badge.icon} ${badge.name}: ${badge.description}`
    );

    // Vibration élégante selon le tier
    if (Platform.OS !== 'web') {
      const vibrationPattern = {
        bronze: [0, 100],
        silver: [0, 100, 50, 100],
        gold: [0, 100, 50, 100, 50, 100],
        platinum: [0, 150, 75, 150, 75, 150],
        royal: [0, 200, 100, 200, 100, 200],
        special: [0, 50, 50, 50, 50, 100, 50, 150]
      }[badge.tier] || [0, 100];

      const { Vibration } = require('react-native');
      Vibration.vibrate(vibrationPattern);
    }

    // Haptic feedback
    if (Platform.OS === 'ios') {
      if (badge.tier === 'royal' || badge.tier === 'platinum') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const handleMilestoneNotifications = async (data: OrderTrackingResponse) => {
    const { order_status, global_progress } = data;

    // Commande confirmée
    if (order_status === 'confirmed' && trackingData?.order_status === 'pending') {
      await sendNotification(
        '✅ Commande confirmée',
        'La préparation va commencer'
      );
      vibratePattern('success');
    }

    // Commande en préparation
    if (order_status === 'preparing' && trackingData?.order_status === 'confirmed') {
      await sendNotification(
        '👨‍🍳 Préparation démarrée',
        'Nos chefs travaillent sur votre commande'
      );
      vibratePattern('start');
    }

    // Mi-parcours
    if (global_progress >= 50 && (trackingData?.global_progress || 0) < 50) {
      await sendNotification(
        '⭐ Mi-parcours atteint',
        'Votre commande progresse bien !'
      );
      vibratePattern('milestone');
    }

    // Presque prêt
    if (global_progress >= 85 && (trackingData?.global_progress || 0) < 85) {
      await sendNotification(
        '🎯 Presque prêt',
        'Plus que quelques instants'
      );
      vibratePattern('milestone');
    }

    // Commande prête
    if (order_status === 'ready' && trackingData?.order_status !== 'ready') {
      await sendNotification(
        '✨ Votre commande est prête !',
        'Votre expérience culinaire vous attend 🍽️'
      );
      vibratePattern('complete');
    }

    // Commande servie
    if (order_status === 'served' && trackingData?.order_status !== 'served') {
      await sendNotification(
        '🎉 Bon appétit !',
        `Expérience complétée avec ${data.gamification.points.toLocaleString()} points`
      );
      vibratePattern('complete');
    }
  };

  const vibratePattern = (type: 'success' | 'start' | 'milestone' | 'complete') => {
    if (Platform.OS === 'web') return;

    const patterns = {
      success: [0, 100, 50, 100],
      start: [0, 150],
      milestone: [0, 100, 100, 100],
      complete: [0, 200, 100, 200, 100, 200]
    };

    const { Vibration } = require('react-native');
    Vibration.vibrate(patterns[type]);
  };

  const sendNotification = async (title: string, body: string) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          badge: 1,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    } catch (error) {
      console.error('Erreur notification:', error);
    }
  };

  const handleRefresh = () => {
    console.log('🔄 Actualisation manuelle du suivi');
    setLoading(true);
    setError(null);
    orderTrackingService.getOrderProgress(orderId)
      .then(handleTrackingUpdate)
      .catch((err) => {
        setError("Impossible de charger les données");
        setLoading(false);
        console.error('Refresh error:', err);
      });
  };

  const showDetailedStats = () => {
    setShowStatsModal(true);
  };

  const handleCallWaiter = () => {
    Alert.alert(
      '📞 Appeler le serveur',
      'Voulez-vous demander de l\'aide à un membre du personnel ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Appeler',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('✅', 'Un membre de notre équipe arrive bientôt !');
          }
        }
      ]
    );
  };

  const handleShareProgress = async () => {
    if (!trackingData) return;

    const stats = orderTrackingService.getOrderStats(trackingData);
    const message = `
🍽️ Suivi de ma commande #${orderId}

📊 Progression: ${Math.round(trackingData.global_progress)}%
🏆 Niveau: ${trackingData.gamification.level_title}
⭐ Points: ${trackingData.gamification.points.toLocaleString()}
🎖️ Distinctions: ${stats.badgesUnlocked}

${trackingData.gamification.message}
    `.trim();

    try {
      await Share.share({
        message,
        title: 'Mon suivi de commande',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const renderHealthIndicator = () => {
    if (!trackingData) return null;

    const health = orderTrackingService.getOrderHealthStatus(trackingData);
    const iconMap = {
      excellent: 'checkmark-circle',
      good: 'thumbs-up',
      warning: 'alert-circle',
      critical: 'warning'
    };

    return (
      <Animated.View 
        style={[
          styles.healthIndicator,
          { 
            backgroundColor: health.color + '20',
            transform: [{ scale: health.status !== 'good' && health.status !== 'excellent' ? healthPulseAnim : 1 }]
          }
        ]}
      >
        <Ionicons 
          name={iconMap[health.status] as any} 
          size={16} 
          color={health.color} 
        />
        <Text style={[styles.healthText, { color: health.color }]}>
          {health.message}
        </Text>
      </Animated.View>
    );
  };

  const renderProgressRateIndicator = () => {
    if (!trackingData || progressRate === null || progressRate <= 0) return null;

    const predictedTime = orderTrackingService.predictRemainingTime(trackingData);
    if (!predictedTime) return null;

    return (
      <View style={styles.progressRateContainer}>
        <Ionicons name="trending-up" size={16} color="#10B981" />
        <Text style={styles.progressRateText}>
          Progression: {progressRate.toFixed(2)}%/min
        </Text>
        <Text style={styles.progressRateSeparator}>•</Text>
        <Text style={styles.progressRateTime}>
          ~{Math.ceil(predictedTime)} min restantes
        </Text>
      </View>
    );
  };

  const renderStatsModal = () => {
    if (!trackingData) return null;

    const stats = orderTrackingService.getOrderStats(trackingData);
    const slowest = orderTrackingService.getSlowestCategory(trackingData);
    const fastest = orderTrackingService.getFastestCategory(trackingData);
    const overallScore = orderTrackingService.calculateOverallScore(trackingData);
    const health = orderTrackingService.getOrderHealthStatus(trackingData);

    return (
      <Modal
        visible={showStatsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStatsModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📊 Analyse Détaillée</Text>
            <TouchableOpacity onPress={() => setShowStatsModal(false)}>
              <Ionicons name="close" size={28} color="#64748b" />
            </TouchableOpacity>
          </View>

          <Animated.ScrollView 
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
          >
            {/* Score Global */}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreTitle}>Score Global</Text>
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreValue}>{overallScore}</Text>
                <Text style={styles.scoreMax}>/100</Text>
              </View>
              <View style={[styles.healthBadge, { backgroundColor: health.color + '20' }]}>
                <Text style={[styles.healthBadgeText, { color: health.color }]}>
                  {health.message}
                </Text>
              </View>
            </View>

            {/* Métriques de Performance */}
            <View style={styles.statsSection}>
              <Text style={styles.statsSectionTitle}>Performance</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Qualité</Text>
                  <Text style={styles.statValue}>
                    {stats.experienceQuality}/100
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Préparation</Text>
                  <Text style={styles.statValue}>
                    {stats.preparationQuality}/100
                  </Text>
                </View>
                {stats.timeEfficiency && (
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Efficacité</Text>
                    <Text style={styles.statValue}>
                      {Math.round(stats.timeEfficiency)}%
                    </Text>
                  </View>
                )}
                {stats.serviceSpeedScore && (
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Vitesse</Text>
                    <Text style={styles.statValue}>
                      {Math.round(stats.serviceSpeedScore)}/100
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Composition */}
            <View style={styles.statsSection}>
              <Text style={styles.statsSectionTitle}>Composition</Text>
              <View style={styles.infoRows}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Articles totaux</Text>
                  <Text style={styles.infoValue}>{stats.totalItems}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Catégories</Text>
                  <Text style={styles.infoValue}>
                    {stats.completedCategories}/{stats.totalCategories}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Complexité moyenne</Text>
                  <Text style={styles.infoValue}>{stats.averageComplexity}/2.0</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Temps estimé</Text>
                  <Text style={styles.infoValue}>{stats.estimatedTotalTime} min</Text>
                </View>
                {stats.totalTimeRemaining > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Temps restant</Text>
                    <Text style={[styles.infoValue, { color: '#F59E0B' }]}>
                      ~{stats.totalTimeRemaining} min
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Accomplissements */}
            <View style={styles.statsSection}>
              <Text style={styles.statsSectionTitle}>Accomplissements</Text>
              <View style={styles.infoRows}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Niveau</Text>
                  <Text style={styles.infoValue}>
                    {stats.levelTitle} ({stats.currentLevel})
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Tier</Text>
                  <Text style={styles.infoValue}>{stats.progressTier}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Points</Text>
                  <Text style={styles.infoValue}>
                    {stats.totalPoints.toLocaleString('fr-FR')}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Distinctions</Text>
                  <Text style={styles.infoValue}>{stats.badgesUnlocked}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Score rareté</Text>
                  <Text style={styles.infoValue}>{stats.rarityScore}/100</Text>
                </View>
                {stats.currentStreak > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Série</Text>
                    <Text style={[styles.infoValue, { color: '#FF6B35' }]}>
                      🔥 {stats.currentStreak}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Catégories */}
            <View style={styles.statsSection}>
              <Text style={styles.statsSectionTitle}>Catégories</Text>
              {slowest && (
                <View style={styles.categoryHighlight}>
                  <Text style={styles.categoryHighlightLabel}>⏳ Plus lente</Text>
                  <Text style={styles.categoryHighlightValue}>
                    {slowest.category} ({Math.round(slowest.progress_percentage)}%)
                  </Text>
                </View>
              )}
              {fastest && (
                <View style={styles.categoryHighlight}>
                  <Text style={styles.categoryHighlightLabel}>🏃 Plus rapide</Text>
                  <Text style={styles.categoryHighlightValue}>
                    {fastest.category} ({Math.round(fastest.progress_percentage)}%)
                  </Text>
                </View>
              )}
            </View>

            {/* Prédiction */}
            {trackingData.completion_prediction && !trackingData.completion_prediction.completed && (
              <View style={styles.statsSection}>
                <Text style={styles.statsSectionTitle}>Prédiction</Text>
                <View style={styles.predictionBox}>
                  <Text style={styles.predictionText}>
                    {orderTrackingService.formatPredictedCompletionTime(
                      trackingData.completion_prediction
                    )}
                  </Text>
                  {trackingData.completion_prediction.confidence && (
                    <View style={styles.confidenceMeter}>
                      <Text style={styles.confidenceLabel}>Précision</Text>
                      <View style={styles.confidenceBarContainer}>
                        <View 
                          style={[
                            styles.confidenceBarFill,
                            { width: `${trackingData.completion_prediction.confidence}%` }
                          ]}
                        />
                      </View>
                      <Text style={styles.confidenceText}>
                        {trackingData.completion_prediction.confidence}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </Animated.ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  if (!orderId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>Commande introuvable</Text>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* En-tête amélioré */}
      <Animated.View 
        style={[
          styles.header,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
        ]}
      >
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>

        <View style={styles.headerTitle}>
          <Text style={styles.headerTitleText}>Suivi en temps réel</Text>
          {trackingData && (
            <View style={styles.headerSubtitleRow}>
              {trackingData.table_number && (
                <Text style={styles.headerSubtitle}>Table {trackingData.table_number}</Text>
              )}
              <Text style={styles.headerSubtitle}>#{orderId}</Text>
              <View style={[
                styles.tierIndicator,
                { backgroundColor: trackingData.gamification.progress_tier.color }
              ]}>
                <Text style={styles.tierIndicatorText}>
                  {trackingData.gamification.progress_tier.name}
                </Text>
              </View>
            </View>
          )}
          {renderHealthIndicator()}
          {renderProgressRateIndicator()}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={handleShareProgress}
            disabled={!trackingData}
          >
            <Ionicons 
              name="share-outline" 
              size={24} 
              color={trackingData ? "#1e293b" : "#cbd5e1"} 
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.headerButton}
            onPress={showDetailedStats}
            disabled={!trackingData}
          >
            <Ionicons 
              name="stats-chart" 
              size={24} 
              color={trackingData ? "#1e293b" : "#cbd5e1"} 
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Contenu principal */}
      {loading && !trackingData && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E2A78" />
          <Text style={styles.loadingText}>Chargement de votre expérience...</Text>
          <Text style={styles.loadingSubtext}>Préparation du suivi en temps réel</Text>
        </View>
      )}

      {error && !trackingData && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={handleRefresh}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {trackingData && (
        <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
          <GamifiedOrderTracking 
            orderId={orderId}
            onRefresh={handleRefresh}
            trackingData={trackingData}
          />

          {/* Actions rapides améliorées */}
          <View style={styles.actionsBar}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleCallWaiter}
            >
              <Ionicons name="call" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Assistance</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.actionButtonSecondary]}
              onPress={() => router.push(`/order/${orderId}`)}
            >
              <Ionicons name="receipt" size={20} color="#1E2A78" />
              <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
                Détails
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.actionButtonTertiary]}
              onPress={showDetailedStats}
            >
              <Ionicons name="analytics" size={20} color="#8B5CF6" />
              <Text style={[styles.actionButtonText, styles.actionButtonTextTertiary]}>
                Stats
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Modal de statistiques */}
      {renderStatsModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.3,
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  tierIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tierIndicatorText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  healthIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  healthText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressRateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  progressRateText: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '600',
  },
  progressRateSeparator: {
    fontSize: 10,
    color: '#10B981',
  },
  progressRateTime: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 17,
    color: '#1e293b',
    fontWeight: '600',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748b',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  backButton: {
    backgroundColor: '#1E2A78',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E2A78',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionsBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E2A78',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#1E2A78',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  actionButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1E2A78',
  },
  actionButtonTertiary: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#8B5CF6',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  actionButtonTextSecondary: {
    color: '#1E2A78',
  },
  actionButtonTextTertiary: {
    color: '#8B5CF6',
  },

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  scoreCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 16,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F8FAFC',
    borderWidth: 8,
    borderColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: '800',
    color: '#1e293b',
  },
  scoreMax: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  healthBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  healthBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
  },
  infoRows: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '700',
  },
  categoryHighlight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  categoryHighlightLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  categoryHighlightValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '700',
  },
  predictionBox: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  predictionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  confidenceMeter: {
    gap: 8,
  },
  confidenceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  confidenceBarContainer: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
    textAlign: 'right',
  },
});