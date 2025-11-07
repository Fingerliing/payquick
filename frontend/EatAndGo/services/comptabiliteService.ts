import { apiClient } from './api';
import type {
  ComptabiliteSettings,
  CreateComptabiliteSettingsRequest,
  UpdateComptabiliteSettingsRequest,
  RecapitulatifTVA,
  RecapTVAFilters,
  RecapTVAPaginatedResponse,
  ExportComptable,
  ExportFilters,
  ExportPaginatedResponse,
  CreateExportRequest,
  GenerateFECRequest,
  FECGenerationResponse,
  ComptabiliteStats,
  StatsResponse,
  EcritureComptable,
  ComptabiliteValidation,
} from '@/types/comptabilite';

class ComptabiliteService {
  private baseUrl = '/comptabilite';

  // =========================================================================
  // PARAMÈTRES COMPTABLES
  // =========================================================================

  /**
   * Récupère les paramètres comptables du restaurateur connecté
   */
  async getSettings(): Promise<ComptabiliteSettings> {
    const response = await apiClient.get<ComptabiliteSettings>(`${this.baseUrl}/settings/`);
    return response;
  }

  /**
   * Crée les paramètres comptables
   */
  async createSettings(data: CreateComptabiliteSettingsRequest): Promise<ComptabiliteSettings> {
    const response = await apiClient.post<ComptabiliteSettings>(`${this.baseUrl}/settings/`, data);
    return response;
  }

  /**
   * Met à jour les paramètres comptables
   */
  async updateSettings(data: UpdateComptabiliteSettingsRequest): Promise<ComptabiliteSettings> {
    const response = await apiClient.patch<ComptabiliteSettings>(`${this.baseUrl}/settings/`, data);
    return response;
  }

  /**
   * Valide les paramètres comptables
   */
  async validateSettings(data: Partial<ComptabiliteSettings>): Promise<ComptabiliteValidation> {
    const response = await apiClient.post<ComptabiliteValidation>(
      `${this.baseUrl}/settings/validate/`,
      data
    );
    return response;
  }

  // =========================================================================
  // RÉCAPITULATIFS TVA
  // =========================================================================

  /**
   * Liste les récapitulatifs TVA avec filtres et pagination
   */
  async getRecapsTVA(
    filters?: RecapTVAFilters,
    page: number = 1,
    limit: number = 12
  ): Promise<RecapTVAPaginatedResponse> {
    const params = {
      page,
      limit,
      ...filters,
    };

    const response = await apiClient.get<RecapTVAPaginatedResponse>(
      `${this.baseUrl}/recaps-tva/`,
      { params }
    );
    return response;
  }

  /**
   * Récupère un récapitulatif TVA spécifique
   */
  async getRecapTVA(id: string): Promise<RecapitulatifTVA> {
    const response = await apiClient.get<RecapitulatifTVA>(`${this.baseUrl}/recaps-tva/${id}/`);
    return response;
  }

  /**
   * Récupère le récapitulatif TVA pour un mois donné
   */
  async getRecapTVAByMonth(year: number, month: number): Promise<RecapitulatifTVA> {
    const response = await apiClient.get<RecapitulatifTVA>(
      `${this.baseUrl}/recaps-tva/${year}/${month}/`
    );
    return response;
  }

  /**
   * Génère le récapitulatif TVA pour un mois
   */
  async generateRecapTVA(year: number, month: number): Promise<RecapitulatifTVA> {
    const response = await apiClient.post<RecapitulatifTVA>(
      `${this.baseUrl}/recaps-tva/generate/`,
      { year, month }
    );
    return response;
  }

  /**
   * Régénère le récapitulatif TVA pour un mois (écrase l'existant)
   */
  async regenerateRecapTVA(year: number, month: number): Promise<RecapitulatifTVA> {
    const response = await apiClient.post<RecapitulatifTVA>(
      `${this.baseUrl}/recaps-tva/regenerate/`,
      { year, month }
    );
    return response;
  }

  // =========================================================================
  // EXPORTS COMPTABLES
  // =========================================================================

  /**
   * Liste les exports comptables
   */
  async getExports(
    filters?: ExportFilters,
    page: number = 1,
    limit: number = 20
  ): Promise<ExportPaginatedResponse> {
    const params = {
      page,
      limit,
      ...filters,
    };

    const response = await apiClient.get<ExportPaginatedResponse>(
      `${this.baseUrl}/exports/`,
      { params }
    );
    return response;
  }

  /**
   * Récupère un export spécifique
   */
  async getExport(id: string): Promise<ExportComptable> {
    const response = await apiClient.get<ExportComptable>(`${this.baseUrl}/exports/${id}/`);
    return response;
  }

  /**
   * Crée un nouvel export
   */
  async createExport(data: CreateExportRequest): Promise<ExportComptable> {
    const response = await apiClient.post<ExportComptable>(`${this.baseUrl}/exports/`, data);
    return response;
  }

  /**
   * Télécharge un export
   */
  async downloadExport(id: string): Promise<Blob> {
    const response = await apiClient.get<Blob>(`${this.baseUrl}/exports/${id}/download/`, {
      responseType: 'blob',
    });
    return response;
  }

  /**
   * Supprime un export
   */
  async deleteExport(id: string): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/exports/${id}/`);
  }

  // =========================================================================
  // FEC (FICHIER DES ÉCRITURES COMPTABLES)
  // =========================================================================

  /**
   * Génère le FEC pour une année
   */
  async generateFEC(request: GenerateFECRequest): Promise<FECGenerationResponse> {
    const response = await apiClient.post<FECGenerationResponse>(
      `${this.baseUrl}/fec/generate/`,
      request
    );
    return response;
  }

  /**
   * Télécharge le FEC généré
   */
  async downloadFEC(year: number): Promise<Blob> {
    const response = await apiClient.get<Blob>(`${this.baseUrl}/fec/${year}/download/`, {
      responseType: 'blob',
    });
    return response;
  }

  /**
   * Valide le FEC avant génération
   */
  async validateFEC(year: number): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const response = await apiClient.post(`${this.baseUrl}/fec/validate/`, { year });
    return response;
  }

  // =========================================================================
  // ÉCRITURES COMPTABLES
  // =========================================================================

  /**
   * Liste les écritures comptables
   */
  async getEcritures(
    filters?: {
      year?: number;
      month?: number;
      journalCode?: string;
      dateDebut?: string;
      dateFin?: string;
    },
    page: number = 1,
    limit: number = 50
  ): Promise<{
    results: EcritureComptable[];
    count: number;
    page: number;
    pages: number;
  }> {
    const params = {
      page,
      limit,
      ...filters,
    };

    const response = await apiClient.get(`${this.baseUrl}/ecritures/`, { params });
    return response;
  }

  /**
   * Récupère une écriture comptable
   */
  async getEcriture(id: string): Promise<EcritureComptable> {
    const response = await apiClient.get<EcritureComptable>(`${this.baseUrl}/ecritures/${id}/`);
    return response;
  }

  /**
   * Génère les écritures comptables pour une période
   */
  async generateEcritures(year: number, month?: number): Promise<{
    created: number;
    message: string;
  }> {
    const response = await apiClient.post(`${this.baseUrl}/ecritures/generate/`, {
      year,
      month,
    });
    return response;
  }

  // =========================================================================
  // STATISTIQUES
  // =========================================================================

  /**
   * Récupère les statistiques comptables globales
   */
  async getStats(
    year?: number,
    dateDebut?: string,
    dateFin?: string
  ): Promise<StatsResponse> {
    const params: Record<string, any> = {};
    if (year) params.year = year;
    if (dateDebut) params.date_debut = dateDebut;
    if (dateFin) params.date_fin = dateFin;

    const response = await apiClient.get<StatsResponse>(`${this.baseUrl}/stats/`, { params });
    return response;
  }

  /**
   * Récupère les statistiques TVA
   */
  async getTVAStats(year: number): Promise<{
    parTaux: {
      '5.5': { base: number; tva: number };
      '10': { base: number; tva: number };
      '20': { base: number; tva: number };
    };
    total: number;
  }> {
    const response = await apiClient.get(`${this.baseUrl}/stats/tva/`, {
      params: { year },
    });
    return response;
  }

  /**
   * Récupère le chiffre d'affaires par mois
   */
  async getCaByMonth(year: number): Promise<Array<{
    month: number;
    caHt: number;
    caTtc: number;
    tva: number;
  }>> {
    const response = await apiClient.get(`${this.baseUrl}/stats/ca-mensuel/`, {
      params: { year },
    });
    return response;
  }

  // =========================================================================
  // UTILITAIRES
  // =========================================================================

  /**
   * Vérifie si le module comptabilité est configuré
   */
  async isConfigured(): Promise<boolean> {
    try {
      await this.getSettings();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtient le statut du module comptabilité
   */
  async getStatus(): Promise<{
    configured: boolean;
    siretValid: boolean;
    hasData: boolean;
    lastRecapDate?: string;
    lastExportDate?: string;
  }> {
    const response = await apiClient.get(`${this.baseUrl}/status/`);
    return response;
  }

  /**
   * Synchronise les données avec Stripe
   */
  async syncStripe(year: number, month?: number): Promise<{
    success: boolean;
    updated: number;
    message: string;
  }> {
    const response = await apiClient.post(`${this.baseUrl}/sync-stripe/`, {
      year,
      month,
    });
    return response;
  }

  /**
   * Export CSV des ventes
   */
  async exportVentesCSV(
    dateDebut: string,
    dateFin: string
  ): Promise<Blob> {
    const response = await apiClient.get<Blob>(`${this.baseUrl}/exports/ventes-csv/`, {
      params: {
        date_debut: dateDebut,
        date_fin: dateFin,
      },
      responseType: 'blob',
    });
    return response;
  }

  /**
   * Export CSV récapitulatif TVA
   */
  async exportTVACSV(year: number): Promise<Blob> {
    const response = await apiClient.get<Blob>(`${this.baseUrl}/exports/tva-csv/`, {
      params: { year },
      responseType: 'blob',
    });
    return response;
  }
}

// Instance singleton
export const comptabiliteService = new ComptabiliteService();