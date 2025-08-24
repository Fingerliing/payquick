export const SPACING = {
  // Espacement de base
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  
  // Espacements spécialisés responsifs
  container: {
    mobile: 16,
    tablet: 24,
    desktop: 32,
  },
  
  section: {
    mobile: 24,
    tablet: 32,
    desktop: 48,
  },
  
  // Tailles de composants
  buttonHeight: {
    sm: 36,
    md: 48,
    lg: 56,
  },
  
  inputHeight: {
    sm: 40,
    md: 48,
    lg: 56,
  },
  
  headerHeight: {
    mobile: 56,
    tablet: 64,
    desktop: 72,
  },
  
  tabBarHeight: {
    mobile: 64,
    tablet: 72,
  },
} as const;