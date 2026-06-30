import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert as AppAlert } from '@/components/ui/Alert';
import { useTranslation } from 'react-i18next';

// Services & Types
import { categoryService } from '@/services/categoryService';
import { MenuCategory } from '@/types/category';
import { useRestaurant } from '@/contexts/RestaurantContext';

// Design system
import {
  useAppTheme,
  type AppColors,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

type AppAlertVariant = 'success' | 'error' | 'warning' | 'info';
type LocalAlert = {
  id: string;
  variant: AppAlertVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
};

export default function ReorderCategoriesScreen() {
  // Restaurant peut venir d'un param de route OU du contexte
  const { restaurantId: paramRestaurantId } = useLocalSearchParams<{ restaurantId?: string }>();
  const { currentRestaurant: ctxRestaurant } = useRestaurant();
  const restaurantId = (paramRestaurantId as string) ?? (ctxRestaurant?.id ? String(ctxRestaurant.id) : null);

  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const { colors: COLORS } = useAppTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(COLORS, screenType, insets), [COLORS, screenType, insets]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const [alerts, setAlerts] = useState<LocalAlert[]>([]);
  const pushAlert = (variant: AppAlertVariant, title: string, message: string, onDismiss?: () => void) => {
    setAlerts(prev => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        variant,
        title,
        message,
        onDismiss,
      },
      ...prev,
    ]);
  };
  const dismissAlert = (alertId: string, callback?: () => void) => {
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    callback?.();
  };

  const loadCategories = useCallback(async () => {
    if (!restaurantId) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const res = await categoryService.getCategoriesByRestaurant(restaurantId);
      const list = (res.categories ?? [])
        .slice()
        .sort((a, b) => {
          if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
          return a.name.localeCompare(b.name);
        });
      setCategories(list);
      setHasChanges(false);
    } catch {
      pushAlert('error', t('common.error'), t('reorderCategories.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const moveUp = (index: number) => {
    if (index <= 0) return;
    setCategories(prev => {
      const next = prev.slice();
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
    setHasChanges(true);
  };

  const moveDown = (index: number) => {
    if (index >= categories.length - 1) return;
    setCategories(prev => {
      const next = prev.slice();
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    if (!hasChanges) {
      router.back();
      return;
    }
    try {
      setIsSaving(true);
      // On réindexe à partir de 1 pour avoir un ordre déterministe
      const payload = {
        restaurant_id: restaurantId,
        categories: categories.map((cat, idx) => ({
          id: cat.id,
          order: idx + 1,
        })),
      };
      await categoryService.reorderCategories(payload);
      pushAlert(
        'success',
        t('reorderCategories.savedTitle'),
        t('reorderCategories.savedMsg'),
        () => router.back()
      );
    } catch {
      pushAlert('error', t('common.error'), t('reorderCategories.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!restaurantId) {
    return (
      <View style={styles.container}>
        <Header title={t('reorderCategories.headerTitle')} showBackButton />
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.text.light} />
          <Text style={styles.emptyText}>
            {t('reorderCategories.noRestaurant')}
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header title={t('reorderCategories.headerTitle')} showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.variants.secondary[500]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title={t('reorderCategories.headerTitle')} showBackButton />

      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map(a => (
            <AppAlert
              key={a.id}
              variant={a.variant}
              title={a.title}
              message={a.message}
              onDismiss={() => dismissAlert(a.id, a.onDismiss)}
              autoDismiss
            />
          ))}
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <Card variant="premium" style={styles.introCard}>
          <View style={styles.introRow}>
            <Ionicons name="information-circle" size={20} color={COLORS.text.golden} />
            <Text style={styles.introText}>
              {t('reorderCategories.intro')}
            </Text>
          </View>
        </Card>

        {categories.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={48} color={COLORS.text.light} />
            <Text style={styles.emptyText}>
              {t('reorderCategories.empty')}
            </Text>
          </View>
        ) : (
          <Card variant="surface" style={styles.listCard}>
            {categories.map((cat, index) => {
              const isFirst = index === 0;
              const isLast = index === categories.length - 1;
              return (
                <View key={cat.id} style={styles.row}>
                  <View style={styles.rowLeft}>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderBadgeText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.categoryIcon}>
                      {cat.icon || '🍽️'}
                    </Text>
                    <View style={styles.rowInfo}>
                      <Text style={styles.categoryName}>{cat.name}</Text>
                      {!!cat.total_menu_items_count && (
                        <Text style={styles.categoryMeta}>
                          {t('reorderCategories.dishCount', { count: cat.total_menu_items_count })}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={() => moveUp(index)}
                      disabled={isFirst}
                      style={[styles.arrowButton, isFirst && styles.arrowButtonDisabled]}
                      hitSlop={4}
                      accessibilityLabel={t('reorderCategories.moveUp', { name: cat.name })}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={20}
                        color={isFirst ? COLORS.text.light : COLORS.variants.secondary[600]}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => moveDown(index)}
                      disabled={isLast}
                      style={[styles.arrowButton, isLast && styles.arrowButtonDisabled]}
                      hitSlop={4}
                      accessibilityLabel={t('reorderCategories.moveDown', { name: cat.name })}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={20}
                        color={isLast ? COLORS.text.light : COLORS.variants.secondary[600]}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSaving ? t('reorderCategories.saving') : t('reorderCategories.save')}
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving || categories.length === 0}
          variant="primary"
          fullWidth
          leftIcon={<Ionicons name="save" size={20} color={COLORS.surface} />}
        />
      </View>
    </View>
  );
}

const createStyles = (COLORS: AppColors, screenType: 'mobile' | 'tablet' | 'desktop', insets: any) => {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertsContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingTop: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    scrollView: { flex: 1 },
    scrollContent: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: 100,
    },
    introCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    introRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    introText: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.primary,
      lineHeight: 18,
    },
    listCard: {
      padding: 0,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    rowLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    orderBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: COLORS.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    orderBadgeText: {
      fontSize: 13,
      fontWeight: '700',
      color: COLORS.variants.secondary[700],
    },
    categoryIcon: {
      fontSize: 20,
    },
    rowInfo: {
      flex: 1,
    },
    categoryName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    categoryMeta: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      marginTop: 2,
    },
    rowActions: {
      flexDirection: 'row',
      gap: 6,
    },
    arrowButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: COLORS.variants.secondary[50],
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrowButtonDisabled: {
      backgroundColor: COLORS.background,
      opacity: 0.4,
    },
    empty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
    },
    footer: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: Math.max(insets?.bottom ?? 0, 16),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
  });
};