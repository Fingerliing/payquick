import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
  RefreshControl,
  Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/utils/designSystem';
import type { OrderTrackingResponse, PreparationStage, CategoryProgress } from '@/services/orderTrackingService';

interface Props {
  orderId: number;
  onRefresh?: () => void;
  trackingData?: OrderTrackingResponse | null;
}

export default function GamifiedOrderTracking({ orderId, onRefresh, trackingData }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  
  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

      // Animation de pulsation pour les éléments actifs
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          })
        ])
      ).start();
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

  const renderPredictionCard = () => {
    if (!trackingData || !trackingData.completion_prediction) return null;

    const { completion_prediction } = trackingData;
    
    if (completion_prediction.completed) return null;

    return (
      <Animated.View 
        style={[
          styles.predictionCard,
          { opacity: fadeAnim, transform: [{ scale: pulseAnim }] }
        ]}
      >
        <LinearGradient
          colors={['#8B5CF6', '#7C3AED']}
          style={styles.predictionGradient}
        >
          <View style={styles.predictionHeader}>
            <Ionicons name="time" size={24} color="#fff" />
            <View style={styles.predictionContent}>
              <Text style={styles.predictionTitle}>Temps Estimé</Text>
              {completion_prediction.estimated_remaining_minutes !== undefined && (
                <Text style={styles.predictionTime}>
                  ~{Math.ceil(completion_prediction.estimated_remaining_minutes)} min
                </Text>
              )}
              {completion_prediction.predicted_completion_time && (
                <Text style={styles.predictionSubtext}>
                  Prête vers {new Date(completion_prediction.predicted_completion_time)
                    .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </View>
          </View>
          
          {completion_prediction.confidence !== undefined && (
            <View style={styles.confidenceContainer}>
              <Text style={styles.confidenceLabel}>Précision</Text>
              <View style={styles.confidenceBar}>
                <View 
                  style={[
                    styles.confidenceFill, 
                    { width: `${completion_prediction.confidence}%` }
                  ]} 
                />
              </View>
              <Text style={styles.confidenceValue}>{completion_prediction.confidence}%</Text>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderInsights = () => {
    if (!trackingData?.real_time_insights || trackingData.real_time_insights.length === 0) {
      return null;
    }

    return (
      <View style={styles.insightsSection}>
        <Text style={styles.sectionTitle}>📡 Mises à Jour</Text>
        {trackingData.real_time_insights.map((insight, index) => (
          <Animated.View
            key={`${insight.type}-${index}`}
            style={[
              styles.insightCard,
              insight.priority === 'high' && styles.insightCardHigh,
              {
                opacity: fadeAnim,
                transform: [{
                  translateX: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-50, 0]
                  })
                }]
              }
            ]}
          >
            <Text style={styles.insightIcon}>{insight.icon}</Text>
            <Text style={[
              styles.insightMessage,
              insight.priority === 'high' && styles.insightMessageHigh
            ]}>
              {insight.message}
            </Text>
          </Animated.View>
        ))}
      </View>
    );
  };

  const renderPreparationStages = (stages: PreparationStage[]) => {
    return (
      <View style={styles.stagesContainer}>
        {stages.map((stage, index) => (
          <View key={stage.id} style={styles.stageRow}>
            <View style={[
              styles.stageIcon,
              stage.completed && styles.stageIconCompleted,
              stage.in_progress && styles.stageIconInProgress
            ]}>
              {stage.completed ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : stage.in_progress ? (
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Ionicons name="hourglass" size={12} color="#F59E0B" />
                </Animated.View>
              ) : (
                <View style={styles.stageIconEmpty} />
              )}
            </View>
            
            {index < stages.length - 1 && (
              <View style={[
                styles.stageLine,
                stage.completed && styles.stageLineCompleted
              ]} />
            )}
            
            <View style={styles.stageContent}>
              <Text style={[
                styles.stageLabel,
                stage.completed && styles.stageLabelCompleted,
                stage.in_progress && styles.stageLabelInProgress
              ]}>
                {stage.icon} {stage.label}
              </Text>
              {stage.in_progress && (
                <Text style={styles.stageStatus}>En cours...</Text>
              )}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderGlobalProgress = () => {
    if (!trackingData) return null;

    const { global_progress, gamification } = trackingData;
    const isNearComplete = global_progress >= 85;

    return (
      <Animated.View 
        style={[
          styles.globalCard,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }
        ]}
      >
        <LinearGradient
          colors={isNearComplete ? ['#10B981', '#059669'] : ['#1E2A78', '#2D3A8C', '#3B4BA0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBackground}
        >
          {/* En-tête */}
          <View style={styles.headerRow}>
            <View style={styles.levelBadge}>
              <Animated.Text 
                style={[
                  styles.levelEmoji,
                  isNearComplete && { transform: [{ scale: pulseAnim }] }
                ]}
              >
                {gamification.emoji}
              </Animated.Text>
              <View>
                <Text style={styles.levelTitle}>{gamification.level_title}</Text>
                <Text style={styles.levelSubtitle}>Niveau {gamification.level}</Text>
              </View>
            </View>
            <View style={styles.pointsBadge}>
              <Ionicons name="diamond" size={18} color="#FFD700" />
              <Text style={styles.pointsText}>{gamification.points.toLocaleString('fr-FR')}</Text>
              <Text style={styles.pointsLabel}>pts</Text>
            </View>
          </View>

          {/* Message */}
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{gamification.message}</Text>
          </View>

          {/* Barre de progression */}
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
              {/* Points de jalons sur la barre */}
              {[25, 50, 75].map(milestone => (
                <View
                  key={milestone}
                  style={[
                    styles.milestoneMarker,
                    { left: `${milestone}%` },
                    global_progress >= milestone && styles.milestoneMarkerPassed
                  ]}
                />
              ))}
            </View>
            <Text style={styles.progressPercentage}>
              {Math.round(global_progress)}%
            </Text>
          </View>

          {/* Métriques avancées */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Ionicons name="speedometer" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.metricLabel}>Qualité</Text>
              <Text style={styles.metricValue}>
                {gamification.performance_metrics.experience_quality}
              </Text>
            </View>
            
            <View style={styles.metricItem}>
              <Ionicons name="restaurant" size={16} color="rgba(255,255,255,0.8)" />
              <Text style={styles.metricLabel}>Préparation</Text>
              <Text style={styles.metricValue}>
                {gamification.performance_metrics.preparation_quality}
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

          {/* Streak */}
          {gamification.streak_data.current_streak > 0 && (
            <View style={styles.streakContainer}>
              <Ionicons name="flame" size={20} color="#FF6B35" />
              <Text style={styles.streakText}>
                Série de {gamification.streak_data.current_streak} commande{gamification.streak_data.current_streak > 1 ? 's' : ''}
              </Text>
              {gamification.streak_data.bonus_active && (
                <View style={styles.bonusBadge}>
                  <Text style={styles.bonusText}>Bonus actif</Text>
                </View>
              )}
            </View>
          )}

          {/* Prochain objectif */}
          {gamification.next_milestone && (
            <View style={styles.nextMilestone}>
              <Ionicons name="trophy" size={16} color="#FFD700" />
              <View style={styles.milestoneContent}>
                <Text style={styles.milestoneTitle}>{gamification.next_milestone.title}</Text>
                <View style={styles.milestoneProgress}>
                  <View style={styles.milestoneBar}>
                    <View style={[
                      styles.milestoneBarFill,
                      { 
                        width: `${((gamification.next_milestone.progress - global_progress) / gamification.next_milestone.progress) * 100}%` 
                      }
                    ]} />
                  </View>
                  <Text style={styles.milestoneRemaining}>
                    {Math.round(gamification.next_milestone.remaining)}% restants
                  </Text>
                </View>
              </View>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderBadges = () => {
    if (!trackingData?.gamification.badges.length) return null;

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
          <View style={styles.rarityBadge}>
            <Ionicons name="star" size={14} color="#FFD700" />
            <Text style={styles.rarityText}>
              {trackingData.gamification.achievements_summary.rarity_score}
            </Text>
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
                  {badge.unlocked_at && (
                    <Text style={styles.badgeTime}>
                      {new Date(badge.unlocked_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                  )}
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
    const isExpanded = expandedCategory === category.category;

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
        <Pressable onPress={() => setExpandedCategory(isExpanded ? null : category.category)}>
          <View style={styles.categoryHeader}>
            <View style={styles.categoryTitleRow}>
              <Animated.Text 
                style={[
                  styles.categoryIcon,
                  !isCompleted && { transform: [{ scale: pulseAnim }] }
                ]}
              >
                {category.category_icon}
              </Animated.Text>
              <View style={styles.categoryInfo}>
                <Text style={styles.categoryName}>{category.category}</Text>
                <View style={styles.categoryMetadata}>
                  <Text style={styles.categoryItemsCount}>
                    {category.items_count} article{category.items_count > 1 ? 's' : ''}
                  </Text>
                  <View style={styles.complexityIndicator}>
                    <Ionicons 
                      name={category.complexity_score > 1.3 ? "diamond" : "square"} 
                      size={10} 
                      color={COLORS.text.secondary} 
                    />
                    <Text style={styles.complexityText}>
                      {category.complexity_score.toFixed(1)}x
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            
            {isCompleted && (
              <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
              </View>
            )}

            <Ionicons 
              name={isExpanded ? "chevron-up" : "chevron-down"} 
              size={20} 
              color={COLORS.text.secondary} 
            />
          </View>

          {isExpanded && (
            <View style={styles.categoryExpanded}>
              {/* Items */}
              <View style={styles.itemsList}>
                {category.items.map((item, idx) => (
                  <View key={`${item.id}-${idx}`} style={styles.itemRow}>
                    <View style={styles.itemDot} />
                    <Text style={styles.itemText}>
                      {item.quantity}x {item.name}
                    </Text>
                    {item.complexity > 1.2 && (
                      <Ionicons name="star" size={12} color={COLORS.secondary} />
                    )}
                  </View>
                ))}
              </View>

              {/* Étapes de préparation */}
              {category.preparation_stages && (
                <View style={styles.preparationSection}>
                  <Text style={styles.preparationTitle}>Étapes de préparation</Text>
                  {renderPreparationStages(category.preparation_stages)}
                </View>
              )}
            </View>
          )}

          {/* Barre de progression */}
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

          {/* Temps */}
          <View style={styles.timeInfo}>
            <View style={styles.timeItem}>
              <Ionicons name="time-outline" size={16} color={COLORS.text.secondary} />
              <Text style={styles.timeLabel}>Estimé:</Text>
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

          {/* Statut */}
          <View style={[styles.statusLabel, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusLabelText, { color: statusColor }]}>
              {category.status_label}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  if (!trackingData) {
    return (
      <View style={styles.loadingContainer}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Ionicons name="restaurant" size={48} color={COLORS.primary} />
        </Animated.View>
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
      {renderPredictionCard()}
      {renderInsights()}
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
  
  // Global Progress
  globalCard: {
    marginBottom: 16,
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
    position: 'relative',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  milestoneMarker: {
    position: 'absolute',
    width: 2,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  milestoneMarkerPassed: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  progressPercentage: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    minWidth: '45%',
    marginBottom: 8,
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
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  streakText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  bonusBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bonusText: {
    color: '#fff',
    fontSize: 10,
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
    marginBottom: 6,
  },
  milestoneProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  milestoneBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  milestoneBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
  },
  milestoneRemaining: {
    color: 'rgba(255, 215, 0, 0.9)',
    fontSize: 11,
    fontWeight: '600',
  },

  // Prediction Card
  predictionCard: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  predictionGradient: {
    padding: 20,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  predictionContent: {
    flex: 1,
  },
  predictionTitle: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  predictionTime: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  predictionSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confidenceLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: '600',
    width: 60,
  },
  confidenceBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  confidenceValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    width: 35,
    textAlign: 'right',
  },

  // Insights
  insightsSection: {
    marginBottom: 16,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.info,
  },
  insightCardHigh: {
    borderLeftColor: COLORS.error,
    backgroundColor: COLORS.error + '10',
  },
  insightIcon: {
    fontSize: 20,
  },
  insightMessage: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text.primary,
    fontWeight: '500',
  },
  insightMessageHigh: {
    fontWeight: '600',
    color: COLORS.error,
  },

  // Preparation Stages
  stagesContainer: {
    gap: 12,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    position: 'relative',
  },
  stageIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.border.light,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  stageIconCompleted: {
    backgroundColor: COLORS.success,
  },
  stageIconInProgress: {
    backgroundColor: '#FFF7ED',
    borderWidth: 2,
    borderColor: COLORS.warning,
  },
  stageIconEmpty: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border.default,
  },
  stageLine: {
    position: 'absolute',
    left: 12,
    top: 24,
    width: 2,
    height: 24,
    backgroundColor: COLORS.border.light,
  },
  stageLineCompleted: {
    backgroundColor: COLORS.success,
  },
  stageContent: {
    flex: 1,
  },
  stageLabel: {
    fontSize: 13,
    color: COLORS.text.secondary,
    fontWeight: '500',
  },
  stageLabelCompleted: {
    color: COLORS.text.primary,
    fontWeight: '600',
  },
  stageLabelInProgress: {
    color: COLORS.warning,
    fontWeight: '700',
  },
  stageStatus: {
    fontSize: 11,
    color: COLORS.warning,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // Badges
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
  rarityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rarityText: {
    color: '#D97706',
    fontSize: 12,
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
  badgeTime: {
    fontSize: 9,
    color: COLORS.text.light,
    marginTop: 4,
  },

  // Categories
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
  categoryMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  categoryItemsCount: {
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  complexityIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  complexityText: {
    fontSize: 11,
    color: COLORS.text.secondary,
    fontWeight: '600',
  },
  statusBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  categoryExpanded: {
    marginBottom: 16,
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
    flex: 1,
    fontSize: 14,
    color: COLORS.text.secondary,
  },
  preparationSection: {
    backgroundColor: COLORS.background,
    padding: 12,
    borderRadius: 12,
  },
  preparationTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 12,
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

  // Total Time
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