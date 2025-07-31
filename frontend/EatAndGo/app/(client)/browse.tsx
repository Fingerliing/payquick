import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ListRenderItem,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { restaurantService } from '@/services/restaurantService';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { SearchBar } from '@/components/common/SearchBar';
import { Restaurant } from '@/types/restaurant'

export default function BrowseRestaurantsScreen() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    try {
      setLoading(true);
      const response = await restaurantService.getRestaurants();
      
      // ✅ Adapter le format de réponse
      let restaurantsData: Restaurant[] = [];
      
      if (Array.isArray(response)) {
        restaurantsData = response;
      } else if (response && 'data' in response && Array.isArray(response.data)) {
        restaurantsData = response.data;
      } else if (response && 'results' in response && Array.isArray(response.results)) {
        restaurantsData = response.results;
      }
      
      setRestaurants(restaurantsData);
    } catch (error) {
      console.error('❌ Error loading restaurants:', error);
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };
  const onRefresh = async () => {
    setRefreshing(true);
    await loadRestaurants();
    setRefreshing(false);
  };

  const filteredRestaurants = restaurants.filter(restaurant =>
    restaurant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    restaurant.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderRestaurantItem: ListRenderItem<Restaurant> = ({ item }) => (
    <Pressable onPress={() => router.push(`/menu/client/${item.id}`)}>
      <Card style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 4 }}>
              {item.name}
            </Text>
            {item.description && (
              <Text style={{ fontSize: 14, color: '#666', marginBottom: 8, lineHeight: 18 }}>
                {item.description}
              </Text>
            )}
            <Text style={{ fontSize: 12, color: '#666' }}>
              {item.address}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="restaurant-outline" size={16} color="#FF6B35" />
            <Text style={{ fontSize: 12, color: '#666', marginLeft: 4 }}>
              {item.cuisine || 'Restaurant'}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons 
              name={item.can_receive_orders ? "checkmark-circle" : "close-circle"} 
              size={16} 
              color={item.can_receive_orders ? "#10B981" : "#EF4444"} 
            />
            <Text style={{ 
              fontSize: 12, 
              color: item.can_receive_orders ? "#10B981" : "#EF4444", 
              marginLeft: 4 
            }}>
              {item.can_receive_orders ? "Ouvert" : "Fermé"}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header title="Restaurants" />

      <View style={{ padding: 16 }}>
        <SearchBar
          placeholder="Rechercher un restaurant..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredRestaurants}
        renderItem={renderRestaurantItem}
        keyExtractor={(item: Restaurant) => item.id.toString()}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="restaurant-outline" size={64} color="#ccc" />
            <Text style={{ fontSize: 18, color: '#666', textAlign: 'center', marginTop: 16 }}>
              {searchQuery ? 'Aucun restaurant trouvé' : 'Aucun restaurant disponible'}
            </Text>
            {searchQuery && (
              <Text style={{ fontSize: 14, color: '#999', textAlign: 'center', marginTop: 8 }}>
                Essayez avec d'autres mots-clés
              </Text>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}
