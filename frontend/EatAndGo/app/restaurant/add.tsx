// app/(tabs)/restaurants/add.tsx

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
// FALLBACKS SÛRS (évite l'erreur getDefaultOpeningHours manquante)
// =============================================================================

// Horaires par défaut (7 jours, fermés) si l'util n'expose pas la méthode attendue
const getDefaultOpeningHoursSafe = (): OpeningHours[] => {
  const anyUtils = RestaurantHoursUtils as unknown as Record<string, any>;

  if (anyUtils?.getDefaultOpeningHours) return anyUtils.getDefaultOpeningHours();
  if (anyUtils?.getDefaultWeek) return anyUtils.getDefaultWeek();
  if (anyUtils?.defaultOpeningHours) {
    const v = anyUtils.defaultOpeningHours;
    return typeof v === 'function' ? v() : v;
  }

  // Fallback minimal : 7 jours fermés
  return Array.from({ length: 7 }, (_, dayIndex) => ({
    dayOfWeek: dayIndex,
    isClosed: true,
    periods: [],
  })) as unknown as OpeningHours[];
};

// Statut d'ouverture : on tente l'utilitaire ; sinon, statut "Fermé"
const getRestaurantStatusSafe = (restaurant: Restaurant) => {
  const anyUtils = RestaurantHoursUtils as unknown as Record<string, any>;
  if (anyUtils?.getRestaurantStatus) return anyUtils.getRestaurantStatus(restaurant);
  return {
    isOpen: false,
    shortStatus: 'Fermé pour le moment',
    currentPeriod: null,
    nextOpening: null,
  };
};

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
  'Utilisation: du lundi au samedi (hors dimanches et jours fériés sauf exception)',
  'Produits éligibles: denrées immédiatement consommables',
];

// =============================================================================
// VALIDATION
// =============================================================================

const validateRestaurantForm = (formData: CreateRestaurantData): FormValidationErrors => {
  const errors: FormValidationErrors = {};

  // Champs requis
  if (!formData.name?.trim()) errors.name = 'Nom requis';
  if (!formData.address?.trim()) errors.address = 'Adresse requise';
  if (!formData.city?.trim()) errors.city = 'Ville requise';
  if (!formData.zipCode?.trim()) errors.zipCode = 'Code postal requis';
  if (!formData.phone?.trim()) errors.phone = 'Téléphone requis';
  if (!formData.email?.trim()) errors.email = 'Email requis';
  if (!formData.cuisine?.trim()) errors.cuisine = 'Cuisine requise';

  // Email simple
  if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
    errors.email = 'Email invalide';
  }

  // Téléphone simple (10 à 15 chiffres/espaces/+)
  if (formData.phone && !/^[0-9+\s().-]{10,15}$/.test(formData.phone)) {
    errors.phone = 'Numéro invalide';
  }

  // Horaires (multi-périodes)
  if (!Array.isArray(formData.openingHours) || formData.openingHours.length !== 7) {
    errors.openingHours = 'Les horaires doivent couvrir les 7 jours de la semaine';
  } else {
    for (const day of formData.openingHours) {
      if (!day.isClosed) {
        if (!day.periods || day.periods.length === 0) {
          errors.openingHours = 'Chaque jour ouvert doit contenir au moins une période';
          break;
        }
        for (const p of day.periods) {
          if (!p.startTime || !p.endTime) {
            errors.openingHours = 'Chaque période doit avoir une heure de début et de fin';
            break;
          }
          if (p.startTime === p.endTime) {
            errors.openingHours = 'L’heure de fin doit différer de l’ouverture';
            break;
          }
        }
      }
    }
  }

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
  cuisine: (formData.cuisine as any) || 'other',
  priceRange: formData.priceRange,
  rating: 0,
  reviewCount: 0,
  isActive: true,
  can_receive_orders: true,
  accepts_meal_vouchers: !!formData.accepts_meal_vouchers,
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
  // HOOKS & STATE
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
    openingHours: getDefaultOpeningHoursSafe(),
    accepts_meal_vouchers: false,
    meal_voucher_info: '',
  });

  // FORM HANDLERS
  const updateField = <T extends keyof CreateRestaurantData>(
    field: T,
    value: CreateRestaurantData[T]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // MEDIA & LOCATION HANDLERS
  const handleImagePicker = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert('Permission refusée', "Permission d'accès aux photos requise");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible de sélectionner l'image");
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
        const streetNumber = (addressData as any).streetNumber ?? (addressData as any).name ?? '';
        const street = addressData.street ?? '';
        updateField('address', `${street} ${streetNumber}`.trim());
        updateField('city', addressData.city || '');
        updateField('zipCode', (addressData as any).postalCode || '');
        updateField('latitude', location.coords.latitude);
        updateField('longitude', location.coords.longitude);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de détecter votre position');
    } finally {
      setIsLoading(false);
    }
  };

  // SUBMIT
  const handleSubmit = async () => {
    // Validation côté client
    const validationErrors = validateRestaurantForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      Alert.alert('Champs manquants', 'Merci de corriger les champs en rouge.');
      return;
    }

    try {
      setIsLoading(true);

      // Statut en live (pour feedback UX)
      const status = getRestaurantStatusSafe(createMockRestaurant(formData, image || undefined));
      const currentStatus = status?.isOpen;

      // Données conformes au contexte (Restaurant sans champs read-only)
      const restaurantData: Omit<
        Restaurant,
        'id' | 'createdAt' | 'updatedAt' | 'can_receive_orders' | 'ownerId'
      > = {
        name: formData.name.trim(),
        description: formData.description?.trim() || '',
        address: formData.address.trim(),
        city: formData.city.trim(),
        zipCode: formData.zipCode.trim(),
        country: formData.country || 'France',
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        website: formData.website?.trim() || '',
        cuisine: formData.cuisine as any,
        priceRange: formData.priceRange,
        rating: 0,
        reviewCount: 0,
        isActive: true,
        openingHours: formData.openingHours,
        accepts_meal_vouchers: formData.accepts_meal_vouchers,
        meal_voucher_info: formData.accepts_meal_vouchers
          ? formData.meal_voucher_info?.trim() || 'Titres-restaurant acceptés selon les conditions légales'
          : undefined,
        accepts_meal_vouchers_display: formData.accepts_meal_vouchers ? 'Oui' : 'Non',
        image: image || undefined,
        // location group (transmis puis converti par le contexte)
        location: {
          latitude: formData.latitude || 0,
          longitude: formData.longitude || 0,
        },
        // champs backend-compat (le contexte convertira en snake_case)
        opening_hours: formData.openingHours as any,
        zip_code: formData.zipCode as any,
        price_range: formData.priceRange as any,
        is_stripe_active: false,
        can_receive_orders: true,
      } as any;

      await createRestaurant(restaurantData);

      const mealVoucherStatus = formData.accepts_meal_vouchers ? 'acceptés' : 'non acceptés';
      Alert.alert(
        'Succès',
        `Restaurant créé avec succès !\n\nStatut actuel: ${currentStatus ? 'Ouvert' : 'Fermé'}\nTitres-restaurant: ${mealVoucherStatus}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      // Gestion fine des erreurs renvoyées par l’API
      let errorMessage = 'Impossible de créer le restaurant';

      if (error.response?.data?.validation_errors) {
        const backendErrors: FormValidationErrors = {};
        Object.entries(error.response.data.validation_errors).forEach(([field, messages]) => {
          if (Array.isArray(messages) && messages.length > 0) {
            const mappedField =
              field === 'zip_code'
                ? 'zipCode'
                : field === 'price_range'
                ? 'priceRange'
                : field === 'opening_hours'
                ? 'openingHours'
                : field;
            backendErrors[mappedField] = String(messages[0]);
          }
        });
        setErrors(backendErrors);
        errorMessage = 'Erreurs de validation détectées - vérifiez les champs en rouge';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
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
    const status = getRestaurantStatusSafe(mockRestaurant);

    return (
      <View
        style={[
          styles.previewContainer,
          {
            backgroundColor: status.isOpen ? '#ECFDF5' : '#FEF2F2',
            borderColor: status.isOpen ? '#10B981' : '#EF4444',
          },
        ]}
      >
        <Text style={{ fontWeight: '600', color: status.isOpen ? '#065F46' : '#7F1D1D' }}>
          {status.shortStatus}
        </Text>
        {status.currentPeriod && (
          <Text style={{ marginTop: 4, color: '#111827' }}>
            Période: {status.currentPeriod.startTime} - {status.currentPeriod.endTime}
          </Text>
        )}
        {status.nextOpening && (
          <Text style={{ marginTop: 2, color: '#374151' }}>
            Prochaine ouverture: {status.nextOpening}
          </Text>
        )}
      </View>
    );
  };

  const MealVoucherPreview = () => (
    <View
      style={[
        styles.previewContainer,
        {
          backgroundColor: formData.accepts_meal_vouchers ? '#EFF6FF' : '#F9FAFB',
          borderColor: formData.accepts_meal_vouchers ? '#3B82F6' : '#E5E7EB',
        },
      ]}
    >
      <Text style={{ fontWeight: '600', color: '#1F2937' }}>
        Titres-restaurant {formData.accepts_meal_vouchers ? 'acceptés' : 'non acceptés'}
      </Text>
      {!!formData.meal_voucher_info?.trim() && (
        <Text style={{ marginTop: 4, color: '#374151' }}>{formData.meal_voucher_info}</Text>
      )}
    </View>
  );

  // RENDER
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header title="Ajouter un restaurant" showBackButton />

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* IMAGE */}
          <Text style={styles.sectionTitle}>
            <Ionicons name="image" size={18} style={styles.sectionIcon as any} />
            Image de couverture
          </Text>
          <View
            style={[
              styles.imageContainer,
              { borderColor: image ? '#10B981' : '#D1D5DB' },
            ]}
          >
            {image ? (
              <>
                <Image source={{ uri: image }} style={styles.imagePreview} />
                <TouchableOpacity onPress={() => setImage(null)} style={styles.imageRemoveBtn}>
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
            <Button
              variant="secondary"
              title="Choisir une image"
              leftIcon={<Ionicons name="image" size={18} />}
              onPress={handleImagePicker}
            />
            )}
          </View>

          {/* BASICS */}
          <Text style={styles.sectionTitle}>
            <Ionicons name="restaurant" size={18} style={styles.sectionIcon as any} />
            Informations de base
          </Text>
          <Card>
            <Input
              label="Nom du restaurant *"
              placeholder="Ex: La Bonne Table"
              value={formData.name}
              onChangeText={(t) => updateField('name', t)}
              error={errors.name}
              onFocus={() => clearError('name')}
            />
            <Input
              label="Description"
              placeholder="Courte description"
              value={formData.description}
              onChangeText={(t) => updateField('description', t)}
              multiline
            />
            <Input
              label="Type de cuisine *"
              placeholder="Sélectionnez un type"
              value={formData.cuisine}
              onChangeText={(t) => updateField('cuisine', t)}
              error={errors.cuisine}
              onFocus={() => clearError('cuisine')}
            />
            <View style={styles.cuisineGrid}>
              {CUISINE_OPTIONS.map((opt) => {
                const selected = formData.cuisine === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => updateField('cuisine', opt.value)}
                    style={[
                      styles.cuisineChip,
                      {
                        backgroundColor: selected ? '#EFF6FF' : '#FFFFFF',
                        borderColor: selected ? '#3B82F6' : '#D1D5DB',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Choisir la cuisine ${opt.label}`}
                  >
                    <Text style={{ color: selected ? '#1D4ED8' : '#374151' }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 8 }]}>
              Gamme de prix
            </Text>
            <View style={styles.priceGrid}>
              {PRICE_RANGES.map((p) => {
                const selected = formData.priceRange === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => updateField('priceRange', p.value)}
                    style={[
                      styles.priceButton,
                      {
                        backgroundColor: selected ? '#ECFDF5' : '#FFFFFF',
                        borderColor: selected ? '#10B981' : '#D1D5DB',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Sélectionner la gamme de prix ${p.label}`}
                  >
                    <Text style={{ fontWeight: '600', color: selected ? '#065F46' : '#111827' }}>
                      {p.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>{p.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          {/* CONTACT */}
          <Text style={styles.sectionTitle}>
            <Ionicons name="call" size={18} style={styles.sectionIcon as any} />
            Contact
          </Text>
          <Card>
            <Input
              label="Téléphone *"
              placeholder="+33 ..."
              value={formData.phone}
              onChangeText={(t) => updateField('phone', t)}
              error={errors.phone}
              onFocus={() => clearError('phone')}
            />
            <Input
              label="Email *"
              placeholder="contact@exemple.com"
              value={formData.email}
              onChangeText={(t) => updateField('email', t)}
              error={errors.email}
              onFocus={() => clearError('email')}
            />
            <Input
              label="Site web"
              placeholder="https://..."
              value={formData.website}
              onChangeText={(t) => updateField('website', t)}
            />
          </Card>

          {/* ADRESSE */}
          <Text style={styles.sectionTitle}>
            <Ionicons name="location" size={18} style={styles.sectionIcon as any} />
            Adresse & géolocalisation
          </Text>
          <Card>
            <View style={styles.addressHeader}>
              <Text style={{ fontWeight: '600', color: '#111827' }}>Adresse</Text>
              <TouchableOpacity
                style={styles.locationButton}
                onPress={handleLocationDetection}
                accessibilityRole="button"
                accessibilityLabel="Utiliser ma position pour renseigner l'adresse"
              >
                <Ionicons name="locate" size={16} color="#111827" />
                <Text style={{ marginLeft: 6, color: '#111827' }}>Utiliser ma position</Text>
              </TouchableOpacity>
            </View>

            <Input
              label="Adresse *"
              placeholder="Numéro et rue"
              value={formData.address}
              onChangeText={(t) => updateField('address', t)}
              error={errors.address}
              onFocus={() => clearError('address')}
            />
            <View style={styles.addressRow}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Ville *"
                  placeholder="Ville"
                  value={formData.city}
                  onChangeText={(t) => updateField('city', t)}
                  error={errors.city}
                  onFocus={() => clearError('city')}
                />
              </View>
              <View style={{ width: 120 }}>
                <Input
                  label="Code postal *"
                  placeholder="00000"
                  value={formData.zipCode}
                  onChangeText={(t) => updateField('zipCode', t)}
                  error={errors.zipCode}
                  onFocus={() => clearError('zipCode')}
                />
              </View>
            </View>
          </Card>

          {/* HORAIRES */}
          <Text style={styles.sectionTitle}>
            <Ionicons name="time" size={18} style={styles.sectionIcon as any} />
            Horaires d’ouverture
          </Text>
          <Card>
            <OpeningHoursEditor
              openingHours={formData.openingHours}
              onChange={(newHours) => updateField('openingHours', newHours)}
            />
            {!!errors.openingHours && (
              <Text style={{ color: '#B91C1C', marginTop: 8 }}>{errors.openingHours}</Text>
            )}
            <StatusPreview />
          </Card>

          {/* TITRES-RESTAURANT */}
          <Text style={styles.sectionTitle}>
            <Ionicons name="card" size={18} style={styles.sectionIcon as any} />
            Titres-restaurant
          </Text>
          <Card>
            <View style={styles.mealVoucherContainer}>
              <View style={styles.mealVoucherHeader}>
                <Text style={{ fontWeight: '600', color: '#111827' }}>
                  Accepter les titres-restaurant
                </Text>
                <Switch
                  value={formData.accepts_meal_vouchers}
                  onValueChange={(v) => updateField('accepts_meal_vouchers', v)}
                />
              </View>
              {formData.accepts_meal_vouchers && (
                <>
                  <View style={styles.mealVoucherInfo}>
                    {MEAL_VOUCHER_LEGAL_INFO.map((line, idx) => (
                      <Text key={idx} style={{ color: '#1E3A8A' }}>
                        • {line}
                      </Text>
                    ))}
                  </View>
                  <Input
                    label="Infos affichées aux clients"
                    placeholder="Ex: Acceptés du lundi au samedi, max 19€"
                    value={formData.meal_voucher_info}
                    onChangeText={(t) => updateField('meal_voucher_info', t)}
                  />
                  <MealVoucherPreview />
                </>
              )}
            </View>
          </Card>

          {/* SUBMIT */}
          <View style={styles.submitContainer}>
            <Button title="Créer le restaurant" variant="primary" onPress={handleSubmit} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {isLoading && <Loading text="Traitement en cours..." fullScreen />}
    </View>
  );
}
