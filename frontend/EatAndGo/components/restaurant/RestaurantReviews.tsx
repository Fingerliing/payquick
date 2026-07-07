import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
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
  type ReviewEligibility,
} from '@/services/restaurantDirectoryService';

// =============================================================================
// Couleurs (theme-aware)
// =============================================================================
const makeColors = (c: AppColors, isDark: boolean) => ({
  primary: c.primary,
  gold: '#D4AF37',
  background: c.background,
  cardBg: c.surface,
  text: c.text.primary,
  textSecondary: c.text.secondary,
  textMuted: c.text.light,
  border: c.border.light,
  inputBg: isDark ? c.variants.primary[100] : c.surface,
  success: c.success,
  error: c.error,
});
type ReviewColors = ReturnType<typeof makeColors>;
type ScreenType = ReturnType<typeof useScreenType>;

interface RestaurantReviewsProps {
  restaurantId: string | number;
  /** Callback optionnel après dépôt d'un avis (ex. rafraîchir la note du header). */
  onSubmitted?: (review: RestaurantReview) => void;
}

export const RestaurantReviews: React.FC<RestaurantReviewsProps> = ({
  restaurantId,
  onSubmitted,
}) => {
  const { colors: C, isDark } = useAppTheme();
  const { t } = useTranslation();
  const screenType = useScreenType();
  const colors = useMemo(() => makeColors(C, isDark), [C, isDark]);
  const styles = useMemo(() => createStyles(colors, screenType), [colors, screenType]);

  const [reviews, setReviews] = useState<RestaurantReview[]>([]);
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await restaurantDirectoryService.getReviews(restaurantId);
      setReviews(list);
    } catch {
      setReviews([]);
    }
    // L'éligibilité nécessite un client authentifié : un 401/erreur = non éligible.
    try {
      const elig = await restaurantDirectoryService.getReviewEligibility(restaurantId);
      setEligibility(elig);
    } catch {
      setEligibility(null);
    }
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  const average = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return sum / reviews.length;
  }, [reviews]);

  const submit = useCallback(async () => {
    setFormError(null);
    if (rating < 1) {
      setFormError(t('reviews.selectRating'));
      return;
    }
    setSubmitting(true);
    try {
      const created = await restaurantDirectoryService.submitReview({
        restaurant: restaurantId,
        rating,
        comment: comment.trim() || undefined,
      });
      setReviews((prev) => [created, ...prev]);
      setEligibility((prev) => (prev ? { ...prev, already_reviewed: true, can_review: false } : prev));
      setRating(0);
      setComment('');
      onSubmitted?.(created);
    } catch (e: any) {
      // Message backend générique si dispo, sinon repli.
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.non_field_errors?.[0] ||
        e?.message ||
        t('reviews.submitError');
      setFormError(String(msg));
    } finally {
      setSubmitting(false);
    }
  }, [rating, comment, restaurantId, onSubmitted]);

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Résumé */}
      <View style={styles.summary}>
        <Text style={styles.avgNumber}>{average > 0 ? average.toFixed(1) : '—'}</Text>
        <View>
          <StarRating value={average} size={18} />
          <Text style={styles.summaryCount}>
            {t('restaurant.reviews', { count: reviews.length })}
          </Text>
        </View>
      </View>

      {/* Formulaire conditionnel / message d'état */}
      {eligibility?.can_review ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{t('reviews.yourReview')}</Text>
          <View style={styles.verifiedRow}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.verifiedText}>{t('reviews.verifiedPurchase')}</Text>
          </View>

          <StarRating value={rating} onChange={setRating} size={30} allowHalf={false} />

          <TextInput
            style={styles.input}
            placeholder={t('reviews.commentPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={2000}
          />

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitText}>{t('reviews.publish')}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : eligibility?.already_reviewed ? (
        <View style={styles.noticeCard}>
          <Ionicons name="checkmark-done" size={16} color={colors.success} />
          <Text style={styles.noticeText}>{t('reviews.alreadyReviewed')}</Text>
        </View>
      ) : eligibility && !eligibility.has_ordered ? (
        <View style={styles.noticeCard}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noticeText}>{t('reviews.onlyCustomers')}</Text>
        </View>
      ) : null}

      {/* Liste des avis */}
      {reviews.length === 0 ? (
        <Text style={styles.emptyText}>{t('reviews.empty')}</Text>
      ) : (
        <View style={styles.list}>
          {reviews.map((r) => (
            <View key={r.id} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewAuthor}>{r.client_name}</Text>
                {r.is_verified_purchase ? (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={styles.verifiedBadgeText}>{t('reviews.verified')}</Text>
                  </View>
                ) : null}
              </View>
              <StarRating value={r.rating} size={14} />
              {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// =============================================================================
// Styles
// =============================================================================
function createStyles(colors: ReviewColors, screenType: ScreenType) {
  // SPACING.* est responsive ({ mobile, tablet, desktop }) → résolu ici.
  // BORDER_RADIUS.* est déjà une valeur plate.
  const s = {
    xs: getResponsiveValue(SPACING.xs, screenType),
    sm: getResponsiveValue(SPACING.sm, screenType),
    md: getResponsiveValue(SPACING.md, screenType),
    lg: getResponsiveValue(SPACING.lg, screenType),
    xl: getResponsiveValue(SPACING.xl, screenType),
  };

  return StyleSheet.create({
    container: { gap: s.md },
    loadingBox: { paddingVertical: s.xl, alignItems: 'center' },

    summary: { flexDirection: 'row', alignItems: 'center', gap: s.md },
    avgNumber: { fontSize: 40, fontWeight: '800', color: colors.text, lineHeight: 44 },
    summaryCount: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },

    formCard: {
      backgroundColor: colors.cardBg,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: s.md,
      gap: s.sm,
    },
    formTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    verifiedText: { color: colors.success, fontSize: 12, fontWeight: '600' },
    input: {
      backgroundColor: colors.inputBg,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: s.md,
      minHeight: 80,
      textAlignVertical: 'top',
      color: colors.text,
      fontSize: 14,
    },
    errorText: { color: colors.error, fontSize: 13 },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: s.md,
      alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },

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

    emptyText: { color: colors.textMuted, fontSize: 14, fontStyle: 'italic' },

    list: { gap: s.md },
    reviewItem: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: s.md,
      gap: 4,
    },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reviewAuthor: { fontWeight: '700', color: colors.text, fontSize: 14 },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    verifiedBadgeText: { color: colors.success, fontSize: 11, fontWeight: '600' },
    reviewComment: { color: colors.textSecondary, fontSize: 14, marginTop: 2, lineHeight: 20 },
  });
}

export default RestaurantReviews;