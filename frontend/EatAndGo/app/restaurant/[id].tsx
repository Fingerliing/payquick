import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  RefreshControl,
  Image,
  Modal,
  Switch,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
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
  const { width } = useWindowDimensions();
  const styles = createResponsiveStyles(screenType);

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    cardSpacing: getResponsiveValue(SPACING.lg, screenType),
    imageHeight: getResponsiveValue(
      { mobile: 200, tablet: 250, desktop: 300 },
      screenType
    ),
    isTabletLandscape: screenType === 'tablet' && width > 1000,
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
      isClosed: dayIndex === 0, // Fermé le dimanche par défaut
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
      Alert.alert('Erreur', 'ID du restaurant invalide');
      return;
    }

    try {
      // Préparer les données avec les horaires
      const updateData = {
        ...editForm,
        opening_hours: editForm.openingHours, // Ajouter les horaires pour le backend
      };
      
      await updateRestaurant(id, updateData);
      setIsEditing(false);
      setShowHoursEditModal(false);
      Alert.alert('Succès', 'Restaurant mis à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le restaurant');
    }
  }, [id, editForm, updateRestaurant]);

  const handleOpenHoursModal = useCallback(() => {
    // Initialiser les horaires temporaires avec les horaires actuels ou par défaut
    let currentHours = editForm.openingHours || currentRestaurant?.opening_hours || currentRestaurant?.openingHours || [];
    
    // S'assurer que nous avons bien 7 jours avec la bonne structure
    if (!currentHours || currentHours.length !== 7) {
      currentHours = getDefaultHours();
    }
    
    // Vérifier et corriger la structure de chaque jour
    currentHours = currentHours.map((day, index) => {
      // Si le jour n'a pas la bonne structure, le corriger
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
      
      // S'assurer que periods est un tableau
      if (!Array.isArray(day.periods)) {
        day.periods = [];
      }
      
      return {
        dayOfWeek: day.dayOfWeek ?? index,
        isClosed: day.isClosed ?? false,
        periods: day.periods || []
      };
    });
    
    console.log('Horaires initialisés:', currentHours);
    setTempHours(currentHours);
    setShowHoursEditModal(true);
  }, [editForm.openingHours, currentRestaurant]);

  const handleSaveHours = useCallback(() => {
    updateField('openingHours', tempHours);
    setShowHoursEditModal(false);
  }, [tempHours, updateField]);

  const handleCancelHours = useCallback(() => {
    setShowHoursEditModal(false);
    setTempHours([]);
  }, []);

  const handleCloseRestaurant = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      Alert.alert('Erreur', 'ID du restaurant invalide');
      return;
    }

    if (!closeForm.reason.trim()) {
      Alert.alert('Erreur', 'Veuillez indiquer une raison pour la fermeture');
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
        Alert.alert('Succès', 'Restaurant fermé temporairement');
      }
    } catch (error) {
      console.error('Erreur lors de la fermeture:', error);
      Alert.alert('Erreur', 'Impossible de fermer le restaurant');
    } finally {
      setIsClosing(false);
    }
  }, [id, closeForm, loadRestaurant, resetCloseForm]);

  const handleReopenRestaurant = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      Alert.alert('Erreur', 'ID du restaurant invalide');
      return;
    }

    try {
      const response = await fetch(`/api/restaurants/${id}/manual_reopen/`, {
        method: 'POST'
      });
      
      if (response.ok) {
        await loadRestaurant(id);
        Alert.alert('Succès', 'Restaurant rouvert');
      }
    } catch (error) {
      console.error('Erreur lors de la réouverture:', error);
      Alert.alert('Erreur', 'Impossible de rouvrir le restaurant');
    }
  }, [id, loadRestaurant]);

  const handleImagePicker = useCallback(async () => {
    if (!id || typeof id !== 'string') {
      Alert.alert('Erreur', 'ID du restaurant invalide');
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
            Alert.alert('Succès', 'Image mise à jour');
          }
        } catch (error) {
          console.error('Erreur upload image:', error);
          Alert.alert('Erreur', 'Impossible de mettre à jour l\'image');
        }
      }
    } catch (error) {
      console.error('Erreur sélection image:', error);
    }
  }, [id, loadRestaurant]);

  const onRefresh = useCallback(async () => {
    if (!id || typeof id !== 'string') return;
    
    setRefreshing(true);
    try {
      await loadRestaurant(id);
    } catch (error) {
      console.error('Erreur lors du refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [id, loadRestaurant]);

  // État de statut mémorisé
  const statusBadge = useMemo(() => {
    if (!currentRestaurant) return null;
    
    if (currentRestaurant.isManuallyOverridden) {
      return { text: 'Fermé temporairement', color: COLORS.error, backgroundColor: '#FEE2E2' };
    }
    
    if (currentRestaurant.can_receive_orders) {
      return { text: 'Ouvert aux commandes', color: COLORS.success, backgroundColor: '#D1FAE5' };
    }
    
    return { text: 'Configuration requise', color: COLORS.text.secondary, backgroundColor: COLORS.variants.secondary[100] };
  }, [currentRestaurant]);

  // Styles dynamiques pour l'optimisation
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
      paddingVertical: layoutConfig.containerPadding,
      paddingBottom: layoutConfig.containerPadding + 20,
    },

    // Layout responsive
    layoutContainer: {
      flexDirection: layoutConfig.isTabletLandscape ? 'row' as const : 'column' as const,
      gap: layoutConfig.cardSpacing,
      alignItems: 'flex-start' as const,
    },

    mainColumn: {
      flex: layoutConfig.isTabletLandscape ? 2 : 1,
      width: '100%' as const,
    },

    sideColumn: {
      flex: 1,
      minWidth: 300,
      maxWidth: 450,
      width: '100%' as const,
    },

    // Badge de statut
    statusBadge: {
      alignSelf: 'flex-start' as const,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.full,
      marginBottom: layoutConfig.cardSpacing,
      backgroundColor: statusBadge?.backgroundColor || COLORS.variants.secondary[100],
    },

    statusBadgeText: {
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: statusBadge?.color || COLORS.text.secondary,
      fontSize: fontSize.small,
    },

    // Cartes
    card: {
      ...styles.card,
      marginBottom: layoutConfig.cardSpacing,
    },

    alertCard: {
      borderLeftWidth: 4,
      borderLeftColor: COLORS.error,
      marginBottom: layoutConfig.cardSpacing,
      ...styles.card,
    },

    // Sections
    sectionTitle: {
      fontSize: fontSize.subtitle,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: layoutConfig.cardSpacing * 0.75,
    },

    // Image
    restaurantImage: {
      width: '100%' as const,
      height: layoutConfig.imageHeight,
      borderRadius: BORDER_RADIUS.lg,
    },

    imagePlaceholder: {
      width: '100%' as const,
      height: layoutConfig.imageHeight,
      backgroundColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.lg,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },

    // Formulaires
    inputLabel: {
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.primary,
      marginBottom: 4,
      fontSize: fontSize.small,
    },

    textInput: {
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: COLORS.surface,
      color: COLORS.text.primary,
      fontSize: fontSize.body,
    },

    textInputMultiline: {
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: COLORS.surface,
      color: COLORS.text.primary,
      textAlignVertical: 'top' as const,
      minHeight: 80,
      fontSize: fontSize.body,
    },

    // Actions
    actionButtonsContainer: {
      flexDirection: 'row' as const,
      marginBottom: layoutConfig.cardSpacing,
      gap: layoutConfig.cardSpacing / 2,
    },

    // Informations
    infoRow: {
      marginBottom: layoutConfig.cardSpacing * 0.75,
    },

    infoLabel: {
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.secondary,
      fontSize: fontSize.small,
    },

    infoValue: {
      color: COLORS.text.primary,
      fontSize: fontSize.body,
      marginTop: 2,
    },

    // Horaires
    scheduleRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: layoutConfig.cardSpacing * 0.25,
    },

    dayLabel: {
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.primary,
      minWidth: 60,
      fontSize: fontSize.body,
    },

    scheduleInfo: {
      flex: 1,
      marginLeft: 16,
    },

    scheduleTime: {
      color: COLORS.text.primary,
      fontSize: fontSize.small,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: COLORS.overlay,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: layoutConfig.containerPadding,
    },

    modalContainer: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: 20,
      width: '100%' as const,
      maxWidth: screenType === 'desktop' ? 600 : undefined,
      maxHeight: '90%' as const,
      ...SHADOWS.card,
    },

    modalTitle: {
      fontSize: fontSize.subtitle,
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: COLORS.text.primary,
      marginBottom: layoutConfig.cardSpacing,
    },

    modalActions: {
      flexDirection: 'row' as const,
      gap: layoutConfig.cardSpacing * 0.75,
      marginTop: layoutConfig.cardSpacing,
    },

    // Quick action buttons
    quickActionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: layoutConfig.cardSpacing * 0.75,
      backgroundColor: 'transparent' as const,
      borderRadius: BORDER_RADIUS.lg,
    },

    quickActionIcon: {
      fontSize: 20,
      marginRight: 12,
    },

    quickActionText: {
      fontSize: fontSize.body,
      color: COLORS.text.primary,
      fontWeight: TYPOGRAPHY.fontWeight.medium,
    },
  }), [
    layoutConfig, 
    fontSize, 
    statusBadge, 
    styles, 
    screenType
  ]);

  // États de chargement et d'erreur
  if (isLoading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <Header title="Restaurant" showBackButton onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement du restaurant..." />
      </SafeAreaView>
    );
  }

  if (error || !currentRestaurant) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <Header title="Restaurant" showBackButton onLeftPress={() => router.back()} />
        <View style={[dynamicStyles.content, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[dynamicStyles.sectionTitle, { textAlign: 'center', marginBottom: 8 }]}>
            Restaurant non trouvé
          </Text>
          <Text style={[dynamicStyles.infoValue, { textAlign: 'center', marginBottom: 20 }]}>
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
        rightIcon={isEditing ? "checkmark" : "create-outline"}
        onRightPress={isEditing ? handleEditSubmit : () => setIsEditing(true)}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={dynamicStyles.content}>
          <View style={dynamicStyles.scrollContent}>
            
            {/* Badge de statut */}
            <View style={dynamicStyles.statusBadge}>
              <Text style={dynamicStyles.statusBadgeText}>
                {statusBadge?.text || 'Statut inconnu'}
              </Text>
            </View>

            {/* Alerte fermeture temporaire */}
            {currentRestaurant.isManuallyOverridden && (
              <Card style={dynamicStyles.alertCard}>
                <Text style={[dynamicStyles.infoValue, { fontWeight: '600', color: '#991B1B', marginBottom: 4 }]}>
                  ⚠️ Restaurant fermé temporairement
                </Text>
                <Text style={[dynamicStyles.infoValue, { color: '#7F1D1D' }]}>
                  {currentRestaurant.manualOverrideReason}
                </Text>
                {currentRestaurant.manualOverrideUntil && (
                  <Text style={[dynamicStyles.infoValue, { color: '#991B1B', marginTop: 4 }]}>
                    Jusqu'au: {new Date(currentRestaurant.manualOverrideUntil).toLocaleString()}
                  </Text>
                )}
              </Card>
            )}

            {/* Boutons d'action */}
            <View style={dynamicStyles.actionButtonsContainer}>
              {currentRestaurant.isManuallyOverridden ? (
                <Button
                  title="Rouvrir"
                  onPress={handleReopenRestaurant}
                  variant="primary"
                  fullWidth
                  leftIcon={<Ionicons name="checkmark-circle-outline" size={20} color={COLORS.text.inverse} />}
                />
              ) : (
                <Button
                  title="Fermer temporairement"
                  onPress={() => setShowCloseModal(true)}
                  variant="destructive"
                  fullWidth
                  leftIcon={<Ionicons name="close-circle-outline" size={20} color={COLORS.error} />}
                />
              )}
            </View>

            {/* Layout principal responsive */}
            <View style={dynamicStyles.layoutContainer}>
              
              {/* Colonne principale */}
              <View style={dynamicStyles.mainColumn}>
                
                {/* Image du restaurant */}
                <Card style={dynamicStyles.card}>
                  <Text style={dynamicStyles.sectionTitle}>
                    Image du restaurant
                  </Text>
                  
                  {currentRestaurant.image_url ? (
                    <View>
                      <Image 
                        source={{ uri: currentRestaurant.image_url }} 
                        style={dynamicStyles.restaurantImage}
                        resizeMode="cover"
                      />
                      <View style={{ marginTop: layoutConfig.cardSpacing * 0.75 }}>
                        <Button
                          title="Changer l'image"
                          onPress={handleImagePicker}
                          variant="outline"
                          leftIcon={<Ionicons name="camera-outline" size={20} color={COLORS.primary} />}
                          fullWidth
                        />
                      </View>
                    </View>
                  ) : (
                    <View>
                      <View style={dynamicStyles.imagePlaceholder}>
                        <Ionicons 
                          name="camera-outline" 
                          size={screenType === 'mobile' ? 48 : 64} 
                          color={COLORS.text.secondary} 
                        />
                        <Text style={[dynamicStyles.infoValue, { marginTop: 8 }]}>Aucune image</Text>
                      </View>
                      <View style={{ marginTop: layoutConfig.cardSpacing * 0.75 }}>
                        <Button
                          title="Ajouter une image"
                          onPress={handleImagePicker}
                          variant="primary"
                          leftIcon={<Ionicons name="add-outline" size={20} color={COLORS.text.inverse} />}
                          fullWidth
                        />
                      </View>
                    </View>
                  )}
                </Card>

                {/* Informations générales */}
                <Card style={dynamicStyles.card}>
                  <Text style={dynamicStyles.sectionTitle}>
                    Informations générales
                  </Text>
                  
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
                          numberOfLines={3}
                          style={dynamicStyles.textInputMultiline}
                          placeholder="Description du restaurant"
                        />
                      </View>
                      
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
                      
                      {/* Bouton pour éditer les horaires */}
                      <View style={{ marginTop: layoutConfig.cardSpacing * 0.5 }}>
                        <Button
                          title="Modifier les horaires d'ouverture"
                          onPress={handleOpenHoursModal}
                          variant="outline"
                          leftIcon={<Ionicons name="time-outline" size={20} color={COLORS.primary} />}
                          fullWidth
                        />
                      </View>
                      
                      {/* Actions d'édition */}
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
                            leftIcon={<Ionicons name="save-outline" size={20} color={COLORS.text.inverse} />}
                            fullWidth
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <View style={{ gap: layoutConfig.cardSpacing * 0.75 }}>
                      <View style={dynamicStyles.infoRow}>
                        <Text style={dynamicStyles.infoLabel}>Adresse:</Text>
                        <Text style={dynamicStyles.infoValue}>
                          {currentRestaurant.address}, {currentRestaurant.zipCode} {currentRestaurant.city}
                        </Text>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <Text style={dynamicStyles.infoLabel}>Téléphone:</Text>
                        <Text style={dynamicStyles.infoValue}>{currentRestaurant.phone}</Text>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <Text style={dynamicStyles.infoLabel}>Email:</Text>
                        <Text style={dynamicStyles.infoValue}>{currentRestaurant.email}</Text>
                      </View>
                      
                      {currentRestaurant.website && (
                        <View style={dynamicStyles.infoRow}>
                          <Text style={dynamicStyles.infoLabel}>Site web:</Text>
                          <Text style={[dynamicStyles.infoValue, { color: COLORS.primary }]}>
                            {currentRestaurant.website}
                          </Text>
                        </View>
                      )}
                      
                      <View style={dynamicStyles.infoRow}>
                        <Text style={dynamicStyles.infoLabel}>Cuisine:</Text>
                        <Text style={[dynamicStyles.infoValue, { textTransform: 'capitalize' }]}>
                          {currentRestaurant.cuisine}
                        </Text>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <Text style={dynamicStyles.infoLabel}>Gamme de prix:</Text>
                        <Text style={[dynamicStyles.infoValue, { color: COLORS.secondary, fontWeight: '600' }]}>
                          {'€'.repeat(currentRestaurant.priceRange)}
                        </Text>
                      </View>
                      
                      <View style={dynamicStyles.infoRow}>
                        <Text style={dynamicStyles.infoLabel}>Note moyenne:</Text>
                        <Text style={dynamicStyles.infoValue}>
                          ⭐ {currentRestaurant.rating || 0} ({currentRestaurant.reviewCount || 0} avis)
                        </Text>
                      </View>
                      
                      {currentRestaurant.accepts_meal_vouchers && (
                        <View style={dynamicStyles.infoRow}>
                          <Text style={dynamicStyles.infoLabel}>Titres-restaurant:</Text>
                          <Text style={[dynamicStyles.infoValue, { color: COLORS.success, fontWeight: '500' }]}>
                            Acceptés
                          </Text>
                          {currentRestaurant.meal_voucher_info && (
                            <Text style={[dynamicStyles.infoValue, { fontSize: fontSize.small, marginTop: 2 }]}>
                              {currentRestaurant.meal_voucher_info}
                            </Text>
                          )}
                        </View>
                      )}
                      
                      {currentRestaurant.description && (
                        <View style={dynamicStyles.infoRow}>
                          <Text style={dynamicStyles.infoLabel}>Description:</Text>
                          <Text style={dynamicStyles.infoValue}>{currentRestaurant.description}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </Card>
              </View>

              {/* Colonne secondaire (tablette paysage uniquement) */}
              {layoutConfig.isTabletLandscape && (
                <View style={dynamicStyles.sideColumn}>
                  {renderSideContent()}
                </View>
              )}

              {/* Sections mobiles (si pas tablette paysage) */}
              {!layoutConfig.isTabletLandscape && renderSideContent()}
              
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modal de fermeture temporaire */}
      <Modal
        visible={showCloseModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCloseModal(false)}
      >
        <View style={dynamicStyles.modalOverlay}>
          <View style={dynamicStyles.modalContainer}>
            <Text style={dynamicStyles.modalTitle}>
              ⚠️ Fermer temporairement
            </Text>
            
            <Text style={[dynamicStyles.infoValue, { marginBottom: layoutConfig.cardSpacing }]}>
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
                  title={isClosing ? 'Fermeture...' : 'Fermer le restaurant'}
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
        onRequestClose={handleCancelHours}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.overlay }}>
          <View style={{ 
            flex: 1, 
            backgroundColor: COLORS.surface, 
            marginTop: 50,
            borderTopLeftRadius: BORDER_RADIUS.xl,
            borderTopRightRadius: BORDER_RADIUS.xl,
          }}>
            {/* En-tête de la modal */}
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border.light,
            }}>
              <Text style={dynamicStyles.modalTitle}>
                Modifier les horaires d'ouverture
              </Text>
              <TouchableOpacity onPress={handleCancelHours}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            
            {/* Contenu scrollable */}
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
                    console.log('Nouveaux horaires:', newHours);
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
            
            {/* Actions en bas */}
            <View style={{ 
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: COLORS.surface,
              padding: 20,
              borderTopWidth: 1,
              borderTopColor: COLORS.border.light,
              flexDirection: 'row',
              gap: layoutConfig.cardSpacing * 0.75,
            }}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Annuler"
                  onPress={handleCancelHours}
                  variant="outline"
                  fullWidth
                />
              </View>
              
              <View style={{ flex: 1 }}>
                <Button
                  title="Appliquer"
                  onPress={handleSaveHours}
                  variant="primary"
                  fullWidth
                />
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );

  // Fonction pour rendre le contenu de la colonne secondaire
  function renderSideContent() {
    if (!currentRestaurant) return null;
    return (
      <>
        {/* Horaires d'ouverture */}
        {currentRestaurant.opening_hours && currentRestaurant.opening_hours.length > 0 && (
          <Card style={dynamicStyles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: layoutConfig.cardSpacing * 0.5 }}>
              <Text style={dynamicStyles.sectionTitle}>
                Horaires d'ouverture
              </Text>
              {isEditing && (
                <TouchableOpacity onPress={handleOpenHoursModal}>
                  <Ionicons name="create-outline" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              )}
            </View>
            
            <View style={{ gap: layoutConfig.cardSpacing * 0.5 }}>
              {currentRestaurant.opening_hours.map((hours: any) => (
                <View key={hours.dayOfWeek} style={dynamicStyles.scheduleRow}>
                  <Text style={dynamicStyles.dayLabel}>
                    {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][hours.dayOfWeek]}
                  </Text>
                  <View style={dynamicStyles.scheduleInfo}>
                    {hours.isClosed ? (
                      <Text style={[dynamicStyles.scheduleTime, { color: COLORS.text.secondary }]}>Fermé</Text>
                    ) : hours.periods && hours.periods.length > 0 ? (
                      <View>
                        {hours.periods.map((period: any, idx: number) => (
                          <View key={idx}>
                            <Text style={dynamicStyles.scheduleTime}>
                              {period.startTime} - {period.endTime}
                              {period.name && (
                                <Text style={[dynamicStyles.scheduleTime, { color: COLORS.text.secondary }]}>
                                  {' '}({period.name})
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
        <Card style={dynamicStyles.card}>
          <Text style={dynamicStyles.sectionTitle}>
            Statistiques
          </Text>
          
          <View style={{ gap: layoutConfig.cardSpacing * 0.5 }}>
            <View style={dynamicStyles.scheduleRow}>
              <Text style={dynamicStyles.infoLabel}>Paiements Stripe</Text>
              <View style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: currentRestaurant.is_stripe_active ? '#D1FAE5' : '#FEE2E2',
              }}>
                <Text style={{
                  fontSize: fontSize.small,
                  color: currentRestaurant.is_stripe_active ? COLORS.success : COLORS.error,
                  fontWeight: '500'
                }}>
                  {currentRestaurant.is_stripe_active ? 'Actif' : 'Inactif'}
                </Text>
              </View>
            </View>
            
            <View style={dynamicStyles.scheduleRow}>
              <Text style={dynamicStyles.infoLabel}>Créé le</Text>
              <Text style={[dynamicStyles.infoValue, { fontSize: fontSize.small }]}>
                {new Date(currentRestaurant.createdAt).toLocaleDateString()}
              </Text>
            </View>
            
            <View style={dynamicStyles.scheduleRow}>
              <Text style={dynamicStyles.infoLabel}>Dernière modif.</Text>
              <Text style={[dynamicStyles.infoValue, { fontSize: fontSize.small }]}>
                {new Date(currentRestaurant.updatedAt).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </Card>

        {/* Actions rapides */}
        <Card style={dynamicStyles.card}>
          <Text style={dynamicStyles.sectionTitle}>
            Actions rapides
          </Text>
          
          <View style={{ gap: layoutConfig.cardSpacing * 0.5 }}>
            <Button
              title="Gérer les tables"
              onPress={() => router.push(`/(restaurant)/qrcodes`)}
              variant="ghost"
              leftIcon={<Text style={dynamicStyles.quickActionIcon}>👥</Text>}
              fullWidth
            />
            
            <Button
              title="Gérer les menus"
              onPress={() => router.push(`/(restaurant)/menu`)}
              variant="ghost"
              leftIcon={<Text style={dynamicStyles.quickActionIcon}>⚙️</Text>}
              fullWidth
            />
            
            <Button
              title="Voir les commandes"
              onPress={() => router.push(`/(restaurant)/orders`)}
              variant="ghost"
              leftIcon={<Text style={dynamicStyles.quickActionIcon}>🕒</Text>}
              fullWidth
            />
          </View>
        </Card>
      </>
    );
  }
};

export default RestaurantDetailPage;