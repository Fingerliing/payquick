// app/(owner)/menus/add.tsx
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
import { Alert as InlineAlert } from '@/components/ui/Alert'; // ✅ comme dans [restaurantId].tsx :contentReference[oaicite:3]{index=3}

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

  // ✅ Toast state (comme dans [restaurantId].tsx)
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

  // VAT type state
  const [selectedVatType, setSelectedVatType] = useState('FOOD'); // Par défaut
  const [showVatTypeModal, setShowVatTypeModal] = useState(false);

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
      // ⛔️ remplace Alert natif
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
      showToast('error', 'Impossible de charger les sous-catégories', 'Erreur'); // cohérent
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
    if (!restaurantId) {
      showToast('error', 'Restaurant non spécifié', 'Erreur');
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
      showToast('success', 'Catégorie créée avec succès', 'Succès');
    } catch (e: any) {
      console.error('createCategory error:', e);
      showToast('error', e?.message || 'Impossible de créer la catégorie', 'Erreur');
    }
  };

  const handleCreateSubCategory = async () => {
    if (!newSubCategoryName.trim()) {
      showToast('warning', 'Le nom de la sous-catégorie est requis', 'Attention');
      return;
    }
    if (!selectedCategory) {
      showToast('warning', "Veuillez d'abord sélectionner une catégorie", 'Attention');
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
      showToast('success', 'Sous-catégorie créée avec succès', 'Succès');
    } catch (e: any) {
      console.error('createSubCategory error:', e);
      showToast('error', e?.message || 'Impossible de créer la sous-catégorie', 'Erreur');
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast('warning', 'Le nom du plat est requis', 'Attention');
      return;
    }
    if (!price.trim() || isNaN(Number(price))) {
      showToast('warning', 'Le prix doit être un nombre valide', 'Attention');
      return;
    }
    if (!selectedCategory || !selectedCategory.id) {
      showToast('warning', 'Veuillez sélectionner une catégorie', 'Attention');
      return;
    }
    if (!menuId) {
      showToast('error', 'Menu non spécifié', 'Erreur');
      return;
    }

    setIsCreating(true);

    try {
      const form = new FormData();

      // Données texte
      form.append('name', name.trim());
      form.append('description', description.trim());
      form.append('price', String(Number(parseFloat(price).toFixed(2))));
      form.append('menu', String(parseInt(String(menuId), 10)));
      form.append('vat_category', selectedVatType);

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

      // Image (format RN)
      if (photo) {
        form.append('image', {
          uri: photo.uri,
          type: photo.type,
          name: photo.name,
        } as any);
      }

      // Token
      const token =
        (await AsyncStorage.getItem('access_token')) ||
        (await AsyncStorage.getItem('auth_token')) ||
        (await AsyncStorage.getItem('token'));

      if (!token) {
        showToast('error', "Token d'authentification manquant", 'Erreur');
        return;
      }

      // URL
      const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
      const url = `${baseURL}/api/v1/menu-items/`;

      // Requête
      const response = await fetch(url, {
        method: 'POST',
        body: form,
        headers: {
          Authorization: `Bearer ${token}`,
          // Pas de Content-Type: laissé à FormData
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any));
        console.error('❌ Erreur serveur:', errorData);

        let message = "Impossible d'ajouter le plat";
        if (errorData.details && typeof errorData.details === 'object') {
          const parts: string[] = [];
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

        showToast('error', message, 'Erreur');
        return;
      }

      await response.json();
      showToast('success', 'Plat ajouté avec succès', 'Succès');
      router.back();
    } catch (error: any) {
      console.error('❌ Erreur création plat:', error);
      showToast('error', error?.message || "Impossible d'ajouter le plat", 'Erreur');
    } finally {
      setIsCreating(false);
    }
  };

  // helper: ouvrir la galerie
  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showToast('warning', 'Donnez accès à vos photos pour continuer.', 'Permission requise');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (!res.canceled && res.assets && res.assets[0]) {
      const asset = res.assets[0];
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
      showToast('warning', 'Donnez accès à la caméra pour continuer.', 'Permission requise');
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

      {/* 🔔 Zone d'alertes en haut – identique au pattern de [restaurantId].tsx */}
      <View style={{ paddingHorizontal: getResponsiveValue(SPACING.container, screenType), marginTop: getResponsiveValue(SPACING.md, screenType), zIndex: 10 }}>
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

      <View
        style={[
          styles.content,
          {
            paddingLeft: Math.max(layout.containerPadding, insets.left),
            paddingRight: Math.max(layout.containerPadding, insets.right),
            maxWidth: layout.maxContentWidth,
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={{
            paddingVertical: layout.contentSpacing,
            paddingBottom: layout.contentSpacing + Math.max(layout.containerPadding, insets.bottom),
          }}
          showsVerticalScrollIndicator={false}
        >
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

          {/* Section TVA */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fiscalité</Text>
            <Card style={styles.card}>
              <View>
                <Text style={styles.label}>Type de TVA *</Text>
                <TouchableOpacity
                  onPress={() => setShowVatTypeModal(true)}
                  style={[styles.selector, styles.selectorSelected]}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>
                    {VAT_TYPES.find(t => t.id === selectedVatType)?.icon}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedText}>
                      {VAT_TYPES.find(t => t.id === selectedVatType)?.name}
                    </Text>
                    <Text style={styles.description}>
                      TVA: {(((VAT_TYPES.find(t => t.id === selectedVatType)?.rate ?? 0) * 100).toFixed(1))}% •{' '}
                      {VAT_TYPES.find(t => t.id === selectedVatType)?.description}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color={COLORS.text.secondary} />
                </TouchableOpacity>
              </View>
            </Card>
          </View>

          {/* Photo du plat */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photo du plat</Text>
            <Card style={styles.card}>
              {photo ? (
                <View style={{ gap: getResponsiveValue(SPACING.sm, screenType) }}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
                  <Text style={styles.photoInfo}>{photo.name} • {photo.type}</Text>
                  <View style={styles.photoActions}>
                    <Button
                      title="Remplacer"
                      onPress={pickFromLibrary}
                      variant="secondary"
                      style={styles.photoButton}
                      leftIcon={<Ionicons name="images-outline" size={20} color={COLORS.text.primary} />}
                    />
                    <Button
                      title="Photo"
                      onPress={takePhoto}
                      variant="secondary"
                      style={styles.photoButton}
                      leftIcon={<Ionicons name="camera-outline" size={20} color={COLORS.text.primary} />}
                    />
                    <Button
                      title="Supprimer"
                      onPress={() => setPhoto(null)}
                      variant="destructive"
                      style={styles.photoButtonDelete}
                      leftIcon={<Ionicons name="trash-outline" size={20} color={COLORS.error} />}
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
                      leftIcon={<Ionicons name="images-outline" size={20} color={COLORS.text.inverse} />}
                    />
                    <Button
                      title="Prendre une photo"
                      onPress={takePhoto}
                      variant="secondary"
                      style={styles.photoButton}
                      leftIcon={<Ionicons name="camera-outline" size={20} color={COLORS.text.primary} />}
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
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Catégorie</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {loadingCategories && <Text style={styles.placeholder}>Chargement...</Text>}
              {!loadingCategories && categories.length === 0 && <Text style={styles.placeholder}>Aucune catégorie</Text>}
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

              <TouchableOpacity
                onPress={() => { setShowCategoryModal(false); setShowCreateCategoryModal(true); }}
                style={[styles.selector, { justifyContent: 'center' }]}
              >
                <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                <Text style={[styles.selectedText, { marginLeft: 8, color: COLORS.primary }]}>Créer une catégorie</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODALES – Sélection sous-catégorie */}
      <Modal visible={showSubCategoryModal} transparent animationType="slide" onRequestClose={() => setShowSubCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sous-catégorie</Text>
              <TouchableOpacity onPress={() => setShowSubCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {subCategories.length === 0 && <Text style={styles.placeholder}>Aucune sous-catégorie</Text>}
              <View style={{ gap: 8 }}>
                {subCategories.map(sub => (
                  <TouchableOpacity
                    key={sub.id}
                    onPress={() => { setSelectedSubCategory(sub); setShowSubCategoryModal(false); }}
                    style={[styles.selector, selectedSubCategory?.id === sub.id && styles.selectorSelected]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedText}>{sub.name}</Text>
                      {!!sub.description && <Text style={styles.description}>{sub.description}</Text>}
                    </View>
                    {selectedSubCategory?.id === sub.id && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => { setShowSubCategoryModal(false); setShowCreateSubCategoryModal(true); }}
                style={[styles.selector, { justifyContent: 'center' }]}
              >
                <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                <Text style={[styles.selectedText, { marginLeft: 8, color: COLORS.primary }]}>Créer une sous-catégorie</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODALES – Création catégorie */}
      <Modal visible={showCreateCategoryModal} transparent animationType="slide" onRequestClose={() => setShowCreateCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle catégorie</Text>
              <TouchableOpacity onPress={() => setShowCreateCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 12 }}>
              <Text style={styles.label}>Nom *</Text>
              <Input value={newCategoryName} onChangeText={setNewCategoryName} placeholder="Ex. Plats" style={styles.input} />

              <Text style={[styles.label, { marginTop: 12 }]}>Description</Text>
              <Input value={newCategoryDescription} onChangeText={setNewCategoryDescription} placeholder="Optionnel" style={[styles.input, styles.inputMultiline]} multiline />

              <Text style={[styles.label, { marginTop: 12 }]}>Icône (emoji)</Text>
              <Input value={newCategoryIcon} onChangeText={setNewCategoryIcon} placeholder="Ex. 🍝" style={styles.input} />

              <Text style={[styles.label, { marginTop: 12 }]}>Couleur</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {DEFAULT_CATEGORY_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewCategoryColor(c)}
                      style={{
                        width: 28, height: 28, borderRadius: 14, backgroundColor: c,
                        borderWidth: 2, borderColor: newCategoryColor === c ? COLORS.primary : 'transparent',
                      }}
                    />
                  ))}
                </View>
              </ScrollView>

              <Button title="Créer" onPress={handleCreateCategory} variant="primary" />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODALES – Création sous-catégorie */}
      <Modal visible={showCreateSubCategoryModal} transparent animationType="slide" onRequestClose={() => setShowCreateSubCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle sous-catégorie</Text>
              <TouchableOpacity onPress={() => setShowCreateSubCategoryModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 12 }}>
              <Text style={styles.label}>Nom *</Text>
              <Input value={newSubCategoryName} onChangeText={setNewSubCategoryName} placeholder="Ex. Pizzas blanches" style={styles.input} />

              <Text style={[styles.label, { marginTop: 12 }]}>Description</Text>
              <Input value={newSubCategoryDescription} onChangeText={setNewSubCategoryDescription} placeholder="Optionnel" style={[styles.input, styles.inputMultiline]} multiline />

              <Button title="Créer" onPress={handleCreateSubCategory} variant="primary" style={{ marginTop: 16 }} />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODALE – Type de TVA */}
      <Modal visible={showVatTypeModal} transparent animationType="slide" onRequestClose={() => setShowVatTypeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, layout.modalMaxWidth ? { alignSelf: 'center', width: layout.modalMaxWidth } : null]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Type de TVA</Text>
              <TouchableOpacity onPress={() => setShowVatTypeModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {VAT_TYPES.map(type => (
                <TouchableOpacity
                  key={type.id}
                  onPress={() => { setSelectedVatType(type.id); setShowVatTypeModal(false); }}
                  style={[styles.selector, selectedVatType === type.id && styles.selectorSelected]}
                >
                  <Text style={{ fontSize: 20, marginRight: 12 }}>{type.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedText}>{type.name}</Text>
                    <Text style={styles.description}>TVA: {(type.rate * 100).toFixed(1)}% • {type.description}</Text>
                  </View>
                  {selectedVatType === type.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );

  // Render helpers
  function renderCategorySelector() {
    return (
      <View style={styles.section}>
        <Text style={styles.label}>Catégorie *</Text>
        <TouchableOpacity onPress={() => setShowCategoryModal(true)} style={[styles.selector, selectedCategory && styles.selectorSelected]}>
          {selectedCategory ? (
            <>
              {!!selectedCategory.icon && <Text style={{ fontSize: 20, marginRight: 12 }}>{selectedCategory.icon}</Text>}
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedText}>{selectedCategory.name}</Text>
                {!!selectedCategory.description && <Text style={styles.description}>{selectedCategory.description}</Text>}
              </View>
            </>
          ) : (
            <Text style={styles.placeholder}>Sélectionner une catégorie</Text>
          )}
          <Ionicons name="chevron-down" size={20} color={COLORS.text.secondary} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderSubCategorySelector() {
    return (
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
              {!!selectedSubCategory.description && <Text style={styles.description}>{selectedSubCategory.description}</Text>}
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
  }

  function renderAllergen(a: typeof ALLERGENS[number]) {
    const selected = selectedAllergens.includes(a.id);
    return (
      <View key={a.id} style={styles.allergenCol}>
        <TouchableOpacity onPress={() => handleAllergenToggle(a.id)} style={[styles.allergenButton, selected && styles.allergenButtonSelected]}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>{a.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: selected ? COLORS.error : COLORS.text.primary }}>
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
  }

  function renderDietary(
    title: string,
    value: boolean,
    onToggle: (v: boolean) => void,
    icon: string,
    color: string,
    descriptionText: string,
  ) {
    return (
      <TouchableOpacity onPress={() => onToggle(!value)} style={[styles.dietaryOption, value && { backgroundColor: color + '20', borderColor: color }]}>
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
  }
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
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      color: COLORS.text.secondary,
      flex: 1,
    },
    selectedText: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
    },
    description: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
    },
    allergenList: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      marginHorizontal: -6,
    },
    allergenCol: {
      width: '50%' as const,
      paddingHorizontal: 6,
      marginBottom: 12,
    },
    allergenButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      padding: 10,
    },
    allergenButtonSelected: {
      borderColor: COLORS.error,
      backgroundColor: '#FEF2F2',
    },
    dietaryOption: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: 12,
    },
    // Photo
    photoImage: {
      width: '100%' as const,
      height: 180,
      borderRadius: BORDER_RADIUS.lg,
    },
    photoInfo: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
    },
    photoActions: {
      flexDirection: 'row' as const,
      gap: 8,
    },
    photoButton: { flex: 1 },
    photoButtonDelete: { flex: 1 },
    photoPlaceholder: {
      alignItems: 'center' as const,
      paddingVertical: 16,
      borderWidth: 1,
      borderColor: COLORS.border.default,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: COLORS.surface,
    },
    photoPlaceholderIcon: { fontSize: 36, marginBottom: 8 },
    photoPlaceholderText: { fontWeight: '600' as const, color: COLORS.text.primary },
    photoPlaceholderSubtext: { color: COLORS.text.secondary, fontSize: gv(TYPOGRAPHY.fontSize.sm) },

    // Modales
    modalOverlay: {
      flex: 1 as const,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end' as const,
    },
    modalContainer: {
      backgroundColor: COLORS.surface,
      borderTopLeftRadius: BORDER_RADIUS['2xl'],
      borderTopRightRadius: BORDER_RADIUS['2xl'],
      maxHeight: '80%' as const,
    },
    modalHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingHorizontal: gv(SPACING.container),
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    modalTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },
    modalContent: {
      padding: gv(SPACING.container),
    },
  };
};
