import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '@/components/ui/Header';
import { MenuCard } from '@/components/menu/MenuCard';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  createResponsiveStyles,
  useScreenType,
  getResponsiveValue
} from '@/utils/designSystem';

export default function MenusScreen() {
  const { restaurants } = useRestaurant();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingMenuId, setTogglingMenuId] = useState<number | null>(null);

  // Hooks responsive
  const responsive = useResponsive();
  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);

  useEffect(() => {
    loadMenus();
  }, []);

  const loadMenus = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const myMenus = await menuService.getMyMenus();
      setMenus(myMenus);
    } catch (error) {
      console.error('Erreur lors du chargement des menus:', error);
      Alert.alert('Erreur', 'Impossible de charger les menus');
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
      
      Alert.alert(
        'Succès', 
        result.message || (result.is_available 
          ? 'Menu activé avec succès (les autres menus ont été désactivés)'
          : 'Menu désactivé avec succès')
      );
    } catch (error: any) {
      console.error('Erreur lors du toggle:', error);
      
      let errorMessage = 'Impossible de modifier le menu';
      if (error?.response?.status === 403) {
        errorMessage = 'Vous n\'avez pas les permissions pour modifier ce menu';
      } else if (error?.response?.status === 404) {
        errorMessage = 'Menu non trouvé';
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setTogglingMenuId(null);
    }
  };

  const handleDeleteMenu = async (menu: Menu) => {
    Alert.alert(
      'Confirmer la suppression',
      `Êtes-vous sûr de vouloir supprimer le menu "${menu.name}" ?\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await menuService.deleteMenu(menu.id);
              setMenus(prevMenus => prevMenus.filter(m => m.id !== menu.id));
              Alert.alert('Succès', 'Menu supprimé avec succès');
            } catch (error: any) {
              console.error('Erreur lors de la suppression du menu:', error);
              Alert.alert(
                'Erreur', 
                error?.response?.data?.detail || 'Impossible de supprimer le menu'
              );
            }
          }
        }
      ]
    );
  };

  // Calcul des colonnes selon la taille d'écran
  const getNumColumns = () => {
    if (responsive.isDesktop) return 3;
    if (responsive.isTablet) return responsive.isLandscape ? 3 : 2;
    return 1;
  };

  // Styles dynamiques basés sur la taille d'écran
  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    
    statsBar: {
      backgroundColor: COLORS.surface,
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
      ...SHADOWS.sm,
    },
    
    statsContainer: {
      flexDirection: responsive.isMobile ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    
    statsText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: responsive.isMobile ? 'center' : 'left',
      flex: responsive.isMobile ? 0 : 1,
    },
    
    warningText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.variants.secondary[800],
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      marginTop: responsive.isMobile ? getResponsiveValue(SPACING.xs, screenType) : 0,
    },
    
    warningBadge: {
      backgroundColor: COLORS.variants.secondary[100],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: getResponsiveValue(SPACING.xs, screenType),
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.secondary,
    },
    
    listContainer: {
      flex: 1,
    },
    
    listContent: {
      padding: getResponsiveValue(SPACING.container, screenType),
      paddingBottom: getResponsiveValue(SPACING['4xl'], screenType),
    },
    
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.xl, screenType),
    },
    
    emptyCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.xl, screenType),
      alignItems: 'center',
      justifyContent: 'center',
      maxWidth: responsive.isDesktop ? 400 : '100%',
      width: '100%',
      ...SHADOWS.card,
    },
    
    emptyIcon: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    
    emptyTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      textAlign: 'center',
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    
    emptyDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      lineHeight: TYPOGRAPHY.lineHeight.relaxed,
      marginBottom: getResponsiveValue(SPACING.xl, screenType),
    },
    
    createButton: {
      minWidth: responsive.isMobile ? '100%' : 200,
      ...styles.button,
      ...styles.buttonPrimary,
      ...SHADOWS.button,
    },
    
    // Styles pour la grille responsive
    gridItem: {
      flex: 1,
      marginHorizontal: getResponsiveValue(SPACING.xs, screenType) / 2,
      marginVertical: getResponsiveValue(SPACING.sm, screenType) / 2,
      maxWidth: responsive.isMobile 
        ? '100%' 
        : `${(100 / getNumColumns()) - 2}%`,
    },
    
    // Styles pour les cartes de menu responsives
    menuCardContainer: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
  });

  const renderMenu = ({ item, index }: { item: Menu; index: number }) => {
    const isGridLayout = !responsive.isMobile && getNumColumns() > 1;
    
    return (
      <View style={isGridLayout ? dynamicStyles.gridItem : dynamicStyles.menuCardContainer}>
        <MenuCard
          menu={item}
          onPress={() => router.push(`/menu/${item.id}` as any)}
          onEdit={() => router.push(`/menu/edit/${item.id}` as any)}
          onToggle={() => handleToggleMenu(item)}
          onDelete={() => handleDeleteMenu(item)}
          isToggling={togglingMenuId === item.id}
        />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
        paddingVertical: getResponsiveValue(SPACING.xl, screenType),
        minHeight: responsive.height * 0.6,
      }}>
        <View style={{
          backgroundColor: COLORS.surface,
          borderRadius: BORDER_RADIUS.lg,
          padding: getResponsiveValue(SPACING.xl, screenType),
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: 400,
          ...SHADOWS.card,
        }}>
          {/* Icône */}
          <View style={{ marginBottom: 24 }}>
            <Ionicons 
              name="restaurant-outline" 
              size={64} 
              color={COLORS.secondary}
            />
          </View>
          
          {/* Titre */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
              fontWeight: TYPOGRAPHY.fontWeight.bold,
              color: COLORS.primary,
              textAlign: 'center',
            }}>
              Aucun menu trouvé
            </Text>
          </View>
          
          {/* Description */}
          <View style={{ marginBottom: 32 }}>
            <Text style={{
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
              color: COLORS.text.secondary,
              textAlign: 'center',
              lineHeight: 20,
            }}>
              Créez votre premier menu pour commencer
            </Text>
          </View>
          
          {/* Bouton */}
          {restaurants.length > 0 && (
            <Button
              title="Créer un menu"
              onPress={() => router.push(`/menu/add?restaurantId=${restaurants[0].id}`)}
              variant="primary"
              style={{
                minWidth: responsive.isMobile ? '100%' : 200,
                paddingVertical: getResponsiveValue(SPACING.md, screenType),
                paddingHorizontal: getResponsiveValue(SPACING.lg, screenType),
                borderRadius: BORDER_RADIUS.lg,
                backgroundColor: COLORS.primary,
                ...SHADOWS.button,
              }}
            />
          )}
        </View>
      </View>
    );
  };

  // Statistiques
  const activeMenusCount = menus.filter(m => m.is_available).length;
  const totalMenusCount = menus.length;
  const hasMultipleActive = activeMenusCount > 1;

  return (
    <View style={dynamicStyles.container}>
      <Header 
        title="Mes Menus"
        rightIcon="add-outline"
        onRightPress={() => {
          if (restaurants.length > 0) {
            router.push(`/menu/add?restaurantId=${restaurants[0].id}`);
          } else {
            Alert.alert(
              'Restaurant requis', 
              'Vous devez d\'abord créer un restaurant avant de pouvoir ajouter des menus.'
            );
          }
        }}
      />

      {/* Barre de statistiques responsive */}
      {totalMenusCount > 0 && (
        <View style={dynamicStyles.statsBar}>
          <View style={dynamicStyles.statsContainer}>
            <Text style={dynamicStyles.statsText}>
              {activeMenusCount} menu{activeMenusCount > 1 ? 's' : ''} actif{activeMenusCount > 1 ? 's' : ''} sur {totalMenusCount}
            </Text>
            
            {hasMultipleActive && (
              <View style={dynamicStyles.warningBadge}>
                <Text style={dynamicStyles.warningText}>
                  ⚠️ Plusieurs menus actifs
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

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
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          // Configuration pour la grille responsive
          numColumns={responsive.isMobile ? 1 : getNumColumns()}
          key={`${screenType}-${getNumColumns()}`} // Force re-render on orientation change
          columnWrapperStyle={!responsive.isMobile && getNumColumns() > 1 ? {
            justifyContent: 'space-between',
            paddingHorizontal: getResponsiveValue(SPACING.xs, screenType) / 2,
          } : undefined}
          // Optimisations de performance
          removeClippedSubviews={true}
          maxToRenderPerBatch={responsive.isMobile ? 5 : getNumColumns() * 3}
          updateCellsBatchingPeriod={100}
          windowSize={responsive.isMobile ? 10 : 15}
          // Espacements entre les éléments
          ItemSeparatorComponent={() => (
            responsive.isMobile ? (
              <View style={{ height: getResponsiveValue(SPACING.sm, screenType) }} />
            ) : null
          )}
        />
      </View>
    </View>
  );
}