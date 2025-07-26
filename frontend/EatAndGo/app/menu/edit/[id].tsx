import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { menuService } from '@/services/menuService';
import { Menu } from '@/types/menu';

export default function EditMenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadMenu();
  }, [id]);

  const loadMenu = async () => {
    try {
      const menuData = await menuService.getMenu(parseInt(id!));
      setMenu(menuData);
      setName(menuData.name);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger le menu');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Le nom du menu est requis');
      return;
    }

    setIsSaving(true);
    try {
      await menuService.updateMenu(parseInt(id!), { name: name.trim() });
      Alert.alert('Succès', 'Menu mis à jour avec succès');
      router.back();
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder le menu');
      console.error('Erreur lors de la sauvegarde du menu:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAvailability = async () => {
    if (!menu) return;
    
    try {
      const result = await menuService.toggleMenuAvailability(menu.id);
      setMenu(prev => prev ? { ...prev, disponible: result.disponible } : null);
      Alert.alert(
        'Succès', 
        result.disponible 
          ? 'Menu activé avec succès (autres menus désactivés)' 
          : 'Menu désactivé avec succès'
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de modifier la disponibilité');
      console.error('Erreur lors du toggle:', error);
    }
  };

  if (isLoading) {
    return <Loading fullScreen text="Chargement du menu..." />;
  }

  if (!menu) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header 
          title="Modifier le menu"
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, color: '#6B7280', textAlign: 'center' }}>
            Menu non trouvé
          </Text>
          <Button
            title="Retour"
            onPress={() => router.back()}
            variant="outline"
            style={{ marginTop: 16 }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Modifier le menu"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="checkmark-outline"
        onRightPress={handleSave}
      />
      
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {/* Informations du menu */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Informations du menu
          </Text>
          
          <Input
            label="Nom du menu *"
            placeholder="Nom du menu"
            value={name}
            onChangeText={setName}
            maxLength={100}
          />

          <Input
            label="Description"
            placeholder="Description du menu (optionnel)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />

          <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 12 }}>
            Créé le {menu ? new Date(menu.created_at).toLocaleDateString('fr-FR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : ''}
            {'\n'}
            {menu?.items.length || 0} plat(s) dans ce menu
          </Text>
        </Card>

        {/* Actions sur le menu */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
            Actions
          </Text>
          
          <Button
            title={menu?.disponible ? "Désactiver ce menu" : "Activer ce menu"}
            onPress={handleToggleAvailability}
            variant={menu?.disponible ? "secondary" : "primary"}
            fullWidth
            leftIcon={menu?.disponible ? "pause-circle-outline" : "play-circle-outline"}
            style={{ 
              marginBottom: 12,
              backgroundColor: menu?.disponible ? '#EF4444' : '#10B981',
            }}
          />

          <Button
            title="Gérer les plats"
            onPress={() => router.push(`/menu/${menu?.id}` as any)}
            variant="outline"
            fullWidth
            leftIcon="restaurant-outline"
            style={{ marginBottom: 12 }}
          />

          <View style={{
            backgroundColor: menu?.disponible ? '#D1FAE5' : '#FEE2E2',
            padding: 12,
            borderRadius: 8,
          }}>
            <Text style={{ 
              fontSize: 12, 
              color: menu?.disponible ? '#065F46' : '#991B1B',
              textAlign: 'center',
              fontWeight: '500'
            }}>
              {menu?.disponible 
                ? '✅ Ce menu est actuellement visible par les clients' 
                : '⏸️ Ce menu n\'est pas visible par les clients'
              }
            </Text>
          </View>
        </Card>

        {/* Statistiques du menu */}
        {menu && menu.items.length > 0 && (
          <Card style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 16 }}>
              Statistiques
            </Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>
                  {menu.items.length}
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                  Plats{'\n'}totaux
                </Text>
              </View>
              
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#10B981' }}>
                  {menu.items.filter(item => item.is_available).length}
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                  Plats{'\n'}disponibles
                </Text>
              </View>
              
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#EF4444' }}>
                  {menu.items.filter(item => !item.is_available).length}
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280', textAlign: 'center' }}>
                  Plats{'\n'}indisponibles
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Bouton de sauvegarde principal */}
        <Button
          title="Sauvegarder les modifications"
          onPress={handleSave}
          loading={isSaving}
          variant="primary"
          fullWidth
          leftIcon="checkmark-circle-outline"
          style={{ backgroundColor: '#059669' }}
        />
      </ScrollView>
    </View>
  );
}