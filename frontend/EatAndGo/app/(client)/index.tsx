import React from 'react';
import { 
  View, 
  Text,
  Pressable, 
  StatusBar,
  Platform,
  useWindowDimensions,
  ScrollView
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
  BORDER_RADIUS,
  SHADOWS 
} from '@/utils/designSystem';

export default function ClientHome() {
  const { user } = useAuth();
  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  
  const statusBarHeight = Platform.OS === 'ios' ? insets.top : StatusBar.currentHeight || 0;
  
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    headerSpacing: getResponsiveValue(SPACING.xl, screenType),
    contentMaxWidth: screenType === 'desktop' ? 700 : screenType === 'tablet' ? 600 : undefined,
    isTabletLandscape: screenType === 'tablet' && width > 900,
    shouldUseGrid: (screenType === 'tablet' && width > 900) || screenType === 'desktop',
  };

  const viewStyles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    
    scrollContainer: {
      flexGrow: 1,
      paddingTop: insets.top,
      paddingBottom: Math.max(insets.bottom, 20),
    },
    
    header: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingTop: layoutConfig.headerSpacing,
      paddingBottom: getResponsiveValue(SPACING.lg, screenType),
      alignItems: 'center' as const,
      maxWidth: layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    
    // Badge décoratif doré
    decorativeBadge: {
      position: 'absolute' as const,
      top: getResponsiveValue({ mobile: -8, tablet: -10, desktop: -12 }, screenType),
      right: getResponsiveValue({ mobile: -8, tablet: -10, desktop: -12 }, screenType),
      width: getResponsiveValue({ mobile: 60, tablet: 70, desktop: 80 }, screenType),
      height: getResponsiveValue({ mobile: 60, tablet: 70, desktop: 80 }, screenType),
      borderRadius: 999,
      backgroundColor: COLORS.variants.secondary[50],
      opacity: 0.4,
    },
    
    titleContainer: {
      position: 'relative' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    content: {
      paddingHorizontal: layoutConfig.containerPadding,
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      maxWidth: layoutConfig.shouldUseGrid ? 1200 : layoutConfig.contentMaxWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    
    qrSection: {
      marginBottom: getResponsiveValue(
        { mobile: SPACING['2xl'].mobile, tablet: SPACING.xl.tablet, desktop: SPACING['2xl'].desktop },
        screenType
      ),
    },
    
    quickActions: {
      flex: layoutConfig.shouldUseGrid ? 1 : undefined,
    },
    
    sectionTitle: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
    },
    
    sectionTitleLine: {
      flex: 1,
      height: 2,
      backgroundColor: COLORS.border.golden,
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
      opacity: 0.3,
    },
    
    quickActionButton: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      backgroundColor: COLORS.surface,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderRadius: BORDER_RADIUS.xl,
      marginBottom: getResponsiveValue(SPACING.md, screenType),
      minHeight: getResponsiveValue(
        { mobile: 70, tablet: 84, desktop: 96 },
        screenType
      ),
      borderWidth: 1.5,
      borderColor: COLORS.border.light,
      ...SHADOWS.md,
      overflow: 'hidden' as const,
    },
    
    quickActionGradient: {
      position: 'absolute' as const,
      top: 0,
      right: 0,
      width: '40%' as const,
      height: '100%' as const,
      opacity: 0.05,
    },
    
    quickActionIconContainer: {
      width: getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType),
      height: getResponsiveValue({ mobile: 48, tablet: 56, desktop: 64 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 12, tablet: 14, desktop: 16 }, screenType),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginRight: getResponsiveValue(SPACING.md, screenType),
    },
    
    quickActionContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      flex: 1,
    },
    
    quickActionTextContainer: {
      flex: 1,
    },
    
    chevronContainer: {
      width: getResponsiveValue({ mobile: 28, tablet: 32, desktop: 36 }, screenType),
      height: getResponsiveValue({ mobile: 28, tablet: 32, desktop: 36 }, screenType),
      borderRadius: getResponsiveValue({ mobile: 14, tablet: 16, desktop: 18 }, screenType),
      backgroundColor: COLORS.background,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },

    gridLayout: {
      flexDirection: layoutConfig.shouldUseGrid ? 'row' as const : 'column' as const,
      gap: layoutConfig.shouldUseGrid 
        ? getResponsiveValue({ mobile: SPACING.xl.mobile, tablet: SPACING['2xl'].tablet, desktop: SPACING['3xl'].desktop }, screenType)
        : 0,
      alignItems: layoutConfig.shouldUseGrid ? 'flex-start' as const : 'stretch' as const,
    },

    gridColumn: {
      flex: 1,
      minWidth: layoutConfig.shouldUseGrid ? '45%' as const : undefined,
      maxWidth: layoutConfig.shouldUseGrid ? '50%' as const : undefined,
    },

    welcomeCard: {
      backgroundColor: COLORS.goldenSurface,
      borderRadius: BORDER_RADIUS.xl,
      padding: getResponsiveValue(SPACING.lg, screenType),
      borderWidth: 1,
      borderColor: COLORS.border.golden,
      marginBottom: getResponsiveValue(
        { mobile: SPACING.lg.mobile, tablet: SPACING.xl.tablet, desktop: SPACING.xl.desktop },
        screenType
      ),
      ...SHADOWS.sm,
      maxWidth: screenType === 'tablet' ? 500 : undefined,
      alignSelf: 'center' as const,
      width: screenType === 'tablet' ? '100%' as const : undefined,
    },
  };

  const textStyles = {
    logo: {
      fontSize: getResponsiveValue(
        { mobile: 32, tablet: 40, desktop: 48 },
        screenType
      ),
      color: COLORS.primary,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
      textAlign: 'center' as const,
    },
    
    logoAccent: {
      color: COLORS.secondary,
    },
    
    subtitle: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 16, desktop: 18 },
        screenType
      ),
      color: COLORS.text.secondary,
      marginTop: getResponsiveValue(SPACING.xs, screenType),
      textAlign: 'center' as const,
      fontWeight: '400' as const,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    
    welcome: {
      fontSize: getResponsiveValue(
        { mobile: 15, tablet: 17, desktop: 19 },
        screenType
      ),
      color: COLORS.text.primary,
      textAlign: 'center' as const,
      fontWeight: '600' as const,
    },
    
    welcomeSubtext: {
      fontSize: getResponsiveValue(
        { mobile: 13, tablet: 14, desktop: 15 },
        screenType
      ),
      color: COLORS.text.secondary,
      textAlign: 'center' as const,
      marginTop: 4,
    },
    
    quickActionsTitle: {
      fontSize: getResponsiveValue(
        { mobile: 18, tablet: 22, desktop: 26 },
        screenType
      ),
      fontWeight: '700' as const,
      color: COLORS.text.primary,
    },
    
    quickActionButtonText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text.primary,
      fontWeight: '600' as const,
      marginBottom: 2,
    },
    
    quickActionSubtext: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text.secondary,
      fontWeight: '400' as const,
    },
  };

  const iconSize = getResponsiveValue(
    { mobile: 26, tablet: 30, desktop: 34 },
    screenType
  );

  const chevronSize = getResponsiveValue(
    { mobile: 18, tablet: 20, desktop: 22 },
    screenType
  );

  const quickActions = [
    // {
    //   id: 'browse',
    //   icon: 'restaurant-outline',
    //   title: 'Parcourir les restaurants',
    //   subtitle: 'Découvrez nos établissements',
    //   route: '/(client)/browse',
    //   iconBg: COLORS.variants.primary[50],
    //   iconColor: COLORS.primary,
    // },
    {
      id: 'orders',
      icon: 'receipt-outline',
      title: 'Mes commandes',
      subtitle: 'Suivez vos commandes',
      route: '/(client)/orders',
      iconBg: COLORS.variants.secondary[50],
      iconColor: COLORS.secondary,
    },
    {
      id: 'cart',
      icon: 'bag-outline',
      title: 'Mon panier',
      subtitle: 'Finalisez votre achat',
      route: '/(client)/cart',
      iconBg: '#ECFDF5',
      iconColor: COLORS.success,
    },
  ];

  return (
    <View style={viewStyles.container}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor={COLORS.background} 
        translucent={false}
      />
      
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={viewStyles.scrollContainer}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <View style={viewStyles.header}>
          <View style={viewStyles.titleContainer}>
            <View style={viewStyles.decorativeBadge} />
            <Text style={textStyles.logo}>
              Eat<Text style={textStyles.logoAccent}></Text>QuickeR
            </Text>
            <Text style={textStyles.subtitle}>Commandez facilement</Text>
          </View>
          
          {user && (
            <View style={viewStyles.welcomeCard}>
              <Text style={textStyles.welcome}>
                Bonjour {user.first_name || user.username} ! 👋
              </Text>
              <Text style={textStyles.welcomeSubtext}>
                Prêt(e) à commander aujourd'hui ?
              </Text>
            </View>
          )}
        </View>

        <View style={viewStyles.content}>
          <View style={layoutConfig.shouldUseGrid ? viewStyles.gridLayout : undefined}>
            
            <View style={[
              viewStyles.qrSection,
              layoutConfig.shouldUseGrid ? viewStyles.gridColumn : undefined
            ]}>
              <QRAccessButtons />
            </View>

            <View style={[
              viewStyles.quickActions,
              layoutConfig.shouldUseGrid ? viewStyles.gridColumn : undefined
            ]}>
              <View style={viewStyles.sectionTitle}>
                <Text style={textStyles.quickActionsTitle}>Actions rapides</Text>
                <View style={viewStyles.sectionTitleLine} />
              </View>
              
              {quickActions.map((action) => (
                <Pressable 
                  key={action.id}
                  style={({ pressed }) => [
                    viewStyles.quickActionButton,
                    {
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                      opacity: pressed ? 0.9 : 1,
                    }
                  ]}
                  onPress={() => router.push(action.route as any)}
                  android_ripple={{ 
                    color: COLORS.primary + '15',
                    borderless: false 
                  }}
                >
                  <View style={[
                    viewStyles.quickActionGradient,
                    { backgroundColor: action.iconColor }
                  ]} />
                  
                  <View style={viewStyles.quickActionContent}>
                    <View style={[
                      viewStyles.quickActionIconContainer,
                      { backgroundColor: action.iconBg }
                    ]}>
                      <Ionicons 
                        name={action.icon as any}
                        size={iconSize} 
                        color={action.iconColor}
                      />
                    </View>
                    
                    <View style={viewStyles.quickActionTextContainer}>
                      <Text style={textStyles.quickActionButtonText}>
                        {action.title}
                      </Text>
                      <Text style={textStyles.quickActionSubtext}>
                        {action.subtitle}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={viewStyles.chevronContainer}>
                    <Ionicons 
                      name="chevron-forward" 
                      size={chevronSize} 
                      color={COLORS.text.secondary}
                    />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}