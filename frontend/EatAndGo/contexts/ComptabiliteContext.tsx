import React, { createContext, useContext, useReducer, ReactNode, useCallback } from 'react';
import { comptabiliteService } from '@/services/comptabiliteService';
import type {
  ComptabiliteSettings,
  CreateComptabiliteSettingsRequest,
  UpdateComptabiliteSettingsRequest,
  RecapitulatifTVA,
  RecapTVAFilters,
  ExportComptable,
  ExportFilters,
  CreateExportRequest,
  GenerateFECRequest,
  FECGenerationResponse,
  ComptabiliteStats,
  EcritureComptable,
  ExportFormat,
} from '@/types/comptabilite';

// ============================================================================
// TYPES
// ============================================================================

interface ComptabiliteState {
  // Paramètres
  settings: ComptabiliteSettings | null;
  settingsLoading: boolean;
  settingsError: string | null;

  // Récapitulatifs TVA
  recapsTVA: RecapitulatifTVA[];
  recapsTVALoading: boolean;
  recapsTVAError: string | null;
  recapsTVAPagination: {
    page: number;
    pages: number;
    total: number;
  };

  // Exports
  exports: ExportComptable[];
  exportsLoading: boolean;
  exportsError: string | null;
  exportsPagination: {
    page: number;
    pages: number;
    total: number;
  };

  // Statistiques
  stats: ComptabiliteStats | null;
  statsLoading: boolean;
  statsError: string | null;

  // Filtres
  recapFilters: RecapTVAFilters;
  exportFilters: ExportFilters;

  // État global
  isConfigured: boolean;
}

type ComptabiliteAction =
  // Settings
  | { type: 'SETTINGS_LOADING' }
  | { type: 'SETTINGS_SUCCESS'; payload: ComptabiliteSettings }
  | { type: 'SETTINGS_ERROR'; payload: string }
  
  // Recaps TVA
  | { type: 'RECAPS_LOADING' }
  | {
      type: 'RECAPS_SUCCESS';
      payload: {
        results: RecapitulatifTVA[];
        page: number;
        pages: number;
        total: number;
      };
    }
  | { type: 'RECAPS_ERROR'; payload: string }
  | { type: 'RECAP_ADDED'; payload: RecapitulatifTVA }
  | { type: 'RECAP_UPDATED'; payload: RecapitulatifTVA }
  
  // Exports
  | { type: 'EXPORTS_LOADING' }
  | {
      type: 'EXPORTS_SUCCESS';
      payload: {
        results: ExportComptable[];
        page: number;
        pages: number;
        total: number;
      };
    }
  | { type: 'EXPORTS_ERROR'; payload: string }
  | { type: 'EXPORT_ADDED'; payload: ExportComptable }
  | { type: 'EXPORT_DELETED'; payload: string }
  
  // Stats
  | { type: 'STATS_LOADING' }
  | { type: 'STATS_SUCCESS'; payload: ComptabiliteStats }
  | { type: 'STATS_ERROR'; payload: string }
  
  // Filtres
  | { type: 'SET_RECAP_FILTERS'; payload: RecapTVAFilters }
  | { type: 'SET_EXPORT_FILTERS'; payload: ExportFilters }
  
  // Configuration
  | { type: 'SET_CONFIGURED'; payload: boolean };

interface ComptabiliteContextType extends ComptabiliteState {
  // Settings
  loadSettings: () => Promise<void>;
  createSettings: (data: CreateComptabiliteSettingsRequest) => Promise<void>;
  updateSettings: (data: UpdateComptabiliteSettingsRequest) => Promise<void>;

  // Recaps TVA
  loadRecapsTVA: (filters?: RecapTVAFilters, page?: number) => Promise<void>;
  loadRecapTVAByMonth: (year: number, month: number) => Promise<RecapitulatifTVA | null>;
  generateRecapTVA: (year: number, month: number) => Promise<void>;
  regenerateRecapTVA: (year: number, month: number) => Promise<void>;
  setRecapFilters: (filters: RecapTVAFilters) => void;

  // Exports
  loadExports: (filters?: ExportFilters, page?: number) => Promise<void>;
  createExport: (data: CreateExportRequest) => Promise<ExportComptable>;
  deleteExport: (id: string) => Promise<void>;
  downloadExport: (id: string, filename: string) => Promise<void>;
  setExportFilters: (filters: ExportFilters) => void;

  // FEC
  generateFEC: (request: GenerateFECRequest) => Promise<FECGenerationResponse>;
  downloadFEC: (year: number, filename?: string) => Promise<void>;

  // Stats
  loadStats: (year?: number) => Promise<void>;
  
  // Utilitaires
  checkConfiguration: () => Promise<boolean>;
  exportVentesCSV: (dateDebut: string, dateFin: string) => Promise<void>;
  exportTVACSV: (year: number) => Promise<void>;
}

// ============================================================================
// STATE INITIAL
// ============================================================================

const initialState: ComptabiliteState = {
  settings: null,
  settingsLoading: false,
  settingsError: null,

  recapsTVA: [],
  recapsTVALoading: false,
  recapsTVAError: null,
  recapsTVAPagination: { page: 1, pages: 1, total: 0 },

  exports: [],
  exportsLoading: false,
  exportsError: null,
  exportsPagination: { page: 1, pages: 1, total: 0 },

  stats: null,
  statsLoading: false,
  statsError: null,

  recapFilters: {},
  exportFilters: {},

  isConfigured: false,
};

// ============================================================================
// REDUCER
// ============================================================================

function comptabiliteReducer(
  state: ComptabiliteState,
  action: ComptabiliteAction
): ComptabiliteState {
  switch (action.type) {
    // Settings
    case 'SETTINGS_LOADING':
      return { ...state, settingsLoading: true, settingsError: null };
    case 'SETTINGS_SUCCESS':
      return {
        ...state,
        settings: action.payload,
        settingsLoading: false,
        isConfigured: true,
      };
    case 'SETTINGS_ERROR':
      return { ...state, settingsLoading: false, settingsError: action.payload };

    // Recaps TVA
    case 'RECAPS_LOADING':
      return { ...state, recapsTVALoading: true, recapsTVAError: null };
    case 'RECAPS_SUCCESS':
      return {
        ...state,
        recapsTVA: action.payload.results,
        recapsTVALoading: false,
        recapsTVAPagination: {
          page: action.payload.page,
          pages: action.payload.pages,
          total: action.payload.total,
        },
      };
    case 'RECAPS_ERROR':
      return { ...state, recapsTVALoading: false, recapsTVAError: action.payload };
    case 'RECAP_ADDED':
      return {
        ...state,
        recapsTVA: [action.payload, ...state.recapsTVA],
      };
    case 'RECAP_UPDATED':
      return {
        ...state,
        recapsTVA: state.recapsTVA.map((r) =>
          r.id === action.payload.id ? action.payload : r
        ),
      };

    // Exports
    case 'EXPORTS_LOADING':
      return { ...state, exportsLoading: true, exportsError: null };
    case 'EXPORTS_SUCCESS':
      return {
        ...state,
        exports: action.payload.results,
        exportsLoading: false,
        exportsPagination: {
          page: action.payload.page,
          pages: action.payload.pages,
          total: action.payload.total,
        },
      };
    case 'EXPORTS_ERROR':
      return { ...state, exportsLoading: false, exportsError: action.payload };
    case 'EXPORT_ADDED':
      return {
        ...state,
        exports: [action.payload, ...state.exports],
      };
    case 'EXPORT_DELETED':
      return {
        ...state,
        exports: state.exports.filter((e) => e.id !== action.payload),
      };

    // Stats
    case 'STATS_LOADING':
      return { ...state, statsLoading: true, statsError: null };
    case 'STATS_SUCCESS':
      return { ...state, stats: action.payload, statsLoading: false };
    case 'STATS_ERROR':
      return { ...state, statsLoading: false, statsError: action.payload };

    // Filtres
    case 'SET_RECAP_FILTERS':
      return { ...state, recapFilters: action.payload };
    case 'SET_EXPORT_FILTERS':
      return { ...state, exportFilters: action.payload };

    // Configuration
    case 'SET_CONFIGURED':
      return { ...state, isConfigured: action.payload };

    default:
      return state;
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

const ComptabiliteContext = createContext<ComptabiliteContextType | undefined>(undefined);

export const ComptabiliteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(comptabiliteReducer, initialState);

  // ==========================================================================
  // SETTINGS
  // ==========================================================================

  const loadSettings = useCallback(async () => {
    dispatch({ type: 'SETTINGS_LOADING' });
    try {
      const settings = await comptabiliteService.getSettings();
      dispatch({ type: 'SETTINGS_SUCCESS', payload: settings });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erreur lors du chargement des paramètres';
      dispatch({ type: 'SETTINGS_ERROR', payload: message });
      throw error;
    }
  }, []);

  const createSettings = useCallback(async (data: CreateComptabiliteSettingsRequest) => {
    dispatch({ type: 'SETTINGS_LOADING' });
    try {
      const settings = await comptabiliteService.createSettings(data);
      dispatch({ type: 'SETTINGS_SUCCESS', payload: settings });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erreur lors de la création des paramètres';
      dispatch({ type: 'SETTINGS_ERROR', payload: message });
      throw error;
    }
  }, []);

  const updateSettings = useCallback(async (data: UpdateComptabiliteSettingsRequest) => {
    dispatch({ type: 'SETTINGS_LOADING' });
    try {
      const settings = await comptabiliteService.updateSettings(data);
      dispatch({ type: 'SETTINGS_SUCCESS', payload: settings });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erreur lors de la mise à jour';
      dispatch({ type: 'SETTINGS_ERROR', payload: message });
      throw error;
    }
  }, []);

  // ==========================================================================
  // RECAPS TVA
  // ==========================================================================

  const loadRecapsTVA = useCallback(
    async (filters?: RecapTVAFilters, page: number = 1) => {
      dispatch({ type: 'RECAPS_LOADING' });
      try {
        const response = await comptabiliteService.getRecapsTVA(filters, page);
        dispatch({
          type: 'RECAPS_SUCCESS',
          payload: {
            results: response.results,
            page: response.page,
            pages: response.pages,
            total: response.count,
          },
        });
      } catch (error: any) {
        const message =
          error.response?.data?.message || 'Erreur lors du chargement des récapitulatifs';
        dispatch({ type: 'RECAPS_ERROR', payload: message });
      }
    },
    []
  );

  const loadRecapTVAByMonth = useCallback(
    async (year: number, month: number): Promise<RecapitulatifTVA | null> => {
      try {
        const recap = await comptabiliteService.getRecapTVAByMonth(year, month);
        return recap;
      } catch (error) {
        return null;
      }
    },
    []
  );

  const generateRecapTVA = useCallback(async (year: number, month: number) => {
    try {
      const recap = await comptabiliteService.generateRecapTVA(year, month);
      dispatch({ type: 'RECAP_ADDED', payload: recap });
    } catch (error: any) {
      throw error;
    }
  }, []);

  const regenerateRecapTVA = useCallback(async (year: number, month: number) => {
    try {
      const recap = await comptabiliteService.regenerateRecapTVA(year, month);
      dispatch({ type: 'RECAP_UPDATED', payload: recap });
    } catch (error: any) {
      throw error;
    }
  }, []);

  const setRecapFilters = useCallback((filters: RecapTVAFilters) => {
    dispatch({ type: 'SET_RECAP_FILTERS', payload: filters });
  }, []);

  // ==========================================================================
  // EXPORTS
  // ==========================================================================

  const loadExports = useCallback(async (filters?: ExportFilters, page: number = 1) => {
    dispatch({ type: 'EXPORTS_LOADING' });
    try {
      const response = await comptabiliteService.getExports(filters, page);
      dispatch({
        type: 'EXPORTS_SUCCESS',
        payload: {
          results: response.results,
          page: response.page,
          pages: response.pages,
          total: response.count,
        },
      });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erreur lors du chargement des exports';
      dispatch({ type: 'EXPORTS_ERROR', payload: message });
    }
  }, []);

  const createExport = useCallback(async (data: CreateExportRequest): Promise<ExportComptable> => {
    try {
      const exportObj = await comptabiliteService.createExport(data);
      dispatch({ type: 'EXPORT_ADDED', payload: exportObj });
      return exportObj;
    } catch (error: any) {
      throw error;
    }
  }, []);

  const deleteExport = useCallback(async (id: string) => {
    try {
      await comptabiliteService.deleteExport(id);
      dispatch({ type: 'EXPORT_DELETED', payload: id });
    } catch (error: any) {
      throw error;
    }
  }, []);

  const downloadExport = useCallback(async (id: string, filename: string) => {
    try {
      const blob = await comptabiliteService.downloadExport(id);
      
      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      throw error;
    }
  }, []);

  const setExportFilters = useCallback((filters: ExportFilters) => {
    dispatch({ type: 'SET_EXPORT_FILTERS', payload: filters });
  }, []);

  // ==========================================================================
  // FEC
  // ==========================================================================

  const generateFEC = useCallback(
    async (request: GenerateFECRequest): Promise<FECGenerationResponse> => {
      try {
        const response = await comptabiliteService.generateFEC(request);
        return response;
      } catch (error: any) {
        throw error;
      }
    },
    []
  );

  const downloadFEC = useCallback(async (year: number, filename?: string) => {
    try {
      const blob = await comptabiliteService.downloadFEC(year);
      const fname = filename || `FEC_${year}.txt`;
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fname;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      throw error;
    }
  }, []);

  // ==========================================================================
  // STATS
  // ==========================================================================

  const loadStats = useCallback(async (year?: number) => {
    dispatch({ type: 'STATS_LOADING' });
    try {
      const stats = await comptabiliteService.getStats(year);
      dispatch({ type: 'STATS_SUCCESS', payload: stats });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Erreur lors du chargement des statistiques';
      dispatch({ type: 'STATS_ERROR', payload: message });
    }
  }, []);

  // ==========================================================================
  // UTILITAIRES
  // ==========================================================================

  const checkConfiguration = useCallback(async (): Promise<boolean> => {
    try {
      const isConfigured = await comptabiliteService.isConfigured();
      dispatch({ type: 'SET_CONFIGURED', payload: isConfigured });
      return isConfigured;
    } catch (error) {
      dispatch({ type: 'SET_CONFIGURED', payload: false });
      return false;
    }
  }, []);

  const exportVentesCSV = useCallback(async (dateDebut: string, dateFin: string) => {
    try {
      const blob = await comptabiliteService.exportVentesCSV(dateDebut, dateFin);
      const filename = `ventes_${dateDebut}_${dateFin}.csv`;
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      throw error;
    }
  }, []);

  const exportTVACSV = useCallback(async (year: number) => {
    try {
      const blob = await comptabiliteService.exportTVACSV(year);
      const filename = `recap_tva_${year}.csv`;
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      throw error;
    }
  }, []);

  // ==========================================================================
  // VALUE
  // ==========================================================================

  const value: ComptabiliteContextType = {
    ...state,
    loadSettings,
    createSettings,
    updateSettings,
    loadRecapsTVA,
    loadRecapTVAByMonth,
    generateRecapTVA,
    regenerateRecapTVA,
    setRecapFilters,
    loadExports,
    createExport,
    deleteExport,
    downloadExport,
    setExportFilters,
    generateFEC,
    downloadFEC,
    loadStats,
    checkConfiguration,
    exportVentesCSV,
    exportTVACSV,
  };

  return (
    <ComptabiliteContext.Provider value={value}>
      {children}
    </ComptabiliteContext.Provider>
  );
};

// Hook personnalisé
export const useComptabilite = (): ComptabiliteContextType => {
  const context = useContext(ComptabiliteContext);
  if (!context) {
    throw new Error('useComptabilite must be used within a ComptabiliteProvider');
  }
  return context;
};