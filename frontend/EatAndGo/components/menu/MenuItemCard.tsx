import React from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  Image,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Types
import { Menu, MenuItem } from '@/types/menu';

// Design System
import { COLORS } from '@/utils/designSystem';

export const MenuItemCard = React.memo(({ 
  item, 
  onAddToCart, 
  styles,
  showAllergens,
  onToggleAllergens 
}: {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  styles: any;
  showAllergens: boolean;
  onToggleAllergens: () => void;
}) => {
  const [showImageModal, setShowImageModal] = React.useState(false);
  const hasImage = Boolean(item.image_url);
  
  // Utiliser allergen_display s'il existe, sinon fallback sur allergens
  const displayAllergens = (item as any).allergen_display || item.allergens || [];
  const hasAllergens = displayAllergens.length > 0;

  return (
    <View style={styles.menuItemCard}>
      {/* Header */}
      <View style={styles.menuItemHeader}>
        <View style={styles.menuItemNameContainer}>
          {hasImage ? (
            <TouchableOpacity
              onPress={() => setShowImageModal(true)}
              style={styles.menuItemNameWithPhoto}
            >
              <Text style={styles.menuItemName} numberOfLines={2}>
                {item.name}
              </Text>
              <Ionicons
                name="camera"
                size={18}
                color={COLORS.primary}
                style={styles.photoIcon}
              />
            </TouchableOpacity>
          ) : (
            <Text style={styles.menuItemName} numberOfLines={2}>
              {item.name}
            </Text>
          )}
        </View>
        
        <Text style={styles.menuItemPrice}>
          {parseFloat(item.price).toFixed(2)}€
        </Text>
      </View>

      {/* Description */}
      {item.description && (
        <Text style={styles.menuItemDescription} numberOfLines={3}>
          {item.description}
        </Text>
      )}

      {/* Tags Diététiques */}
      {(item.is_vegan || item.is_vegetarian || item.is_gluten_free) && (
        <View style={styles.dietaryTags}>
          {item.is_vegan && (
            <View style={styles.dietaryTag}>
              <Text style={styles.dietaryTagText}>🌱 Vegan</Text>
            </View>
          )}
          {item.is_vegetarian && !item.is_vegan && (
            <View style={styles.dietaryTag}>
              <Text style={styles.dietaryTagText}>🥗 Végétarien</Text>
            </View>
          )}
          {item.is_gluten_free && (
            <View style={styles.dietaryTag}>
              <Text style={styles.dietaryTagText}>🚫🌾 Sans gluten</Text>
            </View>
          )}
        </View>
      )}

      {/* Allergènes - MODIFIÉ POUR UTILISER allergen_display */}
      {hasAllergens && (
        <>
          <TouchableOpacity 
            style={styles.allergenToggle}
            onPress={onToggleAllergens}
          >
            <Ionicons 
              name={showAllergens ? "chevron-up" : "chevron-down"} 
              size={16} 
              color={COLORS.text.secondary} 
            />
            <Text style={styles.allergenToggleText}>
              Allergènes ({displayAllergens.length})
            </Text>
          </TouchableOpacity>

          {showAllergens && (
            <View style={styles.allergenChips}>
              {displayAllergens.map((allergen: string, index: number) => (
                <View key={index} style={styles.allergenChip}>
                  <Text style={styles.allergenChipText}>{allergen}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* Footer */}
      <View style={styles.menuItemFooter}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>
            {item.category_name}
          </Text>
        </View>

        {item.is_available ? (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => onAddToCart(item)}
          >
            <Ionicons name="add" size={20} color={COLORS.text.inverse} />
            <Text style={styles.addButtonText}>Ajouter</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.unavailableContainer}>
            <Text style={styles.unavailableText}>Indisponible</Text>
          </View>
        )}
      </View>

      {/* Modal d'image */}
      {hasImage && (
        <Modal
          visible={showImageModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowImageModal(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.85)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onPress={() => setShowImageModal(false)}
          >
            <Image
              source={{ uri: item.image_url! }}
              style={{ width: '90%', height: '60%', borderRadius: 12 }}
              resizeMode="contain"
            />
            <Text style={{ 
              color: 'white', 
              marginTop: 16, 
              fontSize: 18, 
              fontWeight: '600' 
            }}>
              {item.name}
            </Text>
          </Pressable>
        </Modal>
      )}
    </View>
  );
});