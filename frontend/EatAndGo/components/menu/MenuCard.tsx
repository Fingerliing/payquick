import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Menu } from '@/types/menu';

interface MenuCardProps {
  menu: Menu;
  onPress: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

export function MenuCard({ menu, onPress, onEdit, onToggle, onDelete }: MenuCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: 'white',
        marginHorizontal: 16,
        marginVertical: 8,
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4 }}>
            {menu.name}
          </Text>
          
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>
            {menu.items.length} plat(s) • Créé le {new Date(menu.created_at).toLocaleDateString()}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: menu.disponible ? '#D1FAE5' : '#FEE2E2',
            }}>
              <Text style={{
                fontSize: 12,
                fontWeight: '500',
                color: menu.disponible ? '#059669' : '#DC2626',
              }}>
                {menu.disponible ? 'Actif' : 'Inactif'}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={onEdit}
          style={{ padding: 8 }}
        >
          <Ionicons name="create-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={onToggle}
          style={{
            flex: 1,
            backgroundColor: menu.disponible ? '#EF4444' : '#10B981',
            paddingVertical: 8,
            borderRadius: 6,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>
            {menu.disponible ? 'Désactiver' : 'Activer'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onDelete}
          style={{
            backgroundColor: '#EF4444',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 6,
            alignItems: 'center',
          }}
        >
          <Ionicons name="trash-outline" size={16} color="white" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}