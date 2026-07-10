/**
 * Session de pré-commande de réservation.
 *
 * Quand le client choisit "Réserver et pré-commander", la réservation est
 * créée en pending_payment (créneau bloqué 15 min côté backend) et cette
 * session mémorise le contexte pendant qu'il compose son panier dans le
 * menu. Le panier détecte la session active et route le checkout vers
 * /reservation/pre-order-checkout au lieu du flux commande classique.
 *
 * AsyncStorage (pas secureStorage) : données non sensibles, même pattern
 * que @qr_session_data dans CartContext.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREORDER_SESSION_KEY = '@reservation_preorder_session';

export interface PreOrderSession {
  reservationId: string;
  restaurantId: number;
  tableNumber: string | null;
  startsAt: string; // ISO — heure de la réservation
  expiresAt: string | null; // ISO — deadline de paiement (créneau bloqué)
}

export async function savePreOrderSession(session: PreOrderSession): Promise<void> {
  try {
    await AsyncStorage.setItem(PREORDER_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('[PreOrderSession] save error:', e);
  }
}

/** Retourne la session si elle existe ET n'est pas expirée (sinon nettoie). */
export async function getActivePreOrderSession(): Promise<PreOrderSession | null> {
  try {
    const raw = await AsyncStorage.getItem(PREORDER_SESSION_KEY);
    if (!raw) return null;
    const session: PreOrderSession = JSON.parse(raw);
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      await clearPreOrderSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function clearPreOrderSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREORDER_SESSION_KEY);
  } catch (e) {
    console.error('[PreOrderSession] clear error:', e);
  }
}
