import { PaginatedResponse } from '@/types/common';
import { OrderList, extractOrdersFromResponse } from '@/types/order';

/**
 * Type guard pour vérifier si la réponse est paginée (format Django REST Framework)
 */
function isDjangoPagedResponse(response: any): response is {
  count: number;
  next: string | null;
  previous: string | null;
  results: any[];
} {
  return response && 
         typeof response === 'object' && 
         'count' in response && 
         'results' in response && 
         Array.isArray(response.results);
}

/**
 * Type guard pour vérifier si la réponse a déjà le format PaginatedResponse
 */
function isPaginatedResponse<T>(response: any): response is PaginatedResponse<T> {
  return response && 
         typeof response === 'object' && 
         'data' in response && 
         'pagination' in response &&
         Array.isArray(response.data);
}

/**
 * Normalise n'importe quelle réponse vers le format PaginatedResponse<OrderList>
 */
export function normalizeOrdersResponse(
  response: any,
  requestParams?: {
    page?: number;
    limit?: number;
  }
): PaginatedResponse<OrderList> {
  const defaultParams = {
    page: requestParams?.page || 1,
    limit: requestParams?.limit || 20
  };

  // Cas 1: Déjà au bon format
  if (isPaginatedResponse<OrderList>(response)) {
    return response;
  }

  // Cas 2: Format Django REST Framework paginé
  if (isDjangoPagedResponse(response)) {
    const orders = extractOrdersFromResponse(response);
    return {
      data: orders,
      pagination: {
        page: defaultParams.page,
        limit: defaultParams.limit,
        total: response.count,
        pages: Math.ceil(response.count / defaultParams.limit)
      }
    };
  }

  // Cas 3: Array direct
  if (Array.isArray(response)) {
    const orders = extractOrdersFromResponse(response);
    return {
      data: orders,
      pagination: {
        page: 1,
        limit: orders.length,
        total: orders.length,
        pages: 1
      }
    };
  }

  // Cas 4: Objet avec array dans différentes propriétés
  if (response && typeof response === 'object') {
    // Format custom avec data
    if ('data' in response && Array.isArray(response.data)) {
      const orders = extractOrdersFromResponse(response.data);
      const pagination = response.pagination || {
        page: defaultParams.page,
        limit: defaultParams.limit,
        total: orders.length,
        pages: Math.ceil(orders.length / defaultParams.limit)
      };
      
      return {
        data: orders,
        pagination
      };
    }

    // Format avec items
    if ('items' in response && Array.isArray(response.items)) {
      const orders = extractOrdersFromResponse(response.items);
      return {
        data: orders,
        pagination: {
          page: defaultParams.page,
          limit: defaultParams.limit,
          total: orders.length,
          pages: Math.ceil(orders.length / defaultParams.limit)
        }
      };
    }
  }

  // Cas fallback: réponse vide
  console.warn('Unknown response format, returning empty result:', response);
  return {
    data: [],
    pagination: {
      page: defaultParams.page,
      limit: defaultParams.limit,
      total: 0,
      pages: 0
    }
  };
}

/**
 * Normalise une réponse pour un objet unique (non paginé)
 */
export function normalizeSingleResponse<T>(response: any): T | null {
  if (!response) return null;
  
  // Si la réponse est wrappée dans un objet data
  if (response && typeof response === 'object' && 'data' in response) {
    return response.data;
  }
  
  // Sinon retourner tel quel
  return response;
}

/**
 * Gestionnaire d'erreur unifié pour les réponses API
 */
export function handleApiError(error: any): string {
  console.error('API Error:', error);
  
  // Erreur avec message personnalisé
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  
  // Erreur avec détails de validation
  if (error?.response?.data?.details) {
    const details = error.response.data.details;
    const messages = Object.values(details).flat();
    return messages.join(', ');
  }
  
  // Message d'erreur direct
  if (error?.message) {
    return error.message;
  }
  
  // Status codes courants
  if (error?.response?.status) {
    switch (error.response.status) {
      case 400:
        return 'Données invalides';
      case 401:
        return 'Non autorisé';
      case 403:
        return 'Accès refusé';
      case 404:
        return 'Ressource non trouvée';
      case 500:
        return 'Erreur serveur';
      default:
        return `Erreur ${error.response.status}`;
    }
  }
  
  return 'Une erreur inattendue s\'est produite';
}

/**
 * Hook utilitaire pour les appels API avec gestion d'erreur
 */
export function createApiCall<TInput, TOutput>(
  apiMethod: (input: TInput) => Promise<TOutput>,
  errorTransform?: (error: any) => string
) {
  return async (input: TInput): Promise<{
    data: TOutput | null;
    error: string | null;
  }> => {
    try {
      const data = await apiMethod(input);
      return { data, error: null };
    } catch (error) {
      const errorMessage = errorTransform 
        ? errorTransform(error) 
        : handleApiError(error);
      
      return { data: null, error: errorMessage };
    }
  };
}