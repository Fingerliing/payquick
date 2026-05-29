/**
 * Types de la fonctionnalité d'import de menu par IA.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Statut d'un job
// ─────────────────────────────────────────────────────────────────────────────
export type MenuScanStatus =
  | 'pending'       // créé, en attente de traitement
  | 'processing'    // analyse de l'image en cours
  | 'translating'   // traduction en cours
  | 'ready'         // brouillon prêt à relire / valider
  | 'applied'       // appliqué au menu réel
  | 'failed';       // échec

/** Statuts pour lesquels un polling doit continuer. */
export const NON_TERMINAL_STATUSES: MenuScanStatus[] = [
  'pending',
  'processing',
  'translating',
];

// ─────────────────────────────────────────────────────────────────────────────
// Langues
// ─────────────────────────────────────────────────────────────────────────────
export interface ScanLanguage {
  code: string;
  label: string;
}

/** Langues cibles proposées (hors français = langue source). */
export const SUPPORTED_SCAN_LANGUAGES: ScanLanguage[] = [
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'eu', label: 'Basque' },
  { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' },
  { code: 'pt', label: 'Portugais' },
  { code: 'nl', label: 'Néerlandais' },
  { code: 'zh', label: 'Chinois' },
  { code: 'ja', label: 'Japonais' },
  { code: 'ar', label: 'Arabe' },
];

/** Langues cochées par défaut à la création d'un import. */
export const DEFAULT_SCAN_LANGUAGES = ['en', 'es', 'de', 'it'];

// ─────────────────────────────────────────────────────────────────────────────
// Structure du brouillon (`extracted_data`)
// ─────────────────────────────────────────────────────────────────────────────

/** Traductions d'un champ, indexées par code langue. */
export type ScanTranslations = Record<string, Record<string, string>>;

/** Un plat extrait. Tous les champs sont éditables par le restaurateur. */
export interface ScanDraftItem {
  name: string;
  description: string;
  /** Prix au format chaîne décimale ('12.50'), '' si non détecté. */
  price: string;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_gluten_free: boolean;
  /** Codes allergènes réglementaires (gluten, milk, eggs...). */
  allergens: string[];
  translations: ScanTranslations;
}

/** Une sous-catégorie extraite (ex: Viandes, Poissons). */
export interface ScanDraftSubCategory {
  name: string;
  order: number;
  items: ScanDraftItem[];
  translations: ScanTranslations;
}

/** Une catégorie principale extraite. */
export interface ScanDraftCategory {
  name: string;
  icon: string;
  order: number;
  /** Plats directement rattachés à la catégorie (sans sous-catégorie). */
  items: ScanDraftItem[];
  subcategories: ScanDraftSubCategory[];
  translations: ScanTranslations;
}

/** Contenu complet du brouillon éditable. */
export interface ScanExtractedData {
  categories: ScanDraftCategory[];
}

/** Charte graphique détectée par la vision. */
export interface ScanBrandingData {
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  style?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job
// ─────────────────────────────────────────────────────────────────────────────
export interface MenuScanImage {
  id: string;
  image_url: string | null;
  order: number;
  created_at: string;
}

/** Vue complète d'un job (détail + polling). */
export interface MenuScanJob {
  id: string;
  restaurant: string;
  restaurant_name: string;
  status: MenuScanStatus;
  status_display: string;
  target_languages: string[];
  extracted_data: ScanExtractedData;
  branding_data: ScanBrandingData;
  error_message: string;
  categories_count: number;
  subcategories_count: number;
  items_count: number;
  is_reviewable: boolean;
  images: MenuScanImage[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Vue allégée d'un job (listing, sans le brouillon). */
export interface MenuScanJobListItem {
  id: string;
  restaurant: string;
  restaurant_name: string;
  status: MenuScanStatus;
  status_display: string;
  categories_count: number;
  items_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Réponse de l'action `apply`
// ─────────────────────────────────────────────────────────────────────────────
export interface ApplyReport {
  categories_created: number;
  categories_reused: number;
  subcategories_created: number;
  subcategories_reused: number;
  items_created: number;
  branding_applied: boolean;
  warnings: string[];
}

export interface ApplyResponse {
  detail: string;
  report: ApplyReport;
  job: MenuScanJob;
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo locale en attente d'upload (écran de capture)
// ─────────────────────────────────────────────────────────────────────────────
export interface LocalScanPhoto {
  /** URI locale (file://...). */
  uri: string;
  /** Identifiant local stable pour les listes React. */
  key: string;
}
