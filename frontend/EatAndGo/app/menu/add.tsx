import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { menuService } from '@/services/menuService';

export default function AddMenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom du menu est requis');
      return;
    }

    if (!restaurantId) {
      Alert.alert('Erreur', 'Restaurant non spécifié');
      return;
    }

    setIsCreating(true);
    try {
      const newMenu = await menuService.createMenu({
        name: name.trim(),
        restaurant: parseInt(restaurantId),
      });
      
      Alert.alert(
        'Succès', 
        'Menu créé avec succès',
        [
          {
            text: 'Ajouter des plats',
            onPress: () => router.replace(`/menu/${newMenu.id}` as any)
          },
          {
            text: 'Retour à la liste',
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de créer le menu');
      console.error('Erreur lors de la création du menu:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Nouveau menu"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="checkmark-outline"
        onRightPress={handleCreate}
      />
      
      <ScrollView style={{ flex: 1, padding: 16 }}>
        <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            Nom du menu *
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex: Menu du jour, Carte des plats, etc."
            style={{
              borderWidth: 1,
              borderColor: '#D1D5DB',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              backgroundColor: 'white',
            }}
          />

          <Text style={{ fontSize: 12, color: '#6B7280' }}>
            Vous pourrez ajouter des plats à ce menu après sa création.
          </Text>
        </View>

        <View style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, marginBottom: 32 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#059669' }}>
            💡 Conseil
          </Text>
          <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 20 }}>
            Créez différents menus pour organiser vos plats (ex: "Menu déjeuner", "Menu soir", "Carte des desserts").
            Vous pourrez activer/désactiver chaque menu selon vos besoins.
          </Text>
        </View>

        <Button
          title={isCreating ? "Création..." : "Créer le menu"}
          onPress={handleCreate}
          disabled={isCreating || !name.trim()}
          style={{ 
            backgroundColor: !name.trim() ? '#D1D5DB' : '#059669',
          }}
        />
      </ScrollView>
    </View>
  );
}