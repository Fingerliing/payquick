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
  const [togglingMenuId, setTogglingMenuId] = useState<number | null>(null);

  useEffect(() => {
    loadMenus();
  }, []);

  const loadMenus = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const myMenus = await menuService.getMyMenus();
      setMenus(myMenus);
    } catch (error) {
      console.error('Erreur lors du chargement des menus:', error);
      Alert.alert('Erreur', 'Impossible de charger les menus');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMenus(false);
    setRefreshing(false);
  };

  /**
   * Version améliorée du toggle avec meilleure gestion d'état
   */
  const handleToggleMenu = async (menu: Menu) => {
    if (togglingMenuId) return; // Évite les clics multiples

    setTogglingMenuId(menu.id);

    try {
      const result = await menuService.toggleMenuAvailability(menu.id);

      // Rechargement complet des menus pour éviter les incohérences
      await loadMenus(false);
      
      Alert.alert(
        'Succès', 
        result.message || (result.is_available 
          ? 'Menu activé avec succès (les autres menus ont été désactivés)'
          : 'Menu désactivé avec succès')
      );

    } catch (error: any) {
      console.error('Erreur lors du toggle:', error);
      
      // Message d'erreur plus détaillé
      let errorMessage = 'Impossible de modifier le menu';
      if (error?.response?.status === 403) {
        errorMessage = 'Vous n\'avez pas les permissions pour modifier ce menu';
      } else if (error?.response?.status === 404) {
        errorMessage = 'Menu non trouvé';
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Erreur', errorMessage);
    } finally {
      setTogglingMenuId(null);
    }
  };

  const handleDeleteMenu = async (menu: Menu) => {
    Alert.alert(
      'Confirmer la suppression',
      `Êtes-vous sûr de vouloir supprimer le menu "${menu.name}" ?\n\nCette action est irréversible.`,
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
            } catch (error: any) {
              console.error('Erreur lors de la suppression du menu:', error);
              Alert.alert(
                'Erreur', 
                error?.response?.data?.detail || 'Impossible de supprimer le menu'
              );
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
      isToggling={togglingMenuId === item.id}
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

  // Statistiques rapides
  const activeMenusCount = menus.filter(m => m.is_available).length;
  const totalMenusCount = menus.length;

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

      {/* Barre d'informations */}
      {totalMenusCount > 0 && (
        <View style={{ 
          backgroundColor: '#FFFFFF', 
          paddingHorizontal: 16, 
          paddingVertical: 12, 
          borderBottomWidth: 1, 
          borderBottomColor: '#E5E7EB' 
        }}>
          <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
            {activeMenusCount} menu(s) actif(s) sur {totalMenusCount}
            {activeMenusCount > 1 && (
              <Text style={{ color: '#EF4444' }}> ⚠️ Attention: plusieurs menus actifs</Text>
            )}
          </Text>
        </View>
      )}

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