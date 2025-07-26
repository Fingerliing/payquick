import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { menuService } from '@/services/menuService';

const CATEGORIES = [
  'Entrée', 'Plat principal', 'Dessert', 'Boisson', 
  'Apéritif', 'Fromage', 'Salade', 'Pizza', 'Burger'
];

export default function AddMenuItemScreen() {
  const { menuId } = useLocalSearchParams<{ menuId: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Plat principal');
  const [isCreating, setIsCreating] = useState(false);

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
      });
      
      Alert.alert('Succès', 'Plat ajouté avec succès');
      router.back();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'ajouter le plat');
      console.error('Erreur lors de la création du plat:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Nouveau plat"
        showBack
        rightIcon="checkmark-outline"
        onRightPress={handleCreate}
      />
      
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            Nom du plat *
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex: Pizza Margherita, Salade César..."
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              backgroundColor: 'white',
            }}
          />

          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Décrivez les ingrédients, la préparation..."
            multiline
            numberOfLines={3}
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              backgroundColor: 'white',
              textAlignVertical: 'top',
            }}
          />

          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            Prix (€) *
          </Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="Ex: 12.50"
            keyboardType="decimal-pad"
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              backgroundColor: 'white',
            }}
          />

          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            Catégorie
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                title={cat}
                onPress={() => setCategory(cat)}
                style={{
                  marginRight: 8,
                  backgroundColor: category === cat ? '#3B82F6' : '#F3F4F6',
                  paddingHorizontal: 16,
                }}
                textStyle={{
                  color: category === cat ? 'white' : '#6B7280',
                }}
              />
            ))}
          </ScrollView>
        </View>

        <Button
          title={isCreating ? "Ajout..." : "Ajouter le plat"}
          onPress={handleCreate}
          disabled={isCreating || !name.trim() || !price.trim()}
          style={{ 
            backgroundColor: (!name.trim() || !price.trim()) ? '#D1D5DB' : '#059669',
          }}
        />
      </ScrollView>
    </View>
  );
}