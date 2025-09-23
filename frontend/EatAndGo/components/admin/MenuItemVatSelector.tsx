import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { VATCategory } from '@/types/menu';
import { VATService } from '@/services/vatService';

interface MenuItemVATSelectorProps {
  value: VATCategory;
  onChange: (category: VATCategory) => void;
  disabled?: boolean;
}

export const MenuItemVATSelector: React.FC<MenuItemVATSelectorProps> = ({
  value,
  onChange,
  disabled = false
}) => {
  const vatCategories = [
    { value: VATCategory.FOOD, label: 'Aliments - Sur place ou à emporter (10%)' },
    { value: VATCategory.DRINK_SOFT, label: 'Boissons sans alcool (10%)' },
    { value: VATCategory.DRINK_ALCOHOL, label: 'Boissons alcoolisées (20%)' },
    { value: VATCategory.PACKAGED, label: 'Produits préemballés (5,5%)' },
  ];

  const currentRate = VATService.VAT_RATES[value];
  
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Catégorie TVA</Text>
      <Picker
        selectedValue={value}
        onValueChange={onChange}
        enabled={!disabled}
        style={styles.picker}
      >
        {vatCategories.map(cat => (
          <Picker.Item 
            key={cat.value} 
            label={cat.label} 
            value={cat.value} 
          />
        ))}
      </Picker>
      <Text style={styles.info}>
        Taux appliqué: {(currentRate * 100).toFixed(1)}%
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  picker: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  info: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
});