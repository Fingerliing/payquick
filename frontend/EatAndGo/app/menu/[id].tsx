import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

// Services & Types
import { menuService } from '@/services/menuService';
import { Menu, MenuItem } from '@/types/menu';

// Design System
import {
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  TYPOGRAPHY,
  COMPONENT_CONSTANTS,
} from '@/utils/designSystem';

export default function MenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  
  // État
  const [menu, setMenu] = useState<Menu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingItemId, setTogglingItemId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  useEffect(() => {
    loadMenu();
  }, [id]);

  const loadMenu = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const menuData = await menuService.getMenu(parseInt(id));
      setMenu(menuData);
    } catch (error) {
      console.error('Erreur lors du chargement du menu:', error);
      Alert.alert('Erreur', 'Impossible de charger le menu');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleItemAvailability = async (item: MenuItem) => {
    setTogglingItemId(item.id);
    try {
      const updatedItem = await menuService.menuItems.toggleItemAvailability(item.id);
      setMenu(prevMenu => {
        if (!prevMenu) return null;
        return {
          ...prevMenu,
          items: prevMenu.items.map(i => 
            i.id === item.id ? { ...i, is_available: updatedItem.is_available } : i
          )
        };
      });
      
      // Feedback utilisateur
      Alert.alert(
        'Succès',
        `Plat ${updatedItem.is_available ? 'activé' : 'désactivé'} avec succès`
      );
    } catch (error) {
      console.error('Erreur lors de la modification de l\'item:', error);
      Alert.alert('Erreur', 'Impossible de modifier le statut du plat');
    } finally {
      setTogglingItemId(null);
    }
  };

  const handleDeleteItem = async (item: MenuItem) => {
    Alert.alert(
      'Supprimer le plat',
      `Êtes-vous sûr de vouloir supprimer "${item.name}" ?\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => confirmDeleteItem(item) },
      ],
      { cancelable: true }
    );
  };
  
  const confirmDeleteItem = async (item: MenuItem) => {
    setDeletingItemId(item.id);
    try {
      await menuService.menuItems.deleteMenuItem(item.id);
      setMenu(prevMenu => {
        if (!prevMenu) return null;
        return {
          ...prevMenu,
          items: prevMenu.items.filter(i => i.id !== item.id)
        };
      });
      Alert.alert('Succès', `Le plat "${item.name}" a été supprimé avec succès`);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      Alert.alert('Erreur', 'Impossible de supprimer le plat. Veuillez réessayer.');
    } finally {
      setDeletingItemId(null);
    }
  };

  // Styles dynamiques avec SafeArea
  const dynamicStyles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
      paddingBottom: insets.bottom,
    },
    headerCard: {
      backgroundColor: COLORS.goldenSurface,
      borderBottomLeftRadius: BORDER_RADIUS['2xl'],
      borderBottomRightRadius: BORDER_RADIUS['2xl'],
      padding: getResponsiveValue(SPACING.lg, screenType),
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      borderBottomWidth: 2,
      borderBottomColor: COLORS.border.golden,
      ...SHADOWS.premiumCard,
    },
    menuTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['3xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    menuMeta: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType) * 1.4,
    },
    listContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
    },
    menuItemCard: {
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      ...SHADOWS.lg,
      overflow: 'hidden' as const,
    },
    itemHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'flex-start' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    itemName: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      flex: 1,
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    itemPrice: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
      color: COLORS.variants.secondary[600],
    },
    itemDescription: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.4,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    itemMeta: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    categoryBadge: {
      backgroundColor: COLORS.variants.primary[50],
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.variants.primary[200],
    },
    categoryText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    statusBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
    },
    statusBadgeAvailable: {
      backgroundColor: '#ECFDF5',
      borderWidth: 1,
      borderColor: COLORS.success,
    },
    statusBadgeUnavailable: {
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: COLORS.error,
    },
    statusText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      marginLeft: 4,
    },
    statusTextAvailable: {
      color: COLORS.success,
    },
    statusTextUnavailable: {
      color: COLORS.error,
    },
    itemActions: {
      flexDirection: 'row' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginTop: getResponsiveValue(SPACING.xs, screenType),
    },
    dietaryTags: {
      flexDirection: 'row' as const,
      gap: 8,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      flexWrap: 'wrap' as const,
    },
    dietaryTag: {
      backgroundColor: COLORS.variants.secondary[50],
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: BORDER_RADIUS.full,
      borderWidth: 1,
      borderColor: COLORS.variants.secondary[200],
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
    },
    dietaryTagText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.variants.secondary[800],
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING['2xl'], screenType),
    },
    emptyStateIcon: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    emptyStateTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    emptyStateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType) * 1.5,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    statsContainer: {
      flexDirection: 'row' as const,
      justifyContent: 'space-around' as const,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.golden,
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: getResponsiveValue(SPACING.sm, screenType),
    },
    statItem: {
      alignItems: 'center' as const,
      flex: 1,
    },
    statValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.extrabold as any,
      color: COLORS.text.primary,
    },
    statLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      marginTop: 4,
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
    },
  };

  // Rendu d'un élément de menu
  const renderMenuItem = ({ item }: { item: MenuItem }) => {
    const isToggling = togglingItemId === item.id;
    const isDeleting = deletingItemId === item.id;
    const dietaryTags = [];
    
    if (item.is_vegetarian) dietaryTags.push({ label: 'Végétarien', icon: 'leaf-outline' });
    if (item.is_vegan) dietaryTags.push({ label: 'Vegan', icon: 'nutrition-outline' });
    if (item.is_gluten_free) dietaryTags.push({ label: 'Sans gluten', icon: 'fitness-outline' });

    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => router.push(`/menu/item/edit/${item.id}` as any)}
      >
        <Card variant="default" style={dynamicStyles.menuItemCard}>
          {/* En-tête avec nom et prix */}
          <View style={dynamicStyles.itemHeader}>
            <Text style={dynamicStyles.itemName}>{item.name}</Text>
            <View style={{
              backgroundColor: COLORS.variants.secondary[100],
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: BORDER_RADIUS.lg,
              borderWidth: 1.5,
              borderColor: COLORS.variants.secondary[400],
            }}>
              <Text style={dynamicStyles.itemPrice}>
                {parseFloat(item.price).toFixed(2)}€
              </Text>
            </View>
          </View>

          {/* Description */}
          {item.description && (
            <Text style={dynamicStyles.itemDescription}>
              {item.description}
            </Text>
          )}

          {/* Tags diététiques */}
          {dietaryTags.length > 0 && (
            <View style={dynamicStyles.dietaryTags}>
              {dietaryTags.map((tag, index) => (
                <View key={index} style={dynamicStyles.dietaryTag}>
                  <Ionicons name={tag.icon as any} size={12} color={COLORS.variants.secondary[700]} />
                  <Text style={dynamicStyles.dietaryTagText}>{tag.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Métadonnées */}
          <View style={dynamicStyles.itemMeta}>
            <View style={dynamicStyles.categoryBadge}>
              <Text style={dynamicStyles.categoryText}>
                {item.category_name || item.category || 'Sans catégorie'}
              </Text>
            </View>
            
            <View style={[
              dynamicStyles.statusBadge,
              item.is_available ? dynamicStyles.statusBadgeAvailable : dynamicStyles.statusBadgeUnavailable
            ]}>
              <Ionicons 
                name={item.is_available ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color={item.is_available ? COLORS.success : COLORS.error} 
              />
              <Text style={[
                dynamicStyles.statusText,
                item.is_available ? dynamicStyles.statusTextAvailable : dynamicStyles.statusTextUnavailable
              ]}>
                {item.is_available ? 'Disponible' : 'Indisponible'}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={dynamicStyles.itemActions}>
            <TouchableOpacity
              onPress={() => handleToggleItemAvailability(item)}
              disabled={isToggling || isDeleting}
              style={{
                flex: 1,
                backgroundColor: item.is_available ? COLORS.warning : COLORS.success,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: BORDER_RADIUS.lg,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: (isToggling || isDeleting) ? 0.5 : 1,
                ...SHADOWS.button,
              }}
            >
              {isToggling ? (
                <ActivityIndicator size="small" color={COLORS.text.inverse} />
              ) : (
                <>
                  <Ionicons 
                    name={item.is_available ? "eye-off-outline" : "eye-outline"} 
                    size={18} 
                    color={COLORS.text.inverse}
                    style={{ marginRight: 6 }} 
                  />
                  <Text style={{
                    color: COLORS.text.inverse,
                    fontSize: 14,
                    fontWeight: '600'
                  }}>
                    {item.is_available ? 'Masquer' : 'Afficher'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          
            <TouchableOpacity
              onPress={() => router.push(`/menu/item/edit/${item.id}` as any)}
              disabled={isToggling || isDeleting}
              style={{
                flex: 1,
                backgroundColor: COLORS.primary,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: BORDER_RADIUS.lg,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: (isToggling || isDeleting) ? 0.5 : 1,
                ...SHADOWS.button,
              }}
            >
              <Ionicons name="create-outline" size={18} color={COLORS.text.inverse} style={{ marginRight: 6 }} />
              <Text style={{
                color: COLORS.text.inverse,
                fontSize: 14,
                fontWeight: '600'
              }}>
                Modifier
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleDeleteItem(item)}
              disabled={isToggling || isDeleting}
              style={[
                {
                  backgroundColor: COLORS.error,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: BORDER_RADIUS.lg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 48,
                  ...SHADOWS.button,
                },
                (isToggling || isDeleting) && { opacity: 0.5 }
              ]}
              activeOpacity={0.7}
            >
              {isDeleting ? (
                <ActivityIndicator 
                  size="small" 
                  color={COLORS.text.inverse} 
                />
              ) : (
                <Ionicons 
                  name="trash-outline" 
                  size={18} 
                  color={COLORS.text.inverse} 
                />
              )}
            </TouchableOpacity>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  // Composant d'état vide
  const renderEmptyState = () => (
    <View style={dynamicStyles.emptyState}>
      <View style={dynamicStyles.emptyStateIcon}>
        <Ionicons 
          name="restaurant-outline" 
          size={64} 
          color={COLORS.text.light} 
        />
      </View>
      <Text style={dynamicStyles.emptyStateTitle}>
        Aucun plat dans ce menu
      </Text>
      <Text style={dynamicStyles.emptyStateText}>
        Ajoutez votre premier plat pour commencer à recevoir des commandes
      </Text>
      <Button
        title="Ajouter un plat"
        onPress={() => router.push(`/menu/item/add?menuId=${menu?.id}&restaurantId=${menu?.restaurant}`)}
        variant="primary"
        leftIcon={<Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />}
      />
    </View>
  );

  if (isLoading) {
    return <Loading fullScreen text="Chargement du menu..." />;
  }

  if (!menu) {
    return (
      <View style={dynamicStyles.container}>
        <Header 
          title="Menu"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
          includeSafeArea={true}
        />
        <View style={dynamicStyles.emptyState}>
          <Ionicons 
            name="restaurant-outline" 
            size={64} 
            color={COLORS.text.light} 
            style={dynamicStyles.emptyStateIcon}
          />
          <Text style={dynamicStyles.emptyStateTitle}>Menu non trouvé</Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="outline"
            leftIcon={<Ionicons name="arrow-back" size={20} color={COLORS.primary} />}
          />
        </View>
      </View>
    );
  }

  const availableItems = menu.items.filter(item => item.is_available).length;
  const totalItems = menu.items.length;

  return (
    <View style={dynamicStyles.container}>
      <Header 
        title={menu.name}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="create-outline"
        onRightPress={() => router.push(`/menu/edit/${menu.id}` as any)}
        includeSafeArea={true}
      />
      
      {/* En-tête du menu */}
      <View style={dynamicStyles.headerCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: getResponsiveValue(SPACING.xs, screenType) }}>
          <Ionicons name="restaurant" size={28} color={COLORS.variants.secondary[600]} style={{ marginRight: 8 }} />
          <Text style={dynamicStyles.menuTitle}>{menu.name}</Text>
        </View>
        <Text style={dynamicStyles.menuMeta}>
          Créé le {new Date(menu.created_at).toLocaleDateString('fr-FR', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          })}
        </Text>
        
        {/* Statistiques */}
        <View style={dynamicStyles.statsContainer}>
          <View style={dynamicStyles.statItem}>
            <Ionicons name="albums-outline" size={24} color={COLORS.primary} style={{ marginBottom: 4 }} />
            <Text style={dynamicStyles.statValue}>{totalItems}</Text>
            <Text style={dynamicStyles.statLabel}>Total</Text>
          </View>
          <View style={[dynamicStyles.statItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.border.golden }]}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.success} style={{ marginBottom: 4 }} />
            <Text style={[dynamicStyles.statValue, { color: COLORS.success }]}>
              {availableItems}
            </Text>
            <Text style={dynamicStyles.statLabel}>Disponibles</Text>
          </View>
          <View style={dynamicStyles.statItem}>
            <Ionicons name="close-circle" size={24} color={COLORS.error} style={{ marginBottom: 4 }} />
            <Text style={[dynamicStyles.statValue, { color: COLORS.error }]}>
              {totalItems - availableItems}
            </Text>
            <Text style={dynamicStyles.statLabel}>Masqués</Text>
          </View>
        </View>
        
        <Button
          title="Ajouter un plat"
          onPress={() => router.push(`/menu/item/add?menuId=${menu.id}&restaurantId=${menu.restaurant}`)}
          variant="primary"
          fullWidth
          leftIcon={<Ionicons name="add-circle-outline" size={20} color={COLORS.text.inverse} />}
          style={{ marginTop: getResponsiveValue(SPACING.sm, screenType) }}
        />
      </View>

      {/* Liste des plats */}
      <FlatList
        data={menu.items}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          dynamicStyles.listContainer,
          { paddingBottom: Math.max(getResponsiveValue(SPACING.lg, screenType), insets.bottom) }
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
      />
    </View>
  );
}