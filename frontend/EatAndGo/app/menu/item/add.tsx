import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
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

export default function AddMenuItemScreen() {
  const { menuId, restaurantId } = useLocalSearchParams<{ menuId: string; restaurantId: string }>();
  const { width } = useWindowDimensions();
  const screenType = useScreenType();
  const R = createResponsiveStyles(screenType);
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);

  // Responsive styles instance
  const styles = useMemo(() => createStyles(screenType), [screenType]);

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

  // Effects
  useEffect(() => {
    loadCategories();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      Alert.alert('Erreur', 'Impossible de charger les catégories');
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
    }
  };

  // Handlers
  const handleAllergenToggle = (id: Allergen) => {
    setSelectedAllergens(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : [...prev, id]
    );
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
      Alert.alert('Erreur', 'Le nom de la catégorie est requis');
      return;
    }
    if (!restaurantId) {
      Alert.alert('Erreur', 'Restaurant non spécifié');
      return;
    }
    try {
      const created = await categoryService.createCategory({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim(),
        icon: newCategoryIcon.trim(),
        color: newCategoryColor,
        is_active: true,
        order: categories.length + 1,
      }, String(restaurantId));

      setCategories(prev => [...prev, created]);
      setSelectedCategory(created);
      setShowCreateCategoryModal(false);
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryIcon('');
      setNewCategoryColor(DEFAULT_CATEGORY_COLORS[0]);
      Alert.alert('Succès', 'Catégorie créée avec succès');
    } catch (e: any) {
      console.error('createCategory error:', e);
      Alert.alert('Erreur', e?.message || 'Impossible de créer la catégorie');
    }
  };

  const handleCreateSubCategory = async () => {
    if (!newSubCategoryName.trim()) {
      Alert.alert('Erreur', 'Le nom de la sous-catégorie est requis');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Erreur', "Veuillez d'abord sélectionner une catégorie");
      return;
    }
    try {
      const created = await categoryService.createSubCategory({
        category: selectedCategory.id,
        name: newSubCategoryName.trim(),
        description: newSubCategoryDescription.trim(),
        is_active: true,
        order: subCategories.length + 1,
      });
      setSubCategories(prev => [...prev, created]);
      setSelectedSubCategory(created);
      setShowCreateSubCategoryModal(false);
      setNewSubCategoryName('');
      setNewSubCategoryDescription('');
      Alert.alert('Succès', 'Sous-catégorie créée avec succès');
    } catch (e: any) {
      console.error('createSubCategory error:', e);
      Alert.alert('Erreur', e?.message || 'Impossible de créer la sous-catégorie');
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom du plat est requis');
      return;
    }
    if (!price.trim() || isNaN(Number(price))) {
      Alert.alert('Erreur', 'Le prix doit être un nombre valide');
      return;
    }
    if (!selectedCategory || !selectedCategory.id) {
      Alert.alert('Erreur', 'Veuillez sélectionner une catégorie');
      return;
    }
    if (!menuId) {
      Alert.alert('Erreur', 'Menu non spécifié');
      return;
    }
  
    setIsCreating(true);
    try {
      // ✅ SOLUTION: Utiliser fetch avec auth headers comme pour les restaurants
      const form = new FormData();
      
      // Données texte
      form.append('name', name.trim());
      form.append('description', description.trim());
      form.append('price', String(Number(parseFloat(price).toFixed(2))));
      form.append('menu', String(parseInt(String(menuId), 10)));
      
      if (selectedCategory.id) {
        form.append('category', String(selectedCategory.id));
      }
      if (selectedSubCategory?.id) {
        form.append('subcategory', String(selectedSubCategory.id));
      }
      
      form.append('allergens', JSON.stringify(selectedAllergens));
      form.append('is_vegetarian', String(isVegetarian));
      form.append('is_vegan', String(isVegan));
      form.append('is_gluten_free', String(isGlutenFree));
      
      // Image avec le format React Native (comme restaurant)
      if (photo) {
        form.append('image', {
          uri: photo.uri,
          type: photo.type,
          name: photo.name,
        } as any);
      }
  
      // Récupérer le token d'authentification
      const token = await AsyncStorage.getItem('access_token') || 
                    await AsyncStorage.getItem('auth_token') || 
                    await AsyncStorage.getItem('token');
      
      if (!token) {
        Alert.alert('Erreur', 'Token d\'authentification manquant');
        return;
      }
  
      // Construire l'URL complète
      const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const url = `${baseURL}/api/v1/menu-items/`;
  
      console.log('🔤 Création du menu item avec fetch direct:', {
        name: name.trim(),
        hasImage: !!photo,
        menuId: String(menuId),
        categoryId: String(selectedCategory.id),
        url
      });
  
      // Utiliser fetch direct avec les headers d'authentification
      const response = await fetch(url, {
        method: 'POST',
        body: form,
        headers: {
          'Authorization': `Bearer ${token}`,
          // PAS de Content-Type - FormData le gère automatiquement
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Erreur serveur:', errorData);
        
        let message = "Impossible d'ajouter le plat";
        if (errorData.details && typeof errorData.details === 'object') {
          const parts = [];
          for (const [field, messages] of Object.entries(errorData.details)) {
            if (Array.isArray(messages)) {
              parts.push(`${field}: ${messages.join(', ')}`);
            } else if (typeof messages === 'string') {
              parts.push(`${field}: ${messages}`);
            }
          }
          if (parts.length) message = parts.join('\n');
        } else if (errorData.message) {
          message = errorData.message;
        }
        
        Alert.alert('Erreur', message);
        return;
      }
  
      const result = await response.json();
      console.log('✅ Menu item créé:', result);
      
      Alert.alert('Succès', 'Plat ajouté avec succès');
      router.back();
      
    } catch (error: any) {
      console.error('❌ Erreur création plat:', error);
      Alert.alert('Erreur', error.message || "Impossible d'ajouter le plat");
    } finally {
      setIsCreating(false);
    }
  };

  // Render helpers
  const renderCategorySelector = () => (
    <View style={styles.section}>
      <Text style={styles.label}>Catégorie *</Text>
      <TouchableOpacity
        onPress={() => setShowCategoryModal(true)}
        style={[styles.selector, selectedCategory && styles.selectorSelected]}
      >
        {selectedCategory ? (
          <>
            {!!selectedCategory.icon && (
              <Text style={{ fontSize: 20, marginRight: 12 }}>{selectedCategory.icon}</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedText}>{selectedCategory.name}</Text>
              {!!selectedCategory.description && (
                <Text style={styles.description}>{selectedCategory.description}</Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.placeholder}>Sélectionner une catégorie</Text>
        )}
        <Ionicons name="chevron-down" size={20} color={COLORS.text.secondary} />
      </TouchableOpacity>
    </View>
  );

  const renderSubCategorySelector = () => (
    <View style={styles.section}>
      <Text style={styles.label}>Sous-catégorie (optionnel)</Text>
      <TouchableOpacity
        onPress={() => selectedCategory && setShowSubCategoryModal(true)}
        disabled={!selectedCategory}
        style={[
          styles.selector,
          !selectedCategory && styles.selectorDisabled,
          selectedSubCategory && styles.selectorSelected,
        ]}
      >
        {selectedSubCategory ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedText}>{selectedSubCategory.name}</Text>
            {!!selectedSubCategory.description && (
              <Text style={styles.description}>{selectedSubCategory.description}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.placeholder}>
            {selectedCategory ? 'Sélectionner une sous-catégorie' : "Sélectionnez d'abord une catégorie"}
          </Text>
        )}
        <Ionicons name="chevron-down" size={20} color={COLORS.text.secondary} />
      </TouchableOpacity>
    </View>
  );
  
  const renderAllergen = (a: typeof ALLERGENS[number]) => {
    const selected = selectedAllergens.includes(a.id);
    return (
      <View key={a.id} style={styles.allergenCol}>
        <TouchableOpacity
          onPress={() => handleAllergenToggle(a.id)}
          style={[styles.allergenButton, selected && styles.allergenButtonSelected]}
        >
          <Text style={{ fontSize: 16, marginRight: 8 }}>{a.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '500',
                color: selected ? COLORS.error : COLORS.text.primary,
              }}
            >
              {a.name}
            </Text>
            <Text style={{ fontSize: 11, color: selected ? '#B91C1C' : COLORS.text.secondary }}>
              {a.description}
            </Text>
          </View>
          {selected && <Ionicons name="checkmark-circle" size={20} color={COLORS.error} />}
        </TouchableOpacity>
      </View>
    );
  };

  const renderDietary = (
    title: string,
    value: boolean,
    onToggle: (v: boolean) => void,
    icon: string,
    color: string,
    descriptionText: string,
  ) => (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      style={[styles.dietaryOption, value && { backgroundColor: color + '20', borderColor: color }]}
    >
      <Text style={{ fontSize: 20, marginRight: 12 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '500', color: value ? color : COLORS.text.primary }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: value ? color : COLORS.text.secondary }}>
          {descriptionText}
        </Text>
      </View>
      {value && <Ionicons name="checkmark-circle" size={24} color={color} />}
    </TouchableOpacity>
  );

  // helper: ouvrir la galerie
  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Donnez accès à vos photos pour continuer.');
      return;
    }
    
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    
    if (!res.canceled && res.assets && res.assets[0]) {
      const asset = res.assets[0];
      // Properly determine MIME type
      const uri = asset.uri;
      const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      
      let mimeType = 'image/jpeg'; // default
      switch (extension) {
        case 'png':
          mimeType = 'image/png';
          break;
        case 'webp':
          mimeType = 'image/webp';
          break;
        case 'jpg':
        case 'jpeg':
        default:
          mimeType = 'image/jpeg';
          break;
      }
      
      setPhoto({
        uri: asset.uri,
        name: `menu-item-${Date.now()}.${extension}`,
        type: mimeType,
      });
    }
  };

  // helper: ouvrir la caméra
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Donnez accès à la caméra pour continuer.');
      return;
    }
    
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    
    if (!res.canceled && res.assets && res.assets[0]) {
      const asset = res.assets[0];
      const uri = asset.uri;
      const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      
      let mimeType = 'image/jpeg'; // default for camera
      switch (extension) {
        case 'png':
          mimeType = 'image/png';
          break;
        case 'jpg':
        case 'jpeg':
        default:
          mimeType = 'image/jpeg';
          break;
      }
      
      setPhoto({
        uri: asset.uri,
        name: `menu-item-camera-${Date.now()}.${extension}`,
        type: mimeType,
      });
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <Header
        title="Nouveau plat"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="checkmark-outline"
        onRightPress={handleCreate}
        includeSafeArea={false}
      />

      <View style={[styles.content, { paddingLeft: Math.max(layout.containerPadding, insets.left), paddingRight: Math.max(layout.containerPadding, insets.right), maxWidth: layout.maxContentWidth }] }>
        <ScrollView contentContainerStyle={{ paddingVertical: layout.contentSpacing, paddingBottom: layout.contentSpacing + Math.max(layout.containerPadding, insets.bottom) }} showsVerticalScrollIndicator={false}>

          {/* Infos plat */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informations</Text>
            <Card style={styles.card}>
              <View style={{ gap: getResponsiveValue(SPACING.sm, screenType) }}>
                <View>
                  <Text style={styles.label}>Nom *</Text>
                  <Input
                    value={name}
                    onChangeText={setName}
                    placeholder="Ex. Burger maison"
                    style={styles.input}
                  />
                </View>

                <View>
                  <Text style={styles.label}>Description</Text>
                  <Input
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Décrivez votre plat (ingrédients, goût, etc.)"
                    style={[styles.input, styles.inputMultiline]}
                    multiline
                    numberOfLines={4}
                  />
                </View>

                <View>
                  <Text style={styles.label}>Prix (€) *</Text>
                  <Input
                    value={price}
                    onChangeText={setPrice}
                    placeholder="Ex. 12.90"
                    keyboardType="decimal-pad"
                    style={styles.input}
                  />
                </View>
              </View>
            </Card>
          </View>

          {/* Photo du plat */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photo du plat</Text>
            <Card style={styles.card}>
              {photo ? (
                <View style={{ gap: getResponsiveValue(SPACING.sm, screenType) }}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.photoInfo}>
                    {photo.name} • {photo.type}
                  </Text>
                  <View style={styles.photoActions}>
                    <Button 
                      title="Remplacer" 
                      onPress={pickFromLibrary} 
                      variant="secondary" 
                      style={styles.photoButton}
                      leftIcon="images-outline"
                    />
                    <Button 
                      title="Photo" 
                      onPress={takePhoto} 
                      variant="secondary" 
                      style={styles.photoButton}
                      leftIcon="camera-outline"
                    />
                    <Button 
                      title="Supprimer" 
                      onPress={() => setPhoto(null)} 
                      variant="destructive" 
                      style={styles.photoButtonDelete}
                      leftIcon="trash-outline"
                    />
                  </View>
                </View>
              ) : (
                <View style={{ gap: getResponsiveValue(SPACING.sm, screenType) }}>
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderIcon}>📷</Text>
                    <Text style={styles.photoPlaceholderText}>Aucune photo sélectionnée</Text>
                    <Text style={styles.photoPlaceholderSubtext}>
                      Ajoutez une photo pour rendre votre plat plus attrayant
                    </Text>
                  </View>
                  <View style={styles.photoActions}>
                    <Button 
                      title="Choisir une photo" 
                      onPress={pickFromLibrary} 
                      variant="primary" 
                      style={styles.photoButton}
                      leftIcon="images-outline"
                    />
                    <Button 
                      title="Prendre une photo" 
                      onPress={takePhoto} 
                      variant="secondary" 
                      style={styles.photoButton}
                      leftIcon="camera-outline"
                    />
                  </View>
                </View>
              )}
            </Card>
          </View>

          {/* Catégories */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Catégorisation</Text>
            {renderCategorySelector()}
            {renderSubCategorySelector()}
          </View>

          {/* Régimes & Allergènes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Régimes & allergènes</Text>
            <Card style={styles.card}>
              <View style={{ gap: getResponsiveValue(SPACING.sm, screenType) }}>
                {renderDietary('Végétarien', isVegetarian, setIsVegetarian, '🥗', COLORS.success, 'Sans viande ni poisson')}
                {renderDietary('Vegan', isVegan, handleVeganToggle, '🌱', COLORS.primary, 'Aucun produit animal')}
                {renderDietary('Sans gluten', isGlutenFree, handleGlutenFreeToggle, '🚫🌾', COLORS.warning, 'Sans ingrédients contenant du gluten')}
              </View>
            </Card>

            <View style={{ height: getResponsiveValue(SPACING.sm, screenType) }} />

            <Card style={styles.card}>
              <Text style={[styles.label, { marginBottom: 8 }]}>Allergènes (sélection multiple)</Text>
              <View style={styles.allergenList}>
                {ALLERGENS.map(renderAllergen)}
              </View>
            </Card>
          </View>

          {/* Bouton principal */}
          <Button
            title={isCreating ? 'Création...' : 'Ajouter le plat'}
            onPress={handleCreate}
            disabled={isCreating}
            variant="primary"
            fullWidth
            style={{ marginTop: getResponsiveValue(SPACING.md, screenType) }}
          />
          {/* Safe area spacer for bottom */}
          <View style={{ height: Math.max(layout.containerPadding, insets.bottom) }} />
        </ScrollView>
      </View>

      {/* MODALES – Sélection catégorie */}
      <Modal visible={showCategoryModal} transparent animationType="slide" onRequestClose={() => setShowCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Catégorie</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {loadingCategories && (
                <Text style={styles.placeholder}>Chargement...</Text>
              )}
              {!loadingCategories && categories.length === 0 && (
                <Text style={styles.placeholder}>Aucune catégorie</Text>
              )}
              <View style={{ gap: 8 }}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => { setSelectedCategory(cat); setShowCategoryModal(false); }}
                    style={[styles.selector, selectedCategory?.id === cat.id && styles.selectorSelected]}
                  >
                    {!!cat.icon && <Text style={{ fontSize: 18, marginRight: 8 }}>{cat.icon}</Text>}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedText}>{cat.name}</Text>
                      {!!cat.description && <Text style={styles.description}>{cat.description}</Text>}
                    </View>
                    {selectedCategory?.id === cat.id && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ padding: layout.containerPadding }}>
              <Button title="Créer une catégorie" onPress={() => setShowCreateCategoryModal(true)} variant="secondary" fullWidth />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODALE – Création catégorie */}
      <Modal visible={showCreateCategoryModal} transparent animationType="slide" onRequestClose={() => setShowCreateCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle catégorie</Text>
              <TouchableOpacity onPress={() => setShowCreateCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={styles.label}>Nom *</Text>
                  <Input value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Ex. Plats" />
                </View>
                <View>
                  <Text style={styles.label}>Description</Text>
                  <Input value={newCategoryDescription} onChangeText={setNewCategoryDescription} placeholder="Ex. Tous les plats principaux" />
                </View>
                <View>
                  <Text style={styles.label}>Icône (emoji ou texte court)</Text>
                  <Input value={newCategoryIcon} onChangeText={setNewCategoryIcon} placeholder="Ex. 🍽️" />
                </View>
                <View>
                  <Text style={styles.label}>Couleur</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {DEFAULT_CATEGORY_COLORS.map(c => (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setNewCategoryColor(c)}
                        style={{
                          width: 28, height: 28, borderRadius: 14, backgroundColor: c,
                          borderWidth: newCategoryColor === c ? 2 : 1,
                          borderColor: newCategoryColor === c ? COLORS.primary : COLORS.border.light,
                        }}
                      />
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
            <View style={{ padding: layout.containerPadding }}>
              <Button title="Créer" onPress={handleCreateCategory} fullWidth />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODALES – Sélection & création sous-catégorie */}
      <Modal visible={showSubCategoryModal} transparent animationType="slide" onRequestClose={() => setShowSubCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sous-catégorie</Text>
              <TouchableOpacity onPress={() => setShowSubCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={{ gap: 8 }}>
                {subCategories.map(sc => (
                  <TouchableOpacity
                    key={sc.id}
                    onPress={() => { setSelectedSubCategory(sc); setShowSubCategoryModal(false); }}
                    style={[styles.selector, selectedSubCategory?.id === sc.id && styles.selectorSelected]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedText}>{sc.name}</Text>
                      {!!sc.description && <Text style={styles.description}>{sc.description}</Text>}
                    </View>
                    {selectedSubCategory?.id === sc.id && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))}
                {subCategories.length === 0 && (
                  <Text style={styles.placeholder}>Aucune sous-catégorie</Text>
                )}
              </View>
            </ScrollView>
            <View style={{ padding: layout.containerPadding }}>
              <Button title="Créer une sous-catégorie" onPress={() => setShowCreateSubCategoryModal(true)} variant="secondary" fullWidth />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreateSubCategoryModal} transparent animationType="slide" onRequestClose={() => setShowCreateSubCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle sous-catégorie</Text>
              <TouchableOpacity onPress={() => setShowCreateSubCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={styles.label}>Nom *</Text>
                  <Input value={newSubCategoryName} onChangeText={setNewSubCategoryName} placeholder="Ex. Burgers" />
                </View>
                <View>
                  <Text style={styles.label}>Description</Text>
                  <Input value={newSubCategoryDescription} onChangeText={setNewSubCategoryDescription} placeholder="Ex. Burgers spéciaux" />
                </View>
              </View>
            </ScrollView>
            <View style={{ padding: layout.containerPadding }}>
              <Button title="Créer" onPress={handleCreateSubCategory} fullWidth />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// Styles
const createStyles = (screenType: 'mobile' | 'tablet' | 'desktop') => {
  const gv = (token: any): number => getResponsiveValue(token, screenType) as number;
  return {
    container: {
      flex: 1 as const,
      backgroundColor: COLORS.background,
    },
    content: {
      flex: 1 as const,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    section: {
      marginBottom: gv(SPACING.lg),
      paddingHorizontal: gv(SPACING.container),
    },
    sectionTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.xl),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
      marginBottom: gv(SPACING.md),
    },
    card: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      padding: gv(SPACING.lg),
    },
    label: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      fontWeight: '500' as const,
      color: COLORS.text.primary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: gv(SPACING.md),
      paddingVertical: 10,
    },
    inputMultiline: {
      minHeight: 100,
      textAlignVertical: 'top' as const,
    },
    selector: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      padding: gv(SPACING.md),
      minHeight: COMPONENT_CONSTANTS.minTouchTarget,
      marginBottom: gv(SPACING.md),
    },
    selectorSelected: {
      borderColor: COLORS.primary,
      backgroundColor: COLORS.variants.primary[50],
    },
    selectorDisabled: {
      opacity: 0.5,
      backgroundColor: COLORS.border.light,
    },
    placeholder: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      color: COLORS.text.light,
      flex: 1,
    },
    selectedText: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      color: COLORS.text.primary,
      fontWeight: '500' as const,
    },
    description: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
      marginTop: 2,
    },
    dietaryOption: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      padding: 12,
      minHeight: COMPONENT_CONSTANTS.minTouchTarget,
    },
    allergenList: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'space-between' as const,
    },
    
    allergenCol: {
      width: '48%' as const,
      marginBottom: 8,
    },
    
    allergenButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.md,
      padding: 10,
      width: '100%' as const,
      minHeight: COMPONENT_CONSTANTS.minTouchTarget,
    },

    allergenButtonSelected: {
      borderColor: COLORS.error,
      backgroundColor: '#FEE2E2',
    },

    // Styles pour la section photo
    photoImage: {
      width: '100%' as const,
      height: gv(200),
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    
    photoInfo: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      fontStyle: 'italic' as const,
    },
    
    photoActions: {
      flexDirection: 'row' as const,
      gap: gv(SPACING.sm),
      flexWrap: 'wrap' as const,
    },
    
    photoButton: {
      flex: 1,
      minWidth: 120,
    },
    
    photoButtonDelete: {
      flexBasis: 'auto' as const,
      minWidth: 100,
    },
    
    photoPlaceholder: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 2,
      borderColor: COLORS.border.default,
      borderStyle: 'dashed' as const,
      paddingVertical: gv(SPACING['3xl']),
      paddingHorizontal: gv(SPACING.lg),
    },
    
    photoPlaceholderIcon: {
      fontSize: screenType === 'mobile' ? 48 : 64,
      marginBottom: gv(SPACING.sm),
      opacity: 0.5,
    },
    
    photoPlaceholderText: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '500' as const,
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginBottom: gv(SPACING.xs),
    },
    
    photoPlaceholderSubtext: {
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      color: COLORS.text.light,
      textAlign: 'center' as const,
      lineHeight: Math.round(gv(TYPOGRAPHY.fontSize.sm) * 1.4),
      maxWidth: 280,
    },

    // Modals
    modalOverlay: {
      flex: 1 as const,
      backgroundColor: COLORS.overlay,
      justifyContent: 'flex-end' as const,
    },
    modalContainer: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: BORDER_RADIUS['3xl'],
      borderTopRightRadius: BORDER_RADIUS['3xl'],
      maxHeight: '90%' as const,
    },
    modalHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      padding: gv(SPACING.container),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    modalTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    modalContent: {
      padding: gv(SPACING.container),
    },
  };
};