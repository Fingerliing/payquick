export { Alert, AlertWithAction } from './Alert';
export type { AlertProps, AlertWithActionProps } from './Alert';

// Hook personnalisé pour gérer les alertes
import { useState, useCallback } from 'react';

export interface AlertState {
  visible: boolean;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
}

export const useAlert = () => {
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const showAlert = useCallback((
    message: string,
    variant: AlertState['variant'] = 'info',
    title?: string
  ) => {
    setAlertState({
      visible: true,
      variant,
      title,
      message,
    });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertState(null);
  }, []);

  const showSuccess = useCallback((message: string, title?: string) => {
    showAlert(message, 'success', title);
  }, [showAlert]);

  const showError = useCallback((message: string, title?: string) => {
    showAlert(message, 'error', title);
  }, [showAlert]);

  const showWarning = useCallback((message: string, title?: string) => {
    showAlert(message, 'warning', title);
  }, [showAlert]);

  const showInfo = useCallback((message: string, title?: string) => {
    showAlert(message, 'info', title);
  }, [showAlert]);

  return {
    alertState,
    showAlert,
    hideAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
};