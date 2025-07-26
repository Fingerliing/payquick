import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Alert,
  ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '@/components/ui/Header';
import { MenuCard } from '@/components/menu/MenuCard';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { menuService } from '@/services/menuService';
import { Menu } from '@/types/menu';

export default function MenusScreen() {
  const { restaurants } = useRestaurant();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadMenus();
  }, []);

  const loadMenus = async () => {
    setIsLoading(true);
    try {
      const myMenus = await menuService.getMyMenus();
      setMenus(myMenus);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger les menus');
      console.error('Erreur lors du chargement des menus:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMenus();
    setRefreshing(false);
  };

  const handleToggleMenu = async (menu: Menu) => {
    try {
      const result = await menuService.toggleMenuAvailability(menu.id);
      setMenus(prevMenus =>
        prevMenus.map(m => 
          m.id === menu.id 
            ? { ...m, disponible: result.disponible }
            : { ...m, disponible: false }
        )
      );
      Alert.alert(
        'Succès', 
        result.disponible 
          ? 'Menu activé avec succès' 
          : 'Menu désactivé avec succès'
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de modifier le menu');
      console.error('Erreur lors de la modification du menu:', error);
    }
  };

  const handleDeleteMenu = async (menu: Menu) => {
    Alert.alert(
      'Confirmer la suppression',
      `Êtes-vous sûr de vouloir supprimer le menu "${menu.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await menuService.deleteMenu(menu.id);
              setMenus(prevMenus => prevMenus.filter(m => m.id !== menu.id));
              Alert.alert('Succès', 'Menu supprimé avec succès');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de supprimer le menu');
              console.error('Erreur lors de la suppression du menu:', error);
            }
          }
        }
      ]
    );
  };

  const renderMenu = ({ item }: { item: Menu }) => (
    <MenuCard
      menu={item}
      onPress={() => router.push(`/menu/${item.id}` as any)}
      onEdit={() => router.push(`/menu/edit/${item.id}` as any)}
      onToggle={() => handleToggleMenu(item)}
      onDelete={() => handleDeleteMenu(item)}
    />
  );

  const renderEmpty = () => {
    if (isLoading) return <Loading fullScreen text="Chargement des menus..." />;
    
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Ionicons name="list-outline" size={64} color="#D1D5DB" />
        <Text style={{ fontSize: 18, color: '#6B7280', textAlign: 'center', marginTop: 16 }}>
          Aucun menu trouvé
        </Text>
        <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>
          Créez votre premier menu pour commencer
        </Text>
        {restaurants.length > 0 && (
          <Button
            title="Créer un menu"
            onPress={() => router.push(`/menu/add?restaurantId=${restaurants[0].id}`)}
            variant="primary"
            style={{ marginTop: 20 }}
          />
        )}
      </View>
    );
  };

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  return (
    <View style={containerStyle}>
      <Header 
        title="Mes Menus"
        rightIcon="add-outline"
        onRightPress={() => {
          if (restaurants.length > 0) {
            router.push(`/menu/add?restaurantId=${restaurants[0].id}`);
          } else {
            Alert.alert('Information', 'Vous devez d\'abord créer un restaurant');
          }
        }}
      />

      <FlatList
        data={menus}
        renderItem={renderMenu}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}