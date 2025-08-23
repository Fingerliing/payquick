import React from 'react';
import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS, useScreenType, createResponsiveStyles, COMPONENT_CONSTANTS } from '@/utils/designSystem';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  leftIcon?: string;
  rightIcon?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  backgroundColor?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton = false,
  leftIcon,
  rightIcon,
  onLeftPress,
  onRightPress,
  backgroundColor = COLORS.surface,
}) => {
  const screenType = useScreenType();
  const responsiveStyles = createResponsiveStyles(screenType);
  
  const headerHeight = COMPONENT_CONSTANTS.headerHeight[screenType];
  
  const handleLeftPress = () => {
    if (onLeftPress) {
      onLeftPress();
    } else if (showBackButton) {
      router.back();
    }
  };
  
  return (
    <SafeAreaView style={{ backgroundColor }}>
      <View style={[
        responsiveStyles.flexRow,
        {
          height: headerHeight,
          backgroundColor,
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border.light,
        }
      ]}>
        {/* Bouton gauche */}
        <View style={{ width: 40, alignItems: 'flex-start' }}>
          {(showBackButton || leftIcon) && (
            <Pressable
              onPress={handleLeftPress}
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 20,
              }}
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
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[
            responsiveStyles.textSubtitle,
            { textAlign: 'center' }
          ]}>
            {title}
          </Text>
        </View>
        
        {/* Bouton droit */}
        <View style={{ width: 40, alignItems: 'flex-end' }}>
          {rightIcon && (
            <Pressable
              onPress={onRightPress}
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 20,
              }}
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
    </SafeAreaView>
  );
};