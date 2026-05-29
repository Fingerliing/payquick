/**
 * Service API — Traduction automatique du menu existant.
 * 
 * Lance une traduction en masse (complète les langues manquantes des plats /
 * catégories saisis manuellement) et suit son avancement par polling.
 */
import { apiClient } from '@/services/api';

export type MenuTranslationStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface MenuTranslationReport {
  items_translated: number;
  categories_translated: number;
  subcategories_translated: number;
  languages: string[];
  skipped: number;
}

export interface MenuTranslationJob {
  id: string;
  restaurant: string;
  status: MenuTranslationStatus;
  status_display: string;
  target_languages: string[];
  progress_done: number;
  progress_total: number;
  progress_percent: number;
  report: MenuTranslationReport | Record<string, never>;
  error_message: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const BASE_PATH = '/api/v1/menu-ai/translations';

export const menuTranslationService = {
  /**
   * Lance une traduction du menu d'un restaurant.
   * @param restaurantId   Identifiant du restaurant.
   * @param targetLanguages Codes ISO (hors 'fr'). Vide -> langues par défaut.
   */
  async start(
    restaurantId: string,
    targetLanguages?: string[],
  ): Promise<MenuTranslationJob> {
    try {
      return await apiClient.post(`${BASE_PATH}/`, {
        restaurant: String(restaurantId),
        target_languages: targetLanguages ?? [],
      });
    } catch (error: any) {
      const detail =
        error?.details?.non_field_errors?.[0] ||
        error?.details?.restaurant?.[0] ||
        error?.message ||
        'Impossible de lancer la traduction.';
      throw new Error(String(detail));
    }
  },

  /** Suit l'avancement d'un job de traduction. */
  async get(jobId: string): Promise<MenuTranslationJob> {
    return apiClient.get(`${BASE_PATH}/${jobId}/`);
  },
};

export default menuTranslationService;