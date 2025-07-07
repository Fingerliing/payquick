import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { SearchFilters } from '@/types/common';
import { CUISINE_TYPES } from '@/utils/constants';

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onApplyFilters: (filters: SearchFilters) => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  filters,
  onApplyFilters,
}) => {
  const [tempFilters, setTempFilters] = useState<SearchFilters>(filters);

  const handleApply = () => {
    onApplyFilters(tempFilters);
    onClose();
  };

  const handleReset = () => {
    setTempFilters({});
  };

  const toggleCuisine = (cuisine: string) => {
    setTempFilters(prev => ({
      ...prev,
      cuisine: prev.cuisine === cuisine ? undefined : cuisine,
    }));
  };

  const setPriceRange = (min: number, max: number) => {
    setTempFilters(prev => ({
      ...prev,
      priceRange: [min, max],
    }));
  };

  const setRating = (rating: number) => {
    setTempFilters(prev => ({
      ...prev,
      rating: prev.rating === rating ? undefined : rating,
    }));
  };

  const modalStyle: ViewStyle = {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  };

  const contentStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  };

  const headerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  };

  const sectionStyle: ViewStyle = {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  };

  const sectionTitleStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  };

  const filterButtonStyle = (selected: boolean): ViewStyle => ({
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: selected ? '#3B82F6' : '#E5E7EB',
    backgroundColor: selected ? '#3B82F6' : '#FFFFFF',
    marginRight: 8,
    marginBottom: 8,
  });

  const filterTextStyle = (selected: boolean): TextStyle => ({
    fontSize: 12,
    color: selected ? '#FFFFFF' : '#6B7280',
    fontWeight: selected ? '500' : 'normal',
  });

  const priceRanges = [
    { label: '€', min: 1, max: 1 },
    { label: '€€', min: 2, max: 2 },
    { label: '€€€', min: 3, max: 3 },
    { label: '€€€€', min: 4, max: 4 },
  ];

  const ratings = [1, 2, 3, 4, 5];

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={modalStyle}>
        <View style={contentStyle}>
          <View style={headerStyle}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
              Filtres
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView>
            {/* Type de cuisine */}
            <View style={sectionStyle}>
              <Text style={sectionTitleStyle}>Type de cuisine</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {CUISINE_TYPES.map((cuisine) => (
                  <TouchableOpacity
                    key={cuisine}
                    style={filterButtonStyle(tempFilters.cuisine === cuisine)}
                    onPress={() => toggleCuisine(cuisine)}
                  >
                    <Text style={filterTextStyle(tempFilters.cuisine === cuisine)}>
                      {cuisine}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Gamme de prix */}
            <View style={sectionStyle}>
              <Text style={sectionTitleStyle}>Gamme de prix</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {priceRanges.map((range) => (
                  <TouchableOpacity
                    key={range.label}
                    style={filterButtonStyle(
                      tempFilters.priceRange?.[0] === range.min && 
                      tempFilters.priceRange?.[1] === range.max
                    )}
                    onPress={() => setPriceRange(range.min, range.max)}
                  >
                    <Text style={filterTextStyle(
                      tempFilters.priceRange?.[0] === range.min && 
                      tempFilters.priceRange?.[1] === range.max
                    )}>
                      {range.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Note minimale */}
            <View style={sectionStyle}>
              <Text style={sectionTitleStyle}>Note minimale</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {ratings.map((rating) => (
                  <TouchableOpacity
                    key={rating}
                    style={filterButtonStyle(tempFilters.rating === rating)}
                    onPress={() => setRating(rating)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={filterTextStyle(tempFilters.rating === rating)}>
                        {rating}
                      </Text>
                      <Ionicons 
                        name="star" 
                        size={12} 
                        color={tempFilters.rating === rating ? '#FFFFFF' : '#F59E0B'} 
                        style={{ marginLeft: 2 }}
                      />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Autres options */}
            <View style={sectionStyle}>
              <Text style={sectionTitleStyle}>Autres options</Text>
              <TouchableOpacity
                style={filterButtonStyle(tempFilters.isOpen === true)}
                onPress={() => setTempFilters(prev => ({
                  ...prev,
                  isOpen: prev.isOpen ? undefined : true,
                }))}
              >
                <Text style={filterTextStyle(tempFilters.isOpen === true)}>
                  Ouvert maintenant
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={{ padding: 16, flexDirection: 'row', gap: 12 }}>
            <Button
              title="Réinitialiser"
              onPress={handleReset}
              variant="outline"
              style={{ flex: 1 }}
            />
            <Button
              title="Appliquer"
              onPress={handleApply}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};
