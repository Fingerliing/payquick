import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  type AppColors,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';
import { StarRating } from '@/components/restaurant/StarRating';
import {
  restaurantDirectoryService,
  type RestaurantReview,
} from '@/services/restaurantDirectoryService';

type ModeratedReview = RestaurantReview & { is_visible: boolean };

const makeColors = (c: AppColors, isDark: boolean) => ({
  primary: c.primary,
  cardBg: c.surface,
  mutedBg: isDark ? c.variants.primary[100] : c.background,
  text: c.text.primary,
  textSecondary: c.text.secondary,
  textMuted: c.text.light,
  border: c.border.light,
  success: c.success,
  error: c.error,
  warning: c.warning,
});
type ModColors = ReturnType<typeof makeColors>;
type ScreenType = ReturnType<typeof useScreenType>;

interface Props {
  restaurantId: string | number;
}

export const RestaurantReviewsModeration: React.FC<Props> = ({ restaurantId }) => {
  const { colors: C, isDark } = useAppTheme();
  const { t } = useTranslation();
  const screenType = useScreenType();
  const colors = useMemo(() => makeColors(C, isDark), [C, isDark]);
  const styles = useMemo(() => createStyles(colors, screenType), [colors, screenType]);

  const [reviews, setReviews] = useState<ModeratedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await restaurantDirectoryService.getModerationReviews(restaurantId);
      setReviews(res.results || []);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403) {
        setError(t('reviews.moderation.notAuthorized'));
      } else {
        setError(t('reviews.moderation.loadError'));
      }
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleVisibility = useCallback(async (review: ModeratedReview) => {
    setBusyId(review.id);
    try {
      const res = review.is_visible
        ? await restaurantDirectoryService.hideReview(review.id)
        : await restaurantDirectoryService.unhideReview(review.id);
      setReviews((prev) =>
        prev.map((r) => (r.id === review.id ? { ...r, is_visible: res.is_visible } : r))
      );
    } catch {
      // En cas d'échec, on recharge pour rester cohérent avec le backend.
      load();
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const stats = useMemo(() => {
    const visible = reviews.filter((r) => r.is_visible).length;
    return { total: reviews.length, visible, hidden: reviews.length - visible };
  }, [reviews]);

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.noticeCard}>
        <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
        <Text style={styles.noticeText}>{error}</Text>
      </View>
    );
  }

  if (reviews.length === 0) {
    return (
      <View style={styles.noticeCard}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.textMuted} />
        <Text style={styles.noticeText}>{t('reviews.moderation.empty')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.statsLine}>
        {[
          t('restaurant.reviews', { count: stats.total }),
          t('reviews.moderation.statsVisible', { count: stats.visible }),
          ...(stats.hidden > 0
            ? [t('reviews.moderation.statsHidden', { count: stats.hidden })]
            : []),
        ].join(' · ')}
      </Text>

      {reviews.map((r) => (
        <View
          key={r.id}
          style={[styles.item, !r.is_visible && styles.itemHidden]}
        >
          <View style={styles.itemHeader}>
            <Text style={styles.author}>{r.client_name}</Text>
            {r.is_verified_purchase ? (
              <View style={styles.badge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                <Text style={styles.badgeText}>{t('reviews.verified')}</Text>
              </View>
            ) : null}
          </View>

          <StarRating value={r.rating} size={14} />
          {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}

          <TouchableOpacity
            style={[styles.actionBtn, r.is_visible ? styles.hideBtn : styles.showBtn]}
            onPress={() => toggleVisibility(r)}
            disabled={busyId === r.id}
            activeOpacity={0.85}
          >
            {busyId === r.id ? (
              <ActivityIndicator size="small" color={r.is_visible ? colors.error : colors.success} />
            ) : (
              <>
                <Ionicons
                  name={r.is_visible ? 'eye-off-outline' : 'eye-outline'}
                  size={15}
                  color={r.is_visible ? colors.error : colors.success}
                />
                <Text
                  style={[
                    styles.actionText,
                    { color: r.is_visible ? colors.error : colors.success },
                  ]}
                >
                  {r.is_visible ? t('reviews.moderation.hide') : t('reviews.moderation.show')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

function createStyles(colors: ModColors, screenType: ScreenType) {
  const s = {
    xs: getResponsiveValue(SPACING.xs, screenType),
    sm: getResponsiveValue(SPACING.sm, screenType),
    md: getResponsiveValue(SPACING.md, screenType),
  };

  return StyleSheet.create({
    container: { gap: s.md },
    loadingBox: { paddingVertical: s.md, alignItems: 'center' },

    statsLine: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },

    item: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: BORDER_RADIUS.md,
      padding: s.md,
      gap: s.xs,
      backgroundColor: colors.cardBg,
    },
    itemHidden: { backgroundColor: colors.mutedBg, opacity: 0.75 },

    itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    author: { fontWeight: '700', color: colors.text, fontSize: 14 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    badgeText: { color: colors.success, fontSize: 11, fontWeight: '600' },
    comment: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },

    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: s.xs,
      paddingHorizontal: s.sm,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      marginTop: s.xs,
    },
    hideBtn: { borderColor: colors.error },
    showBtn: { borderColor: colors.success },
    actionText: { fontSize: 13, fontWeight: '600' },

    noticeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: s.sm,
      backgroundColor: colors.cardBg,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: s.md,
    },
    noticeText: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  });
}

export default RestaurantReviewsModeration;