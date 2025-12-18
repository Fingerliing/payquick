/**
 * Composant Badge de Notification EatQuickeR
 * Affiche un indicateur visuel du nombre de notifications non lues
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUnreadNotificationCount } from '@/contexts/NotificationContext';

// =============================================================================
// CONSTANTES
// =============================================================================

const COLORS = {
  primary: '#1E3A5F',
  gold: '#D4AF37',
  badge: '#EF4444',
  badgeText: '#FFFFFF',
};

// =============================================================================
// TYPES
// =============================================================================

interface NotificationBadgeProps {
  /**
   * Taille de l'icône
   */
  size?: number;
  
  /**
   * Couleur de l'icône
   */
  color?: string;
  
  /**
   * Afficher seulement le point (pas le nombre)
   */
  dotOnly?: boolean;
  
  /**
   * Callback personnalisé au tap (sinon navigation vers /notifications)
   */
  onPress?: () => void;
  
  /**
   * Style additionnel pour le conteneur
   */
  style?: object;
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function NotificationBadge({
  size = 24,
  color = COLORS.primary,
  dotOnly = false,
  onPress,
  style,
}: NotificationBadgeProps) {
  const router = useRouter();
  const unreadCount = useUnreadNotificationCount();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push('/notifications/Notifications');
    }
  };

  // Formater le nombre (99+ si > 99)
  const displayCount = unreadCount > 99 ? '99+' : unreadCount.toString();

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={handlePress}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="notifications-outline" size={size} color={color} />
      
      {unreadCount > 0 && (
        <View style={[
          styles.badge,
          dotOnly && styles.badgeDot,
        ]}>
          {!dotOnly && (
            <Text style={[
              styles.badgeText,
              unreadCount > 9 && styles.badgeTextSmall,
            ]}>
              {displayCount}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// =============================================================================
// COMPOSANT HEADER AVEC BADGE
// =============================================================================

interface NotificationHeaderButtonProps {
  tintColor?: string;
}

export function NotificationHeaderButton({ tintColor = COLORS.primary }: NotificationHeaderButtonProps) {
  return (
    <NotificationBadge
      size={26}
      color={tintColor}
      style={styles.headerButton}
    />
  );
}

// =============================================================================
// COMPOSANT TAB BAR AVEC BADGE
// =============================================================================

interface NotificationTabIconProps {
  focused: boolean;
  color: string;
  size: number;
}

export function NotificationTabIcon({ focused, color, size }: NotificationTabIconProps) {
  const unreadCount = useUnreadNotificationCount();

  return (
    <View style={styles.tabIconContainer}>
      <Ionicons
        name={focused ? 'notifications' : 'notifications-outline'}
        size={size}
        color={color}
      />
      
      {unreadCount > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// COMPOSANT INDICATEUR SIMPLE (POINT)
// =============================================================================

interface NotificationDotProps {
  visible?: boolean;
  color?: string;
  size?: number;
  style?: object;
}

export function NotificationDot({
  visible = true,
  color = COLORS.badge,
  size = 8,
  style,
}: NotificationDotProps) {
  const unreadCount = useUnreadNotificationCount();
  
  if (!visible || unreadCount === 0) return null;

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

// =============================================================================
// COMPOSANT COMPTEUR INLINE
// =============================================================================

interface NotificationCountProps {
  showZero?: boolean;
  style?: object;
  textStyle?: object;
}

export function NotificationCount({
  showZero = false,
  style,
  textStyle,
}: NotificationCountProps) {
  const unreadCount = useUnreadNotificationCount();

  if (unreadCount === 0 && !showZero) return null;

  return (
    <View style={[styles.countContainer, style]}>
      <Text style={[styles.countText, textStyle]}>
        {unreadCount > 99 ? '99+' : unreadCount}
      </Text>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  // Badge principal
  container: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeDot: {
    minWidth: 10,
    width: 10,
    height: 10,
    borderRadius: 5,
    paddingHorizontal: 0,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.badgeText,
  },
  badgeTextSmall: {
    fontSize: 9,
  },

  // Header button
  headerButton: {
    marginRight: 8,
  },

  // Tab bar
  tabIconContainer: {
    position: 'relative',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.badgeText,
  },

  // Point indicateur
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
  },

  // Compteur inline
  countContainer: {
    backgroundColor: COLORS.badge,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.badgeText,
  },
});

// =============================================================================
// EXPORTS
// =============================================================================

export default NotificationBadge;