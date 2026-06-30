import { apiClient } from './api';
import type { FormuleClient } from '../types/formule';
import { logAPIError } from '../types/apiErrors';

// --------------------------------------------------------------------------
// Payloads d'écriture restaurateur (alignés sur FormuleSerializer côté backend)
// --------------------------------------------------------------------------
export interface FormuleCourseItemInput {
  menu_item: number;            // FK MenuItem
  extra_price?: number | string; // supplément (défaut 0)
  is_available?: boolean;        // défaut true
  display_order?: number;
}

export interface FormuleCourseInput {
  name: string;                 // "Entrée"
  order?: number;
  is_required?: boolean;        // défaut true
  min_choices?: number;         // défaut 1
  max_choices?: number;         // défaut 1
  items: FormuleCourseItemInput[];
}

export interface CreateFormulePayload {
  restaurant: number;
  name: string;
  description?: string;
  price: number | string;
  is_active?: boolean;
  order?: number;
  courses: FormuleCourseInput[];
}

export class FormuleService {
  /**
   * Formules ACTIVES d'un restaurant (lecture client publique).
   * `lang` résout les noms/descriptions des plats (repli français côté backend).
   */
  async getPublicFormules(
    restaurantId: number | string,
    lang?: string,
  ): Promise<FormuleClient[]> {
    try {
      const config = lang ? { params: { lang } } : undefined;
      const data = await apiClient.get(
        `/api/v1/formules/public/${restaurantId}/`,
        config,
      );
      return data as FormuleClient[];
    } catch (error: any) {
      logAPIError(error, `getPublicFormules(${restaurantId})`);
      throw error;
    }
  }

  /** Récupère une formule précise par son id (filtrée depuis la liste publique). */
  async getPublicFormuleById(
    restaurantId: number | string,
    formuleId: string,
    lang?: string,
  ): Promise<FormuleClient | null> {
    const formules = await this.getPublicFormules(restaurantId, lang);
    return formules.find((f) => f.id === formuleId) ?? null;
  }

  // ── CRUD RESTAURATEUR (auth requise) ───────────────────────────────────

  /** Liste les formules d'un restaurant pour le restaurateur (toutes, actives ou non). */
  async getRestaurantFormules(restaurantId: number | string): Promise<any[]> {
    try {
      return await apiClient.get('/api/v1/formules/', {
        params: { restaurant: restaurantId },
      });
    } catch (error: any) {
      logAPIError(error, `getRestaurantFormules(${restaurantId})`);
      throw error;
    }
  }

  /** Détail complet (crans + plats) d'une formule, pour l'édition restaurateur. */
  async getFormule(id: string): Promise<any> {
    try {
      return await apiClient.get(`/api/v1/formules/${id}/`);
    } catch (error: any) {
      logAPIError(error, `getFormule(${id})`);
      throw error;
    }
  }

  /** Crée une formule (écriture imbriquée : formule + crans + plats). */
  async createFormule(payload: CreateFormulePayload): Promise<any> {
    try {
      return await apiClient.post('/api/v1/formules/', payload);
    } catch (error: any) {
      logAPIError(error, 'createFormule');
      throw error;
    }
  }

  /** Met à jour une formule (remplace crans + plats). */
  async updateFormule(id: string, payload: CreateFormulePayload): Promise<any> {
    try {
      return await apiClient.put(`/api/v1/formules/${id}/`, payload);
    } catch (error: any) {
      logAPIError(error, `updateFormule(${id})`);
      throw error;
    }
  }

  /** Supprime une formule. */
  async deleteFormule(id: string): Promise<void> {
    try {
      await apiClient.delete(`/api/v1/formules/${id}/`);
    } catch (error: any) {
      logAPIError(error, `deleteFormule(${id})`);
      throw error;
    }
  }

  /** Active / désactive une formule sans la supprimer. */
  async toggleFormule(id: string): Promise<{ id: string; is_active: boolean }> {
    try {
      return await apiClient.post(`/api/v1/formules/${id}/toggle/`);
    } catch (error: any) {
      logAPIError(error, `toggleFormule(${id})`);
      throw error;
    }
  }
}

export const formuleService = new FormuleService();