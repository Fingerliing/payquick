import React from 'react';
import { View, Text, Image, TouchableOpacity, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Restaurant } from '@/types/restaurant';
import { Card } from '../ui/Card';

interface RestaurantCardProps {
  restaurant: Restaurant;
  onPress: () => void;
  showDistance?: boolean;
  distance?: number;
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({
  restaurant,
  onPress,
  showDistance = false,
  distance,
}) => {
  const containerStyle: ViewStyle = {
    marginHorizontal: 16,
    marginBottom: 12,
  };

  const imageStyle: ImageStyle = {
    width: '100%',
    height: 160,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  };

  const contentStyle: ViewStyle = {
    padding: 12,
  };

  const headerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  };

  const titleStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  };

  const ratingContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  };

  const ratingStyle: TextStyle = {
    fontSize: 12,
    fontWeight: '500',
    color: '#D97706',
    marginLeft: 2,
  };

  const infoRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  };

  const infoTextStyle: TextStyle = {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  };

  const priceRangeStyle: TextStyle = {
    fontSize: 12,
    color: '#059669',
    fontWeight: '500',
  };

  const getPriceRangeText = (priceRange: number) => {
    return '€'.repeat(priceRange);
  };

  const getStatusColor = () => {
    return restaurant.isActive ? '#10B981' : '#EF4444';
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={containerStyle} padding={0}>
        <Image
          source={{ uri: restaurant.image || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop' }}
          style={imageStyle}
          resizeMode="cover"
        />
        
        <View style={contentStyle}>
          <View style={headerStyle}>
            <Text style={titleStyle} numberOfLines={1}>
              {restaurant.name}
            </Text>
            
            <View style={ratingContainerStyle}>
              <Ionicons name="star" size={12} color="#D97706" />
              <Text style={ratingStyle}>
                {typeof restaurant.rating === 'number' ? restaurant.rating.toFixed(1) : '0.0'}
              </Text>
            </View>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            <Text style={infoTextStyle} numberOfLines={1}>
              {restaurant.address}, {restaurant.city}
            </Text>
          </View>

          <View style={infoRowStyle}>
            <Ionicons name="restaurant-outline" size={14} color="#6B7280" />
            <Text style={infoTextStyle}>{restaurant.cuisine}</Text>
            <Text style={[priceRangeStyle, { marginLeft: 8 }]}>
              {getPriceRangeText(restaurant.priceRange)}
            </Text>
          </View>

          {showDistance && distance !== undefined && (
            <View style={infoRowStyle}>
              <Ionicons name="walk-outline" size={14} color="#6B7280" />
              <Text style={infoTextStyle}>
                {typeof distance === 'number' ? distance.toFixed(1) : '0.0'} km
              </Text>
            </View>
          )}

          <View style={[infoRowStyle, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: getStatusColor(),
                  marginRight: 4,
                }}
              />
              <Text style={infoTextStyle}>
                {restaurant.isActive ? 'Ouvert' : 'Fermé'}
              </Text>
            </View>
            
            <Text style={infoTextStyle}>
              {restaurant.reviewCount} avis
            </Text>
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
};