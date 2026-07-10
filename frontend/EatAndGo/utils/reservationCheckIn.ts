/**
 * Interception check-in au scan d'un QR de table.
 *
 * Appelé par QRScanner après extraction d'un code R<rid>T<num> valide :
 * si le client connecté a une réservation confirmée sur CETTE table dans
 * la fenêtre ±30 min, on lui propose de signaler son arrivée (check-in)
 * avant de continuer vers le flux table/menu habituel.
 *
 * Le check-in déclenche immédiatement la cuisine si la pré-commande
 * n'a pas encore été lancée (client en avance).
 *
 * Silencieux dans tous les autres cas : invité non connecté (401),
 * pas de réservation, table différente, erreur réseau → flux normal.
 */
import { Alert } from 'react-native';
import i18next from 'i18next';

import { reservationService } from '@/services/reservationService';

const CHECKIN_WINDOW_MS = 30 * 60 * 1000;

/** R12T005 → { restaurantId: 12, tableNumber: '5' } */
export function parseTableCode(
  code: string,
): { restaurantId: number; tableNumber: string } | null {
  const match = /^R(\d+)T(\d+)$/.exec(code);
  if (!match) return null;
  return {
    restaurantId: parseInt(match[1], 10),
    tableNumber: String(parseInt(match[2], 10)), // '005' → '5'
  };
}

/**
 * Propose le check-in si une réservation correspond au code scanné.
 * Résout toujours (après le choix de l'utilisateur le cas échéant) —
 * l'appelant enchaîne ensuite sur la navigation normale.
 */
export async function offerCheckInIfReserved(tableCode: string): Promise<void> {
  const parsed = parseTableCode(tableCode);
  if (!parsed) return;

  let reservation;
  try {
    const mine = await reservationService.getMine();
    const now = Date.now();
    reservation = mine.find(
      (r) =>
        r.status === 'confirmed' &&
        r.restaurant === parsed.restaurantId &&
        r.table_number != null &&
        String(parseInt(r.table_number, 10)) === parsed.tableNumber &&
        Math.abs(new Date(r.starts_at).getTime() - now) <= CHECKIN_WINDOW_MS,
    );
  } catch {
    // 401 invité / réseau → flux normal sans bruit
    return;
  }
  if (!reservation) return;

  const t = i18next.t.bind(i18next);
  const d = new Date(reservation.starts_at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  await new Promise<void>((resolve) => {
    Alert.alert(
      t('reservation.checkInPrompt.title'),
      t('reservation.checkInPrompt.message', {
        time,
        people: t('reservation.people', { count: reservation!.party_size }),
      }),
      [
        {
          text: t('reservation.checkInPrompt.later'),
          style: 'cancel',
          onPress: () => resolve(),
        },
        {
          text: t('reservation.checkInPrompt.confirm'),
          onPress: async () => {
            try {
              await reservationService.checkIn(reservation!.id, tableCode);
            } catch (e) {
              console.warn('[CheckIn] failed:', e);
              // Non bloquant : le client continue vers la table quoi qu'il
              // arrive, le staff peut toujours pointer côté plan de salle.
            }
            resolve();
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve() },
    );
  });
}
