import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  RefreshControl,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/ui/Header';
import { MenuCard } from '@/components/menu/MenuCard';
import { Button } from '@/components/ui/Button';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { RestaurantAutoSelector } from '@/components/restaurant/RestaurantAutoSelector';
import { menuService } from '@/services/menuService';
import { Menu } from '@/types/menu';
import { useResponsive } from '@/utils/responsive';
import {
  useAppTheme,
  makeShadows,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  ANIMATIONS,
  useScreenType,
  getResponsiveValue,
  type AppColors,
} from '@/utils/designSystem';
import { Alert, AlertWithAction } from '@/components/ui/Alert';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

/**
 * MenusScreen — gestion des menus avec design premium
 */
function MenusScreenContent({
  restaurant,
}: {
  restaurant: NonNullable<ReturnType<typeof useRestaurant>['currentRestaurant']>;
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { restaurants, loadRestaurant } = useRestaurant();

  const [showSwitcher, setShowSwitcher] = useState(false);

  // Duplication depuis un autre restaurant
  const [duplicateStep, setDuplicateStep] = useState<
    'closed' | 'pick-restaurant' | 'pick-menus'
  >('closed');
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);
  const [duplicateAvailableMenus, setDuplicateAvailableMenus] = useState<Menu[]>([]);
  const [duplicateSelectedIds, setDuplicateSelectedIds] = useState<Set<number>>(new Set());
  const [isDuplicating, setIsDuplicating] = useState(false);

  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingMenuId, setTogglingMenuId] = useState<number | null>(null);

  // Toast & Confirm custom
  const [toast, setToast] = useState<{
    variant?: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  } | null>(null);

  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  } | null>(null);

  // Animations
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];

  // Hooks responsive
  const responsive = useResponsive();
  const screenType = useScreenType();

  const styles = useMemo(
    () => makeStyles(colors, isDark, screenType, responsive),
    [colors, isDark, screenType, responsive],
  );

  useFocusEffect(
    useCallback(() => {
      loadMenus();
    }, []),
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: ANIMATIONS.duration.slow,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: ANIMATIONS.duration.slow,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadMenus = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const myMenus = await menuService.getMenusByRestaurant(Number(restaurant.id));
      setMenus(myMenus);
    } catch (error) {
      console.error('Erreur lors du chargement des menus:', error);
      setToast({
        variant: 'error',
        title: t('common.error'),
        message: t('restaurantMenus.feedback.loadFailed'),
      });
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMenus(false);
    setRefreshing(false);
  };

  const handleSwitchRestaurant = async (restaurantId: string) => {
    setShowSwitcher(false);
    await loadRestaurant(restaurantId);
  };

  const handleOpenDuplicate = () => {
    setDuplicateSelectedIds(new Set());
    setDuplicateSourceId(null);
    setDuplicateAvailableMenus([]);
    setDuplicateStep('pick-restaurant');
  };

  const handleSelectDuplicateSource = async (sourceId: string) => {
    setDuplicateSourceId(sourceId);
    try {
      const sourceMenus = await menuService.getMenusByRestaurant(Number(sourceId));
      setDuplicateAvailableMenus(sourceMenus);
      setDuplicateStep('pick-menus');
    } catch {
      setToast({
        variant: 'error',
        title: t('common.error'),
        message: t('restaurantMenus.feedback.loadSourceFailed'),
      });
      setDuplicateStep('closed');
    }
  };

  const handleToggleDuplicateMenu = (menuId: number) => {
    setDuplicateSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(menuId) ? next.delete(menuId) : next.add(menuId);
      return next;
    });
  };

  const handleConfirmDuplicate = async () => {
    if (duplicateSelectedIds.size === 0) return;
    setIsDuplicating(true);
    try {
      const results = await Promise.allSettled(
        Array.from(duplicateSelectedIds).map((id) =>
          menuService.duplicateMenu(id, restaurant.id),
        ),
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      setDuplicateStep('closed');
      await loadMenus(false);
      setToast({
        variant: failed === 0 ? 'success' : 'warning',
        title: t('restaurantMenus.duplicate.doneTitle'),
        message:
          failed === 0
            ? t('restaurantMenus.duplicate.doneSuccess', { count: succeeded })
            : t('restaurantMenus.duplicate.donePartial', {
                succeeded,
                failed,
              }),
      });
    } catch {
      setToast({
        variant: 'error',
        title: t('common.error'),
        message: t('restaurantMenus.duplicate.errorGeneric'),
      });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleToggleMenu = async (menu: Menu) => {
    if (togglingMenuId) return;

    setTogglingMenuId(menu.id);

    try {
      const result = await menuService.toggleMenuAvailability(menu.id);
      await loadMenus(false);

      setToast({
        variant: 'success',
        title: t('restaurantMenus.feedback.successTitle'),
        message:
          result.message ||
          (result.is_available
            ? t('restaurantMenus.feedback.menuEnabled')
            : t('restaurantMenus.feedback.menuDisabled')),
      });
    } catch (error: any) {
      console.error('Erreur lors du toggle:', error);

      let errorMessage = t('restaurantMenus.feedback.toggleFailed');
      if (error?.response?.status === 403) {
        errorMessage = t('restaurantMenus.feedback.toggleForbidden');
      } else if (error?.response?.status === 404) {
        errorMessage = t('restaurantMenus.feedback.menuNotFound');
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setToast({
        variant: 'error',
        title: t('common.error'),
        message: errorMessage,
      });
    } finally {
      setTogglingMenuId(null);
    }
  };

  const handleDeleteMenu = async (menu: Menu) => {
    setConfirm({
      title: t('restaurantMenus.delete.title'),
      message: t('restaurantMenus.delete.message', { name: menu.name }),
      confirmText: t('restaurantMenus.delete.confirm'),
      cancelText: t('common.cancel'),
      danger: true,
      onConfirm: async () => {
        try {
          await menuService.deleteMenu(menu.id);
          setMenus((prev) => prev.filter((m) => m.id !== menu.id));
          setToast({
            variant: 'success',
            title: t('restaurantMenus.feedback.successTitle'),
            message: t('restaurantMenus.feedback.menuDeleted'),
          });
        } catch (error: any) {
          console.error('Erreur lors de la suppression du menu:', error);
          setToast({
            variant: 'error',
            title: t('common.error'),
            message:
              error?.response?.data?.detail ||
              t('restaurantMenus.feedback.deleteFailed'),
          });
        } finally {
          setConfirm(null);
        }
      },
    });
  };

  // Statistiques
  const activeMenusCount = menus.filter((m) => m.is_available).length;
  const totalMenusCount = menus.length;
  const hasMultipleActive = activeMenusCount > 1;

  const renderHelpCard = () => {
    if (totalMenusCount > 0 || isLoading) return null;

    return (
      <View style={styles.helpCard}>
        <View style={styles.helpIcon}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={{ width: 28, height: 28 }}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.helpTitle}>
          {t('restaurantMenus.help.title')}
        </Text>
        <Text style={styles.helpText}>
          {t('restaurantMenus.help.description')}
        </Text>
        <View style={styles.helpActions}>
          <Button
            title={t('restaurantMenus.help.createFirstMenu')}
            onPress={() => router.push(`/menu/add?restaurantId=${restaurant.id}`)}
            variant="primary"
            leftIcon={
              <Ionicons name="add-circle-outline" size={20} color={colors.text.inverse} />
            }
            fullWidth={responsive.isMobile}
          />
          <Button
            title={t('restaurantMenus.help.userGuide')}
            onPress={() => router.push('/help/help' as any)}
            variant="outline"
            fullWidth={responsive.isMobile}
          />
        </View>
      </View>
    );
  };

  const renderMenu = ({ item }: { item: Menu }) => (
    <View style={styles.menuCardContainer}>
      <View style={styles.menuCardWrapper}>
        <MenuCard
          menu={item}
          onPress={() => router.push(`/menu/${item.id}` as any)}
          onEdit={() => router.push(`/menu/edit/${item.id}` as any)}
          onToggle={() => handleToggleMenu(item)}
          onDelete={() => handleDeleteMenu(item)}
          isToggling={togglingMenuId === item.id}
        />
      </View>
    </View>
  );

  const renderStatsBar = () => {
    if (totalMenusCount === 0) return null;

    const inactiveMenusCount = totalMenusCount - activeMenusCount;

    return (
      <View style={styles.statsBar}>
        <LinearGradient
          colors={[colors.surface, colors.goldenSurface, colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.statsGradient}
        >
          <View style={styles.statsContainer}>
            <View style={styles.statsLeftContent}>
              <View style={styles.statsIcon}>
                <Ionicons
                  name="restaurant"
                  size={responsive.isTablet ? 28 : 24}
                  color={colors.variants.secondary[600]}
                />
              </View>

              <View style={styles.statsTextContainer}>
                <Text style={styles.statsNumber}>
                  {activeMenusCount}/{totalMenusCount}
                </Text>
                <Text style={styles.statsLabel}>
                  {t('restaurantMenus.stats.activeMenus', {
                    count: activeMenusCount,
                  })}
                </Text>
              </View>
            </View>

            {(responsive.isTablet || responsive.isDesktop) && inactiveMenusCount > 0 && (
              <>
                <View style={styles.statsDivider} />
                <View style={styles.statsExtraInfo}>
                  <Ionicons
                    name="eye-off-outline"
                    size={16}
                    color={colors.text.secondary}
                  />
                  <Text style={styles.statsExtraText}>
                    {t('restaurantMenus.stats.inactive', {
                      count: inactiveMenusCount,
                    })}
                  </Text>
                </View>
              </>
            )}

            {hasMultipleActive && (
              <>
                {(responsive.isTablet || responsive.isDesktop) && (
                  <View style={styles.statsDivider} />
                )}
                <View style={styles.warningBadge}>
                  <Ionicons
                    name="warning"
                    size={14}
                    color={colors.variants.secondary[700]}
                  />
                  <Text style={styles.warningText}>
                    {t('restaurantMenus.stats.multiActive')}
                  </Text>
                </View>
              </>
            )}
          </View>
        </LinearGradient>
      </View>
    );
  };

  const renderInfoSection = () => {
    if (totalMenusCount === 0) return null;

    return (
      <View style={styles.infoSection}>
        <View style={styles.infoIconContainer}>
          <Ionicons
            name="information"
            size={responsive.isTablet ? 24 : 20}
            color="#FFFFFF"
          />
        </View>
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>
            {t('restaurantMenus.info.title')}
          </Text>
          <Text style={styles.infoDescription}>
            {t('restaurantMenus.info.description')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title={t('restaurantMenus.title')}
        subtitle={restaurant.name}
        rightIcon="add-circle"
        onRightPress={() => router.push(`/menu/add?restaurantId=${restaurant.id}`)}
        leftIcon={restaurants.length > 1 ? 'swap-horizontal' : undefined}
        onLeftPress={
          restaurants.length > 1 ? () => setShowSwitcher(true) : undefined
        }
      />

      {/* Modal sélection de restaurant */}
      {restaurants.length > 1 && (
        <Modal
          visible={showSwitcher}
          transparent
          animationType="fade"
          onRequestClose={() => setShowSwitcher(false)}
          statusBarTranslucent
        >
          <Pressable
            style={styles.switcherOverlay}
            onPress={() => setShowSwitcher(false)}
          >
            <Pressable
              style={styles.switcherContainer}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.switcherTitle}>
                {t('restaurantMenus.switcher.title')}
              </Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {restaurants.map((r) => {
                  const isCurrent = r.id === restaurant.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        styles.switcherItem,
                        isCurrent && styles.switcherItemActive,
                      ]}
                      onPress={() => handleSwitchRestaurant(r.id)}
                      disabled={isCurrent}
                    >
                      <View style={styles.switcherItemIcon}>
                        <Ionicons
                          name="restaurant"
                          size={20}
                          color={
                            isCurrent
                              ? colors.text.inverse
                              : colors.variants.secondary[600]
                          }
                        />
                      </View>
                      <View style={styles.switcherItemText}>
                        <Text
                          style={[
                            styles.switcherItemName,
                            isCurrent && styles.switcherItemNameActive,
                          ]}
                          numberOfLines={1}
                        >
                          {r.name}
                        </Text>
                        {r.address && (
                          <Text style={styles.switcherItemAddress} numberOfLines={1}>
                            {r.address}
                          </Text>
                        )}
                      </View>
                      {isCurrent && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={colors.text.inverse}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={styles.switcherClose}
                onPress={() => setShowSwitcher(false)}
              >
                <Text style={styles.switcherCloseText}>
                  {t('restaurantDailyMenu.close')}
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Barre de statistiques */}
      {renderStatsBar()}

      {/* Barre "Récupérer des menus depuis un autre restaurant" */}
      {restaurants.length > 1 && (
        <View style={styles.duplicateBar}>
          <TouchableOpacity
            style={styles.duplicateBarButton}
            onPress={handleOpenDuplicate}
          >
            <Ionicons name="copy-outline" size={16} color={colors.primary} />
            <Text style={styles.duplicateBarButtonText}>
              {t('restaurantMenus.duplicate.barButton')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal duplication 2 étapes */}
      <Modal
        visible={duplicateStep !== 'closed'}
        transparent
        animationType="fade"
        onRequestClose={() => setDuplicateStep('closed')}
        statusBarTranslucent
      >
        <Pressable style={styles.dupOverlay} onPress={() => setDuplicateStep('closed')}>
          <Pressable style={styles.dupContainer} onPress={(e) => e.stopPropagation()}>
            {/* Étape 1 : choisir le restaurant source */}
            {duplicateStep === 'pick-restaurant' && (
              <>
                <View style={styles.dupHeader}>
                  <Text style={styles.dupTitle}>
                    {t('restaurantMenus.duplicate.pickSourceTitle')}
                  </Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {restaurants
                    .filter((r) => r.id !== restaurant.id)
                    .map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={styles.dupItem}
                        onPress={() => handleSelectDuplicateSource(r.id)}
                      >
                        <View style={styles.dupItemIcon}>
                          <Ionicons
                            name="restaurant"
                            size={20}
                            color={colors.variants.secondary[600]}
                          />
                        </View>
                        <View style={styles.dupItemText}>
                          <Text style={styles.dupItemName} numberOfLines={1}>
                            {r.name}
                          </Text>
                          {r.address && (
                            <Text style={styles.dupItemSub} numberOfLines={1}>
                              {r.address}
                            </Text>
                          )}
                        </View>
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={colors.text.secondary}
                        />
                      </TouchableOpacity>
                    ))}
                </ScrollView>
                <View style={styles.dupFooter}>
                  <TouchableOpacity
                    style={styles.dupCancelButton}
                    onPress={() => setDuplicateStep('closed')}
                  >
                    <Text style={styles.dupCancelText}>
                      {t('common.cancel')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Étape 2 : choisir les menus à dupliquer */}
            {duplicateStep === 'pick-menus' && (
              <>
                <View style={styles.dupHeader}>
                  <TouchableOpacity
                    style={{ padding: 4 }}
                    onPress={() => setDuplicateStep('pick-restaurant')}
                  >
                    <Ionicons name="chevron-back" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.dupTitle}>
                    {t('restaurantMenus.duplicate.pickMenusTitle')}
                  </Text>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {duplicateAvailableMenus.length === 0 ? (
                    <Text style={styles.dupEmptyText}>
                      {t('restaurantMenus.duplicate.emptySource')}
                    </Text>
                  ) : (
                    duplicateAvailableMenus.map((m) => {
                      const selected = duplicateSelectedIds.has(m.id);
                      const itemsCount = m.items?.length ?? 0;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.dupItem, selected && styles.dupItemSelected]}
                          onPress={() => handleToggleDuplicateMenu(m.id)}
                        >
                          <View
                            style={[
                              styles.dupItemIcon,
                              selected && styles.dupItemIconSelected,
                            ]}
                          >
                            <Ionicons
                              name={selected ? 'checkmark' : 'restaurant-outline'}
                              size={20}
                              color={
                                selected
                                  ? colors.text.inverse
                                  : colors.variants.secondary[600]
                              }
                            />
                          </View>
                          <View style={styles.dupItemText}>
                            <Text style={styles.dupItemName} numberOfLines={1}>
                              {m.name}
                            </Text>
                            <Text style={styles.dupItemSub}>
                              {t('restaurantMenus.duplicate.itemSummary', {
                                count: itemsCount,
                                status: m.is_available
                                  ? t('restaurantMenus.duplicate.statusActive')
                                  : t('restaurantMenus.duplicate.statusInactive'),
                              })}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>

                <View style={styles.dupFooter}>
                  <TouchableOpacity
                    style={[
                      styles.dupConfirmButton,
                      duplicateSelectedIds.size === 0 && { opacity: 0.4 },
                    ]}
                    onPress={handleConfirmDuplicate}
                    disabled={duplicateSelectedIds.size === 0 || isDuplicating}
                  >
                    <LinearGradient
                      colors={[
                        colors.primary,
                        colors.variants.primary?.[700] ?? colors.primary,
                      ]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.dupConfirmGradient}
                    >
                      {isDuplicating ? (
                        <Text style={styles.dupConfirmText}>
                          {t('restaurantMenus.duplicate.duplicating')}
                        </Text>
                      ) : (
                        <>
                          <Ionicons name="copy" size={18} color={colors.text.inverse} />
                          <Text style={styles.dupConfirmText}>
                            {duplicateSelectedIds.size > 0
                              ? t('restaurantMenus.duplicate.confirmWithCount', {
                                  count: duplicateSelectedIds.size,
                                })
                              : t('restaurantMenus.duplicate.confirmSimple')}
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dupCancelButton}
                    onPress={() => setDuplicateStep('closed')}
                  >
                    <Text style={styles.dupCancelText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {renderInfoSection()}
      {renderHelpCard()}

      <View style={styles.listContainer}>
        <FlatList
          data={menus}
          renderItem={renderMenu}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.variants.secondary[500]]}
              tintColor={colors.variants.secondary[500]}
            />
          }
          showsVerticalScrollIndicator={false}
          numColumns={1}
          key={`${screenType}-${isDark ? 'd' : 'l'}`}
          removeClippedSubviews
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={100}
          windowSize={responsive.isMobile ? 10 : 15}
          ItemSeparatorComponent={() =>
            responsive.isMobile ? (
              <View
                style={{ height: getResponsiveValue(SPACING.sm, screenType) }}
              />
            ) : null
          }
        />
      </View>

      {/* Toast */}
      {toast && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: 24 }}
        >
          <Alert
            variant={toast.variant || 'info'}
            title={toast.title}
            message={toast.message}
            onDismiss={() => setToast(null)}
            autoDismiss
            autoDismissDuration={5000}
          />
        </View>
      )}

      {/* Confirmation */}
      {confirm && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: 24 }}
        >
          <AlertWithAction
            variant={confirm.danger ? 'warning' : 'info'}
            title={confirm.title}
            message={confirm.message}
            onDismiss={() => setConfirm(null)}
            autoDismiss={false}
            primaryButton={{
              text: confirm.confirmText || t('restaurantMenus.delete.confirm'),
              onPress: () => confirm.onConfirm(),
              variant: confirm.danger ? 'danger' : 'primary',
            }}
            secondaryButton={{
              text: confirm.cancelText || t('common.cancel'),
              onPress: () => setConfirm(null),
            }}
          />
        </View>
      )}
    </View>
  );
}

// Composant wrapper avec gestion automatique de la sélection du restaurant
export default function MenusScreen() {
  const { t } = useTranslation();
  const { currentRestaurant } = useRestaurant();

  return (
    <RestaurantAutoSelector
      noRestaurantMessage={t('restaurantDailyMenu.noRestaurantMessage')}
      createButtonText={t('restaurantDailyMenu.createRestaurant')}
      onRestaurantSelected={(_restaurantId) => {
        /* noop */
      }}
    >
      {currentRestaurant && <MenusScreenContent restaurant={currentRestaurant} />}
    </RestaurantAutoSelector>
  );
}

// ============================================================================
// STYLES (fabrique theme-aware)
// ============================================================================
const makeStyles = (
  colors: AppColors,
  isDark: boolean,
  screenType: ScreenType,
  responsive: any,
) => {
  const shadows = makeShadows(colors);

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // Stats bar avec gradient or
    statsBar: {
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    statsGradient: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.golden,
    },
    statsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: getResponsiveValue(SPACING.lg, screenType),
      flexWrap: responsive.isTablet && !responsive.isLandscape ? 'wrap' : 'nowrap',
    },
    statsLeftContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.md, screenType),
      flex: responsive.isTablet && !responsive.isLandscape ? 1 : undefined,
      minWidth: responsive.isTablet ? 200 : undefined,
    },
    statsIcon: {
      width: responsive.isTablet ? 56 : 48,
      height: responsive.isTablet ? 56 : 48,
      borderRadius: responsive.isTablet ? 28 : 24,
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.18)'
        : colors.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
      // Halo or léger
      shadowColor: colors.secondary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.5 : 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    statsTextContainer: { flex: 1 },
    statsNumber: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.golden,
      letterSpacing: -0.5,
    },
    statsLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginTop: 2,
    },
    warningBadge: {
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.12)'
        : colors.variants.secondary[50],
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1.5,
      borderColor: isDark
        ? 'rgba(212, 175, 55, 0.4)'
        : colors.variants.secondary[400],
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    warningText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: isDark ? colors.text.golden : colors.variants.secondary[800],
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      letterSpacing: 0.3,
    },
    statsDivider: {
      width: 1,
      height: 40,
      backgroundColor: colors.border.golden,
      marginHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
    statsExtraInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: isDark
        ? 'rgba(99, 102, 241, 0.12)'
        : colors.variants.primary[50],
      borderRadius: BORDER_RADIUS.full,
    },
    statsExtraText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: colors.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },

    // Info section
    infoSection: {
      backgroundColor: isDark
        ? 'rgba(99, 102, 241, 0.12)'
        : colors.variants.primary[50],
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.xl,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: getResponsiveValue(SPACING.md, screenType),
      ...shadows.sm,
    },
    infoIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadows.md,
      flexShrink: 0,
    },
    infoContent: { flex: 1, flexShrink: 1 },
    infoTitle: {
      fontSize: 16,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      // Titre info en or chaud en dark — comme partout
      color: isDark ? colors.text.golden : colors.primary,
      marginBottom: 6,
      letterSpacing: -0.3,
    },
    infoDescription: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 20,
      fontWeight: TYPOGRAPHY.fontWeight.normal,
    },

    listContainer: { flex: 1 },
    listContent: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: getResponsiveValue(SPACING['4xl'], screenType),
      paddingTop: responsive.isTablet
        ? getResponsiveValue(SPACING.lg, screenType)
        : getResponsiveValue(SPACING.md, screenType),
    },
    menuCardContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    menuCardWrapper: {
      transform: responsive.isTablet ? [{ scale: 1.05 }] : [{ scale: 1 }],
    },

    // Help card "Commencer avec EatQuickeR"
    helpCard: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.xl, screenType),
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: colors.border.golden,
      alignItems: 'center',
      ...shadows.lg,
    },
    helpIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.18)'
        : colors.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      shadowColor: colors.secondary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isDark ? 0.5 : 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    helpTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: isDark ? colors.text.golden : colors.text.primary,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    helpText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.6,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    helpActions: {
      flexDirection: responsive.isMobile ? 'column' : 'row',
      gap: getResponsiveValue(SPACING.md, screenType),
      width: '100%',
    },

    // Restaurant switcher modal
    switcherOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
    },
    switcherContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      width: '100%',
      maxWidth: 400,
      maxHeight: '70%',
      // Hairline or 12% en dark
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.xl,
      overflow: 'hidden',
    },
    switcherTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: isDark ? colors.text.golden : colors.primary,
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingTop: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    switcherItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    switcherItemActive: { backgroundColor: colors.primary },
    switcherItemIcon: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.18)'
        : colors.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    switcherItemText: { flex: 1 },
    switcherItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    switcherItemNameActive: { color: colors.text.inverse },
    switcherItemAddress: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginTop: 2,
    },
    switcherClose: {
      padding: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
    },
    switcherCloseText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.secondary,
    },

    // Barre "Récupérer des menus"
    duplicateBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      backgroundColor: colors.goldenSurface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.golden,
    },
    duplicateBarButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: colors.border.golden,
      ...shadows.sm,
    },
    duplicateBarButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.primary,
    },

    // Modal duplication
    dupOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.xl, screenType),
    },
    dupContainer: {
      backgroundColor: colors.surface,
      borderRadius: BORDER_RADIUS.xl,
      width: '100%',
      maxWidth: 420,
      maxHeight: '75%',
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? 'rgba(212, 175, 55, 0.12)' : 'transparent',
      ...shadows.xl,
      overflow: 'hidden',
    },
    dupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    dupTitle: {
      flex: 1,
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: isDark ? colors.text.golden : colors.primary,
    },
    dupItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: colors.border.light,
    },
    dupItemSelected: {
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.12)'
        : colors.variants.secondary[50],
    },
    dupItemIcon: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.full,
      backgroundColor: isDark
        ? 'rgba(212, 175, 55, 0.18)'
        : colors.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    dupItemIconSelected: { backgroundColor: colors.variants.secondary[500] },
    dupItemText: { flex: 1 },
    dupItemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: colors.text.primary,
    },
    dupItemSub: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
      marginTop: 2,
    },
    dupEmptyText: {
      textAlign: 'center',
      color: colors.text.secondary,
      padding: getResponsiveValue(SPACING.xl, screenType),
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
    },
    dupFooter: {
      padding: getResponsiveValue(SPACING.md, screenType),
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    dupConfirmButton: {
      borderRadius: BORDER_RADIUS.lg,
      overflow: 'hidden',
    },
    dupConfirmGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      gap: 8,
    },
    dupConfirmText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: colors.text.inverse,
    },
    dupCancelButton: {
      alignItems: 'center',
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    dupCancelText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: colors.text.secondary,
    },
  });
};