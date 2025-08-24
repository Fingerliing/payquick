// utils/responsive.ts
import { useWindowDimensions, PixelRatio } from 'react-native';
import { BREAKPOINTS, SPACING } from '@/styles/tokens';

// Types pour la responsivité
export type DeviceType = 'mobile' | 'tablet' | 'desktop';
export type OrientationType = 'portrait' | 'landscape';

export interface ResponsiveValue<T> {
  mobile?: T;
  tablet?: T;
  desktop?: T;
}

// Hook principal pour la responsivité
export const useResponsive = () => {
  const { width, height } = useWindowDimensions();
  const pixelDensity = PixelRatio.get();
  
  // Détection du type d'appareil
  const deviceType: DeviceType = 
    width >= BREAKPOINTS.desktop ? 'desktop' :
    width >= BREAKPOINTS.tablet ? 'tablet' : 'mobile';
    
  const orientation: OrientationType = width > height ? 'landscape' : 'portrait';
  
  // Helpers booléens
  const isMobile = deviceType === 'mobile';
  const isTablet = deviceType === 'tablet';
  const isDesktop = deviceType === 'desktop';
  const isLandscape = orientation === 'landscape';
  const isPortrait = orientation === 'portrait';
  
  // Détection de tablette en mode portrait (pour UI adaptée)
  const isTabletPortrait = isTablet && isPortrait;
  const isTabletLandscape = isTablet && isLandscape;
  
  // Taille d'écran spécifique
  const isSmallScreen = width < 375;  // iPhone SE et plus petits
  const isLargeScreen = width > 414;  // iPhone Pro Max et plus grands
  
  // Fonction pour obtenir une valeur responsive
  const getResponsiveValue = <T>(
    mobileValue: T,
    tabletValue?: T,
    desktopValue?: T
  ): T => {
    if (isDesktop && desktopValue !== undefined) return desktopValue;
    if (isTablet && tabletValue !== undefined) return tabletValue;
    return mobileValue;
  };
  
  // Fonction pour l'espacement responsive
  const getSpacing = (
    mobile: number,
    tablet?: number,
    desktop?: number
  ): number => {
    return getResponsiveValue(mobile, tablet, desktop);
  };
  
  // Fonction pour les tailles de police responsive
  const getFontSize = (
    mobile: number,
    tablet?: number,
    desktop?: number
  ): number => {
    const baseSize = getResponsiveValue(mobile, tablet, desktop);
    
    // Ajustement selon la densité de pixels pour une meilleure lisibilité
    const scaleFactor = isMobile ? 
      (pixelDensity > 2 ? 1 : 1.05) : // Légèrement plus grand sur les écrans moins denses
      1;
      
    return Math.round(baseSize * scaleFactor);
  };
  
  // Fonction pour les colonnes responsive (pour grilles)
  const getColumns = (): number => {
    if (isDesktop) return 4;
    if (isTablet) return isLandscape ? 3 : 2;
    return isLandscape ? 2 : 1;
  };
  
  // Fonction pour la largeur des modales/cartes
  const getModalWidth = (): number => {
    if (isDesktop) return Math.min(600, width * 0.8);
    if (isTablet) return width * 0.85;
    return width * 0.95;
  };
  
  // Fonction pour la hauteur du header responsive
  const getHeaderHeight = (): number => {
    return getResponsiveValue(
      SPACING.headerHeight.mobile,
      SPACING.headerHeight.tablet,
      SPACING.headerHeight.desktop
    );
  };
  
  // Fonction pour les marges de container
  const getContainerPadding = (): number => {
    return getResponsiveValue(
      SPACING.container.mobile,
      SPACING.container.tablet,
      SPACING.container.desktop
    );
  };
  
  // Fonction pour la largeur maximale du contenu
  const getMaxContentWidth = (): number => {
    if (isDesktop) return 1200;
    if (isTablet) return width * 0.9;
    return width;
  };
  
  // Fonction pour les styles de grille
  const getGridStyles = () => {
    const columns = getColumns();
    const gap = getSpacing(SPACING.sm, SPACING.md, SPACING.lg);
    
    return {
      columns,
      gap,
      itemWidth: (width - (getContainerPadding() * 2) - (gap * (columns - 1))) / columns,
    };
  };
  
  // Fonction pour les safe areas dynamiques
  const getSafeAreaPadding = () => {
    // Valeurs typiques pour les safe areas sur différents appareils
    const topSafeArea = isMobile ? (isLandscape ? 0 : 44) : 0;
    const bottomSafeArea = isMobile ? (isLandscape ? 21 : 34) : 0;
    
    return {
      top: topSafeArea,
      bottom: bottomSafeArea,
      left: isLandscape && isMobile ? 44 : 0,
      right: isLandscape && isMobile ? 44 : 0,
    };
  };
  
  // Styles adaptatifs pour les boutons
  const getButtonStyles = (size: 'sm' | 'md' | 'lg' = 'md') => {
    const baseHeight = SPACING.buttonHeight[size];
    const padding = getSpacing(SPACING.md, SPACING.lg, SPACING.xl);
    
    return {
      height: baseHeight,
      paddingHorizontal: padding,
      borderRadius: getResponsiveValue(6, 8, 10),
    };
  };
  
  // Styles adaptatifs pour les inputs
  const getInputStyles = (size: 'sm' | 'md' | 'lg' = 'md') => {
    const baseHeight = SPACING.inputHeight[size];
    const padding = getSpacing(SPACING.md, SPACING.lg, SPACING.xl);
    
    return {
      height: baseHeight,
      paddingHorizontal: padding,
      borderRadius: getResponsiveValue(6, 8, 10),
    };
  };
  
  return {
    // Informations sur l'appareil
    width,
    height,
    deviceType,
    orientation,
    pixelDensity,
    
    // Helpers booléens
    isMobile,
    isTablet,
    isDesktop,
    isLandscape,
    isPortrait,
    isTabletPortrait,
    isTabletLandscape,
    isSmallScreen,
    isLargeScreen,
    
    // Fonctions utilitaires
    getResponsiveValue,
    getSpacing,
    getFontSize,
    getColumns,
    getModalWidth,
    getHeaderHeight,
    getContainerPadding,
    getMaxContentWidth,
    getGridStyles,
    getSafeAreaPadding,
    getButtonStyles,
    getInputStyles,
  };
};

// Hook spécialisé pour les animations responsive
export const useResponsiveAnimations = () => {
  const { isMobile, isTablet } = useResponsive();
  
  // Durées d'animation adaptées selon l'appareil
  const getAnimationDuration = (base: number): number => {
    if (isMobile) return base * 0.8; // Plus rapide sur mobile
    if (isTablet) return base * 0.9; // Légèrement plus rapide sur tablette
    return base; // Normal sur desktop
  };
  
  // Types d'easing selon l'appareil
  const getEasing = () => {
    return isMobile ? 'ease-out' : 'ease-in-out';
  };
  
  return {
    getAnimationDuration,
    getEasing,
    
    // Durées prédéfinies
    durations: {
      fast: getAnimationDuration(150),
      normal: getAnimationDuration(250),
      slow: getAnimationDuration(400),
    },
  };
};

// Helper pour créer des styles responsive
export const createResponsiveStyle = <T>(
  styles: ResponsiveValue<T>
): ((deviceType: DeviceType) => T | undefined) => {
  return (deviceType: DeviceType) => {
    switch (deviceType) {
      case 'desktop':
        return styles.desktop || styles.tablet || styles.mobile;
      case 'tablet':
        return styles.tablet || styles.mobile;
      case 'mobile':
      default:
        return styles.mobile;
    }
  };
};

// Helper pour les media queries simulées
export const matchesBreakpoint = (width: number, breakpoint: keyof typeof BREAKPOINTS): boolean => {
  return width >= BREAKPOINTS[breakpoint];
};

// Helper pour les styles conditionnels par taille d'écran
export const whenScreen = {
  mobile: (styles: any) => (deviceType: DeviceType) => 
    deviceType === 'mobile' ? styles : {},
  tablet: (styles: any) => (deviceType: DeviceType) => 
    deviceType === 'tablet' ? styles : {},
  desktop: (styles: any) => (deviceType: DeviceType) => 
    deviceType === 'desktop' ? styles : {},
  tabletAndUp: (styles: any) => (deviceType: DeviceType) => 
    ['tablet', 'desktop'].includes(deviceType) ? styles : {},
  mobileOnly: (styles: any) => (deviceType: DeviceType) => 
    deviceType === 'mobile' ? styles : {},
};