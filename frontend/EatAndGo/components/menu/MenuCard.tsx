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
  isToggling?: boolean;
}

export function MenuCard({ 
  menu, 
  onPress, 
  onEdit, 
  onToggle, 
  onDelete,
  isToggling = false
}: MenuCardProps) {
  
  // Fonction pour déterminer si le menu est disponible
  // Gère à la fois is_available et disponible (legacy)
  const isMenuAvailable = () => {
    // Si is_available est défini (boolean), on l'utilise
    if (typeof menu.is_available === 'boolean') {
      return menu.is_available;
    }
    // Sinon, on utilise disponible si elle existe (legacy)
    if (typeof (menu as any).disponible === 'boolean') {
      return (menu as any).disponible;
    }
    // Par défaut, considérer comme non disponible
    return false;
  };

  const menuIsAvailable = isMenuAvailable();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isToggling}
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
        opacity: isToggling ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4 }}>
            {menu.name}
          </Text>
          
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>
            {menu.items?.length || 0} plat(s) • Créé le {new Date(menu.created_at).toLocaleDateString('fr-FR')}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <View style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 4,
              backgroundColor: menuIsAvailable ? '#D1FAE5' : '#FEE2E2',
            }}>
              <Text style={{
                fontSize: 12,
                fontWeight: '500',
                color: menuIsAvailable ? '#059669' : '#DC2626',
              }}>
                {menuIsAvailable ? 'Actif' : 'Inactif'}
              </Text>
            </View>

            {isToggling && (
              <View style={{ 
                marginLeft: 8, 
                paddingHorizontal: 8, 
                paddingVertical: 4, 
                backgroundColor: '#FEF3C7',
                borderRadius: 4 
              }}>
                <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '500' }}>
                  En cours...
                </Text>
              </View>
            )}
          </View>

          {/* Informations supplémentaires */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {menu.items && menu.items.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="restaurant-outline" size={12} color="#6B7280" />
                <Text style={{ fontSize: 11, color: '#6B7280', marginLeft: 2 }}>
                  {menu.items.filter(item => item.is_available !== false).length} disponible(s)
                </Text>
              </View>
            )}
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="time-outline" size={12} color="#6B7280" />
              <Text style={{ fontSize: 11, color: '#6B7280', marginLeft: 2 }}>
                Modifié {new Date(menu.updated_at).toLocaleDateString('fr-FR')}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={onEdit}
          disabled={isToggling}
          style={{ padding: 8 }}
        >
          <Ionicons name="create-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {/* Bouton toggle principal */}
        <TouchableOpacity
          onPress={onToggle}
          disabled={isToggling}
          style={{
            flex: 1,
            backgroundColor: menuIsAvailable ? '#EF4444' : '#10B981',
            paddingVertical: 8,
            borderRadius: 6,
            alignItems: 'center',
            opacity: isToggling ? 0.5 : 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isToggling && (
              <Ionicons 
                name="hourglass-outline" 
                size={14} 
                color="white" 
                style={{ marginRight: 4 }} 
              />
            )}
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '500' }}>
              {isToggling 
                ? 'En cours...' 
                : menuIsAvailable 
                  ? 'Désactiver' 
                  : 'Activer'
              }
            </Text>
          </View>
        </TouchableOpacity>

        {/* Bouton supprimer */}
        <TouchableOpacity
          onPress={onDelete}
          disabled={isToggling}
          style={{
            backgroundColor: '#EF4444',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 6,
            alignItems: 'center',
            opacity: isToggling ? 0.5 : 1,
          }}
        >
          <Ionicons name="trash-outline" size={16} color="white" />
        </TouchableOpacity>
      </View>

    </TouchableOpacity>
  );
}