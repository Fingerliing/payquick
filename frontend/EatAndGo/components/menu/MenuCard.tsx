import React, { useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Menu } from '@/types/menu';
import {
  useAppTheme,
  makeShadows,
  makeComponentStyles,
  useScreenType,
  getResponsiveValue,
  SPACING,
  TYPOGRAPHY,
  BORDER_RADIUS,
  type AppColors,
} from '@/utils/designSystem';

interface MenuCardProps {
  menu: Menu;
  onPress: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isToggling?: boolean;
}

export function MenuCard({
  menu,
  onPress,
  onEdit,
  onToggle,
  onDelete,
  isToggling = false,
}: MenuCardProps) {
  const { t, i18n } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const screenType = useScreenType();
  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType),
    [colors, isDark, screenType],
  );
  const componentStyles = useMemo(() => makeComponentStyles(colors), [colors]);
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ── Helpers ──────────────────────────────────────────────────────────
  const isMenuAvailable = (): boolean => {
    if (typeof menu.is_available === 'boolean') return menu.is_available;
    if (typeof (menu as any).disponible === 'boolean') return (menu as any).disponible;
    return false;
  };

  const menuIsAvailable = isMenuAvailable();
  const totalItems = menu.items?.length || 0;
  const availableItemsCount =
    menu.items?.filter((item) => item.is_available !== false).length || 0;

  // Plurielisation CLDR via i18next
  const itemsLabel = t('restaurantMenus.card.items', { count: totalItems });
  const availableLabel = t('restaurantMenus.card.available', {
    count: availableItemsCount,
  });

  // Formatage des dates dans la locale active
  const dateFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }, [i18n.language]);

  const formatDate = (rawDate: string | Date): string => {
    try {
      const d = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
      return dateFormatter ? dateFormatter.format(d) : d.toLocaleDateString();
    } catch {
      return String(rawDate);
    }
  };

  // ── Animations ───────────────────────────────────────────────────────
  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.outerWrapper,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isToggling}
        activeOpacity={0.9}
        style={[
          styles.card,
          { opacity: isToggling ? 0.7 : 1 },
        ]}
      >
        {/* Barre supérieure : accent doré si actif */}
        {menuIsAvailable && (
          <View style={styles.activeAccentBar} />
        )}

        <View style={styles.content}>
          {/* En-tête : titre + nb items + badge statut */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text
                style={[
                  styles.title,
                  {
                    color: menuIsAvailable
                      ? colors.text.primary
                      : colors.text.secondary,
                  },
                ]}
              >
                {menu.name}
              </Text>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons
                    name="restaurant"
                    size={14}
                    color={colors.text.golden}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.metaText}>{itemsLabel}</Text>
                </View>

                <Text style={styles.metaSeparator}>•</Text>

                <Text style={styles.metaText}>{availableLabel}</Text>
              </View>
            </View>

            {/* Badge statut — réutilise le statusBadge du designSystem */}
            <View
              style={[
                componentStyles.statusBadge.base,
                menuIsAvailable
                  ? componentStyles.statusBadge.premium
                  : componentStyles.statusBadge.cancelled,
                styles.statusBadgeExtraPadding,
              ]}
            >
              <View style={styles.statusBadgeInner}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: menuIsAvailable
                        ? colors.secondary
                        : colors.error,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: menuIsAvailable
                        ? colors.text.golden
                        : colors.error,
                    },
                  ]}
                >
                  {menuIsAvailable
                    ? t('restaurantMenus.card.active')
                    : t('restaurantMenus.card.inactive')}
                </Text>
              </View>
            </View>
          </View>

          {/* Bandeau "Mise à jour en cours" */}
          {isToggling && (
            <View style={styles.updatingBanner}>
              <Ionicons
                name="hourglass-outline"
                size={14}
                color={colors.text.golden}
              />
              <Text style={styles.updatingText}>
                {t('restaurantMenus.card.updating')}
              </Text>
            </View>
          )}

          {/* Métadonnées : créé le / modifié le */}
          <View style={styles.datesBox}>
            <View style={styles.datesRow}>
              <View style={styles.dateColumn}>
                <View style={styles.dateLabelRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={12}
                    color={colors.text.light}
                  />
                  <Text style={styles.dateLabel}>
                    {t('restaurantMenus.card.createdOn')}
                  </Text>
                </View>
                <Text style={styles.dateValue}>{formatDate(menu.created_at)}</Text>
              </View>

              <View style={styles.dateColumnDivider} />

              <View style={styles.dateColumn}>
                <View style={styles.dateLabelRow}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={colors.text.light}
                  />
                  <Text style={styles.dateLabel}>
                    {t('restaurantMenus.card.updatedOn')}
                  </Text>
                </View>
                <Text style={styles.dateValue}>{formatDate(menu.updated_at)}</Text>
              </View>
            </View>
          </View>

          {/* Séparateur */}
          <View style={styles.separator} />

          {/* Actions */}
          <View style={styles.actionsRow}>
            {/* Éditer */}
            <TouchableOpacity
              onPress={onEdit}
              disabled={isToggling}
              activeOpacity={0.8}
              style={[
                styles.actionBtnEdit,
                { opacity: isToggling ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="create-outline" size={16} color={colors.primary} />
              <Text style={styles.actionBtnEditText}>{t('common.edit')}</Text>
            </TouchableOpacity>

            {/* Toggle (activer/désactiver) */}
            <TouchableOpacity
              onPress={onToggle}
              disabled={isToggling}
              activeOpacity={0.8}
              style={[
                styles.actionBtnToggle,
                {
                  backgroundColor: menuIsAvailable
                    ? colors.error
                    : colors.secondary,
                  opacity: isToggling ? 0.5 : 1,
                  // glow doré quand on est sur "Activer"
                  ...(menuIsAvailable ? {} : shadows.goldenGlow),
                },
              ]}
            >
              <Ionicons
                name={
                  isToggling
                    ? 'hourglass-outline'
                    : menuIsAvailable
                      ? 'pause-circle-outline'
                      : 'play-circle-outline'
                }
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.actionBtnToggleText}>
                {isToggling
                  ? t('restaurantMenus.card.inProgress')
                  : menuIsAvailable
                    ? t('restaurantMenus.card.disable')
                    : t('restaurantMenus.card.enable')}
              </Text>
            </TouchableOpacity>

            {/* Supprimer (icon-only) */}
            <TouchableOpacity
              onPress={onDelete}
              disabled={isToggling}
              activeOpacity={0.8}
              style={[
                styles.actionBtnDelete,
                { opacity: isToggling ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// STYLES (fabrique theme-aware)
// ──────────────────────────────────────────────────────────────────────────
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ReturnType<typeof useScreenType>,
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    outerWrapper: {
      marginHorizontal: getResponsiveValue(SPACING.lg, screenType),
      marginVertical: 8,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      overflow: 'hidden',
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.card,
    },

    // Accent doré visuel pour les menus actifs — identité gold stable
    activeAccentBar: {
      height: 3,
      backgroundColor: colors.secondary,
      ...shadows.goldenGlow,
    },

    content: {
      padding: 16,
    },

    // ── Header ─────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    headerLeft: {
      flex: 1,
      marginRight: 12,
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      marginBottom: 4,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metaText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
    },
    metaSeparator: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.light,
    },

    // ── Status badge ───────────────────────────────────────────────────
    statusBadgeExtraPadding: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    statusBadgeInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 12,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    // ── Updating banner ────────────────────────────────────────────────
    updatingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.10)'
        : colors.variants.secondary[50],
      borderLeftWidth: 3,
      borderLeftColor: colors.secondary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 12,
      gap: 6,
    },
    updatingText: {
      fontSize: 12,
      color: colors.text.golden,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },

    // ── Dates ──────────────────────────────────────────────────────────
    datesBox: {
      backgroundColor: colors.background,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      marginBottom: 12,
    },
    datesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
    },
    dateColumn: {
      flex: 1,
    },
    dateColumnDivider: {
      width: 1,
      backgroundColor: colors.border.default,
    },
    dateLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      gap: 4,
    },
    dateLabel: {
      fontSize: 10,
      color: colors.text.light,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      textTransform: 'uppercase',
    },
    dateValue: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },

    // ── Separator ──────────────────────────────────────────────────────
    separator: {
      height: 1,
      backgroundColor: colors.border.light,
      marginBottom: 12,
    },

    // ── Actions ────────────────────────────────────────────────────────
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    actionBtnEdit: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark
        ? 'rgba(30, 42, 120, 0.18)'
        : colors.variants.primary[50],
      borderWidth: 1,
      borderColor: isDark
        ? 'rgba(30, 42, 120, 0.45)'
        : colors.variants.primary[200],
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.lg,
      gap: 6,
    },
    actionBtnEditText: {
      fontSize: 14,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.primary,
    },
    actionBtnToggle: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.lg,
      gap: 6,
    },
    actionBtnToggleText: {
      fontSize: 14,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      // Texte blanc stable sur fonds saturés (rouge ou or)
      color: '#FFFFFF',
    },
    actionBtnDelete: {
      backgroundColor: isDark
        ? 'rgba(239, 68, 68, 0.10)'
        : colors.variants.primary[50],
      borderWidth: 1,
      borderColor: colors.error,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
};