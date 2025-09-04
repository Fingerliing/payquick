import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { UpdateRestaurantData, CuisineType } from '@/types/restaurant';
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
  COMPONENT_STYLES,
} from '@/utils/designSystem';

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

  // Configuration responsive avec le système designSystem.ts
  const screenType = useScreenType();
  const responsiveStyles = createResponsiveStyles(screenType);
  const isTabletLandscape = screenType === 'tablet';

  // Valeurs responsive avec getResponsiveValue
  const containerPadding = getResponsiveValue(SPACING.container, screenType);
  const cardSpacing = getResponsiveValue(SPACING.lg, screenType);
  const imageHeight = getResponsiveValue(
    { mobile: 200, tablet: 250, desktop: 300 },
    screenType
  );
  const fontSize = {
    title: getResponsiveValue(TYPOGRAPHY.fontSize['2xl'], screenType),
    subtitle: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    body: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    small: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
  };

  // États locaux pour l'édition
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdateRestaurantData>({
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
    meal_voucher_info: ''
  });
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({ reason: '', duration: '' });
  const [isClosing, setIsClosing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Charger le restaurant au montage
  useEffect(() => {
    if (id && typeof id === 'string') {
      loadRestaurant(id);
    }
    return () => clearCurrentRestaurant();
  }, [id]);

  // Initialiser le formulaire d'édition
  useEffect(() => {
    if (currentRestaurant && !isEditing) {
      setEditForm({
        name: currentRestaurant.name || '',
        description: currentRestaurant.description || '',
        address: currentRestaurant.address || '',
        city: currentRestaurant.city || '',
        zipCode: currentRestaurant.zipCode || '',
        phone: currentRestaurant.phone || '',
        email: currentRestaurant.email || '',
        website: currentRestaurant.website || '',
        cuisine: currentRestaurant.cuisine || 'french',
        priceRange: currentRestaurant.priceRange || 2,
        accepts_meal_vouchers: currentRestaurant.accepts_meal_vouchers || false,
        meal_voucher_info: currentRestaurant.meal_voucher_info || ''
      });
    }
  }, [currentRestaurant, isEditing]);

  // Gestionnaires d'événements
  const handleEditSubmit = async () => {
    if (!id || typeof id !== 'string') {
      Alert.alert('Erreur', 'ID du restaurant invalide');
      return;
    }

    try {
      await updateRestaurant(id, editForm);
      setIsEditing(false);
      Alert.alert('Succès', 'Restaurant mis à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le restaurant');
    }
  };

  const handleCloseRestaurant = async () => {
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
        setCloseForm({ reason: '', duration: '' });
        Alert.alert('Succès', 'Restaurant fermé temporairement');
      }
    } catch (error) {
      console.error('Erreur lors de la fermeture:', error);
      Alert.alert('Erreur', 'Impossible de fermer le restaurant');
    } finally {
      setIsClosing(false);
    }
  };

  const handleReopenRestaurant = async () => {
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
  };

  const handleImagePicker = async () => {
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
  };

  const onRefresh = async () => {
    if (!id || typeof id !== 'string') return;
    
    setRefreshing(true);
    try {
      await loadRestaurant(id);
    } catch (error) {
      console.error('Erreur lors du refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // États de chargement et d'erreur
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header title="Restaurant" showBackButton onBackPress={() => router.back()} />
        <Loading fullScreen text="Chargement du restaurant..." />
      </View>
    );
  }

  if (error || !currentRestaurant) {
    return (
      <View style={styles.container}>
        <Header title="Restaurant" showBackButton onBackPress={() => router.back()} />
        <View style={[styles.errorContainer, { padding: containerPadding }]}>
          <Text style={[styles.errorTitle, { fontSize: fontSize.subtitle }]}>
            Restaurant non trouvé
          </Text>
          <Text style={[styles.errorText, { fontSize: fontSize.body }]}>
            Ce restaurant n'existe pas ou vous n'y avez pas accès.
          </Text>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={[styles.errorButton, responsiveStyles.button]}
          >
            <Text style={[styles.errorButtonText, { fontSize: fontSize.body }]}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const getStatusBadge = () => {
    if (currentRestaurant.isManuallyOverridden) {
      return { text: 'Fermé temporairement', color: COLORS.error, backgroundColor: '#FEE2E2' };
    }
    
    if (currentRestaurant.can_receive_orders) {
      return { text: 'Ouvert aux commandes', color: COLORS.success, backgroundColor: '#D1FAE5' };
    }
    
    return { text: 'Configuration requise', color: COLORS.text.secondary, backgroundColor: COLORS.neutral[100] };
  };

  const statusBadge = getStatusBadge();

  return (
    <View style={styles.container}>
      <Header 
        title={currentRestaurant.name} 
        showBackButton
        onBackPress={() => router.back()}
        rightIcon={isEditing ? "checkmark" : "create-outline"}
        onRightPress={isEditing ? handleEditSubmit : () => setIsEditing(true)}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={styles.scrollView}
        contentContainerStyle={{ 
          padding: containerPadding,
          paddingBottom: containerPadding + 20 
        }}
      >
        {/* Layout principal responsive avec votre système */}
        <View style={[
          isTabletLandscape ? styles.tabletLayout : styles.mobileLayout
        ]}>
          {/* Colonne principale */}
          <View style={[
            isTabletLandscape ? styles.mainColumn : styles.fullWidth
          ]}>
            {/* Badge de statut */}
            <View style={{ marginBottom: cardSpacing }}>
              <View style={[
                styles.statusBadge,
                { backgroundColor: statusBadge.backgroundColor }
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  { color: statusBadge.color, fontSize: fontSize.small }
                ]}>
                  {statusBadge.text}
                </Text>
              </View>
            </View>

            {/* Alerte fermeture temporaire */}
            {currentRestaurant.isManuallyOverridden && (
              <Card style={[styles.alertCard, { marginBottom: cardSpacing }]}>
                <Text style={[styles.alertTitle, { fontSize: fontSize.body }]}>
                  ⚠️ Restaurant fermé temporairement
                </Text>
                <Text style={[styles.alertText, { fontSize: fontSize.small }]}>
                  {currentRestaurant.manualOverrideReason}
                </Text>
                {currentRestaurant.manualOverrideUntil && (
                  <Text style={[styles.alertDate, { fontSize: fontSize.small }]}>
                    Jusqu'au: {new Date(currentRestaurant.manualOverrideUntil).toLocaleString()}
                  </Text>
                )}
              </Card>
            )}

            {/* Boutons d'action avec système responsive */}
            <View style={[
              styles.actionButtonsContainer,
              { marginBottom: cardSpacing, gap: cardSpacing / 2 }
            ]}>
              {currentRestaurant.isManuallyOverridden ? (
                <TouchableOpacity
                  onPress={handleReopenRestaurant}
                  style={[styles.reopenButton, responsiveStyles.button]}
                >
                  <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>Rouvrir</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowCloseModal(true)}
                  style={[styles.closeButton, responsiveStyles.button]}
                >
                  <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>Fermer temporairement</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Image du restaurant optimisée */}
            <Card style={[responsiveStyles.card, { marginBottom: cardSpacing }]}>
              <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                Image du restaurant
              </Text>
              
              {currentRestaurant.image_url ? (
                <View>
                  <Image 
                    source={{ uri: currentRestaurant.image_url }} 
                    style={[
                      styles.restaurantImage,
                      { height: imageHeight }
                    ]}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={handleImagePicker}
                    style={[styles.imageButton, responsiveStyles.button, { marginTop: cardSpacing * 0.75 }]}
                  >
                    <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>Changer l'image</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={[
                    styles.imagePlaceholder,
                    { height: imageHeight }
                  ]}>
                    <Text style={[styles.placeholderIcon, { fontSize: screenType === 'mobile' ? 48 : 64 }]}>📷</Text>
                    <Text style={[styles.placeholderText, { fontSize: fontSize.body }]}>Aucune image</Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleImagePicker}
                    style={[styles.imageButton, responsiveStyles.button, { marginTop: cardSpacing * 0.75 }]}
                  >
                    <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>Ajouter une image</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>

            {/* Informations générales */}
            <Card style={[responsiveStyles.card, { marginBottom: cardSpacing }]}>
              <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                Informations générales
              </Text>
              
              {isEditing ? (
                <View style={{ gap: cardSpacing * 0.75 }}>
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                      Nom du restaurant
                    </Text>
                    <TextInput
                      value={editForm.name}
                      onChangeText={(text) => setEditForm({...editForm, name: text})}
                      style={[styles.textInput, { fontSize: fontSize.body }]}
                      placeholder="Nom du restaurant"
                    />
                  </View>
                  
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                      Description
                    </Text>
                    <TextInput
                      value={editForm.description}
                      onChangeText={(text) => setEditForm({...editForm, description: text})}
                      multiline
                      numberOfLines={3}
                      style={[styles.textInputMultiline, { fontSize: fontSize.body }]}
                      placeholder="Description du restaurant"
                    />
                  </View>
                  
                  <View>
                    <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                      Adresse
                    </Text>
                    <TextInput
                      value={editForm.address}
                      onChangeText={(text) => setEditForm({...editForm, address: text})}
                      style={[styles.textInput, { fontSize: fontSize.body }]}
                      placeholder="Adresse"
                    />
                  </View>
                  
                  <View style={[
                    screenType === 'mobile' ? styles.addressRowMobile : styles.addressRowTablet,
                    { gap: cardSpacing * 0.5 }
                  ]}>
                    <View style={{ flex: screenType === 'mobile' ? 1 : 2 }}>
                      <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                        Ville
                      </Text>
                      <TextInput
                        value={editForm.city}
                        onChangeText={(text) => setEditForm({...editForm, city: text})}
                        style={[styles.textInput, { fontSize: fontSize.body }]}
                        placeholder="Ville"
                      />
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                        Code postal
                      </Text>
                      <TextInput
                        value={editForm.zipCode}
                        onChangeText={(text) => setEditForm({...editForm, zipCode: text})}
                        style={[styles.textInput, { fontSize: fontSize.body }]}
                        placeholder="Code postal"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  
                  <View style={[
                    styles.contactRow,
                    { gap: cardSpacing * 0.5 }
                  ]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                        Téléphone
                      </Text>
                      <TextInput
                        value={editForm.phone}
                        onChangeText={(text) => setEditForm({...editForm, phone: text})}
                        style={[styles.textInput, { fontSize: fontSize.body }]}
                        placeholder="Téléphone"
                        keyboardType="phone-pad"
                      />
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                        Email
                      </Text>
                      <TextInput
                        value={editForm.email}
                        onChangeText={(text) => setEditForm({...editForm, email: text})}
                        style={[styles.textInput, { fontSize: fontSize.body }]}
                        placeholder="Email"
                        keyboardType="email-address"
                      />
                    </View>
                  </View>
                  
                  {/* Actions d'édition */}
                  <View style={[styles.editActions, { gap: cardSpacing * 0.5 }]}>
                    <TouchableOpacity
                      onPress={() => setIsEditing(false)}
                      style={[styles.cancelButton, responsiveStyles.button]}
                    >
                      <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>Annuler</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      onPress={handleEditSubmit}
                      style={[styles.saveButton, responsiveStyles.button]}
                    >
                      <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>Sauvegarder</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ gap: cardSpacing * 0.75 }}>
                  <View>
                    <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Adresse:</Text>
                    <Text style={[styles.infoValue, { fontSize: fontSize.body }]}>
                      {currentRestaurant.address}, {currentRestaurant.zipCode} {currentRestaurant.city}
                    </Text>
                  </View>
                  
                  <View>
                    <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Téléphone:</Text>
                    <Text style={[styles.infoValue, { fontSize: fontSize.body }]}>{currentRestaurant.phone}</Text>
                  </View>
                  
                  <View>
                    <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Email:</Text>
                    <Text style={[styles.infoValue, { fontSize: fontSize.body }]}>{currentRestaurant.email}</Text>
                  </View>
                  
                  {currentRestaurant.website && (
                    <View>
                      <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Site web:</Text>
                      <Text style={[styles.websiteLink, { fontSize: fontSize.body }]}>{currentRestaurant.website}</Text>
                    </View>
                  )}
                  
                  <View>
                    <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Cuisine:</Text>
                    <Text style={[styles.infoValue, { fontSize: fontSize.body, textTransform: 'capitalize' }]}>
                      {currentRestaurant.cuisine}
                    </Text>
                  </View>
                  
                  <View>
                    <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Gamme de prix:</Text>
                    <Text style={[styles.priceRange, { fontSize: fontSize.body }]}>
                      {'€'.repeat(currentRestaurant.priceRange)}
                    </Text>
                  </View>
                  
                  <View>
                    <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Note moyenne:</Text>
                    <Text style={[styles.infoValue, { fontSize: fontSize.body }]}>
                      ⭐ {currentRestaurant.rating || 0} ({currentRestaurant.reviewCount || 0} avis)
                    </Text>
                  </View>
                  
                  {currentRestaurant.accepts_meal_vouchers && (
                    <View>
                      <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Titres-restaurant:</Text>
                      <Text style={[styles.mealVoucherAccepted, { fontSize: fontSize.body }]}>Acceptés</Text>
                      {currentRestaurant.meal_voucher_info && (
                        <Text style={[styles.mealVoucherInfo, { fontSize: fontSize.small }]}>
                          {currentRestaurant.meal_voucher_info}
                        </Text>
                      )}
                    </View>
                  )}
                  
                  {currentRestaurant.description && (
                    <View>
                      <Text style={[styles.infoLabel, { fontSize: fontSize.small }]}>Description:</Text>
                      <Text style={[styles.infoValue, { fontSize: fontSize.body }]}>{currentRestaurant.description}</Text>
                    </View>
                  )}
                </View>
              )}
            </Card>
          </View>

          {/* Colonne secondaire (tablette paysage uniquement) */}
          {isTabletLandscape && (
            <View style={styles.sideColumn}>
              {/* Horaires d'ouverture */}
              {currentRestaurant.opening_hours && currentRestaurant.opening_hours.length > 0 && (
                <Card style={[responsiveStyles.card, { marginBottom: cardSpacing }]}>
                  <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                    Horaires d'ouverture
                  </Text>
                  
                  <View style={{ gap: cardSpacing * 0.5 }}>
                    {currentRestaurant.opening_hours.map((hours) => (
                      <View key={hours.dayOfWeek} style={styles.scheduleRow}>
                        <Text style={[styles.dayLabel, { fontSize: fontSize.body }]}>
                          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][hours.dayOfWeek]}
                        </Text>
                        <View style={styles.scheduleInfo}>
                          {hours.isClosed ? (
                            <Text style={[styles.closedText, { fontSize: fontSize.small }]}>Fermé</Text>
                          ) : hours.periods && hours.periods.length > 0 ? (
                            <View>
                              {hours.periods.map((period, idx) => (
                                <View key={idx}>
                                  <Text style={[styles.scheduleTime, { fontSize: fontSize.small }]}>
                                    {period.startTime} - {period.endTime}
                                    {period.name && (
                                      <Text style={[styles.schedulePeriod, { fontSize: fontSize.small }]}> ({period.name})</Text>
                                    )}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={[styles.notDefinedText, { fontSize: fontSize.small }]}>Non défini</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              )}

              {/* Statistiques */}
              <Card style={[responsiveStyles.card, { marginBottom: cardSpacing }]}>
                <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                  Statistiques
                </Text>
                
                <View style={{ gap: cardSpacing * 0.5 }}>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { fontSize: fontSize.small }]}>Paiements Stripe</Text>
                    <View style={[
                      styles.statusIndicator,
                      { backgroundColor: currentRestaurant.is_stripe_active ? COLORS.surface.golden : '#FEE2E2' }
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { 
                          fontSize: fontSize.small,
                          color: currentRestaurant.is_stripe_active ? COLORS.success : COLORS.error 
                        }
                      ]}>
                        {currentRestaurant.is_stripe_active ? 'Actif' : 'Inactif'}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { fontSize: fontSize.small }]}>Créé le</Text>
                    <Text style={[styles.statValue, { fontSize: fontSize.small }]}>
                      {new Date(currentRestaurant.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { fontSize: fontSize.small }]}>Dernière modif.</Text>
                    <Text style={[styles.statValue, { fontSize: fontSize.small }]}>
                      {new Date(currentRestaurant.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Actions rapides */}
              <Card style={responsiveStyles.card}>
                <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                  Actions rapides
                </Text>
                
                <View style={{ gap: cardSpacing * 0.5 }}>
                  <TouchableOpacity
                    onPress={() => router.push(`/(restaurant)/qrcodes`)}
                    style={styles.quickActionButton}
                  >
                    <Text style={[styles.quickActionIcon, { fontSize: fontSize.subtitle }]}>👥</Text>
                    <Text style={[styles.quickActionText, { fontSize: fontSize.body }]}>Gérer les tables</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => router.push(`/(restaurant)/menu`)}
                    style={styles.quickActionButton}
                  >
                    <Text style={[styles.quickActionIcon, { fontSize: fontSize.subtitle }]}>⚙️</Text>
                    <Text style={[styles.quickActionText, { fontSize: fontSize.body }]}>Gérer les menus</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => router.push(`/(restaurant)/orders`)}
                    style={styles.quickActionButton}
                  >
                    <Text style={[styles.quickActionIcon, { fontSize: fontSize.subtitle }]}>🕒</Text>
                    <Text style={[styles.quickActionText, { fontSize: fontSize.body }]}>Voir les commandes</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </View>
          )}

          {/* Sections mobiles (affichées uniquement en mobile/tablette portrait) */}
          {!isTabletLandscape && (
            <>
              {/* Horaires d'ouverture */}
              {currentRestaurant.opening_hours && currentRestaurant.opening_hours.length > 0 && (
                <Card style={[responsiveStyles.card, { marginBottom: cardSpacing }]}>
                  <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                    Horaires d'ouverture
                  </Text>
                  
                  <View style={{ gap: cardSpacing * 0.5 }}>
                    {currentRestaurant.opening_hours.map((hours) => (
                      <View key={hours.dayOfWeek} style={styles.scheduleRow}>
                        <Text style={[styles.dayLabel, { fontSize: fontSize.body }]}>
                          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][hours.dayOfWeek]}
                        </Text>
                        <View style={styles.scheduleInfo}>
                          {hours.isClosed ? (
                            <Text style={[styles.closedText, { fontSize: fontSize.small }]}>Fermé</Text>
                          ) : hours.periods && hours.periods.length > 0 ? (
                            <View>
                              {hours.periods.map((period, idx) => (
                                <View key={idx}>
                                  <Text style={[styles.scheduleTime, { fontSize: fontSize.small }]}>
                                    {period.startTime} - {period.endTime}
                                    {period.name && (
                                      <Text style={[styles.schedulePeriod, { fontSize: fontSize.small }]}> ({period.name})</Text>
                                    )}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={[styles.notDefinedText, { fontSize: fontSize.small }]}>Non défini</Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              )}

              {/* Statistiques */}
              <Card style={[responsiveStyles.card, { marginBottom: cardSpacing }]}>
                <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                  Statistiques
                </Text>
                
                <View style={{ gap: cardSpacing * 0.5 }}>
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { fontSize: fontSize.small }]}>Paiements Stripe</Text>
                    <View style={[
                      styles.statusIndicator,
                      { backgroundColor: currentRestaurant.is_stripe_active ? COLORS.surface.golden : '#FEE2E2' }
                    ]}>
                      <Text style={[
                        styles.statusText,
                        { 
                          fontSize: fontSize.small,
                          color: currentRestaurant.is_stripe_active ? COLORS.success : COLORS.error 
                        }
                      ]}>
                        {currentRestaurant.is_stripe_active ? 'Actif' : 'Inactif'}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { fontSize: fontSize.small }]}>Créé le</Text>
                    <Text style={[styles.statValue, { fontSize: fontSize.small }]}>
                      {new Date(currentRestaurant.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  
                  <View style={styles.statRow}>
                    <Text style={[styles.statLabel, { fontSize: fontSize.small }]}>Dernière modif.</Text>
                    <Text style={[styles.statValue, { fontSize: fontSize.small }]}>
                      {new Date(currentRestaurant.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Actions rapides */}
              <Card style={responsiveStyles.card}>
                <Text style={[styles.sectionTitle, { fontSize: fontSize.subtitle, marginBottom: cardSpacing * 0.75 }]}>
                  Actions rapides
                </Text>
                
                <View style={{ gap: cardSpacing * 0.5 }}>
                  <TouchableOpacity
                    onPress={() => router.push(`/(restaurant)/qrcodes`)}
                    style={styles.quickActionButton}
                  >
                    <Text style={[styles.quickActionIcon, { fontSize: fontSize.subtitle }]}>👥</Text>
                    <Text style={[styles.quickActionText, { fontSize: fontSize.body }]}>Gérer les tables</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => router.push(`/(restaurant)/menu`)}
                    style={styles.quickActionButton}
                  >
                    <Text style={[styles.quickActionIcon, { fontSize: fontSize.subtitle }]}>⚙️</Text>
                    <Text style={[styles.quickActionText, { fontSize: fontSize.body }]}>Gérer les menus</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={() => router.push(`/(restaurant)/orders`)}
                    style={styles.quickActionButton}
                  >
                    <Text style={[styles.quickActionIcon, { fontSize: fontSize.subtitle }]}>🕒</Text>
                    <Text style={[styles.quickActionText, { fontSize: fontSize.body }]}>Voir les commandes</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      {/* Modal de fermeture temporaire */}
      <Modal
        visible={showCloseModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCloseModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContainer,
            { 
              margin: containerPadding,
              maxWidth: screenType === 'desktop' ? 500 : undefined 
            }
          ]}>
            <Text style={[styles.modalTitle, { fontSize: fontSize.subtitle }]}>
              ⚠️ Fermer temporairement
            </Text>
            
            <Text style={[styles.modalDescription, { fontSize: fontSize.body }]}>
              Cette action fermera votre restaurant aux nouvelles commandes. Vous pourrez le rouvrir à tout moment.
            </Text>
            
            <View style={{ marginBottom: cardSpacing }}>
              <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                Raison de la fermeture *
              </Text>
              <TextInput
                value={closeForm.reason}
                onChangeText={(text) => setCloseForm({...closeForm, reason: text})}
                multiline
                numberOfLines={3}
                style={[styles.textInputMultiline, { fontSize: fontSize.body }]}
                placeholder="Ex: Vacances, travaux, problème technique..."
              />
            </View>
            
            <View style={{ marginBottom: cardSpacing * 1.25 }}>
              <Text style={[styles.inputLabel, { fontSize: fontSize.small }]}>
                Durée (optionnel)
              </Text>
              <TextInput
                value={closeForm.duration}
                onChangeText={(text) => setCloseForm({...closeForm, duration: text})}
                style={[styles.textInput, { fontSize: fontSize.body }]}
                placeholder="Heures (ex: 24 pour 1 jour)"
                keyboardType="numeric"
              />
            </View>
            
            <View style={[styles.modalActions, { gap: cardSpacing * 0.75 }]}>
              <TouchableOpacity
                onPress={() => setShowCloseModal(false)}
                style={[styles.cancelButton, responsiveStyles.button]}
              >
                <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleCloseRestaurant}
                disabled={!closeForm.reason.trim() || isClosing}
                style={[
                  styles.confirmCloseButton, 
                  responsiveStyles.button,
                  { opacity: !closeForm.reason.trim() || isClosing ? 0.6 : 1 }
                ]}
              >
                <Text style={[styles.buttonText, { fontSize: fontSize.body }]}>
                  {isClosing ? 'Fermeture...' : 'Fermer le restaurant'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// =============================================================================
// STYLES AVEC LE SYSTÈME DESIGNSYSTEM.TS
// =============================================================================

const styles = {
  // Layout principal
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  
  // Layouts responsifs
  mobileLayout: {
    flexDirection: 'column' as const,
  },
  tabletLayout: {
    flexDirection: 'row' as const,
    gap: 24,
    alignItems: 'flex-start' as const,
  },
  mainColumn: {
    flex: 2,
    minWidth: 0,
  },
  sideColumn: {
    flex: 1,
    minWidth: 300,
    maxWidth: 450,
  },
  fullWidth: {
    width: '100%',
  },
  
  // États d'erreur
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  errorTitle: {
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  errorText: {
    color: COLORS.text.secondary,
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  errorButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.button,
  },
  errorButtonText: {
    color: COLORS.text.inverse,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  
  // Badge de statut
  statusBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  statusBadgeText: {
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  
  // Alertes
  alertCard: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
    ...SHADOWS.card,
  },
  alertTitle: {
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: '#991B1B',
    marginBottom: 4,
  },
  alertText: {
    color: '#7F1D1D',
  },
  alertDate: {
    color: '#991B1B',
    marginTop: 4,
  },
  
  // Boutons d'action
  actionButtonsContainer: {
    flexDirection: 'row' as const,
  },
  reopenButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    alignItems: 'center' as const,
  },
  closeButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    alignItems: 'center' as const,
  },
  imageButton: {
    backgroundColor: COLORS.primary,
    alignItems: 'center' as const,
  },
  saveButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    alignItems: 'center' as const,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.text.secondary,
    alignItems: 'center' as const,
  },
  buttonText: {
    color: COLORS.text.inverse,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  
  // Titres de section
  sectionTitle: {
    fontWeight: TYPOGRAPHY.fontWeight.semibold,
    color: COLORS.text.primary,
  },
  
  // Image du restaurant
  restaurantImage: {
    width: '100%',
    borderRadius: BORDER_RADIUS.lg,
  },
  imagePlaceholder: {
    width: '100%',
    backgroundColor: COLORS.border.light,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  placeholderIcon: {
    marginBottom: 8,
  },
  placeholderText: {
    color: COLORS.text.secondary,
  },
  
  // Formulaires
  inputLabel: {
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    color: COLORS.text.primary,
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
  },
  
  // Badge de statut utilisant COMPONENT_STYLES
  statusBadge: {
    ...COMPONENT_STYLES.statusBadge.base,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusBadgeText: {
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  
  // Alerte
  alertCard: {
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
  },
  alertTitle: {
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 4,
  },
  alertText: {
    color: '#7F1D1D',
  },
  alertDate: {
    color: '#991B1B',
    marginTop: 4,
  },
  
  // Boutons d'action avec styles prédéfinis
  reopenButton: {
    ...responsiveStyles.button,
    ...responsiveStyles.buttonPrimary,
    backgroundColor: COLORS.success,
    alignItems: 'center' as const,
  },
  closeButton: {
    ...responsiveStyles.button,
    backgroundColor: COLORS.error,
    alignItems: 'center' as const,
  },
  imageButton: {
    ...responsiveStyles.button,
    ...responsiveStyles.buttonPrimary,
    alignItems: 'center' as const,
  },
  saveButton: {
    ...responsiveStyles.button,
    ...responsiveStyles.buttonPrimary,
    alignItems: 'center' as const,
  },
  cancelButton: {
    ...responsiveStyles.button,
    backgroundColor: COLORS.text.secondary,
    alignItems: 'center' as const,
  },
    // Boutons d'action
  actionButtonsContainer: {
    flexDirection: 'row' as const,
  },
  
  // Formulaires avec styles prédéfinis
  textInput: {
    ...COMPONENT_STYLES.input.base,
  },
  
  buttonText: {
    color: COLORS.text.inverse,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  
  // Titres de section avec styles prédéfinis
  sectionTitle: {
    ...responsiveStyles.textSubtitle,
  },
  
  // Titres de section
  sectionTitle: {
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  
  // Image du restaurant
  restaurantImage: {
    width: '100%',
    borderRadius: BORDER_RADIUS.lg,
  },
  imagePlaceholder: {
    width: '100%',
    backgroundColor: COLORS.neutral[100],
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  placeholderIcon: {
    marginBottom: 8,
  },
  placeholderText: {
    color: COLORS.text.secondary,
  },
  
  // Formulaires
  inputLabel: {
    fontWeight: '500',
    color: COLORS.text.primary,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface.primary,
    color: COLORS.text.primary,
  },
  textInputMultiline: {
    borderWidth: 1,
    borderColor: COLORS.border.medium,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.surface.primary,
    color: COLORS.text.primary,
    textAlignVertical: 'top' as const,
    minHeight: 80,
  },
  
  // Lignes de formulaire
  addressRowMobile: {
    flexDirection: 'column' as const,
  },
  addressRowTablet: {
    flexDirection: 'row' as const,
  },
  contactRow: {
    flexDirection: 'row' as const,
  },
  editActions: {
    flexDirection: 'row' as const,
  },
  
  // Informations d'affichage
  infoLabel: {
    fontWeight: '500',
    color: COLORS.text.secondary,
  },
  infoValue: {
    color: COLORS.text.primary,
  },
  websiteLink: {
    color: COLORS.primary,
  },
  priceRange: {
    color: COLORS.secondary,
    fontWeight: '600',
  },
  mealVoucherAccepted: {
    color: COLORS.success,
    fontWeight: '500',
  },
  mealVoucherInfo: {
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  
  // Horaires
  scheduleRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  dayLabel: {
    fontWeight: '500',
    color: COLORS.text.primary,
    minWidth: 60,
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: 16,
  },
  closedText: {
    color: COLORS.text.secondary,
  },
  scheduleTime: {
    color: COLORS.text.primary,
  },
  schedulePeriod: {
    color: COLORS.text.secondary,
  },
  notDefinedText: {
    color: COLORS.text.secondary,
  },
  
  // Statistiques
  statRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  statLabel: {
    color: COLORS.text.secondary,
  },
  statValue: {
    color: COLORS.text.primary,
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontWeight: '500',
  },
  
  // Actions rapides
  quickActionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface.golden,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border.golden,
  },
  quickActionIcon: {
    marginRight: 12,
  },
  quickActionText: {
    color: COLORS.text.primary,
    fontWeight: '500',
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  modalContainer: {
    backgroundColor: COLORS.surface.primary,
    borderRadius: BORDER_RADIUS.xl,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: COLORS.shadow.dark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 8,
  },
  modalDescription: {
    color: COLORS.text.secondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row' as const,
  },
  confirmCloseButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    alignItems: 'center' as const,
  },
};

export default RestaurantDetailPage;