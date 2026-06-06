import React, { useEffect, useMemo, useRef } from 'react';
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
  useAppTheme,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  useScreenType,
  getResponsiveValue,
  type AppColors,
} from '@/utils/designSystem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 120;

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
  autoDismissDuration?: number;
}

interface VariantConfig {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  titleColor: string;
  messageColor: string;
  defaultIcon: keyof typeof Ionicons.glyphMap;
}

// ─────────────────────────────────────────────────────────────────────────
// Variant config theme-aware
//
// En light : pastels classiques pour ne pas écraser le contenu autour.
// En dark  : fonds très sombres teintés de la couleur du variant + textes
//            clairs lumineux. Les bordures restent saturées dans les 2 modes.
// ─────────────────────────────────────────────────────────────────────────
function getVariantConfig(
  variant: 'success' | 'error' | 'warning' | 'info',
  colors: AppColors,
  isDark: boolean,
): VariantConfig {
  if (isDark) {
    switch (variant) {
      case 'success':
        return {
          backgroundColor: '#0F2E20',
          borderColor: colors.success,
          iconColor: '#6EE7B7',
          titleColor: '#A7F3D0',
          messageColor: '#6EE7B7',
          defaultIcon: 'checkmark-circle',
        };
      case 'error':
        return {
          backgroundColor: '#3A1418',
          borderColor: colors.error,
          iconColor: '#FCA5A5',
          titleColor: '#FECACA',
          messageColor: '#FCA5A5',
          defaultIcon: 'close-circle',
        };
      case 'warning':
        return {
          backgroundColor: '#2E1F08',
          borderColor: colors.warning,
          iconColor: '#FCD34D',
          titleColor: '#FDE68A',
          messageColor: '#FCD34D',
          defaultIcon: 'warning',
        };
      case 'info':
      default:
        return {
          backgroundColor: '#0F1F3A',
          borderColor: colors.info,
          iconColor: '#93C5FD',
          titleColor: '#BFDBFE',
          messageColor: '#93C5FD',
          defaultIcon: 'information-circle',
        };
    }
  }

  // LIGHT (palette d'origine)
  switch (variant) {
    case 'success':
      return {
        backgroundColor: '#ECFDF5',
        borderColor: '#10B981',
        iconColor: '#10B981',
        titleColor: '#065F46',
        messageColor: '#047857',
        defaultIcon: 'checkmark-circle',
      };
    case 'error':
      return {
        backgroundColor: '#FEF2F2',
        borderColor: '#EF4444',
        iconColor: '#EF4444',
        titleColor: '#991B1B',
        messageColor: '#DC2626',
        defaultIcon: 'close-circle',
      };
    case 'warning':
      return {
        backgroundColor: '#FFFBEB',
        borderColor: '#F59E0B',
        iconColor: '#F59E0B',
        titleColor: '#92400E',
        messageColor: '#D97706',
        defaultIcon: 'warning',
      };
    case 'info':
    default:
      return {
        backgroundColor: '#EFF6FF',
        borderColor: '#3B82F6',
        iconColor: '#3B82F6',
        titleColor: '#1E40AF',
        messageColor: '#2563EB',
        defaultIcon: 'information-circle',
      };
  }
}

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
  const { colors, isDark } = useAppTheme();
  const config = useMemo(
    () => getVariantConfig(variant, colors, isDark),
    [variant, colors, isDark],
  );
  const iconToShow = icon || config.defaultIcon;

  // Animations
  const pan = useRef(new Animated.ValueXY()).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progressScale = useRef(new Animated.Value(1)).current;

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    if (autoDismiss && onDismiss) {
      Animated.timing(progressScale, {
        toValue: 0,
        duration: autoDismissDuration,
        useNativeDriver: true,
      }).start();
    }

    if (autoDismiss && onDismiss) {
      dismissTimer.current = setTimeout(() => {
        handleDismiss();
      }, autoDismissDuration);
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);

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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => {
        return Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 10;
      },
      onPanResponderGrant: () => {
        if (dismissTimer.current) {
          clearTimeout(dismissTimer.current);
          dismissTimer.current = null;
        }
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
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            friction: 8,
          }).start();

          if (autoDismiss && onDismiss) {
            progressScale.stopAnimation((currentProgress) => {
              const remainingTime = Math.max(1000, currentProgress * autoDismissDuration);

              Animated.timing(progressScale, {
                toValue: 0,
                duration: remainingTime,
                useNativeDriver: true,
              }).start();

              dismissTimer.current = setTimeout(() => {
                handleDismiss();
              }, remainingTime);
            });
          }
        }
      },
    }),
  ).current;

  const styles = useMemo(
    () => createStyles(screenType, config, isDark),
    [screenType, config, isDark],
  );

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
            <Text style={[styles.title, titleStyle]}>{title}</Text>
          )}
          <Text style={[styles.message, messageStyle]}>{message}</Text>
        </View>

        <View style={styles.swipeIndicator}>
          <Ionicons name="swap-horizontal" size={16} color={config.borderColor} />
        </View>
      </View>

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
  config: VariantConfig,
  isDark: boolean,
) => {
  return StyleSheet.create({
    container: {
      backgroundColor: config.backgroundColor,
      borderLeftWidth: 4,
      borderLeftColor: config.borderColor,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.md, screenType),
      marginVertical: getResponsiveValue(SPACING.xs, screenType),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.4 : 0.1,
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
        screenType,
      ),
    },
    message: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.normal,
      color: config.messageColor,
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType,
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
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
    },
    progressBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '100%',
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────
// AlertWithAction — pas de balayage, pas d'auto-dismiss
// ─────────────────────────────────────────────────────────────────────────
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
  const { colors } = useAppTheme();

  const buttonStyles = useMemo(
    () => createButtonStyles(screenType, colors),
    [screenType, colors],
  );

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
            <View
              style={[
                buttonStyles.primaryButtonWrapper,
                primaryButton.variant === 'danger' && buttonStyles.dangerButtonWrapper,
              ]}
            >
              <Text
                style={[
                  buttonStyles.primaryButton,
                  primaryButton.variant === 'danger' && buttonStyles.dangerButton,
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

const createButtonStyles = (
  screenType: 'mobile' | 'tablet' | 'desktop',
  colors: AppColors,
) => {
  return StyleSheet.create({
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: getResponsiveValue(SPACING.sm, screenType),
      marginTop: getResponsiveValue(SPACING.md, screenType),
    },
    primaryButtonWrapper: {
      backgroundColor: colors.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    dangerButtonWrapper: {
      backgroundColor: colors.error,
    },
    secondaryButtonWrapper: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border.default,
      borderRadius: BORDER_RADIUS.sm,
      paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
      paddingVertical: getResponsiveValue(SPACING.sm, screenType),
    },
    primaryButton: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.inverse,
      textAlign: 'center',
    },
    dangerButton: {
      color: '#FFFFFF',
    },
    secondaryButton: {
      fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
      fontWeight: TYPOGRAPHY.fontWeight.medium,
      color: colors.text.secondary,
      textAlign: 'center',
    },
  });
};