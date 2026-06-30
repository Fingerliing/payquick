/**
 * Service de connexion Google Sign-In pour EatQuickeR.
 *
 * Utilise @react-native-google-signin/google-signin (SDK natif) — meilleure UX
 * qu'OAuth via WebView, requiert un dev/standalone build (incompatible Expo Go).
 *
 * IMPORTANT — Compatibilité Expo Go :
 *   Le SDK Google embarque un TurboModule natif (`RNGoogleSignin`) qui n'existe
 *   pas dans Expo Go. Importer le package au top-level fait crasher TOUTE
 *   l'application au démarrage en Expo Go ("RNGoogleSignin could not be found").
 *
 *   Stratégie : on détecte l'environnement (Expo Go vs dev/standalone build) et
 *   on charge le SDK *paresseusement* via `require()`. Ainsi le module est
 *   importable partout, et le bouton "Continuer avec Google" reste désactivé
 *   en Expo Go sans casser l'app.
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
import Constants from 'expo-constants';

// ─── Détection environnement ────────────────────────────────────────────────

/**
 * True si l'app tourne dans Expo Go (où les modules natifs custom ne sont pas
 * disponibles). En dev build ou standalone build, on a accès au SDK natif.
 *
 * - executionEnvironment === 'storeClient' → Expo Go
 * - appOwnership === 'expo' → Expo Go (compat ancienne API)
 */
const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  (Constants as any).appOwnership === 'expo';

// ─── Configuration ───────────────────────────────────────────────────────────

const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  (Constants.expoConfig?.extra as any)?.googleWebClientId;

const IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
  (Constants.expoConfig?.extra as any)?.googleIosClientId;

let isConfigured = false;

// ─── Lazy holders pour le SDK natif ──────────────────────────────────────────
// On ne charge le module qu'à la demande, et jamais en Expo Go.

type GoogleSdk = {
  GoogleSignin: any;
  isErrorWithCode: (e: any) => boolean;
  isSuccessResponse: (r: any) => boolean;
  statusCodes: {
    SIGN_IN_CANCELLED: string;
    IN_PROGRESS: string;
    PLAY_SERVICES_NOT_AVAILABLE: string;
    [k: string]: string;
  };
};

let sdkCache: GoogleSdk | null = null;
let sdkLoadFailed = false;

function loadGoogleSdk(): GoogleSdk | null {
  if (isExpoGo) return null;
  if (sdkCache) return sdkCache;
  if (sdkLoadFailed) return null;

  try {
    // require() paresseux : pas exécuté tant que la fonction n'est pas appelée.
    // Évite le crash au démarrage en Expo Go.
    const mod = require('@react-native-google-signin/google-signin');
    sdkCache = {
      GoogleSignin: mod.GoogleSignin,
      isErrorWithCode: mod.isErrorWithCode,
      isSuccessResponse: mod.isSuccessResponse,
      statusCodes: mod.statusCodes,
    };
    return sdkCache;
  } catch (e) {
    sdkLoadFailed = true;
    console.warn(
      '⚠️ @react-native-google-signin/google-signin indisponible ' +
        '(Expo Go ou module natif manquant) :',
      e
    );
    return null;
  }
}

/**
 * Configure le SDK Google Sign-In.
 * À appeler une seule fois au démarrage de l'app (RootLayout / _layout.tsx).
 * Idempotent : appels multiples sont sans effet.
 * No-op en Expo Go.
 */
export function configureGoogleSignIn(): void {
  if (isConfigured) return;

  if (isExpoGo) {
    console.log(
      'ℹ️ Google Sign-In désactivé dans Expo Go (nécessite un dev build ou un build standalone).'
    );
    return;
  }

  const sdk = loadGoogleSdk();
  if (!sdk) return;

  if (!WEB_CLIENT_ID) {
    console.warn(
      '⚠️ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID non défini — Google Sign-In désactivé'
    );
    return;
  }

  sdk.GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID, // optionnel sur Android, requis sur iOS
    scopes: ['email', 'profile'],
    offlineAccess: false, // pas de refresh token Google côté serveur
    forceCodeForRefreshToken: false,
  });

  isConfigured = true;
  console.log('✅ Google Sign-In configuré');
}

/** True si la config a été tentée et les Client IDs sont présents. False en Expo Go. */
export function isGoogleSignInAvailable(): boolean {
  if (isExpoGo) return false;
  if (sdkLoadFailed) return false;
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
  code:
    | 'CANCELLED'
    | 'IN_PROGRESS'
    | 'PLAY_SERVICES_UNAVAILABLE'
    | 'NO_ID_TOKEN'
    | 'NOT_AVAILABLE'
    | 'UNKNOWN';

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
  if (isExpoGo) {
    throw new GoogleSignInError(
      'NOT_AVAILABLE',
      "Google Sign-In n'est pas disponible dans Expo Go. Utilisez un dev build."
    );
  }

  const sdk = loadGoogleSdk();
  if (!sdk) {
    throw new GoogleSignInError(
      'NOT_AVAILABLE',
      'Module Google Sign-In introuvable. Rebuildez l\'application.'
    );
  }

  if (!isConfigured) {
    configureGoogleSignIn();
  }

  if (!isGoogleSignInAvailable()) {
    throw new GoogleSignInError(
      'NOT_AVAILABLE',
      "Google Sign-In n'est pas configuré (Client IDs manquants)."
    );
  }

  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = sdk;

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
        "Google n'a pas retourné d'idToken. Vérifiez la configuration du webClientId."
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
            "Google Play Services n'est pas disponible sur cet appareil."
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
 * logout principal. No-op en Expo Go.
 */
export async function signOutFromGoogle(): Promise<void> {
  if (isExpoGo) return;

  try {
    const sdk = loadGoogleSdk();
    if (!sdk) return;
    if (!isConfigured) return;

    const currentUser = await sdk.GoogleSignin.getCurrentUser();
    if (currentUser) {
      await sdk.GoogleSignin.signOut();
    }
  } catch (error) {
    console.warn('⚠️ Erreur lors du signOut Google (ignorée):', error);
  }
}