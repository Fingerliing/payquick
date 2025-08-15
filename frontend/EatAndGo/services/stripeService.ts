import { apiClient } from './api';
import { Linking } from 'react-native';

export interface StripeAccount {
  status?: string;
  account_id?: string;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  requirements?: any;
  has_validated_profile?: boolean;
}

export interface StripeOnboarding {
  account_id?: string;
  onboarding_url: string;
}

export interface StripeAccountStatus {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted?: boolean;
  requirements?: any;
  account_id?: string;
  has_validated_profile?: boolean;
}

type OnboardingReturn =
  | { success: true; type: 'success' | 'refresh' | 'cancel' }
  | { success: false };

class StripeService {
  /** Créer/initialiser un compte Connect et obtenir un lien d’onboarding */
  async createAccount(): Promise<StripeOnboarding> {
    return apiClient.post<StripeOnboarding>('/api/v1/stripe/create-account/');
  }

  /** Statut du compte Connect */
  async getAccountStatus(): Promise<StripeAccountStatus> {
    return apiClient.get<StripeAccountStatus>('/api/v1/stripe/account-status/');
  }

  /** (Ré)obtenir un lien d’onboarding */
  async createOnboardingLink(): Promise<StripeOnboarding> {
    return apiClient.post<StripeOnboarding>('/api/v1/stripe/create-account/');
  }

  /** Créer une session Stripe Identity (KYC) */
  async createIdentitySession(): Promise<{ verification_url: string }> {
    return apiClient.post('/api/v1/payments/identity/session/');
  }

  /** Ouvrir l’onboarding dans le navigateur */
  async openStripeOnboarding(url?: string): Promise<boolean> {
    try {
      const onboardingUrl = url ?? (await this.createOnboardingLink()).onboarding_url;
      const supported = await Linking.canOpenURL(onboardingUrl);
      if (supported) {
        await Linking.openURL(onboardingUrl);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Impossible d'ouvrir l'onboarding Stripe:", error);
      return false;
    }
  }

  /** Nouveau nom (utilisé par moi) */
  parseOnboardingReturn(url: string): OnboardingReturn {
    try {
      const { pathname } = new URL(url);
      if (pathname.includes('/stripe/success'))  return { success: true, type: 'success' };
      if (pathname.includes('/stripe/refresh'))  return { success: true, type: 'refresh' };
      if (pathname.includes('/stripe/cancel'))   return { success: true, type: 'cancel' };
      return { success: false };
    } catch (error) {
      console.error('Erreur parsing URL retour:', error);
      return { success: false };
    }
  }

  handleStripeReturn(url: string): OnboardingReturn {
    return this.parseOnboardingReturn(url);
  }
}

export const stripeService = new StripeService();
