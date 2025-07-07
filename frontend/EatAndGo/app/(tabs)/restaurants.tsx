import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  ViewStyle,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { SearchBar } from '@/components/common/SearchBar';
import { RestaurantCard } from '@/components/restaurant/RestaurantCard';
import { Loading } from '@/components/ui/Loading';
import { Button } from '@/components/ui/Button';
import { Restaurant } from '@/types/restaurant';

export default function RestaurantsScreen() {
  const {
    restaurants,
    isLoading,
    filters,
    pagination,
    loadRestaurants,
    searchRestaurants,
    setFilters,
  } = useRestaurant();

  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    loadRestaurants();
  }, []);

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim()) {
      try {
        await searchRestaurants(searchQuery.trim(), filters);
      } catch (error) {
        Alert.alert('Erreur', 'Impossible de rechercher les restaurants');
      }
    } else {
      await loadRestaurants(filters);
    }
  }, [searchQuery, filters]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadRestaurants(filters, 1);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de rafraîchir la liste');
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || pagination.page >= pagination.pages) return;

    setLoadingMore(true);
    try {
      await loadRestaurants(filters, pagination.page + 1);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de charger plus de restaurants');
    } finally {
      setLoadingMore(false);
    }
  };

  const renderRestaurant = ({ item }: { item: Restaurant }) => (
    <RestaurantCard
      restaurant={item}
      onPress={() => router.push(`/restaurant/${item.id}`)}
    />
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return <Loading style={{ paddingVertical: 20 }} />;
  };

  const renderEmpty = () => {
    if (isLoading) return <Loading fullScreen text="Chargement des restaurants..." />;
    
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
        <Button
          title="Ajouter un restaurant"
          onPress={() => router.push('/restaurant/add')}
          style={{ marginTop: 20 }}
        />
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
        title="Restaurants" 
        rightIcon="add-outline"
        onRightPress={() => router.push('/restaurant/add')}
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <SearchBar
          placeholder="Rechercher un restaurant..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSearch={handleSearch}
          onFilter={() => {/* Ouvrir modal de filtres */}}
        />
      </View>

      <FlatList
        data={restaurants}
        renderItem={renderRestaurant}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.1}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}