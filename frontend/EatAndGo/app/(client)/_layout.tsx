import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Redirect, Tabs, router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/contexts/AuthContext';
import { useUnpaidOrderGuard } from '@/hooks/useUnpaidOrderGuard';
import {
  useAppTheme,
  useScreenType,
  getResponsiveValue,
  SPACING,
  COMPONENT_CONSTANTS,
} from '@/utils/designSystem';

// ─────────────────────────────────────────────────────────────────────────
// Rouge d'urgence stable, identique en light et en dark.
// Pour un bandeau d'alerte critique on veut une couleur ALARMANTE qui ne
// dépende pas du thème — l'utilisateur doit comprendre tout de suite qu'il
// y a un problème. On garde donc ce rouge profond hors palette thématique.
// ─────────────────────────────────────────────────────────────────────────
const URGENCY_RED = '#B91C1C';

// =============================================================================
// BANDEAU COMMANDE IMPAYÉE
// =============================================================================

function UnpaidOrderBanner({
  unpaidCount,
  onPress,
}: {
  unpaidCount: number;
  onPress: () => void;
}) {
  const screenType = useScreenType();
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: URGENCY_RED,
        paddingHorizontal: getResponsiveValue(SPACING.md, screenType),
        paddingVertical: getResponsiveValue(
          { mobile: 10, tablet: 12, desktop: 14 },
          screenType,
        ),
        gap: getResponsiveValue(SPACING.sm, screenType),
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: 'rgba(255,255,255,0.2)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="alert-circle" size={20} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: '#fff',
            fontWeight: '700',
            fontSize: getResponsiveValue(
              { mobile: 13, tablet: 14, desktop: 15 },
              screenType,
            ),
          }}
        >
          {t('order.unpaidTitle', { count: unpaidCount })}
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: getResponsiveValue(
              { mobile: 11, tablet: 12, desktop: 13 },
              screenType,
            ),
            marginTop: 2,
          }}
        >
          {t('order.unpaidSubtitle')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
    </Pressable>
  );
}

// =============================================================================
// LAYOUT PRINCIPAL
// =============================================================================

export default function ClientLayout() {
  const { user, isClient } = useAuth();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { hasUnpaid, unpaidCount } = useUnpaidOrderGuard();

  // Rediriger vers l'interface restaurant si pas client
  if (user && !isClient) {
    return <Redirect href="/(restaurant)" />;
  }

  // Configuration responsive pour les tabs — theme-aware
  const tabBarConfig = useMemo(
    () => ({
      activeTintColor: colors.primary,
      inactiveTintColor: colors.text.secondary,
      style: {
        height:
          getResponsiveValue(COMPONENT_CONSTANTS.tabBarHeight, screenType) +
          insets.bottom +
          (screenType === 'mobile' ? 4 : 6),
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
        elevation: screenType === 'mobile' ? 8 : 4,
        shadowColor: colors.shadow.default,
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      labelStyle: {
        fontSize: getResponsiveValue(
          { mobile: 10, tablet: 12, desktop: 14 },
          screenType,
        ),
        fontWeight: '500' as const,
        marginTop: screenType === 'mobile' ? 2 : 4,
      },
      iconStyle: {},
    }),
    [colors, screenType, insets.bottom, insets.left, insets.right],
  );

  // Taille des icônes responsive
  const iconSize = getResponsiveValue(
    { mobile: 24, tablet: 26, desktop: 28 },
    screenType,
  );

  // Pour tablette en paysage, utiliser un layout différent si nécessaire
  const isTabletLandscape = screenType === 'tablet' && width > 1000;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Bandeau commande impayée ─────────────────────────────────── */}
      {hasUnpaid && (
        <View style={{ paddingTop: insets.top, backgroundColor: URGENCY_RED }}>
          <UnpaidOrderBanner
            unpaidCount={unpaidCount}
            onPress={() => router.navigate('/(client)/orders')}
          />
        </View>
      )}

      <Tabs
        screenOptions={{
          tabBarActiveTintColor: tabBarConfig.activeTintColor,
          tabBarInactiveTintColor: tabBarConfig.inactiveTintColor,
          tabBarStyle: tabBarConfig.style,
          tabBarLabelStyle: tabBarConfig.labelStyle,
          tabBarIconStyle: tabBarConfig.iconStyle,
          headerShown: false,
          tabBarHideOnKeyboard: screenType === 'mobile',
          tabBarAllowFontScaling: false,
          tabBarItemStyle: {
            paddingVertical: screenType === 'mobile' ? 4 : 8,
          },
        }}
      >
        {/* Scanner — masqué si commande impayée */}
        <Tabs.Screen
          name="index"
          options={{
            title: t('nav.scanner'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'qr-code' : 'qr-code-outline'}
                size={iconSize}
                color={color}
              />
            ),
            tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
            href: hasUnpaid ? null : undefined,
          }}
        />

        {/* <Tabs.Screen
          name="browse"
          options={{
            title: t('nav.restaurants'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'restaurant' : 'restaurant-outline'}
                size={iconSize}
                color={color}
              />
            ),
            tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
          }}
        /> */}

        {/* Commandes — toujours accessible + badge */}
        <Tabs.Screen
          name="orders"
          options={{
            title: t('nav.orders'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'receipt' : 'receipt-outline'}
                size={iconSize}
                color={color}
              />
            ),
            tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
            tabBarBadge: hasUnpaid ? unpaidCount : undefined,
            tabBarBadgeStyle: hasUnpaid
              ? { backgroundColor: URGENCY_RED, color: '#fff', fontSize: 10 }
              : undefined,
          }}
        />

        {/* Panier — masqué si commande impayée */}
        <Tabs.Screen
          name="cart"
          options={{
            title: t('nav.cart'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'bag' : 'bag-outline'}
                size={iconSize}
                color={color}
              />
            ),
            tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
            href: hasUnpaid ? null : undefined,
          }}
        />

        {/* Profil — toujours accessible */}
        <Tabs.Screen
          name="profile"
          options={{
            title: t('nav.profile'),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'person' : 'person-outline'}
                size={iconSize}
                color={color}
              />
            ),
            tabBarLabelPosition: isTabletLandscape ? 'beside-icon' : 'below-icon',
          }}
        />
      </Tabs>
    </View>
  );
}