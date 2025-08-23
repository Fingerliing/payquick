export const SPACING = {
  // ✅ SYSTÈME 8PT GRID
  0: 0,
  1: 4,   // xs
  2: 8,   // sm  
  3: 12,
  4: 16,  // md - base pour mobile
  5: 20,
  6: 24,  // lg 
  7: 28,
  8: 32,  // xl
  10: 40,
  12: 48, // xxl
  16: 64,
  20: 80,
  24: 96,
  
  // ✅ ALIASES SÉMANTIQUES
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  
  // ✅ SPACINGS SPÉCIFIQUES RESPONSIVE
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
} as const;