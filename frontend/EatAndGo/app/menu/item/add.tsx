import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { menuService } from '@/services/menuService';
import { categoryService } from '@/services/categoryService';
import { MenuCategory, MenuSubCategory } from '@/types/category';

// Liste des allergènes selon la réglementation européenne
const ALLERGENS = [
  { id: 'gluten', name: 'Gluten', icon: '🌾', description: 'Blé, seigle, orge, avoine' },
  { id: 'crustaceans', name: 'Crustacés', icon: '🦐', description: 'Crevettes, crabes, homards' },
  { id: 'eggs', name: 'Œufs', icon: '🥚', description: 'Œufs et produits à base d\'œufs' },
  { id: 'fish', name: 'Poissons', icon: '🐟', description: 'Poissons et produits à base de poissons' },
  { id: 'peanuts', name: 'Arachides', icon: '🥜', description: 'Cacahuètes et produits dérivés' },
  { id: 'soy', name: 'Soja', icon: '🫘', description: 'Soja et produits à base de soja' }, // Correction: 'soybeans' -> 'soy'
  { id: 'milk', name: 'Lait', icon: '🥛', description: 'Lait et produits laitiers (lactose)' },
  { id: 'nuts', name: 'Fruits à coque', icon: '🌰', description: 'Amandes, noisettes, noix, etc.' },
  { id: 'celery', name: 'Céleri', icon: '🥬', description: 'Céleri et produits à base de céleri' },
  { id: 'mustard', name: 'Moutarde', icon: '🟡', description: 'Moutarde et produits dérivés' },
  { id: 'sesame', name: 'Sésame', icon: '◯', description: 'Graines de sésame et produits dérivés' },
  { id: 'sulfites', name: 'Sulfites', icon: '🍷', description: 'Anhydride sulfureux et sulfites' }, // Correction: 'sulphites' -> 'sulfites'
  { id: 'lupin', name: 'Lupin', icon: '🌸', description: 'Lupin et produits à base de lupin' },
  { id: 'mollusks', name: 'Mollusques', icon: '🐚', description: 'Escargots, moules, huîtres, etc.' }, // Correction: 'molluscs' -> 'mollusks'
];

const validateAllergens = (allergens: string[]): boolean => {
  const validAllergenIds = ALLERGENS.map(a => a.id);
  return allergens.every(allergen => validAllergenIds.includes(allergen));
};

const DEFAULT_CATEGORY_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E'
];

export default function AddMenuItemScreen() {
  const { menuId, restaurantId } = useLocalSearchParams<{ menuId: string; restaurantId: string }>();
  // États pour le formulaire d'item
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<MenuSubCategory | null>(null);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegan, setIsVegan] = useState(false);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // États pour les catégories
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [subCategories, setSubCategories] = useState<MenuSubCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // États pour les modales
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubCategoryModal, setShowSubCategoryModal] = useState(false);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [showCreateSubCategoryModal, setShowCreateSubCategoryModal] = useState(false);

  // États pour créer une nouvelle catégorie/sous-catégorie
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_CATEGORY_COLORS[0]);
  
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [newSubCategoryDescription, setNewSubCategoryDescription] = useState('');

  // Charger les catégories au montage du composant
  useEffect(() => {
    loadCategories();
  }, [restaurantId]);

  // Charger les sous-catégories quand une catégorie est sélectionnée
  useEffect(() => {
    if (selectedCategory && selectedCategory.id) {
      // Vérification que selectedCategory et selectedCategory.id existent
      loadSubCategories(selectedCategory.id);
    } else {
      // Réinitialiser les sous-catégories si pas de catégorie sélectionnée
      setSubCategories([]);
      setSelectedSubCategory(null);
    }
  }, [selectedCategory?.id]);

  const loadCategories = async () => {
    if (!restaurantId) return;
    
    try {
      setLoadingCategories(true);
      const response = await categoryService.getCategoriesByRestaurant(restaurantId);
      setCategories(response.categories);
    } catch (error: any) {
      console.error('Erreur lors du chargement des catégories:', error);
      Alert.alert('Erreur', 'Impossible de charger les catégories');
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadSubCategories = async (categoryId: string) => {
    try {
      const response = await categoryService.getSubCategoriesByCategory(categoryId);
      setSubCategories(response.subcategories);
    } catch (error: any) {
      console.error('Erreur lors du chargement des sous-catégories:', error);
      setSubCategories([]);
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
      const newCategory = await categoryService.createCategory({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim(),
        icon: newCategoryIcon.trim(),
        color: newCategoryColor,
        is_active: true,
        order: categories.length + 1
      }, String(restaurantId));
  
      // Mettre à jour les catégories
      setCategories(prev => [...prev, newCategory]);
      
      // Sélectionner la nouvelle catégorie APRÈS la mise à jour
      // Attendre un peu pour que le useEffect se déclenche proprement
      setTimeout(() => {
        setSelectedCategory(newCategory);
      }, 100);
      
      // Réinitialiser le formulaire
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryIcon('');
      setNewCategoryColor(DEFAULT_CATEGORY_COLORS[0]);
      setShowCreateCategoryModal(false);
  
      Alert.alert('Succès', 'Catégorie créée avec succès');
    } catch (error: any) {
      console.error('Erreur lors de la création de la catégorie:', error);
      Alert.alert('Erreur', error?.message || 'Impossible de créer la catégorie');
    }
  };

  const handleCreateSubCategory = async () => {
    if (!newSubCategoryName.trim()) {
      Alert.alert('Erreur', 'Le nom de la sous-catégorie est requis');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Erreur', 'Veuillez d\'abord sélectionner une catégorie');
      return;
    }

    try {
      const newSubCategory = await categoryService.createSubCategory({
        category: selectedCategory.id,
        name: newSubCategoryName.trim(),
        description: newSubCategoryDescription.trim(),
        is_active: true,
        order: subCategories.length + 1
      });

      setSubCategories(prev => [...prev, newSubCategory]);
      setSelectedSubCategory(newSubCategory);
      
      // Réinitialiser le formulaire
      setNewSubCategoryName('');
      setNewSubCategoryDescription('');
      setShowCreateSubCategoryModal(false);

      Alert.alert('Succès', 'Sous-catégorie créée avec succès');
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || 'Impossible de créer la sous-catégorie');
    }
  };

  const handleAllergenToggle = (allergenId: string) => {
    // Vérifier que l'allergène est valide
    if (!ALLERGENS.find(a => a.id === allergenId)) {
      console.warn(`Allergène non reconnu: ${allergenId}`);
      return;
    }
  
    setSelectedAllergens(prev => {
      const newAllergens = prev.includes(allergenId)
        ? prev.filter(id => id !== allergenId)
        : [...prev, allergenId];
      
      console.log('🔄 Allergènes mis à jour:', newAllergens);
      return newAllergens;
    });
  
    // Gestion spéciale pour le gluten
    if (allergenId === 'gluten' && !selectedAllergens.includes('gluten')) {
      setIsGlutenFree(false);
    }
  };

  const handleGlutenFreeToggle = (value: boolean) => {
    setIsGlutenFree(value);
    if (value) {
      setSelectedAllergens(prev => prev.filter(id => id !== 'gluten'));
    }
  };

  const handleVeganToggle = (value: boolean) => {
    setIsVegan(value);
    if (value) {
      setIsVegetarian(true);
      setSelectedAllergens(prev => prev.filter(id => !['milk', 'eggs'].includes(id)));
    }
  };

  const handleCreate = async () => {
    console.log('🚀 handleCreate démarré');
    console.log('selectedCategory:', selectedCategory);
    console.log('selectedSubCategory:', selectedSubCategory);

    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom du plat est requis');
      return;
    }

    if (!price.trim() || isNaN(parseFloat(price))) {
      Alert.alert('Erreur', 'Le prix doit être un nombre valide');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Erreur', 'Veuillez sélectionner une catégorie');
      return;
    }

    if (!menuId) {
      Alert.alert('Erreur', 'Menu non spécifié');
      return;
    }

    setIsCreating(true);
    try {
      // ⭐ DONNÉES EXACTEMENT COMME ATTENDU PAR LE BACKEND
      const menuItemData = {
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price).toFixed(2), // String au format "12.50"
        menu: parseInt(menuId), // Integer pour l'ID du menu
        category: selectedCategory.id, // ID de la catégorie (ForeignKey)
        // ⚠️ CRITIQUE: subcategory doit être omis si pas de sélection, pas undefined/null
        ...(selectedSubCategory?.id && { subcategory: selectedSubCategory.id }),
        allergens: selectedAllergens, // Array des allergènes
        is_vegetarian: isVegetarian,
        is_vegan: isVegan,
        is_gluten_free: isGlutenFree,
      };

      console.log('📤 Payload final envoyé au backend:', JSON.stringify(menuItemData, null, 2));

      const result = await menuService.menuItems.createMenuItem(menuItemData);
      console.log('✅ MenuItem créé avec succès:', result);
      
      Alert.alert('Succès', 'Plat ajouté avec succès');
      router.back();
      
    } catch (error: any) {
      console.error('❌ ERREUR DÉTAILLÉE:', error);
      
      if (error?.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
        console.error('Headers:', error.response.headers);
      }
      
      let errorMessage = 'Impossible d\'ajouter le plat';
      
      // Extraction d'erreur spécifique au backend Django/DRF
      if (error?.response?.data) {
        const errorData = error.response.data;
        
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (typeof errorData === 'object') {
          const errors = [];
          for (const [field, messages] of Object.entries(errorData)) {
            if (Array.isArray(messages)) {
              errors.push(`${field}: ${messages.join(', ')}`);
            } else if (typeof messages === 'string') {
              errors.push(`${field}: ${messages}`);
            }
          }
          if (errors.length > 0) {
            errorMessage = errors.join('\n');
          }
        }
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const renderCategorySelector = () => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
        Catégorie *
      </Text>
      <TouchableOpacity
        onPress={() => setShowCategoryModal(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#F9FAFB',
          borderWidth: 1,
          borderColor: selectedCategory ? '#10B981' : '#E5E7EB',
          borderRadius: 8,
          padding: 12,
        }}
      >
        {selectedCategory ? (
          <>
            {selectedCategory.icon && (
              <Text style={{ fontSize: 20, marginRight: 12 }}>{selectedCategory.icon}</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '500', color: '#111827' }}>
                {selectedCategory.name}
              </Text>
              {selectedCategory.description && (
                <Text style={{ fontSize: 12, color: '#6B7280' }}>
                  {selectedCategory.description}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 16, color: '#6B7280', flex: 1 }}>
            Sélectionner une catégorie
          </Text>
        )}
        <Ionicons name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );

  const renderSubCategorySelector = () => (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
        Sous-catégorie (optionnel)
      </Text>
      <TouchableOpacity
        onPress={() => selectedCategory && setShowSubCategoryModal(true)}
        disabled={!selectedCategory}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: selectedCategory ? '#F9FAFB' : '#F3F4F6',
          borderWidth: 1,
          borderColor: selectedSubCategory ? '#10B981' : '#E5E7EB',
          borderRadius: 8,
          padding: 12,
          opacity: selectedCategory ? 1 : 0.5,
        }}
      >
        {selectedSubCategory ? (
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '500', color: '#111827' }}>
              {selectedSubCategory.name}
            </Text>
            {selectedSubCategory.description && (
              <Text style={{ fontSize: 12, color: '#6B7280' }}>
                {selectedSubCategory.description}
              </Text>
            )}
          </View>
        ) : (
          <Text style={{ fontSize: 16, color: '#6B7280', flex: 1 }}>
            {selectedCategory ? 'Sélectionner une sous-catégorie' : 'Sélectionnez d\'abord une catégorie'}
          </Text>
        )}
        <Ionicons name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );

  const renderAllergenButton = (allergen: typeof ALLERGENS[0]) => {
    const isSelected = selectedAllergens.includes(allergen.id);
    
    return (
      <TouchableOpacity
        key={allergen.id}
        onPress={() => handleAllergenToggle(allergen.id)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isSelected ? '#FEE2E2' : '#F9FAFB',
          borderWidth: 1,
          borderColor: isSelected ? '#EF4444' : '#E5E7EB',
          borderRadius: 8,
          padding: 12,
          marginRight: 8,
          marginBottom: 8,
          minWidth: 120,
        }}
      >
        <Text style={{ fontSize: 16, marginRight: 8 }}>{allergen.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{
            fontSize: 14,
            fontWeight: '500',
            color: isSelected ? '#DC2626' : '#374151',
          }}>
            {allergen.name}
          </Text>
          <Text style={{
            fontSize: 11,
            color: isSelected ? '#B91C1C' : '#6B7280',
          }}>
            {allergen.description}
          </Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={20} color="#EF4444" />
        )}
      </TouchableOpacity>
    );
  };

  const renderDietaryOption = (
    title: string,
    value: boolean,
    onToggle: (value: boolean) => void,
    icon: string,
    color: string,
    description: string
  ) => (
    <TouchableOpacity
      onPress={() => onToggle(!value)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: value ? color + '20' : '#F9FAFB',
        borderWidth: 1,
        borderColor: value ? color : '#E5E7EB',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 20, marginRight: 12 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: 16,
          fontWeight: '500',
          color: value ? color : '#374151',
        }}>
          {title}
        </Text>
        <Text style={{
          fontSize: 12,
          color: value ? color : '#6B7280',
        }}>
          {description}
        </Text>
      </View>
      {value && (
        <Ionicons name="checkmark-circle" size={24} color={color} />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Nouveau plat"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="checkmark-outline"
        onRightPress={handleCreate}
      />
      
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Informations de base */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Informations de base
          </Text>
          
          <Input
            label="Nom du plat *"
            placeholder="Ex: Pizza Margherita, Salade César..."
            value={name}
            onChangeText={setName}
            maxLength={100}
          />

          <Input
            label="Description"
            placeholder="Décrivez les ingrédients, la préparation..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <Input
            label="Prix (€) *"
            placeholder="Ex: 12.50"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />

          {/* Sélecteur de catégorie */}
          {renderCategorySelector()}

          {/* Sélecteur de sous-catégorie */}
          {renderSubCategorySelector()}
        </Card>

        {/* Options diététiques */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Options diététiques
          </Text>

          {renderDietaryOption(
            "Végétarien",
            isVegetarian,
            setIsVegetarian,
            "🌱",
            "#16A34A",
            "Sans viande ni poisson"
          )}

          {renderDietaryOption(
            "Vegan",
            isVegan,
            handleVeganToggle,
            "🌿",
            "#059669",
            "Sans produits d'origine animale"
          )}

          {renderDietaryOption(
            "Sans gluten",
            isGlutenFree,
            handleGlutenFreeToggle,
            "🚫🌾",
            "#DC2626",
            "Ne contient pas de gluten"
          )}
        </Card>

        {/* Allergènes */}
        <Card style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', flex: 1 }}>
              Allergènes présents
            </Text>
            <View style={{
              backgroundColor: '#FEF3C7',
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 12,
            }}>
              <Text style={{ fontSize: 10, color: '#92400E', fontWeight: '500' }}>
                OBLIGATOIRE
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>
            Sélectionnez tous les allergènes présents dans ce plat. Cette information est obligatoire par la loi.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {ALLERGENS.map((allergen) => renderAllergenButton(allergen))}
          </View>

          {selectedAllergens.length === 0 && (
            <View style={{
              backgroundColor: '#D1FAE5',
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <Text style={{ fontSize: 14, color: '#059669', marginLeft: 8 }}>
                Aucun allergène déclaré
              </Text>
            </View>
          )}

          {selectedAllergens.length > 0 && (
            <View style={{
              backgroundColor: '#FEE2E2',
              padding: 12,
              borderRadius: 8,
              marginTop: 8,
            }}>
              <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '500', marginBottom: 4 }}>
                ⚠️ Allergènes présents ({selectedAllergens.length}) :
              </Text>
              <Text style={{ fontSize: 12, color: '#B91C1C' }}>
                {selectedAllergens.map(id => 
                  ALLERGENS.find(a => a.id === id)?.name
                ).join(', ')}
              </Text>
            </View>
          )}
        </Card>

        {/* Bouton de création */}
        <Button
          title="Ajouter le plat"
          onPress={handleCreate}
          loading={isCreating}
          variant="primary"
          fullWidth
          disabled={!name.trim() || !price.trim() || !selectedCategory}
          style={{ 
            backgroundColor: (!name.trim() || !price.trim() || !selectedCategory) ? '#D1D5DB' : '#059669',
            marginBottom: 32,
          }}
        />
      </ScrollView>

      {/* Modale de sélection de catégorie */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ 
            flex: 1, 
            marginTop: 100, 
            backgroundColor: '#FFFFFF', 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20 
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              padding: 16, 
              borderBottomWidth: 1, 
              borderBottomColor: '#E5E7EB' 
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', flex: 1, color: '#111827' }}>
                Sélectionner une catégorie
              </Text>
              <TouchableOpacity
                onPress={() => setShowCreateCategoryModal(true)}
                style={{
                  backgroundColor: '#10B981',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginRight: 8,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500' }}>
                  Créer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }}>
              {loadingCategories ? (
                <Text style={{ textAlign: 'center', color: '#6B7280', marginTop: 20 }}>
                  Chargement...
                </Text>
              ) : categories.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                  <Text style={{ fontSize: 16, color: '#6B7280', marginBottom: 8 }}>
                    Aucune catégorie trouvée
                  </Text>
                  <Button
                    title="Créer votre première catégorie"
                    onPress={() => {
                      setShowCategoryModal(false);
                      setShowCreateCategoryModal(true);
                    }}
                    variant="primary"
                  />
                </View>
              ) : (
                categories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    onPress={() => {
                      setSelectedCategory(category);
                      setShowCategoryModal(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 8,
                      backgroundColor: selectedCategory?.id === category.id ? '#F0FDF4' : '#F9FAFB',
                      borderWidth: 1,
                      borderColor: selectedCategory?.id === category.id ? '#10B981' : '#E5E7EB',
                      marginBottom: 8,
                    }}
                  >
                    {category.icon && (
                      <Text style={{ fontSize: 24, marginRight: 12 }}>{category.icon}</Text>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '500',
                        color: selectedCategory?.id === category.id ? '#059669' : '#111827',
                      }}>
                        {category.name}
                      </Text>
                      {category.description && (
                        <Text style={{
                          fontSize: 12,
                          color: selectedCategory?.id === category.id ? '#047857' : '#6B7280',
                        }}>
                          {category.description}
                        </Text>
                      )}
                    </View>
                    {selectedCategory?.id === category.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modale de sélection de sous-catégorie */}
      <Modal
        visible={showSubCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSubCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ 
            flex: 1, 
            marginTop: 100, 
            backgroundColor: '#FFFFFF', 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20 
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              padding: 16, 
              borderBottomWidth: 1, 
              borderBottomColor: '#E5E7EB' 
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', flex: 1, color: '#111827' }}>
                Sous-catégories - {selectedCategory?.name}
              </Text>
              <TouchableOpacity
                onPress={() => setShowCreateSubCategoryModal(true)}
                style={{
                  backgroundColor: '#10B981',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginRight: 8,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '500' }}>
                  Créer
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowSubCategoryModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedSubCategory(null);
                  setShowSubCategoryModal(false);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: !selectedSubCategory ? '#F0FDF4' : '#F9FAFB',
                  borderWidth: 1,
                  borderColor: !selectedSubCategory ? '#10B981' : '#E5E7EB',
                  marginBottom: 8,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '500',
                    color: !selectedSubCategory ? '#059669' : '#6B7280',
                  }}>
                    Aucune sous-catégorie
                  </Text>
                </View>
                {!selectedSubCategory && (
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                )}
              </TouchableOpacity>

              {subCategories.map((subCategory) => (
                <TouchableOpacity
                  key={subCategory.id}
                  onPress={() => {
                    setSelectedSubCategory(subCategory);
                    setShowSubCategoryModal(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: selectedSubCategory?.id === subCategory.id ? '#F0FDF4' : '#F9FAFB',
                    borderWidth: 1,
                    borderColor: selectedSubCategory?.id === subCategory.id ? '#10B981' : '#E5E7EB',
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{
                      fontSize: 16,
                      fontWeight: '500',
                      color: selectedSubCategory?.id === subCategory.id ? '#059669' : '#111827',
                    }}>
                      {subCategory.name}
                    </Text>
                    {subCategory.description && (
                      <Text style={{
                        fontSize: 12,
                        color: selectedSubCategory?.id === subCategory.id ? '#047857' : '#6B7280',
                      }}>
                        {subCategory.description}
                      </Text>
                    )}
                  </View>
                  {selectedSubCategory?.id === subCategory.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modale de création de catégorie */}
      <Modal
        visible={showCreateCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ 
            flex: 1, 
            marginTop: 100, 
            backgroundColor: '#FFFFFF', 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20 
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              padding: 16, 
              borderBottomWidth: 1, 
              borderBottomColor: '#E5E7EB' 
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', flex: 1, color: '#111827' }}>
                Créer une catégorie
              </Text>
              <TouchableOpacity onPress={() => setShowCreateCategoryModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }}>
              <Input
                label="Nom de la catégorie *"
                placeholder="Ex: Entrées, Plats, Desserts..."
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                maxLength={50}
              />

              <Input
                label="Description"
                placeholder="Description de la catégorie..."
                value={newCategoryDescription}
                onChangeText={setNewCategoryDescription}
                multiline
                numberOfLines={2}
              />

              <Input
                label="Icône (émoji)"
                placeholder="Ex: 🍝, 🥗, 🍰..."
                value={newCategoryIcon}
                onChangeText={setNewCategoryIcon}
                maxLength={4}
              />

              <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
                Couleur
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {DEFAULT_CATEGORY_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setNewCategoryColor(color)}
                    style={{
                      width: 40,
                      height: 40,
                      backgroundColor: color,
                      borderRadius: 20,
                      marginRight: 8,
                      borderWidth: newCategoryColor === color ? 3 : 0,
                      borderColor: '#FFFFFF',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  />
                ))}
              </ScrollView>

              <Button
                title="Créer la catégorie"
                onPress={handleCreateCategory}
                variant="primary"
                fullWidth
                disabled={!newCategoryName.trim()}
                style={{
                  backgroundColor: !newCategoryName.trim() ? '#D1D5DB' : '#059669',
                  marginTop: 16,
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modale de création de sous-catégorie */}
      <Modal
        visible={showCreateSubCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateSubCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ 
            flex: 1, 
            marginTop: 100, 
            backgroundColor: '#FFFFFF', 
            borderTopLeftRadius: 20, 
            borderTopRightRadius: 20 
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              padding: 16, 
              borderBottomWidth: 1, 
              borderBottomColor: '#E5E7EB' 
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', flex: 1, color: '#111827' }}>
                Créer une sous-catégorie
              </Text>
              <TouchableOpacity onPress={() => setShowCreateSubCategoryModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }}>
              {selectedCategory && (
                <View style={{
                  backgroundColor: '#F0FDF4',
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}>
                  {selectedCategory.icon && (
                    <Text style={{ fontSize: 20, marginRight: 8 }}>{selectedCategory.icon}</Text>
                  )}
                  <Text style={{ fontSize: 14, color: '#059669', fontWeight: '500' }}>
                    Catégorie: {selectedCategory.name}
                  </Text>
                </View>
              )}

              <Input
                label="Nom de la sous-catégorie *"
                placeholder="Ex: Poissons, Viandes, Cocktails..."
                value={newSubCategoryName}
                onChangeText={setNewSubCategoryName}
                maxLength={50}
              />

              <Input
                label="Description"
                placeholder="Description de la sous-catégorie..."
                value={newSubCategoryDescription}
                onChangeText={setNewSubCategoryDescription}
                multiline
                numberOfLines={2}
              />

              <Button
                title="Créer la sous-catégorie"
                onPress={handleCreateSubCategory}
                variant="primary"
                fullWidth
                disabled={!newSubCategoryName.trim() || !selectedCategory}
                style={{
                  backgroundColor: (!newSubCategoryName.trim() || !selectedCategory) ? '#D1D5DB' : '#059669',
                  marginTop: 16,
                }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}