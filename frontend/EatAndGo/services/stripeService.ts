import { apiClient } from './api';
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// -----------------------
// Types
// -----------------------
export interface StripeAccountStatus {
  status?: 'account_exists' | 'needs_onboarding' | 'pending' | 'unknown' | 'no_account' | 'client_account' | string;
  account_id?: string;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  requirements?: any;
  has_validated_profile?: boolean; // Côté app, on s'aligne sur ce bool pour l'UI
}

export interface StripeOnboarding {
  account_id?: string;
  onboarding_url: string;
  message?: string;
}

type OnboardingReturn =
  | { success: true; type: 'success' | 'refresh' | 'cancel' }
  | { success: false };

// -----------------------
// Constantes endpoints
// (conformes aux vues Django: create_stripe_account, get_stripe_account_status, create_onboarding_link)
// -----------------------
const CREATE_ACCOUNT_URL     = '/api/v1/stripe/create-account/';
const ACCOUNT_STATUS_URL     = '/api/v1/stripe/account-status/';
const ONBOARDING_LINK_URL    = '/api/v1/stripe/onboarding-link/';

// -----------------------
// Service
// -----------------------
class StripeService {
  /** Créer/initialiser un compte Connect et obtenir (premier) lien d’onboarding */
  async createAccount(): Promise<StripeOnboarding> {
    // Django → create_stripe_account → { account_id, onboarding_url, ... }
    return apiClient.post<StripeOnboarding>(CREATE_ACCOUNT_URL);
  }

  /** Statut du compte Connect (aligne `has_validated_profile` avec le backend) */
  async getAccountStatus(): Promise<StripeAccountStatus> {
    // Django → get_stripe_account_status
    return apiClient.get<StripeAccountStatus>(ACCOUNT_STATUS_URL);
  }

  /** (Ré)obtenir un lien d’onboarding (si compte déjà créé) */
  async createOnboardingLink(): Promise<StripeOnboarding> {
    // Django → create_onboarding_link → { onboarding_url }
    return apiClient.post<StripeOnboarding>(ONBOARDING_LINK_URL);
  }

  /**
   * Ouvre l’onboarding dans un navigateur (préférence WebBrowser si dispo).
   * Si aucun compte n’existe encore, tente d’abord `createAccount()`, puis relance.
   */
  async openStripeOnboarding(url?: string): Promise<boolean> {
    try {
      let onboardingUrl = url;

      // Si aucune URL fournie, on essaye d'abord de récupérer un lien existant
      if (!onboardingUrl) {
        try {
          const link = await this.createOnboardingLink();
          onboardingUrl = link.onboarding_url;
        } catch (err: any) {
          // Pas de compte ? On le crée puis on retente.
          // (Le backend renvoie 400 "Aucun compte Stripe trouvé" dans ce cas.)
          try {
            const created = await this.createAccount();
            onboardingUrl = created.onboarding_url;
          } catch (e) {
            throw err; // remonter l’erreur initiale si création échoue aussi
          }
        }
      }

      if (!onboardingUrl) throw new Error('No onboarding URL');

      // UX: essayer Linking d’abord (Android/iOS), sinon WebBrowser
      const canOpen = await Linking.canOpenURL(onboardingUrl);
      if (canOpen) {
        await Linking.openURL(onboardingUrl);
        return true;
      } else {
        await WebBrowser.openBrowserAsync(onboardingUrl);
        return true;
      }
    } catch (error) {
      console.error("Impossible d'ouvrir l'onboarding Stripe:", error);
      return false;
    }
  }

  /** Parse le retour de deep link (eatandgo://stripe/...) défini côté backend */
  parseOnboardingReturn(url: string): OnboardingReturn {
    try {
      const { pathname } = new URL(url);
      if (pathname.includes('/stripe/success')) return { success: true, type: 'success' };
      if (pathname.includes('/stripe/refresh')) return { success: true, type: 'refresh' };
      if (pathname.includes('/stripe/cancel'))  return { success: true, type: 'cancel' };
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
