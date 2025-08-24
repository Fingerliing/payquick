// components/layout/ResponsiveLayout.tsx
import React from 'react';
import { 
  View, 
  Text,
  Pressable,
  ViewStyle, 
  ScrollView, 
  Dimensions,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS, TYPOGRAPHY } from '@/styles/tokens';
import { useResponsive } from '@/utils/responsive';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  variant?: 'split' | 'centered' | 'full' | 'sidebar';
  maxWidth?: number;
  sidebar?: React.ReactNode;
  sidebarWidth?: number;
  backgroundColor?: string;
  padding?: boolean;
  scrollable?: boolean;
  style?: ViewStyle;
}

// Layout principal responsive qui s'adapte selon la taille d'écran
export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  variant = 'full',
  maxWidth,
  sidebar,
  sidebarWidth = 300,
  backgroundColor = COLORS.background,
  padding = true,
  scrollable = false,
  style,
}) => {
  const { 
    width, 
    isMobile, 
    isTablet, 
    isDesktop, 
    getContainerPadding, 
    getMaxContentWidth,
    isLandscape 
  } = useResponsive();

  const containerPadding = padding ? getContainerPadding() : 0;
  const contentMaxWidth = maxWidth || getMaxContentWidth();

  // Styles de base du container
  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor,
    ...style,
  };

  // Rendu selon la variante
  const renderContent = () => {
    switch (variant) {
      case 'split':
        return renderSplitLayout();
      case 'centered':
        return renderCenteredLayout();
      case 'sidebar':
        return renderSidebarLayout();
      default:
        return renderFullLayout();
    }
  };

  // Layout pleine largeur
  const renderFullLayout = () => {
    const ContentWrapper = scrollable ? ScrollView : View;
    
    return (
      <ContentWrapper
        style={{ flex: 1 }}
        contentContainerStyle={scrollable ? {
          flexGrow: 1,
          paddingHorizontal: containerPadding,
        } : {
          flex: 1,
          paddingHorizontal: containerPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ContentWrapper>
    );
  };

  // Layout centré avec largeur maximale
  const renderCenteredLayout = () => {
    const ContentWrapper = scrollable ? ScrollView : View;
    
    return (
      <ContentWrapper
        style={{ flex: 1 }}
        contentContainerStyle={scrollable ? {
          flexGrow: 1,
          paddingHorizontal: containerPadding,
          alignItems: 'center',
        } : {
          flex: 1,
          paddingHorizontal: containerPadding,
          alignItems: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{
          width: '100%',
          maxWidth: contentMaxWidth,
          flex: scrollable ? undefined : 1,
        }}>
          {children}
        </View>
      </ContentWrapper>
    );
  };

  // Layout avec sidebar (uniquement tablette/desktop)
  const renderSidebarLayout = () => {
    if (isMobile || !sidebar) {
      return renderFullLayout();
    }

    const ContentWrapper = scrollable ? ScrollView : View;
    
    return (
      <View style={{ 
        flex: 1, 
        flexDirection: isTablet && !isLandscape ? 'column' : 'row',
      }}>
        {/* Sidebar */}
        <View style={{
          width: isTablet && !isLandscape ? '100%' : sidebarWidth,
          height: isTablet && !isLandscape ? 200 : '100%',
          backgroundColor: COLORS.surface.primary,
          borderRightWidth: isTablet && isLandscape ? 1 : 0,
          borderBottomWidth: isTablet && !isLandscape ? 1 : 0,
          borderColor: COLORS.border.light,
          ...SHADOWS.sm,
        }}>
          {sidebar}
        </View>

        {/* Contenu principal */}
        <ContentWrapper
          style={{ flex: 1 }}
          contentContainerStyle={scrollable ? {
            flexGrow: 1,
            paddingHorizontal: containerPadding,
          } : {
            flex: 1,
            paddingHorizontal: containerPadding,
          }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ContentWrapper>
      </View>
    );
  };

  // Layout split pour tablettes (master-detail)
  const renderSplitLayout = () => {
    if (isMobile) {
      return renderFullLayout();
    }

    // Sur tablette, afficher en split vertical ou horizontal selon l'orientation
    const isVerticalSplit = isTablet && !isLandscape;
    
    return (
      <View style={{ 
        flex: 1, 
        flexDirection: isVerticalSplit ? 'column' : 'row',
      }}>
        {Array.isArray(children) ? (
          <>
            {/* Premier panneau */}
            <View style={{
              flex: isVerticalSplit ? 0.4 : 0.35,
              backgroundColor: COLORS.surface.primary,
              borderRightWidth: !isVerticalSplit ? 1 : 0,
              borderBottomWidth: isVerticalSplit ? 1 : 0,
              borderColor: COLORS.border.light,
            }}>
              {children[0]}
            </View>

            {/* Séparateur */}
            <View style={{
              width: isVerticalSplit ? '100%' : 1,
              height: isVerticalSplit ? 1 : '100%',
              backgroundColor: COLORS.border.medium,
            }} />

            {/* Deuxième panneau */}
            <View style={{
              flex: isVerticalSplit ? 0.6 : 0.65,
              backgroundColor: COLORS.background,
            }}>
              {children[1]}
            </View>
          </>
        ) : (
          <View style={{ flex: 1, padding: containerPadding }}>
            {children}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={containerStyle}>
      {renderContent()}
    </View>
  );
};

// Composant Grid responsive
interface ResponsiveGridProps {
  children: React.ReactNode;
  spacing?: number;
  minItemWidth?: number;
  maxColumns?: number;
  style?: ViewStyle;
}

export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  spacing = SPACING.md,
  minItemWidth = 250,
  maxColumns = 4,
  style,
}) => {
  const { width, getSpacing, getContainerPadding } = useResponsive();
  
  const containerPadding = getContainerPadding();
  const availableWidth = width - (containerPadding * 2);
  
  // Calcul du nombre de colonnes optimal
  const possibleColumns = Math.floor(availableWidth / minItemWidth);
  const columns = Math.min(possibleColumns, maxColumns) || 1;
  
  // Calcul de la largeur des éléments
  const totalSpacing = getSpacing(spacing) * (columns - 1);
  const itemWidth = (availableWidth - totalSpacing) / columns;

  const childrenArray = React.Children.toArray(children);

  return (
    <View style={{
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: containerPadding,
      ...style,
    }}>
      {childrenArray.map((child, index) => (
        <View
          key={index}
          style={{
            width: columns === 1 ? '100%' : itemWidth,
            marginBottom: getSpacing(spacing),
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
};

// Composant pour les sections adaptatives
interface ResponsiveSectionProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  variant?: 'default' | 'compact' | 'spaced';
  style?: ViewStyle;
}

export const ResponsiveSection: React.FC<ResponsiveSectionProps> = ({
  children,
  title,
  subtitle,
  action,
  variant = 'default',
  style,
}) => {
  const { getSpacing, getFontSize } = useResponsive();

  const getSpacingByVariant = () => {
    switch (variant) {
      case 'compact':
        return getSpacing(SPACING.md, SPACING.lg);
      case 'spaced':
        return getSpacing(SPACING.xl, SPACING.xxl);
      default:
        return getSpacing(SPACING.lg, SPACING.xl);
    }
  };

  const sectionSpacing = getSpacingByVariant();

  return (
    <View style={{
      marginBottom: sectionSpacing,
      ...style,
    }}>
      {(title || subtitle || action) && (
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: getSpacing(SPACING.md, SPACING.lg),
        }}>
          <View style={{ flex: 1 }}>
            {title && (
              <Text style={{
                fontSize: getFontSize(20, 22, 24),
                fontWeight: TYPOGRAPHY.fontWeight.bold,
                color: COLORS.text.primary,
                marginBottom: subtitle ? getSpacing(SPACING.xs, SPACING.sm) : 0,
              }}>
                {title}
              </Text>
            )}
            {subtitle && (
              <Text style={{
                fontSize: getFontSize(14, 15, 16),
                color: COLORS.text.secondary,
                lineHeight: getFontSize(20, 22, 24),
              }}>
                {subtitle}
              </Text>
            )}
          </View>
          {action && (
            <View style={{ marginLeft: getSpacing(SPACING.md, SPACING.lg) }}>
              {action}
            </View>
          )}
        </View>
      )}
      {children}
    </View>
  );
};

// Composant Tabs responsive
interface ResponsiveTabsProps {
  tabs: Array<{
    id: string;
    title: string;
    icon?: keyof typeof Ionicons.glyphMap;
    badge?: string | number;
  }>;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'pills' | 'underline' | 'buttons';
  style?: ViewStyle;
}

export const ResponsiveTabs: React.FC<ResponsiveTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  variant = 'pills',
  style,
}) => {
  const { isMobile, getSpacing, getFontSize } = useResponsive();

  const getTabStyle = (isActive: boolean) => {
    const baseStyle = {
      paddingHorizontal: getSpacing(SPACING.md, SPACING.lg),
      paddingVertical: getSpacing(SPACING.sm, SPACING.md),
      borderRadius: RADIUS.button,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: getSpacing(SPACING.xs, SPACING.sm),
    };

    switch (variant) {
      case 'underline':
        return {
          ...baseStyle,
          borderRadius: 0,
          borderBottomWidth: 2,
          borderBottomColor: isActive ? COLORS.primary : 'transparent',
          backgroundColor: 'transparent',
        };
      
      case 'buttons':
        return {
          ...baseStyle,
          backgroundColor: isActive ? COLORS.primary : COLORS.surface.secondary,
          borderWidth: 1,
          borderColor: isActive ? COLORS.primary : COLORS.border.light,
        };
      
      default: // pills
        return {
          ...baseStyle,
          backgroundColor: isActive ? COLORS.primary : COLORS.surface.secondary,
        };
    }
  };

  const getTextStyle = (isActive: boolean) => ({
    fontSize: getFontSize(14, 15, 16),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: isActive 
      ? (variant === 'underline' ? COLORS.primary : COLORS.text.white)
      : COLORS.text.secondary,
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{
        paddingHorizontal: getSpacing(SPACING.md, SPACING.lg),
        gap: getSpacing(SPACING.xs, SPACING.sm),
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        
        return (
          <Pressable
            key={tab.id}
            style={({ pressed }) => ({
              ...getTabStyle(isActive),
              opacity: pressed ? 0.8 : 1,
            })}
            onPress={() => onTabChange(tab.id)}
          >
            {tab.icon && (
              <Ionicons
                name={tab.icon}
                size={getFontSize(16, 18, 20)}
                color={isActive 
                  ? (variant === 'underline' ? COLORS.primary : COLORS.text.white)
                  : COLORS.text.secondary
                }
              />
            )}
            
            <Text style={getTextStyle(isActive)}>
              {tab.title}
            </Text>
            
            {tab.badge && (
              <View style={{
                backgroundColor: isActive ? COLORS.secondary : COLORS.primary,
                borderRadius: RADIUS.full,
                minWidth: getFontSize(16, 18, 20),
                height: getFontSize(16, 18, 20),
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: getSpacing(SPACING.xs / 2, SPACING.xs),
              }}>
                <Text style={{
                  fontSize: getFontSize(10, 11, 12),
                  fontWeight: TYPOGRAPHY.fontWeight.bold,
                  color: isActive ? COLORS.text.primary : COLORS.text.white,
                }}>
                  {String(tab.badge)}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

// Composant de navigation en fil d'Ariane responsive
interface BreadcrumbItem {
  title: string;
  onPress?: () => void;
}

interface ResponsiveBreadcrumbProps {
  items: BreadcrumbItem[];
  style?: ViewStyle;
}

export const ResponsiveBreadcrumb: React.FC<ResponsiveBreadcrumbProps> = ({
  items,
  style,
}) => {
  const { getFontSize, getSpacing } = useResponsive();

  if (items.length <= 1) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{
        paddingHorizontal: getSpacing(SPACING.md, SPACING.lg),
        alignItems: 'center',
        gap: getSpacing(SPACING.sm, SPACING.md),
      }}
    >
      {items.map((item, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {item.onPress ? (
            <Pressable
              onPress={item.onPress}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{
                fontSize: getFontSize(14, 15, 16),
                color: COLORS.primary,
                fontWeight: TYPOGRAPHY.fontWeight.medium,
              }}>
                {item.title}
              </Text>
            </Pressable>
          ) : (
            <Text style={{
              fontSize: getFontSize(14, 15, 16),
              color: COLORS.text.primary,
              fontWeight: TYPOGRAPHY.fontWeight.medium,
            }}>
              {item.title}
            </Text>
          )}
          
          {index < items.length - 1 && (
            <Ionicons
              name="chevron-forward"
              size={getFontSize(14, 16, 18)}
              color={COLORS.text.tertiary}
              style={{ marginHorizontal: getSpacing(SPACING.sm, SPACING.md) }}
            />
          )}
        </View>
      ))}
    </ScrollView>
  );
};

// Export par défaut
export default ResponsiveLayout;