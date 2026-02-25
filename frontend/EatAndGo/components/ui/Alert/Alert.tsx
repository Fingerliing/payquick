import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120; // Distance minimale pour déclencher la fermeture

export interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  showIcon?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  messageStyle?: TextStyle;
  onDismiss?: () => void;
  autoDismiss?: boolean;
  autoDismissDuration?: number; // en millisecondes
}

const variantConfig = {
  success: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    iconColor: '#10B981',
    titleColor: '#065F46',
    messageColor: '#047857',
    defaultIcon: 'checkmark-circle' as keyof typeof Ionicons.glyphMap,
  },
  error: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
    iconColor: '#EF4444',
    titleColor: '#991B1B',
    messageColor: '#DC2626',
    defaultIcon: 'close-circle' as keyof typeof Ionicons.glyphMap,
  },
  warning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
    iconColor: '#F59E0B',
    titleColor: '#92400E',
    messageColor: '#D97706',
    defaultIcon: 'warning' as keyof typeof Ionicons.glyphMap,
  },
  info: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    iconColor: '#3B82F6',
    titleColor: '#1E40AF',
    messageColor: '#2563EB',
    defaultIcon: 'information-circle' as keyof typeof Ionicons.glyphMap,
  },
} as const;

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  message,
  showIcon = true,
  icon,
  style,
  titleStyle,
  messageStyle,
  onDismiss,
  autoDismiss = true,
  autoDismissDuration = 5000,
}) => {
  const screenType = useScreenType();
  const config = variantConfig[variant];
  const iconToShow = icon || config.defaultIcon;

  // Animation pour le balayage
  const pan = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progressScale = useRef(new Animated.Value(1)).current;

  // Timer pour la fermeture automatique
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animation d'entrée
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: true,
      }),
    ]).start();

    // Animation de la barre de progression
    if (autoDismiss && onDismiss) {
      Animated.timing(progressScale, {
        toValue: 0,
        duration: autoDismissDuration,
        useNativeDriver: true,
      }).start();
    }

    // Timer de fermeture automatique
    if (autoDismiss && onDismiss) {
      dismissTimer.current = setTimeout(() => {
        handleDismiss();
      }, autoDismissDuration);
    }

    return () => {
      if (dismissTimer.current) {
        clearTimeout(dismissTimer.current);
      }
    };
  }, []);

  const handleDismiss = () => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pan.x, {
        toValue: SCREEN_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss?.();
    });
  };

  // Gestionnaire de balayage
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => {
        // Ne déclencher le pan que si le mouvement est principalement horizontal
        return Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 10;
      },
      onPanResponderGrant: () => {
        // Annuler le timer auto-dismiss pendant le balayage
        if (dismissTimer.current) {
          clearTimeout(dismissTimer.current);
          dismissTimer.current = null;
        }
        // Mettre en pause l'animation et figer la valeur courante proprement
        progressScale.stopAnimation();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        const shouldDismiss =
          Math.abs(gesture.dx) > SWIPE_THRESHOLD ||
          Math.abs(gesture.vx) > 0.5;

        if (shouldDismiss) {
          // Balayage vers la droite ou la gauche
          const toValue = gesture.dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH;
          Animated.parallel([
            Animated.timing(pan.x, {
              toValue,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start(() => {
            onDismiss?.();
          });
        } else {
          // Retour à la position initiale
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            friction: 8,
          }).start();

          // Redémarrer le timer auto-dismiss et l'animation de la barre
          if (autoDismiss && onDismiss) {
            // Récupérer la progression actuelle de manière typée (sans accès privé)
            progressScale.stopAnimation((currentProgress) => {
              // currentProgress est la valeur actuelle (1 → 0)
              const remainingTime = Math.max(1000, currentProgress * autoDismissDuration);

              // Reprendre l'animation de la barre
              Animated.timing(progressScale, {
                toValue: 0,
                duration: remainingTime,
                useNativeDriver: true,
              }).start();

              // Reprogrammer la fermeture
              dismissTimer.current = setTimeout(() => {
                handleDismiss();
              }, remainingTime);
            });
          }
        }
      },
    })
  ).current;

  const styles = createStyles(screenType, config);

  return (
    <Animated.View
      style={[
        styles.container,
        style,
        {
          opacity,
          transform: [
            { translateX: pan.x },
            {
              // Légère rotation pendant le balayage
              rotate: pan.x.interpolate({
                inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
                outputRange: ['-5deg', '0deg', '5deg'],
              }),
            },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.content}>
        {showIcon && (
          <View style={styles.iconContainer}>
            <Ionicons
              name={iconToShow}
              size={getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType)}
              color={config.iconColor}
            />
          </View>
        )}

        <View style={styles.textContainer}>
          {title && (
            <Text style={[styles.title, titleStyle]}>
              {title}
            </Text>
          )}
          <Text style={[styles.message, messageStyle]}>
            {message}
          </Text>
        </View>

        {/* Indicateur visuel de balayage */}
        <View style={styles.swipeIndicator}>
          <Ionicons name="swap-horizontal" size={16} color={config.borderColor} />
        </View>
      </View>

      {/* Barre de progression pour le timer */}
      {autoDismiss && (
        <View style={styles.progressBarContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: config.borderColor,
                transform: [{ scaleX: progressScale }],
              },
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
};

const createStyles = (
  screenType: 'mobile' | 'tablet' | 'desktop',
  config: typeof variantConfig[keyof typeof variantConfig]
) => {
  return StyleSheet.create({
    container: {
      backgroundColor: config.backgroundColor,
      borderLeftWidth: 4,
      borderLeftColor: config.borderColor,
      borderRadius: getResponsiveValue({ mobile: BORDER_RADIUS.md, tablet: BORDER_RADIUS.md, desktop: BORDER_RADIUS.md }, screenType),
      padding: getResponsiveValue(SPACING.md, screenType),
      marginVertical: getResponsiveValue(SPACING.xs, screenType),
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
      overflow: 'hidden',
    },
    content: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    iconContainer: {
      marginRight: getResponsiveValue(SPACING.sm, screenType),
      paddingTop: 2,
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.semibold,
      color: config.titleColor,
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
    },
    message: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: config.messageColor,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
    },
    swipeIndicator: {
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
      opacity: 0.3,
    },
    progressBarContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
    },
    progressBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '100%',
      // Remarque: RN ne gère pas officiellement transformOrigin; on l'omet.
    },
  });
};

// Composant Alert avec action (pas de balayage pour celui-ci)
export interface AlertWithActionProps extends AlertProps {
  primaryButton?: {
    text: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
  };
  secondaryButton?: {
    text: string;
    onPress: () => void;
  };
}

export const AlertWithAction: React.FC<AlertWithActionProps> = ({
  primaryButton,
  secondaryButton,
  ...alertProps
}) => {
  const screenType = useScreenType();
  const config = variantConfig[alertProps.variant || 'info'];

  const buttonStyles = createButtonStyles(screenType);

  // AlertWithAction ne doit pas avoir de balayage ni de fermeture automatique
  const modifiedAlertProps = {
    ...alertProps,
    autoDismiss: false,
  };

  return (
    <View>
      <Alert {...modifiedAlertProps} />

      {(primaryButton || secondaryButton) && (
        <View style={buttonStyles.buttonContainer}>
          {secondaryButton && (
            <View style={buttonStyles.secondaryButtonWrapper}>
              <Text
                style={buttonStyles.secondaryButton}
                onPress={secondaryButton.onPress}
              >
                {secondaryButton.text}
              </Text>
            </View>
          )}

          {primaryButton && (
            <View style={[
              buttonStyles.primaryButtonWrapper,
              primaryButton.variant === 'danger' && buttonStyles.dangerButtonWrapper
            ]}>
              <Text
                style={[
                  buttonStyles.primaryButton,
                  primaryButton.variant === 'danger' && buttonStyles.dangerButton
                ]}
                onPress={primaryButton.onPress}
              >
                {primaryButton.text}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const createButtonStyles = (screenType: 'mobile' | 'tablet' | 'desktop') => {
  return StyleSheet.create({
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
    },
    primaryButtonWrapper: {
      backgroundColor: COLORS.primary,
      borderRadius: getResponsiveValue({ mobile: BORDER_RADIUS.sm, tablet: BORDER_RADIUS.sm, desktop: BORDER_RADIUS.sm }, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    dangerButtonWrapper: {
      backgroundColor: '#EF4444',
    },
    secondaryButtonWrapper: {
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: getResponsiveValue({ mobile: BORDER_RADIUS.sm, tablet: BORDER_RADIUS.sm, desktop: BORDER_RADIUS.sm }, screenType),
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    primaryButton: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: 'white',
      textAlign: 'center',
    },
    dangerButton: {
      color: 'white',
    },
    secondaryButton: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: COLORS.text.secondary,
      textAlign: 'center',
    },
  });
};
