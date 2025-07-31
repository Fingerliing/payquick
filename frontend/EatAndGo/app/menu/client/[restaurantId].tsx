import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  SafeAreaView,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/contexts/CartContext';
import { menuService } from '@/services/menuService';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Menu, MenuItem } from '@/types/menu';
import { Restaurant } from '@/types/restaurant';

export default function ClientMenuScreen() {
  const { restaurantId } = useLocalSearchParams<{ restaurantId: string }>();
  const { table } = useLocalSearchParams<{ table?: string }>();
  const { cart, addToCart, isCartForRestaurant } = useCart();
  
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (restaurantId) {
      loadRestaurantData();
    }
  }, [restaurantId]);

  const loadRestaurantData = async () => {
    try {
      setIsLoading(true);
      
      // Réutiliser vos services existants
      const [restaurantData, menusData] = await Promise.all([
        restaurantService.getRestaurant(restaurantId),
        menuService.getMenusByRestaurant(parseInt(restaurantId))
      ]);
      
      setRestaurant(restaurantData);
      setMenus(menusData);
    } catch (error) {
      console.error('Error loading restaurant data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données du restaurant');
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRestaurantData();
    setRefreshing(false);
  };

  const handleAddToCart = (item: MenuItem) => {
    // Vérifier si on change de restaurant
    if (!isCartForRestaurant(parseInt(restaurantId))) {
      Alert.alert(
        'Changer de restaurant',
        'Vous avez déjà des articles d\'un autre restaurant. Voulez-vous vider votre panier ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Continuer', 
            onPress: () => proceedAddToCart(item)
          }
        ]
      );
    } else {
      proceedAddToCart(item);
    }
  };

  const proceedAddToCart = (item: MenuItem) => {
    addToCart({
      id: `${item.id}-${Date.now()}`, // ID unique pour le panier
      menuItemId: item.id,
      name: item.name,
      description: item.description,
      price: parseFloat(item.price),
      restaurantId: parseInt(restaurantId),
      restaurantName: restaurant?.name || '',
      specialInstructions: '',
    });
    
    Alert.alert(
      'Ajouté au panier',
      `${item.name} a été ajouté à votre commande`,
      [{ text: 'OK' }]
    );
  };

  const renderMenuItem = ({ item }: { item: MenuItem }) => (
    <Card style={{ margin: 8 }}>
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
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#FF6B35' }}>
              {parseFloat(item.price).toFixed(2)} €
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
      
      {item.is_available ? (
        <Button
          title="Ajouter au panier"
          onPress={() => handleAddToCart(item)}
          leftIcon="add"
          style={{ marginTop: 12, backgroundColor: '#FF6B35' }}
        />
      ) : (
        <View style={{ 
          marginTop: 12, 
          padding: 12, 
          backgroundColor: '#F3F4F6', 
          borderRadius: 8,
          alignItems: 'center'
        }}>
          <Text style={{ color: '#6B7280', fontSize: 14 }}>
            Temporairement indisponible
          </Text>
        </View>
      )}
    </Card>
  );

  const renderMenu = ({ item: menu }: { item: Menu }) => (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ 
        fontSize: 20, 
        fontWeight: 'bold', 
        color: '#333', 
        marginBottom: 16,
        paddingHorizontal: 16
      }}>
        {menu.name}
      </Text>
      
      <FlatList
        data={menu.items || []}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id.toString()}
        numColumns={1}
        scrollEnabled={false}
      />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement du menu..." />
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Menu" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Restaurant non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalCartItems = cart.itemCount;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title={restaurant.name}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
        rightIcon={totalCartItems > 0 ? "bag" : undefined}
        onRightPress={totalCartItems > 0 ? () => router.push('/(client)/cart') : undefined}
      />
      
      {/* Restaurant Info */}
      <Card style={{ margin: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 8 }}>
          {restaurant.name}
        </Text>
        {restaurant.description && (
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 12 }}>
            {restaurant.description}
          </Text>
        )}
        {table && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="restaurant-outline" size={16} color="#FF6B35" />
            <Text style={{ fontSize: 14, color: '#FF6B35', marginLeft: 4, fontWeight: '500' }}>
              Table {table}
            </Text>
          </View>
        )}
      </Card>

      <FlatList
        data={menus}
        renderItem={renderMenu}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="restaurant-outline" size={64} color="#ccc" />
            <Text style={{ fontSize: 18, color: '#6B7280', textAlign: 'center', marginTop: 16 }}>
              Aucun menu disponible
            </Text>
          </View>
        )}
      />

      {/* Bouton panier flottant */}
      {totalCartItems > 0 && (
        <Pressable 
          style={{
            position: 'absolute',
            bottom: 20,
            left: 16,
            right: 16,
            backgroundColor: '#FF6B35',
            borderRadius: 12,
            padding: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
          onPress={() => router.push('/(client)/cart')}
        >
          <View>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              {totalCartItems} article{totalCartItems > 1 ? 's' : ''}
            </Text>
            <Text style={{ color: '#fff', fontSize: 14, opacity: 0.9 }}>
              {cart.total.toFixed(2)} €
            </Text>
          </View>
          <Ionicons name="bag" size={20} color="#fff" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}
