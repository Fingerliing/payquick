import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  RefreshControl,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Header } from '@/components/ui/Header';
import { MenuCard } from '@/components/menu/MenuCard';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { menuService } from '@/services/menuService';
import { Menu } from '@/types/menu';
import { useResponsive } from '@/utils/responsive';
import { 
  COLORS, 
  TYPOGRAPHY, 
  SPACING, 
  BORDER_RADIUS, 
  SHADOWS,
  ANIMATIONS,
  createResponsiveStyles,
  useScreenType,
  getResponsiveValue
} from '@/utils/designSystem';
import { Alert, AlertWithAction } from '@/components/ui/Alert';

/**
 * MenusScreen - Écran de gestion des menus avec design premium
 */
export default function MenusScreen() {
  const { restaurants } = useRestaurant();
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
  const styles = createResponsiveStyles(screenType);

  useFocusEffect(
    useCallback(() => {
      loadMenus();
    }, [])
  );

  useEffect(() => {
    // Animation d'entrée
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
      const myMenus = await menuService.getMyMenus();
      setMenus(myMenus);
    } catch (error) {
      console.error('Erreur lors du chargement des menus:', error);
      setToast({
        variant: 'error',
        title: 'Erreur',
        message: 'Impossible de charger les menus',
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

  const handleToggleMenu = async (menu: Menu) => {
    if (togglingMenuId) return;

    setTogglingMenuId(menu.id);

    try {
      const result = await menuService.toggleMenuAvailability(menu.id);
      await loadMenus(false);
      
      setToast({
        variant: 'success',
        title: 'Succès',
        message:
          result.message ||
          (result.is_available
            ? 'Menu activé avec succès (les autres menus ont été désactivés)'
            : 'Menu désactivé avec succès'),
      });
    } catch (error: any) {
      console.error('Erreur lors du toggle:', error);
      
      let errorMessage = 'Impossible de modifier le menu';
      if (error?.response?.status === 403) {
        errorMessage = "Vous n'avez pas les permissions pour modifier ce menu";
      } else if (error?.response?.status === 404) {
        errorMessage = 'Menu non trouvé';
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      setToast({
        variant: 'error',
        title: 'Erreur',
        message: errorMessage,
      });
    } finally {
      setTogglingMenuId(null);
    }
  };

  const handleDeleteMenu = async (menu: Menu) => {
    setConfirm({
      title: 'Confirmer la suppression',
      message: `Êtes-vous sûr de vouloir supprimer le menu "${menu.name}" ?\n\nCette action est irréversible.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      danger: true,
      onConfirm: async () => {
        try {
          await menuService.deleteMenu(menu.id);
          setMenus(prevMenus => prevMenus.filter(m => m.id !== menu.id));
          setToast({
            variant: 'success',
            title: 'Succès',
            message: 'Menu supprimé avec succès',
          });
        } catch (error: any) {
          console.error('Erreur lors de la suppression du menu:', error);
          setToast({
            variant: 'error',
            title: 'Erreur',
            message: error?.response?.data?.detail || 'Impossible de supprimer le menu',
          });
        } finally {
          setConfirm(null);
        }
      },
    });
  };

  const getNumColumns = () => 1;

  // Détermine si on utilise un layout deux colonnes pour l'état vide
  const useEmptyTwoColumnLayout = responsive.isTablet || responsive.isDesktop;

  // Statistiques
  const activeMenusCount = menus.filter(m => m.is_available).length;
  const totalMenusCount = menus.length;
  const hasMultipleActive = activeMenusCount > 1;

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    // ... (toutes tes styles existantes inchangées)
    // (⚠️ je conserve le contenu d’origine, seules les alertes ont été refactorisées)
    statsBar: {
      backgroundColor: COLORS.surface,
      overflow: 'hidden',
    },
    statsGradient: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.golden,
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
      backgroundColor: COLORS.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOWS.goldenGlow,
    },
    statsTextContainer: {
      flex: 1,
    },
    statsNumber: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.golden,
      letterSpacing: -0.5,
    },
    statsLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginTop: 2,
    },
    warningBadge: {
      backgroundColor: COLORS.variants.secondary[50],
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1.5,
      borderColor: COLORS.variants.secondary[400],
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      ...SHADOWS.goldenGlow,
    },
    warningText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.variants.secondary[800],
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      letterSpacing: 0.3,
    },
    statsDivider: {
      width: 1,
      height: 40,
      backgroundColor: COLORS.border.golden,
      marginHorizontal: getResponsiveValue(SPACING.md, screenType),
    },
    statsExtraInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: COLORS.variants.primary[50],
      borderRadius: BORDER_RADIUS.full,
    },
    statsExtraText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.secondary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
    infoSection: {
      backgroundColor: COLORS.variants.primary[50],
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.xl,
      borderLeftWidth: 4,
      borderLeftColor: COLORS.primary,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: getResponsiveValue(SPACING.md, screenType),
      ...SHADOWS.sm,
    },
    infoIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: COLORS.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOWS.md,
      flexShrink: 0,
    },
    infoContent: {
      flex: 1,
      flexShrink: 1,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      marginBottom: 6,
      letterSpacing: -0.3,
    },
    infoDescription: {
      fontSize: 14,
      color: '#111827',
      lineHeight: 20,
      fontWeight: TYPOGRAPHY.fontWeight.normal,
    },
    listContainer: {
      flex: 1,
    },
    listContent: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: getResponsiveValue(SPACING['4xl'], screenType),
      paddingTop: responsive.isTablet ? getResponsiveValue(SPACING.lg, screenType) : getResponsiveValue(SPACING.md, screenType),
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.xl, screenType),
      minHeight: responsive.height * 0.6,
    },
    emptyCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS['2xl'],
      padding: getResponsiveValue(SPACING['2xl'], screenType),
      alignItems: useEmptyTwoColumnLayout ? 'stretch' : 'center',
      justifyContent: 'center',
      width: '100%',
      maxWidth: useEmptyTwoColumnLayout ? 900 : 450,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      ...SHADOWS.premiumCard,
    },
    emptyContentWrapper: {
      flexDirection: useEmptyTwoColumnLayout ? 'row' : 'column',
      gap: getResponsiveValue(SPACING['2xl'], screenType),
      alignItems: useEmptyTwoColumnLayout ? 'flex-start' : 'center',
      width: '100%',
    },
    emptyLeftColumn: {
      flex: useEmptyTwoColumnLayout ? 1 : undefined,
      alignItems: useEmptyTwoColumnLayout ? 'flex-start' : 'center',
      width: useEmptyTwoColumnLayout ? undefined : '100%',
    },
    emptyRightColumn: {
      flex: useEmptyTwoColumnLayout ? 1 : undefined,
      justifyContent: 'center',
      width: useEmptyTwoColumnLayout ? undefined : '100%',
    },
    emptyIconContainer: {
      width: responsive.isTablet ? 140 : 120,
      height: responsive.isTablet ? 140 : 120,
      borderRadius: responsive.isTablet ? 70 : 60,
      backgroundColor: COLORS.variants.secondary[50],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      borderWidth: 2,
      borderColor: COLORS.border.golden,
      ...SHADOWS.goldenGlow,
      alignSelf: useEmptyTwoColumnLayout ? 'flex-start' : 'center',
    },
    emptyTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.primary,
      textAlign: useEmptyTwoColumnLayout ? 'left' : 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      letterSpacing: -0.5,
    },
    emptySubtitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      color: COLORS.text.golden,
      textAlign: useEmptyTwoColumnLayout ? 'left' : 'center',
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    emptyDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: useEmptyTwoColumnLayout ? 'left' : 'center',
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.6,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
      paddingHorizontal: useEmptyTwoColumnLayout ? 0 : getResponsiveValue(SPACING.md, screenType),
    },
    emptyFeaturesList: {
      width: '100%',
      marginBottom: useEmptyTwoColumnLayout ? 0 : getResponsiveValue(SPACING.xl, screenType),
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      backgroundColor: useEmptyTwoColumnLayout ? COLORS.variants.secondary[50] : 'transparent',
      paddingHorizontal: useEmptyTwoColumnLayout ? getResponsiveValue(SPACING.md, screenType) : 0,
      borderRadius: useEmptyTwoColumnLayout ? BORDER_RADIUS.md : 0,
    },
    featureIcon: {
      width: responsive.isTablet ? 28 : 24,
      height: responsive.isTablet ? 28 : 24,
      borderRadius: responsive.isTablet ? 14 : 12,
      backgroundColor: COLORS.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    featureText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      flex: 1,
      fontWeight: useEmptyTwoColumnLayout ? TYPOGRAPHY.fontWeight.medium : TYPOGRAPHY.fontWeight.normal,
    },
    createButtonGradient: {
      minWidth: responsive.isMobile ? '100%' : useEmptyTwoColumnLayout ? '100%' : 240,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.xl, screenType),
      borderRadius: BORDER_RADIUS.xl,
      ...SHADOWS.goldenGlow,
    },
    createButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    createButtonText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.md, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.inverse,
      letterSpacing: 0.3,
    },
    gridItem: {
      flex: 1,
      marginHorizontal: getResponsiveValue(SPACING.xs, screenType) / 2,
      marginVertical: getResponsiveValue(SPACING.sm, screenType) / 2,
      maxWidth: responsive.isMobile 
        ? '100%' 
        : `${(100 / getNumColumns()) - (responsive.isTablet ? 4 : 2)}%`,
      minWidth: responsive.isTablet ? 340 : undefined,
    },
    menuCardContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    menuCardWrapper: {
      transform: responsive.isTablet ? [{ scale: 1.05 }] : [{ scale: 1 }],
    },
    sectionHeader: {
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      marginTop: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      letterSpacing: -0.3,
    },
    sectionCount: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginTop: 2,
    },
    helpCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.xl, screenType),
      marginHorizontal: getResponsiveValue(SPACING.container, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      alignItems: 'center',
      ...SHADOWS.premiumCard,
    },
    helpIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: COLORS.variants.secondary[100],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      ...SHADOWS.goldenGlow,
    },
    helpTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    helpText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.6,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    helpActions: {
      flexDirection: responsive.isMobile ? 'column' : 'row',
      gap: getResponsiveValue(SPACING.md, screenType),
      width: '100%',
    },
  });

  const renderHelpCard = () => {
    if (totalMenusCount > 0 || isLoading) return null;

    return (
      <View style={dynamicStyles.helpCard}>
        <View style={dynamicStyles.helpIcon}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={{ width: 28, height: 28 }}
            resizeMode="contain"
          />
        </View>
        <Text style={dynamicStyles.helpTitle}>
          Commencer avec EatQuickeR
        </Text>
        <Text style={dynamicStyles.helpText}>
          Créez votre premier menu pour mettre en valeur vos plats et commencer à recevoir des commandes en ligne.
        </Text>
        <View style={dynamicStyles.helpActions}>
          <Button
            title="Créer mon premier menu"
            onPress={() => {
              if (restaurants.length > 0) {
                router.push(`/menu/add?restaurantId=${restaurants[0].id}`);
              } else {
                setToast({
                  variant: 'warning',
                  title: 'Restaurant requis',
                  message: "Vous devez d'abord créer un restaurant avant de pouvoir ajouter des menus.",
                });
              }
            }}
            variant="primary"
            leftIcon={<Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />}
            fullWidth={responsive.isMobile}
          />
          <Button
            title="Guide d'utilisation"
            onPress={() => router.push('/help' as any)}
            variant="outline"
            fullWidth={responsive.isMobile}
          />
        </View>
      </View>
    );
  };

  const renderMenu = ({ item, index }: { item: Menu; index: number }) => {
    return (
      <View style={dynamicStyles.menuCardContainer}>
        <View style={dynamicStyles.menuCardWrapper}>
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
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    
    return (
      <Animated.View 
        style={[
          dynamicStyles.emptyContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }
        ]}
      >
        <View style={dynamicStyles.emptyCard}>
          <View style={dynamicStyles.emptyContentWrapper}>
            {/* Colonne gauche - Contenu principal */}
            <View style={dynamicStyles.emptyLeftColumn}>
              {/* Icône avec effet doré */}
              <View style={dynamicStyles.emptyIconContainer}>
                <Ionicons 
                  name="restaurant" 
                  size={responsive.isTablet ? 64 : 56} 
                  color={COLORS.variants.secondary[500]}
                />
              </View>
              
              {/* Titres */}
              <Text style={dynamicStyles.emptyTitle}>
                Aucun menu créé
              </Text>
              <Text style={dynamicStyles.emptySubtitle}>
                ✨ Commencez votre aventure culinaire
              </Text>
              <Text style={dynamicStyles.emptyDescription}>
                Créez votre premier menu et commencez à proposer vos délicieuses créations à vos clients
              </Text>
              
              {/* Bouton - affiché en bas sur mobile, en haut à gauche sur tablette */}
              {!useEmptyTwoColumnLayout && restaurants.length > 0 && (
                <TouchableOpacity
                  onPress={() => router.push(`/menu/add?restaurantId=${restaurants[0].id}`)}
                  activeOpacity={0.8}
                  style={{ width: '100%' }}
                >
                  <LinearGradient
                    colors={COLORS.gradients.premiumGold}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={dynamicStyles.createButtonGradient}
                  >
                    <View style={dynamicStyles.createButtonContent}>
                      <Ionicons name="add-circle" size={24} color={COLORS.text.inverse} />
                      <Text style={dynamicStyles.createButtonText}>
                        Créer mon premier menu
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
            
            {/* Colonne droite - Fonctionnalités et bouton (tablette/desktop uniquement) */}
            {useEmptyTwoColumnLayout && (
              <View style={dynamicStyles.emptyRightColumn}>
                {/* Liste des fonctionnalités */}
                <View style={dynamicStyles.emptyFeaturesList}>
                  {[
                    { icon: 'checkmark-circle', text: 'Gestion complète de vos plats' },
                    { icon: 'pricetag', text: 'Tarification flexible' },
                    { icon: 'toggle', text: 'Activation/désactivation rapide' },
                    { icon: 'analytics', text: 'Suivi des performances' },
                  ].map((feature, index) => (
                    <View key={index} style={dynamicStyles.featureItem}>
                      <View style={dynamicStyles.featureIcon}>
                        <Ionicons 
                          name={feature.icon as any} 
                          size={responsive.isTablet ? 16 : 14} 
                          color={COLORS.variants.secondary[600]} 
                        />
                      </View>
                      <Text style={dynamicStyles.featureText}>
                        {feature.text}
                      </Text>
                    </View>
                  ))}
                </View>
                
                {/* Bouton pour tablette/desktop */}
                {restaurants.length > 0 && (
                  <TouchableOpacity
                    onPress={() => router.push(`/menu/add?restaurantId=${restaurants[0].id}`)}
                    activeOpacity={0.8}
                    style={{ width: '100%', marginTop: getResponsiveValue(SPACING.xl, screenType) }}
                  >
                    <LinearGradient
                      colors={COLORS.gradients.premiumGold}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={dynamicStyles.createButtonGradient}
                    >
                      <View style={dynamicStyles.createButtonContent}>
                        <Ionicons name="add-circle" size={24} color={COLORS.text.inverse} />
                        <Text style={dynamicStyles.createButtonText}>
                          Créer mon premier menu
                        </Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            )}
            
            {/* Liste des fonctionnalités sur mobile */}
            {!useEmptyTwoColumnLayout && (
              <View style={dynamicStyles.emptyFeaturesList}>
                {[
                  { icon: 'checkmark-circle', text: 'Gestion complète de vos plats' },
                  { icon: 'pricetag', text: 'Tarification flexible' },
                  { icon: 'toggle', text: 'Activation/désactivation rapide' },
                  { icon: 'analytics', text: 'Suivi des performances' },
                ].map((feature, index) => (
                  <View key={index} style={dynamicStyles.featureItem}>
                    <View style={dynamicStyles.featureIcon}>
                      <Ionicons 
                        name={feature.icon as any} 
                        size={14} 
                        color={COLORS.variants.secondary[600]} 
                      />
                    </View>
                    <Text style={dynamicStyles.featureText}>
                      {feature.text}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderStatsBar = () => {
    if (totalMenusCount === 0) return null;
    
    const inactiveMenusCount = totalMenusCount - activeMenusCount;
    
    return (
      <View style={dynamicStyles.statsBar}>
        <LinearGradient
          colors={[COLORS.surface, COLORS.goldenSurface, COLORS.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={dynamicStyles.statsGradient}
        >
          <View style={dynamicStyles.statsContainer}>
            {/* Partie gauche avec icône et chiffres */}
            <View style={dynamicStyles.statsLeftContent}>
              <View style={dynamicStyles.statsIcon}>
                <Ionicons 
                  name="restaurant" 
                  size={responsive.isTablet ? 28 : 24} 
                  color={COLORS.variants.secondary[600]} 
                />
              </View>
              
              <View style={dynamicStyles.statsTextContainer}>
                <Text style={dynamicStyles.statsNumber}>
                  {activeMenusCount}/{totalMenusCount}
                </Text>
                <Text style={dynamicStyles.statsLabel}>
                  Menu{activeMenusCount > 1 ? 's' : ''} actif{activeMenusCount > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            
            {/* Info supplémentaire pour tablette/desktop */}
            {(responsive.isTablet || responsive.isDesktop) && inactiveMenusCount > 0 && (
              <>
                <View style={dynamicStyles.statsDivider} />
                <View style={dynamicStyles.statsExtraInfo}>
                  <Ionicons 
                    name="eye-off-outline" 
                    size={16} 
                    color={COLORS.text.secondary} 
                  />
                  <Text style={dynamicStyles.statsExtraText}>
                    {inactiveMenusCount} inactif{inactiveMenusCount > 1 ? 's' : ''}
                  </Text>
                </View>
              </>
            )}
            
            {/* Badge d'avertissement si plusieurs menus actifs */}
            {hasMultipleActive && (
              <>
                {(responsive.isTablet || responsive.isDesktop) && (
                  <View style={dynamicStyles.statsDivider} />
                )}
                <View style={dynamicStyles.warningBadge}>
                  <Ionicons 
                    name="warning" 
                    size={14} 
                    color={COLORS.variants.secondary[700]} 
                  />
                  <Text style={dynamicStyles.warningText}>
                    MULTI-ACTIFS
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
      <View style={dynamicStyles.infoSection}>
        <View style={dynamicStyles.infoIconContainer}>
          <Ionicons 
            name="information" 
            size={responsive.isTablet ? 24 : 20} 
            color="#FFFFFF" 
          />
        </View>
        <View style={dynamicStyles.infoContent}>
          <Text style={dynamicStyles.infoTitle}>
            💡 Un seul menu actif à la fois
          </Text>
          <Text style={dynamicStyles.infoDescription}>
            Lorsque vous activez un menu, tous les autres menus sont automatiquement désactivés. Seul le menu actif sera visible par vos clients.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={dynamicStyles.container}>
      <Header 
        title="Mes Menus"
        rightIcon="add-circle"
        onRightPress={() => {
          if (restaurants.length > 0) {
            router.push(`/menu/add?restaurantId=${restaurants[0].id}`);
          } else {
            setToast({
              variant: 'warning',
              title: 'Restaurant requis',
              message: "Vous devez d'abord créer un restaurant avant de pouvoir ajouter des menus.",
            });
          }
        }}
      />

      {/* Barre de statistiques améliorée */}
      {renderStatsBar()}

      {/* Section d'information sur le fonctionnement */}
      {renderInfoSection()}

      {/* Carte d'aide pour les nouveaux utilisateurs */}
      {renderHelpCard()}

      <View style={dynamicStyles.listContainer}>
        <FlatList
          data={menus}
          renderItem={renderMenu}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={dynamicStyles.listContent}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              colors={[COLORS.variants.secondary[500]]}
              tintColor={COLORS.variants.secondary[500]}
            />
          }
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          numColumns={1}
          key={screenType}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={100}
          windowSize={responsive.isMobile ? 10 : 15}
          ItemSeparatorComponent={() => (
            responsive.isMobile ? (
              <View style={{ height: getResponsiveValue(SPACING.sm, screenType) }} />
            ) : null
          )}
        />
      </View>

      {/* --- Zone d’alertes custom --- */}
      {/* Toast (auto dismiss & swipe) */}
      {toast && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24,
          }}
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

      {/* Confirmation (pas d’auto dismiss) */}
      {confirm && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24,
          }}
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
}