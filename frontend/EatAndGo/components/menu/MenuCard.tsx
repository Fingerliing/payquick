import React from 'react';
import { View, Text, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Menu } from '@/types/restaurant';
import { Card } from '@/components/ui/Card';

interface MenuCardProps {
  menu: Menu;
  onPress: () => void;
  onEdit?: () => void;
  onToggle?: () => void;
}

export const MenuCard: React.FC<MenuCardProps> = ({
  menu,
  onPress,
  onEdit,
  onToggle,
}) => {
  const containerStyle: ViewStyle = {
    marginHorizontal: 16,
    marginBottom: 12,
  };

  const headerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  };

  const titleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 12,
  };

  const descriptionStyle: TextStyle = {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  };

  const statusStyle: TextStyle = {
    fontSize: 12,
    fontWeight: '500',
    color: menu.isActive ? '#10B981' : '#EF4444',
  };

  const statsStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const actionButtonStyle: ViewStyle = {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  };

  const getTotalProducts = () => {
    return menu.categories.reduce((total, category) => total + category.products.length, 0);
  };

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={containerStyle}>
        <View style={headerStyle}>
          <View style={{ flex: 1 }}>
            <Text style={titleStyle}>{menu.name}</Text>
            {menu.description && (
              <Text style={descriptionStyle}>{menu.description}</Text>
            )}
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {onEdit && (
              <TouchableOpacity style={[actionButtonStyle, { marginRight: 8 }]} onPress={onEdit}>
                <Ionicons name="create-outline" size={20} color="#6B7280" />
              </TouchableOpacity>
            )}
            
            {onToggle && (
              <TouchableOpacity style={actionButtonStyle} onPress={onToggle}>
                <Ionicons 
                  name={menu.isActive ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color="#6B7280" 
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={statsStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="list-outline" size={16} color="#6B7280" />
            <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
              {menu.categories.length} catégorie{menu.categories.length > 1 ? 's' : ''}
            </Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="restaurant-outline" size={16} color="#6B7280" />
            <Text style={{ fontSize: 12, color: '#6B7280', marginLeft: 4 }}>
              {getTotalProducts()} produit{getTotalProducts() > 1 ? 's' : ''}
            </Text>
          </View>
          
          <Text style={statusStyle}>
            {menu.isActive ? 'Actif' : 'Inactif'}
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};
