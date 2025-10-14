import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

import GamifiedOrderTracking from '@/components/order/GamifiedOrderTracking';
import { 
  orderTrackingService,
  OrderTrackingResponse, 
  Badge 
} from '@/services/orderTrackingService';

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = parseInt(id);

  console.log('🎬 OrderTrackingScreen mounted with orderId:', orderId);

  const [trackingData, setTrackingData] = useState<OrderTrackingResponse | null>(null);
  const [previousBadges, setPreviousBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    setLoading(true);
    setError(null);

    // S'abonner aux mises à jour
    const unsubscribe = orderTrackingService.subscribeToOrderProgress(
      orderId,
      handleTrackingUpdate
    );

    // Timeout de sécurité
    const timeout = setTimeout(() => {
      if (loading && !trackingData) {
        setError("Le chargement prend trop de temps. Vérifiez votre connexion.");
        setLoading(false);
      }
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [orderId]);

  const handleTrackingUpdate = async (data: OrderTrackingResponse) => {
    console.log('📦 Tracking data received:', JSON.stringify(data, null, 2));
    console.log('✅ Data is valid:', !!data);
    console.log('✅ Has categories:', data?.categories?.length);
    
    setLoading(false);
    setError(null);

    // Vérifier les nouveaux badges
    if (trackingData) {
      const newBadges = orderTrackingService.hasNewBadges(
        previousBadges,
        data.gamification.badges
      );

      // Notifier l'utilisateur des nouveaux badges avec leur tier
      for (const badge of newBadges) {
        const tierEmoji = {
          bronze: '🥉',
          silver: '🥈',
          gold: '🥇',
          platinum: '💎',
          royal: '👑',
          special: '⭐'
        }[badge.tier] || '🏆';

        await sendNotification(
          `${tierEmoji} Nouvelle distinction débloquée !`,
          `${badge.icon} ${badge.name}: ${badge.description}`
        );
      }
    }

    // Notifier quand la commande est prête
    if (data.order_status === 'ready' && trackingData?.order_status !== 'ready') {
      await sendNotification(
        '✨ Votre commande est prête !',
        'Votre expérience culinaire vous attend 🍽️'
      );
      
      // Vibration élégante
      if (Platform.OS !== 'web') {
        const { Vibration } = require('react-native');
        Vibration.vibrate([0, 300, 100, 300]);
      }
    }

    setPreviousBadges(data.gamification.badges);
    setTrackingData(data);
  };

  const sendNotification = async (title: string, body: string) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
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

  const showOrderStats = () => {
    if (!trackingData) return;

    const stats = orderTrackingService.getOrderStats(trackingData);
    const slowestCategory = orderTrackingService.getSlowestCategory(trackingData);
    const { gamification } = trackingData;

    const statsMessage = `
📊 ANALYSE DE COMMANDE

Performance Globale
├─ Qualité d'expérience: ${gamification.performance_metrics.experience_quality}/100
${gamification.performance_metrics.time_efficiency ? `├─ Efficacité temporelle: ${Math.round(gamification.performance_metrics.time_efficiency)}%` : ''}
└─ Taux de complétion: ${stats.averageProgress}%

Composition
├─ Articles totaux: ${stats.totalItems}
├─ Catégories: ${stats.completedCategories}/${stats.totalCategories} prêtes
└─ Temps estimé: ${stats.estimatedTotalTime} min

Progression
├─ Niveau actuel: ${gamification.level_title} (${stats.currentLevel})
├─ Tier: ${gamification.progress_tier.name}
├─ Points: ${stats.totalPoints.toLocaleString()}
└─ Distinctions: ${stats.badgesUnlocked}

${slowestCategory ? `⏳ Catégorie en attente:\n   ${slowestCategory.category} (${Math.round(slowestCategory.progress_percentage)}%)` : '✅ Toutes les catégories sont prêtes'}
    `.trim();

    Alert.alert('Analyse Détaillée', statsMessage, [
      { text: 'Fermer', style: 'cancel' }
    ]);
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
            Alert.alert('✅', 'Un membre de notre équipe arrive bientôt !');
          }
        }
      ]
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
      {/* En-tête premium */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>

        <View style={styles.headerTitle}>
          <Text style={styles.headerTitleText}>Suivi de commande</Text>
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
        </View>

        <TouchableOpacity 
          style={styles.headerButton}
          onPress={showOrderStats}
          disabled={!trackingData}
        >
          <Ionicons 
            name="stats-chart" 
            size={24} 
            color={trackingData ? "#1e293b" : "#cbd5e1"} 
          />
        </TouchableOpacity>
      </View>

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
        <>
          <GamifiedOrderTracking 
            orderId={orderId}
            onRefresh={handleRefresh}
            trackingData={trackingData}
          />

          {/* Actions rapides premium */}
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
          </View>
        </>
      )}
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
    paddingVertical: 16,
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
  headerTitle: {
    flex: 1,
    alignItems: 'center',
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
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  tierIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tierIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  actionButtonTextSecondary: {
    color: '#1E2A78',
  },
});