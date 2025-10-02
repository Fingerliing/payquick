import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Menu } from '@/types/menu';
import { 
  COLORS, 
  SHADOWS, 
  BORDER_RADIUS, 
  useScreenType, 
  createResponsiveStyles,
  COMPONENT_STYLES 
} from '@/utils/designSystem';

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
  const screenType = useScreenType();
  const styles = createResponsiveStyles(screenType);
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  
  // Fonction pour déterminer si le menu est disponible
  const isMenuAvailable = () => {
    if (typeof menu.is_available === 'boolean') {
      return menu.is_available;
    }
    if (typeof (menu as any).disponible === 'boolean') {
      return (menu as any).disponible;
    }
    return false;
  };

  const menuIsAvailable = isMenuAvailable();
  const availableItemsCount = menu.items?.filter(item => item.is_available !== false).length || 0;

  // Animation au press
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        marginHorizontal: styles.container.padding,
        marginVertical: 8,
      }}
    >
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isToggling}
        activeOpacity={0.9}
        style={{
          backgroundColor: COLORS.surface,
          borderRadius: BORDER_RADIUS.xl,
          overflow: 'hidden',
          ...SHADOWS.card,
          opacity: isToggling ? 0.7 : 1,
        }}
      >
        {/* Barre supérieure avec accent doré si actif */}
        {menuIsAvailable && (
          <View 
            style={{
              height: 3,
              backgroundColor: COLORS.secondary,
              ...SHADOWS.goldenGlow,
            }} 
          />
        )}

        {/* Contenu principal */}
        <View style={{ padding: 16 }}>
          {/* En-tête avec titre et bouton édition */}
          <View style={{ 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'flex-start',
            marginBottom: 12,
          }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{
                ...styles.textSubtitle,
                marginBottom: 4,
                color: menuIsAvailable ? COLORS.text.primary : COLORS.text.secondary,
              }}>
                {menu.name}
              </Text>
              
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons 
                    name="restaurant" 
                    size={14} 
                    color={COLORS.text.golden} 
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.textCaption}>
                    {menu.items?.length || 0} plat{(menu.items?.length || 0) > 1 ? 's' : ''}
                  </Text>
                </View>

                <Text style={{ ...styles.textCaption, color: COLORS.text.light }}>•</Text>

                <Text style={styles.textCaption}>
                  {availableItemsCount} disponible{availableItemsCount > 1 ? 's' : ''}
                </Text>
              </View>
            </View>

            {/* Badge de statut premium */}
            <View style={{
              ...COMPONENT_STYLES.statusBadge.base,
              ...(menuIsAvailable 
                ? COMPONENT_STYLES.statusBadge.premium 
                : COMPONENT_STYLES.statusBadge.cancelled
              ),
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: menuIsAvailable ? COLORS.secondary : COLORS.error,
                }} />
                <Text style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: menuIsAvailable ? COLORS.text.golden : COLORS.error,
                }}>
                  {menuIsAvailable ? 'Actif' : 'Inactif'}
                </Text>
              </View>
            </View>
          </View>

          {/* Badge "En cours" si en train de toggle */}
          {isToggling && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: COLORS.variants.secondary[50],
              borderLeftWidth: 3,
              borderLeftColor: COLORS.secondary,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: BORDER_RADIUS.md,
              marginBottom: 12,
            }}>
              <Ionicons name="hourglass-outline" size={14} color={COLORS.text.golden} />
              <Text style={{
                fontSize: 12,
                color: COLORS.text.golden,
                fontWeight: '500',
                marginLeft: 6,
              }}>
                Mise à jour en cours...
              </Text>
            </View>
          )}

          {/* Section métadonnées avec design élégant */}
          <View style={{
            backgroundColor: COLORS.background,
            borderRadius: BORDER_RADIUS.md,
            padding: 12,
            marginBottom: 12,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="calendar-outline" size={12} color={COLORS.text.light} />
                  <Text style={{ 
                    fontSize: 10, 
                    color: COLORS.text.light,
                    marginLeft: 4,
                    fontWeight: '500',
                    textTransform: 'uppercase',
                  }}>
                    Créé le
                  </Text>
                </View>
                <Text style={{ 
                  fontSize: 13, 
                  color: COLORS.text.secondary,
                  fontWeight: '500',
                }}>
                  {new Date(menu.created_at).toLocaleDateString('fr-FR', { 
                    day: 'numeric', 
                    month: 'short',
                    year: 'numeric'
                  })}
                </Text>
              </View>

              <View style={{ 
                width: 1, 
                backgroundColor: COLORS.border.default,
              }} />

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Ionicons name="time-outline" size={12} color={COLORS.text.light} />
                  <Text style={{ 
                    fontSize: 10, 
                    color: COLORS.text.light,
                    marginLeft: 4,
                    fontWeight: '500',
                    textTransform: 'uppercase',
                  }}>
                    Modifié le
                  </Text>
                </View>
                <Text style={{ 
                  fontSize: 13, 
                  color: COLORS.text.secondary,
                  fontWeight: '500',
                }}>
                  {new Date(menu.updated_at).toLocaleDateString('fr-FR', { 
                    day: 'numeric', 
                    month: 'short',
                    year: 'numeric'
                  })}
                </Text>
              </View>
            </View>
          </View>

          {/* Séparateur élégant */}
          <View style={{
            height: 1,
            backgroundColor: COLORS.border.light,
            marginBottom: 12,
          }} />

          {/* Boutons d'action avec design premium */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Bouton Éditer */}
            <TouchableOpacity
              onPress={onEdit}
              disabled={isToggling}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.variants.primary[50],
                borderWidth: 1,
                borderColor: COLORS.variants.primary[200],
                paddingVertical: 10,
                borderRadius: BORDER_RADIUS.lg,
                opacity: isToggling ? 0.5 : 1,
              }}
            >
              <Ionicons name="create-outline" size={16} color={COLORS.primary} />
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: COLORS.primary,
                marginLeft: 6,
              }}>
                Éditer
              </Text>
            </TouchableOpacity>

            {/* Bouton Toggle avec design premium */}
            <TouchableOpacity
              onPress={onToggle}
              disabled={isToggling}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: menuIsAvailable ? COLORS.error : COLORS.secondary,
                paddingVertical: 10,
                borderRadius: BORDER_RADIUS.lg,
                opacity: isToggling ? 0.5 : 1,
                ...(menuIsAvailable ? {} : SHADOWS.goldenGlow),
              }}
            >
              <Ionicons 
                name={isToggling 
                  ? "hourglass-outline" 
                  : menuIsAvailable 
                    ? "pause-circle-outline" 
                    : "play-circle-outline"
                } 
                size={16} 
                color="white" 
              />
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: 'white',
                marginLeft: 6,
              }}>
                {isToggling 
                  ? 'En cours' 
                  : menuIsAvailable 
                    ? 'Désactiver' 
                    : 'Activer'
                }
              </Text>
            </TouchableOpacity>

            {/* Bouton Supprimer compact */}
            <TouchableOpacity
              onPress={onDelete}
              disabled={isToggling}
              style={{
                backgroundColor: COLORS.variants.primary[50],
                borderWidth: 1,
                borderColor: COLORS.error,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: BORDER_RADIUS.lg,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isToggling ? 0.5 : 1,
              }}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}