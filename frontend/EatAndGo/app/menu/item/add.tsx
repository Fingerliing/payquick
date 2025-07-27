import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { menuService } from '@/services/menuService';

const CATEGORIES = [
  'Entrée', 'Plat principal', 'Dessert', 'Boisson', 
  'Apéritif', 'Fromage', 'Salade', 'Pizza', 'Burger'
];

// Liste des allergènes selon la réglementation européenne
const ALLERGENS = [
  { id: 'gluten', name: 'Gluten', icon: '🌾', description: 'Blé, seigle, orge, avoine' },
  { id: 'crustaceans', name: 'Crustacés', icon: '🦐', description: 'Crevettes, crabes, homards' },
  { id: 'eggs', name: 'Œufs', icon: '🥚', description: 'Œufs et produits à base d\'œufs' },
  { id: 'fish', name: 'Poissons', icon: '🐟', description: 'Poissons et produits à base de poissons' },
  { id: 'peanuts', name: 'Arachides', icon: '🥜', description: 'Cacahuètes et produits dérivés' },
  { id: 'soybeans', name: 'Soja', icon: '🫘', description: 'Soja et produits à base de soja' },
  { id: 'milk', name: 'Lait', icon: '🥛', description: 'Lait et produits laitiers (lactose)' },
  { id: 'nuts', name: 'Fruits à coque', icon: '🌰', description: 'Amandes, noisettes, noix, etc.' },
  { id: 'celery', name: 'Céleri', icon: '🥬', description: 'Céleri et produits à base de céleri' },
  { id: 'mustard', name: 'Moutarde', icon: '🟡', description: 'Moutarde et produits dérivés' },
  { id: 'sesame', name: 'Sésame', icon: '◯', description: 'Graines de sésame et produits dérivés' },
  { id: 'sulphites', name: 'Sulfites', icon: '🍷', description: 'Anhydride sulfureux et sulfites' },
  { id: 'lupin', name: 'Lupin', icon: '🌸', description: 'Lupin et produits à base de lupin' },
  { id: 'molluscs', name: 'Mollusques', icon: '🐚', description: 'Escargots, moules, huîtres, etc.' },
];

export default function AddMenuItemScreen() {
  const { menuId } = useLocalSearchParams<{ menuId: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Plat principal');
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegan, setIsVegan] = useState(false);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleAllergenToggle = (allergenId: string) => {
    setSelectedAllergens(prev => {
      if (prev.includes(allergenId)) {
        return prev.filter(id => id !== allergenId);
      } else {
        return [...prev, allergenId];
      }
    });

    // Auto-décocher "Sans gluten" si on sélectionne gluten
    if (allergenId === 'gluten' && !selectedAllergens.includes('gluten')) {
      setIsGlutenFree(false);
    }
  };

  const handleGlutenFreeToggle = (value: boolean) => {
    setIsGlutenFree(value);
    if (value) {
      // Retirer automatiquement le gluten des allergènes
      setSelectedAllergens(prev => prev.filter(id => id !== 'gluten'));
    }
  };

  const handleVeganToggle = (value: boolean) => {
    setIsVegan(value);
    if (value) {
      // Vegan implique végétarien
      setIsVegetarian(true);
      // Retirer automatiquement lait et œufs
      setSelectedAllergens(prev => prev.filter(id => !['milk', 'eggs'].includes(id)));
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom du plat est requis');
      return;
    }

    if (!price.trim() || isNaN(parseFloat(price))) {
      Alert.alert('Erreur', 'Le prix doit être un nombre valide');
      return;
    }

    if (!menuId) {
      Alert.alert('Erreur', 'Menu non spécifié');
      return;
    }

    setIsCreating(true);
    try {
      await menuService.menuItems.createMenuItem({
        name: name.trim(),
        description: description.trim(),
        price: parseFloat(price).toFixed(2),
        category,
        menu: parseInt(menuId),
        allergens: selectedAllergens,
        is_vegetarian: isVegetarian,
        is_vegan: isVegan,
        is_gluten_free: isGlutenFree,
      });
      
      Alert.alert('Succès', 'Plat ajouté avec succès');
      router.back();
    } catch (error: any) {
      Alert.alert('Erreur', error?.message || 'Impossible d\'ajouter le plat');
      console.error('Erreur lors de la création du plat:', error);
    } finally {
      setIsCreating(false);
    }
  };

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

          <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }}>
            Catégorie *
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                title={cat}
                onPress={() => setCategory(cat)}
                variant={category === cat ? "primary" : "outline"}
                size="small"
                style={{ marginRight: 8 }}
              />
            ))}
          </ScrollView>
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
            {ALLERGENS.map(renderAllergenButton)}
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
          disabled={!name.trim() || !price.trim()}
          style={{ 
            backgroundColor: (!name.trim() || !price.trim()) ? '#D1D5DB' : '#059669',
            marginBottom: 32,
          }}
        />
      </ScrollView>
    </View>
  );
}