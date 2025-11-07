// ============================================================================
// ENUMS
// ============================================================================

export enum TVARegime {
  NORMAL = 'normal',
  FRANCHISE = 'franchise',
  SIMPLIFIE = 'simplifie',
}

export enum ExportFormat {
  FEC = 'FEC',
  CSV = 'CSV',
  EXCEL = 'EXCEL',
  PDF = 'PDF',
}

export enum ExportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum JournalCode {
  VENTES = 'VE',  // Journal des ventes
  ACHATS = 'AC',  // Journal des achats
  BANQUE = 'BQ',  // Journal de banque
  CAISSE = 'CA',  // Journal de caisse
  OD = 'OD',      // Opérations diverses
}

// ============================================================================
// INTERFACES DE BASE
// ============================================================================

/**
 * Paramètres comptables du restaurateur
 */
export interface ComptabiliteSettings {
  id?: string;
  restaurateurId: string;
  invoicePrefix: string;
  lastInvoiceNumber: number;
  invoiceYearReset: boolean;
  tvaRegime: TVARegime;
  exportFormatDefault: ExportFormat;
  siret: string;
  tvaIntracommunautaire?: string;
  codeNaf?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Séquence de facturation
 */
export interface FactureSequence {
  id?: string;
  restaurateurId: string;
  year: number;
  month: number;
  lastNumber: number;
}

/**
 * Écriture comptable (FEC)
 */
export interface EcritureComptable {
  id?: string;
  restaurateurId: string;
  journalCode: JournalCode;
  ecritureNum: string;
  ecritureDate: string;
  compteNum: string;
  compteLib: string;
  pieceRef: string;
  pieceDate: string;
  debit: number;
  credit: number;
  ecritureLib: string;
  orderId?: number;
  stripePaymentId?: string;
  tvaTaux?: number;
  createdAt?: string;
}

/**
 * Récapitulatif TVA mensuel
 */
export interface RecapitulatifTVA {
  id?: string;
  restaurateurId: string;
  year: number;
  month: number;
  
  // Chiffre d'affaires
  caHt: number;
  caTtc: number;
  
  // TVA 5.5%
  tva55Base: number;
  tva55Montant: number;
  
  // TVA 10%
  tva10Base: number;
  tva10Montant: number;
  
  // TVA 20%
  tva20Base: number;
  tva20Montant: number;
  
  // Total
  tvaTotal: number;
  
  // Statistiques
  nombreFactures: number;
  ticketMoyen: number;
  
  // Stripe
  commissionsStripe?: number;
  virementsStripe?: number;
  
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Export comptable
 */
export interface ExportComptable {
  id?: string;
  restaurateurId: string;
  typeExport: ExportFormat;
  periodeDebut: string;
  periodeFin: string;
  fichierUrl?: string;
  fichierNom: string;
  fichierTaille?: number;
  statut: ExportStatus;
  messageErreur?: string;
  nombreLignes?: number;
  checksumMd5?: string;
  createdAt?: string;
  expiresAt?: string;
}

// ============================================================================
// TYPES CALCULÉS
// ============================================================================

/**
 * Résultat de calcul TVA
 */
export interface VATCalculation {
  ht: number;
  tva: number;
  ttc: number;
  taux: number;
}

/**
 * Ventilation TVA d'une commande
 */
export interface VATBreakdown {
  '5.5': {
    base: number;
    tva: number;
  };
  '10': {
    base: number;
    tva: number;
  };
  '20': {
    base: number;
    tva: number;
  };
}

/**
 * Statistiques comptables globales
 */
export interface ComptabiliteStats {
  caTotalHt: number;
  caTotalTtc: number;
  tvaTotale: number;
  nombreFactures: number;
  ticketMoyen: number;
  commissionsStripe: number;
  
  // Par période
  parMois: Array<{
    year: number;
    month: number;
    caTtc: number;
    tva: number;
  }>;
  
  // Par taux de TVA
  parTauxTVA: {
    '5.5': number;
    '10': number;
    '20': number;
  };
}

/**
 * Période comptable
 */
export interface PeriodeComptable {
  dateDebut: string;
  dateFin: string;
  year: number;
  month?: number;
  quarter?: number;
}

// ============================================================================
// TYPES DE REQUÊTES API
// ============================================================================

/**
 * Requête de création de paramètres comptables
 */
export interface CreateComptabiliteSettingsRequest {
  invoicePrefix?: string;
  invoiceYearReset?: boolean;
  tvaRegime?: TVARegime;
  exportFormatDefault?: ExportFormat;
  siret: string;
  tvaIntracommunautaire?: string;
  codeNaf?: string;
}

/**
 * Requête de mise à jour des paramètres
 */
export interface UpdateComptabiliteSettingsRequest extends Partial<CreateComptabiliteSettingsRequest> {}

/**
 * Requête d'export comptable
 */
export interface CreateExportRequest {
  typeExport: ExportFormat;
  periodeDebut: string;
  periodeFin: string;
  includeDetails?: boolean;
}

/**
 * Requête de génération FEC
 */
export interface GenerateFECRequest {
  year: number;
  periodeDebut?: string;
  periodeFin?: string;
  async?: boolean;
}

/**
 * Filtres pour les récapitulatifs TVA
 */
export interface RecapTVAFilters {
  year?: number;
  month?: number;
  yearMin?: number;
  yearMax?: number;
}

/**
 * Filtres pour les exports
 */
export interface ExportFilters {
  typeExport?: ExportFormat;
  statut?: ExportStatus;
  dateMin?: string;
  dateMax?: string;
}

// ============================================================================
// TYPES DE RÉPONSES API
// ============================================================================

/**
 * Réponse paginée pour les récapitulatifs TVA
 */
export interface RecapTVAPaginatedResponse {
  results: RecapitulatifTVA[];
  count: number;
  next: string | null;
  previous: string | null;
  page: number;
  pages: number;
}

/**
 * Réponse paginée pour les exports
 */
export interface ExportPaginatedResponse {
  results: ExportComptable[];
  count: number;
  next: string | null;
  previous: string | null;
  page: number;
  pages: number;
}

/**
 * Réponse de génération FEC
 */
export interface FECGenerationResponse {
  taskId?: string;
  status: 'success' | 'pending';
  message: string;
  downloadUrl?: string;
  exportId?: string;
}

/**
 * Réponse de statistiques
 */
export interface StatsResponse extends ComptabiliteStats {
  periodeAnalysee: PeriodeComptable;
}

// ============================================================================
// TYPES UTILITAIRES
// ============================================================================

/**
 * État de validation des paramètres comptables
 */
export interface ComptabiliteValidation {
  isValid: boolean;
  errors: {
    siret?: string;
    tvaIntracommunautaire?: string;
    invoicePrefix?: string;
  };
  warnings: string[];
}

/**
 * Informations de facturation
 */
export interface InvoiceInfo {
  invoiceNumber: string;
  invoiceDate: string;
  siret: string;
  tvaIntracommunautaire?: string;
}

/**
 * Résumé TVA pour affichage
 */
export interface TVASummary {
  periode: string;
  caHt: number;
  caTtc: number;
  tvaCollectee: number;
  tauxMoyen: number;
  nombreFactures: number;
}

/**
 * Options d'export
 */
export interface ExportOptions {
  format: ExportFormat;
  periode: PeriodeComptable;
  includeDetails: boolean;
  includeVATBreakdown: boolean;
  separateByRestaurant?: boolean;
}

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Taux de TVA en vigueur (France 2025)
 */
export const TVA_RATES = {
  FOOD_ONSITE: 0.10,      // Restauration sur place
  FOOD_TAKEAWAY: 0.10,    // À emporter
  ALCOHOL: 0.20,          // Boissons alcoolisées
  SOFT_DRINK: 0.10,       // Boissons non alcoolisées
  PACKAGED: 0.055,        // Produits emballés
} as const;

/**
 * Comptes comptables standards (Plan Comptable Français)
 */
export const COMPTES_COMPTABLES = {
  // Classe 4 - Tiers
  CLIENT: '411000',
  TVA_COLLECTEE: '445710',
  TVA_DEDUCTIBLE: '445660',
  BANQUE: '512000',
  CAISSE: '530000',
  
  // Classe 6 - Charges
  ACHATS_MARCHANDISES: '607000',
  CHARGES_PERSONNEL: '641000',
  COMMISSIONS: '622600',
  
  // Classe 7 - Produits
  VENTES_MARCHANDISES: '707000',
  PRESTATIONS_SERVICES: '706000',
} as const;

/**
 * Messages d'erreur
 */
export const COMPTABILITE_ERRORS = {
  SIRET_INVALID: 'Le numéro SIRET est invalide (14 chiffres requis)',
  SIRET_REQUIRED: 'Le numéro SIRET est obligatoire',
  TVA_CALCUL_ERROR: 'Erreur lors du calcul de la TVA',
  EXPORT_FAILED: 'Échec de la génération de l\'export',
  NO_DATA_FOR_PERIOD: 'Aucune donnée pour la période sélectionnée',
  SETTINGS_NOT_CONFIGURED: 'Les paramètres comptables ne sont pas configurés',
} as const;