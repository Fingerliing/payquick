import React from 'react';
import { View, Text, Pressable, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, useScreenType, createResponsiveStyles, COMPONENT_CONSTANTS } from '@/utils/designSystem';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  leftIcon?: string;
  rightIcon?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  backgroundColor?: string;
  includeSafeArea?: boolean; // Option pour inclure ou non la safe area
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton = false,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  backgroundColor = COLORS.surface,
  includeSafeArea = true,
}) => {
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
    width: 40,
    alignItems: 'flex-end',
  };

  const titleContainerStyle: ViewStyle = {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8, // Un peu d'espace pour éviter la collision avec les boutons
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
                name={(leftIcon || 'arrow-back') as any}
                size={24}
                color={COLORS.text.primary}
              />
            </Pressable>
          )}
        </View>
        
        {/* Titre */}
        <View style={titleContainerStyle}>
          <Text style={{
            fontSize: screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16,
            fontWeight: '600',
            color: COLORS.text.primary,
            textAlign: 'center',
            lineHeight: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 22 : 20,
          }}>
            {title}
          </Text>
        </View>
        
        {/* Bouton droit */}
        <View style={rightContainerStyle}>
          {rightIcon && (
            <Pressable
              onPress={onRightPress}
              style={buttonStyle}
              android_ripple={{ color: COLORS.border.default, borderless: true }}
            >
              <Ionicons
                name={rightIcon as any}
                size={24}
                color={COLORS.text.primary}
              />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};