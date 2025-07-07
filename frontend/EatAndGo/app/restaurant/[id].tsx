import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ViewStyle,
  TextStyle,
  ImageStyle,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentRestaurant, loadRestaurant, updateRestaurant, isLoading } = useRestaurant();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id) {
      loadRestaurant(id);
    }
  }, [id]);

  const handleToggleStatus = async () => {
    if (!currentRestaurant) return;

    const action = currentRestaurant.isActive ? 'fermer' : 'ouvrir';
    Alert.alert(
      'Confirmer',
      `Voulez-vous ${action} ce restaurant ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              await updateRestaurant(currentRestaurant.id, {
                isActive: !currentRestaurant.isActive,
              });
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de modifier le statut');
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    if (!id) return;
    setRefreshing(true);
    try {
      await loadRestaurant(id);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de rafraîchir les données');
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading && !currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Restaurant" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Loading fullScreen text="Chargement du restaurant..." />
      </View>
    );
  }

  if (!currentRestaurant) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' }}>
        <Header title="Restaurant" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <Text style={{ fontSize: 16, color: '#6B7280' }}>Restaurant non trouvé</Text>
      </View>
    );
  }

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: '#F9FAFB',
  };

  const imageStyle: ImageStyle = {
    width: '100%',
    height: 250,
    backgroundColor: '#F3F4F6',
  };

  const titleStyle: TextStyle = {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  };

  const subtitleStyle: TextStyle = {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
  };

  const infoRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  };

  const infoTextStyle: TextStyle = {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  };

  const statusStyle: TextStyle = {
    fontSize: 14,
    fontWeight: '500',
    color: currentRestaurant.isActive ? '#10B981' : '#EF4444',
  };

  const ratingStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  };

  return (
    <View style={containerStyle}>
      <Header 
        title={currentRestaurant.name}
        leftIcon="arrow-back"
        rightIcon="create-outline"
        onLeftPress={() => router.back()}
        onRightPress={() => router.push(`/restaurant/edit/${currentRestaurant.id}`)}
      />

      <ScrollView>
        <Image
          source={{ uri: currentRestaurant.image || 'https://via.placeholder.com/400x250' }}
          style={imageStyle}
          resizeMode="cover"
        />

        <Card style={{ margin: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={titleStyle}>{currentRestaurant.name}</Text>
              <Text style={subtitleStyle}>{currentRestaurant.description}</Text>
            </View>
            
            <View style={ratingStyle}>
              <Ionicons name="star" size={16} color="#D97706" />
              <Text style={{ color: '#D97706', fontWeight: '500', marginLeft: 4 }}>
                {currentRestaurant.rating.toFixed(1)}
              </Text>
            </View>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="location-outline" size={20} color="#6B7280" />
            <Text style={infoTextStyle}>
              {currentRestaurant.address}, {currentRestaurant.city} {currentRestaurant.zipCode}
            </Text>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="call-outline" size={20} color="#6B7280" />
            <Text style={infoTextStyle}>{currentRestaurant.phone}</Text>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="mail-outline" size={20} color="#6B7280" />
            <Text style={infoTextStyle}>{currentRestaurant.email}</Text>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="restaurant-outline" size={20} color="#6B7280" />
            <Text style={infoTextStyle}>{currentRestaurant.cuisine}</Text>
          </View>

          <View style={infoRowStyle}>
            <Ionicons 
              name={currentRestaurant.isActive ? "checkmark-circle" : "close-circle"} 
              size={20} 
              color={currentRestaurant.isActive ? "#10B981" : "#EF4444"} 
            />
            <Text style={[infoTextStyle, statusStyle]}>
              {currentRestaurant.isActive ? 'Ouvert' : 'Fermé'}
            </Text>
          </View>
        </Card>

        <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Button
            title={currentRestaurant.isActive ? 'Fermer le restaurant' : 'Ouvrir le restaurant'}
            onPress={handleToggleStatus}
            variant={currentRestaurant.isActive ? 'secondary' : 'primary'}
            fullWidth
            style={{ marginBottom: 12 }}
          />

          <Button
            title="Gérer les menus"
            onPress={() => router.push(`/menu/${currentRestaurant.id}`)}
            variant="outline"
            fullWidth
            style={{ marginBottom: 12 }}
          />

          <Button
            title="Voir les statistiques"
            onPress={() => {/* Naviguer vers les stats */}}
            variant="ghost"
            fullWidth
          />
        </View>
      </ScrollView>
    </View>
  );
}