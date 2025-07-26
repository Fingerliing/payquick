import React, { useState } from 'react';
import {
  View,
  ScrollView,
  Alert,
  TouchableOpacity,
  Image,
  ViewStyle,
  TextStyle,
  ImageStyle,
  Text,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { RestaurantHoursUtils } from '@/utils/restaurantHours';
import { OpeningHours, Restaurant } from '@/types/restaurant';
import { OpeningHoursEditor } from '@/components/restaurant/OpeningHoursEditor';

interface CreateRestaurantData {
  // Champs de base requis
  name: string;
  address: string;
  city: string;
  zipCode: string;
  phone: string;
  email: string;
  cuisine: string;
  priceRange: 1 | 2 | 3 | 4;
  
  // Champs optionnels dans le formulaire mais requis dans Restaurant
  description?: string;
  country?: string; // Optionnel dans le formulaire, mais requis dans le modèle final
  website?: string;
  image?: string;
  latitude?: number;
  longitude?: number;
  
  // Horaires d'ouverture
  openingHours: OpeningHours[];
  
  // Configuration des commandes
  can_receive_orders?: boolean;
}

// Types de cuisine
const CUISINE_CHOICES = [
  { value: 'french', label: 'Française' },
  { value: 'italian', label: 'Italienne' },
  { value: 'asian', label: 'Asiatique' },
  { value: 'mexican', label: 'Mexicaine' },
  { value: 'indian', label: 'Indienne' },
  { value: 'american', label: 'Américaine' },
  { value: 'mediterranean', label: 'Méditerranéenne' },
  { value: 'japanese', label: 'Japonaise' },
  { value: 'chinese', label: 'Chinoise' },
  { value: 'thai', label: 'Thaïlandaise' },
  { value: 'other', label: 'Autre' },
];

export default function AddRestaurantScreen() {
  const { createRestaurant } = useRestaurant();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  
  // Formulaire avec horaires d'ouverture par défaut
  const [formData, setFormData] = useState<CreateRestaurantData>({
    name: '',
    description: '',
    address: '',
    city: '',
    zipCode: '',
    country: 'France',
    phone: '',
    email: '',
    website: '',
    cuisine: '',
    priceRange: 2,
    latitude: undefined,
    longitude: undefined,
    openingHours: RestaurantHoursUtils.getDefaultOpeningHours(), // Horaires par défaut
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (field: keyof CreateRestaurantData, value: string | number | OpeningHours[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Nous avons besoin de la permission pour accéder à vos photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      selectionLimit: 1,
      allowsMultipleSelection: false,
      orderedSelection: false,
      presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Nous avons besoin de la permission de géolocalisation');
        return;
      }

      setIsLoading(true);
      const location = await Location.getCurrentPositionAsync({});
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (reverseGeocode[0]) {
        const address = reverseGeocode[0];
        updateField('address', `${address.street || ''} ${address.streetNumber || ''}`.trim());
        updateField('city', address.city || '');
        updateField('zipCode', address.postalCode || '');
        updateField('latitude', location.coords.latitude);
        updateField('longitude', location.coords.longitude);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de récupérer votre position');
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validation des champs existants
    if (!formData.name.trim()) {
      newErrors.name = 'Le nom du restaurant est requis';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Le nom ne peut pas dépasser 100 caractères';
    }

    if (!formData.address.trim()) {
      newErrors.address = 'L\'adresse est requise';
    } else if (formData.address.length > 255) {
      newErrors.address = 'L\'adresse ne peut pas dépasser 255 caractères';
    }

    if (!formData.city.trim()) {
      newErrors.city = 'La ville est requise';
    } else if (formData.city.length > 100) {
      newErrors.city = 'La ville ne peut pas dépasser 100 caractères';
    }

    if (!formData.zipCode.trim()) {
      newErrors.zipCode = 'Le code postal est requis';
    } else if (formData.zipCode.length > 10) {
      newErrors.zipCode = 'Le code postal ne peut pas dépasser 10 caractères';
    }

    if (formData.country && formData.country.length > 100) {
      newErrors.country = 'Le pays ne peut pas dépasser 100 caractères';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Le téléphone est requis';
    } else if (formData.phone.length > 20) {
      newErrors.phone = 'Le téléphone ne peut pas dépasser 20 caractères';
    } else {
      const phoneRegex = /^(\+33|0)[1-9](\d{8})$/;
      const cleanPhone = formData.phone.replace(/[\s\.\-]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        newErrors.phone = 'Format de téléphone invalide. Utilisez +33123456789 ou 0123456789';
      }
    }

    if (!formData.email.trim()) {
      newErrors.email = 'L\'email est requis';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Format d\'email invalide';
    }

    if (!formData.cuisine.trim()) {
      newErrors.cuisine = 'Le type de cuisine est requis';
    } else {
      const validCuisines = CUISINE_CHOICES.map(c => c.value);
      if (!validCuisines.includes(formData.cuisine)) {
        newErrors.cuisine = 'Type de cuisine non valide';
      }
    }

    if (!formData.priceRange || formData.priceRange < 1 || formData.priceRange > 4) {
      newErrors.priceRange = 'La gamme de prix doit être entre 1 et 4';
    }

    // Validation du site web (optionnel)
    if (formData.website && formData.website.trim()) {
      try {
        new URL(formData.website);
      } catch {
        newErrors.website = 'Format d\'URL invalide';
      }
    }

    // Validation des horaires d'ouverture
    const hasAtLeastOneOpenDay = formData.openingHours.some(day => !day.isClosed);
    if (!hasAtLeastOneOpenDay) {
      newErrors.openingHours = 'Le restaurant doit être ouvert au moins un jour par semaine';
    }

    // Validation des heures pour les jours ouverts
    formData.openingHours.forEach((day, index) => {
      if (!day.isClosed) {
        if (!day.openTime || !day.closeTime) {
          newErrors.openingHours = 'Veuillez définir les heures d\'ouverture et de fermeture pour tous les jours ouverts';
        }
        
        // Vérifier que l'heure de fermeture n'est pas identique à l'heure d'ouverture
        if (day.openTime === day.closeTime) {
          newErrors.openingHours = 'L\'heure de fermeture doit être différente de l\'heure d\'ouverture';
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Erreur', 'Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    setIsLoading(true);
    try {
      // Calculer le statut automatique basé sur les horaires
      const mockRestaurant: Restaurant = {
        id: 'temp',
        name: formData.name || '',
        description: formData.description || '', // ✅ S'assurer que ce n'est jamais undefined
        address: formData.address || '',
        city: formData.city || '',
        zipCode: formData.zipCode || '',
        country: formData.country || 'France',
        phone: formData.phone || '',
        email: formData.email || '',
        website: formData.website || undefined,
        image: image || undefined,
        coverImage: undefined,
        cuisine: formData.cuisine || '',
        priceRange: formData.priceRange,
        rating: 0,
        reviewCount: 0,
        isActive: true,
        isManuallyOverridden: false,
        manualOverrideUntil: null,
        can_receive_orders: formData.can_receive_orders ?? true,
        openingHours: formData.openingHours,
        location: {
          latitude: formData.latitude || 0,
          longitude: formData.longitude || 0,
        },
        ownerId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Calculer si le restaurant devrait être ouvert maintenant
      const currentStatus = RestaurantHoursUtils.isRestaurantOpen(mockRestaurant);

      const restaurantData = {
        // Champs de base
        name: formData.name.trim(),
        description: formData.description?.trim() || '',
        address: formData.address.trim(),
        city: formData.city.trim(),
        zipCode: formData.zipCode.trim(),
        country: formData.country?.trim() || 'France',
        phone: formData.phone.trim(),
        email: formData.email.trim().toLowerCase(),
        website: formData.website?.trim() || '',
        cuisine: formData.cuisine.trim(),
        priceRange: formData.priceRange,
        
        // Statut calculé automatiquement
        rating: 0,
        reviewCount: 0,
        isActive: currentStatus, // Calculé en fonction des horaires
        isManuallyOverridden: false,
        manualOverrideUntil: null,
        can_receive_orders: formData.can_receive_orders ?? true, // Par défaut, le restaurant peut recevoir des commandes
        
        // Horaires d'ouverture
        openingHours: formData.openingHours,
        
        // Géolocalisation
        location: {
          latitude: formData.latitude || 0,
          longitude: formData.longitude || 0,
        },
        
        // Image
        image: image || undefined,
        
        // Métadonnées (seront définies côté serveur)
        ownerId: '',
      };

      console.log('📤 Envoi des données au backend avec horaires:', restaurantData);

      const response = await createRestaurant(restaurantData);
      
      Alert.alert(
        'Succès', 
        `Restaurant créé avec succès !\n\nStatut actuel: ${currentStatus ? 'Ouvert' : 'Fermé'} selon vos horaires d'ouverture.`, 
        [{ text: 'OK', onPress: () => router.back() }]
      );

    } catch (error: any) {
      console.error('❌ Erreur lors de la création:', error);
      
      let errorMessage = 'Impossible de créer le restaurant';
      
      if (error.response?.data) {
        const backendError = error.response.data;
        
        if (backendError.validation_errors) {
          const backendErrors: Record<string, string> = {};
          Object.entries(backendError.validation_errors).forEach(([field, messages]) => {
            if (Array.isArray(messages) && messages.length > 0) {
              const frontendField = field === 'zip_code' ? 'zipCode' : 
                                  field === 'price_range' ? 'priceRange' : 
                                  field === 'opening_hours' ? 'openingHours' : field;
              backendErrors[frontendField] = messages[0];
            }
          });
          setErrors(backendErrors);
          errorMessage = 'Veuillez corriger les erreurs de validation';
        } else if (backendError.error) {
          errorMessage = backendError.error;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Preview du statut actuel
  const getStatusPreview = () => {
    const mockRestaurant: Restaurant = {
      id: 'temp',
      name: formData.name || '',
      description: formData.description || '',
      address: formData.address || '',
      city: formData.city || '',
      zipCode: formData.zipCode || '',
      country: formData.country || 'France',
      phone: formData.phone || '',
      email: formData.email || '',
      website: formData.website || undefined,
      image: image || undefined,
      coverImage: undefined, // ✅ Propriété optionnelle explicite
      cuisine: formData.cuisine || '',
      priceRange: formData.priceRange,
      rating: 0,
      reviewCount: 0,
      isActive: true,
      isManuallyOverridden: false,
      manualOverrideUntil: null,
      can_receive_orders: formData.can_receive_orders ?? true,
      openingHours: formData.openingHours,
      location: { 
        latitude: formData.latitude || 0, 
        longitude: formData.longitude || 0 
      },
      ownerId: '',
      createdAt: '',
      updatedAt: '',
    };

    const status = RestaurantHoursUtils.getRestaurantStatus(mockRestaurant);
    
    return (
      <View style={{
        backgroundColor: status.isOpen ? '#D1FAE5' : '#FEE2E2',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons 
            name={status.isOpen ? "checkmark-circle" : "close-circle"} 
            size={16} 
            color={status.isOpen ? "#065F46" : "#991B1B"} 
          />
          <Text style={{
            fontSize: 12,
            fontWeight: '500',
            color: status.isOpen ? "#065F46" : "#991B1B",
            marginLeft: 8,
          }}>
            Statut actuel: {status.status}
          </Text>
        </View>
      </View>
    );
  };

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const imageContainerStyle: ViewStyle = {
    height: 200,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: image ? '#10B981' : '#E5E7EB',
    borderStyle: 'dashed',
  };

  const imageStyle: ImageStyle = {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  };

  const cuisinePickerStyle: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  };

  const cuisineChipStyle = (selected: boolean): ViewStyle => ({
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: selected ? '#3B82F6' : '#E5E7EB',
    backgroundColor: selected ? '#3B82F6' : '#FFFFFF',
  });

  const cuisineTextStyle = (selected: boolean): TextStyle => ({
    fontSize: 12,
    fontWeight: '500',
    color: selected ? '#FFFFFF' : '#6B7280',
  });

  const priceRangeStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  };

  const priceButtonStyle = (selected: boolean): ViewStyle => ({
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: selected ? '#3B82F6' : '#E5E7EB',
    backgroundColor: selected ? '#3B82F6' : '#FFFFFF',
    marginHorizontal: 4,
    alignItems: 'center',
  });

  const priceTextStyle = (selected: boolean): TextStyle => ({
    fontSize: 14,
    fontWeight: '500',
    color: selected ? '#FFFFFF' : '#6B7280',
  });

  const sectionTitleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  };

  const footerHeight = 80 + insets.bottom;

  return (
    <KeyboardAvoidingView 
      style={containerStyle}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <Header 
        title="Ajouter un restaurant" 
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()}
      />

      <ScrollView 
        contentContainerStyle={{ 
          padding: 16, 
          paddingBottom: footerHeight + 16
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Image du restaurant */}
        <Card>
          <Text style={sectionTitleStyle}>Photo du restaurant</Text>
          <TouchableOpacity style={imageContainerStyle} onPress={pickImage}>
            {image ? (
              <Image source={{ uri: image }} style={imageStyle} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="camera-outline" size={48} color="#9CA3AF" />
                <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 8 }}>
                  Touchez pour ajouter une photo
                </Text>
              </View>
            )}
          </TouchableOpacity>
          {image && (
            <TouchableOpacity
              onPress={() => setImage(null)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: '#EF4444',
                borderRadius: 20,
                width: 32,
                height: 32,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Ionicons name="close" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </Card>

        {/* Informations de base */}
        <Card style={{ marginTop: 16 }}>
          <Text style={sectionTitleStyle}>Informations de base</Text>
          
          <Input
            label="Nom du restaurant *"
            placeholder="Le Petit Bistrot"
            value={formData.name}
            onChangeText={(value) => updateField('name', value)}
            maxLength={100}
            error={errors.name}
          />

          <Input
            label="Description"
            placeholder="Cuisine française traditionnelle dans un cadre chaleureux..."
            value={formData.description}
            onChangeText={(value) => updateField('description', value)}
            multiline
            numberOfLines={3}
            error={errors.description}
          />

          <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
            Type de cuisine *
          </Text>
          <View style={cuisinePickerStyle}>
            {CUISINE_CHOICES.map((cuisine) => (
              <TouchableOpacity
                key={cuisine.value}
                style={cuisineChipStyle(formData.cuisine === cuisine.value)}
                onPress={() => updateField('cuisine', cuisine.value)}
              >
                <Text style={cuisineTextStyle(formData.cuisine === cuisine.value)}>
                  {cuisine.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.cuisine && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {errors.cuisine}
            </Text>
          )}

          <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8, marginTop: 16 }}>
            Gamme de prix *
          </Text>
          <View style={priceRangeStyle}>
            {[1, 2, 3, 4].map((price) => (
              <TouchableOpacity
                key={price}
                style={priceButtonStyle(formData.priceRange === price)}
                onPress={() => updateField('priceRange', price as 1 | 2 | 3 | 4)}
              >
                <Text style={priceTextStyle(formData.priceRange === price)}>
                  {'€'.repeat(price)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.priceRange && (
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>
              {errors.priceRange}
            </Text>
          )}
        </Card>

        {/* Horaires d'ouverture */}
        <Card style={{ marginTop: 16 }}>
          <OpeningHoursEditor
            openingHours={formData.openingHours}
            onChange={(hours) => updateField('openingHours', hours)}
            error={errors.openingHours}
          />
          {getStatusPreview()}
        </Card>

        {/* Adresse */}
        <Card style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={sectionTitleStyle}>Adresse</Text>
            <TouchableOpacity
              onPress={getCurrentLocation}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F3F4F6',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
              }}
              disabled={isLoading}
            >
              <Ionicons name="location-outline" size={16} color="#6B7280" />
              <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
                Ma position
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Adresse *"
            placeholder="123 Rue de la Paix"
            value={formData.address}
            onChangeText={(value) => updateField('address', value)}
            maxLength={255}
            error={errors.address}
          />

          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <View style={{ flex: 2 }}>
              <Input
                label="Ville *"
                placeholder="Paris"
                value={formData.city}
                onChangeText={(value) => updateField('city', value)}
                maxLength={100}
                error={errors.city}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Code postal *"
                placeholder="75001"
                value={formData.zipCode}
                onChangeText={(value) => updateField('zipCode', value)}
                keyboardType="default"
                maxLength={10}
                error={errors.zipCode}
              />
            </View>
          </View>

          <Input
            label="Pays"
            placeholder="France"
            value={formData.country}
            onChangeText={(value) => updateField('country', value)}
            maxLength={100}
            error={errors.country}
          />
        </Card>

        {/* Contact */}
        <Card style={{ marginTop: 16 }}>
          <Text style={sectionTitleStyle}>Contact</Text>
          
          <Input
            label="Téléphone *"
            placeholder="+33 1 23 45 67 89 ou 01 23 45 67 89"
            value={formData.phone}
            onChangeText={(value) => updateField('phone', value)}
            keyboardType="phone-pad"
            maxLength={20}
            leftIcon="call-outline"
            error={errors.phone}
          />

          <Input
            label="Email *"
            placeholder="contact@restaurant.com"
            value={formData.email}
            onChangeText={(value) => updateField('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
            error={errors.email}
          />

          <Input
            label="Site web"
            placeholder="https://www.restaurant.com"
            value={formData.website}
            onChangeText={(value) => updateField('website', value)}
            keyboardType="default"
            autoCapitalize="none"
            leftIcon="globe-outline"
            error={errors.website}
          />
        </Card>

        {/* Informations de géolocalisation */}
        {(formData.latitude || formData.longitude) && (
          <Card style={{ marginTop: 16 }}>
            <Text style={sectionTitleStyle}>Géolocalisation</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name="location-outline" size={16} color="#6B7280" />
              <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
                Latitude: {formData.latitude?.toFixed(6) || 'Non définie'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="location-outline" size={16} color="#6B7280" />
              <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
                Longitude: {formData.longitude?.toFixed(6) || 'Non définie'}
              </Text>
            </View>
          </Card>
        )}

        <View style={{ height: 24 }} />

        {/* Bouton de validation */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          paddingVertical: 16,
          paddingHorizontal: 4,
          borderRadius: 12,
          marginTop: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}>
          <Button
            title="Créer le restaurant"
            onPress={handleSubmit}
            loading={isLoading}
            fullWidth
            disabled={isLoading}
          />
        </View>
      </ScrollView>

      {/* Loading overlay */}
      {isLoading && <Loading />}
    </KeyboardAvoidingView>
  );
}