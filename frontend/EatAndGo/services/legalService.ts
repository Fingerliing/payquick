import { apiClient } from './api';


export interface LegalConsent {
  terms_version: string;
  privacy_version: string;
  consent_date: string;
}

export const legalService = {
  // Enregistrer le consentement
  recordConsent: async (consent: LegalConsent) => {
    const response = await apiClient.post('api/v1/legal/consent/', consent);
    return response.data;
  },

  // Récupérer le statut du consentement
  getConsentStatus: async () => {
    const response = await apiClient.get('api/v1/legal/consent/status/');
    return response.data;
  },

  // Exporter les données utilisateur
  exportUserData: async () => {
    const response = await apiClient.get('api/v1/legal/data/export/');
    return response.data;
  },

  // Demander un export complet par email
  requestDataExport: async () => {
    const response = await apiClient.post('api/v1/legal/data/request-export/');
    return response.data;
  },

  // Demander la suppression du compte
  requestAccountDeletion: async (reason?: string) => {
    const response = await apiClient.post('api/v1/legal/account/delete/', { reason });
    return response.data;
  },

  // Annuler la suppression du compte
  cancelAccountDeletion: async () => {
    const response = await apiClient.post('api/v1/legal/account/cancel-deletion/');
    return response.data;
  },
};