import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// UI
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert as InlineAlert } from '@/components/ui/Alert';

// Services & Types
import { menuService } from '@/services/menuService';
import { categoryService } from '@/services/categoryService';
import { MenuCategory, MenuSubCategory } from '@/types/category';

// Design System
import {
  useScreenType,
  getResponsiveValue,
  createResponsiveStyles,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  COMPONENT_CONSTANTS,
  TYPOGRAPHY,
  SHADOWS,
} from '@/utils/designSystem';

// Allergènes (UE)
const ALLERGENS = [
  { id: 'gluten', name: 'Gluten', icon: '🌾', description: 'Blé, seigle, orge, avoine' },
  { id: 'crustaceans', name: 'Crustacés', icon: '🦐', description: 'Crevettes, crabes, homards' },
  { id: 'eggs', name: 'Œufs', icon: '🥚', description: "Œufs et produits à base d'œufs" },
  { id: 'fish', name: 'Poissons', icon: '🐟', description: 'Poissons et produits à base de poissons' },
  { id: 'peanuts', name: 'Arachides', icon: '🥜', description: 'Cacahuètes et produits dérivés' },
  { id: 'soy', name: 'Soja', icon: '🫘', description: 'Soja et produits à base de soja' },
  { id: 'milk', name: 'Lait', icon: '🥛', description: 'Lait et produits laitiers (lactose)' },
  { id: 'nuts', name: 'Fruits à coque', icon: '🌰', description: 'Amandes, noisettes, noix, etc.' },
  { id: 'celery', name: 'Céleri', icon: '🥬', description: 'Céleri et produits à base de céleri' },
  { id: 'mustard', name: 'Moutarde', icon: '🟡', description: 'Moutarde et produits dérivés' },
  { id: 'sesame', name: 'Sésame', icon: '◯', description: 'Graines de sésame et produits dérivés' },
  { id: 'sulfites', name: 'Sulfites', icon: '🍷', description: 'Anhydride sulfureux et sulfites' },
  { id: 'lupin', name: 'Lupin', icon: '🌸', description: 'Lupin et produits à base de lupin' },
  { id: 'mollusks', name: 'Mollusques', icon: '🐚', description: 'Escargots, moules, huîtres, etc.' },
] as const;

type Allergen = typeof ALLERGENS[number]['id'];

const DEFAULT_CATEGORY_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E',
];

const VAT_TYPES = [
  { id: 'FOOD', name: 'Nourriture', rate: 0.10, icon: '🍽️', description: 'Restauration sur place et à emporter' },
  { id: 'DRINK_SOFT', name: 'Boissons soft', rate: 0.10, icon: '🥤', description: 'Boissons non alcoolisées' },
  { id: 'DRINK_ALCOHOL', name: 'Boissons alcoolisées', rate: 0.20, icon: '🍺', description: 'Boissons alcoolisées' },
  { id: 'PACKAGED', name: 'Produits préemballés', rate: 0.055, icon: '📦', description: 'Produits préemballés à emporter' },
];

export default function AddMenuItemScreen() {
  const { menuId, restaurantId } = useLocalSearchParams<{ menuId: string; restaurantId: string }>();
  const { width } = useWindowDimensions();
  const screenType = useScreenType();
  const R = createResponsiveStyles(screenType);
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);

  // Toast state
  const [toast, setToast] = useState<{
    visible: boolean;
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({ visible: false, variant: 'info', message: '' });

  const showToast = useCallback(
    (variant: 'success' | 'error' | 'warning' | 'info', message: string, title?: string) => {
      setToast({ visible: true, variant, message, title });
    },
    []
  );
  const hideToast = useCallback(() => setToast(p => ({ ...p, visible: false })), []);

  // Responsive styles instance
  const styles = useMemo(() => createStyles(screenType, insets), [screenType, insets.top]);

  // Layout config
  const layout = useMemo(() => ({
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    contentSpacing: getResponsiveValue(SPACING.lg, screenType),
    cardSpacing: getResponsiveValue(SPACING.md, screenType),
    maxContentWidth: screenType === 'desktop' ? 840 : undefined,
    modalMaxWidth: screenType === 'desktop' ? 640 : undefined,
    isTabletLandscape: screenType === 'tablet' && width > 1000,
  }), [screenType, width]);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<MenuSubCategory | null>(null);
  const [selectedAllergens, setSelectedAllergens] = useState<Allergen[]>([]);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegan, setIsVegan] = useState(false);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Data state
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [subCategories, setSubCategories] = useState<MenuSubCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Modals state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [showCreateSubCategoryModal, setShowCreateSubCategoryModal] = useState(false);

  // Create category state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_CATEGORY_COLORS[0]);

  // Create subcategory state
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [newSubCategoryDescription, setNewSubCategoryDescription] = useState('');

  // VAT type state
  const [selectedVatType, setSelectedVatType] = useState('FOOD');
  const [showVatTypeModal, setShowVatTypeModal] = useState(false);

  // Effects
  useEffect(() => {
    loadCategories();
  }, [restaurantId]);

  useEffect(() => {
    if (selectedCategory?.id) {
      loadSubCategories(selectedCategory.id);
    } else {
      setSubCategories([]);
      setSelectedSubCategory(null);
    }
  }, [selectedCategory?.id]);

  // API
  const loadCategories = async () => {
    if (!restaurantId) return;
    try {
      setLoadingCategories(true);
      const res = await categoryService.getCategoriesByRestaurant(String(restaurantId));
      setCategories(res.categories || []);
    } catch (e: any) {
      console.error('loadCategories error:', e);
      showToast('error', 'Impossible de charger les catégories', 'Erreur');
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadSubCategories = async (categoryId: string) => {
    try {
      const res = await categoryService.getSubCategoriesByCategory(categoryId);
      setSubCategories(res.subcategories || []);
    } catch (e: any) {
      console.error('loadSubCategories error:', e);
      setSubCategories([]);
      showToast('error', 'Impossible de charger les sous-catégories', 'Erreur');
    }
  };

  // Handlers
  const handleAllergenToggle = (id: Allergen) => {
    setSelectedAllergens(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    if (id === 'gluten') setIsGlutenFree(false);
  };

  const handleGlutenFreeToggle = (value: boolean) => {
    setIsGlutenFree(value);
    if (value) setSelectedAllergens(prev => prev.filter(a => a !== 'gluten'));
  };

  const handleVeganToggle = (value: boolean) => {
    setIsVegan(value);
    if (value) {
      setIsVegetarian(true);
      setSelectedAllergens(prev => prev.filter(a => a !== 'milk' && a !== 'eggs'));
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      showToast('warning', 'Le nom de la catégorie est requis', 'Attention');
      return;
    }
    if (!restaurantId) return;
    try {
      const category = await categoryService.createCategory({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || undefined,
        icon: newCategoryIcon.trim() || undefined,
        color: newCategoryColor,
      }, String(restaurantId));
      
      setCategories(prev => [...prev, category]);
      setSelectedCategory(category);
      setShowCreateCategoryModal(false);
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryIcon('');
      setNewCategoryColor(DEFAULT_CATEGORY_COLORS[0]);
      showToast('success', 'Catégorie créée avec succès');
    } catch (e: any) {
      showToast('error', 'Erreur lors de la création de la catégorie');
    }
  };

  const handleCreateSubCategory = async () => {
    if (!newSubCategoryName.trim() || !selectedCategory?.id) {
      showToast('warning', 'Le nom de la sous-catégorie est requis', 'Attention');
      return;
    }
    try {
      const subcategory = await categoryService.createSubCategory({
        name: newSubCategoryName.trim(),
        description: newSubCategoryDescription.trim() || undefined,
        category: selectedCategory.id,
      });
      
      setSubCategories(prev => [...prev, subcategory]);
      setSelectedSubCategory(subcategory);
      setShowCreateSubCategoryModal(false);
      setNewSubCategoryName('');
      setNewSubCategoryDescription('');
      showToast('success', 'Sous-catégorie créée avec succès');
    } catch (e: any) {
      showToast('error', 'Erreur lors de la création de la sous-catégorie');
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
    }
  };

  const handleTakePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        name: `photo-${Date.now()}.jpg`,
        type: 'image/jpeg',
      });
    }
  };

  const handleRemovePhoto = () => setPhoto(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast('warning', 'Le nom du plat est requis', 'Champ manquant');
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      showToast('warning', 'Le prix doit être supérieur à 0', 'Prix invalide');
      return;
    }
    if (!selectedCategory) {
      showToast('warning', 'Veuillez sélectionner une catégorie', 'Catégorie manquante');
      return;
    }

    const vatType = VAT_TYPES.find(v => v.id === selectedVatType);
    if (!vatType) return;

    try {
      setIsCreating(true);

      // Créer un FormData pour envoyer l'image avec les données
      const formData = new FormData();
      
      // Ajouter tous les champs requis
      formData.append('menu', String(menuId));
      formData.append('name', name.trim());
      formData.append('price', price);
      formData.append('category', selectedCategory.id);
      formData.append('is_vegetarian', String(isVegetarian));
      formData.append('is_vegan', String(isVegan));
      formData.append('is_gluten_free', String(isGlutenFree));
      formData.append('vat_rate', String(vatType.rate));
      formData.append('vat_category', vatType.id);

      // Ajouter les champs optionnels
      if (description.trim()) {
        formData.append('description', description.trim());
      }
      if (selectedSubCategory?.id) {
        formData.append('subcategory', selectedSubCategory.id);
      }
      if (selectedAllergens.length > 0) {
        formData.append('allergens', JSON.stringify(selectedAllergens));
      }

      // Ajouter l'image si présente
      if (photo) {
        formData.append('image', {
          uri: photo.uri,
          name: photo.name,
          type: photo.type,
        } as any);
      }

      console.log('Creating menu item with FormData');
      
      // Envoyer directement avec FormData
      const token = await AsyncStorage.getItem('access_token') || 
                    await AsyncStorage.getItem('auth_token') ||
                    await AsyncStorage.getItem('token');
      
      if (!token) {
        throw new Error('Token d\'authentification manquant. Veuillez vous reconnecter.');
      }
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/menu-items/`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`,
          // Ne pas définir Content-Type, laissez le navigateur le faire automatiquement pour FormData
        },
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.message || 'Erreur lors de la création');
        } catch {
          throw new Error(`Erreur ${response.status}: ${errorText}`);
        }
      }

      const result = await response.json();
      console.log('Create response:', result);

      showToast('success', 'Article créé avec succès !');
      setTimeout(() => router.back(), 1000);
    } catch (e: any) {
      console.error('handleCreate error:', e);
      
      // Meilleure identification de l'erreur
      if (e.message?.includes('JSON Parse error')) {
        showToast('error', 'Erreur serveur : réponse invalide. Vérifiez l\'URL de l\'API.');
      } else if (e.message?.includes('Network request failed')) {
        showToast('error', 'Erreur réseau : impossible de contacter le serveur');
      } else {
        showToast('error', e.message || 'Erreur lors de la création de l\'article');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const selectedVat = VAT_TYPES.find(v => v.id === selectedVatType);

  return (
    <View style={styles.container}>
      <Header 
        title="Nouvel article" 
        showBackButton
        rightActions={[
          {
            icon: 'checkmark',
            onPress: handleCreate,
            disabled: isCreating,
            loading: isCreating,
          },
        ]}
      />

      <ScrollView 
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo Section - Premium Design */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📸 Photo du plat</Text>
            <Text style={styles.sectionSubtitle}>Recommandé pour attirer vos clients</Text>
          </View>
          <View style={styles.photoCard}>
            {photo ? (
              <View>
                <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
                <View style={styles.photoOverlay}>
                  <TouchableOpacity style={styles.photoOverlayButton} onPress={handleRemovePhoto}>
                    <Ionicons name="trash-outline" size={20} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoOverlayButton} onPress={handlePickImage}>
                    <Ionicons name="images-outline" size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.photoPlaceholder}>
                <View style={styles.photoPlaceholderIcon}>
                  <Ionicons name="camera-outline" size={48} color={COLORS.text.golden} />
                </View>
                <Text style={styles.photoPlaceholderTitle}>Ajoutez une photo</Text>
                <Text style={styles.photoPlaceholderSubtext}>
                  Format recommandé : 16:9 • Max 5 Mo
                </Text>
                <View style={styles.photoButtonsRow}>
                  <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
                    <Ionicons name="images-outline" size={20} color={COLORS.primary} />
                    <Text style={styles.photoButtonText}>Galerie</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                    <Ionicons name="camera-outline" size={20} color={COLORS.primary} />
                    <Text style={styles.photoButtonText}>Appareil photo</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Basic Info Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📝 Informations de base</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nom du plat *</Text>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Ex: Burger Signature"
                style={styles.input}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Description</Text>
              <Input
                value={description}
                onChangeText={setDescription}
                placeholder="Décrivez votre plat..."
                multiline
                numberOfLines={3}
                style={[styles.input, styles.inputMultiline]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Prix (€) *</Text>
              <View style={styles.priceInputContainer}>
                <Input
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  style={styles.priceInput}
                />
                <View style={styles.priceSymbol}>
                  <Text style={styles.priceSymbolText}>€</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Category Section - Visual Cards */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🏷️ Catégorisation</Text>
            <Text style={styles.sectionSubtitle}>Aidez vos clients à naviguer dans le menu</Text>
          </View>

          <View style={styles.categoryCard}>
            <Text style={styles.categoryLabel}>Catégorie principale *</Text>
            <TouchableOpacity
              style={[
                styles.categorySelector,
                selectedCategory && styles.categorySelectorSelected,
              ]}
              onPress={() => setShowCategoryModal(true)}
            >
              {selectedCategory ? (
                <View style={styles.categorySelectorContent}>
                  <View style={[styles.categoryIcon, { backgroundColor: selectedCategory.color + '20' }]}>
                    <Text style={styles.categoryIconText}>{selectedCategory.icon || '📁'}</Text>
                  </View>
                  <View style={styles.categorySelectorText}>
                    <Text style={styles.categorySelectorName}>{selectedCategory.name}</Text>
                    {selectedCategory.description && (
                      <Text style={styles.categorySelectorDesc}>{selectedCategory.description}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
                </View>
              ) : (
                <View style={styles.categorySelectorContent}>
                  <View style={styles.categoryIconPlaceholder}>
                    <Ionicons name="folder-outline" size={24} color={COLORS.text.secondary} />
                  </View>
                  <Text style={styles.placeholderText}>Sélectionnez une catégorie</Text>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
                </View>
              )}
            </TouchableOpacity>

            {selectedCategory && (
              <>
                <View style={styles.divider} />
                <Text style={styles.categoryLabel}>Sous-catégorie (optionnel)</Text>
                <TouchableOpacity
                  style={[
                    styles.categorySelector,
                    selectedSubCategory && styles.categorySelectorSelected,
                  ]}
                  onPress={() => setShowSubCategoryModal(true)}
                >
                  {selectedSubCategory ? (
                    <View style={styles.categorySelectorContent}>
                      <View style={[styles.categoryIcon, { backgroundColor: COLORS.variants.primary[100] }]}>
                        <Text style={styles.categoryIconText}>📂</Text>
                      </View>
                      <View style={styles.categorySelectorText}>
                        <Text style={styles.categorySelectorName}>{selectedSubCategory.name}</Text>
                        {selectedSubCategory.description && (
                          <Text style={styles.categorySelectorDesc}>{selectedSubCategory.description}</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
                    </View>
                  ) : (
                    <View style={styles.categorySelectorContent}>
                      <View style={styles.categoryIconPlaceholder}>
                        <Ionicons name="folder-open-outline" size={24} color={COLORS.text.secondary} />
                      </View>
                      <Text style={styles.placeholderText}>Sélectionnez une sous-catégorie</Text>
                      <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* VAT Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>💰 TVA</Text>
          </View>
          <TouchableOpacity
            style={styles.vatCard}
            onPress={() => setShowVatTypeModal(true)}
          >
            <View style={styles.vatIconContainer}>
              <Text style={styles.vatIcon}>{selectedVat?.icon}</Text>
            </View>
            <View style={styles.vatInfo}>
              <Text style={styles.vatName}>{selectedVat?.name}</Text>
              <Text style={styles.vatRate}>
                Taux : {selectedVat ? (selectedVat.rate * 100).toFixed(1) : '0'}%
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Allergens Section - Compact Badges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⚠️ Allergènes</Text>
            <Text style={styles.sectionSubtitle}>
              {selectedAllergens.length > 0 
                ? `${selectedAllergens.length} sélectionné${selectedAllergens.length > 1 ? 's' : ''}`
                : 'Aucun allergène sélectionné'}
            </Text>
          </View>
          <View style={styles.allergenCard}>
            <View style={styles.allergenGrid}>
              {ALLERGENS.map(allergen => {
                const selected = selectedAllergens.includes(allergen.id);
                return (
                  <TouchableOpacity
                    key={allergen.id}
                    style={[styles.allergenBadge, selected && styles.allergenBadgeSelected]}
                    onPress={() => handleAllergenToggle(allergen.id)}
                  >
                    <Text style={styles.allergenBadgeIcon}>{allergen.icon}</Text>
                    <Text style={[
                      styles.allergenBadgeName,
                      selected && styles.allergenBadgeNameSelected
                    ]}>
                      {allergen.name}
                    </Text>
                    {selected && (
                      <View style={styles.allergenBadgeCheck}>
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* Dietary Options Section - Modern Pills */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🌱 Options diététiques</Text>
          </View>
          <View style={styles.dietaryCard}>
            <TouchableOpacity
              style={[styles.dietaryPill, isVegetarian && styles.dietaryPillVegetarian]}
              onPress={() => setIsVegetarian(!isVegetarian)}
            >
              <Text style={styles.dietaryPillIcon}>🥗</Text>
              <View style={styles.dietaryPillContent}>
                <Text style={[
                  styles.dietaryPillTitle,
                  isVegetarian && styles.dietaryPillTitleActive
                ]}>
                  Végétarien
                </Text>
                <Text style={[
                  styles.dietaryPillDesc,
                  isVegetarian && styles.dietaryPillDescActive
                ]}>
                  Sans viande ni poisson
                </Text>
              </View>
              <View style={[
                styles.dietaryPillCheckbox,
                isVegetarian && styles.dietaryPillCheckboxActive
              ]}>
                {isVegetarian && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dietaryPill, isVegan && styles.dietaryPillVegan]}
              onPress={() => handleVeganToggle(!isVegan)}
            >
              <Text style={styles.dietaryPillIcon}>🌿</Text>
              <View style={styles.dietaryPillContent}>
                <Text style={[
                  styles.dietaryPillTitle,
                  isVegan && styles.dietaryPillTitleActive
                ]}>
                  Végan
                </Text>
                <Text style={[
                  styles.dietaryPillDesc,
                  isVegan && styles.dietaryPillDescActive
                ]}>
                  Sans produits animaux
                </Text>
              </View>
              <View style={[
                styles.dietaryPillCheckbox,
                isVegan && styles.dietaryPillCheckboxActive
              ]}>
                {isVegan && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dietaryPill, isGlutenFree && styles.dietaryPillGlutenFree]}
              onPress={() => handleGlutenFreeToggle(!isGlutenFree)}
            >
              <Text style={styles.dietaryPillIcon}>🌾</Text>
              <View style={styles.dietaryPillContent}>
                <Text style={[
                  styles.dietaryPillTitle,
                  isGlutenFree && styles.dietaryPillTitleActive
                ]}>
                  Sans gluten
                </Text>
                <Text style={[
                  styles.dietaryPillDesc,
                  isGlutenFree && styles.dietaryPillDescActive
                ]}>
                  Sans blé, seigle, orge
                </Text>
              </View>
              <View style={[
                styles.dietaryPillCheckbox,
                isGlutenFree && styles.dietaryPillCheckboxActive
              ]}>
                {isGlutenFree && <Ionicons name="checkmark" size={16} color="#FFF" />}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Create Button */}
        <View style={styles.bottomButtonContainer}>
          <Button
            title={isCreating ? 'Création en cours...' : 'Créer l\'article'}
            onPress={handleCreate}
            variant="primary"
            disabled={isCreating || !name.trim() || !price.trim()}
            loading={isCreating}
            style={styles.bottomButton}
          />
        </View>
      </ScrollView>

      {/* Toast */}
      {toast.visible && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute' as const,
            left: 16,
            right: 16,
            bottom: 24,
            zIndex: 1000,
          }}
        >
          <InlineAlert
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onDismiss={hideToast}
            autoDismiss
            autoDismissDuration={5000}
          />
        </View>
      )}

      {/* Category Modal */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCategoryModal(false)}
          />
          <View style={[
            styles.modalContainer,
            { paddingBottom: insets.bottom || 16 },
            layout.modalMaxWidth ? { maxWidth: layout.modalMaxWidth, alignSelf: 'center' as const, width: '100%' as const } : undefined
          ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une catégorie</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.modalItem,
                    selectedCategory?.id === cat.id && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    setShowCategoryModal(false);
                  }}
                >
                  <View style={[styles.modalItemIcon, { backgroundColor: cat.color + '20' }]}>
                    <Text style={styles.modalItemIconText}>{cat.icon || '📁'}</Text>
                  </View>
                  <View style={styles.modalItemText}>
                    <Text style={styles.modalItemName}>{cat.name}</Text>
                    {cat.description && (
                      <Text style={styles.modalItemDesc}>{cat.description}</Text>
                    )}
                  </View>
                  {selectedCategory?.id === cat.id && (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalCreateButton}
                onPress={() => {
                  setShowCategoryModal(false);
                  setShowCreateCategoryModal(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
                <Text style={styles.modalCreateButtonText}>Créer une nouvelle catégorie</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SubCategory Modal */}
      <Modal
        visible={showSubCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSubCategoryModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowSubCategoryModal(false)}
          />
          <View style={[
            styles.modalContainer,
            { paddingBottom: insets.bottom || 16 },
            layout.modalMaxWidth ? { maxWidth: layout.modalMaxWidth, alignSelf: 'center' as const, width: '100%' as const } : undefined
          ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une sous-catégorie</Text>
              <TouchableOpacity onPress={() => setShowSubCategoryModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {subCategories.map(sub => (
                <TouchableOpacity
                  key={sub.id}
                  style={[
                    styles.modalItem,
                    selectedSubCategory?.id === sub.id && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setSelectedSubCategory(sub);
                    setShowSubCategoryModal(false);
                  }}
                >
                  <View style={[styles.modalItemIcon, { backgroundColor: COLORS.variants.primary[100] }]}>
                    <Text style={styles.modalItemIconText}>📂</Text>
                  </View>
                  <View style={styles.modalItemText}>
                    <Text style={styles.modalItemName}>{sub.name}</Text>
                    {sub.description && (
                      <Text style={styles.modalItemDesc}>{sub.description}</Text>
                    )}
                  </View>
                  {selectedSubCategory?.id === sub.id && (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.modalCreateButton}
                onPress={() => {
                  setShowSubCategoryModal(false);
                  setShowCreateSubCategoryModal(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={24} color={COLORS.primary} />
                <Text style={styles.modalCreateButtonText}>Créer une nouvelle sous-catégorie</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* VAT Type Modal */}
      <Modal
        visible={showVatTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowVatTypeModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowVatTypeModal(false)}
          />
          <View style={[
            styles.modalContainer,
            { paddingBottom: insets.bottom || 16 },
            layout.modalMaxWidth ? { maxWidth: layout.modalMaxWidth, alignSelf: 'center' as const, width: '100%' as const } : undefined
          ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Type de TVA</Text>
              <TouchableOpacity onPress={() => setShowVatTypeModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {VAT_TYPES.map(vat => (
                <TouchableOpacity
                  key={vat.id}
                  style={[
                    styles.modalItem,
                    selectedVatType === vat.id && styles.modalItemSelected
                  ]}
                  onPress={() => {
                    setSelectedVatType(vat.id);
                    setShowVatTypeModal(false);
                  }}
                >
                  <View style={styles.modalItemIcon}>
                    <Text style={styles.modalItemIconText}>{vat.icon}</Text>
                  </View>
                  <View style={styles.modalItemText}>
                    <Text style={styles.modalItemName}>{vat.name}</Text>
                    <Text style={styles.modalItemDesc}>
                      {vat.description} • Taux : {(vat.rate * 100).toFixed(1)}%
                    </Text>
                  </View>
                  {selectedVatType === vat.id && (
                    <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Category Modal */}
      <Modal
        visible={showCreateCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateCategoryModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCreateCategoryModal(false)}
          />
          <View style={[
            styles.modalContainer,
            { paddingBottom: insets.bottom || 16 },
            layout.modalMaxWidth ? { maxWidth: layout.modalMaxWidth, alignSelf: 'center' as const, width: '100%' as const } : undefined
          ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle catégorie</Text>
              <TouchableOpacity onPress={() => setShowCreateCategoryModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Nom *</Text>
                <Input
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="Ex: Entrées"
                  style={styles.modalInput}
                />
              </View>
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Description</Text>
                <Input
                  value={newCategoryDescription}
                  onChangeText={setNewCategoryDescription}
                  placeholder="Description de la catégorie"
                  multiline
                  style={styles.modalInput}
                />
              </View>
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Icône (émoji)</Text>
                <Input
                  value={newCategoryIcon}
                  onChangeText={setNewCategoryIcon}
                  placeholder="Ex: 🍽️"
                  style={styles.modalInput}
                />
              </View>
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Couleur</Text>
                <View style={styles.colorGrid}>
                  {DEFAULT_CATEGORY_COLORS.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        newCategoryColor === color && styles.colorOptionSelected
                      ]}
                      onPress={() => setNewCategoryColor(color)}
                    >
                      {newCategoryColor === color && (
                        <Ionicons name="checkmark" size={20} color="#FFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <Button
                title="Créer la catégorie"
                onPress={handleCreateCategory}
                variant="primary"
                style={styles.modalCreateButton2}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create SubCategory Modal */}
      <Modal
        visible={showCreateSubCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateSubCategoryModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowCreateSubCategoryModal(false)}
          />
          <View style={[
            styles.modalContainer,
            { paddingBottom: insets.bottom || 16 },
            layout.modalMaxWidth ? { maxWidth: layout.modalMaxWidth, alignSelf: 'center' as const, width: '100%' as const } : undefined
          ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle sous-catégorie</Text>
              <TouchableOpacity onPress={() => setShowCreateSubCategoryModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Nom *</Text>
                <Input
                  value={newSubCategoryName}
                  onChangeText={setNewSubCategoryName}
                  placeholder="Ex: Salades"
                  style={styles.modalInput}
                />
              </View>
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Description</Text>
                <Input
                  value={newSubCategoryDescription}
                  onChangeText={setNewSubCategoryDescription}
                  placeholder="Description de la sous-catégorie"
                  multiline
                  style={styles.modalInput}
                />
              </View>
              <Button
                title="Créer la sous-catégorie"
                onPress={handleCreateSubCategory}
                variant="primary"
                style={styles.modalCreateButton2}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// Styles - Modern & Premium Design
const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop', insets: { top: number; bottom: number; left: number; right: number }) => {
  const gv = (token: any): number => getResponsiveValue(token, screenType) as number;
  
  return {
    container: {
      flex: 1 as const,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1 as const,
    },
    
    // Section Styles
    section: {
      marginBottom: gv(SPACING['2xl']),
      paddingHorizontal: gv(SPACING.container),
    },
    sectionHeader: {
      marginBottom: gv(SPACING.md),
    },
    sectionTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.xl),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      color: COLORS.text.secondary,
    },

    // Photo Section - Premium
    photoCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      overflow: 'hidden' as const,
      ...SHADOWS.card,
    },
    photoImage: {
      width: '100%' as const,
      height: 220,
    },
    photoOverlay: {
      position: 'absolute' as const,
      top: 12,
      right: 12,
      flexDirection: 'row' as const,
      gap: 8,
    },
    photoOverlayButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    photoPlaceholder: {
      paddingVertical: gv(SPACING['3xl']),
      paddingHorizontal: gv(SPACING.xl),
      alignItems: 'center' as const,
      backgroundColor: COLORS.goldenSurface,
      borderWidth: 2,
      borderColor: COLORS.border.golden,
      borderStyle: 'dashed' as const,
    },
    photoPlaceholderIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: COLORS.variants.secondary[100],
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: gv(SPACING.md),
    },
    photoPlaceholderTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 4,
    },
    photoPlaceholderSubtext: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      color: COLORS.text.secondary,
      marginBottom: gv(SPACING.lg),
    },
    photoButtonsRow: {
      flexDirection: 'row' as const,
      gap: 12,
    },
    photoButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingHorizontal: gv(SPACING.lg),
      paddingVertical: gv(SPACING.md),
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.default,
    },
    photoButtonText: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '500' as const,
      color: COLORS.primary,
    },

    // Info Card
    infoCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: gv(SPACING.lg),
      ...SHADOWS.card,
    },
    inputGroup: {
      marginBottom: gv(SPACING.lg),
    },
    label: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: COLORS.surface,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: gv(SPACING.md),
      paddingVertical: 12,
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      color: COLORS.text.primary,
    },
    inputMultiline: {
      minHeight: 90,
      textAlignVertical: 'top' as const,
    },
    priceInputContainer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    priceInput: {
      flex: 1,
      backgroundColor: COLORS.surface,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: gv(SPACING.md),
      paddingVertical: 12,
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    priceSymbol: {
      position: 'absolute' as const,
      right: 16,
      backgroundColor: COLORS.variants.secondary[100],
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.md,
    },
    priceSymbolText: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      fontWeight: '700' as const,
      color: COLORS.text.golden,
    },

    // Category Section - Visual Cards
    categoryCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: gv(SPACING.lg),
      ...SHADOWS.card,
    },
    categoryLabel: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: gv(SPACING.sm),
    },
    categorySelector: {
      backgroundColor: COLORS.background,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      padding: gv(SPACING.md),
      minHeight: 70,
    },
    categorySelectorSelected: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.variants.primary[50],
    },
    categorySelectorContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
    },
    categoryIcon: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    categoryIconText: {
      fontSize: 24,
    },
    categoryIconPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.border.light,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    categorySelectorText: {
      flex: 1,
    },
    categorySelectorName: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 2,
    },
    categorySelectorDesc: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
    },
    placeholderText: {
      flex: 1,
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      color: COLORS.text.secondary,
    },
    divider: {
      height: 1,
      backgroundColor: COLORS.border.light,
      marginVertical: gv(SPACING.lg),
    },

    // VAT Card
    vatCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: gv(SPACING.lg),
      ...SHADOWS.card,
    },
    vatIconContainer: {
      width: 56,
      height: 56,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.variants.secondary[100],
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: gv(SPACING.md),
    },
    vatIcon: {
      fontSize: 28,
    },
    vatInfo: {
      flex: 1,
    },
    vatName: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 2,
    },
    vatRate: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      color: COLORS.text.secondary,
    },

    // Allergen Section - Compact Badges
    allergenCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: gv(SPACING.lg),
      ...SHADOWS.card,
    },
    allergenGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 10,
    },
    allergenBadge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: COLORS.background,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.full,
    },
    allergenBadgeSelected: {
      backgroundColor: '#FEF2F2',
      borderColor: COLORS.error,
    },
    allergenBadgeIcon: {
      fontSize: 16,
    },
    allergenBadgeName: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
    },
    allergenBadgeNameSelected: {
      color: COLORS.error,
    },
    allergenBadgeCheck: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: COLORS.error,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginLeft: 2,
    },

    // Dietary Options - Modern Pills
    dietaryCard: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.xl,
      padding: gv(SPACING.lg),
      gap: 12,
      ...SHADOWS.card,
    },
    dietaryPill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      padding: gv(SPACING.md),
      backgroundColor: COLORS.background,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
    },
    dietaryPillVegetarian: {
      backgroundColor: '#F0FDF4',
      borderColor: '#86EFAC',
    },
    dietaryPillVegan: {
      backgroundColor: '#ECFDF5',
      borderColor: '#6EE7B7',
    },
    dietaryPillGlutenFree: {
      backgroundColor: '#FEF3C7',
      borderColor: '#FCD34D',
    },
    dietaryPillIcon: {
      fontSize: 28,
      marginRight: 12,
    },
    dietaryPillContent: {
      flex: 1,
    },
    dietaryPillTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 2,
    },
    dietaryPillTitleActive: {
      color: '#047857',
    },
    dietaryPillDesc: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
    },
    dietaryPillDescActive: {
      color: '#059669',
    },
    dietaryPillCheckbox: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: COLORS.border.default,
      backgroundColor: COLORS.surface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    dietaryPillCheckboxActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },

    // Toast
    // Modals - Modern Design
    modalOverlay: {
      flex: 1 as const,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end' as const,
    },
    modalBackdrop: {
      ...Platform.select({
        ios: { flex: 1 },
        default: { position: 'absolute' as const, top: 0, bottom: 0, left: 0, right: 0 },
      }),
    },
    modalContainer: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: BORDER_RADIUS['2xl'],
      borderTopRightRadius: BORDER_RADIUS['2xl'],
      maxHeight: '85%' as const,
      ...SHADOWS.xl,
    },
    modalHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      padding: gv(SPACING.lg),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    modalTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },
    modalContent: {
      padding: gv(SPACING.lg),
    },
    modalItem: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      padding: gv(SPACING.md),
      backgroundColor: COLORS.background,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: 12,
    },
    modalItemSelected: {
      backgroundColor: COLORS.variants.primary[50],
      borderColor: COLORS.primary,
      borderWidth: 2,
    },
    modalItemIcon: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.border.light,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    modalItemIconText: {
      fontSize: 24,
    },
    modalItemText: {
      flex: 1,
    },
    modalItemName: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 2,
    },
    modalItemDesc: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
    },
    modalCreateButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      padding: gv(SPACING.md),
      backgroundColor: COLORS.variants.primary[50],
      borderWidth: 1.5,
      borderColor: COLORS.primary,
      borderRadius: BORDER_RADIUS.lg,
      borderStyle: 'dashed' as const,
      marginTop: 8,
    },
    modalCreateButtonText: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '600' as const,
      color: COLORS.primary,
    },
    modalInputGroup: {
      marginBottom: gv(SPACING.lg),
    },
    modalLabel: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: 8,
    },
    modalInput: {
      backgroundColor: COLORS.background,
      borderWidth: 1.5,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      paddingHorizontal: gv(SPACING.md),
      paddingVertical: 12,
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      color: COLORS.text.primary,
    },
    colorGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 12,
    },
    colorOption: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorOptionSelected: {
      borderColor: '#FFF',
      ...SHADOWS.md,
    },
    modalCreateButton2: {
      marginTop: gv(SPACING.md),
    },

    // Bottom Button
    bottomButtonContainer: {
      padding: gv(SPACING.lg),
      paddingTop: gv(SPACING.xl),
      paddingBottom: gv(SPACING.xl) + insets.bottom,
    },
    bottomButton: {
      width: '100%' as const,
    },
  };
};