import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
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

export interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  showIcon?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  messageStyle?: TextStyle;
  onPress?: () => void;
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
  onPress,
}) => {
  const screenType = useScreenType();
  const config = variantConfig[variant];
  const iconToShow = icon || config.defaultIcon;

  const styles = createStyles(screenType, config);

  return (
    <View style={[styles.container, style]}>
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
      </View>
    </View>
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
  });
};

// Composant Alert avec action
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

  return (
    <View>
      <Alert {...alertProps} />
      
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