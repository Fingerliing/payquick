import { apiClient } from './api';


export interface LegalConsent {
  terms_version: string;
  privacy_version: string;
  consent_date: string;
}

export const legalService = {
  // Enregistrer le consentement
  recordConsent: async (consent: LegalConsent) => {
    const response = await apiClient.post('/legal/consent/', consent);
    return response.data;
  },

  // Récupérer le statut du consentement
  getConsentStatus: async () => {
    const response = await apiClient.get('/legal/consent/status/');
    return response.data;
  },

  // Exporter les données utilisateur
  exportUserData: async () => {
    const response = await apiClient.get('/legal/data/export/');
    return response.data;
  },

  // Demander un export complet par email
  requestDataExport: async () => {
    const response = await apiClient.post('/legal/data/request-export/');
    return response.data;
  },

  // Demander la suppression du compte
  requestAccountDeletion: async (reason?: string) => {
    const response = await apiClient.post('/legal/account/delete/', { reason });
    return response.data;
  },

  // Annuler la suppression du compte
  cancelAccountDeletion: async () => {
    const response = await apiClient.post('/legal/account/cancel-deletion/');
    return response.data;
  },
};