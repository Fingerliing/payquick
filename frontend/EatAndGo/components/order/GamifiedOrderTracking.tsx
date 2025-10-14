import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/utils/designSystem';

// Types Premium
interface CategoryProgress {
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

interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'royal' | 'special';
}

interface GamificationData {
  level: number;
  level_title: string;
  points: number;
  badges: Badge[];
  message: string;
  emoji: string;
  progress_tier: {
    name: string;
    color: string;
  };
  performance_metrics: {
    time_efficiency: number | null;
    completion_rate: number;
    experience_quality: number;
  };
  next_milestone: {
    progress: number;
    title: string;
    label: string;
    tier: string;
    remaining: number;
  } | null;
}

interface OrderTrackingData {
  order_id: number;
  order_status: string;
  table_number: string | null;
  created_at: string;
  global_progress: number;
  categories: CategoryProgress[];
  gamification: GamificationData;
  estimated_total_time: number;
}

interface Props {
  orderId: number;
  onRefresh?: () => void;
  trackingData?: OrderTrackingData | null;
}

export default function GamifiedOrderTracking({ orderId, onRefresh, trackingData: propTrackingData }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const trackingData = propTrackingData;
  
  // Animations élégantes
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (trackingData) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 10,
          tension: 80,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [trackingData]);

  const handleRefresh = () => {
    setRefreshing(true);
    onRefresh?.();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: COLORS.progress.pending,
      preparing: COLORS.progress.preparing,
      ready: COLORS.progress.ready,
      completed: COLORS.progress.completed
    };
    return colors[status as keyof typeof colors] || COLORS.progress.pending;
  };

  const renderGlobalProgress = () => {
    if (!trackingData) return null;

    const { global_progress, gamification } = trackingData;

    return (
      <Animated.View 
        style={[
          styles.globalCard,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
        ]}
      >
        <LinearGradient
          colors={['#1E2A78', '#2D3A8C', '#3B4BA0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBackground}
        >
          {/* En-tête avec niveau et titre prestigieux */}
          <View style={styles.headerRow}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelEmoji}>{gamification.emoji}</Text>
              <View>
                <Text style={styles.levelTitle}>{gamification.level_title}</Text>
                <Text style={styles.levelSubtitle}>Niveau {gamification.level}</Text>
              </View>
            </View>
            <View style={styles.pointsBadge}>
              <Ionicons name="diamond" size={18} color="#FFD700" />
              <Text style={styles.pointsText}>{gamification.points.toLocaleString()}</Text>
              <Text style={styles.pointsLabel}>pts</Text>
            </View>
          </View>

          {/* Message professionnel */}
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{gamification.message}</Text>
          </View>

          {/* Barre de progression avec tier */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progression</Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierText}>{gamification.progress_tier.name}</Text>
              </View>
            </View>
            <View style={styles.progressBarBackground}>
              <Animated.View 
                style={[
                  styles.progressBarFill,
                  { 
                    width: `${global_progress}%`,
                    backgroundColor: gamification.progress_tier.color
                  }
                ]}
              />
            </View>
            <Text style={styles.progressPercentage}>
              {Math.round(global_progress)}%
            </Text>
          </View>

          {/* Métriques de performance */}
          {gamification.performance_metrics && (
            <View style={styles.metricsContainer}>
              <View style={styles.metricItem}>
                <Ionicons name="speedometer" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.metricLabel}>Qualité</Text>
                <Text style={styles.metricValue}>
                  {gamification.performance_metrics.experience_quality}/100
                </Text>
              </View>
              {gamification.performance_metrics.time_efficiency && (
                <View style={styles.metricItem}>
                  <Ionicons name="time" size={16} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.metricLabel}>Efficacité</Text>
                  <Text style={styles.metricValue}>
                    {Math.round(gamification.performance_metrics.time_efficiency)}%
                  </Text>
                </View>
              )}
              <View style={styles.metricItem}>
                <Ionicons name="checkmark-circle" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.metricLabel}>Complétion</Text>
                <Text style={styles.metricValue}>
                  {Math.round(gamification.performance_metrics.completion_rate)}%
                </Text>
              </View>
            </View>
          )}

          {/* Prochain objectif */}
          {gamification.next_milestone && (
            <View style={styles.nextMilestone}>
              <Ionicons name="trophy" size={16} color="#FFD700" />
              <View style={styles.milestoneContent}>
                <Text style={styles.milestoneTitle}>{gamification.next_milestone.title}</Text>
                <Text style={styles.milestoneSubtitle}>
                  {gamification.next_milestone.tier} • {Math.round(gamification.next_milestone.remaining)}% restants
                </Text>
              </View>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderBadges = () => {
    if (!trackingData?.gamification.badges.length) return null;

    // Grouper les badges par tier
    const badgesByTier = trackingData.gamification.badges.reduce((acc, badge) => {
      if (!acc[badge.tier]) acc[badge.tier] = [];
      acc[badge.tier].push(badge);
      return acc;
    }, {} as Record<string, typeof trackingData.gamification.badges>);

    const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'royal', 'special'];
    const tierColors = {
      bronze: '#CD7F32',
      silver: '#C0C0C0',
      gold: '#FFD700',
      platinum: '#E5E4E2',
      royal: '#9333EA',
      special: '#10B981'
    };

    return (
      <View style={styles.badgesSection}>
        <View style={styles.badgesHeader}>
          <Ionicons name="shield-checkmark" size={22} color={COLORS.primary} />
          <Text style={styles.sectionTitle}>Distinctions</Text>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>{trackingData.gamification.badges.length}</Text>
          </View>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgesContainer}
        >
          {tierOrder.map(tier => 
            badgesByTier[tier]?.map((badge, index) => (
              <Animated.View 
                key={badge.id}
                style={[
                  styles.badgeCard,
                  {
                    opacity: fadeAnim,
                    transform: [{
                      translateY: fadeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0]
                      })
                    }]
                  }
                ]}
              >
                <LinearGradient
                  colors={[tierColors[tier as keyof typeof tierColors] + '20', tierColors[tier as keyof typeof tierColors] + '10']}
                  style={styles.badgeGradient}
                >
                  <View style={[styles.badgeTierIndicator, { backgroundColor: tierColors[tier as keyof typeof tierColors] }]} />
                  <Text style={styles.badgeIcon}>{badge.icon}</Text>
                  <Text style={styles.badgeName}>{badge.name}</Text>
                  <Text style={styles.badgeDescription}>{badge.description}</Text>
                  <Text style={[styles.badgeTier, { color: tierColors[tier as keyof typeof tierColors] }]}>
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                  </Text>
                </LinearGradient>
              </Animated.View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };

  const renderCategoryProgress = (category: CategoryProgress, index: number) => {
    const statusColor = getStatusColor(category.status);
    const isCompleted = category.status === 'completed' || category.status === 'ready';

    return (
      <Animated.View 
        key={`${category.category}-${index}`}
        style={[
          styles.categoryCard,
          {
            opacity: fadeAnim,
            transform: [{
              translateX: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0]
              })
            }]
          }
        ]}
      >
        <View style={styles.categoryHeader}>
          <View style={styles.categoryTitleRow}>
            <Text style={styles.categoryIcon}>{category.category_icon}</Text>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>{category.category}</Text>
              <Text style={styles.categoryItemsCount}>
                {category.items_count} article{category.items_count > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
          
          {isCompleted && (
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.itemsList}>
          {category.items.map((item, idx) => (
            <View key={`${item.id}-${idx}`} style={styles.itemRow}>
              <View style={styles.itemDot} />
              <Text style={styles.itemText}>
                {item.quantity}x {item.name}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.categoryProgressContainer}>
          <View style={styles.categoryProgressBar}>
            <Animated.View 
              style={[
                styles.categoryProgressFill,
                { 
                  width: `${category.progress_percentage}%`,
                  backgroundColor: statusColor 
                }
              ]}
            />
          </View>
          <Text style={styles.categoryProgressText}>
            {Math.round(category.progress_percentage)}%
          </Text>
        </View>

        <View style={styles.timeInfo}>
          <View style={styles.timeItem}>
            <Ionicons name="time-outline" size={16} color={COLORS.text.secondary} />
            <Text style={styles.timeLabel}>Temps estimé:</Text>
            <Text style={styles.timeValue}>{category.estimated_time_minutes} min</Text>
          </View>
          
          {category.time_remaining_minutes > 0 && (
            <View style={styles.timeItem}>
              <Ionicons name="hourglass-outline" size={16} color={COLORS.warning} />
              <Text style={styles.timeLabel}>Restant:</Text>
              <Text style={[styles.timeValue, { color: COLORS.warning }]}>
                ~{Math.round(category.time_remaining_minutes)} min
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.statusLabel, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusLabelText, { color: statusColor }]}>
            {category.status_label}
          </Text>
        </View>
      </Animated.View>
    );
  };

  if (!trackingData) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="restaurant" size={48} color={COLORS.primary} />
        <Text style={styles.loadingText}>Chargement du suivi...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {renderGlobalProgress()}
      {renderBadges()}

      <View style={styles.categoriesSection}>
        <Text style={styles.sectionTitle}>📋 Détails par Catégorie</Text>
        {trackingData.categories.map((category, index) => 
          renderCategoryProgress(category, index)
        )}
      </View>

      <View style={styles.totalTimeCard}>
        <Ionicons name="timer" size={24} color={COLORS.primary} />
        <Text style={styles.totalTimeText}>
          Temps total estimé: <Text style={styles.totalTimeValue}>
            {trackingData.estimated_total_time} minutes
          </Text>
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  
  // Global Progress Card - Premium Design
  globalCard: {
    marginBottom: 24,
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  gradientBackground: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  levelBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  levelEmoji: {
    fontSize: 24,
  },
  levelTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  levelSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '500',
  },
  pointsBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  pointsText: {
    color: '#FFD700',
    fontWeight: '700',
    fontSize: 16,
  },
  pointsLabel: {
    color: 'rgba(255, 215, 0, 0.8)',
    fontSize: 11,
    fontWeight: '600',
  },
  messageContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tierBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressBarBackground: {
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 7,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  progressPercentage: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 1,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  metricItem: {
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  nextMilestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneTitle: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  milestoneSubtitle: {
    color: 'rgba(255, 215, 0, 0.8)',
    fontSize: 11,
    fontWeight: '500',
  },
  
  // Badges Section - Premium
  badgesSection: {
    marginBottom: 24,
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text.primary,
    flex: 1,
  },
  badgeCount: {
    backgroundColor: COLORS.primary,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  badgeCountText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  badgesContainer: {
    gap: 14,
    paddingRight: 16,
  },
  badgeCard: {
    borderRadius: 18,
    width: 140,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  badgeGradient: {
    padding: 18,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: COLORS.card,
  },
  badgeTierIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  badgeIcon: {
    fontSize: 44,
    marginBottom: 10,
  },
  badgeName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  badgeDescription: {
    fontSize: 11,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 8,
  },
  badgeTier: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 6,
  },
  
  // Categories Section
  categoriesSection: {
    marginBottom: 24,
  },
  categoryCard: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryIcon: {
    fontSize: 32,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  categoryItemsCount: {
    fontSize: 13,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  statusBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemsList: {
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.text.secondary,
    marginRight: 8,
  },
  itemText: {
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  categoryProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  categoryProgressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryProgressText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text.primary,
    minWidth: 40,
  },
  timeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeLabel: {
    fontSize: 12,
    color: COLORS.text.secondary,
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  statusLabel: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusLabelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  
  // Total Time Card
  totalTimeCard: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  totalTimeText: {
    fontSize: 16,
    color: COLORS.text.secondary,
  },
  totalTimeValue: {
    fontWeight: '700',
    color: COLORS.primary,
  },
});