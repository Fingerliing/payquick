import React from 'react';
import { 
  View, 
  Text,
  ViewStyle, 
  Pressable, 
  PressableProps,
  Platform 
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

// Types pour une meilleure gestion TypeScript
type SpacingKey = keyof typeof SPACING;
type SpacingValue = typeof SPACING[SpacingKey];

interface CardProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outlined' | 'filled' | 'glass';
  padding?: SpacingKey | number;
  margin?: SpacingKey | number;
  style?: ViewStyle;
  pressable?: boolean;
  fullWidth?: boolean;
  borderRadius?: keyof typeof RADIUS;
  shadow?: keyof typeof SHADOWS;
  backgroundColor?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  margin,
  style,
  pressable = false,
  fullWidth = true,
  borderRadius,
  shadow,
  backgroundColor,
  ...props
}) => {
  const { getSpacing, isMobile, isTablet } = useResponsive();
  
  // ✅ FONCTION HELPER POUR GÉRER LES VALEURS SPACING CORRIGÉE
  const getSpacingValue = (spacingKey: SpacingKey | number): number => {
    if (typeof spacingKey === 'number') {
      return spacingKey;
    }
    
    const spacingValue = SPACING[spacingKey];
    
    // Si c'est un nombre simple (xs, sm, md, lg, xl, xxl, xxxl)
    if (typeof spacingValue === 'number') {
      return getSpacing(spacingValue, spacingValue * 1.25, spacingValue * 1.5);
    }
    
    // Si c'est un objet, on vérifie ses propriétés avec des assertions de type
    if (spacingValue && typeof spacingValue === 'object') {
      // Type assertion pour les objets responsive avec mobile/tablet/desktop
      const responsiveSpacing = spacingValue as any;
      
      if ('mobile' in responsiveSpacing && typeof responsiveSpacing.mobile === 'number') {
        const mobile = responsiveSpacing.mobile;
        const tablet = responsiveSpacing.tablet || mobile * 1.25;
        const desktop = responsiveSpacing.desktop || mobile * 1.5;
        return getSpacing(mobile, tablet, desktop);
      }
      
      // Type assertion pour les objets avec sm/md/lg (buttonHeight, inputHeight)
      if ('md' in responsiveSpacing && typeof responsiveSpacing.md === 'number') {
        const md = responsiveSpacing.md;
        return getSpacing(md, md * 1.25, md * 1.5);
      }
      
      // Pour les objets avec sm/md/lg comme buttonHeight
      if ('sm' in responsiveSpacing && 'md' in responsiveSpacing && 'lg' in responsiveSpacing) {
        const sm = responsiveSpacing.sm || 36;
        const md = responsiveSpacing.md || 48;
        const lg = responsiveSpacing.lg || 56;
        return getSpacing(sm, md, lg);
      }
    }
    
    // Fallback sûr
    return getSpacing(SPACING.md, SPACING.lg, SPACING.xl);
  };

  // ✅ CALCUL DU PADDING ET MARGE SIMPLIFIÉS
  const paddingValue = getSpacingValue(padding);
  const marginValue = margin ? getSpacingValue(margin) : 0;

  // ✅ STYLES PAR VARIANTE AVEC NOUVELLES COULEURS
  const getVariantStyles = (): ViewStyle => {
    const baseRadius = borderRadius ? RADIUS[borderRadius] : RADIUS.card;
    const baseShadow = shadow ? SHADOWS[shadow] : undefined;
    
    const baseStyle: ViewStyle = {
      borderRadius: getSpacing(baseRadius, baseRadius + 2, baseRadius + 4),
      padding: paddingValue,
      margin: marginValue,
      width: fullWidth ? '100%' : undefined,
    };

    switch (variant) {
      case 'elevated':
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || COLORS.surface.elevated,
          ...(baseShadow || SHADOWS.md),
        };

      case 'outlined':
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || COLORS.surface.primary,
          borderWidth: getSpacing(1, 1.5, 2),
          borderColor: COLORS.border.light,
        };

      case 'filled':
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || COLORS.primary_pale,
          borderWidth: 1,
          borderColor: COLORS.primary_light,
        };

      case 'glass':
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || 'rgba(255, 255, 255, 0.8)',
          ...(Platform.OS === 'ios' ? {
            backdropFilter: 'blur(10px)',
          } : {}),
          ...(baseShadow || SHADOWS.sm),
        };

      default:
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || COLORS.surface.primary,
          ...(baseShadow || SHADOWS.card),
        };
    }
  };

  const cardStyle: ViewStyle = {
    ...getVariantStyles(),
    ...style,
  };

  // États d'interaction pour les cartes pressables
  const getPressableStyle = ({ pressed }: { pressed: boolean }): ViewStyle => ({
    ...cardStyle,
    transform: [{ scale: pressed ? 0.98 : 1 }],
    opacity: pressed ? 0.95 : 1,
  });

  if (pressable) {
    return (
      <Pressable 
        style={getPressableStyle}
        android_ripple={{
          color: COLORS.states.pressed,
          borderless: false,
        }}
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

// ✅ VARIANTES SPÉCIALISÉES DE CARTES

// Card pour les éléments de menu/produits
export const ProductCard: React.FC<CardProps & {
  featured?: boolean;
  discount?: number;
}> = ({ featured, discount, children, ...props }) => {
  // ✅ Fusionner les styles en un seul objet ViewStyle
  const combinedStyle: ViewStyle = {
    ...(featured && {
      borderColor: COLORS.secondary,
      borderWidth: 2,
    }),
    ...(discount && {
      position: 'relative' as const,
    }),
    ...(props.style as ViewStyle),
  };

  return (
    <Card
      {...props}
      variant={featured ? 'filled' : 'default'}
      style={combinedStyle}
    >
      {discount && (
        <View style={{
          position: 'absolute',
          top: -8,
          right: -8,
          backgroundColor: COLORS.secondary,
          borderRadius: RADIUS.full,
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          ...SHADOWS.sm,
        }}>
          <Text style={{
            fontSize: 10,
            fontWeight: TYPOGRAPHY.fontWeight.bold,
            color: COLORS.text.primary,
          }}>
            -{discount}%
          </Text>
        </View>
      )}
      {children}
    </Card>
  );
};

// Card pour les restaurants
export const RestaurantCard: React.FC<CardProps & {
  isOpen?: boolean;
  rating?: number;
}> = ({ isOpen, rating, children, ...props }) => {
  const { getSpacing } = useResponsive();
  
  // ✅ Fusionner les styles en un seul objet ViewStyle
  const combinedStyle: ViewStyle = {
    ...(!isOpen && {
      opacity: 0.7,
      backgroundColor: COLORS.neutral[100],
    }),
    ...(props.style as ViewStyle),
  };
  
  return (
    <Card
      {...props}
      pressable
      style={combinedStyle}
    >
      <View style={{ position: 'relative' }}>
        {/* Badge de statut */}
        <View style={{
          position: 'absolute',
          top: -getSpacing(SPACING.md),
          right: -getSpacing(SPACING.md),
          flexDirection: 'row',
          gap: getSpacing(SPACING.xs, SPACING.sm),
          zIndex: 1,
        }}>
          {rating && (
            <View style={{
              backgroundColor: COLORS.success,
              borderRadius: RADIUS.sm,
              paddingHorizontal: getSpacing(SPACING.xs, SPACING.sm),
              paddingVertical: getSpacing(2, 3),
              ...SHADOWS.xs,
            }}>
              <Text style={{
                fontSize: 10,
                fontWeight: TYPOGRAPHY.fontWeight.bold,
                color: COLORS.text.white,
              }}>
                ⭐ {rating}
              </Text>
            </View>
          )}
          
          <View style={{
            backgroundColor: isOpen ? COLORS.success : COLORS.error,
            borderRadius: RADIUS.sm,
            paddingHorizontal: getSpacing(SPACING.xs, SPACING.sm),
            paddingVertical: getSpacing(2, 3),
            ...SHADOWS.xs,
          }}>
            <Text style={{
              fontSize: 10,
              fontWeight: TYPOGRAPHY.fontWeight.bold,
              color: COLORS.text.white,
            }}>
              {isOpen ? 'OUVERT' : 'FERMÉ'}
            </Text>
          </View>
        </View>
        
        {children}
      </View>
    </Card>
  );
};

// Card pour les commandes avec statut
export const OrderCard: React.FC<CardProps & {
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}> = ({ status, priority, children, ...props }) => {
  const getStatusColor = () => {
    switch (status) {
      case 'pending': return COLORS.warning;
      case 'confirmed': return COLORS.primary;
      case 'preparing': return COLORS.secondary;
      case 'ready': return COLORS.success;
      case 'delivered': return COLORS.success;
      case 'cancelled': return COLORS.error;
      default: return COLORS.neutral[400];
    }
  };

  const getPriorityStyle = (): ViewStyle => {
    if (!priority || priority === 'normal') return {};
    
    const colors = {
      low: COLORS.neutral[300],
      high: COLORS.warning,
      urgent: COLORS.error,
    };
    
    return {
      borderLeftWidth: 4,
      borderLeftColor: colors[priority],
    };
  };

  // ✅ Fusionner les styles en un seul objet ViewStyle
  const combinedStyle: ViewStyle = {
    ...getPriorityStyle(),
    ...(props.style as ViewStyle),
  };

  return (
    <Card
      {...props}
      style={combinedStyle}
    >
      <View style={{ position: 'relative' }}>
        {/* Barre de statut */}
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: getStatusColor(),
          borderRadius: RADIUS.xs,
        }} />
        
        <View style={{ paddingTop: SPACING.sm }}>
          {children}
        </View>
      </View>
    </Card>
  );
};

// Card pour les statistiques
export const StatCard: React.FC<CardProps & {
  trend?: 'up' | 'down' | 'stable';
}> = ({ trend, children, ...props }) => {
  const getTrendColor = () => {
    switch (trend) {
      case 'up': return COLORS.success;
      case 'down': return COLORS.error;
      case 'stable': return COLORS.warning;
      default: return COLORS.neutral[400];
    }
  };

  // ✅ Fusionner les styles en un seul objet ViewStyle
  const combinedStyle: ViewStyle = {
    position: 'relative',
    overflow: 'hidden',
    ...(props.style as ViewStyle),
  };

  return (
    <Card
      {...props}
      variant="elevated"
      style={combinedStyle}
    >
      {trend && (
        <View style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderLeftWidth: 20,
          borderTopWidth: 20,
          borderLeftColor: 'transparent',
          borderTopColor: getTrendColor(),
        }} />
      )}
      {children}
    </Card>
  );
};

// Export pour compatibilité
export { Card as default };