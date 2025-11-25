import React from 'react';
import { View, Text, Pressable, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, useScreenType, createResponsiveStyles, COMPONENT_CONSTANTS } from '@/utils/designSystem';
import { useAuth } from '@/contexts/AuthContext';

interface RightAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  badge?: string;
}

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightBadge?: string;
  rightActions?: RightAction[];
  onLeftPress?: () => void;
  onRightPress?: () => void;
  backgroundColor?: string;
  includeSafeArea?: boolean;
  showLogout?: boolean;
  logoutPosition?: 'left' | 'right';
}

export const Header: React.FC<HeaderProps> = (props) => {
  const { logout } = useAuth();
  const {
    title,
    subtitle,
    showBackButton = false,
    leftIcon,
    rightIcon,
    rightBadge,
    rightActions,
    onLeftPress,
    onRightPress,
    backgroundColor = COLORS.surface,
    includeSafeArea = true,
    showLogout = false,
    logoutPosition = 'right',
  } = props;
  const screenType = useScreenType();
  const responsiveStyles = createResponsiveStyles(screenType);
  const insets = useSafeAreaInsets();
  
  const headerHeight = COMPONENT_CONSTANTS.headerHeight[screenType];
  
  const handleLeftPress = () => {
    if (onLeftPress) {
      onLeftPress();
    } else if (showBackButton) {
      router.back();
    }
  };

  const containerStyle: ViewStyle = {
    backgroundColor,
    paddingTop: includeSafeArea ? insets.top : 0,
  };

  const headerStyle: ViewStyle = {
    height: headerHeight,
    backgroundColor,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
    flexDirection: 'row',
  };

  const buttonStyle: ViewStyle = {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  };

  const leftContainerStyle: ViewStyle = {
    width: 40,
    alignItems: 'flex-start',
  };

  const rightContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  };

  const titleContainerStyle: ViewStyle = {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  };
  
  return (
    <View style={containerStyle}>
      <View style={headerStyle}>
        {/* Bouton gauche */}
        <View style={leftContainerStyle}>
          {(showBackButton || leftIcon) && (
            <Pressable
              onPress={handleLeftPress}
              style={buttonStyle}
              android_ripple={{ color: COLORS.border.default, borderless: true }}
            >
              <Ionicons
                name={(leftIcon || 'arrow-back') as keyof typeof Ionicons.glyphMap}
                size={24}
                color={COLORS.text.primary}
              />
            </Pressable>
          )}
          {showLogout && logoutPosition === 'left' && (
            <Pressable
              onPress={logout}
              style={buttonStyle}
              android_ripple={{ color: COLORS.border.default, borderless: true }}
            >
              <Ionicons name="log-out-outline" size={24} color={COLORS.text.primary} />
            </Pressable>
          )}
        </View>
        
        {/* Titre */}
        <View style={titleContainerStyle}>
          <Text
            numberOfLines={1}
            accessibilityRole="header"
            style={{
              fontSize: screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16,
              fontWeight: '600' as const,
              color: COLORS.text.primary,
              textAlign: 'center' as const,
              lineHeight: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 22 : 20,
            }}
          >
            {title}
          </Text>

          {!!subtitle && (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 2,
                fontSize: screenType === 'desktop' ? 14 : screenType === 'tablet' ? 13 : 12,
                fontWeight: '400' as const,
                color: COLORS.text.secondary ?? COLORS.text.primary,
                textAlign: 'center' as const,
                lineHeight: screenType === 'desktop' ? 18 : screenType === 'tablet' ? 17 : 16,
              }}
            >
              {subtitle}
            </Text>
          )}
        </View>
        
        {/* Bouton droit */}
        <View style={rightContainerStyle}>
          {showLogout && logoutPosition === 'right' && (
            <Pressable
              onPress={logout}
              style={buttonStyle}
              android_ripple={{ color: COLORS.border.default, borderless: true }}
            >
              <Ionicons name="log-out-outline" size={24} color={COLORS.text.primary} />
            </Pressable>
          )}
          {rightActions && rightActions.length > 0 ? (
            rightActions.map((action, index) => (
              <Pressable
                key={index}
                onPress={action.onPress}
                disabled={action.disabled || action.loading}
                style={[
                  buttonStyle,
                  (action.disabled || action.loading) && { opacity: 0.5 },
                ]}
                android_ripple={{ color: COLORS.border.default, borderless: true }}
              >
                <Ionicons
                  name={action.icon}
                  size={24}
                  color={COLORS.text.primary}
                />
                {action.badge && (
                  <View
                    style={{
                      position: 'absolute' as const,
                      top: 2,
                      right: 2,
                      backgroundColor: COLORS.primary,
                      borderRadius: 8,
                      minWidth: 16,
                      height: 16,
                      justifyContent: 'center' as const,
                      alignItems: 'center' as const,
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: '600' as const,
                      }}
                    >
                      {action.badge}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))
          ) : rightIcon ? (
            <Pressable
              onPress={onRightPress}
              style={buttonStyle}
              android_ripple={{ color: COLORS.border.default, borderless: true }}
            >
              <Ionicons name={rightIcon} size={24} color={COLORS.text.primary} />
              {rightBadge && (
                <View
                  style={{
                    position: 'absolute' as const,
                    top: 2,
                    right: 2,
                    backgroundColor: COLORS.primary,
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    justifyContent: 'center' as const,
                    alignItems: 'center' as const,
                    paddingHorizontal: 4,
                  }}
                >
                  <Text
                    style={{
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: '600' as const,
                    }}
                  >
                    {rightBadge}
                  </Text>
                </View>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
};