import { Alert } from 'react-native';
import { ApiError } from '../types/common';

export class ErrorHandler {
  static handle(error: any, context?: string) {
    console.error(`Error in ${context || 'Unknown'}:`, error);

    if (this.isApiError(error)) {
      this.handleApiError(error);
    } else if (this.isNetworkError(error)) {
      this.handleNetworkError();
    } else if (error instanceof Error) {
      this.handleGenericError(error.message);
    } else {
      this.handleUnknownError();
    }
  }

  private static isApiError(error: any): error is ApiError {
    return error && typeof error.code === 'number' && typeof error.message === 'string';
  }

  private static isNetworkError(error: any): boolean {
    return error?.code === 'NETWORK_ERROR' || error?.message?.includes('Network Error');
  }

  private static handleApiError(error: ApiError) {
    switch (error.code) {
      case 401:
        Alert.alert('Session expirée', 'Veuillez vous reconnecter');
        // Rediriger vers login
        break;
      case 403:
        Alert.alert('Accès refusé', 'Vous n\'avez pas les permissions nécessaires');
        break;
      case 404:
        Alert.alert('Non trouvé', 'La ressource demandée n\'existe pas');
        break;
      case 422:
        // Erreurs de validation - afficher les détails si disponibles
        if (error.details) {
          const errorMessages = Object.values(error.details).flat().join('\n');
          Alert.alert('Erreur de validation', errorMessages);
        } else {
          Alert.alert('Erreur de validation', error.message);
        }
        break;
      case 500:
        Alert.alert('Erreur serveur', 'Une erreur est survenue sur le serveur. Veuillez réessayer plus tard.');
        break;
      default:
        Alert.alert('Erreur', error.message);
    }
  }

  private static handleNetworkError() {
    Alert.alert(
      'Erreur de connexion',
      'Vérifiez votre connexion internet et réessayez',
      [{ text: 'OK' }]
    );
  }

  private static handleGenericError(message: string) {
    Alert.alert('Erreur', message);
  }

  private static handleUnknownError() {
    Alert.alert('Erreur', 'Une erreur inattendue s\'est produite');
  }

  static createErrorBoundary(Component: React.ComponentType<any>) {
    return class ErrorBoundary extends React.Component<any, { hasError: boolean }> {
      constructor(props: any) {
        super(props);
        this.state = { hasError: false };
      }

      static getDerivedStateFromError(error: Error) {
        return { hasError: true };
      }

      componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        ErrorHandler.handle(error, 'React Error Boundary');
      }

      render() {
        if (this.state.hasError) {
          return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text>Une erreur est survenue</Text>
              <Button
                title="Réessayer"
                onPress={() => this.setState({ hasError: false })}
              />
            </View>
          );
        }

        return <Component {...this.props} />;
      }
    };
  }
}