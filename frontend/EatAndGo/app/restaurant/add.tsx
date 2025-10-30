import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
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
import { MultiPeriodHoursEditor } from '@/components/restaurant/OpeningHoursEditor';
import { Alert as InlineAlert } from '@/components/ui/Alert';

// Design System
import {
  COLORS,
  SHADOWS,
  BORDER_RADIUS,
  useScreenType,
  createResponsiveStyles,
  getResponsiveValue,
  SPACING,
} from '@/utils/designSystem';

// Utils & Types
import { RestaurantHoursUtils } from '@/utils/restaurantHours';
import { OpeningHours, Restaurant } from '@/types/restaurant';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface CreateRestaurantData {
  name: string;
  description?: string;
  cuisine: string;
  priceRange: 1 | 2 | 3 | 4;
  address: string;
  city: string;
  zipCode: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  phone: string;
  email: string;
  website?: string;
  openingHours: OpeningHours[];
  accepts_meal_vouchers: boolean;
  meal_voucher_info?: string;
  image?: string;
}

interface FormValidationErrors {
  [key: string]: string;
}

// =============================================================================
// FALLBACKS SÛRS
// =============================================================================

const getDefaultOpeningHoursSafe = (): OpeningHours[] => {
  const anyUtils = RestaurantHoursUtils as unknown as Record<string, any>;
  if (anyUtils?.getDefaultOpeningHours) return anyUtils.getDefaultOpeningHours();
  if (anyUtils?.getDefaultWeek) return anyUtils.getDefaultWeek();
  if (anyUtils?.defaultOpeningHours) {
    const v = anyUtils.defaultOpeningHours;
    return typeof v === 'function' ? v() : v;
  }
  return Array.from({ length: 7 }, (_, dayIndex) => ({
    dayOfWeek: dayIndex,
    isClosed: true,
    periods: [],
  })) as unknown as OpeningHours[];
};

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
  { value: 'french', label: 'Française', icon: '🇫🇷' },
  { value: 'italian', label: 'Italienne', icon: '🇮🇹' },
  { value: 'asian', label: 'Asiatique', icon: '🥢' },
  { value: 'mexican', label: 'Mexicaine', icon: '🌮' },
  { value: 'indian', label: 'Indienne', icon: '🇮🇳' },
  { value: 'american', label: 'Américaine', icon: '🍔' },
  { value: 'mediterranean', label: 'Méditerranéenne', icon: '🫒' },
  { value: 'japanese', label: 'Japonaise', icon: '🍱' },
  { value: 'chinese', label: 'Chinoise', icon: '🥟' },
  { value: 'thai', label: 'Thaïlandaise', icon: '🌶️' },
  { value: 'other', label: 'Autre', icon: '🍽️' },
] as const;

const PRICE_RANGES = [
  { value: 1, label: '€', description: 'Éco' },
  { value: 2, label: '€€', description: 'Modéré' },
  { value: 3, label: '€€€', description: 'Cher' },
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

  if (!formData.name?.trim()) errors.name = 'Nom requis';
  if (!formData.address?.trim()) errors.address = 'Adresse requise';
  if (!formData.city?.trim()) errors.city = 'Ville requise';
  if (!formData.zipCode?.trim()) errors.zipCode = 'Code postal requis';
  if (!formData.phone?.trim()) errors.phone = 'Téléphone requis';
  if (!formData.email?.trim()) errors.email = 'Email requis';
  if (!formData.cuisine?.trim()) errors.cuisine = 'Cuisine requise';

  if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
    errors.email = 'Email invalide';
  }

  if (formData.phone && !/^[0-9+\s().-]{10,15}$/.test(formData.phone)) {
    errors.phone = 'Numéro invalide';
  }

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
            errors.openingHours = "L'heure de fin doit différer de l'ouverture";
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
// MAIN COMPONENT
// =============================================================================

export default function AddRestaurantScreen() {
  const { createRestaurant } = useRestaurant();
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();
  const responsiveStyles = createResponsiveStyles(screenType);

  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormValidationErrors>({});

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
        showToast('error', "Permission d'accès aux photos requise", 'Permission refusée');
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
    } catch {
      showToast('error', "Impossible de sélectionner l'image", 'Erreur');
    }
  };

  const handleLocationDetection = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('error', 'Permission de géolocalisation requise', 'Permission refusée');
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
    } catch {
      showToast('error', 'Impossible de détecter votre position', 'Erreur');
    } finally {
      setIsLoading(false);
    }
  };

  // SUBMIT
  const handleSubmit = async () => {
    const validationErrors = validateRestaurantForm(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showToast('error', 'Merci de corriger les champs en rouge.', 'Champs manquants');
      return;
    }

    try {
      setIsLoading(true);

      const status = getRestaurantStatusSafe(createMockRestaurant(formData, image || undefined));
      const currentStatus = status?.isOpen;

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
        location: {
          latitude: formData.latitude || 0,
          longitude: formData.longitude || 0,
        },
        opening_hours: formData.openingHours as any,
        zip_code: formData.zipCode as any,
        price_range: formData.priceRange as any,
        is_stripe_active: false,
        can_receive_orders: true,
      } as any;

      await createRestaurant(restaurantData);

      const mealVoucherStatus = formData.accepts_meal_vouchers ? 'acceptés' : 'non acceptés';
      showToast(
        'success',
        `Restaurant créé avec succès !\nStatut actuel: ${currentStatus ? 'Ouvert' : 'Fermé'}\nTitres-restaurant: ${mealVoucherStatus}`,
        'Succès'
      );
      router.back();
    } catch (error: any) {
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

      showToast('error', errorMessage, 'Erreur');
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
        style={{
          backgroundColor: status.isOpen ? '#ECFDF5' : '#FEF2F2',
          borderRadius: BORDER_RADIUS.lg,
          padding: getResponsiveValue(SPACING.md, screenType),
          marginTop: getResponsiveValue(SPACING.md, screenType),
          borderWidth: 1,
          borderColor: status.isOpen ? COLORS.success : COLORS.error,
          ...SHADOWS.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons
            name={status.isOpen ? 'checkmark-circle' : 'close-circle'}
            size={20}
            color={status.isOpen ? COLORS.success : COLORS.error}
          />
          <Text
            style={{
              marginLeft: 8,
              fontWeight: '600',
              color: status.isOpen ? '#065F46' : '#7F1D1D',
              fontSize: getResponsiveValue(SPACING.md, screenType),
            }}
          >
            {status.shortStatus}
          </Text>
        </View>
        {status.currentPeriod && (
          <Text
            style={{
              marginTop: 4,
              color: COLORS.text.secondary,
              fontSize: getResponsiveValue(SPACING.sm, screenType),
            }}
          >
            Période: {status.currentPeriod.startTime} - {status.currentPeriod.endTime}
          </Text>
        )}
        {status.nextOpening && (
          <Text
            style={{
              marginTop: 2,
              color: COLORS.text.light,
              fontSize: getResponsiveValue(SPACING.sm, screenType),
            }}
          >
            Prochaine ouverture: {status.nextOpening}
          </Text>
        )}
      </View>
    );
  };

  const MealVoucherPreview = () => (
    <View
      style={{
        backgroundColor: formData.accepts_meal_vouchers ? COLORS.goldenSurface : COLORS.background,
        borderRadius: BORDER_RADIUS.lg,
        padding: getResponsiveValue(SPACING.md, screenType),
        marginTop: getResponsiveValue(SPACING.md, screenType),
        borderWidth: 1,
        borderColor: formData.accepts_meal_vouchers ? COLORS.border.golden : COLORS.border.default,
        ...(formData.accepts_meal_vouchers ? SHADOWS.goldenGlow : SHADOWS.sm),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons
          name="card"
          size={20}
          color={formData.accepts_meal_vouchers ? COLORS.text.golden : COLORS.text.secondary}
        />
        <Text
          style={{
            marginLeft: 8,
            fontWeight: '600',
            color: formData.accepts_meal_vouchers ? COLORS.text.golden : COLORS.text.primary,
            fontSize: getResponsiveValue(SPACING.md, screenType),
          }}
        >
          Titres-restaurant {formData.accepts_meal_vouchers ? 'acceptés' : 'non acceptés'}
        </Text>
      </View>
      {!!formData.meal_voucher_info?.trim() && (
        <Text
          style={{
            marginTop: 4,
            color: COLORS.text.secondary,
            fontSize: getResponsiveValue(SPACING.sm, screenType),
          }}
        >
          {formData.meal_voucher_info}
        </Text>
      )}
    </View>
  );

  // Section Header Component
  const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: getResponsiveValue(SPACING.xl, screenType),
        marginBottom: getResponsiveValue(SPACING.md, screenType),
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: BORDER_RADIUS.md,
          backgroundColor: COLORS.goldenSurface,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={icon as any} size={18} color={COLORS.text.golden} />
      </View>
      <Text
        style={{
          fontSize: getResponsiveValue(SPACING.lg, screenType),
          fontWeight: '700',
          color: COLORS.text.primary,
        }}
      >
        {title}
      </Text>
    </View>
  );

  // RENDER
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, paddingTop: insets.top }}>
      <Header title="Ajouter un restaurant" showBackButton />

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

      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            padding: getResponsiveValue(SPACING.container, screenType),
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* IMAGE */}
          <SectionHeader icon="image" title="Image de couverture" />
          <View
            style={{
              height: 200,
              backgroundColor: image ? 'transparent' : COLORS.goldenSurface,
              borderRadius: BORDER_RADIUS.xl,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: getResponsiveValue(SPACING.md, screenType),
              borderWidth: 2,
              borderStyle: image ? 'solid' : 'dashed',
              borderColor: image ? COLORS.border.golden : COLORS.border.dark,
              overflow: 'hidden',
              ...(!image && SHADOWS.md),
            }}
          >
            {image ? (
              <>
                <Image source={{ uri: image }} style={{ width: '100%', height: '100%' }} />
                <TouchableOpacity
                  onPress={() => setImage(null)}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    backgroundColor: COLORS.error,
                    borderRadius: BORDER_RADIUS.full,
                    width: 36,
                    height: 36,
                    justifyContent: 'center',
                    alignItems: 'center',
                    ...SHADOWS.lg,
                  }}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={handleImagePicker}
                style={{
                  alignItems: 'center',
                  paddingVertical: getResponsiveValue(SPACING.lg, screenType),
                  paddingHorizontal: getResponsiveValue(SPACING.xl, screenType),
                }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: BORDER_RADIUS.full,
                    backgroundColor: COLORS.variants.secondary[100],
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name="image" size={32} color={COLORS.text.golden} />
                </View>
                <Text
                  style={{
                    fontSize: getResponsiveValue(SPACING.md, screenType),
                    fontWeight: '600',
                    color: COLORS.text.primary,
                    marginBottom: 4,
                  }}
                >
                  Choisir une image
                </Text>
                <Text
                  style={{
                    fontSize: getResponsiveValue(SPACING.sm, screenType),
                    color: COLORS.text.light,
                    textAlign: 'center',
                  }}
                >
                  Format 16:9 recommandé
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* BASICS */}
          <SectionHeader icon="restaurant" title="Informations de base" />
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
              placeholder="Courte description de votre établissement"
              value={formData.description}
              onChangeText={(t) => updateField('description', t)}
              multiline
            />

            <Text
              style={{
                fontSize: getResponsiveValue(SPACING.sm, screenType),
                fontWeight: '600',
                color: COLORS.text.primary,
                marginTop: getResponsiveValue(SPACING.md, screenType),
                marginBottom: getResponsiveValue(SPACING.sm, screenType),
              }}
            >
              Type de cuisine *
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {CUISINE_OPTIONS.map((opt) => {
                const selected = formData.cuisine === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => updateField('cuisine', opt.value)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: BORDER_RADIUS.full,
                      borderWidth: selected ? 2 : 1,
                      backgroundColor: selected ? COLORS.goldenSurface : COLORS.surface,
                      borderColor: selected ? COLORS.variants.secondary[500] : COLORS.border.default,
                      ...(selected && SHADOWS.goldenGlow),
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>
                      {opt.icon} {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.cuisine && (
              <Text style={{ color: COLORS.error, fontSize: 12, marginTop: 4 }}>
                {errors.cuisine}
              </Text>
            )}

            <Text
              style={{
                fontSize: getResponsiveValue(SPACING.sm, screenType),
                fontWeight: '600',
                color: COLORS.text.primary,
                marginTop: getResponsiveValue(SPACING.lg, screenType),
                marginBottom: getResponsiveValue(SPACING.sm, screenType),
              }}
            >
              Gamme de prix
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {PRICE_RANGES.map((p) => {
                const selected = formData.priceRange === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => updateField('priceRange', p.value)}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      paddingHorizontal: 12,
                      borderRadius: BORDER_RADIUS.lg,
                      borderWidth: selected ? 2 : 1,
                      alignItems: 'center',
                      backgroundColor: selected ? COLORS.goldenSurface : COLORS.surface,
                      borderColor: selected ? COLORS.variants.secondary[500] : COLORS.border.default,
                      ...(selected && SHADOWS.goldenGlow),
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '700',
                        fontSize: 18,
                        color: selected ? COLORS.text.golden : COLORS.text.primary,
                      }}
                    >
                      {p.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        color: COLORS.text.light,
                      }}
                    >
                      {p.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          {/* CONTACT */}
          <SectionHeader icon="call" title="Contact" />
          <Card>
            <Input
              label="Téléphone *"
              placeholder="+33 6 12 34 56 78"
              value={formData.phone}
              onChangeText={(t) => updateField('phone', t)}
              error={errors.phone}
              onFocus={() => clearError('phone')}
              keyboardType="phone-pad"
            />
            <Input
              label="Email *"
              placeholder="contact@restaurant.com"
              value={formData.email}
              onChangeText={(t) => updateField('email', t)}
              error={errors.email}
              onFocus={() => clearError('email')}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label="Site web"
              placeholder="https://www.restaurant.com"
              value={formData.website}
              onChangeText={(t) => updateField('website', t)}
              keyboardType="url"
              autoCapitalize="none"
            />
          </Card>

          {/* ADRESSE */}
          <SectionHeader icon="location" title="Adresse & géolocalisation" />
          <Card>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: getResponsiveValue(SPACING.md, screenType),
              }}
            >
              <Text style={{ fontWeight: '600', color: COLORS.text.primary }}>Adresse</Text>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: COLORS.goldenSurface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: BORDER_RADIUS.md,
                  borderWidth: 1,
                  borderColor: COLORS.border.golden,
                }}
                onPress={handleLocationDetection}
              >
                <Ionicons name="locate" size={16} color={COLORS.text.golden} />
                <Text style={{ marginLeft: 6, color: COLORS.text.golden, fontSize: 13, fontWeight: '500' }}>
                  Ma position
                </Text>
              </TouchableOpacity>
            </View>

            <Input
              label="Adresse *"
              placeholder="12 rue de la Paix"
              value={formData.address}
              onChangeText={(t) => updateField('address', t)}
              error={errors.address}
              onFocus={() => clearError('address')}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Ville *"
                  placeholder="Paris"
                  value={formData.city}
                  onChangeText={(t) => updateField('city', t)}
                  error={errors.city}
                  onFocus={() => clearError('city')}
                />
              </View>
              <View style={{ width: 120 }}>
                <Input
                  label="Code postal *"
                  placeholder="75001"
                  value={formData.zipCode}
                  onChangeText={(t) => updateField('zipCode', t)}
                  error={errors.zipCode}
                  onFocus={() => clearError('zipCode')}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </Card>

          {/* HORAIRES */}
          <SectionHeader icon="time" title="Horaires d'ouverture" />
          <Card>
            <MultiPeriodHoursEditor
              openingHours={formData.openingHours}
              onChange={(newHours) => updateField('openingHours', newHours)}
            />
            {!!errors.openingHours && (
              <Text style={{ color: COLORS.error, marginTop: 8, fontSize: 13 }}>
                {errors.openingHours}
              </Text>
            )}
            <StatusPreview />
          </Card>

          {/* TITRES-RESTAURANT */}
          <SectionHeader icon="card" title="Titres-restaurant" />
          <Card>
            <View
              style={{
                backgroundColor: COLORS.goldenSurface,
                borderRadius: BORDER_RADIUS.lg,
                padding: getResponsiveValue(SPACING.md, screenType),
                borderWidth: 1,
                borderColor: COLORS.border.golden,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: formData.accepts_meal_vouchers ? 16 : 0,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: COLORS.text.primary, fontSize: 15 }}>
                    Accepter les titres-restaurant
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: COLORS.text.light,
                      marginTop: 2,
                    }}
                  >
                    Swile, Edenred, Up...
                  </Text>
                </View>
                <Switch
                  value={formData.accepts_meal_vouchers}
                  onValueChange={(v) => updateField('accepts_meal_vouchers', v)}
                  trackColor={{
                    false: COLORS.border.default,
                    true: COLORS.variants.secondary[400],
                  }}
                  thumbColor={COLORS.surface}
                />
              </View>

              {formData.accepts_meal_vouchers && (
                <>
                  <View
                    style={{
                      backgroundColor: COLORS.variants.secondary[100],
                      borderRadius: BORDER_RADIUS.md,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: COLORS.variants.secondary[900],
                        marginBottom: 6,
                      }}
                    >
                      Informations légales
                    </Text>
                    {MEAL_VOUCHER_LEGAL_INFO.map((line, idx) => (
                      <Text
                        key={idx}
                        style={{
                          fontSize: 11,
                          color: COLORS.variants.secondary[800],
                          marginTop: 2,
                        }}
                      >
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
          <View
            style={{
              marginTop: getResponsiveValue(SPACING.xl, screenType),
              marginBottom: getResponsiveValue(SPACING.xl, screenType),
            }}
          >
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isLoading}
              style={{
                backgroundColor: COLORS.primary,
                paddingVertical: 16,
                borderRadius: BORDER_RADIUS.xl,
                alignItems: 'center',
                ...SHADOWS.button,
              }}
            >
              <Text
                style={{
                  color: COLORS.text.inverse,
                  fontSize: 16,
                  fontWeight: '700',
                }}
              >
                {isLoading ? 'Création en cours...' : 'Créer le restaurant'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {isLoading && <Loading text="Traitement en cours..." fullScreen />}
    </View>
  );
}