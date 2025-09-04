// styles/modernRestaurantMenuStyles.ts
import { StyleSheet } from 'react-native';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
  COMPONENT_CONSTANTS,
  getResponsiveValue,
} from '@/utils/designSystem';

type ScreenType = 'mobile' | 'tablet' | 'desktop';

export const createRestaurantMenuStyles = (screenType: ScreenType) => {
  const gv = (token: any): number => getResponsiveValue(token, screenType) as number;

  return StyleSheet.create({
    // ===========================================
    // LAYOUT PRINCIPAL
    // ===========================================
    page: { 
      flex: 1,
      backgroundColor: COLORS.background,
    },

    container: { 
      paddingHorizontal: gv(SPACING.md), 
      paddingBottom: gv(SPACING.xl), 
      maxWidth: 1200, 
      alignSelf: 'center', 
      width: '100%' 
    },

    // ===========================================
    // HERO SECTION - RESTAURANT INFO
    // ===========================================
    hero: { 
      marginTop: gv(SPACING.md), 
      marginBottom: gv(SPACING.md) 
    },

    cover: { 
      width: '100%', 
      aspectRatio: 16 / 9, 
      backgroundColor: COLORS.border.light, 
      borderRadius: BORDER_RADIUS.lg 
    },

    heroContent: { 
      paddingTop: gv(SPACING.sm) 
    },

    heroTitle: { 
      fontSize: gv(TYPOGRAPHY.fontSize.xl), 
      fontWeight: '700', 
      color: COLORS.text.primary 
    },

    heroMetaRow: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginTop: gv(SPACING.xs) 
    },

    heroBadgesRow: { 
      flexDirection: 'row', 
      gap: gv(SPACING.xs), 
      flexWrap: 'wrap' 
    },

    badge: { 
      backgroundColor: COLORS.surface, 
      borderRadius: BORDER_RADIUS.full, 
      paddingHorizontal: 10, 
      paddingVertical: 4 
    },

    badgeText: { 
      fontSize: gv(TYPOGRAPHY.fontSize.sm), 
      color: COLORS.text.secondary 
    },

    tableBadge: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 6, 
      backgroundColor: COLORS.primary, 
      borderRadius: BORDER_RADIUS.full, 
      paddingHorizontal: 10, 
      paddingVertical: 4 
    },

    tableBadgeText: { 
      color: COLORS.text.inverse, 
      fontWeight: '600' 
    },

    heroDesc: { 
      marginTop: gv(SPACING.sm), 
      color: COLORS.text.secondary, 
      lineHeight: 20 
    },

    readMore: { 
      color: COLORS.primary, 
      marginTop: 6, 
      fontWeight: '600' 
    },

    // ===========================================
    // STICKY NAVIGATION - CATEGORIES
    // ===========================================
    stickyNav: { 
      position: 'sticky' as any, 
      top: 0, 
      zIndex: 5, 
      backgroundColor: COLORS.background, 
      borderBottomWidth: 1, 
      borderBottomColor: COLORS.border.light, 
      marginBottom: gv(SPACING.sm), 
      paddingVertical: gv(SPACING.xs)
    },
    
    stickyNavContent: { 
      paddingHorizontal: gv(SPACING.md), 
      paddingVertical: gv(SPACING.xs), 
      gap: gv(SPACING.sm) 
    },
    
    navPill: { 
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: gv(SPACING.md), 
      paddingVertical: gv(SPACING.sm), 
      borderRadius: BORDER_RADIUS.full, 
      backgroundColor: COLORS.surface, 
      shadowColor: COLORS.shadow.default,
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2, // Android
    },
    
    navPillActive: { 
      backgroundColor: COLORS.primary 
    },
    
    navPillText: { 
      color: COLORS.text.secondary, 
      fontWeight: '600',
      fontSize: gv(14)
    },
    
    navPillTextActive: { 
      color: COLORS.text.inverse 
    },
    
    categoryIcon: { 
      marginRight: gv(SPACING.xs), 
      fontSize: gv(14)
    },

    // ===========================================
    // ACTIONS ROW - CATEGORIES & FILTERS
    // ===========================================
    actionsRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      gap: gv(SPACING.sm), 
      marginBottom: gv(SPACING.sm) 
    },

    categoriesContent: { 
      paddingVertical: gv(SPACING.sm), 
      gap: gv(SPACING.xs) 
    },

    categoryButton: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      paddingHorizontal: 12, 
      paddingVertical: 10, 
      borderRadius: BORDER_RADIUS.full, 
      backgroundColor: COLORS.surface, 
      minHeight: COMPONENT_CONSTANTS.minTouchTarget 
    },

    categoryButtonActive: { 
      backgroundColor: COLORS.primary 
    },

    categoryText: { 
      color: COLORS.text.secondary, 
      fontWeight: '600' 
    },

    categoryTextActive: { 
      color: COLORS.text.inverse 
    },

    fadeRight: { 
      width: 28, 
      marginLeft: -28, 
      backgroundColor: 'transparent' 
    },

    filterButton: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      paddingHorizontal: 12, 
      paddingVertical: 10, 
      borderRadius: BORDER_RADIUS.full, 
      backgroundColor: COLORS.surface, 
      minHeight: COMPONENT_CONSTANTS.minTouchTarget 
    },

    filterButtonText: { 
      color: COLORS.text.primary, 
      fontWeight: '600' 
    },

    filterButtonActive: {
      backgroundColor: COLORS.variants.primary[50],
      borderWidth: 1,
      borderColor: COLORS.primary,
    },

    filterButtonTextActive: {
      color: COLORS.primary,
    },

    // ===========================================
    // PANNEAU DE FILTRES
    // ===========================================
    filtersPanel: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: gv(SPACING.lg),
      marginBottom: gv(SPACING.md),
      ...SHADOWS.md,
    },

    filtersPanelHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: gv(SPACING.md),
    },

    filtersPanelTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      fontWeight: '600',
      color: COLORS.text.primary,
    },

    clearFiltersText: {
      color: COLORS.primary,
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      fontWeight: '500',
    },

    filterOptions: {
      gap: gv(SPACING.sm),
    },

    filterOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: gv(SPACING.md),
      paddingHorizontal: gv(SPACING.md),
      backgroundColor: COLORS.background,
      borderRadius: BORDER_RADIUS.md,
      minHeight: COMPONENT_CONSTANTS.minTouchTarget,
    },

    filterOptionText: {
      fontSize: gv(TYPOGRAPHY.fontSize.base),
      color: COLORS.text.primary,
    },

    // ===========================================
    // GRID ET LAYOUT ITEMS
    // ===========================================
    grid: { 
      flexDirection: 'row', 
      flexWrap: 'wrap', 
      gap: gv(SPACING.sm) 
    },

    gridItem: {
      flex: screenType === 'desktop' ? 0 : 1,
      minWidth: screenType === 'desktop' ? '48%' : '100%',
    },

    // ===========================================
    // CARDS MENU ITEMS (MODERNE)
    // ===========================================
    card: { 
      backgroundColor: COLORS.surface, 
      borderRadius: BORDER_RADIUS.lg, 
      padding: gv(SPACING.md), 
      ...SHADOWS.sm 
    },

    menuItemRow: { 
      flexDirection: 'row', 
      gap: gv(SPACING.md) 
    },

    menuItemThumb: { 
      width: 84, 
      height: 84, 
      borderRadius: BORDER_RADIUS.md, 
      backgroundColor: COLORS.border.light 
    },

    menuItemCol: { 
      flex: 1 
    },

    menuItemHeaderRow: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'flex-start', 
      marginBottom: gv(SPACING.xs) 
    },

    menuItemName: { 
      fontSize: gv(TYPOGRAPHY.fontSize.lg), 
      color: COLORS.text.primary, 
      fontWeight: '700' 
    },

    menuItemPrice: { 
      fontWeight: '700', 
      color: COLORS.primary,
      fontSize: gv(TYPOGRAPHY.fontSize.md)
    },

    menuItemDescription: { 
      color: COLORS.text.secondary, 
      marginBottom: gv(SPACING.xs),
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      lineHeight: gv(TYPOGRAPHY.fontSize.sm) * 1.4
    },

    // ===========================================
    // TAGS ET BADGES
    // ===========================================
    tagsRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      flexWrap: 'wrap' 
    },

    tag: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 6, 
      backgroundColor: COLORS.variants?.primary?.[100] ?? COLORS.border.light, 
      borderRadius: BORDER_RADIUS.full, 
      paddingHorizontal: 10, 
      paddingVertical: 4 
    },

    tagText: { 
      color: COLORS.primary, 
      fontSize: gv(TYPOGRAPHY.fontSize.sm), 
      fontWeight: '600' 
    },

    // Tags diététiques spécialisés
    dietaryTagVegan: {
      backgroundColor: '#DCFCE7',
    },

    dietaryTagVegetarian: {
      backgroundColor: '#FEF3C7',
    },

    dietaryTagGlutenFree: {
      backgroundColor: '#FECACA',
    },

    // ===========================================
    // GESTION ALLERGÈNES
    // ===========================================
    allergenToggle: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 6, 
      paddingHorizontal: 10, 
      paddingVertical: 4, 
      borderRadius: BORDER_RADIUS.full, 
      backgroundColor: COLORS.surface 
    },

    allergenToggleText: { 
      color: COLORS.text.secondary, 
      fontWeight: '600' 
    },

    allergenChipsRow: { 
      flexDirection: 'row', 
      flexWrap: 'wrap', 
      gap: 6, 
      marginTop: gv(SPACING.xs) 
    },

    allergenChip: { 
      backgroundColor: COLORS.border.light, 
      paddingHorizontal: 8, 
      paddingVertical: 4, 
      borderRadius: BORDER_RADIUS.full 
    },

    allergenChipText: { 
      color: COLORS.text.secondary, 
      fontSize: gv(TYPOGRAPHY.fontSize.sm) 
    },

    // ===========================================
    // FOOTER ET ACTIONS
    // ===========================================
    menuItemFooterRow: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginTop: gv(SPACING.sm) 
    },

    categoryBadge: { 
      backgroundColor: COLORS.background, 
      borderRadius: BORDER_RADIUS.full, 
      paddingHorizontal: 10, 
      paddingVertical: 4 
    },

    categoryBadgeText: {
      fontSize: gv(TYPOGRAPHY.fontSize.xs),
      color: COLORS.text.secondary,
      fontWeight: '500',
    },

    // ===========================================
    // BOUTONS
    // ===========================================
    addToCartButton: {
      marginTop: gv(SPACING.sm),
      minHeight: COMPONENT_CONSTANTS.minTouchTarget,
    },

    unavailableContainer: {
      marginTop: gv(SPACING.sm),
      padding: gv(SPACING.sm),
      backgroundColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
    },

    unavailableText: {
      color: COLORS.text.secondary,
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
    },

    // ===========================================
    // PANIER FLOTTANT
    // ===========================================
    cartButton: {
      position: 'absolute',
      left: gv(SPACING.md),
      right: gv(SPACING.md),
      backgroundColor: COLORS.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: gv(SPACING.md),
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: COMPONENT_CONSTANTS.minTouchTarget,
      ...SHADOWS.xl,
    },

    cartButtonText: {
      color: COLORS.text.primary,
      fontSize: gv(TYPOGRAPHY.fontSize.md),
      fontWeight: '600',
    },

    cartButtonSubtext: {
      color: COLORS.text.primary,
      fontSize: gv(TYPOGRAPHY.fontSize.sm),
      opacity: 0.9,
    },

    // ===========================================
    // SECTIONS ET ORGANISATEURS
    // ===========================================
    categorySection: {
      marginBottom: gv(SPACING.xl),
    },

    sectionTitle: {
      fontSize: gv(TYPOGRAPHY.fontSize.xl),
      fontWeight: '700',
      color: COLORS.text.primary,
      marginBottom: gv(SPACING.md),
    },

    subCategorySection: {
      marginTop: 12,
    },
    subSectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 8,
    },

    // ===========================================
    // ÉTATS VIDES
    // ===========================================
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: gv(SPACING['4xl']),
    },

    emptyText: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      color: COLORS.text.secondary,
      textAlign: 'center',
    },

    emptyStateContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: gv(SPACING['4xl']),
      paddingHorizontal: gv(SPACING.lg),
    },

    emptyStateText: {
      fontSize: gv(TYPOGRAPHY.fontSize.lg),
      color: COLORS.text.secondary,
      textAlign: 'center',
      marginTop: gv(SPACING.md),
      marginBottom: gv(SPACING.md),
    },

    resetFiltersButton: {
      marginTop: gv(SPACING.md),
    },

    resetFiltersText: {
      color: COLORS.secondary,
      fontSize: gv(TYPOGRAPHY.fontSize.md),
      fontWeight: '500',
    },
  });
};