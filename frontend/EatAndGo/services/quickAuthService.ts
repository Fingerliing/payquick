import secureStorage from '@/utils/secureStorage';

let LocalAuthentication: typeof import('expo-local-authentication') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  LocalAuthentication = require('expo-local-authentication');
} catch {
  LocalAuthentication = null;
  if (__DEV__) {
    console.warn(
      '[quickAuth] Module natif expo-local-authentication absent — ' +
        'reconnexion biométrique désactivée. Rebuild natif requis (eas build).',
    );
  }
}

// Stockés dans le Keychain/Keystore via expo-secure-store, jamais AsyncStorage.
const KEYS = {
  EMAIL: 'quick_auth_email',
  PASSWORD: 'quick_auth_password',
  ENABLED: 'quick_auth_enabled',
} as const;

export interface SavedCredentials {
  email: string;
  password: string;
}

class QuickAuthService {
  /** Le module natif de biométrie est-il chargé dans ce build ? */
  private get isNativeAvailable(): boolean {
    return LocalAuthentication !== null;
  }

  /** Enregistre les identifiants (appelé après un login réussi si "Se souvenir de moi"). */
  async saveCredentials(email: string, password: string): Promise<void> {
    await secureStorage.setItem(KEYS.EMAIL, email);
    await secureStorage.setItem(KEYS.PASSWORD, password);
    await secureStorage.setItem(KEYS.ENABLED, '1');
  }

  /** Purge les identifiants (désactivation "Se souvenir de moi" ou identifiants périmés). */
  async clearCredentials(): Promise<void> {
    await secureStorage.removeItem(KEYS.EMAIL);
    await secureStorage.removeItem(KEYS.PASSWORD);
    await secureStorage.removeItem(KEYS.ENABLED);
  }

  /**
   * Y a-t-il une reconnexion 1-clic disponible ?
   * Faux si le module natif n'est pas dispo (le bouton ne s'affiche pas) OU
   * si aucun identifiant n'est mémorisé.
   */
  async isEnabled(): Promise<boolean> {
    if (!this.isNativeAvailable) return false;
    const enabled = await secureStorage.getItem(KEYS.ENABLED);
    const email = await secureStorage.getItem(KEYS.EMAIL);
    return enabled === '1' && !!email;
  }

  /** Email seul, pour pré-remplir le formulaire (pas de gate biométrique requis). */
  async getSavedEmail(): Promise<string | null> {
    return secureStorage.getItem(KEYS.EMAIL);
  }

  /** La biométrie est-elle disponible ET configurée sur l'appareil ? */
  async isBiometricAvailable(): Promise<boolean> {
    if (!LocalAuthentication) return false;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  }

  /**
   * Reconnexion 1-clic : prompt biométrique → si OK, retourne les identifiants.
   * Retourne null si module natif absent / annulé / échec / aucun identifiant.
   */
  async quickReconnect(): Promise<SavedCredentials | null> {
    if (!LocalAuthentication) return null;
    if (!(await this.isEnabled())) return null;

    // Si la biométrie est dispo, on l'exige. Sinon on retombe sur le code
    // de l'appareil (disableDeviceFallback=false). Pour FORCER la biométrie
    // et refuser le 1-clic sans elle, remplace ce bloc par `return null`.
    const biometricOk = await this.isBiometricAvailable();
    if (biometricOk) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Se reconnecter à EatQuickeR',
        cancelLabel: 'Annuler',
        fallbackLabel: 'Code de l\'appareil',
        disableDeviceFallback: false,
      });
      if (!result.success) return null;
    }

    const email = await secureStorage.getItem(KEYS.EMAIL);
    const password = await secureStorage.getItem(KEYS.PASSWORD);
    if (!email || !password) return null;

    return { email, password };
  }
}

export const quickAuthService = new QuickAuthService();
export default quickAuthService;