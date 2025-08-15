// types/apiErrors.ts

export interface APIError {
  message?: string;
  code?: number;
  details?: Record<string, any>;
}

export interface AxiosErrorResponse {
  response?: {
    status?: number;
    statusText?: string;
    data?: APIError;
    headers?: Record<string, string>;
  };
  config?: {
    url?: string;
    method?: string;
    data?: any;
  };
  message?: string;
}

/**
 * Type guard to check if an error is an API error with response data
 */
export function isAPIError(error: unknown): error is AxiosErrorResponse {
  return (
    error !== null &&
    typeof error === 'object' &&
    'response' in error &&
    typeof (error as any).response === 'object'
  );
}

/**
 * Extract a user-friendly error message from an API error
 */
export function extractErrorMessage(error: unknown): string {
  const fallbackMessage = 'Une erreur inattendue s\'est produite';

  if (!isAPIError(error)) {
    if (error instanceof Error) {
      return error.message;
    }
    return fallbackMessage;
  }

  const errorData = error.response?.data;
  
  if (!errorData) {
    return error.message || fallbackMessage;
  }

  // Check for detailed field errors
  if (errorData.details && typeof errorData.details === 'object') {
    const details = errorData.details;
    const fieldErrors: string[] = [];
    
    Object.entries(details).forEach(([field, messages]) => {
      // Skip null or undefined values
      if (messages == null) return;
      
      if (field === 'error') {
        // Handle generic error field
        const errorMessages = Array.isArray(messages) ? messages : [messages];
        fieldErrors.push(...errorMessages.filter(msg => msg != null).map(String));
      } else {
        // Handle field-specific errors
        const errorMessages = Array.isArray(messages) ? messages : [messages];
        const validMessages = errorMessages.filter(msg => msg != null).map(String);
        fieldErrors.push(...validMessages.map(msg => `${field}: ${msg}`));
      }
    });
    
    if (fieldErrors.length > 0) {
      return fieldErrors.join('; ');
    }
  }

  // Check for direct message
  if (errorData.message && typeof errorData.message === 'string') {
    return errorData.message;
  }

  // Check for direct error field
  if (errorData.details?.error) {
    const errorField = errorData.details.error;
    if (Array.isArray(errorField)) {
      return errorField.filter(msg => msg != null).map(String).join(', ');
    } else if (typeof errorField === 'string') {
      return errorField;
    }
  }

  return error.message || fallbackMessage;
}

/**
 * Log detailed error information for debugging
 */
export function logAPIError(error: unknown, context: string): void {
  console.error(`${context}:`, {
    isAPIError: isAPIError(error),
    message: error instanceof Error ? error.message : 'Unknown error',
    ...(isAPIError(error) && {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    }),
    fullError: error
  });
}