/**
 * Service Sign in with Apple (expo-apple-authentication).
 *
 * Miroir de googleAuthService : ouvre la feuille native Apple, retourne
 * l'identityToken signé + les infos de profil, et normalise les erreurs
 * dans AppleSignInError (avec un code 'CANCELLED' silencieux côté UI,
 * comme GoogleSignInError).
 *
 * Particularités Apple :
 * - iOS uniquement (isAppleSignInAvailable() retourne false ailleurs).
 * - fullName et email ne sont fournis qu'au TOUT PREMIER sign-in pour
 *   cette app. Les fois suivantes, credential.fullName/email sont null —
 *   l'email reste néanmoins présent DANS l'identityToken, que le backend
 *   décode. On transmet donc givenName au backend uniquement quand on l'a.
 * - Nécessite le plugin `expo-apple-authentication` dans app.json et
 *   `ios.usesAppleSignIn: true` (entitlement com.apple.developer.applesignin).
 */
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppleSignInResult {
  identityToken: string;
  /** Prénom — non-null uniquement au premier sign-in. */
  givenName: string | null;
  /** Nom de famille — non-null uniquement au premier sign-in. */
  familyName: string | null;
  /** Email (réel ou relais privé) — non-null uniquement au premier sign-in.
   *  Le backend le lit de toute façon dans l'identityToken. */
  email: string | null;
}

export class AppleSignInError extends Error {
  code: 'CANCELLED' | 'NOT_AVAILABLE' | 'NO_IDENTITY_TOKEN' | 'UNKNOWN';

  constructor(code: AppleSignInError['code'], message: string) {
    super(message);
    this.name = 'AppleSignInError';
    this.code = code;
  }
}

// ─── Disponibilité ───────────────────────────────────────────────────────────

/**
 * True si Sign in with Apple est utilisable sur cet appareil.
 * False sur Android, sur simulateurs sans compte iCloud, ou si l'entitlement
 * manque dans le build.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

// ─── Sign-In ─────────────────────────────────────────────────────────────────

/**
 * Lance la procédure Sign in with Apple.
 * Ouvre la feuille native Apple et retourne l'identityToken + infos profil.
 *
 * @throws AppleSignInError si l'utilisateur annule, plateforme non supportée, etc.
 */
export async function signInWithApple(): Promise<AppleSignInResult> {
  if (Platform.OS !== 'ios') {
    throw new AppleSignInError(
      'NOT_AVAILABLE',
      "Sign in with Apple n'est disponible que sur iOS."
    );
  }

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      throw new AppleSignInError(
        'NO_IDENTITY_TOKEN',
        "Apple n'a pas retourné d'identityToken. Vérifiez l'entitlement Sign in with Apple du build."
      );
    }

    return {
      identityToken: credential.identityToken,
      givenName: credential.fullName?.givenName ?? null,
      familyName: credential.fullName?.familyName ?? null,
      email: credential.email ?? null,
    };
  } catch (error: any) {
    if (error instanceof AppleSignInError) {
      throw error;
    }

    // Annulation utilisateur : code selon les versions du SDK Expo.
    if (
      error?.code === 'ERR_REQUEST_CANCELED' ||
      error?.code === 'ERR_CANCELED' ||
      error?.code === 'ERR_REQUEST_UNKNOWN' && /cancel/i.test(String(error?.message ?? ''))
    ) {
      throw new AppleSignInError('CANCELLED', 'Connexion Apple annulée.');
    }

    console.error('Apple Sign-In error:', error);
    throw new AppleSignInError(
      'UNKNOWN',
      error?.message || 'Erreur lors de la connexion Apple.'
    );
  }
}
