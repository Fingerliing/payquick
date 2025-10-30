import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { UpdateRestaurantData, CuisineType, OpeningHours } from '@/types/restaurant';
import * as ImagePicker from 'expo-image-picker';
import { 
  useScreenType, 
  getResponsiveValue, 
  createResponsiveStyles,
  COLORS, 
  SPACING, 
  BORDER_RADIUS,
  TYPOGRAPHY,
  SHADOWS,
} from '@/utils/designSystem';
import { MultiPeriodHoursEditor } from '@/components/restaurant/OpeningHoursEditor';
import { Alert as InlineAlert } from '@/components/ui/Alert';

// Hook personnalisé pour la gestion de l'édition
const useRestaurantEditing = (restaurant: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateRestaurantData & { openingHours?: OpeningHours[] }>({
    name: '',
    description: '',
    address: '',
    city: '',
    zipCode: '',
    phone: '',
    email: '',
    website: '',
    cuisine: 'french' as CuisineType,
    priceRange: 2,
    accepts_meal_vouchers: false,
    meal_voucher_info: '',
    openingHours: []
  });

  useEffect(() => {
    if (restaurant && !isEditing) {
      setEditForm({
        name: restaurant.name || '',
        description: restaurant.description || '',
        address: restaurant.address || '',
        city: restaurant.city || '',
        zipCode: restaurant.zipCode || '',
        phone: restaurant.phone || '',
        email: restaurant.email || '',
        website: restaurant.website || '',
        cuisine: restaurant.cuisine || 'french',
        priceRange: restaurant.priceRange || 2,
        accepts_meal_vouchers: restaurant.accepts_meal_vouchers || false,
        meal_voucher_info: restaurant.meal_voucher_info || '',
        openingHours: restaurant.opening_hours || restaurant.openingHours || []
      });
    }
  }, [restaurant, isEditing]);

  const updateField = useCallback((field: keyof (UpdateRestaurantData & { openingHours?: OpeningHours[] }), value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  }, []);

  return {
    isEditing,
    setIsEditing,
    editForm,
    setEditForm,
    updateField
  };
};

// Hook personnalisé pour la fermeture temporaire
const useTemporaryClose = () => {
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({ reason: '', duration: '' });
  const [isClosing, setIsClosing] = useState(false);

  const resetCloseForm = useCallback(() => {
    setCloseForm({ reason: '', duration: '' });
  }, []);

  return {
    showCloseModal,
    setShowCloseModal,
    closeForm,
    setCloseForm,
    isClosing,
    setIsClosing,
    resetCloseForm
  };
};

const RestaurantDetailPage = () => {
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  
  const { 
    currentRestaurant, 
    isLoading, 
    error, 
    loadRestaurant, 
    updateRestaurant,
    clearCurrentRestaurant 
  } = useRestaurant();

  // Hooks responsifs
  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);

  // Toast / Alert custom
  const [toast, setToast] = useState<{
    visible: boolean;
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({ visible: false, variant: 'info', message: '' });

  const showToast = (
    variant: 'success' | 'error' | 'warning' | 'info',
    message: string,
    title?: string
  ) => setToast({ visible: true, variant, message, title });

  const hideToast = () => setToast((p) => ({ ...p, visible: false }));

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    cardSpacing: getResponsiveValue(SPACING.lg, screenType),
    imageHeight: getResponsiveValue(
      { mobile: 220, tablet: 280, desktop: 320 },
      screenType
    ),
    maxContentWidth: screenType === 'desktop' ? 1200 : undefined,
  };

  const fontSize = {
    title: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
    subtitle: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    body: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    small: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
  };

  // Fonction pour obtenir les horaires par défaut
  const getDefaultHours = (): OpeningHours[] => {
    return Array.from({ length: 7 }, (_, dayIndex) => ({
      dayOfWeek: dayIndex,
      isClosed: dayIndex === 0,
      periods: dayIndex === 0 ? [] : [{
        startTime: '12:00',
        endTime: '14:00',
        name: 'Déjeuner'
      }, {
        startTime: '19:00',
        endTime: '22:00',
        name: 'Dîner'
      }]
    }));
  };

  // Hooks personnalisés
  const { isEditing, setIsEditing, editForm, updateField } = useRestaurantEditing(currentRestaurant);
  const { 
    showCloseModal, 
    setShowCloseModal, 
    closeForm, 
    setCloseForm, 
    isClosing, 
    setIsClosing,
    resetCloseForm 
  } = useTemporaryClose();

  const [refreshing, setRefreshing] = useState(false);
  const [showHoursEditModal, setShowHoursEditModal] = useState(false);
  const [tempHours, setTempHours] = useState<OpeningHours[]>([]);

  // Charger le restaurant au montage
  useEffect(() => {
    if (id && typeof id === 'string') {
      loadRestaurant(id);
    }
    return () => clearCurrentRestaurant();
  }, [id]);

  // Gestionnaires d'événements mémorisés
  const handleEditSubmit = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      showToast('error', 'ID du restaurant invalide', 'Erreur');
      return;
    }
  
    try {
      await updateRestaurant(id, editForm);
      setIsEditing(false);
      showToast('success', 'Restaurant mis à jour avec succès', 'Succès');
    } catch (e) {
      console.error('❌ Erreur:', e);
      showToast('error', 'Impossible de mettre à jour le restaurant', 'Erreur');
    }
  }, [id, editForm, updateRestaurant]);

  const handleOpenHoursModal = useCallback(() => {
    let currentHours = editForm.openingHours || currentRestaurant?.opening_hours || currentRestaurant?.openingHours || [];
    
    if (!currentHours || currentHours.length !== 7) {
      currentHours = getDefaultHours();
    }
    
    currentHours = currentHours.map((day, index) => {
      if (!day || typeof day !== 'object') {
        return {
          dayOfWeek: index,
          isClosed: index === 0,
          periods: index === 0 ? [] : [
            { startTime: '12:00', endTime: '14:00', name: 'Déjeuner' },
            { startTime: '19:00', endTime: '22:00', name: 'Dîner' }
          ]
        };
      }
      
      if (!Array.isArray(day.periods)) {
        day.periods = [];
      }
      
      return {
        dayOfWeek: day.dayOfWeek ?? index,
        isClosed: day.isClosed ?? false,
        periods: day.periods || []
      };
    });
    
    setTempHours(currentHours);
    setShowHoursEditModal(true);
  }, [editForm.openingHours, currentRestaurant]);

  const handleSaveHours = useCallback(async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      const updatedData = {
        ...editForm,
        openingHours: tempHours,
      };
      
      await updateRestaurant(id, updatedData);
      updateField('openingHours', tempHours);
      setShowHoursEditModal(false);
      showToast('success', 'Horaires enregistrés', 'Succès');
    } catch (e) {
      console.error('❌ Erreur:', e);
      showToast('error', 'Impossible de sauvegarder les horaires', 'Erreur');
    }
  }, [tempHours, editForm, id, updateRestaurant, updateField]);

  const handleCloseHoursModal = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      setShowHoursEditModal(false);
      return;
    }
  
    const prevHours =
      editForm.openingHours ||
      currentRestaurant?.opening_hours ||
      currentRestaurant?.openingHours ||
      [];
  
    const hasChanges = JSON.stringify(tempHours) !== JSON.stringify(prevHours);
  
    if (hasChanges) {
      try {
        await handleSaveHours();
      } catch {
        // Erreur déjà gérée
      }
    } else {
      setShowHoursEditModal(false);
    }
  }, [id, tempHours, editForm.openingHours, currentRestaurant, handleSaveHours]);

  const effectiveHours = useMemo(() => {
    const uiHours = editForm.openingHours ?? [];
    if (Array.isArray(uiHours) && uiHours.length === 7) return uiHours;
  
    const ctxHours = currentRestaurant?.opening_hours || currentRestaurant?.openingHours || [];
    return Array.isArray(ctxHours) ? ctxHours : [];
  }, [editForm.openingHours, currentRestaurant]);

  const handleCloseRestaurant = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      showToast('error', 'ID du restaurant invalide', 'Erreur');
      return;
    }

    if (!closeForm.reason.trim()) {
      showToast('error', 'Veuillez indiquer une raison pour la fermeture', 'Erreur');
      return;
    }
    
    setIsClosing(true);
    try {
      const response = await fetch(`/api/restaurants/${id}/manual_close/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: closeForm.reason,
          duration_hours: closeForm.duration ? parseInt(closeForm.duration) : null
        })
      });
      
      if (response.ok) {
        await loadRestaurant(id);
        setShowCloseModal(false);
        resetCloseForm();
        showToast('success', 'Restaurant fermé temporairement', 'Succès');
      } else {
        showToast('error', 'Impossible de fermer le restaurant', 'Erreur');
      }
    } catch (e) {
      console.error('Erreur lors de la fermeture:', e);
      showToast('error', 'Impossible de fermer le restaurant', 'Erreur');
    } finally {
      setIsClosing(false);
    }
  }, [id, closeForm, loadRestaurant, resetCloseForm]);

  const handleReopenRestaurant = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      showToast('error', 'ID du restaurant invalide', 'Erreur');
      return;
    }

    try {
      const response = await fetch(`/api/restaurants/${id}/manual_reopen/`, {
        method: 'POST'
      });
      
      if (response.ok) {
        await loadRestaurant(id);
        showToast('success', 'Restaurant rouvert', 'Succès');
      } else {
        showToast('error', 'Impossible de rouvrir le restaurant', 'Erreur');
      }
    } catch (e) {
      console.error('Erreur lors de la réouverture:', e);
      showToast('error', 'Impossible de rouvrir le restaurant', 'Erreur');
    }
  }, [id, loadRestaurant]);

  const handleImagePicker = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      showToast('error', 'ID du restaurant invalide', 'Erreur');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const formData = new FormData();
        formData.append('image', {
          uri: asset.uri,
          type: 'image/jpeg',
          name: 'restaurant-image.jpg',
        } as any);
        
        try {
          const response = await fetch(`/api/restaurants/${id}/upload_image/`, {
            method: 'POST',
            body: formData,
            headers: {
              'Content-Type': 'multipart/form-data',
            }
          });
          
          if (response.ok) {
            await loadRestaurant(id);
            showToast('success', 'Image mise à jour', 'Succès');
          } else {
            showToast('error', "Impossible de mettre à jour l'image", 'Erreur');
          }
        } catch (e) {
          console.error('Erreur upload image:', e);
          showToast('error', "Impossible de mettre à jour l'image", 'Erreur');
        }
      }
    } catch (e) {
      console.error('Erreur sélection image:', e);
      showToast('error', 'Erreur lors de la sélection de l’image', 'Erreur');
    }
  }, [id, loadRestaurant]);

  const onRefresh = useCallback(async () => {
    if (!id || typeof id !== 'string') return;
    
    setRefreshing(true);
    try {
      await loadRestaurant(id);
    } catch (e) {
      console.error('Erreur lors du refresh:', e);
    } finally {
      setRefreshing(false);
    }
  }, [id, loadRestaurant]);

  // État de statut mémorisé
  const statusBadge = useMemo(() => {
    if (!currentRestaurant) return null;
    
    if (currentRestaurant.isManuallyOverridden) {
      return { 
        text: 'Fermé temporairement', 
        icon: 'close-circle',
        color: COLORS.error, 
        backgroundColor: '#FEE2E2',
        borderColor: COLORS.error
      };
    }
    
    if (currentRestaurant.can_receive_orders) {
      return { 
        text: 'Ouvert aux commandes', 
        icon: 'checkmark-circle',
        color: COLORS.success, 
        backgroundColor: '#D1FAE5',
        borderColor: COLORS.success
      };
    }
    
    return { 
      text: 'Configuration requise', 
      icon: 'alert-circle',
      color: COLORS.warning, 
      backgroundColor: COLORS.variants.secondary[50],
      borderColor: COLORS.variants.secondary[300]
    };
  }, [currentRestaurant]);

  // Styles dynamiques améliorés
  const dynamicStyles = useMemo(() => ({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    content: {
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
      paddingHorizontal: layoutConfig.containerPadding,
    },

    scrollContent: {
      paddingTop: layoutConfig.containerPadding * 1.5,
      paddingBottom: layoutConfig.containerPadding + 30,
    },

    headerSection: {
      marginBottom: layoutConfig.cardSpacing * 1.5,
    },

    statusBadge: {
      alignSelf: 'flex-start' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: BORDER_RADIUS.full,
      marginBottom: layoutConfig.cardSpacing,
      backgroundColor: statusBadge?.backgroundColor || COLORS.variants.secondary[100],
      borderWidth: 1.5,
      borderColor: statusBadge?.borderColor || COLORS.variants.secondary[300],
      ...SHADOWS.sm,
    },

    statusBadgeText: {
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: statusBadge?.color || COLORS.text.secondary,
      fontSize: fontSize.small,
      marginLeft: 6,
    },

    layoutContainer: {
      flexDirection: screenType === 'tablet' ? ('column' as const) : ('column' as const),
      gap: layoutConfig.cardSpacing * 1.5,
      alignItems: 'flex-start' as const,
    },

    mainColumn: {
      flex: 1,
      width: '100%' as const,
    },

    sideColumn: {
      flex: 1,
      minWidth: 300,
      maxWidth: 450,
      width: '100%' as const,
    },

    card: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.card, screenType) + 4,
      marginBottom: layoutConfig.cardSpacing,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      ...SHADOWS.card,
    },

    premiumCard: {
      backgroundColor: COLORS.goldenSurface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.card, screenType) + 4,
      marginBottom: layoutConfig.cardSpacing,
      borderWidth: 1.5,
      borderColor: COLORS.border.golden,
      ...SHADOWS.premiumCard,
    },

    alertCard: {
      borderLeftWidth: 4,
      borderLeftColor: COLORS.error,
      backgroundColor: '#FEF2F2',
      marginBottom: layoutConfig.cardSpacing,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.card, screenType) + 4,
      borderWidth: 1,
      borderColor: '#FEE2E2',
      ...SHADOWS.md,
    },

    sectionTitle: {
      fontSize: fontSize.subtitle,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: layoutConfig.cardSpacing * 0.75,
      letterSpacing: -0.3,
    },

    sectionTitleWithDivider: {
      fontSize: fontSize.subtitle,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      paddingBottom: 12,
      marginBottom: layoutConfig.cardSpacing * 0.75,
      borderBottomWidth: 2,
      borderBottomColor: COLORS.variants.secondary[100],
    },

    imageContainer: {
      position: 'relative' as const,
      marginBottom: layoutConfig.cardSpacing * 0.75,
    },

    restaurantImage: {
      width: '100%' as const,
      height: layoutConfig.imageHeight,
      borderRadius: BORDER_RADIUS.xl,
    },

    imagePlaceholder: {
      width: '100%' as const,
      height: layoutConfig.imageHeight,
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.xl,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      borderWidth: 2,
      borderColor: COLORS.border.golden,
      borderStyle: 'dashed' as const,
    },

    inputLabel: {
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: 6,
      fontSize: fontSize.small,
    },

    textInput: {
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: COLORS.surface,
      color: COLORS.text.primary,
      fontSize: fontSize.body,
      ...SHADOWS.sm,
    },

    textInputMultiline: {
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: COLORS.surface,
      color: COLORS.text.primary,
      textAlignVertical: 'top' as const,
      minHeight: 100,
      fontSize: fontSize.body,
      ...SHADOWS.sm,
    },

    actionButtonsContainer: {
      flexDirection: 'row' as const,
      marginBottom: layoutConfig.cardSpacing * 1.5,
      gap: layoutConfig.cardSpacing / 2,
    },

    infoRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      marginBottom: layoutConfig.cardSpacing * 0.75,
      paddingVertical: 4,
    },

    infoIconContainer: {
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: COLORS.variants.secondary[50],
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      marginRight: 12,
    },

    infoContent: {
      flex: 1,
    },

    infoLabel: {
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.secondary,
      fontSize: fontSize.small,
      marginBottom: 2,
    },

    infoValue: {
      color: COLORS.text.primary,
      fontSize: fontSize.body,
      lineHeight: fontSize.body * 1.4,
    },

    scheduleRow: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 6,
      backgroundColor: COLORS.variants.secondary[50],
    },

    dayLabel: {
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      minWidth: 70,
      fontSize: fontSize.body,
    },

    scheduleInfo: {
      flex: 1,
      marginLeft: 12,
    },

    scheduleTime: {
      color: COLORS.text.primary,
      fontSize: fontSize.small,
      lineHeight: fontSize.small * 1.5,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: layoutConfig.containerPadding,
    },

    modalContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS['2xl'],
      padding: 24,
      width: '100%' as const,
      maxWidth: screenType === 'desktop' ? 600 : undefined,
      maxHeight: '90%' as const,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      ...SHADOWS.xl,
    },

    modalTitle: {
      fontSize: fontSize.subtitle + 2,
      fontWeight: TYPOGRAPHY.fontWeight.bold,
      color: COLORS.text.primary,
      marginBottom: layoutConfig.cardSpacing,
    },

    modalActions: {
      flexDirection: 'row' as const,
      gap: layoutConfig.cardSpacing * 0.75,
      marginTop: layoutConfig.cardSpacing * 1.5,
    },

    quickActionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: 14,
      backgroundColor: COLORS.variants.secondary[50],
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      marginBottom: 8,
      ...SHADOWS.sm,
    },

    quickActionIcon: {
      fontSize: 22,
      marginRight: 14,
    },

    quickActionText: {
      fontSize: fontSize.body,
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      flex: 1,
    },

    divider: {
      height: 1,
      backgroundColor: COLORS.border.light,
      marginVertical: layoutConfig.cardSpacing * 0.75,
    },

    goldenDivider: {
      height: 2,
      backgroundColor: COLORS.variants.secondary[200],
      marginVertical: layoutConfig.cardSpacing,
    },
  }), [
    layoutConfig, 
    fontSize, 
    statusBadge, 
    screenType
  ]);

  // États de chargement et d'erreur
  if (isLoading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <Header title="Restaurant" showBackButton onLeftPress={() => router.back()} />
        <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
          {toast.visible && (
            <InlineAlert
              variant={toast.variant}
              title={toast.title}
              message={toast.message}
              onDismiss={hideToast}
              autoDismiss
            />
          )}
        </View>
        <Loading fullScreen text="Chargement du restaurant..." />
      </SafeAreaView>
    );
  }

  if (error || !currentRestaurant) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <Header title="Restaurant" showBackButton onLeftPress={() => router.back()} />
        <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
          {toast.visible && (
            <InlineAlert
              variant={toast.variant}
              title={toast.title}
              message={toast.message}
              onDismiss={hideToast}
              autoDismiss
            />
          )}
        </View>
        <View style={[dynamicStyles.content, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="restaurant-outline" size={64} color={COLORS.text.light} style={{ marginBottom: 16 }} />
          <Text style={[dynamicStyles.sectionTitle, { textAlign: 'center', marginBottom: 8 }]}>
            Restaurant non trouvé
          </Text>
          <Text style={[dynamicStyles.infoValue, { textAlign: 'center', marginBottom: 20, color: COLORS.text.secondary }]}>
            Ce restaurant n'existe pas ou vous n'y avez pas accès.
          </Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="primary"
            fullWidth
          />
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={dynamicStyles.container}>
      <Header 
        title={currentRestaurant.name} 
        showBackButton
        onLeftPress={() => router.back()}
      />

      <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
        {toast.visible && (
          <InlineAlert
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onDismiss={hideToast}
            autoDismiss
          />
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={dynamicStyles.content}>
          <View style={dynamicStyles.scrollContent}>
            
            {/* Header Section */}
            <View style={dynamicStyles.headerSection}>
              {/* Badge de statut */}
              <View style={dynamicStyles.statusBadge}>
                <Ionicons 
                  name={statusBadge?.icon as any || 'information-circle'} 
                  size={18} 
                  color={statusBadge?.color || COLORS.text.secondary} 
                />
                <Text style={dynamicStyles.statusBadgeText}>
                  {statusBadge?.text || 'Statut inconnu'}
                </Text>
              </View>

              {/* Alerte fermeture temporaire */}
              {currentRestaurant.isManuallyOverridden && (
                <Card style={dynamicStyles.alertCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Ionicons name="warning" size={24} color={COLORS.error} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[dynamicStyles.infoValue, { fontWeight: '700', color: '#991B1B', marginBottom: 6 }]}>
                        Restaurant fermé temporairement
                      </Text>
                      <Text style={[dynamicStyles.infoValue, { color: '#7F1D1D', marginBottom: 4 }]}>
                        {currentRestaurant.manualOverrideReason}
                      </Text>
                      {currentRestaurant.manualOverrideUntil && (
                        <Text style={[dynamicStyles.infoValue, { color: '#991B1B', fontSize: fontSize.small }]}>
                          Jusqu'au: {new Date(currentRestaurant.manualOverrideUntil).toLocaleString()}
                        </Text>
                      )}
                    </View>
                  </View>
                </Card>
              )}

              {/* Boutons d'action */}
              <View style={dynamicStyles.actionButtonsContainer}>
                {currentRestaurant.isManuallyOverridden ? (
                  <Button
                    title="Rouvrir le restaurant"
                    onPress={handleReopenRestaurant}
                    variant="primary"
                    fullWidth
                    leftIcon={<Ionicons name="checkmark-circle" size={22} color={COLORS.text.inverse} />}
                  />
                ) : (
                  <Button
                    title="Fermer temporairement"
                    onPress={() => setShowCloseModal(true)}
                    variant="destructive"
                    fullWidth
                    leftIcon={<Ionicons name="close-circle" size={22} color={COLORS.text.inverse} />}
                  />
                )}
              </View>
            </View>

            {/* Layout principal responsive */}
            <View style={dynamicStyles.layoutContainer}>
              
              {/* Colonne principale */}
              <View style={dynamicStyles.mainColumn}>
                
                {/* Image du restaurant */}
                <Card style={dynamicStyles.premiumCard}>
                  <Text style={dynamicStyles.sectionTitleWithDivider}>
                    Photo du restaurant
                  </Text>
                  
                  {currentRestaurant.image_url ? (
                    <View>
                      <View style={dynamicStyles.imageContainer}>
                        <Image 
                          source={{ uri: currentRestaurant.image_url }} 
                          style={dynamicStyles.restaurantImage}
                          resizeMode="cover"
                        />
                      </View>
                      <Button
                        title="Changer la photo"
                        onPress={handleImagePicker}
                        variant="outline"
                        leftIcon={<Ionicons name="camera" size={20} color={COLORS.primary} />}
                        fullWidth
                      />
                    </View>
                  ) : (
                    <View>
                      <View style={dynamicStyles.imagePlaceholder}>
                        <Ionicons 
                          name="camera" 
                          size={screenType === 'mobile' ? 56 : 72} 
                          color={COLORS.variants.secondary[400]} 
                        />
                        <Text style={[dynamicStyles.infoValue, { marginTop: 12, color: COLORS.text.secondary }]}>
                          Ajoutez une photo
                        </Text>
                      </View>
                      <View style={{ marginTop: layoutConfig.cardSpacing * 0.75 }}>
                        <Button
                          title="Ajouter une photo"
                          onPress={handleImagePicker}
                          variant="primary"
                          leftIcon={<Ionicons name="add-circle" size={20} color={COLORS.text.inverse} />}
                          fullWidth
                        />
                      </View>
                    </View>
                  )}
                </Card>

                {/* Informations générales */}
                <Card style={dynamicStyles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: layoutConfig.cardSpacing * 0.75 }}>
                    <Text style={dynamicStyles.sectionTitleWithDivider}>
                      Informations générales
                    </Text>
                    {!isEditing && (
                      <TouchableOpacity 
                        onPress={() => setIsEditing(true)}
                        style={{
                          padding: 8,
                          borderRadius: BORDER_RADIUS.md,
                          backgroundColor: COLORS.variants.secondary[50],
                          borderWidth: 1,
                          borderColor: COLORS.border.golden,
                        }}
                      >
                        <Ionicons name="create" size={20} color={COLORS.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {isEditing ? (
                    <View style={{ gap: layoutConfig.cardSpacing * 0.75 }}>
                      <View>
                        <Text style={dynamicStyles.inputLabel}>Nom du restaurant</Text>
                        <TextInput
                          value={editForm.name}
                          onChangeText={(text) => updateField('name', text)}
                          style={dynamicStyles.textInput}
                          placeholder="Nom du restaurant"
                        />
                      </View>
                      
                      <View>
                        <Text style={dynamicStyles.inputLabel}>Description</Text>
                        <TextInput
                          value={editForm.description}
                          onChangeText={(text) => updateField('description', text)}
                          multiline
                          numberOfLines={4}
                          style={dynamicStyles.textInputMultiline}
                          placeholder="Description du restaurant"
                        />
                      </View>
                      
                      <View style={dynamicStyles.divider} />
                      
                      <View>
                        <Text style={dynamicStyles.inputLabel}>Adresse</Text>
                        <TextInput
                          value={editForm.address}
                          onChangeText={(text) => updateField('address', text)}
                          style={dynamicStyles.textInput}
                          placeholder="Adresse"
                        />
                      </View>
                      
                      <View style={{ 
                        flexDirection: screenType === 'mobile' ? 'column' : 'row',
                        gap: layoutConfig.cardSpacing * 0.5
                      }}>
                        <View style={{ flex: screenType === 'mobile' ? 1 : 2 }}>
                          <Text style={dynamicStyles.inputLabel}>Ville</Text>
                          <TextInput
                            value={editForm.city}
                            onChangeText={(text) => updateField('city', text)}
                            style={dynamicStyles.textInput}
                            placeholder="Ville"
                          />
                        </View>
                        
                        <View style={{ flex: 1 }}>
                          <Text style={dynamicStyles.inputLabel}>Code postal</Text>
                          <TextInput
                            value={editForm.zipCode}
                            onChangeText={(text) => updateField('zipCode', text)}
                            style={dynamicStyles.textInput}
                            placeholder="Code postal"
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                      
                      <View style={dynamicStyles.divider} />
                      
                      <View style={{ 
                        flexDirection: 'row',
                        gap: layoutConfig.cardSpacing * 0.5
                      }}>
                        <View style={{ flex: 1 }}>
                          <Text style={dynamicStyles.inputLabel}>Téléphone</Text>
                          <TextInput
                            value={editForm.phone}
                            onChangeText={(text) => updateField('phone', text)}
                            style={dynamicStyles.textInput}
                            placeholder="Téléphone"
                            keyboardType="phone-pad"
                          />
                        </View>
                        
                        <View style={{ flex: 1 }}>
                          <Text style={dynamicStyles.inputLabel}>Email</Text>
                          <TextInput
                            value={editForm.email}
                            onChangeText={(text) => updateField('email', text)}
                            style={dynamicStyles.textInput}
                            placeholder="Email"
                            keyboardType="email-address"
                          />
                        </View>
                      </View>
                      
                      <View style={dynamicStyles.goldenDivider} />
                      
                      <Button
                        title="Modifier les horaires d'ouverture"
                        onPress={handleOpenHoursModal}
                        variant="outline"
                        leftIcon={<Ionicons name="time" size={20} color={COLORS.primary} />}
                        fullWidth
                      />
                      
                      <View style={dynamicStyles.divider} />
                      
                      <View style={{ 
                        flexDirection: 'row',
                        gap: layoutConfig.cardSpacing * 0.5,
                        marginTop: layoutConfig.cardSpacing * 0.5
                      }}>
                        <View style={{ flex: 1 }}>
                          <Button
                            title="Annuler"
                            onPress={() => setIsEditing(false)}
                            variant="outline"
                            fullWidth
                          />
                        </View>
                        
                        <View style={{ flex: 1 }}>
                          <Button
                            title="Sauvegarder"
                            onPress={handleEditSubmit}
                            variant="primary"
                            leftIcon={<Ionicons name="save" size={20} color={COLORS.text.inverse} />}
                            fullWidth
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={{ gap: 4 }}>
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoIconContainer}>
                          <Ionicons name="location" size={18} color={COLORS.variants.secondary[600]} />
                        </View>
                        <View style={dynamicStyles.infoContent}>
                          <Text style={dynamicStyles.infoLabel}>Adresse</Text>
                          <Text style={dynamicStyles.infoValue}>
                            {currentRestaurant.address}, {currentRestaurant.zipCode} {currentRestaurant.city}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoIconContainer}>
                          <Ionicons name="call" size={18} color={COLORS.variants.secondary[600]} />
                        </View>
                        <View style={dynamicStyles.infoContent}>
                          <Text style={dynamicStyles.infoLabel}>Téléphone</Text>
                          <Text style={dynamicStyles.infoValue}>{currentRestaurant.phone}</Text>
                        </View>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoIconContainer}>
                          <Ionicons name="mail" size={18} color={COLORS.variants.secondary[600]} />
                        </View>
                        <View style={dynamicStyles.infoContent}>
                          <Text style={dynamicStyles.infoLabel}>Email</Text>
                          <Text style={dynamicStyles.infoValue}>{currentRestaurant.email}</Text>
                        </View>
                      </View>
                      
                      {currentRestaurant.website && (
                        <View style={dynamicStyles.infoRow}>
                          <View style={dynamicStyles.infoIconContainer}>
                            <Ionicons name="globe" size={18} color={COLORS.variants.secondary[600]} />
                          </View>
                          <View style={dynamicStyles.infoContent}>
                            <Text style={dynamicStyles.infoLabel}>Site web</Text>
                            <Text style={[dynamicStyles.infoValue, { color: COLORS.primary }]}>
                              {currentRestaurant.website}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      <View style={dynamicStyles.divider} />
                      
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoIconContainer}>
                          <Ionicons name="restaurant" size={18} color={COLORS.variants.secondary[600]} />
                        </View>
                        <View style={dynamicStyles.infoContent}>
                          <Text style={dynamicStyles.infoLabel}>Type de cuisine</Text>
                          <Text style={[dynamicStyles.infoValue, { textTransform: 'capitalize' }]}>
                            {currentRestaurant.cuisine}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoIconContainer}>
                          <Text style={{ fontSize: 18 }}>€</Text>
                        </View>
                        <View style={dynamicStyles.infoContent}>
                          <Text style={dynamicStyles.infoLabel}>Gamme de prix</Text>
                          <Text style={[dynamicStyles.infoValue, { color: COLORS.secondary, fontWeight: '700', fontSize: fontSize.subtitle }]}>
                            {'€'.repeat(currentRestaurant.priceRange)}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <View style={dynamicStyles.infoIconContainer}>
                          <Ionicons name="star" size={18} color={COLORS.variants.secondary[600]} />
                        </View>
                        <View style={dynamicStyles.infoContent}>
                          <Text style={dynamicStyles.infoLabel}>Note moyenne</Text>
                          <Text style={dynamicStyles.infoValue}>
                            ⭐ {currentRestaurant.rating || 0} ({currentRestaurant.reviewCount || 0} avis)
                          </Text>
                        </View>
                      </View>
                      
                      {currentRestaurant.accepts_meal_vouchers && (
                        <>
                          <View style={dynamicStyles.divider} />
                          <View style={dynamicStyles.infoRow}>
                            <View style={dynamicStyles.infoIconContainer}>
                              <Ionicons name="card" size={18} color={COLORS.success} />
                            </View>
                            <View style={dynamicStyles.infoContent}>
                              <Text style={dynamicStyles.infoLabel}>Titres-restaurant</Text>
                              <Text style={[dynamicStyles.infoValue, { color: COLORS.success, fontWeight: '600' }]}>
                                ✓ Acceptés
                              </Text>
                              {currentRestaurant.meal_voucher_info && (
                                <Text style={[dynamicStyles.infoValue, { fontSize: fontSize.small, marginTop: 4, color: COLORS.text.secondary }]}>
                                  {currentRestaurant.meal_voucher_info}
                                </Text>
                              )}
                            </View>
                          </View>
                        </>
                      )}
                      
                      {currentRestaurant.description && (
                        <>
                          <View style={dynamicStyles.divider} />
                          <View style={dynamicStyles.infoRow}>
                            <View style={dynamicStyles.infoIconContainer}>
                              <Ionicons name="document-text" size={18} color={COLORS.variants.secondary[600]} />
                            </View>
                            <View style={dynamicStyles.infoContent}>
                              <Text style={dynamicStyles.infoLabel}>Description</Text>
                              <Text style={dynamicStyles.infoValue}>{currentRestaurant.description}</Text>
                            </View>
                          </View>
                        </>
                      )}
                    </View>
                  )}
                </Card>
              </View>

              {/* Colonne secondaire */}
              <View style={dynamicStyles.sideColumn}>
                {renderSideContent()}
              </View>
              
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modal de fermeture temporaire */}
      <Modal
        visible={showCloseModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCloseModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Ionicons name="warning" size={28} color={COLORS.error} style={{ marginRight: 12 }} />
              <Text style={dynamicStyles.modalTitle}>
                Fermer temporairement
              </Text>
            </View>
            
            <Text style={[dynamicStyles.infoValue, { marginBottom: layoutConfig.cardSpacing, color: COLORS.text.secondary }]}>
              Cette action fermera votre restaurant aux nouvelles commandes. Vous pourrez le rouvrir à tout moment.
            </Text>
            
            <View style={{ marginBottom: layoutConfig.cardSpacing }}>
              <Text style={dynamicStyles.inputLabel}>
                Raison de la fermeture *
              </Text>
              <TextInput
                value={closeForm.reason}
                onChangeText={(text) => setCloseForm({...closeForm, reason: text})}
                multiline
                numberOfLines={3}
                style={dynamicStyles.textInputMultiline}
                placeholder="Ex: Vacances, travaux, problème technique..."
              />
            </View>
            
            <View style={{ marginBottom: layoutConfig.cardSpacing }}>
              <Text style={dynamicStyles.inputLabel}>
                Durée (optionnel)
              </Text>
              <TextInput
                value={closeForm.duration}
                onChangeText={(text) => setCloseForm({...closeForm, duration: text})}
                style={dynamicStyles.textInput}
                placeholder="Heures (ex: 24 pour 1 jour)"
                keyboardType="numeric"
              />
            </View>
            
            <View style={dynamicStyles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Annuler"
                  onPress={() => setShowCloseModal(false)}
                  variant="outline"
                  fullWidth
                />
              </View>
              
              <View style={{ flex: 1 }}>
                <Button
                  title={isClosing ? 'Fermeture...' : 'Confirmer'}
                  onPress={handleCloseRestaurant}
                  disabled={!closeForm.reason.trim() || isClosing}
                  loading={isClosing}
                  variant="destructive"
                  fullWidth
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal d'édition des horaires */}
      <Modal
        visible={showHoursEditModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseHoursModal}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ 
            flex: 1, 
            backgroundColor: COLORS.surface, 
            marginTop: 50,
            borderTopLeftRadius: BORDER_RADIUS['2xl'],
            borderTopRightRadius: BORDER_RADIUS['2xl'],
          }}>
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border.light,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="time" size={24} color={COLORS.primary} style={{ marginRight: 12 }} />
                <Text style={dynamicStyles.modalTitle}>
                  Horaires d'ouverture
                </Text>
              </View>
              <TouchableOpacity onPress={handleCloseHoursModal}>
                <Ionicons name="close" size={28} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={{ flex: 1 }} 
              contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {tempHours.length === 7 ? (
                <MultiPeriodHoursEditor
                  openingHours={tempHours}
                  onChange={(newHours) => {
                    setTempHours(newHours);
                  }}
                />
              ) : (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.text.secondary }}>
                    Initialisation des horaires...
                  </Text>
                </View>
              )}
            </ScrollView>
            
            <View style={{ 
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: COLORS.surface,
              padding: 20,
              borderTopWidth: 1,
              borderTopColor: COLORS.border.light,
              ...SHADOWS.lg,
            }}>
              <Button
                title="Fermer"
                onPress={handleCloseHoursModal}
                variant="primary"
                fullWidth
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );

  function renderSideContent() {
    if (!currentRestaurant) return null;
    return (
      <>
        {/* Horaires d'ouverture */}
        {effectiveHours && effectiveHours.length > 0 && (
          <Card style={dynamicStyles.premiumCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: layoutConfig.cardSpacing * 0.75 }}>
              <Text style={dynamicStyles.sectionTitleWithDivider}>
                Horaires d'ouverture
              </Text>
              {isEditing && (
                <TouchableOpacity onPress={handleOpenHoursModal}>
                  <Ionicons name="create" size={22} color={COLORS.primary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={{ gap: 4 }}>
              {effectiveHours.map((hours: any) => (
                <View key={hours.dayOfWeek} style={dynamicStyles.scheduleRow}>
                  <Text style={dynamicStyles.dayLabel}>
                    {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][hours.dayOfWeek]}
                  </Text>
                  <View style={dynamicStyles.scheduleInfo}>
                    {hours.isClosed ? (
                      <Text style={[dynamicStyles.scheduleTime, { color: COLORS.text.secondary, fontStyle: 'italic' }]}>Fermé</Text>
                    ) : hours.periods && hours.periods.length > 0 ? (
                      <View>
                        {hours.periods.map((p: any, idx: number) => (
                          <View key={idx}>
                            <Text style={dynamicStyles.scheduleTime}>
                              {p.startTime} - {p.endTime}
                              {p.name && (
                                <Text style={[dynamicStyles.scheduleTime, { color: COLORS.text.secondary, fontStyle: 'italic' }]}>
                                  {' '}({p.name})
                                </Text>
                              )}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[dynamicStyles.scheduleTime, { color: COLORS.text.secondary }]}>Non défini</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Statistiques */}
        <Card style={dynamicStyles.premiumCard}>
          <Text style={dynamicStyles.sectionTitleWithDivider}>
            Statistiques & Informations
          </Text>
          
          <View style={{ gap: 12 }}>
            {/* Paiements Stripe - Highlight */}
            <View style={{
              backgroundColor: currentRestaurant.is_stripe_active ? COLORS.variants.secondary[50] : '#FEF2F2',
              padding: 16,
              borderRadius: BORDER_RADIUS.lg,
              borderWidth: 1.5,
              borderColor: currentRestaurant.is_stripe_active ? COLORS.border.golden : '#FEE2E2',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{
                  width: 36,
                  height: 36,
                  borderRadius: BORDER_RADIUS.md,
                  backgroundColor: currentRestaurant.is_stripe_active ? COLORS.variants.secondary[100] : '#FEE2E2',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}>
                  <Ionicons 
                    name={currentRestaurant.is_stripe_active ? "card" : "card-outline"} 
                    size={20} 
                    color={currentRestaurant.is_stripe_active ? COLORS.variants.secondary[600] : COLORS.error} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[dynamicStyles.infoLabel, { marginBottom: 2 }]}>
                    Paiements en ligne
                  </Text>
                  <Text style={{
                    fontSize: fontSize.body,
                    fontWeight: TYPOGRAPHY.fontWeight.bold,
                    color: currentRestaurant.is_stripe_active ? COLORS.success : COLORS.error,
                  }}>
                    {currentRestaurant.is_stripe_active ? 'Stripe activé' : 'Stripe inactif'}
                  </Text>
                </View >
                <Ionicons 
                  name={currentRestaurant.is_stripe_active ? "checkmark-circle" : "close-circle"} 
                  size={28} 
                  color={currentRestaurant.is_stripe_active ? COLORS.success : COLORS.error} 
                />
              </View>
              {!currentRestaurant.is_stripe_active && (
                <Text style={{
                  fontSize: fontSize.small,
                  color: COLORS.text.secondary,
                  fontStyle: 'italic',
                }}>
                  Configurez Stripe pour accepter les paiements en ligne
                </Text>
              )}
            </View>

            <View style={dynamicStyles.divider} />

            {/* Stats Grid */}
            <View style={{ gap: 10 }}>
              {/* Note et avis */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                backgroundColor: COLORS.variants.secondary[50],
                borderRadius: BORDER_RADIUS.md,
              }}>
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: BORDER_RADIUS.sm,
                  backgroundColor: COLORS.variants.secondary[100],
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}>
                  <Ionicons name="star" size={18} color={COLORS.variants.secondary[600]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[dynamicStyles.infoLabel, { fontSize: fontSize.small - 1 }]}>
                    Note moyenne
                  </Text>
                  <Text style={{
                    fontSize: fontSize.body,
                    fontWeight: TYPOGRAPHY.fontWeight.semibold,
                    color: COLORS.text.primary,
                  }}>
                    {currentRestaurant.rating && typeof currentRestaurant.rating === 'number' 
                      ? `${currentRestaurant.rating.toFixed(1)} / 5` 
                      : 'Aucune note'}
                  </Text>
                </View>
                <View style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: BORDER_RADIUS.sm,
                  backgroundColor: COLORS.surface,
                }}>
                  <Text style={{
                    fontSize: fontSize.small,
                    color: COLORS.text.secondary,
                    fontWeight: TYPOGRAPHY.fontWeight.medium,
                  }}>
                    {currentRestaurant.reviewCount || 0} avis
                  </Text>
                </View>
              </View>

              {/* Commandes acceptées */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                backgroundColor: COLORS.variants.secondary[50],
                borderRadius: BORDER_RADIUS.md,
              }}>
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: BORDER_RADIUS.sm,
                  backgroundColor: currentRestaurant.can_receive_orders ? '#D1FAE5' : '#FEE2E2',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}>
                  <Ionicons 
                    name={currentRestaurant.can_receive_orders ? "checkmark-circle" : "close-circle"} 
                    size={18} 
                    color={currentRestaurant.can_receive_orders ? COLORS.success : COLORS.error} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[dynamicStyles.infoLabel, { fontSize: fontSize.small - 1 }]}>
                    Statut des commandes
                  </Text>
                  <Text style={{
                    fontSize: fontSize.body,
                    fontWeight: TYPOGRAPHY.fontWeight.semibold,
                    color: currentRestaurant.can_receive_orders ? COLORS.success : COLORS.error,
                  }}>
                    {currentRestaurant.can_receive_orders ? 'Accepte les commandes' : 'Fermé'}
                  </Text>
                </View>
              </View>

              {/* Titres-restaurant */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                backgroundColor: COLORS.variants.secondary[50],
                borderRadius: BORDER_RADIUS.md,
              }}>
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: BORDER_RADIUS.sm,
                  backgroundColor: currentRestaurant.accepts_meal_vouchers ? '#D1FAE5' : COLORS.variants.secondary[100],
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}>
                  <Ionicons 
                    name="ticket" 
                    size={18} 
                    color={currentRestaurant.accepts_meal_vouchers ? COLORS.success : COLORS.text.secondary} 
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[dynamicStyles.infoLabel, { fontSize: fontSize.small - 1 }]}>
                    Titres-restaurant
                  </Text>
                  <Text style={{
                    fontSize: fontSize.body,
                    fontWeight: TYPOGRAPHY.fontWeight.semibold,
                    color: currentRestaurant.accepts_meal_vouchers ? COLORS.success : COLORS.text.secondary,
                  }}>
                    {currentRestaurant.accepts_meal_vouchers ? 'Acceptés' : 'Non acceptés'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={dynamicStyles.divider} />

            {/* Dates */}
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.text.secondary} style={{ marginRight: 8 }} />
                  <Text style={[dynamicStyles.infoLabel, { fontSize: fontSize.small - 1 }]}>
                    Créé le
                  </Text>
                </View>
                <Text style={[dynamicStyles.infoValue, { fontSize: fontSize.small }]}>
                  {new Date(currentRestaurant.createdAt).toLocaleDateString('fr-FR', { 
                    day: 'numeric', 
                    month: 'short', 
                    year: 'numeric' 
                  })}
                </Text>
              </View>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="time-outline" size={16} color={COLORS.text.secondary} style={{ marginRight: 8 }} />
                  <Text style={[dynamicStyles.infoLabel, { fontSize: fontSize.small - 1 }]}>
                    Modifié le
                  </Text>
                </View>
                <Text style={[dynamicStyles.infoValue, { fontSize: fontSize.small }]}>
                  {new Date(currentRestaurant.updatedAt).toLocaleDateString('fr-FR', { 
                    day: 'numeric', 
                    month: 'short', 
                    year: 'numeric' 
                  })}
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Actions rapides */}
        <Card style={dynamicStyles.card}>
          <Text style={dynamicStyles.sectionTitleWithDivider}>
            Actions rapides
          </Text>
          
          <View>
            <TouchableOpacity 
              style={dynamicStyles.quickActionButton}
              onPress={() => router.push(`/(restaurant)/qrcodes`)}
            >
              <Text style={dynamicStyles.quickActionIcon}>🪑</Text>
              <Text style={dynamicStyles.quickActionText}>Gérer les tables</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={dynamicStyles.quickActionButton}
              onPress={() => router.push(`/(restaurant)/menu`)}
            >
              <Text style={dynamicStyles.quickActionIcon}>🍽️</Text>
              <Text style={dynamicStyles.quickActionText}>Gérer les menus</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={dynamicStyles.quickActionButton}
              onPress={() => router.push(`/(restaurant)/orders`)}
            >
              <Text style={dynamicStyles.quickActionIcon}>📋</Text>
              <Text style={dynamicStyles.quickActionText}>Voir les commandes</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
            </TouchableOpacity>
          </View>
        </Card>
      </>
    );
  }
};

export default RestaurantDetailPage;