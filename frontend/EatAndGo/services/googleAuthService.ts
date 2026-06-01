/**
 * Service de connexion Google Sign-In pour EatQuickeR.
 *
 * Utilise @react-native-google-signin/google-signin (SDK natif) — meilleure UX
 * qu'OAuth via WebView, requiert un dev/standalone build (incompatible Expo Go).
 *
 * Flux :
 *   1. configureGoogleSignIn() est appelé au démarrage de l'app (App layout)
 *   2. signInWithGoogle() ouvre la modal Google native et retourne l'idToken
 *   3. L'idToken est envoyé à POST /api/v1/auth/google/ pour échanger contre
 *      les JWT EatQuickeR
 *
 * IDs OAuth à configurer dans Google Cloud Console :
 *   - Web Client ID  → utilisé par `webClientId` (sert au signin Android)
 *   - iOS Client ID  → utilisé par `iosClientId` (signin iOS)
 *   Aucun Android Client ID à passer au SDK — il est implicite (Bundle ID + SHA-1).
 */
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

// ─── Configuration ───────────────────────────────────────────────────────────

const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  (Constants.expoConfig?.extra as any)?.googleWebClientId;

const IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  (Constants.expoConfig?.extra as any)?.googleIosClientId;

let isConfigured = false;

/**
 * Configure le SDK Google Sign-In.
 * À appeler une seule fois au démarrage de l'app (RootLayout / _layout.tsx).
 * Idempotent : appels multiples sont sans effet.
 */
export function configureGoogleSignIn(): void {
  if (isConfigured) return;

  if (!WEB_CLIENT_ID) {
    console.warn(
      '⚠️ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID non défini — Google Sign-In désactivé'
    );
    return;
  }

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID, // optionnel sur Android, requis sur iOS
    scopes: ['email', 'profile'],
    offlineAccess: false, // pas de refresh token Google côté serveur
    forceCodeForRefreshToken: false,
  });

  isConfigured = true;
  console.log('✅ Google Sign-In configuré');
}

/** True si la config a été tentée et les Client IDs sont présents. */
export function isGoogleSignInAvailable(): boolean {
  return Boolean(WEB_CLIENT_ID);
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GoogleSignInResult {
  idToken: string;
  email: string;
  givenName: string | null;
  familyName: string | null;
  photo: string | null;
}

export class GoogleSignInError extends Error {
  code: 'CANCELLED' | 'IN_PROGRESS' | 'PLAY_SERVICES_UNAVAILABLE' | 'NO_ID_TOKEN' | 'UNKNOWN';

  constructor(code: GoogleSignInError['code'], message: string) {
    super(message);
    this.name = 'GoogleSignInError';
    this.code = code;
  }
}

// ─── Sign-In ─────────────────────────────────────────────────────────────────

/**
 * Lance la procédure de connexion Google.
 * Ouvre la modal native Google et retourne l'idToken + infos profil.
 *
 * @throws GoogleSignInError si l'utilisateur annule, Play Services indisponible, etc.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  if (!isConfigured) {
    configureGoogleSignIn();
  }

  if (!isGoogleSignInAvailable()) {
    throw new GoogleSignInError(
      'UNKNOWN',
      'Google Sign-In n\'est pas configuré (Client IDs manquants).'
    );
  }

  try {
    // Vérification Play Services (Android) — no-op sur iOS
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    if (!isSuccessResponse(response)) {
      // L'utilisateur a annulé (sur certaines versions, la réponse n'est pas
      // un SUCCESS plutôt qu'une exception CANCELLED).
      throw new GoogleSignInError('CANCELLED', 'Connexion Google annulée.');
    }

    const { idToken, user } = response.data;

    if (!idToken) {
      throw new GoogleSignInError(
        'NO_ID_TOKEN',
        'Google n\'a pas retourné d\'idToken. Vérifiez la configuration du webClientId.'
      );
    }

    return {
      idToken,
      email: user.email,
      givenName: user.givenName,
      familyName: user.familyName,
      photo: user.photo,
    };
  } catch (error: any) {
    if (error instanceof GoogleSignInError) {
      throw error;
    }

    if (isErrorWithCode(error)) {
      switch (error.code) {
        case statusCodes.SIGN_IN_CANCELLED:
          throw new GoogleSignInError('CANCELLED', 'Connexion Google annulée.');
        case statusCodes.IN_PROGRESS:
          throw new GoogleSignInError(
            'IN_PROGRESS',
            'Une connexion Google est déjà en cours.'
          );
        case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
          throw new GoogleSignInError(
            'PLAY_SERVICES_UNAVAILABLE',
            'Google Play Services n\'est pas disponible sur cet appareil.'
          );
        default:
          console.error('Google Sign-In error:', error);
          throw new GoogleSignInError(
            'UNKNOWN',
            error.message || 'Erreur lors de la connexion Google.'
          );
      }
    }

    console.error('Google Sign-In unexpected error:', error);
    throw new GoogleSignInError(
      'UNKNOWN',
      error?.message || 'Erreur inattendue lors de la connexion Google.'
    );
  }
}

// ─── Sign-Out ────────────────────────────────────────────────────────────────

/**
 * Déconnecte l'utilisateur de Google (révoque la session côté SDK Google).
 * À appeler dans le logout EatQuickeR si l'utilisateur s'est connecté via Google.
 * Ne lève pas d'exception : un échec de signOut Google ne doit pas bloquer le
 * logout principal.
 */
export async function signOutFromGoogle(): Promise<void> {
  try {
    if (!isConfigured) return;
    const currentUser = await GoogleSignin.getCurrentUser();
    if (currentUser) {
      await GoogleSignin.signOut();
    }
  } catch (error) {
    console.warn('⚠️ Erreur lors du signOut Google (ignorée):', error);
  }
}
