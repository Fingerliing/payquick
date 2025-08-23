import { Dimensions } from 'react-native';
import { BREAKPOINTS } from '@/styles/tokens/breakpoints';

export const useResponsive = () => {
  const { width, height } = Dimensions.get('window');
  
  return {
    width,
    height,
    isMobile: width < BREAKPOINTS.tablet,
    isTablet: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
    isDesktop: width >= BREAKPOINTS.desktop,
    isPortrait: height > width,
    isLandscape: width > height,
    
    // ✅ HELPERS RESPONSIVES
    getSpacing: (mobile: number, tablet?: number, desktop?: number) => {
      if (width >= BREAKPOINTS.desktop && desktop) return desktop;
      if (width >= BREAKPOINTS.tablet && tablet) return tablet;
      return mobile;
    },
    
    getFontSize: (mobile: number, tablet?: number, desktop?: number) => {
      if (width >= BREAKPOINTS.desktop && desktop) return desktop;
      if (width >= BREAKPOINTS.tablet && tablet) return tablet;
      return mobile;
    },
  };
};

// ✅ HOOK POUR ORIENTATION  
export const useOrientation = () => {
  const { width, height } = Dimensions.get('window');
  return {
    isPortrait: height > width,
    isLandscape: width > height,
  };
};