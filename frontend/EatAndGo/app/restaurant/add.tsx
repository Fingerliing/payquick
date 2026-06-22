import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  Text,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
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
import { Alert, useAlert } from '@/components/ui/Alert';

// Design System
import {
  useAppTheme,
  makeShadows,
  BORDER_RADIUS,
  useScreenType,
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
  siret: string;
  raison_sociale?: string;
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

const getRestaurantStatusSafe = (restaurant: Restaurant, t: (k: string) => string) => {
  const anyUtils = RestaurantHoursUtils as unknown as Record<string, any>;
  if (anyUtils?.getRestaurantStatus) return anyUtils.getRestaurantStatus(restaurant);
  return {
    isOpen: false,
    shortStatus: t('addRestaurant.status.closedNow'),
    currentPeriod: null,
    nextOpening: null,
  };
};

// =============================================================================
// CONSTANTS
// =============================================================================

const CUISINE_OPTIONS = [
  { value: 'french', icon: '🇫🇷' },
  { value: 'italian', icon: '🇮🇹' },
  { value: 'asian', icon: '🥢' },
  { value: 'mexican', icon: '🌮' },
  { value: 'indian', icon: '🇮🇳' },
  { value: 'american', icon: '🍔' },
  { value: 'mediterranean', icon: '🫒' },
  { value: 'japanese', icon: '🍱' },
  { value: 'chinese', icon: '🥟' },
  { value: 'thai', icon: '🌶️' },
  { value: 'other', icon: '🍽️' },
] as const;

const PRICE_RANGES = [
  { value: 1, label: '€', key: 'eco' },
  { value: 2, label: '€€', key: 'moderate' },
  { value: 3, label: '€€€', key: 'expensive' },
  { value: 4, label: '€€€€', key: 'luxury' },
] as const;

const MEAL_VOUCHER_LEGAL_KEYS = ['legalLimit', 'legalUsage', 'legalProducts'] as const;

// =============================================================================
// VALIDATION
// =============================================================================

const validateRestaurantForm = (formData: CreateRestaurantData, t: (k: string) => string): FormValidationErrors => {
  const errors: FormValidationErrors = {};

  if (!formData.name?.trim()) errors.name = t('addRestaurant.validation.nameRequired');
  if (!formData.address?.trim()) errors.address = t('addRestaurant.validation.addressRequired');
  if (!formData.city?.trim()) errors.city = t('addRestaurant.validation.cityRequired');
  if (!formData.zipCode?.trim()) errors.zipCode = t('addRestaurant.validation.zipRequired');
  if (!formData.phone?.trim()) errors.phone = t('addRestaurant.validation.phoneRequired');
  if (!formData.email?.trim()) errors.email = t('addRestaurant.validation.emailRequired');
  if (!formData.cuisine?.trim()) errors.cuisine = t('addRestaurant.validation.cuisineRequired');

  // SIRET (obligatoire, 14 chiffres)
  if (!formData.siret?.trim()) {
    errors.siret = t('addRestaurant.validation.siretRequired');
  } else if (!/^\d{14}$/.test(formData.siret.trim())) {
    errors.siret = t('addRestaurant.validation.siretInvalid');
  }

  if (formData.email && !/^\S+@\S+\.\S+$/.test(formData.email)) {
    errors.email = t('errors.invalidEmail');
  }

  if (formData.zipCode && !/^\d{5}$/.test(formData.zipCode.trim())) {
    errors.zipCode = t('addRestaurant.validation.zipInvalid');
  }

  if (formData.phone) {
    const cleanedPhone = formData.phone.replace(/[\s.\-]/g, '');
    if (!/^(\+33|0)[1-9]\d{8}$/.test(cleanedPhone)) {
      errors.phone = t('addRestaurant.validation.phoneInvalid');
    }
  }

  if (!Array.isArray(formData.openingHours) || formData.openingHours.length !== 7) {
    errors.openingHours = t('addRestaurant.validation.hoursAllDays');
  } else {
    for (const day of formData.openingHours) {
      if (!day.isClosed) {
        if (!day.periods || day.periods.length === 0) {
          errors.openingHours = t('addRestaurant.validation.hoursPeriodRequired');
          break;
        }
        for (const p of day.periods) {
          if (!p.startTime || !p.endTime) {
            errors.openingHours = t('addRestaurant.validation.hoursStartEnd');
            break;
          }
          if (p.startTime === p.endTime) {
            errors.openingHours = t('addRestaurant.validation.hoursDifferent');
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
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { createRestaurant } = useRestaurant();
  const insets = useSafeAreaInsets();
  const screenType = useScreenType();
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  // Gestion du clavier.
  // En mode edge-to-edge (SDK 54), la fenêtre Android ne se redimensionne PAS
  // à l'ouverture du clavier : il faut donc réserver sa hauteur manuellement en
  // paddingBottom, sinon les champs du bas (SIRET, raison sociale) restent
  // masqués. On remonte ensuite le champ focalisé au-dessus du clavier.
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToInputEnd = () => {
    // Délai = laisser le paddingBottom (hauteur clavier) s'appliquer avant de
    // recalculer la position de fin, sinon le scroll vise l'ancienne hauteur.
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, Platform.OS === 'ios' ? 150 : 250);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormValidationErrors>({});

  const { alertState, showSuccess, showError, hideAlert } = useAlert();

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
    siret: '',
    raison_sociale: '',
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
        showError(t('addRestaurant.alerts.photoPermissionMessage'), t('addRestaurant.alerts.permissionDeniedTitle'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // allowsEditing désactivé : sur Android il lance l'écran de recadrage
        // natif (UCrop) dont la barre d'outils ne suit pas le thème de l'app
        // (texte sombre sur fond gris, illisible sur certains appareils).
        // L'aperçu affiche déjà l'image en 16:9 (cover), le recadrage manuel
        // n'est donc pas nécessaire ici.
        allowsEditing: false,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch {
      showError(t('addRestaurant.alerts.imagePickError'), t('addRestaurant.alerts.errorTitle'));
    }
  };

  const handleLocationDetection = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError(t('addRestaurant.alerts.locationPermissionMessage'), t('addRestaurant.alerts.permissionDeniedTitle'));
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
      showError(t('addRestaurant.alerts.locationError'), t('addRestaurant.alerts.errorTitle'));
    } finally {
      setIsLoading(false);
    }
  };

  // SUBMIT
  const handleSubmit = async () => {
    const validationErrors = validateRestaurantForm(formData, t);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      showError(t('addRestaurant.validation.fixFieldsMessage'), t('addRestaurant.validation.fixFieldsTitle'));
      return;
    }

    try {
      setIsLoading(true);

      const status = getRestaurantStatusSafe(createMockRestaurant(formData, image || undefined), t);
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
          ? formData.meal_voucher_info?.trim() || t('addRestaurant.mealVouchers.defaultInfo')
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

      const mealVoucherStatus = formData.accepts_meal_vouchers
        ? t('addRestaurant.mealVouchers.accepted')
        : t('addRestaurant.mealVouchers.notAccepted');
      showSuccess(
        t('addRestaurant.alerts.createSuccessMessage', {
          status: currentStatus ? t('openingHours.open') : t('openingHours.closed'),
          vouchers: mealVoucherStatus,
        }),
        t('addRestaurant.alerts.successTitle')
      );
      router.back();
    } catch (error: any) {
      let errorMessage = t('addRestaurant.alerts.createError');

      // apiClient peut re-throw sous deux formes :
      //   - axios standard : error.response.data
      //   - custom         : error.details (quand l'intercepteur transforme l'erreur)
      const responseData = error?.response?.data ?? error?.details;
      const validationErrors =
        responseData?.validation_errors ?? error?.validation_errors;

      if (validationErrors) {
        const backendErrors: FormValidationErrors = {};
        Object.entries(validationErrors).forEach(([field, messages]) => {
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
        errorMessage = t('addRestaurant.alerts.validationError');
      } else if (responseData?.error) {
        errorMessage = Array.isArray(responseData.error)
          ? responseData.error[0]
          : responseData.error;
      } else if (responseData?.detail) {
        errorMessage = responseData.detail;
      } else if (responseData?.message) {
        errorMessage = responseData.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      showError(errorMessage, t('addRestaurant.alerts.errorTitle'));
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================================================
  // PREVIEW COMPONENTS
  // ==========================================================================
  const MealVoucherPreview = () => (
    <View
      style={{
        backgroundColor: formData.accepts_meal_vouchers ? colors.goldenSurface : colors.background,
        borderRadius: BORDER_RADIUS.lg,
        padding: getResponsiveValue(SPACING.md, screenType),
        marginTop: getResponsiveValue(SPACING.md, screenType),
        borderWidth: 1,
        borderColor: formData.accepts_meal_vouchers ? colors.border.golden : colors.border.default,
        ...(formData.accepts_meal_vouchers ? shadows.goldenGlow : shadows.sm),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons
          name="card"
          size={20}
          color={formData.accepts_meal_vouchers ? colors.text.golden : colors.text.secondary}
        />
        <Text
          style={{
            marginLeft: 8,
            fontWeight: '600',
            color: formData.accepts_meal_vouchers ? colors.text.golden : colors.text.primary,
            fontSize: getResponsiveValue(SPACING.md, screenType),
          }}
        >
          {formData.accepts_meal_vouchers ? t('addRestaurant.mealVouchers.titleAccepted') : t('addRestaurant.mealVouchers.titleNotAccepted')}
        </Text>
      </View>
      {!!formData.meal_voucher_info?.trim() && (
        <Text
          style={{
            marginTop: 4,
            color: colors.text.secondary,
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
          backgroundColor: colors.goldenSurface,
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={icon as any} size={18} color={colors.text.golden} />
      </View>
      <Text
        style={{
          fontSize: getResponsiveValue(SPACING.lg, screenType),
          fontWeight: '700',
          color: colors.text.primary,
        }}
      >
        {title}
      </Text>
    </View>
  );

  // RENDER
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header title={t('addRestaurant.title')} showBackButton />

      <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
        {alertState && (
          <Alert
            variant={alertState.variant}
            title={alertState.title}
            message={alertState.message}
            onDismiss={hideAlert}
            autoDismiss={alertState.autoDismiss}
            autoDismissDuration={alertState.autoDismissDuration}
          />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: getResponsiveValue(SPACING.container, screenType),
            paddingBottom: Math.max(insets.bottom, 20) + keyboardHeight,
          }}
          showsVerticalScrollIndicator={false}
          bounces={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* IMAGE */}
          <SectionHeader icon="image" title={t('addRestaurant.image.section')} />
          <View
            style={{
              height: 200,
              backgroundColor: image ? 'transparent' : colors.goldenSurface,
              borderRadius: BORDER_RADIUS.xl,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: getResponsiveValue(SPACING.md, screenType),
              borderWidth: 2,
              borderStyle: image ? 'solid' : 'dashed',
              borderColor: image ? colors.border.golden : colors.border.dark,
              overflow: 'hidden',
              ...(!image && shadows.md),
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
                    backgroundColor: colors.error,
                    borderRadius: BORDER_RADIUS.full,
                    width: 36,
                    height: 36,
                    justifyContent: 'center',
                    alignItems: 'center',
                    ...shadows.lg,
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
                    backgroundColor: colors.variants.secondary[100],
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Ionicons name="image" size={32} color={colors.text.golden} />
                </View>
                <Text
                  style={{
                    fontSize: getResponsiveValue(SPACING.md, screenType),
                    fontWeight: '600',
                    color: colors.text.primary,
                    marginBottom: 4,
                  }}
                >
                  {t('addRestaurant.image.choose')}
                </Text>
                <Text
                  style={{
                    fontSize: getResponsiveValue(SPACING.sm, screenType),
                    color: colors.text.light,
                    textAlign: 'center',
                  }}
                >
                  {t('addRestaurant.image.formatHint')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* BASICS */}
          <SectionHeader icon="restaurant" title={t('addRestaurant.sections.basicInfo')} />
          <Card>
            <Input
              label={t('addRestaurant.fields.name')}
              placeholder={t('addRestaurant.fields.namePlaceholder')}
              value={formData.name}
              onChangeText={(text) => updateField('name', text)}
              error={errors.name}
              onFocus={() => clearError('name')}
            />
            <Input
              label={t('addRestaurant.fields.description')}
              placeholder={t('addRestaurant.fields.descriptionPlaceholder')}
              value={formData.description}
              onChangeText={(text) => updateField('description', text)}
              multiline
            />

            <Text
              style={{
                fontSize: getResponsiveValue(SPACING.sm, screenType),
                fontWeight: '600',
                color: colors.text.primary,
                marginTop: getResponsiveValue(SPACING.md, screenType),
                marginBottom: getResponsiveValue(SPACING.sm, screenType),
              }}
            >
              {t('addRestaurant.fields.cuisineType')}
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
                      backgroundColor: selected ? colors.goldenSurface : colors.surface,
                      borderColor: selected ? colors.variants.secondary[500] : colors.border.default,
                      ...(selected && shadows.goldenGlow),
                    }}
                  >
                    <Text style={{ fontSize: 14, color: selected ? colors.text.golden : colors.text.primary }}>
                      {opt.icon} {t('addRestaurant.cuisines.' + opt.value)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.cuisine && (
              <Text style={{ color: colors.error, fontSize: 12, marginTop: 4 }}>
                {errors.cuisine}
              </Text>
            )}

            <Text
              style={{
                fontSize: getResponsiveValue(SPACING.sm, screenType),
                fontWeight: '600',
                color: colors.text.primary,
                marginTop: getResponsiveValue(SPACING.lg, screenType),
                marginBottom: getResponsiveValue(SPACING.sm, screenType),
              }}
            >
              {t('addRestaurant.fields.priceRange')}
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
                      backgroundColor: selected ? colors.goldenSurface : colors.surface,
                      borderColor: selected ? colors.variants.secondary[500] : colors.border.default,
                      ...(selected && shadows.goldenGlow),
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: '700',
                        fontSize: 18,
                        color: selected ? colors.text.golden : colors.text.primary,
                      }}
                    >
                      {p.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        color: colors.text.light,
                      }}
                    >
                      {t('addRestaurant.priceRanges.' + p.key)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>

          {/* CONTACT */}
          <SectionHeader icon="call" title={t('addRestaurant.sections.contact')} />
          <Card>
            <Input
              label={t('addRestaurant.fields.phone')}
              placeholder="0612345678 ou +33612345678"
              value={formData.phone}
              onChangeText={(text) => updateField('phone', text)}
              error={errors.phone}
              onFocus={() => clearError('phone')}
              keyboardType="phone-pad"
            />
            <Input
              label={t('addRestaurant.fields.email')}
              placeholder="contact@restaurant.com"
              value={formData.email}
              onChangeText={(text) => updateField('email', text)}
              error={errors.email}
              onFocus={() => clearError('email')}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Input
              label={t('addRestaurant.fields.website')}
              placeholder="https://www.restaurant.com"
              value={formData.website}
              onChangeText={(text) => updateField('website', text)}
              keyboardType="url"
              autoCapitalize="none"
            />
          </Card>

          {/* ADRESSE */}
          <SectionHeader icon="location" title={t('addRestaurant.sections.location')} />
          <Card>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: getResponsiveValue(SPACING.md, screenType),
              }}
            >
              <Text style={{ fontWeight: '600', color: colors.text.primary }}>Adresse</Text>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.goldenSurface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: BORDER_RADIUS.md,
                  borderWidth: 1,
                  borderColor: colors.border.golden,
                }}
                onPress={handleLocationDetection}
              >
                <Ionicons name="locate" size={16} color={colors.text.golden} />
                <Text style={{ marginLeft: 6, color: colors.text.golden, fontSize: 13, fontWeight: '500' }}>
                  Ma position
                </Text>
              </TouchableOpacity>
            </View>

            <Input
              label={t('addRestaurant.fields.address')}
              placeholder="12 rue de la Paix"
              value={formData.address}
              onChangeText={(text) => updateField('address', text)}
              error={errors.address}
              onFocus={() => clearError('address')}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input
                  label={t('addRestaurant.fields.city')}
                  placeholder={t('addRestaurant.fields.cityPlaceholder')}
                  value={formData.city}
                  onChangeText={(text) => updateField('city', text)}
                  error={errors.city}
                  onFocus={() => clearError('city')}
                />
              </View>
              <View style={{ width: 120 }}>
                <Input
                  label={t('addRestaurant.fields.postalCode')}
                  placeholder="75001"
                  value={formData.zipCode}
                  onChangeText={(text) => updateField('zipCode', text)}
                  error={errors.zipCode}
                  onFocus={() => clearError('zipCode')}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </Card>

          {/* HORAIRES */}
          <SectionHeader icon="time" title={t('openingHours.title')} />
          <Card>
            <MultiPeriodHoursEditor
              openingHours={formData.openingHours}
              onChange={(newHours) => updateField('openingHours', newHours)}
            />
            {!!errors.openingHours && (
              <Text style={{ color: colors.error, marginTop: 8, fontSize: 13 }}>
                {errors.openingHours}
              </Text>
            )}
          </Card>

          {/* TITRES-RESTAURANT */}
          <SectionHeader icon="card" title={t('addRestaurant.sections.mealVouchers')} />
          <Card>
            <View
              style={{
                backgroundColor: colors.goldenSurface,
                borderRadius: BORDER_RADIUS.lg,
                padding: getResponsiveValue(SPACING.md, screenType),
                borderWidth: 1,
                borderColor: colors.border.golden,
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
                  <Text style={{ fontWeight: '600', color: colors.text.primary, fontSize: 15 }}>
                    {t('addRestaurant.mealVouchers.accept')}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.text.light,
                      marginTop: 2,
                    }}
                  >
                    {t('addRestaurant.mealVouchers.providers')}
                  </Text>
                </View>
                <Switch
                  value={formData.accepts_meal_vouchers}
                  onValueChange={(v) => updateField('accepts_meal_vouchers', v)}
                  trackColor={{
                    false: colors.border.default,
                    true: colors.variants.secondary[400],
                  }}
                  thumbColor={colors.surface}
                />
              </View>

              {formData.accepts_meal_vouchers && (
                <>
                  <View
                    style={{
                      backgroundColor: colors.variants.secondary[100],
                      borderRadius: BORDER_RADIUS.md,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.variants.secondary[900],
                        marginBottom: 6,
                      }}
                    >
                      {t('addRestaurant.mealVouchers.legalInfoTitle')}
                    </Text>
                    {MEAL_VOUCHER_LEGAL_KEYS.map((k) => (
                      <Text
                        key={k}
                        style={{
                          fontSize: 11,
                          color: colors.variants.secondary[800],
                          marginTop: 2,
                        }}
                      >
                        • {t('addRestaurant.mealVouchers.' + k)}
                      </Text>
                    ))}
                  </View>
                  <Input
                    label={t('addRestaurant.mealVouchers.customInfoLabel')}
                    placeholder={t('addRestaurant.mealVouchers.customInfoPlaceholder')}
                    value={formData.meal_voucher_info}
                    onChangeText={(text) => updateField('meal_voucher_info', text)}
                  />
                  <MealVoucherPreview />
                </>
              )}
            </View>
          </Card>

          {/* INFORMATIONS LÉGALES */}
          <SectionHeader icon="business" title={t('addRestaurant.sections.legal')} />
          <Card>
            <Input
              label={t('addRestaurant.fields.siret')}
              placeholder={t('addRestaurant.fields.siretPlaceholder')}
              value={formData.siret}
              onChangeText={(text) => updateField('siret', text.replace(/\D/g, '').slice(0, 14))}
              error={errors.siret}
              onFocus={() => {
                clearError('siret');
                scrollToInputEnd();
              }}
              keyboardType="number-pad"
              maxLength={14}
            />
            <Input
              label={t('addRestaurant.fields.raisonSociale')}
              placeholder={t('addRestaurant.fields.raisonSocialePlaceholder')}
              value={formData.raison_sociale}
              onChangeText={(text) => updateField('raison_sociale', text)}
              onFocus={scrollToInputEnd}
            />
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
                backgroundColor: colors.primary,
                paddingVertical: 16,
                borderRadius: BORDER_RADIUS.xl,
                alignItems: 'center',
                ...shadows.button,
              }}
            >
              <Text
                style={{
                  color: colors.text.inverse,
                  fontSize: 16,
                  fontWeight: '700',
                }}
              >
                {isLoading ? t('addRestaurant.submit.creating') : t('addRestaurant.submit.create')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {isLoading && <Loading text={t('addRestaurant.submit.processing')} fullScreen />}
    </View>
  );
}