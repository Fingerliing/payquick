import React from 'react';
import { View, Text, Image, TouchableOpacity, ViewStyle, TextStyle, ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/types/restaurant';
import { Card } from '@/components/ui/Card';

interface ProductCardProps {
  product: Product;
  onPress: () => void;
  onAddToCart?: () => void;
  showAddButton?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  onAddToCart,
  showAddButton = false,
}) => {
  const containerStyle: ViewStyle = {
    marginHorizontal: 16,
    marginBottom: 12,
  };

  const contentStyle: ViewStyle = {
    flexDirection: 'row',
    padding: 12,
  };

  const imageStyle: ImageStyle = {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginRight: 12,
  };

  const infoStyle: ViewStyle = {
    flex: 1,
  };

  const titleStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  };

  const descriptionStyle: TextStyle = {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 16,
  };

  const priceStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  };

  const badgeContainerStyle: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  };

  const badgeStyle: ViewStyle = {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  };

  const badgeTextStyle: TextStyle = {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  };

  const addButtonStyle: ViewStyle = {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  };

  const unavailableOverlayStyle: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  };

  const getBadges = () => {
    const badges = [];
    if (product.isVegetarian) badges.push('Végétarien');
    if (product.isVegan) badges.push('Vegan');
    if (product.isGlutenFree) badges.push('Sans gluten');
    return badges;
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={containerStyle} padding={0}>
        <View style={contentStyle}>
          <Image
            source={{ uri: product.image || 'https://via.placeholder.com/80x80' }}
            style={imageStyle}
            resizeMode="cover"
          />
          
          <View style={infoStyle}>
            <Text style={titleStyle} numberOfLines={2}>
              {product.name}
            </Text>
            
            <Text style={descriptionStyle} numberOfLines={2}>
              {product.description}
            </Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={priceStyle}>{product.price.toFixed(2)} €</Text>
              
              {showAddButton && product.isAvailable && onAddToCart && (
                <TouchableOpacity style={addButtonStyle} onPress={onAddToCart}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
            
            {getBadges().length > 0 && (
              <View style={badgeContainerStyle}>
                {getBadges().map((badge, index) => (
                  <View key={index} style={badgeStyle}>
                    <Text style={badgeTextStyle}>{badge}</Text>
                  </View>
                ))}
              </View>
            )}
            
            {product.preparationTime > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons name="time-outline" size={12} color="#6B7280" />
                <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
                  {product.preparationTime} min
                </Text>
              </View>
            )}
          </View>
        </View>
        
        {!product.isAvailable && (
          <View style={unavailableOverlayStyle}>
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>
              Indisponible
            </Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
};