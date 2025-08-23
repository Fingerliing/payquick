import { COLORS } from "@/styles/tokens/colors";

export const TYPOGRAPHY = {
  // ✅ SCALE RESPONSIVE HARMONIEUSE
  fontSize: {
    xs: 12,
    sm: 14, 
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 36,
    '6xl': 48,
  },
  
  lineHeight: {
    xs: 16,
    sm: 20,
    base: 24,
    lg: 28, 
    xl: 32,
    '2xl': 32,
    '3xl': 36,
    '4xl': 40,
    '5xl': 44,
    '6xl': 56,
  },
  
  fontWeight: {
    light: '300',
    normal: '400',
    medium: '500', 
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  
  // ✅ STYLES PRÉDÉFINIS RESPONSIVE
  styles: {
    hero: {
      fontSize: 32,
      fontWeight: '700',
      lineHeight: 40,
      color: COLORS.text.primary,
    },
    
    title: {
      fontSize: 24, 
      fontWeight: '600',
      lineHeight: 32,
      color: COLORS.text.primary,
    },
    
    subtitle: {
      fontSize: 18,
      fontWeight: '500', 
      lineHeight: 28,
      color: COLORS.text.secondary,
    },
    
    body: {
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
      color: COLORS.text.primary,
    },
    
    bodySmall: {
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20, 
      color: COLORS.text.secondary,
    },
    
    caption: {
      fontSize: 12,
      fontWeight: '400',
      lineHeight: 16,
      color: COLORS.text.tertiary,
    },
    
    button: {
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 24,
    },
    
    buttonSmall: {
      fontSize: 14,
      fontWeight: '600', 
      lineHeight: 20,
    },
  },
} as const;