export { Alert, AlertWithAction } from './Alert';
export type { AlertProps, AlertWithActionProps } from './Alert';

// Hook personnalisé pour gérer les alertes
import { useState, useCallback } from 'react';

export interface AlertState {
  visible: boolean;
  variant: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  autoDismiss?: boolean;
  autoDismissDuration?: number;
}

export const useAlert = () => {
  const [alertState, setAlertState] = useState<AlertState | null>(null);

  const showAlert = useCallback((
    message: string,
    variant: AlertState['variant'] = 'info',
    title?: string,
    autoDismiss: boolean = true,
    autoDismissDuration: number = 5000
  ) => {
    setAlertState({
      visible: true,
      variant,
      title,
      message,
      autoDismiss,
      autoDismissDuration,
    });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertState(null);
  }, []);

  const showSuccess = useCallback((
    message: string, 
    title?: string,
    autoDismiss: boolean = true,
    autoDismissDuration: number = 5000
  ) => {
    showAlert(message, 'success', title, autoDismiss, autoDismissDuration);
  }, [showAlert]);

  const showError = useCallback((
    message: string, 
    title?: string,
    autoDismiss: boolean = true,
    autoDismissDuration: number = 5000
  ) => {
    showAlert(message, 'error', title, autoDismiss, autoDismissDuration);
  }, [showAlert]);

  const showWarning = useCallback((
    message: string, 
    title?: string,
    autoDismiss: boolean = true,
    autoDismissDuration: number = 5000
  ) => {
    showAlert(message, 'warning', title, autoDismiss, autoDismissDuration);
  }, [showAlert]);

  const showInfo = useCallback((
    message: string, 
    title?: string,
    autoDismiss: boolean = true,
    autoDismissDuration: number = 5000
  ) => {
    showAlert(message, 'info', title, autoDismiss, autoDismissDuration);
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