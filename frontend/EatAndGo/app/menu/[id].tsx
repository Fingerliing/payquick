import React, { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { menuService } from '@/services/menuService';
import { Menu, MenuItem } from '@/types/menu';

export default function MenuDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMenu();
  }, [id]);

  const loadMenu = async () => {
    try {
      const menuData = await menuService.getMenu(parseInt(id!));
      setMenu(menuData);
    } catch (error) {
      console.error('Erreur lors du chargement du menu:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleItemAvailability = async (item: MenuItem) => {
    try {
      const updatedItem = await menuService.menuItems.toggleItemAvailability(item.id);
      setMenu(prevMenu => {
        if (!prevMenu) return null;
        return {
          ...prevMenu,
          items: prevMenu.items.map(i => 
            i.id === item.id ? { ...i, is_available: updatedItem.is_available } : i
          )
        };
      });
    } catch (error) {
      console.error('Erreur lors de la modification de l\'item:', error);
    }
  };

  const renderMenuItem = ({ item }: { item: MenuItem }) => (
    <View style={{
      backgroundColor: 'white',
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 16,
      borderRadius: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>
            {item.name}
          </Text>
          {item.description && (
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>
              {item.description}
            </Text>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#059669' }}>
              {parseFloat(item.price).toFixed(2)}€
            </Text>
            <Text style={{ 
              fontSize: 12, 
              color: '#6B7280',
              backgroundColor: '#F3F4F6',
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
            }}>
              {item.category}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
        <Button
          title={item.is_available ? "Désactiver" : "Activer"}
          onPress={() => handleToggleItemAvailability(item)}
          variant={item.is_available ? "secondary" : "primary"}
          style={{ 
            flex: 1,
            backgroundColor: item.is_available ? '#EF4444' : '#10B981',
          }}
        />
        <Button
          title="Modifier"
          onPress={() => router.push(`/menu/item/edit/${item.id}` as any)}
          variant="primary"
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );

  if (isLoading) {
    return <Loading fullScreen text="Chargement du menu..." />;
  }

  if (!menu) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Menu non trouvé</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title={menu.name}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon="create-outline"
        onRightPress={() => router.push(`/menu/edit/${menu.id}` as any)}
      />
      
      <View style={{ padding: 16, backgroundColor: 'white', marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
          {menu.name}
        </Text>
        <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>
          {menu.items.length} plat(s) • Créé le {new Date(menu.created_at).toLocaleDateString()}
        </Text>
        
        <Button
          title="Ajouter un plat"
          onPress={() => router.push(`/menu/item/add?menuId=${menu.id}`)}
          variant="primary"
          fullWidth
          style={{ backgroundColor: '#10B981' }}
        />
      </View>

      <FlatList
        data={menu.items}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 16, color: '#6B7280', textAlign: 'center' }}>
              Aucun plat dans ce menu
            </Text>
            <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 }}>
              Ajoutez votre premier plat pour commencer
            </Text>
          </View>
        )}
      />
    </View>
  );
}