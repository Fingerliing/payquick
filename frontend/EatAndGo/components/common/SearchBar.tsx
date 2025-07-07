import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSearch?: () => void;
  onFilter?: () => void;
  style?: ViewStyle;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = 'Rechercher...',
  value,
  onChangeText,
  onSearch,
  onFilter,
  style,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: isFocused ? '#3B82F6' : '#E5E7EB',
    ...style,
  };

  const inputStyle: TextStyle = {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    marginLeft: 8,
  };

  return (
    <View style={containerStyle}>
      <Ionicons name="search-outline" size={20} color="#6B7280" />
      
      <TextInput
        style={inputStyle}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onSubmitEditing={onSearch}
        placeholderTextColor="#9CA3AF"
        returnKeyType="search"
      />

      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={20} color="#6B7280" />
        </TouchableOpacity>
      )}

      {onFilter && (
        <TouchableOpacity onPress={onFilter} style={{ marginLeft: 8 }}>
          <Ionicons name="options-outline" size={20} color="#6B7280" />
        </TouchableOpacity>
      )}
    </View>
  );
};