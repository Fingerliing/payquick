import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TYPOGRAPHY, SPACING, SHADOWS } from '@/styles/tokens';
import { useAppTheme } from '@/utils/designSystem';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '@/utils/responsive';

interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export const TabBar: React.FC<TabBarProps> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const { isMobile, getSpacing } = useResponsive();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

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
      case 'dashboard': return t('nav.home');
      case 'orders': return t('nav.orders');
      case 'menu': return t('nav.menu');
      case 'analytics': return t('nav.stats');
      case 'profile': return t('nav.profile');
      default: return routeName;
    }
  };

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: colors.surface,
      paddingBottom: insets.bottom,
      paddingTop: getSpacing(SPACING.sm, SPACING.md),
      paddingHorizontal: getSpacing(SPACING.sm, SPACING.md),
      ...SHADOWS.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border.light,
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
                color={isFocused ? colors.primary : colors.text.light}
              />
              
              {isMobile && (
                <Text style={{
                  fontSize: 10,
                  fontWeight: isFocused ? TYPOGRAPHY.fontWeight.semibold : TYPOGRAPHY.fontWeight.normal,
                  color: isFocused ? colors.primary : colors.text.light,
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