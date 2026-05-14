import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dailyMenuService, DailyMenu, DailyMenuItem } from '@/services/dailyMenuService';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';
import { useResponsive } from '@/utils/responsive';
import { Alert as AppAlert, AlertWithAction } from '@/components/ui/Alert';

interface Props {
  restaurantId: string;
  selectedDate?: Date;
  /**
   * Compteur de rafraîchissement. Incrémenté par le parent (par exemple sur
   * useFocusEffect au retour de l'écran d'édition) pour forcer un rechargement
   * du menu du jour sans changer de date.
   */
  refreshKey?: number;
  onNavigateToCreate: (selectedDate: Date) => void;
  onNavigateToEdit: (menuId: string) => void;
  onMenuUpdated?: () => void;
}

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

type ToastState = {
  variant: ToastVariant;
  title?: string;
  message: string;
} | null;

type ConfirmState = {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
} | null;

// Nombre de jours proposés dans la modale (à partir du lendemain de la date sélectionnée)
const APPLY_RANGE_DAYS = 14;

export const DailyMenuManager: React.FC<Props> = ({
  restaurantId,
  selectedDate = new Date(),
  refreshKey = 0,
  onNavigateToCreate,
  onNavigateToEdit,
  onMenuUpdated,
}) => {
  const [dailyMenu, setDailyMenu] = useState<DailyMenu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTogglingItem, setIsTogglingItem] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // ─── États pour la modale "Appliquer à d'autres jours" ─────────────────────
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyCandidates, setApplyCandidates] = useState<Date[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [existingByDate, setExistingByDate] = useState<Record<string, string>>({});
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // ─── Alertes custom (toast + confirm) ──────────────────────────────────────
  const [toast, setToast] = useState<ToastState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const screenType = useScreenType();
  const responsive = useResponsive();
  const styles = createStyles(screenType, responsive);

  useEffect(() => {
    loadDailyMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, selectedDate?.toISOString?.(), refreshKey]);

  const loadDailyMenu = async () => {
    try {
      setIsLoading(true);
      const dateString = format(selectedDate, 'yyyy-MM-dd');
      const menu = await dailyMenuService.getMenuByDate(Number(restaurantId), dateString);
      setDailyMenu(menu);

      if (responsive.isDesktop && menu?.items_by_category) {
        setExpandedCategories(new Set(menu.items_by_category.map((cat: any) => cat.name)));
      }
    } catch (error) {
      setDailyMenu(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDailyMenu();
    setIsRefreshing(false);
  };

  const toggleItemAvailability = async (itemId: string) => {
    if (!dailyMenu || isTogglingItem) return;

    setIsTogglingItem(itemId);
    try {
      await dailyMenuService.quickToggleItem(dailyMenu.id, itemId);
      await loadDailyMenu();
      onMenuUpdated?.();
    } catch (error) {
      setToast({
        variant: 'error',
        title: 'Erreur',
        message: "Impossible de modifier la disponibilité du plat",
      });
    } finally {
      setIsTogglingItem(null);
    }
  };

  const toggleCategory = (categoryName: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryName)) {
      newExpanded.delete(categoryName);
    } else {
      newExpanded.add(categoryName);
    }
    setExpandedCategories(newExpanded);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Appliquer le menu du jour courant à d'autres jours
  // ──────────────────────────────────────────────────────────────────────────

  const openApplyToOtherDays = async () => {
    if (!dailyMenu) return;

    // Génère les `APPLY_RANGE_DAYS` jours suivants à partir du lendemain de
    // la date du menu source.
    const start = addDays(selectedDate, 1);
    const dates: Date[] = [];
    for (let i = 0; i < APPLY_RANGE_DAYS; i++) {
      dates.push(addDays(start, i));
    }
    setApplyCandidates(dates);
    setSelectedTargets(new Set());
    setExistingByDate({});
    setShowApplyModal(true);
    setIsLoadingCandidates(true);

    // Précharge les menus existants sur la plage pour afficher un badge
    // "Menu existant" et avertir l'utilisateur avant remplacement.
    try {
      const startDate = format(dates[0], 'yyyy-MM-dd');
      const endDate = format(dates[dates.length - 1], 'yyyy-MM-dd');
      const existing = await dailyMenuService.getMenusByDateRange(
        Number(restaurantId),
        startDate,
        endDate,
      );
      const map: Record<string, string> = {};
      (existing || []).forEach((m: any) => {
        // L'API renvoie la date au format 'yyyy-MM-dd'
        if (m?.date) map[m.date] = m.id;
      });
      setExistingByDate(map);
    } catch {
      // En cas d'échec on continue : l'utilisateur sera juste prévenu via le
      // 409 au moment d'appliquer.
      setExistingByDate({});
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const toggleTargetDate = (dateKey: string) => {
    setSelectedTargets(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const selectAllCandidates = () => {
    setSelectedTargets(new Set(applyCandidates.map(d => format(d, 'yyyy-MM-dd'))));
  };

  const clearSelection = () => {
    setSelectedTargets(new Set());
  };

  const confirmApplyToDates = () => {
    if (!dailyMenu || selectedTargets.size === 0) return;

    const conflicts = Array.from(selectedTargets).filter(d => !!existingByDate[d]);

    if (conflicts.length > 0) {
      setConfirm({
        title: 'Remplacer les menus existants ?',
        message:
          conflicts.length === 1
            ? `Un menu du jour existe déjà pour 1 des dates sélectionnées. Voulez-vous le remplacer ?`
            : `Un menu du jour existe déjà pour ${conflicts.length} des dates sélectionnées. Voulez-vous les remplacer ?`,
        onConfirm: () => doApplyToDates(true),
        confirmText: 'Remplacer',
        cancelText: 'Annuler',
        danger: true,
      });
      return;
    }

    doApplyToDates(false);
  };

  const doApplyToDates = async (force: boolean) => {
    if (!dailyMenu) return;
    setConfirm(null);
    setIsApplying(true);

    try {
      const targets = Array.from(selectedTargets);
      const results = await Promise.allSettled(
        targets.map(dateKey =>
          dailyMenuService.duplicateMenu(dailyMenu.id, dateKey, force),
        ),
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      setShowApplyModal(false);
      setSelectedTargets(new Set());

      if (failed === 0) {
        setToast({
          variant: 'success',
          title: 'Succès',
          message:
            succeeded === 1
              ? 'Menu appliqué à 1 jour'
              : `Menu appliqué à ${succeeded} jours`,
        });
      } else if (succeeded === 0) {
        setToast({
          variant: 'error',
          title: 'Échec',
          message: "Impossible d'appliquer le menu aux dates sélectionnées",
        });
      } else {
        setToast({
          variant: 'warning',
          title: 'Application partielle',
          message: `${succeeded} réussi${succeeded > 1 ? 's' : ''}, ${failed} échoué${failed > 1 ? 's' : ''}`,
        });
      }

      onMenuUpdated?.();
    } catch {
      setToast({
        variant: 'error',
        title: 'Erreur',
        message: "Une erreur est survenue lors de l'application du menu",
      });
    } finally {
      setIsApplying(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Rendu des items
  // ──────────────────────────────────────────────────────────────────────────

  const renderMenuItem = ({ item }: { item: DailyMenuItem }) => (
    <View style={styles.itemRow} collapsable={false}>
      <View style={styles.itemLeft}>
        <Switch
          value={item.is_available}
          onValueChange={() => toggleItemAvailability(item.id)}
          disabled={isTogglingItem === item.id}
          trackColor={{ false: COLORS.border.default, true: COLORS.variants.secondary[400] }}
          thumbColor={item.is_available ? COLORS.variants.secondary[500] : COLORS.text.light}
          ios_backgroundColor={COLORS.border.default}
        />
      </View>

      <View style={styles.itemInfo}>
        <Text style={[styles.itemName, !item.is_available && styles.itemDisabled]}>
          {item.menu_item_name}
        </Text>
        {!!item.special_note && (
          <Text style={styles.specialNote}>
            <Ionicons name="information-circle" size={12} color={COLORS.text.secondary} />{' '}
            {item.special_note}
          </Text>
        )}
      </View>

      {/* ⚠️ Plus de prix par plat : la formule fixe le prix global du menu. */}

      {isTogglingItem === item.id && (
        <ActivityIndicator size="small" color={COLORS.variants.secondary[500]} style={styles.loader} />
      )}
    </View>
  );

  const renderCategorySection = (category: any, categoryIndex: number) => {
    const isExpanded = expandedCategories.has(category.name);
    const itemCount = category.items.length;
    const availableCount = category.items.filter((i: DailyMenuItem) => i.is_available).length;

    return (
      <View key={`section::${categoryIndex}::${category.name}`} style={styles.categorySection} collapsable={false}>
        <TouchableOpacity style={styles.categoryHeader} onPress={() => toggleCategory(category.name)} activeOpacity={0.7}>
          <View style={styles.categoryTitleContainer}>
            <Text style={styles.categoryTitle}>{category.name}</Text>
            {itemCount > 0 && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{availableCount}/{itemCount}</Text>
              </View>
            )}
          </View>
          <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.text.secondary} />
        </TouchableOpacity>

        {isExpanded && (
          <FlatList
            data={category.items}
            renderItem={renderMenuItem}
            keyExtractor={(item, index) => `${category.name}::${item.id}::${index}`}
            scrollEnabled={false}
            removeClippedSubviews={false}
            contentContainerStyle={styles.categoryItems}
          />
        )}
      </View>
    );
  };

  const renderEmptyState = () => {
    const isDateToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

    return (
      <View style={styles.noMenuContainer}>
        <View style={styles.emptyStateContent}>
          <Ionicons name="restaurant-outline" size={48} color={COLORS.text.secondary} />
          <Text style={styles.noMenuTitle}>Aucun menu pour cette date</Text>
          <Text style={styles.noMenuSubtitle}>
            {isDateToday
              ? "Créez le menu du jour pour commencer"
              : `Créez un menu pour le ${format(selectedDate, 'dd MMMM yyyy', { locale: fr })}`}
          </Text>
          <TouchableOpacity style={styles.createButton} onPress={() => onNavigateToCreate(selectedDate)}>
            <View style={styles.createButtonContent}>
              <Ionicons name="add-circle" size={20} color={COLORS.surface} />
              <Text style={styles.createButtonText}>Créer le menu</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Rendu de la modale "Appliquer à d'autres jours"
  // ──────────────────────────────────────────────────────────────────────────

  const renderApplyModal = () => {
    const allSelected =
      applyCandidates.length > 0 &&
      applyCandidates.every(d => selectedTargets.has(format(d, 'yyyy-MM-dd')));

    return (
      <Modal
        visible={showApplyModal}
        transparent
        animationType="fade"
        onRequestClose={() => !isApplying && setShowApplyModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !isApplying && setShowApplyModal(false)}
        >
          <Pressable style={styles.applyModal} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.applyModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.applyModalTitle}>Appliquer à d'autres jours</Text>
                <Text style={styles.applyModalSubtitle}>
                  Source : {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !isApplying && setShowApplyModal(false)}
                disabled={isApplying}
                style={styles.applyModalClose}
              >
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>

            {/* Barre d'actions rapides */}
            <View style={styles.applyQuickActions}>
              <TouchableOpacity
                onPress={allSelected ? clearSelection : selectAllCandidates}
                disabled={isLoadingCandidates || isApplying}
              >
                <Text style={styles.applyQuickActionText}>
                  {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.applySelectionCount}>
                {selectedTargets.size} sélectionné{selectedTargets.size > 1 ? 's' : ''}
              </Text>
            </View>

            {/* Liste des dates candidates */}
            {isLoadingCandidates ? (
              <View style={styles.applyLoading}>
                <ActivityIndicator size="small" color={COLORS.variants.secondary[500]} />
              </View>
            ) : (
              <ScrollView
                style={styles.applyList}
                contentContainerStyle={{ paddingBottom: getResponsiveValue(SPACING.sm, screenType) }}
                showsVerticalScrollIndicator={false}
              >
                {applyCandidates.map(date => {
                  const key = format(date, 'yyyy-MM-dd');
                  const isSelected = selectedTargets.has(key);
                  const hasMenu = !!existingByDate[key];

                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.applyDateRow, isSelected && styles.applyDateRowSelected]}
                      onPress={() => toggleTargetDate(key)}
                      activeOpacity={0.7}
                      disabled={isApplying}
                    >
                      <View
                        style={[
                          styles.applyCheckbox,
                          isSelected && styles.applyCheckboxSelected,
                        ]}
                      >
                        {isSelected && (
                          <Ionicons name="checkmark" size={16} color={COLORS.surface} />
                        )}
                      </View>

                      <View style={styles.applyDateInfo}>
                        <Text style={styles.applyDateLabel}>
                          {format(date, 'EEEE d MMMM', { locale: fr })}
                        </Text>
                        {hasMenu && (
                          <View style={styles.applyConflictBadge}>
                            <Ionicons
                              name="alert-circle-outline"
                              size={12}
                              color={COLORS.warning}
                            />
                            <Text style={styles.applyConflictText}>Menu existant</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Footer */}
            <View style={styles.applyFooter}>
              <TouchableOpacity
                style={styles.applyCancelButton}
                onPress={() => setShowApplyModal(false)}
                disabled={isApplying}
              >
                <Text style={styles.applyCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.applyConfirmButton,
                  (selectedTargets.size === 0 || isApplying) &&
                    styles.applyConfirmButtonDisabled,
                ]}
                onPress={confirmApplyToDates}
                disabled={selectedTargets.size === 0 || isApplying}
              >
                {isApplying ? (
                  <ActivityIndicator size="small" color={COLORS.surface} />
                ) : (
                  <Text style={styles.applyConfirmText}>
                    Appliquer
                    {selectedTargets.size > 0 ? ` (${selectedTargets.size})` : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Rendu principal
  // ──────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.variants.secondary[500]} />
      </View>
    );
  }

  const totalItems =
    dailyMenu?.items_by_category?.reduce(
      (acc: number, cat: any) => acc + cat.items.length,
      0,
    ) || 0;
  const availableItems =
    dailyMenu?.items_by_category?.reduce(
      (acc: number, cat: any) =>
        acc + cat.items.filter((i: DailyMenuItem) => i.is_available).length,
      0,
    ) || 0;

  return (
    <View style={styles.container}>
      {!dailyMenu ? (
        <ScrollView
          style={styles.container}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        >
          {renderEmptyState()}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.container}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        >
          <View style={styles.header}>
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onNavigateToEdit(dailyMenu.id)}
              >
                <Ionicons name="create-outline" size={20} color={COLORS.text.primary} />
                <Text style={styles.actionButtonText}>Modifier</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={openApplyToOtherDays}>
                <Ionicons name="copy-outline" size={20} color={COLORS.text.primary} />
                <Text style={styles.actionButtonText}>Dupliquer</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.menuContent}>
            {dailyMenu.description && (
              <View style={styles.descriptionCard}>
                <Text style={styles.menuDescription}>{dailyMenu.description}</Text>
              </View>
            )}

            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Ionicons name="restaurant-outline" size={16} color={COLORS.text.secondary} />
                <Text style={styles.statsText}>{totalItems} plats</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                <Text style={styles.statsText}>{availableItems} disponibles</Text>
              </View>
              {!!dailyMenu.special_price && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Ionicons name="pricetag-outline" size={16} color={COLORS.text.golden} />
                    <Text
                      style={[
                        styles.statsText,
                        { color: COLORS.text.golden, fontWeight: TYPOGRAPHY.fontWeight.semibold },
                      ]}
                    >
                      {Number(dailyMenu.special_price).toFixed(2)}€ / formule
                    </Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.categoriesGrid}>
              {dailyMenu.items_by_category?.map((category: any, index: number) =>
                renderCategorySection(category, index),
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Modale "Appliquer à d'autres jours" */}
      {renderApplyModal()}

      {/* ─── Zone d'alertes custom ───────────────────────────────────────── */}
      {/* Toast (auto dismiss & swipe) */}
      {toast && (
        <View
          pointerEvents="box-none"
          style={styles.alertOverlay}
        >
          <AppAlert
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onDismiss={() => setToast(null)}
            autoDismiss
            autoDismissDuration={5000}
          />
        </View>
      )}

      {/* Confirmation (pas d'auto dismiss) */}
      {confirm && (
        <View
          pointerEvents="box-none"
          style={styles.alertOverlay}
        >
          <AlertWithAction
            variant={confirm.danger ? 'warning' : 'info'}
            title={confirm.title}
            message={confirm.message}
            onDismiss={() => setConfirm(null)}
            autoDismiss={false}
            primaryButton={{
              text: confirm.confirmText || 'Confirmer',
              onPress: () => confirm.onConfirm(),
              variant: confirm.danger ? 'danger' : 'primary',
            }}
            secondaryButton={{
              text: confirm.cancelText || 'Annuler',
              onPress: () => setConfirm(null),
            }}
          />
        </View>
      )}
    </View>
  );
};

const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', responsive: any) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: COLORS.background,
    },
    header: {
      backgroundColor: COLORS.surface,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      ...SHADOWS.sm,
    },
    actionsContainer: {
      flexDirection: 'row',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border.default,
    },
    actionButtonText: {
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
      color: COLORS.text.primary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },
    menuContent: {
      gap: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    descriptionCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderLeftWidth: 3,
      borderLeftColor: COLORS.primary,
    },
    menuDescription: {
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontStyle: 'italic',
    },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    statItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
    },
    statDivider: {
      width: 1,
      height: 20,
      backgroundColor: COLORS.border.light,
    },
    statsText: {
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    categoriesGrid: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    categorySection: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: COLORS.border.light,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    categoryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.goldenSurface,
    },
    categoryTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    categoryTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
    },
    categoryBadge: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.variants.secondary[200],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.full,
    },
    categoryBadgeText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.variants.secondary[700],
    },
    categoryItems: {
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    itemLeft: {
      width: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemInfo: {
      flex: 1,
      paddingRight: getResponsiveValue(SPACING.sm, screenType),
    },
    itemName: {
      color: COLORS.text.primary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },
    itemDisabled: {
      color: COLORS.text.secondary,
      textDecorationLine: 'line-through',
    },
    specialNote: {
      marginTop: 2,
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    priceContainer: {
      minWidth: 90,
      alignItems: 'flex-end',
      paddingRight: getResponsiveValue(SPACING.md, screenType),
    },
    itemPrice: {
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    discountContainer: {
      alignItems: 'flex-end',
    },
    originalPrice: {
      textDecorationLine: 'line-through',
      color: COLORS.text.secondary,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    specialPrice: {
      color: COLORS.success,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
    },
    discountBadge: {
      backgroundColor: COLORS.warning + '20',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 2,
    },
    discountText: {
      color: COLORS.warning,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    loader: {
      marginRight: getResponsiveValue(SPACING.md, screenType),
    },
    noMenuContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      margin: getResponsiveValue(SPACING.container, screenType),
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    emptyStateContent: {
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    noMenuTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },
    noMenuSubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
    },
    createButton: {
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
      backgroundColor: COLORS.primary,
      ...SHADOWS.button,
    },
    createButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.xs, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
    },
    createButtonText: {
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    },

    // ─── Modale "Appliquer à d'autres jours" ──────────────────────────────
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.lg, screenType),
    },
    applyModal: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      width: responsive.isMobile ? '100%' : '80%',
      maxWidth: 480,
      maxHeight: '85%',
      overflow: 'hidden',
      ...SHADOWS.xl,
    },
    applyModalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingTop: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    applyModalTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
    },
    applyModalSubtitle: {
      marginTop: 2,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      textTransform: 'capitalize',
    },
    applyModalClose: {
      padding: 4,
    },
    applyQuickActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    applyQuickActionText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.variants.secondary[700],
    },
    applySelectionCount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
    },
    applyLoading: {
      paddingVertical: getResponsiveValue(SPACING.xl, screenType),
      alignItems: 'center',
    },
    applyList: {
      flexGrow: 0,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
    },
    applyDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.md,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      borderWidth: 1,
      borderColor: 'transparent',
    },
    applyDateRowSelected: {
      backgroundColor: COLORS.variants.secondary[100],
      borderColor: COLORS.variants.secondary[300],
    },
    applyCheckbox: {
      width: 22,
      height: 22,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 2,
      borderColor: COLORS.border.default,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: COLORS.surface,
    },
    applyCheckboxSelected: {
      backgroundColor: COLORS.variants.secondary[500],
      borderColor: COLORS.variants.secondary[500],
    },
    applyDateInfo: {
      flex: 1,
    },
    applyDateLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.primary,
      textTransform: 'capitalize',
    },
    applyConflictBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 4,
    },
    applyConflictText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.warning,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },
    applyFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    applyCancelButton: {
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.md,
    },
    applyCancelText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    applyConfirmButton: {
      backgroundColor: COLORS.primary,
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.md,
      minWidth: 120,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyConfirmButtonDisabled: {
      opacity: 0.5,
    },
    applyConfirmText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.surface,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
    },

    // ─── Overlay alertes custom (toast + confirm) ─────────────────────────
    alertOverlay: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
    },
  });
};

export default DailyMenuManager;