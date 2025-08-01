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
import { Restaurant } from '@/types/restaurant';

export default function BrowseRestaurantsScreen() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    try {
      console.log('🚀 Loading public restaurants...');
      setLoading(true);
      setError(null);
      
      const response = await restaurantService.getPublicRestaurants({
        page: 1,
        limit: 50,
      });
      
      console.log('📥 Response received:', response);
      
      let restaurantsData: Restaurant[] = [];
      
      if (Array.isArray(response)) {
        restaurantsData = response;
      } else if (response && 'data' in response && Array.isArray(response.data)) {
        restaurantsData = response.data;
      } else if (response && 'results' in response && Array.isArray(response.results)) {
        restaurantsData = response.results;
      }
      
      console.log('✅ Public restaurants loaded:', restaurantsData.length);
      setRestaurants(restaurantsData);
      
    } catch (error: any) {
      console.error('❌ Error loading public restaurants:', error);
      
      if (error.status === 403) {
        setError('Les endpoints publics ne sont pas encore configurés. Veuillez contacter l\'administrateur.');
      } else if (error.status === 404) {
        setError('Service de restaurants non disponible. Les endpoints publics sont-ils configurés ?');
      } else if (error.status >= 500) {
        setError('Erreur serveur. Veuillez réessayer plus tard.');
      } else {
        setError(error.message || 'Erreur lors du chargement des restaurants');
      }
      
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

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      await loadRestaurants();
      return;
    }

    try {
      console.log('🔍 Searching public restaurants:', query);
      const results = await restaurantService.searchPublicRestaurants(query);
      
      let searchResults: Restaurant[] = [];
      if (Array.isArray(results)) {
        searchResults = results;
      } else if (results && Array.isArray(results)) {
        searchResults = results;
      }
      
      setRestaurants(searchResults);
    } catch (error: any) {
      console.error('❌ Search error:', error);
      // Fallback sur filtrage local
      const filtered = restaurants.filter(restaurant =>
        restaurant.name.toLowerCase().includes(query.toLowerCase()) ||
        restaurant.description?.toLowerCase().includes(query.toLowerCase()) ||
        restaurant.city.toLowerCase().includes(query.toLowerCase())
      );
      setRestaurants(filtered);
    }
  };

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
              {item.address}, {item.city}
            </Text>
            
            {/* Titres-restaurant */}
            {item.accepts_meal_vouchers && (
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                marginTop: 4,
                backgroundColor: '#E8F5E8',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
                alignSelf: 'flex-start'
              }}>
                <Ionicons name="card-outline" size={12} color="#10B981" />
                <Text style={{ fontSize: 10, color: '#10B981', marginLeft: 4 }}>
                  Titres-restaurant acceptés
                </Text>
              </View>
            )}
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
            <Text style={{ fontSize: 12, color: '#666', marginRight: 12 }}>
              {'€'.repeat(item.priceRange || 2)}
            </Text>
            
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
          onChangeText={handleSearch}
        />
      </View>

      {error && (
        <View style={{ 
          margin: 16, 
          padding: 16, 
          backgroundColor: '#FEE2E2', 
          borderRadius: 8,
          borderLeftWidth: 4,
          borderLeftColor: '#EF4444'
        }}>
          <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '500' }}>
            Erreur de configuration
          </Text>
          <Text style={{ color: '#DC2626', fontSize: 12, marginTop: 4 }}>
            {error}
          </Text>
        </View>
      )}

      <FlatList
        data={restaurants}
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
              {loading 
                ? 'Chargement...' 
                : searchQuery 
                  ? 'Aucun restaurant trouvé' 
                  : 'Aucun restaurant disponible'
              }
            </Text>
            {searchQuery && !loading && (
              <Text style={{ fontSize: 14, color: '#999', textAlign: 'center', marginTop: 8 }}>
                Essayez avec d'autres mots-clés
              </Text>
            )}
            {error && (
              <Pressable 
                onPress={loadRestaurants}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  backgroundColor: '#FF6B35',
                  borderRadius: 8
                }}
              >
                <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>
                  Réessayer
                </Text>
              </Pressable>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}