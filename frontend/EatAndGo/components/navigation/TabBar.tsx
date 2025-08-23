import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, SPACING, SHADOWS } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export const TabBar: React.FC<TabBarProps> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const { isMobile, getSpacing } = useResponsive();

  const getTabIcon = (routeName: string, focused: boolean) => {
    let iconName: keyof typeof Ionicons.glyphMap;
    
    switch (routeName) {
      case 'dashboard':
        iconName = focused ? 'home' : 'home-outline';
        break;
      case 'orders':
        iconName = focused ? 'receipt' : 'receipt-outline';
        break;
      case 'menu':
        iconName = focused ? 'restaurant' : 'restaurant-outline';
        break;
      case 'analytics':
        iconName = focused ? 'stats-chart' : 'stats-chart-outline';
        break;
      case 'profile':
        iconName = focused ? 'person' : 'person-outline';
        break;
      default:
        iconName = 'ellipse-outline';
    }
    
    return iconName;
  };

  const getTabLabel = (routeName: string) => {
    switch (routeName) {
      case 'dashboard': return 'Accueil';
      case 'orders': return 'Commandes';
      case 'menu': return 'Menu';
      case 'analytics': return 'Stats';
      case 'profile': return 'Profil';
      default: return routeName;
    }
  };

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: COLORS.surface.primary,
      paddingBottom: insets.bottom,
      paddingTop: getSpacing(SPACING.sm, SPACING.md),
      paddingHorizontal: getSpacing(SPACING.sm, SPACING.md),
      ...SHADOWS.lg,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    }}>
      {state.routes.map((route: any, index: number) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: getSpacing(SPACING.sm, SPACING.md),
            }}
          >
            <View style={{
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 32,
            }}>
              <Ionicons
                name={getTabIcon(route.name, isFocused)}
                size={isMobile ? 22 : 24}
                color={isFocused ? COLORS.primary : COLORS.text.tertiary}
              />
              
              {isMobile && (
                <Text style={{
                  fontSize: 10,
                  fontWeight: isFocused ? TYPOGRAPHY.fontWeight.semibold : TYPOGRAPHY.fontWeight.normal,
                  color: isFocused ? COLORS.primary : COLORS.text.tertiary,
                  marginTop: 2,
                }}>
                  {getTabLabel(route.name)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};