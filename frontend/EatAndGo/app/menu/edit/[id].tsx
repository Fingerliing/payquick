import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// UI Components
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';

// Services & Types
import { menuService } from '@/services/menuService';
import { Menu, UpdateMenuRequest } from '@/types/menu';

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

export default function EditMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);
  const insets = useSafeAreaInsets();
  
  // État
  const [menu, setMenu] = useState<Menu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    loadMenu();
  }, [id]);

  const loadMenu = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const menuData = await menuService.getMenu(parseInt(id));
      setMenu(menuData);
      setName(menuData.name || '');
    } catch (error) {
      console.error('Erreur lors du chargement du menu:', error);
      Alert.alert('Erreur', 'Impossible de charger le menu');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom du menu est requis');
      return;
    }

    if (!id) return;

    setIsSaving(true);
    try {
      const updateData: UpdateMenuRequest = { 
        name: name.trim(),
      };
      
      const updatedMenu = await menuService.updateMenu(parseInt(id), updateData);
      setMenu(updatedMenu);
      Alert.alert('Succès', 'Menu mis à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder le menu');
    } finally {
      setIsSaving(false);
    }
  };

  // Fonction pour déterminer si le menu est disponible (gestion legacy)
  const isMenuAvailable = (): boolean => {
    if (typeof menu?.is_available === 'boolean') {
      return menu.is_available;
    }
    if (typeof (menu as any)?.disponible === 'boolean') {
      return (menu as any).disponible;
    }
    return false;
  };

  const handleToggleAvailability = async () => {
    if (!menu) return;

    setIsToggling(true);
    try {
      const result = await menuService.toggleMenuAvailability(menu.id);
      
      // Rechargement du menu pour avoir les données à jour
      await loadMenu();
      
      // Afficher le message de succès
      Alert.alert(
        'Succès', 
        result.message || (result.is_available 
          ? 'Menu activé avec succès (les autres menus ont été désactivés)'
          : 'Menu désactivé avec succès')
      );
      
    } catch (error: any) {
      console.error('Erreur lors du toggle:', error);
      
      // Afficher un message d'erreur plus détaillé
      let errorMessage = 'Impossible de modifier la disponibilité';
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
      setIsToggling(false);
    }
  };

  // Styles dynamiques avec SafeArea intégrée
  const dynamicStyles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
      paddingBottom: insets.bottom, // SafeArea bottom
    },
    scrollContainer: {
      flexGrow: 1,
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingTop: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: Math.max(getResponsiveValue(SPACING.lg, screenType), insets.bottom),
    },
    cardSpacing: {
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    sectionTitle: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold as any,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    statusBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: getResponsiveValue(SPACING.md, screenType),
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    statusBadgeAvailable: {
      backgroundColor: COLORS.variants.primary[100],
      borderWidth: 1,
      borderColor: COLORS.success,
    },
    statusBadgeUnavailable: {
      backgroundColor: '#FEE2E2',
      borderWidth: 1,
      borderColor: COLORS.error,
    },
    statusText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium as any,
      textAlign: 'center' as const,
      marginLeft: getResponsiveValue(SPACING.xs, screenType),
    },
    statusTextAvailable: {
      color: COLORS.success,
    },
    statusTextUnavailable: {
      color: COLORS.error,
    },
    inputContainer: {
      gap: getResponsiveValue(SPACING.md, screenType),
    },
    infoText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      color: COLORS.text.secondary,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType) * 1.4,
    },
    statisticsContainer: {
      flexDirection: 'row' as const,
      justifyContent: 'space-around' as const,
      paddingVertical: getResponsiveValue(SPACING.md, screenType),
    },
    statisticItem: {
      alignItems: 'center' as const,
      flex: 1,
    },
    statisticValue: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
      fontWeight: TYPOGRAPHY.fontWeight.bold as any,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    statisticLabel: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
      color: COLORS.text.light,
      textAlign: 'center' as const,
      lineHeight: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType) * 1.3,
    },
    buttonGroup: {
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(SPACING['2xl'], screenType),
      paddingBottom: insets.bottom + getResponsiveValue(SPACING['2xl'], screenType),
    },
    emptyStateText: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
      color: COLORS.text.light,
      textAlign: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    actionButtonsContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingTop: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: Math.max(getResponsiveValue(SPACING.lg, screenType), insets.bottom),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
      ...SHADOWS.sm,
    },
  };

  if (isLoading) {
    return <Loading fullScreen text="Chargement du menu..." />;
  }

  if (!menu) {
    return (
      <View style={dynamicStyles.container}>
        <Header 
          title="Modifier le menu"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
          includeSafeArea={true}
        />
        <View style={dynamicStyles.emptyState}>
          <Ionicons 
            name="restaurant-outline" 
            size={64} 
            color={COLORS.text.light} 
            style={{ marginBottom: getResponsiveValue(SPACING.md, screenType) }}
          />
          <Text style={dynamicStyles.emptyStateText}>
            Menu non trouvé
          </Text>
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

  const menuAvailable = isMenuAvailable();
  const availableItems = menu.items?.filter(item => item.is_available !== false).length || 0;
  const unavailableItems = menu.items?.filter(item => item.is_available === false).length || 0;
  const totalItems = menu.items?.length || 0;

  return (
    <View style={dynamicStyles.container}>
      <Header 
        title="Modifier le menu"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="checkmark-outline"
        onRightPress={handleSave}
        includeSafeArea={true}
      />
      
      <ScrollView 
        contentContainerStyle={dynamicStyles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Statut du menu */}
        <Card variant="outlined" style={dynamicStyles.cardSpacing}>
          <View style={[
            dynamicStyles.statusBadge,
            menuAvailable ? dynamicStyles.statusBadgeAvailable : dynamicStyles.statusBadgeUnavailable
          ]}>
            <Ionicons 
              name={menuAvailable ? "checkmark-circle" : "pause-circle"} 
              size={24} 
              color={menuAvailable ? COLORS.success : COLORS.error} 
            />
            <Text style={[
              dynamicStyles.statusText,
              menuAvailable ? dynamicStyles.statusTextAvailable : dynamicStyles.statusTextUnavailable
            ]}>
              {menuAvailable
                ? 'Ce menu est actuellement visible par les clients'
                : "Ce menu n'est pas visible par les clients"}
            </Text>
          </View>
        </Card>

        {/* Informations du menu */}
        <Card style={dynamicStyles.cardSpacing}>
          <Text style={dynamicStyles.sectionTitle}>
            Informations du menu
          </Text>
          
          <View style={dynamicStyles.inputContainer}>
            <Input
              label="Nom du menu *"
              placeholder="Nom du menu"
              value={name}
              onChangeText={setName}
              maxLength={100}
            />

            <Text style={dynamicStyles.infoText}>
              Créé le {new Date(menu.created_at).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
              {'\n'}
              {totalItems} plat(s) dans ce menu
            </Text>
          </View>
        </Card>

        {/* Actions sur le menu */}
        <Card style={dynamicStyles.cardSpacing}>
          <Text style={dynamicStyles.sectionTitle}>
            Actions
          </Text>
          
          <View style={dynamicStyles.buttonGroup}>
            {/* Toggle principal avec icône et style adaptatif */}
            <Button
              title={menuAvailable ? 'Désactiver ce menu' : 'Activer ce menu'}
              onPress={handleToggleAvailability}
              loading={isToggling}
              variant={menuAvailable ? 'destructive' : 'primary'}
              fullWidth
              leftIcon={
                isToggling ? (
                  <ActivityIndicator 
                    size="small" 
                    color={COLORS.text.inverse} 
                    style={{ marginRight: -4 }} 
                  />
                ) : (
                  <Ionicons 
                    name={menuAvailable ? 'pause-circle-outline' : 'play-circle-outline'} 
                    size={20} 
                    color={COLORS.text.inverse} 
                  />
                )
              }
            />

            <Button
              title="Gérer les plats"
              onPress={() => router.push(`/menu/${menu.id}` as any)}
              variant="outline"
              fullWidth
              leftIcon={<Ionicons name="restaurant-outline" size={20} color={COLORS.primary} />}
            />
          </View>
        </Card>

        {/* Statistiques du menu */}
        {totalItems > 0 && (
          <Card variant="premium" style={dynamicStyles.cardSpacing}>
            <Text style={[dynamicStyles.sectionTitle, { color: COLORS.text.golden }]}>
              Statistiques
            </Text>
            
            <View style={dynamicStyles.statisticsContainer}>
              <View style={dynamicStyles.statisticItem}>
                <Text style={dynamicStyles.statisticValue}>
                  {totalItems}
                </Text>
                <Text style={dynamicStyles.statisticLabel}>
                  Plats{'\n'}totaux
                </Text>
              </View>
              
              <View style={dynamicStyles.statisticItem}>
                <Text style={[dynamicStyles.statisticValue, { color: COLORS.success }]}>
                  {availableItems}
                </Text>
                <Text style={dynamicStyles.statisticLabel}>
                  Plats{'\n'}disponibles
                </Text>
              </View>
              
              <View style={dynamicStyles.statisticItem}>
                <Text style={[dynamicStyles.statisticValue, { color: COLORS.error }]}>
                  {unavailableItems}
                </Text>
                <Text style={dynamicStyles.statisticLabel}>
                  Plats{'\n'}indisponibles
                </Text>
              </View>
            </View>
          </Card>
        )}
      </ScrollView>

      {/* Actions fixes en bas avec SafeArea */}
      <View style={dynamicStyles.actionButtonsContainer}>
        <Button
          title="Sauvegarder les modifications"
          onPress={handleSave}
          loading={isSaving}
          variant="primary"
          fullWidth
          leftIcon={
            isSaving ? (
              <ActivityIndicator 
                size="small" 
                color={COLORS.text.inverse} 
                style={{ marginRight: -4 }} 
              />
            ) : (
              <Ionicons 
                name="checkmark-circle-outline" 
                size={20} 
                color={COLORS.text.inverse} 
              />
            )
          }
        />
      </View>
    </View>
  );
}