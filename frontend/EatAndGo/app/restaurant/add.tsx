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
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// Context & Hooks
import { useRestaurant } from '@/contexts/RestaurantContext';

// Components
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { OpeningHoursEditor } from '@/components/restaurant/OpeningHoursEditor';

// Utils & Types
import { RestaurantHoursUtils } from '@/utils/restaurantHours';
import { OpeningHours, Restaurant } from '@/types/restaurant';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface CreateRestaurantData {
  // Informations de base
  name: string;
  description?: string;
  cuisine: string;
  priceRange: 1 | 2 | 3 | 4;
  
  // Localisation
  address: string;
  city: string;
  zipCode: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  
  // Contact
  phone: string;
  email: string;
  website?: string;
  
  // Configuration
  openingHours: OpeningHours[];
  
  // Titres-restaurant
  accepts_meal_vouchers: boolean;
  meal_voucher_info?: string;
  
  // Média
  image?: string;
}

interface FormValidationErrors {
  [key: string]: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CUISINE_OPTIONS = [
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
] as const;

const PRICE_RANGES = [
  { value: 1, label: '€', description: 'Économique' },
  { value: 2, label: '€€', description: 'Modéré' },
  { value: 3, label: '€€€', description: 'Élevé' },
  { value: 4, label: '€€€€', description: 'Luxe' },
] as const;

const MEAL_VOUCHER_LEGAL_INFO = [
  'Limite légale: 19€ par jour et par personne',
  'Utilisables uniquement du lundi au vendredi',
  'Pour les repas uniquement (pas les boissons alcoolisées)',
] as const;

// =============================================================================
// VALIDATION
// =============================================================================

const validateRestaurantForm = (data: CreateRestaurantData): FormValidationErrors => {
  const errors: FormValidationErrors = {};

  // Nom du restaurant
  if (!data.name?.trim()) {
    errors.name = 'Le nom du restaurant est requis';
  } else if (data.name.length > 100) {
    errors.name = 'Le nom ne peut pas dépasser 100 caractères';
  }

  // Adresse
  if (!data.address?.trim()) {
    errors.address = 'L\'adresse est requise';
  } else if (data.address.length > 255) {
    errors.address = 'L\'adresse ne peut pas dépasser 255 caractères';
  }

  // Ville
  if (!data.city?.trim()) {
    errors.city = 'La ville est requise';
  } else if (data.city.length > 100) {
    errors.city = 'La ville ne peut pas dépasser 100 caractères';
  }

  // Code postal
  if (!data.zipCode?.trim()) {
    errors.zipCode = 'Le code postal est requis';
  } else if (data.zipCode.length > 10) {
    errors.zipCode = 'Le code postal ne peut pas dépasser 10 caractères';
  }

  // Téléphone
  if (!data.phone?.trim()) {
    errors.phone = 'Le téléphone est requis';
  } else {
    const phoneRegex = /^(\+33|0)[1-9](\d{8})$/;
    const cleanPhone = data.phone.replace(/[\s\.\-]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      errors.phone = 'Format invalide (ex: +33123456789 ou 0123456789)';
    }
  }

  // Email
  if (!data.email?.trim()) {
    errors.email = 'L\'email est requis';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Format d\'email invalide';
  }

  // Cuisine
  if (!data.cuisine) {
    errors.cuisine = 'Le type de cuisine est requis';
  }

  // Site web (optionnel)
  if (data.website?.trim()) {
    try {
      new URL(data.website);
    } catch {
      errors.website = 'Format d\'URL invalide';
    }
  }

  // Titres-restaurant
  if (data.accepts_meal_vouchers && !data.meal_voucher_info?.trim()) {
    errors.meal_voucher_info = 'Veuillez préciser les conditions d\'acceptation';
  }

  if (data.meal_voucher_info && data.meal_voucher_info.length > 500) {
    errors.meal_voucher_info = 'Maximum 500 caractères';
  }

  // Horaires d'ouverture
  const hasOpenDay = data.openingHours?.some(day => !day.isClosed);
  if (!hasOpenDay) {
    errors.openingHours = 'Le restaurant doit être ouvert au moins un jour';
  }

  // Validation des heures
  data.openingHours?.forEach(day => {
    if (!day.isClosed && (!day.openTime || !day.closeTime)) {
      errors.openingHours = 'Définissez les heures pour tous les jours ouverts';
    }
    if (!day.isClosed && day.openTime === day.closeTime) {
      errors.openingHours = 'L\'heure de fermeture doit différer de l\'ouverture';
    }
  });

  return errors;
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const createMockRestaurant = (formData: CreateRestaurantData, image?: string): Restaurant => ({
  id: 'temp',
  name: formData.name || '',
  description: formData.description || '',
  address: formData.address || '',
  city: formData.city || '',
  zipCode: formData.zipCode || '',
  country: formData.country || 'France',
  phone: formData.phone || '',
  email: formData.email || '',
  website: formData.website,
  image,
  cuisine: formData.cuisine || '',
  priceRange: formData.priceRange,
  rating: 0,
  reviewCount: 0,
  isActive: true,
  can_receive_orders: true,
  accepts_meal_vouchers: formData.accepts_meal_vouchers,
  meal_voucher_info: formData.meal_voucher_info || '',
  accepts_meal_vouchers_display: formData.accepts_meal_vouchers ? 'Oui' : 'Non',
  openingHours: formData.openingHours,
  location: {
    latitude: formData.latitude || 0,
    longitude: formData.longitude || 0,
  },
  ownerId: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// =============================================================================
// STYLES
// =============================================================================

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  } as ViewStyle,

  scrollContent: {
    padding: 16,
  } as ViewStyle,

  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  } as TextStyle,

  sectionIcon: {
    marginRight: 8,
  },

  imageContainer: {
    height: 200,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
  } as ViewStyle,

  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  } as ImageStyle,

  imageRemoveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,

  cuisineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  } as ViewStyle,

  cuisineChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  } as ViewStyle,

  priceGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  } as ViewStyle,

  priceButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  } as ViewStyle,

  mealVoucherContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  } as ViewStyle,

  mealVoucherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  } as ViewStyle,

  mealVoucherInfo: {
    backgroundColor: '#DBEAFE',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  } as ViewStyle,

  previewContainer: {
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
  } as ViewStyle,

  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  } as ViewStyle,

  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  } as ViewStyle,

  addressRow: {
    flexDirection: 'row',
    gap: 8,
  } as ViewStyle,

  submitContainer: {
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
  } as ViewStyle,
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function AddRestaurantScreen() {
  // ==========================================================================
  // HOOKS & STATE
  // ==========================================================================
  const { createRestaurant } = useRestaurant();
  const insets = useSafeAreaInsets();
  
  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormValidationErrors>({});
  
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
    openingHours: RestaurantHoursUtils.getDefaultOpeningHours(),
    accepts_meal_vouchers: false,
    meal_voucher_info: '',
  });

  // ==========================================================================
  // FORM HANDLERS
  // ==========================================================================
  const updateField = <T extends keyof CreateRestaurantData>(
    field: T, 
    value: CreateRestaurantData[T]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // ==========================================================================
  // MEDIA & LOCATION HANDLERS
  // ==========================================================================
  const handleImagePicker = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Permission d\'accès aux photos requise');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        selectionLimit: 1,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
  };

  const handleLocationDetection = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Permission de géolocalisation requise');
        return;
      }

      setIsLoading(true);
      const location = await Location.getCurrentPositionAsync({});
      const [addressData] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (addressData) {
        updateField('address', `${addressData.street || ''} ${addressData.streetNumber || ''}`.trim());
        updateField('city', addressData.city || '');
        updateField('zipCode', addressData.postalCode || '');
        updateField('latitude', location.coords.latitude);
        updateField('longitude', location.coords.longitude);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de récupérer la position');
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // FORM SUBMISSION
  // ==========================================================================
  const handleSubmit = async () => {
    const validationErrors = validateRestaurantForm(formData);
    
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      Alert.alert('Erreur de validation', 'Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    setIsLoading(true);
    try {
      const mockRestaurant = createMockRestaurant(formData, image || undefined);
      const currentStatus = RestaurantHoursUtils.isRestaurantOpen(mockRestaurant);

      // Préparer les données pour le backend
      const restaurantData = {
        // Informations de base
        name: formData.name.trim(),
        description: formData.description?.trim() || '',
        cuisine: formData.cuisine.trim(),
        priceRange: formData.priceRange,
        
        // Localisation (pas de structure location)
        address: formData.address.trim(),
        city: formData.city.trim(),
        zipCode: formData.zipCode.trim(),
        country: formData.country?.trim() || 'France',
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        
        // Contact
        phone: formData.phone.trim(),
        email: formData.email.trim().toLowerCase(),
        website: formData.website?.trim() || '',
        
        // Configuration (pas de champs calculés)
        rating: 0,
        reviewCount: 0,
        isActive: true,
        
        // Horaires d'ouverture (envoyés séparément)
        openingHours: formData.openingHours,
        
        // Titres-restaurant
        accepts_meal_vouchers: formData.accepts_meal_vouchers,
        meal_voucher_info: formData.accepts_meal_vouchers 
          ? formData.meal_voucher_info?.trim() || 'Titres-restaurant acceptés selon les conditions légales' 
          : '',
        
        // Média
        image: image || undefined,
      };

      await createRestaurant(restaurantData);
      
      const mealVoucherStatus = formData.accepts_meal_vouchers ? 'acceptés' : 'non acceptés';
      Alert.alert(
        'Succès', 
        `Restaurant créé avec succès !\n\nStatut actuel: ${currentStatus ? 'Ouvert' : 'Fermé'}\nTitres-restaurant: ${mealVoucherStatus}`, 
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('❌ Erreur création restaurant:', error);
      
      let errorMessage = 'Impossible de créer le restaurant';
      
      if (error.response?.data?.validation_errors) {
        const backendErrors: FormValidationErrors = {};
        Object.entries(error.response.data.validation_errors).forEach(([field, messages]) => {
          if (Array.isArray(messages) && messages.length > 0) {
            const mappedField = field === 'zip_code' ? 'zipCode' : 
                              field === 'price_range' ? 'priceRange' : 
                              field === 'opening_hours' ? 'openingHours' : field;
            backendErrors[mappedField] = messages[0];
          }
        });
        setErrors(backendErrors);
        errorMessage = 'Erreurs de validation détectées';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // PREVIEW COMPONENTS
  // ==========================================================================
  const StatusPreview = () => {
    const mockRestaurant = createMockRestaurant(formData, image || undefined);
    const status = RestaurantHoursUtils.getRestaurantStatus(mockRestaurant);
    
    return (
      <View style={[
        styles.previewContainer,
        {
          backgroundColor: status.isOpen ? '#D1FAE5' : '#FEE2E2',
          borderColor: status.isOpen ? '#10B981' : '#EF4444',
        }
      ]}>
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

  const MealVoucherPreview = () => (
    <View style={[
      styles.previewContainer,
      {
        backgroundColor: formData.accepts_meal_vouchers ? '#DBEAFE' : '#F3F4F6',
        borderColor: formData.accepts_meal_vouchers ? '#3B82F6' : '#E5E7EB',
      }
    ]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons 
          name={formData.accepts_meal_vouchers ? "card" : "card-outline"} 
          size={16} 
          color={formData.accepts_meal_vouchers ? "#1D4ED8" : "#6B7280"} 
        />
        <Text style={{
          fontSize: 12,
          fontWeight: '500',
          color: formData.accepts_meal_vouchers ? "#1D4ED8" : "#6B7280",
          marginLeft: 8,
        }}>
          Titres-restaurant: {formData.accepts_meal_vouchers ? 'Acceptés' : 'Non acceptés'}
        </Text>
      </View>
      {formData.accepts_meal_vouchers && formData.meal_voucher_info && (
        <Text style={{
          fontSize: 11,
          color: '#4B5563',
          marginTop: 4,
          fontStyle: 'italic',
        }}>
          {formData.meal_voucher_info.slice(0, 80)}
          {formData.meal_voucher_info.length > 80 ? '...' : ''}
        </Text>
      )}
    </View>
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <Header 
        title="Créer un restaurant" 
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()}
      />

      <ScrollView 
        style={styles.scrollContent}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ===== IMAGE SECTION ===== */}
        <Card>
          <Text style={styles.sectionTitle}>Photo du restaurant</Text>
          <TouchableOpacity 
            style={[
              styles.imageContainer,
              { borderColor: image ? '#10B981' : '#E5E7EB' }
            ]} 
            onPress={handleImagePicker}
          >
            {image ? (
              <Image source={{ uri: image }} style={styles.imagePreview} resizeMode="cover" />
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
            <TouchableOpacity onPress={() => setImage(null)} style={styles.imageRemoveBtn}>
              <Ionicons name="close" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </Card>

        {/* ===== BASIC INFO SECTION ===== */}
        <Card style={{ marginTop: 16 }}>
          <Text style={styles.sectionTitle}>Informations générales</Text>
          
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

          {/* Cuisine Selection */}
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8, marginTop: 16 }}>
            Type de cuisine *
          </Text>
          <View style={styles.cuisineGrid}>
            {CUISINE_OPTIONS.map((cuisine) => (
              <TouchableOpacity
                key={cuisine.value}
                style={[
                  styles.cuisineChip,
                  {
                    borderColor: formData.cuisine === cuisine.value ? '#3B82F6' : '#E5E7EB',
                    backgroundColor: formData.cuisine === cuisine.value ? '#3B82F6' : '#FFFFFF',
                  }
                ]}
                onPress={() => updateField('cuisine', cuisine.value)}
              >
                <Text style={{
                  fontSize: 12,
                  fontWeight: '500',
                  color: formData.cuisine === cuisine.value ? '#FFFFFF' : '#6B7280',
                }}>
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

          {/* Price Range */}
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8, marginTop: 16 }}>
            Gamme de prix *
          </Text>
          <View style={styles.priceGrid}>
            {PRICE_RANGES.map((price) => (
              <TouchableOpacity
                key={price.value}
                style={[
                  styles.priceButton,
                  {
                    borderColor: formData.priceRange === price.value ? '#3B82F6' : '#E5E7EB',
                    backgroundColor: formData.priceRange === price.value ? '#3B82F6' : '#FFFFFF',
                  }
                ]}
                onPress={() => updateField('priceRange', price.value)}
              >
                <Text style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: formData.priceRange === price.value ? '#FFFFFF' : '#6B7280',
                }}>
                  {price.label}
                </Text>
                <Text style={{
                  fontSize: 10,
                  color: formData.priceRange === price.value ? '#E0E7FF' : '#9CA3AF',
                  marginTop: 2,
                }}>
                  {price.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* ===== MEAL VOUCHERS SECTION ===== */}
        <Card style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="card-outline" size={20} color="#3B82F6" style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Titres-restaurant</Text>
          </View>

          <View style={styles.mealVoucherContainer}>
            <View style={styles.mealVoucherHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151' }}>
                  Accepter les titres-restaurant
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Permettre le paiement par titres-restaurant
                </Text>
              </View>
              <Switch
                value={formData.accepts_meal_vouchers}
                onValueChange={(value) => updateField('accepts_meal_vouchers', value)}
                trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
                thumbColor={formData.accepts_meal_vouchers ? '#FFFFFF' : '#F3F4F6'}
              />
            </View>

            {formData.accepts_meal_vouchers && (
              <View>
                <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
                  💡 Informations légales:
                </Text>
                <View style={styles.mealVoucherInfo}>
                  {MEAL_VOUCHER_LEGAL_INFO.map((info, index) => (
                    <Text key={index} style={{ fontSize: 11, color: '#1E40AF', lineHeight: 16 }}>
                      • {info}
                    </Text>
                  ))}
                </View>

                <Input
                  label="Conditions d'acceptation"
                  placeholder="ex: Tous types acceptés selon conditions légales, du lundi au vendredi..."
                  value={formData.meal_voucher_info}
                  onChangeText={(value) => updateField('meal_voucher_info', value)}
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  error={errors.meal_voucher_info}
                  style={{ backgroundColor: '#FFFFFF' }}
                />
                
                <Text style={{ fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 4 }}>
                  {formData.meal_voucher_info?.length || 0}/500 caractères
                </Text>
              </View>
            )}

            <MealVoucherPreview />
          </View>
        </Card>

        {/* ===== OPENING HOURS SECTION ===== */}
        <Card style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="time-outline" size={20} color="#3B82F6" style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Horaires d'ouverture</Text>
          </View>
          
          <OpeningHoursEditor
            openingHours={formData.openingHours}
            onChange={(hours) => updateField('openingHours', hours)}
            error={errors.openingHours}
          />
          <StatusPreview />
        </Card>

        {/* ===== ADDRESS SECTION ===== */}
        <Card style={{ marginTop: 16 }}>
          <View style={styles.addressHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="location-outline" size={20} color="#3B82F6" style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Localisation</Text>
            </View>
            <TouchableOpacity
              onPress={handleLocationDetection}
              style={styles.locationButton}
              disabled={isLoading}
            >
              <Ionicons name="locate-outline" size={16} color="#6B7280" />
              <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
                Position actuelle
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Adresse complète *"
            placeholder="123 Rue de la République"
            value={formData.address}
            onChangeText={(value) => updateField('address', value)}
            maxLength={255}
            error={errors.address}
          />

          <View style={styles.addressRow}>
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
                keyboardType="numeric"
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

          {/* Coordinates Display */}
          {(formData.latitude || formData.longitude) && (
            <View style={{
              backgroundColor: '#F8FAFC',
              padding: 12,
              borderRadius: 8,
              marginTop: 12,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 4 }}>
                Coordonnées GPS détectées:
              </Text>
              <Text style={{ fontSize: 11, color: '#6B7280' }}>
                Lat: {formData.latitude?.toFixed(6)} | Lng: {formData.longitude?.toFixed(6)}
              </Text>
            </View>
          )}
        </Card>

        {/* ===== CONTACT SECTION ===== */}
        <Card style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Ionicons name="call-outline" size={20} color="#3B82F6" style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Informations de contact</Text>
          </View>
          
          <Input
            label="Téléphone *"
            placeholder="+33 1 23 45 67 89"
            value={formData.phone}
            onChangeText={(value) => updateField('phone', value)}
            keyboardType="phone-pad"
            maxLength={20}
            leftIcon="call-outline"
            error={errors.phone}
          />

          <Input
            label="Email professionnel *"
            placeholder="contact@restaurant.com"
            value={formData.email}
            onChangeText={(value) => updateField('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
            error={errors.email}
          />

          <Input
            label="Site web (optionnel)"
            placeholder="https://www.monrestaurant.com"
            value={formData.website}
            onChangeText={(value) => updateField('website', value)}
            keyboardType="url"
            autoCapitalize="none"
            leftIcon="globe-outline"
            error={errors.website}
          />
        </Card>

        {/* ===== SUBMIT SECTION ===== */}
        <View style={styles.submitContainer}>
          <Button
            title="Créer le restaurant"
            onPress={handleSubmit}
            loading={isLoading}
            fullWidth
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? '#9CA3AF' : '#3B82F6',
              paddingVertical: 16,
            }}
          />
          
          {/* Form Summary */}
          <View style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: '#F8FAFC',
            borderRadius: 8,
          }}>
            <Text style={{
              fontSize: 11,
              color: '#6B7280',
              textAlign: 'center',
              lineHeight: 16,
            }}>
              En créant ce restaurant, vous acceptez nos conditions d'utilisation.
              {'\n'}Vérifiez toutes les informations avant de valider.
            </Text>
          </View>
        </View>

        {/* Spacer for safe area */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Loading Overlay */}
      {isLoading && <Loading />}
    </KeyboardAvoidingView>
  );
}