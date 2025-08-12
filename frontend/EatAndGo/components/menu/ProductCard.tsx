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
  isLoading?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  onAddToCart,
  showAddButton = false,
  isLoading = false,
}) => {
  
  // Fonction pour déterminer la disponibilité du produit
  // Gère les différentes propriétés possibles
  const isProductAvailable = () => {
    // Priorité à is_available si défini
    if (typeof product.isAvailable === 'boolean') {
      return product.isAvailable;
    }
    // Fallback sur d'autres propriétés si nécessaire
    if (typeof (product as any).is_available === 'boolean') {
      return (product as any).is_available;
    }
    if (typeof (product as any).disponible === 'boolean') {
      return (product as any).disponible;
    }
    // Par défaut, considérer comme disponible
    return true;
  };

  const productIsAvailable = isProductAvailable();

  const containerStyle: ViewStyle = {
    marginHorizontal: 16,
    marginBottom: 12,
    opacity: isLoading ? 0.7 : 1,
  };

  const contentStyle: ViewStyle = {
    flexDirection: 'row',
    padding: 12,
  };

  const imageContainerStyle: ViewStyle = {
    position: 'relative',
    marginRight: 12,
  };

  const imageStyle: ImageStyle = {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  };

  const imageOverlayStyle: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  };

  const infoStyle: ViewStyle = {
    flex: 1,
  };

  const titleStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    color: productIsAvailable ? '#111827' : '#9CA3AF',
    marginBottom: 4,
  };

  const descriptionStyle: TextStyle = {
    fontSize: 12,
    color: productIsAvailable ? '#6B7280' : '#9CA3AF',
    marginBottom: 8,
    lineHeight: 16,
  };

  const priceStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    color: productIsAvailable ? '#059669' : '#9CA3AF',
  };

  const badgeContainerStyle: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  };

  const getBadgeStyle = (isSpecial: boolean = false): ViewStyle => ({
    backgroundColor: productIsAvailable ? (isSpecial ? '#FEF3C7' : '#F3F4F6') : '#F9FAFB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  });

  const getBadgeTextStyle = (isSpecial: boolean = false): TextStyle => ({
    fontSize: 10,
    color: productIsAvailable ? (isSpecial ? '#92400E' : '#6B7280') : '#9CA3AF',
    fontWeight: '500',
  });

  const addButtonStyle: ViewStyle = {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: productIsAvailable ? '#3B82F6' : '#9CA3AF',
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
    if (product.isVegetarian) badges.push({ text: 'Végétarien', special: true });
    if (product.isVegan) badges.push({ text: 'Vegan', special: true });
    if (product.isGlutenFree) badges.push({ text: 'Sans gluten', special: false });
    
    // Ajouter badge de statut si indisponible
    if (!productIsAvailable) {
      badges.push({ text: 'Indisponible', special: false });
    }
    
    return badges;
  };

  const formatPrice = (price: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(price);
  };

  return (
    <TouchableOpacity 
      onPress={onPress} 
      activeOpacity={0.7}
      disabled={isLoading}
    >
      <Card style={containerStyle} padding={0}>
        <View style={contentStyle}>
          <View style={imageContainerStyle}>
            <Image
              source={{ uri: product.image || 'https://via.placeholder.com/80x80' }}
              style={imageStyle}
              resizeMode="cover"
            />
            {!productIsAvailable && (
              <View style={imageOverlayStyle}>
                <Ionicons name="pause-circle" size={24} color="#FFFFFF" />
              </View>
            )}
          </View>
          
          <View style={infoStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle} numberOfLines={2}>
                  {product.name}
                </Text>
                
                <Text style={descriptionStyle} numberOfLines={2}>
                  {product.description}
                </Text>
              </View>

              {/* Indicateur de statut */}
              <View style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: productIsAvailable ? '#10B981' : '#EF4444',
                marginLeft: 8,
                marginTop: 4,
              }} />
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={priceStyle}>
                {formatPrice(product.price)}
              </Text>
              
              {showAddButton && productIsAvailable && onAddToCart && !isLoading && (
                <TouchableOpacity style={addButtonStyle} onPress={onAddToCart}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
            
            {getBadges().length > 0 && (
              <View style={badgeContainerStyle}>
                {getBadges().map((badge, index) => (
                  <View key={index} style={getBadgeStyle(badge.special)}>
                    <Text style={getBadgeTextStyle(badge.special)}>{badge.text}</Text>
                  </View>
                ))}
              </View>
            )}
            
            {product.preparationTime > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons 
                  name="time-outline" 
                  size={12} 
                  color={productIsAvailable ? '#6B7280' : '#9CA3AF'} 
                />
                <Text style={{ 
                  fontSize: 12, 
                  color: productIsAvailable ? '#6B7280' : '#9CA3AF', 
                  marginLeft: 4 
                }}>
                  {product.preparationTime} min
                </Text>
              </View>
            )}

            {/* Informations sur les allergènes si disponibles */}
            {product.allergens && product.allergens.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons 
                  name="warning-outline" 
                  size={12} 
                  color={productIsAvailable ? '#F59E0B' : '#9CA3AF'} 
                />
                <Text style={{ 
                  fontSize: 10, 
                  color: productIsAvailable ? '#F59E0B' : '#9CA3AF', 
                  marginLeft: 4 
                }}>
                  Contient: {product.allergens.slice(0, 2).join(', ')}
                  {product.allergens.length > 2 && '...'}
                </Text>
              </View>
            )}
          </View>
        </View>
        
        {!productIsAvailable && (
          <View style={unavailableOverlayStyle}>
            <Ionicons name="pause-circle-outline" size={32} color="#FFFFFF" />
            <Text style={{ 
              color: '#FFFFFF', 
              fontWeight: '600', 
              fontSize: 14, 
              marginTop: 4 
            }}>
              Temporairement indisponible
            </Text>
          </View>
        )}

        {isLoading && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Ionicons name="hourglass-outline" size={24} color="#6B7280" />
            <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>
              Chargement...
            </Text>
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
};