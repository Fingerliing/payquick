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

const { width } = Dimensions.get('window');

// Types
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
}

interface GamificationData {
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
  trackingData?: OrderTrackingData | null; // FIXED: Accept data as prop
}

export default function GamifiedOrderTracking({ orderId, onRefresh, trackingData: propTrackingData }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  
  // FIXED: Use prop data if available, otherwise show loading
  const trackingData = propTrackingData;
  
  // Animations
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

  // FIXED: Animate when data is received
  useEffect(() => {
    if (trackingData) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [trackingData]);

  const handleRefresh = () => {
    setRefreshing(true);
    onRefresh?.();
    // Reset refreshing after a delay
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
          colors={['#3b82f6', '#2563eb', '#1d4ed8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBackground}
        >
          {/* En-tête avec niveau */}
          <View style={styles.headerRow}>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>Niveau {gamification.level}</Text>
            </View>
            <View style={styles.pointsBadge}>
              <Ionicons name="star" size={16} color="#fbbf24" />
              <Text style={styles.pointsText}>{gamification.points} pts</Text>
            </View>
          </View>

          {/* Message motivationnel */}
          <View style={styles.messageContainer}>
            <Text style={styles.messageEmoji}>{gamification.emoji}</Text>
            <Text style={styles.messageText}>{gamification.message}</Text>
          </View>

          {/* Barre de progression globale */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <Animated.View 
                style={[
                  styles.progressBarFill,
                  { width: `${global_progress}%` }
                ]}
              />
            </View>
            <Text style={styles.progressPercentage}>
              {Math.round(global_progress)}%
            </Text>
          </View>

          {/* Prochain objectif */}
          {gamification.next_milestone && (
            <View style={styles.nextMilestone}>
              <Ionicons name="flag" size={16} color="#cbd5e1" />
              <Text style={styles.nextMilestoneText}>
                Prochain: {gamification.next_milestone.label} ({Math.round(gamification.next_milestone.remaining)}% restants)
              </Text>
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderBadges = () => {
    if (!trackingData?.gamification.badges.length) return null;

    return (
      <View style={styles.badgesSection}>
        <Text style={styles.sectionTitle}>🏆 Badges Débloqués</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgesContainer}
        >
          {trackingData.gamification.badges.map((badge, index) => (
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
              <Text style={styles.badgeIcon}>{badge.icon}</Text>
              <Text style={styles.badgeName}>{badge.name}</Text>
              <Text style={styles.badgeDescription}>{badge.description}</Text>
            </Animated.View>
          ))}
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
        {/* En-tête de catégorie */}
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

        {/* Liste des items */}
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

        {/* Barre de progression de catégorie */}
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

        {/* Informations de temps */}
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

        {/* Statut */}
        <View style={[styles.statusLabel, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusLabelText, { color: statusColor }]}>
            {category.status_label}
          </Text>
        </View>
      </Animated.View>
    );
  };

  // FIXED: Show message when no data is available
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
      {/* Progression globale */}
      {renderGlobalProgress()}

      {/* Badges */}
      {renderBadges()}

      {/* Progression par catégorie */}
      <View style={styles.categoriesSection}>
        <Text style={styles.sectionTitle}>📋 Détails par Catégorie</Text>
        {trackingData.categories.map((category, index) => 
          renderCategoryProgress(category, index)
        )}
      </View>

      {/* Temps total estimé */}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.error,
    textAlign: 'center',
  },
  
  // Global Progress Card
  globalCard: {
    marginBottom: 24,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  gradientBackground: {
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  levelBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  levelText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  pointsBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pointsText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  messageContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  messageEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  messageText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressBarContainer: {
    marginBottom: 12,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  progressPercentage: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 8,
  },
  nextMilestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 12,
    borderRadius: 10,
  },
  nextMilestoneText: {
    color: '#e2e8f0',
    fontSize: 13,
    flex: 1,
  },
  
  // Badges Section
  badgesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 16,
  },
  badgesContainer: {
    gap: 12,
    paddingRight: 16,
  },
  badgeCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    width: 120,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  badgeIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeDescription: {
    fontSize: 11,
    color: COLORS.text.secondary,
    textAlign: 'center',
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