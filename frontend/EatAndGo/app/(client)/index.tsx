import React from 'react';
import { 
  View, 
  Text, 
  SafeAreaView, 
  Pressable, 
  StatusBar,
  Platform,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS 
} from '@/utils/designSystem';

export default function ClientHome() {
  const { user } = useAuth();
  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  const statusBarHeight = Platform.OS === 'ios' ? insets.top : StatusBar.currentHeight || 0;
  
  // Configuration responsive pour le layout
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    headerSpacing: getResponsiveValue(SPACING.xl, screenType),
    contentMaxWidth: screenType === 'desktop' ? 600 : undefined,
    isTabletLandscape: screenType === 'tablet' && width > 1000,
  };

  const viewStyles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },
    
    scrollContainer: {
      flexGrow: 1,
    },
    
    header: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: layoutConfig.headerSpacing,
      paddingBottom: getResponsiveValue(SPACING.md, screenType),
      alignItems: 'center' as const,
      maxWidth: layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    
    content: {
      flex: 1,
      padding: layoutConfig.containerPadding,
      maxWidth: layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    
    qrSection: {
      marginBottom: getResponsiveValue(SPACING['2xl'], screenType),
    },
    
    quickActions: {
      flex: 1,
    },
    
    quickActionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      backgroundColor: COLORS.surface,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.lg,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      minHeight: getResponsiveValue(
        { mobile: 64, tablet: 80, desktop: 88 },
        screenType
      ),
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: screenType === 'mobile' ? 3 : 2,
      borderWidth: 1,
      borderColor: COLORS.border.light,
    },
    
    quickActionIcon: {
      marginRight: getResponsiveValue(SPACING.sm, screenType),
    },
    
    quickActionContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
    },
    
    chevronIcon: {
      opacity: 1,
    },

    gridLayout: {
      flexDirection: layoutConfig.isTabletLandscape || screenType === 'desktop' ? 'row' as const : 'column' as const,
    },

    gridColumn: {
      flex: 1,
      marginHorizontal: layoutConfig.isTabletLandscape || screenType === 'desktop' ? getResponsiveValue(SPACING.lg, screenType) / 2 : 0,
    },
  };

  const textStyles = {
    title: {
      fontSize: getResponsiveValue(
        { mobile: 28, tablet: 36, desktop: 42 },
        screenType
      ),
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
      fontWeight: '700' as const,
    },
    
    subtitle: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
      textAlign: 'center' as const,
    },
    
    welcome: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      fontWeight: '500' as const,
    },
    
    quickActionsTitle: {
      fontSize: getResponsiveValue(
        { mobile: 20, tablet: 24, desktop: 28 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    quickActionButtonText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.primary,
      fontWeight: '500' as const,
      textAlign: 'left' as const,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 24, tablet: 28, desktop: 32 },
    screenType
  );

  const chevronSize = getResponsiveValue(
    { mobile: 20, tablet: 24, desktop: 26 },
    screenType
  );

  return (
    <View style={viewStyles.container}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor={COLORS.background} 
        translucent={false}
      />
      
      <View style={viewStyles.scrollContainer}>
        <View style={viewStyles.header}>
          <Text style={textStyles.title}>Eat&Go</Text>
          <Text style={textStyles.subtitle}>Commandez facilement</Text>
          {user && (
            <Text style={textStyles.welcome}>
              Bonjour {user.first_name || user.username} ! 👋
            </Text>
          )}
        </View>

        <View style={viewStyles.content}>
          <View style={layoutConfig.isTabletLandscape || screenType === 'desktop' ? viewStyles.gridLayout : undefined}>
            
            <View style={[
              viewStyles.qrSection,
              layoutConfig.isTabletLandscape || screenType === 'desktop' ? viewStyles.gridColumn : undefined
            ]}>
              <QRAccessButtons />
            </View>

            <View style={[
              viewStyles.quickActions,
              layoutConfig.isTabletLandscape || screenType === 'desktop' ? viewStyles.gridColumn : undefined
            ]}>
              <Text style={textStyles.quickActionsTitle}>Actions rapides</Text>
              
              <Pressable 
                style={[viewStyles.quickActionButton, { 
                  backgroundColor: COLORS.surface,
                  borderColor: COLORS.border.light,
                }]}
                onPress={() => router.push('/(client)/browse')}
                android_ripple={{ 
                  color: COLORS.primary + '20',
                  borderless: false 
                }}
              >
                <View style={viewStyles.quickActionContent}>
                  <View style={viewStyles.quickActionIcon}>
                    <Ionicons 
                      name="restaurant-outline" 
                      size={iconSize} 
                      color={COLORS.text.secondary} 
                    />
                  </View>
                  <Text style={textStyles.quickActionButtonText}>
                    Parcourir les restaurants
                  </Text>
                </View>
                <View style={viewStyles.chevronIcon}>
                  <Ionicons 
                    name="chevron-forward" 
                    size={chevronSize} 
                    color={COLORS.text.secondary} 
                  />
                </View>
              </Pressable>
              
              <Pressable 
                style={[viewStyles.quickActionButton, {
                  backgroundColor: COLORS.surface,
                  borderColor: COLORS.border.light,
                }]}
                onPress={() => router.push('/(client)/orders')}
                android_ripple={{ 
                  color: COLORS.primary + '20',
                  borderless: false 
                }}
              >
                <View style={viewStyles.quickActionContent}>
                  <View style={viewStyles.quickActionIcon}>
                    <Ionicons 
                      name="receipt-outline" 
                      size={iconSize} 
                      color={COLORS.text.secondary} 
                    />
                  </View>
                  <Text style={textStyles.quickActionButtonText}>
                    Mes commandes
                  </Text>
                </View>
                <View style={viewStyles.chevronIcon}>
                  <Ionicons 
                    name="chevron-forward" 
                    size={chevronSize} 
                    color={COLORS.text.secondary} 
                  />
                </View>
              </Pressable>

              <Pressable 
                style={[viewStyles.quickActionButton, {
                  backgroundColor: COLORS.surface,
                  borderColor: COLORS.border.light,
                }]}
                onPress={() => router.push('/(client)/cart')}
                android_ripple={{ 
                  color: COLORS.primary + '20',
                  borderless: false 
                }}
              >
                <View style={viewStyles.quickActionContent}>
                  <View style={viewStyles.quickActionIcon}>
                    <Ionicons 
                      name="bag-outline" 
                      size={iconSize} 
                      color={COLORS.text.secondary} 
                    />
                  </View>
                  <Text style={textStyles.quickActionButtonText}>
                    Mon panier
                  </Text>
                </View>
                <View style={viewStyles.chevronIcon}>
                  <Ionicons 
                    name="chevron-forward" 
                    size={chevronSize} 
                    color={COLORS.text.secondary} 
                  />
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}