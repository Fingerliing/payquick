import { apiClient } from './api';
import { Linking } from 'react-native';

export interface StripeAccount {
  status: string;
  account_id?: string;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  requirements?: any;
  has_validated_profile?: boolean;
}

export interface StripeOnboarding {
  account_id: string;
  onboarding_url: string;
  message: string;
}

export interface StripeAccountStatus {
  account_id: string;
  onboarding_url: string;
}

class StripeService {
  /**
   * Créer un compte Stripe Connect pour un restaurateur
   */
  async createAccount(): Promise<StripeOnboarding> {
    try {
      return await apiClient.post<StripeOnboarding>('/stripe/create-account/');
    } catch (error) {
      console.error('Erreur création compte Stripe:', error);
      throw error;
    }
  }

  /**
   * Vérifier le statut du compte Stripe
   */
  async getAccountStatus(): Promise<StripeAccount> {
    try {
      return await apiClient.get<StripeAccount>('/stripe/account-status/');
    } catch (error) {
      console.error('Erreur statut compte Stripe:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau lien d'onboarding
   */
  async createOnboardingLink(): Promise<StripeAccountStatus> {
    try {
      return await apiClient.post<StripeAccountStatus>('/stripe/onboarding-link/');
    } catch (error) {
      console.error('Erreur création lien onboarding:', error);
      throw error;
    }
  }

  /**
   * Ouvrir l'URL Stripe dans le navigateur par défaut
   */
  async openStripeOnboarding(url: string): Promise<boolean> {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return true;
      } else {
        console.error('URL non supportée:', url);
        return false;
      }
    } catch (error) {
      console.error('Erreur ouverture URL:', error);
      return false;
    }
  }

  /**
   * Gérer le retour depuis Stripe (via deep linking)
   */
  handleStripeReturn(url: string): { success: boolean; type?: 'success' | 'refresh' | 'cancel' } {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      if (pathname.includes('/stripe/success')) {
        return { success: true, type: 'success' };
      } else if (pathname.includes('/stripe/refresh')) {
        return { success: true, type: 'refresh' };
      } else if (pathname.includes('/stripe/cancel')) {
        return { success: true, type: 'cancel' };
      }

      return { success: false };
    } catch (error) {
      console.error('Erreur parsing URL retour:', error);
      return { success: false };
    }
  }
}

export const stripeService = new StripeService();