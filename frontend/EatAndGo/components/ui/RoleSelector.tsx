import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/config';

type UserRole = 'client' | 'restaurateur';

interface RoleSelectorProps {
  selectedRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  style?: ViewStyle;
}

interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const roleOptions: RoleOption[] = [
  {
    value: 'client',
    label: 'Client',
    description: 'Je veux commander des plats',
    icon: 'person-outline',
    color: '#3B82F6',
  },
  {
    value: 'restaurateur',
    label: 'Restaurateur',
    description: 'Je veux vendre mes plats',
    icon: 'restaurant-outline',
    color: '#10B981',
  },
];

export function RoleSelector({ selectedRole, onRoleChange, style }: RoleSelectorProps) {
  const containerStyle: ViewStyle = {
    ...style,
  };

  const titleStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  };

  const optionsContainerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  };

  const getOptionStyle = (isSelected: boolean, color: string): ViewStyle => ({
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: isSelected ? color : '#E5E7EB',
    backgroundColor: isSelected ? `${color}10` : COLORS.surface,
    alignItems: 'center',
    minHeight: 100,
  });

  const getIconColor = (isSelected: boolean, color: string): string => 
    isSelected ? color : COLORS.text.secondary;

  const getLabelStyle = (isSelected: boolean, color: string): TextStyle => ({
    fontSize: 16,
    fontWeight: '600',
    color: isSelected ? color : COLORS.text.primary,
    marginTop: 8,
    marginBottom: 4,
  });

  const getDescriptionStyle = (isSelected: boolean): TextStyle => ({
    fontSize: 12,
    color: isSelected ? COLORS.text.primary : COLORS.text.secondary,
    textAlign: 'center',
  });

  return (
    <View style={containerStyle}>
      <Text style={titleStyle}>Je suis un :</Text>
      
      <View style={optionsContainerStyle}>
        {roleOptions.map((option) => {
          const isSelected = selectedRole === option.value;
          
          return (
            <TouchableOpacity
              key={option.value}
              style={getOptionStyle(isSelected, option.color)}
              onPress={() => onRoleChange(option.value)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={option.icon}
                size={32}
                color={getIconColor(isSelected, option.color)}
              />
              
              <Text style={getLabelStyle(isSelected, option.color)}>
                {option.label}
              </Text>
              
              <Text style={getDescriptionStyle(isSelected)}>
                {option.description}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}