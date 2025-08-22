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

  // États locaux pour l'édition avec types appropriés
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
      // Appel API pour fermer le restaurant
      const response = await fetch(`/api/restaurants/${id}/manual_close/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: closeForm.reason,
          duration_hours: closeForm.duration ? parseInt(closeForm.duration) : null
        })
      });
      
      if (response.ok) {
        await loadRestaurant(id); // Recharger les données
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
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Restaurant" showBackButton onBackPress={() => router.back()} />
        <Loading fullScreen text="Chargement du restaurant..." />
      </View>
    );
  }

  if (error || !currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Restaurant" showBackButton onBackPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
            Restaurant non trouvé
          </Text>
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16, textAlign: 'center' }}>
            Ce restaurant n'existe pas ou vous n'y avez pas accès.
          </Text>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={{ backgroundColor: '#3B82F6', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: 'white', fontWeight: '500' }}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const getStatusBadge = () => {
    if (currentRestaurant.isManuallyOverridden) {
      return { text: 'Fermé temporairement', color: '#DC2626', backgroundColor: '#FEE2E2' };
    }
    
    if (currentRestaurant.can_receive_orders) {
      return { text: 'Ouvert aux commandes', color: '#059669', backgroundColor: '#D1FAE5' };
    }
    
    return { text: 'Configuration requise', color: '#6B7280', backgroundColor: '#F3F4F6' };
  };

  const statusBadge = getStatusBadge();

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title={currentRestaurant.name} 
        showBackButton
        onBackPress={() => router.back()}
        rightIcon={isEditing ? "checkmark" : "create-outline"}
        onRightPress={isEditing ? handleEditSubmit : () => setIsEditing(true)}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        style={{ flex: 1 }}
      >
        <View style={{ padding: 16 }}>
          
          {/* Badge de statut */}
          <View style={{ marginBottom: 16 }}>
            <View style={{ 
              alignSelf: 'flex-start',
              backgroundColor: statusBadge.backgroundColor,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20
            }}>
              <Text style={{ color: statusBadge.color, fontSize: 12, fontWeight: '500' }}>
                {statusBadge.text}
              </Text>
            </View>
          </View>

          {/* Alerte fermeture temporaire */}
          {currentRestaurant.isManuallyOverridden && (
            <Card style={{ marginBottom: 16, backgroundColor: '#FEF2F2', borderLeftWidth: 4, borderLeftColor: '#DC2626' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#991B1B', marginBottom: 4 }}>
                ⚠️ Restaurant fermé temporairement
              </Text>
              <Text style={{ fontSize: 12, color: '#7F1D1D' }}>
                {currentRestaurant.manualOverrideReason}
              </Text>
              {currentRestaurant.manualOverrideUntil && (
                <Text style={{ fontSize: 11, color: '#991B1B', marginTop: 4 }}>
                  Jusqu'au: {new Date(currentRestaurant.manualOverrideUntil).toLocaleString()}
                </Text>
              )}
            </Card>
          )}

          {/* Boutons d'action */}
          <View style={{ flexDirection: 'row', marginBottom: 16, gap: 8 }}>
            {currentRestaurant.isManuallyOverridden ? (
              <TouchableOpacity
                onPress={handleReopenRestaurant}
                style={{ 
                  flex: 1, 
                  backgroundColor: '#059669', 
                  paddingVertical: 12, 
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontWeight: '500' }}>Rouvrir</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setShowCloseModal(true)}
                style={{ 
                  flex: 1, 
                  backgroundColor: '#DC2626', 
                  paddingVertical: 12, 
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontWeight: '500' }}>Fermer temporairement</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Image du restaurant */}
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
              Image du restaurant
            </Text>
            
            {currentRestaurant.image_url ? (
              <View>
                <Image 
                  source={{ uri: currentRestaurant.image_url }} 
                  style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 12 }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={handleImagePicker}
                  style={{ 
                    backgroundColor: '#3B82F6', 
                    paddingVertical: 10, 
                    borderRadius: 8,
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '500' }}>Changer l'image</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={{ 
                  width: '100%', 
                  height: 200, 
                  backgroundColor: '#F3F4F6', 
                  borderRadius: 8, 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  marginBottom: 12
                }}>
                  <Text style={{ fontSize: 48 }}>📷</Text>
                  <Text style={{ color: '#6B7280', marginTop: 8 }}>Aucune image</Text>
                </View>
                <TouchableOpacity
                  onPress={handleImagePicker}
                  style={{ 
                    backgroundColor: '#3B82F6', 
                    paddingVertical: 10, 
                    borderRadius: 8,
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '500' }}>Ajouter une image</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>

          {/* Informations générales */}
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
              Informations générales
            </Text>
            
            {isEditing ? (
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                    Nom du restaurant
                  </Text>
                  <TextInput
                    value={editForm.name}
                    onChangeText={(text) => setEditForm({...editForm, name: text})}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#D1D5DB', 
                      borderRadius: 8, 
                      paddingHorizontal: 12, 
                      paddingVertical: 10,
                      backgroundColor: 'white'
                    }}
                    placeholder="Nom du restaurant"
                  />
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                    Description
                  </Text>
                  <TextInput
                    value={editForm.description}
                    onChangeText={(text) => setEditForm({...editForm, description: text})}
                    multiline
                    numberOfLines={3}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#D1D5DB', 
                      borderRadius: 8, 
                      paddingHorizontal: 12, 
                      paddingVertical: 10,
                      backgroundColor: 'white',
                      textAlignVertical: 'top'
                    }}
                    placeholder="Description du restaurant"
                  />
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                    Adresse
                  </Text>
                  <TextInput
                    value={editForm.address}
                    onChangeText={(text) => setEditForm({...editForm, address: text})}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#D1D5DB', 
                      borderRadius: 8, 
                      paddingHorizontal: 12, 
                      paddingVertical: 10,
                      backgroundColor: 'white'
                    }}
                    placeholder="Adresse"
                  />
                </View>
                
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                      Ville
                    </Text>
                    <TextInput
                      value={editForm.city}
                      onChangeText={(text) => setEditForm({...editForm, city: text})}
                      style={{ 
                        borderWidth: 1, 
                        borderColor: '#D1D5DB', 
                        borderRadius: 8, 
                        paddingHorizontal: 12, 
                        paddingVertical: 10,
                        backgroundColor: 'white'
                      }}
                      placeholder="Ville"
                    />
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                      Code postal
                    </Text>
                    <TextInput
                      value={editForm.zipCode}
                      onChangeText={(text) => setEditForm({...editForm, zipCode: text})}
                      style={{ 
                        borderWidth: 1, 
                        borderColor: '#D1D5DB', 
                        borderRadius: 8, 
                        paddingHorizontal: 12, 
                        paddingVertical: 10,
                        backgroundColor: 'white'
                      }}
                      placeholder="Code postal"
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                      Téléphone
                    </Text>
                    <TextInput
                      value={editForm.phone}
                      onChangeText={(text) => setEditForm({...editForm, phone: text})}
                      style={{ 
                        borderWidth: 1, 
                        borderColor: '#D1D5DB', 
                        borderRadius: 8, 
                        paddingHorizontal: 12, 
                        paddingVertical: 10,
                        backgroundColor: 'white'
                      }}
                      placeholder="Téléphone"
                      keyboardType="phone-pad"
                    />
                  </View>
                  
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                      Email
                    </Text>
                    <TextInput
                      value={editForm.email}
                      onChangeText={(text) => setEditForm({...editForm, email: text})}
                      style={{ 
                        borderWidth: 1, 
                        borderColor: '#D1D5DB', 
                        borderRadius: 8, 
                        paddingHorizontal: 12, 
                        paddingVertical: 10,
                        backgroundColor: 'white'
                      }}
                      placeholder="Email"
                      keyboardType="email-address"
                    />
                  </View>
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                    Site web (optionnel)
                  </Text>
                  <TextInput
                    value={editForm.website}
                    onChangeText={(text) => setEditForm({...editForm, website: text})}
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#D1D5DB', 
                      borderRadius: 8, 
                      paddingHorizontal: 12, 
                      paddingVertical: 10,
                      backgroundColor: 'white'
                    }}
                    placeholder="https://..."
                    keyboardType="url"
                  />
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                    Type de cuisine
                  </Text>
                  <View style={{ 
                    borderWidth: 1, 
                    borderColor: '#D1D5DB', 
                    borderRadius: 8, 
                    backgroundColor: 'white'
                  }}>
                    {/* Pour React Native, vous pourriez utiliser @react-native-picker/picker ici */}
                    <TouchableOpacity
                      style={{ paddingHorizontal: 12, paddingVertical: 10 }}
                      onPress={() => {
                        // Ici vous pourriez ouvrir un modal avec les options de cuisine
                        Alert.alert('Type de cuisine', 'Fonctionnalité à implémenter avec un picker');
                      }}
                    >
                      <Text style={{ color: editForm.cuisine ? '#111827' : '#9CA3AF' }}>
                        {editForm.cuisine ? editForm.cuisine.charAt(0).toUpperCase() + editForm.cuisine.slice(1) : 'Sélectionner un type'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                    Gamme de prix
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[1, 2, 3, 4].map((level) => (
                      <TouchableOpacity
                        key={level}
                        onPress={() => setEditForm({...editForm, priceRange: level as 1 | 2 | 3 | 4})}
                        style={{
                          flex: 1,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: editForm.priceRange === level ? '#3B82F6' : '#D1D5DB',
                          backgroundColor: editForm.priceRange === level ? '#EBF8FF' : 'white',
                          alignItems: 'center'
                        }}
                      >
                        <Text style={{ 
                          color: editForm.priceRange === level ? '#3B82F6' : '#6B7280',
                          fontWeight: '500' 
                        }}>
                          {'€'.repeat(level)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, color: '#374151' }}>
                    Accepte les titres-restaurant
                  </Text>
                  <Switch
                    value={editForm.accepts_meal_vouchers}
                    onValueChange={(value) => setEditForm({...editForm, accepts_meal_vouchers: value})}
                  />
                </View>
                
                {editForm.accepts_meal_vouchers && (
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                      Informations sur les titres-restaurant
                    </Text>
                    <TextInput
                      value={editForm.meal_voucher_info}
                      onChangeText={(text) => setEditForm({...editForm, meal_voucher_info: text})}
                      multiline
                      numberOfLines={2}
                      style={{ 
                        borderWidth: 1, 
                        borderColor: '#D1D5DB', 
                        borderRadius: 8, 
                        paddingHorizontal: 12, 
                        paddingVertical: 10,
                        backgroundColor: 'white',
                        textAlignVertical: 'top'
                      }}
                      placeholder="Ex: Tous types de titres acceptés, maximum 19€ par jour..."
                    />
                  </View>
                )}
                
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setIsEditing(false)}
                    style={{ 
                      flex: 1, 
                      backgroundColor: '#6B7280', 
                      paddingVertical: 12, 
                      borderRadius: 8,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '500' }}>Annuler</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={handleEditSubmit}
                    style={{ 
                      flex: 1, 
                      backgroundColor: '#3B82F6', 
                      paddingVertical: 12, 
                      borderRadius: 8,
                      alignItems: 'center'
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '500' }}>Sauvegarder</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Adresse:</Text>
                  <Text style={{ fontSize: 14, color: '#111827' }}>
                    {currentRestaurant.address}, {currentRestaurant.zipCode} {currentRestaurant.city}
                  </Text>
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Téléphone:</Text>
                  <Text style={{ fontSize: 14, color: '#111827' }}>{currentRestaurant.phone}</Text>
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Email:</Text>
                  <Text style={{ fontSize: 14, color: '#111827' }}>{currentRestaurant.email}</Text>
                </View>
                
                {currentRestaurant.website && (
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Site web:</Text>
                    <Text style={{ fontSize: 14, color: '#3B82F6' }}>{currentRestaurant.website}</Text>
                  </View>
                )}
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Cuisine:</Text>
                  <Text style={{ fontSize: 14, color: '#111827', textTransform: 'capitalize' }}>
                    {currentRestaurant.cuisine}
                  </Text>
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Gamme de prix:</Text>
                  <Text style={{ fontSize: 14, color: '#111827' }}>
                    {'€'.repeat(currentRestaurant.priceRange)}
                  </Text>
                </View>
                
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Note moyenne:</Text>
                  <Text style={{ fontSize: 14, color: '#111827' }}>
                    ⭐ {currentRestaurant.rating || 0} ({currentRestaurant.reviewCount || 0} avis)
                  </Text>
                </View>
                
                {currentRestaurant.accepts_meal_vouchers && (
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Titres-restaurant:</Text>
                    <Text style={{ fontSize: 14, color: '#059669', fontWeight: '500' }}>Acceptés</Text>
                    {currentRestaurant.meal_voucher_info && (
                      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                        {currentRestaurant.meal_voucher_info}
                      </Text>
                    )}
                  </View>
                )}
                
                {currentRestaurant.description && (
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Description:</Text>
                    <Text style={{ fontSize: 14, color: '#111827' }}>{currentRestaurant.description}</Text>
                  </View>
                )}
              </View>
            )}
          </Card>

          {/* Horaires d'ouverture */}
          {currentRestaurant.opening_hours && currentRestaurant.opening_hours.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
                Horaires d'ouverture
              </Text>
              
              <View style={{ gap: 8 }}>
                {currentRestaurant.opening_hours.map((hours) => (
                  <View key={hours.dayOfWeek} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '500', color: '#111827', width: 60 }}>
                      {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'][hours.dayOfWeek]}
                    </Text>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                      {hours.isClosed ? (
                        <Text style={{ color: '#6B7280' }}>Fermé</Text>
                      ) : hours.periods && hours.periods.length > 0 ? (
                        <View>
                          {hours.periods.map((period, idx) => (
                            <View key={idx}>
                              <Text style={{ color: '#111827', fontSize: 14 }}>
                                {period.startTime} - {period.endTime}
                                {period.name && (
                                  <Text style={{ color: '#6B7280', fontSize: 12 }}> ({period.name})</Text>
                                )}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={{ color: '#6B7280' }}>Non défini</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Statistiques */}
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
              Statistiques
            </Text>
            
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#6B7280' }}>Paiements Stripe</Text>
                <View style={{ 
                  paddingHorizontal: 8, 
                  paddingVertical: 4, 
                  borderRadius: 12,
                  backgroundColor: currentRestaurant.is_stripe_active ? '#D1FAE5' : '#FEE2E2'
                }}>
                  <Text style={{ 
                    fontSize: 12, 
                    fontWeight: '500',
                    color: currentRestaurant.is_stripe_active ? '#059669' : '#DC2626'
                  }}>
                    {currentRestaurant.is_stripe_active ? 'Actif' : 'Inactif'}
                  </Text>
                </View>
              </View>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#6B7280' }}>Créé le</Text>
                <Text style={{ color: '#111827' }}>
                  {new Date(currentRestaurant.createdAt).toLocaleDateString()}
                </Text>
              </View>
              
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#6B7280' }}>Dernière modif.</Text>
                <Text style={{ color: '#111827' }}>
                  {new Date(currentRestaurant.updatedAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </Card>

          {/* Actions rapides */}
          <Card>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 }}>
              Actions rapides
            </Text>
            
            <View style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={() => router.push(`/(restaurant)/qrcodes`)}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  backgroundColor: '#F9FAFB',
                  borderRadius: 8
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>👥</Text>
                <Text style={{ color: '#374151', fontWeight: '500' }}>Gérer les tables</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => router.push(`/(restaurant)/menu`)}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  backgroundColor: '#F9FAFB',
                  borderRadius: 8
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>⚙️</Text>
                <Text style={{ color: '#374151', fontWeight: '500' }}>Gérer les menus</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => router.push(`/(restaurant)/orders`)}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  backgroundColor: '#F9FAFB',
                  borderRadius: 8
                }}
              >
                <Text style={{ fontSize: 20, marginRight: 12 }}>🕒</Text>
                <Text style={{ color: '#374151', fontWeight: '500' }}>Voir les commandes</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* Modal de fermeture temporaire */}
      <Modal
        visible={showCloseModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCloseModal(false)}
      >
        <View style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0, 0, 0, 0.5)', 
          justifyContent: 'center', 
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{ 
            backgroundColor: 'white', 
            borderRadius: 12, 
            padding: 20, 
            width: '100%',
            maxWidth: 400
          }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 8 }}>
              ⚠️ Fermer temporairement
            </Text>
            
            <Text style={{ color: '#6B7280', marginBottom: 16, lineHeight: 20 }}>
              Cette action fermera votre restaurant aux nouvelles commandes. Vous pourrez le rouvrir à tout moment.
            </Text>
            
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                Raison de la fermeture *
              </Text>
              <TextInput
                value={closeForm.reason}
                onChangeText={(text) => setCloseForm({...closeForm, reason: text})}
                multiline
                numberOfLines={3}
                style={{ 
                  borderWidth: 1, 
                  borderColor: '#D1D5DB', 
                  borderRadius: 8, 
                  paddingHorizontal: 12, 
                  paddingVertical: 10,
                  backgroundColor: 'white',
                  textAlignVertical: 'top'
                }}
                placeholder="Ex: Vacances, travaux, problème technique..."
              />
            </View>
            
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                Durée (optionnel)
              </Text>
              <View style={{ 
                borderWidth: 1, 
                borderColor: '#D1D5DB', 
                borderRadius: 8, 
                backgroundColor: 'white'
              }}>
                {/* Ici vous pourriez utiliser un Picker ou des TouchableOpacity pour les options */}
                <TextInput
                  value={closeForm.duration}
                  onChangeText={(text) => setCloseForm({...closeForm, duration: text})}
                  style={{ paddingHorizontal: 12, paddingVertical: 10 }}
                  placeholder="Heures (ex: 24 pour 1 jour)"
                  keyboardType="numeric"
                />
              </View>
            </View>
            
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowCloseModal(false)}
                style={{ 
                  flex: 1, 
                  backgroundColor: '#6B7280', 
                  paddingVertical: 12, 
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontWeight: '500' }}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={handleCloseRestaurant}
                disabled={!closeForm.reason.trim() || isClosing}
                style={{ 
                  flex: 1, 
                  backgroundColor: !closeForm.reason.trim() || isClosing ? '#DC2626AA' : '#DC2626', 
                  paddingVertical: 12, 
                  borderRadius: 8,
                  alignItems: 'center'
                }}
              >
                <Text style={{ color: 'white', fontWeight: '500' }}>
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

export default RestaurantDetailPage;