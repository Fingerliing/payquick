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
import { ValidationUtils } from '@/utils/validators';
import { CUISINE_TYPES } from '@/utils/constants';
import { Restaurant } from '@/types/restaurant';

export default function AddRestaurantScreen() {
  const { createRestaurant } = useRestaurant();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
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
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (field: string, value: string | number) => {
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
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de récupérer votre position');
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = () => {
    const validation = ValidationUtils.validateRestaurant(formData);
    setErrors(validation.errors);
    return validation.isValid;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('Erreur', 'Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    setIsLoading(true);
    try {
      const restaurantData = {
        ...formData,
        image,
        rating: 0,
        reviewCount: 0,
        isActive: true,
        openingHours: [],
        location: {
          latitude: 0,
          longitude: 0,
        },
        ownerId: '', // Sera défini côté serveur
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createRestaurant(restaurantData as Omit<Restaurant, 'id' | 'createdAt' | 'updatedAt'>);
      Alert.alert('Succès', 'Restaurant créé avec succès', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Impossible de créer le restaurant');
    } finally {
      setIsLoading(false);
    }
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
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  };

  const imageStyle: ImageStyle = {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  };

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

  // Calculer la hauteur du footer avec safe area
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
          paddingBottom: footerHeight + 16 // Espace pour le bouton + marge
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Propriétés importantes pour éviter que le clavier cache les champs
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
        </Card>

        {/* Informations de base */}
        <Card style={{ marginTop: 16 }}>
          <Text style={sectionTitleStyle}>Informations de base</Text>
          
          <Input
            label="Nom du restaurant *"
            placeholder="Le Petit Bistrot"
            value={formData.name}
            onChangeText={(value) => updateField('name', value)}
            error={errors.name}
          />

          <Input
            label="Description"
            placeholder="Cuisine française traditionnelle..."
            value={formData.description}
            onChangeText={(value) => updateField('description', value)}
            multiline
            numberOfLines={3}
            error={errors.description}
          />

          <Input
            label="Type de cuisine *"
            placeholder="Sélectionnez un type"
            value={formData.cuisine}
            onChangeText={(value) => updateField('cuisine', value)}
            error={errors.cuisine}
          />

          <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
            Gamme de prix *
          </Text>
          <View style={priceRangeStyle}>
            {[1, 2, 3, 4].map((price) => (
              <TouchableOpacity
                key={price}
                style={priceButtonStyle(formData.priceRange === price)}
                onPress={() => updateField('priceRange', price)}
              >
                <Text style={priceTextStyle(formData.priceRange === price)}>
                  {'€'.repeat(price)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
                maxLength={5}
                error={errors.zipCode}
              />
            </View>
          </View>

          <Input
            label="Pays"
            placeholder="France"
            value={formData.country}
            onChangeText={(value) => updateField('country', value)}
          />
        </Card>

        {/* Contact */}
        <Card style={{ marginTop: 16 }}>
          <Text style={sectionTitleStyle}>Contact</Text>
          
          <Input
            label="Téléphone *"
            placeholder="+33 1 23 45 67 89"
            value={formData.phone}
            onChangeText={(value) => updateField('phone', value)}
            keyboardType="phone-pad"
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

        {/* Espace supplémentaire pour éviter que le dernier champ soit caché */}
        <View style={{ height: 24 }} />

        {/* Bouton de validation - Maintenant dans le ScrollView */}
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          paddingVertical: 16,
          paddingHorizontal: 4, // Petit padding pour aligner avec le contenu
          borderRadius: 12,
          marginTop: 8,
          // Shadow pour donner l'impression d'un bouton important
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
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}