import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Types
import { MenuItem } from '@/types/menu';

// Design System
import { COLORS, BORDER_RADIUS, SHADOWS } from '@/utils/designSystem';

const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768;

interface MenuItemCardProps {
  item: MenuItem;
  onAddToCart: (item: MenuItem) => void;
  showAllergens?: boolean;
  onToggleAllergens?: () => void;
  compact?: boolean;
}

export const MenuItemCard = React.memo(({ 
  item, 
  onAddToCart,
  showAllergens = false,
  onToggleAllergens,
  compact = false
}: MenuItemCardProps) => {
  const [showImageModal, setShowImageModal] = React.useState(false);
  const hasImage = Boolean(item.image_url);
  
  // Utiliser allergen_display s'il existe, sinon fallback sur allergens
  const displayAllergens = (item as any).allergen_display || item.allergens || [];
  const hasAllergens = displayAllergens.length > 0;

  // Layout en ligne avec image compacte
  if (compact || !hasImage) {
    return (
      <View style={styles.compactCard}>
        {/* Image thumbnail à gauche si disponible */}
        {hasImage && (
          <TouchableOpacity 
            onPress={() => setShowImageModal(true)}
            style={styles.thumbnailContainer}
          >
            <Image
              source={{ uri: item.image_url }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <View style={styles.zoomIcon}>
              <Ionicons name="expand" size={12} color="white" />
            </View>
          </TouchableOpacity>
        )}

        {/* Contenu principal */}
        <View style={[styles.compactContent, !hasImage && styles.noImageContent]}>
          {/* Nom et Prix sur la même ligne */}
          <View style={styles.headerRow}>
            <Text style={styles.compactName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.compactPrice}>
              {parseFloat(item.price).toFixed(2)}€
            </Text>
          </View>

          {/* Description courte */}
          {item.description && (
            <Text style={styles.compactDescription} numberOfLines={2}>
              {item.description}
            </Text>
          )}

          {/* Footer avec badges et bouton */}
          <View style={styles.compactFooter}>
            {/* Badges diététiques compacts */}
            <View style={styles.compactTags}>
              {item.is_vegan && (
                <View style={styles.miniTag}>
                  <Text style={styles.miniTagText}>🌱</Text>
                </View>
              )}
              {item.is_vegetarian && !item.is_vegan && (
                <View style={styles.miniTag}>
                  <Text style={styles.miniTagText}>🥗</Text>
                </View>
              )}
              {item.is_gluten_free && (
                <View style={styles.miniTag}>
                  <Text style={styles.miniTagText}>🚫🌾</Text>
                </View>
              )}
              {hasAllergens && (
                <TouchableOpacity 
                  style={styles.allergenBadge}
                  onPress={onToggleAllergens}
                >
                  <Text style={styles.allergenBadgeText}>
                    ⚠️ {displayAllergens.length}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Bouton ajouter compact */}
            {item.is_available ? (
              <TouchableOpacity
                style={styles.compactAddButton}
                onPress={() => onAddToCart(item)}
              >
                <Ionicons name="add" size={18} color="white" />
              </TouchableOpacity>
            ) : (
              <View style={styles.unavailableBadge}>
                <Text style={styles.unavailableText}>Indispo</Text>
              </View>
            )}
          </View>

          {/* Allergènes en expansion */}
          {showAllergens && hasAllergens && (
            <View style={styles.allergensExpanded}>
              {displayAllergens.map((allergen: string, index: number) => (
                <Text key={index} style={styles.allergenItem}>
                  • {allergen}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Modal d'image agrandie */}
        {hasImage && (
          <Modal
            visible={showImageModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowImageModal(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowImageModal(false)}
            >
              <View style={styles.modalContent}>
                <Image
                  source={{ uri: item.image_url! }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                <Text style={styles.modalTitle}>
                  {item.name}
                </Text>
                {item.description && (
                  <Text style={styles.modalDescription}>
                    {item.description}
                  </Text>
                )}
              </View>
            </Pressable>
          </Modal>
        )}
      </View>
    );
  }

  // Layout carte avec grande image (pour tablettes ou affichage élargi)
  return (
    <View style={styles.fullCard}>
      {/* Grande image en haut */}
      <TouchableOpacity 
        onPress={() => setShowImageModal(true)}
        style={styles.largeImageContainer}
      >
        <Image
          source={{ uri: item.image_url! }}
          style={styles.largeImage}
          resizeMode="cover"
        />
        <View style={styles.imageOverlay}>
          <View style={styles.categoryOverlay}>
            <Text style={styles.categoryOverlayText}>
              {item.category_name}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Contenu */}
      <View style={styles.fullContent}>
        {/* Header */}
        <View style={styles.fullHeader}>
          <Text style={styles.fullName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.fullPrice}>
            {parseFloat(item.price).toFixed(2)}€
          </Text>
        </View>

        {/* Description */}
        {item.description && (
          <Text style={styles.fullDescription} numberOfLines={3}>
            {item.description}
          </Text>
        )}

        {/* Tags diététiques */}
        {(item.is_vegan || item.is_vegetarian || item.is_gluten_free) && (
          <View style={styles.fullTags}>
            {item.is_vegan && (
              <View style={styles.dietTag}>
                <Text style={styles.dietTagText}>🌱 Vegan</Text>
              </View>
            )}
            {item.is_vegetarian && !item.is_vegan && (
              <View style={styles.dietTag}>
                <Text style={styles.dietTagText}>🥗 Végé</Text>
              </View>
            )}
            {item.is_gluten_free && (
              <View style={styles.dietTag}>
                <Text style={styles.dietTagText}>Sans gluten</Text>
              </View>
            )}
          </View>
        )}

        {/* Bouton ajouter */}
        {item.is_available ? (
          <TouchableOpacity
            style={styles.fullAddButton}
            onPress={() => onAddToCart(item)}
          >
            <Ionicons name="add-circle" size={20} color="white" />
            <Text style={styles.fullAddText}>Ajouter</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.fullUnavailable}>
            <Text style={styles.fullUnavailableText}>Indisponible</Text>
          </View>
        )}
      </View>

      {/* Modal d'image */}
      <Modal
        visible={showImageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowImageModal(false)}
        >
          <View style={styles.modalContent}>
            <Image
              source={{ uri: item.image_url! }}
              style={styles.modalImage}
              resizeMode="contain"
            />
            <Text style={styles.modalTitle}>
              {item.name}
            </Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  // === COMPACT CARD STYLES ===
  compactCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: 8,
    padding: 12,
    ...SHADOWS.sm,
  },
  
  thumbnailContainer: {
    position: 'relative',
    marginRight: 12,
  },
  
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
  },
  
  zoomIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: BORDER_RADIUS.sm,
    padding: 4,
  },
  
  compactContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  
  noImageContent: {
    paddingVertical: 4,
  },
  
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  
  compactName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text.primary,
    flex: 1,
    marginRight: 8,
  },
  
  compactPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  
  compactDescription: {
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  
  compactFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  compactTags: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  
  miniTag: {
    backgroundColor: COLORS.variants.primary[50],
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  
  miniTagText: {
    fontSize: 12,
  },
  
  allergenBadge: {
    backgroundColor: COLORS.warning[50],
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  
  allergenBadgeText: {
    fontSize: 11,
    color: COLORS.warning,
    fontWeight: '600',
  },
  
  compactAddButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  
  unavailableBadge: {
    backgroundColor: COLORS.error[50],
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  
  unavailableText: {
    fontSize: 11,
    color: COLORS.error,
    fontWeight: '600',
  },
  
  allergensExpanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  
  allergenItem: {
    fontSize: 12,
    color: COLORS.text.secondary,
    lineHeight: 16,
  },
  
  // === FULL CARD STYLES (avec grande image) ===
  fullCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: 12,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  
  largeImageContainer: {
    position: 'relative',
    height: 150,
  },
  
  largeImage: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.background,
  },
  
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%)',
  },
  
  categoryOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  
  categoryOverlayText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text.primary,
  },
  
  fullContent: {
    padding: 12,
  },
  
  fullHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  
  fullName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text.primary,
    flex: 1,
    marginRight: 8,
  },
  
  fullPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  
  fullDescription: {
    fontSize: 13,
    color: COLORS.text.secondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  
  fullTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  
  dietTag: {
    backgroundColor: COLORS.variants.primary[50],
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  
  dietTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  
  fullAddButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    ...SHADOWS.sm,
  },
  
  fullAddText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  
  fullUnavailable: {
    backgroundColor: COLORS.error[50],
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  
  fullUnavailableText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '600',
  },
  
  // === MODAL STYLES ===
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  
  modalContent: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  
  modalImage: {
    width: '100%',
    height: 300,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: 16,
  },
  
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  
  modalDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default MenuItemCard;