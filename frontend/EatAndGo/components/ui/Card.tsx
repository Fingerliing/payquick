import React, { useMemo } from 'react';
import {
  View,
  Text,
  ViewStyle,
  Pressable,
  PressableProps,
  StyleSheet,
} from 'react-native';

import {
  useAppTheme,
  makeShadows,
  useScreenType,
  getResponsiveValue,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  type AppColors,
} from '@/utils/designSystem';

// Bordure or quasi-invisible appliquée aux Cards en dark mode pour rappeler
// la dorure du logo sans tomber dans le clinquant.
const DARK_GOLDEN_HAIRLINE = 'rgba(212, 175, 55, 0.12)';

interface CardProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outlined' | 'surface' | 'premium';
  padding?: keyof typeof SPACING | number;
  margin?: keyof typeof SPACING | number;
  style?: ViewStyle | ViewStyle[];
  pressable?: boolean;
  fullWidth?: boolean;
  borderRadius?: keyof typeof BORDER_RADIUS;
  shadow?: keyof ReturnType<typeof makeShadows>;
  backgroundColor?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'lg',
  margin,
  style,
  pressable = false,
  fullWidth = true,
  borderRadius,
  shadow,
  backgroundColor,
  ...props
}) => {
  const screenType = useScreenType();
  const { colors, isDark } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  // Helper pour obtenir les valeurs d'espacement responsive
  const getSpacingValue = (spacingKey: keyof typeof SPACING | number): number => {
    if (typeof spacingKey === 'number') return spacingKey;
    const spacingValue = SPACING[spacingKey];
    return getResponsiveValue(spacingValue, screenType) as number;
  };

  // Calcul des valeurs d'espacement
  const paddingValue = getSpacingValue(padding);
  const marginValue = margin ? getSpacingValue(margin) : 0;

  // Styles par variante
  const getVariantStyles = (): ViewStyle => {
    const baseRadius = borderRadius ? BORDER_RADIUS[borderRadius] : BORDER_RADIUS.lg;
    const baseShadow = shadow ? shadows[shadow] : undefined;

    const baseStyle: ViewStyle = {
      borderRadius: baseRadius,
      padding: paddingValue,
      margin: marginValue,
      width: fullWidth ? '100%' : undefined,
    };

    // En dark, on ajoute systématiquement une hairline dorée très subtile pour
    // que les cartes "respirent" l'identité or de la marque sans crier.
    const darkGoldenHairline: ViewStyle = isDark
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: DARK_GOLDEN_HAIRLINE,
        }
      : {};

    switch (variant) {
      case 'elevated':
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || colors.surface,
          ...darkGoldenHairline,
          ...(baseShadow || shadows.lg),
        };

      case 'outlined':
        // Variant qui définit déjà sa propre bordure → on ne touche pas
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || colors.surface,
          borderWidth: 1,
          borderColor: colors.border.default,
        };

      case 'surface':
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || colors.background,
          borderWidth: 1,
          borderColor: colors.border.light,
        };

      case 'premium':
        // Variant déjà dédié à l'or, palette inchangée
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || colors.goldenSurface,
          borderWidth: 1,
          borderColor: colors.border.golden,
          ...(baseShadow || shadows.premiumCard),
        };

      default:
        return {
          ...baseStyle,
          backgroundColor: backgroundColor || colors.surface,
          ...darkGoldenHairline,
          ...(baseShadow || shadows.card),
        };
    }
  };

  // Helper pour fusionner les styles
  const combineStyles = (
    baseStyle: ViewStyle,
    additionalStyle?: ViewStyle | ViewStyle[],
  ): ViewStyle => {
    if (!additionalStyle) return baseStyle;
    if (Array.isArray(additionalStyle)) {
      return Object.assign({}, baseStyle, ...additionalStyle);
    }
    return { ...baseStyle, ...additionalStyle };
  };

  const cardStyle = combineStyles(getVariantStyles(), style);

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
          color: colors.overlay,
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

// ─────────────────────────────────────────────────────────────────────────
// Variantes spécialisées
// ─────────────────────────────────────────────────────────────────────────

// Card pour les éléments de menu/produits
export const ProductCard: React.FC<CardProps & {
  featured?: boolean;
  discount?: number;
}> = ({ featured, discount, children, ...props }) => {
  const screenType = useScreenType();
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  const additionalStyles: ViewStyle = {};

  if (featured) {
    additionalStyles.borderColor = colors.secondary;
    additionalStyles.borderWidth = 2;
  }

  if (discount) {
    additionalStyles.position = 'relative';
  }

  const combinedStyle = props.style
    ? Array.isArray(props.style)
      ? [...props.style, additionalStyles]
      : [props.style, additionalStyles]
    : additionalStyles;

  return (
    <Card
      {...props}
      variant={featured ? 'premium' : 'default'}
      style={combinedStyle}
    >
      {discount && (
        <View
          style={{
            position: 'absolute',
            top: -getResponsiveValue(SPACING.sm, screenType),
            right: -getResponsiveValue(SPACING.sm, screenType),
            backgroundColor: colors.secondary,
            borderRadius: BORDER_RADIUS.full,
            width: getResponsiveValue({ mobile: 32, tablet: 36, desktop: 40 }, screenType),
            height: getResponsiveValue({ mobile: 32, tablet: 36, desktop: 40 }, screenType),
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
            ...shadows.sm,
          }}
        >
          <Text
            style={{
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
              fontWeight: TYPOGRAPHY.fontWeight.bold,
              // texte foncé pour rester lisible sur fond or
              color: '#1E2A78',
            }}
          >
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
  const screenType = useScreenType();
  const { colors } = useAppTheme();
  const shadows = useMemo(() => makeShadows(colors), [colors]);

  const additionalStyles: ViewStyle = {};

  if (!isOpen) {
    additionalStyles.opacity = 0.7;
    additionalStyles.backgroundColor = colors.border.light;
  }

  const combinedStyle = props.style
    ? Array.isArray(props.style)
      ? [...props.style, additionalStyles]
      : [props.style, additionalStyles]
    : additionalStyles;

  return (
    <Card {...props} pressable style={combinedStyle}>
      <View style={{ position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            top: -getResponsiveValue(SPACING.md, screenType),
            right: -getResponsiveValue(SPACING.md, screenType),
            flexDirection: 'row',
            gap: getResponsiveValue(SPACING.xs, screenType),
            zIndex: 1,
          }}
        >
          {rating && (
            <View
              style={{
                backgroundColor: colors.success,
                borderRadius: BORDER_RADIUS.sm,
                paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
                paddingVertical: getResponsiveValue({ mobile: 2, tablet: 3, desktop: 4 }, screenType),
                ...shadows.sm,
              }}
            >
              <Text
                style={{
                  fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
                  fontWeight: TYPOGRAPHY.fontWeight.bold,
                  color: '#FFFFFF',
                }}
              >
                ⭐ {rating}
              </Text>
            </View>
          )}

          <View
            style={{
              backgroundColor: isOpen ? colors.success : colors.error,
              borderRadius: BORDER_RADIUS.sm,
              paddingHorizontal: getResponsiveValue(SPACING.xs, screenType),
              paddingVertical: getResponsiveValue({ mobile: 2, tablet: 3, desktop: 4 }, screenType),
              ...shadows.sm,
            }}
          >
            <Text
              style={{
                fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xs, screenType),
                fontWeight: TYPOGRAPHY.fontWeight.bold,
                color: '#FFFFFF',
              }}
            >
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
  const screenType = useScreenType();
  const { colors } = useAppTheme();

  const getStatusColor = () => {
    switch (status) {
      case 'pending': return colors.warning;
      case 'confirmed': return colors.primary;
      case 'preparing': return colors.secondary;
      case 'ready': return colors.success;
      case 'delivered': return colors.success;
      case 'cancelled': return colors.error;
      default: return colors.text.light;
    }
  };

  const getPriorityStyle = (): ViewStyle => {
    if (!priority || priority === 'normal') return {};

    const priorityColors = {
      low: colors.text.light,
      high: colors.warning,
      urgent: colors.error,
    };

    return {
      borderLeftWidth: getResponsiveValue({ mobile: 3, tablet: 4, desktop: 5 }, screenType),
      borderLeftColor: priorityColors[priority],
    };
  };

  const additionalStyles = getPriorityStyle();
  const combinedStyle = props.style
    ? Array.isArray(props.style)
      ? [...props.style, additionalStyles]
      : [props.style, additionalStyles]
    : additionalStyles;

  return (
    <Card {...props} style={combinedStyle}>
      <View style={{ position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: getResponsiveValue({ mobile: 3, tablet: 4, desktop: 5 }, screenType),
            backgroundColor: getStatusColor(),
            borderRadius: BORDER_RADIUS.sm,
          }}
        />

        <View style={{ paddingTop: getResponsiveValue(SPACING.sm, screenType) }}>
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
  const screenType = useScreenType();
  const { colors } = useAppTheme();

  const getTrendColor = () => {
    switch (trend) {
      case 'up': return colors.success;
      case 'down': return colors.error;
      case 'stable': return colors.warning;
      default: return colors.text.light;
    }
  };

  const additionalStyles: ViewStyle = {
    position: 'relative',
    overflow: 'hidden',
  };

  const combinedStyle = props.style
    ? Array.isArray(props.style)
      ? [...props.style, additionalStyles]
      : [props.style, additionalStyles]
    : additionalStyles;

  return (
    <Card {...props} variant="elevated" style={combinedStyle}>
      {trend && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 0,
            height: 0,
            borderLeftWidth: getResponsiveValue({ mobile: 16, tablet: 20, desktop: 24 }, screenType),
            borderTopWidth: getResponsiveValue({ mobile: 16, tablet: 20, desktop: 24 }, screenType),
            borderLeftColor: 'transparent',
            borderTopColor: getTrendColor(),
          }}
        />
      )}
      {children}
    </Card>
  );
};

// Card premium avec effets dorés
export const PremiumCard: React.FC<CardProps & {
  glowEffect?: boolean;
}> = ({ glowEffect, children, ...props }) => {
  const { colors } = useAppTheme();

  const additionalStyles: ViewStyle = {};

  if (glowEffect) {
    additionalStyles.shadowColor = colors.variants.secondary[300];
    additionalStyles.shadowOffset = { width: 0, height: 8 };
    additionalStyles.shadowOpacity = 0.3;
    additionalStyles.shadowRadius = 20;
    additionalStyles.elevation = 8;
  }

  const combinedStyle = props.style
    ? Array.isArray(props.style)
      ? [...props.style, additionalStyles]
      : [props.style, additionalStyles]
    : additionalStyles;

  return (
    <Card {...props} variant="premium" style={combinedStyle}>
      {children}
    </Card>
  );
};

// Export pour compatibilité
export { Card as default };