/**
 * Utilitaires JWT — décodage UNIQUEMENT (pas de vérification de signature).
 *
 * Sert à lire la claim `exp` côté client pour planifier un refresh proactif
 * AVANT l'expiration. JAMAIS utilisé pour des décisions de sécurité —
 * c'est le serveur qui valide la signature.
 *
 * En React Native, `atob` est disponible globalement depuis RN 0.74.
 */

export interface JWTPayload {
  exp?: number;          // Expiration (Unix seconds)
  iat?: number;          // Issued at (Unix seconds)
  jti?: string;
  token_type?: string;
  user_id?: number;
  [key: string]: any;
}

/**
 * Décode un JWT sans vérifier la signature.
 * Retourne null si le token est mal formé.
 */
export function decodeJWT(token: string | null | undefined): JWTPayload | null {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // base64url → base64 standard, puis padding
    const standard = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);

    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Délai en ms avant expiration.
 *  - Négatif → déjà expiré
 *  - null    → token invalide ou sans claim `exp`
 */
export function getTokenExpiresInMs(token: string | null | undefined): number | null {
  const payload = decodeJWT(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000 - Date.now();
}

/**
 * `true` si le token est expiré OU expirera dans les `bufferMs` prochaines ms.
 */
export function isTokenExpiringSoon(
  token: string | null | undefined,
  bufferMs: number = 60_000
): boolean {
  const remaining = getTokenExpiresInMs(token);
  if (remaining === null) return true;
  return remaining <= bufferMs;
}