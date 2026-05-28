/**
 * Helpers multilingue + thème — Menu client.
 *
 * - Résolution des libellés de catégories / sous-catégories dans la langue
 *   choisie (les plats, eux, arrivent déjà résolus via `display_name` côté
 *   API). On garde une résolution locale pour les catégories au cas où l'API
 *   ne les résoudrait pas.
 * - Construction d'un thème d'écran à partir de la charte `RestaurantBranding`.
 */
import { COLORS } from '@/utils/designSystem';
import type {
  ApiMenuCategory,
  ApiMenuSubCategory,
  ApiRestaurantBranding,
} from '@/services/restaurantMenuService';

// ─────────────────────────────────────────────────────────────────────────────
// Langues
// ─────────────────────────────────────────────────────────────────────────────
export interface MenuLanguage {
  code: string;
  /** Libellé court affiché dans le sélecteur. */
  label: string;
  /** Drapeau emoji, purement décoratif. */
  flag: string;
}

/** Toutes les langues que le menu peut afficher (français = source). */
export const MENU_LANGUAGES: MenuLanguage[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'eu', label: 'Euskara', flag: '🏴' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
];

/** Retourne la définition d'une langue à partir de son code. */
export function getMenuLanguage(code: string): MenuLanguage {
  return MENU_LANGUAGES.find((l) => l.code === code) ?? MENU_LANGUAGES[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Résolution de traduction
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Résout un champ traduit avec repli français.
 *
 * @param translations  Dictionnaire { langue: { champ: valeur } }.
 * @param field         Nom du champ ('name', 'description').
 * @param lang          Code langue cible.
 * @param fallback      Valeur française native (repli).
 */
export function resolveTranslation(
  translations: Record<string, Record<string, string>> | undefined,
  field: string,
  lang: string,
  fallback: string,
): string {
  if (!lang || lang === 'fr' || !translations) return fallback;
  const bucket = translations[lang];
  const value = bucket?.[field];
  return value && value.trim() ? value : fallback;
}

/** Nom d'une catégorie dans la langue choisie. */
export function categoryName(cat: ApiMenuCategory, lang: string): string {
  return resolveTranslation(cat.translations, 'name', lang, cat.name);
}

/** Nom d'une sous-catégorie dans la langue choisie. */
export function subCategoryName(
  sub: ApiMenuSubCategory,
  lang: string,
): string {
  return resolveTranslation(sub.translations, 'name', lang, sub.name);
}

/**
 * Agrège toutes les langues disponibles sur l'ensemble du menu.
 * Sert à n'afficher dans le sélecteur que les langues réellement traduites.
 */
export function collectAvailableLanguages(
  itemLanguageLists: (string[] | undefined)[],
): MenuLanguage[] {
  const codes = new Set<string>(['fr']);
  itemLanguageLists.forEach((list) => {
    (list ?? []).forEach((code) => codes.add(code));
  });
  // Conserve l'ordre canonique de MENU_LANGUAGES.
  return MENU_LANGUAGES.filter((l) => codes.has(l.code));
}

// ─────────────────────────────────────────────────────────────────────────────
// Thème issu de la charte graphique
// ─────────────────────────────────────────────────────────────────────────────
export interface MenuTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  /** true si la charte vient du restaurant (et non du design system). */
  isCustom: boolean;
}

/** Thème par défaut = design system EatQuickeR. */
export const DEFAULT_MENU_THEME: MenuTheme = {
  primary: COLORS.primary,
  secondary: COLORS.variants.secondary[600],
  accent: COLORS.variants.primary[500],
  background: COLORS.background,
  text: COLORS.text.primary,
  isCustom: false,
};

/** #RRGGBB valide ? */
function isHex(value?: string): value is string {
  return !!value && /^#[0-9a-fA-F]{6}$/.test(value);
}

/**
 * Construit le thème de l'écran menu à partir de la charte du restaurant.
 * Tout champ invalide ou absent retombe sur le design system.
 */
export function buildMenuTheme(
  branding: ApiRestaurantBranding | null,
): MenuTheme {
  if (!branding) return DEFAULT_MENU_THEME;
  return {
    primary: isHex(branding.primary_color)
      ? branding.primary_color
      : DEFAULT_MENU_THEME.primary,
    secondary: isHex(branding.secondary_color)
      ? branding.secondary_color
      : DEFAULT_MENU_THEME.secondary,
    accent: isHex(branding.accent_color)
      ? branding.accent_color
      : DEFAULT_MENU_THEME.accent,
    background: isHex(branding.background_color)
      ? branding.background_color
      : DEFAULT_MENU_THEME.background,
    text: isHex(branding.text_color)
      ? branding.text_color
      : DEFAULT_MENU_THEME.text,
    isCustom: true,
  };
}
