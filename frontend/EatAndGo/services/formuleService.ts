import { apiClient } from './api';
import type { FormuleClient } from '@/types/formule';
import { logAPIError } from '@/types/apiErrors';

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
}

export const formuleService = new FormuleService();