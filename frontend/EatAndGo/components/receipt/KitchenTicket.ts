/**
 * KitchenTicket — bon de cuisine (« bon d'envoi »).
 *
 * À ne pas confondre avec le ticket de caisse de `Receipt.tsx` : celui-ci part
 * en cuisine au moment où le serveur envoie la commande. Il ne porte donc
 * AUCUN prix — le cuisinier a besoin de la table, du nombre de couverts, des
 * quantités et des notes, rien d'autre. Un prix sur un bon d'envoi est du bruit
 * et une source d'erreur.
 *
 * Contenu volontairement en français, comme le ticket de caisse : c'est un
 * document interne destiné à la brigade, pas à la clientèle.
 *
 * Format : rouleau thermique 80 mm, police à chasse fixe, gros corps sur les
 * quantités et le numéro de table (un bon se lit à un mètre, en coup d'œil).
 */
import * as Print from 'expo-print';

import type { OrderDetail, OrderItem } from '@/types/order';

// =============================================================================
// TYPES
// =============================================================================

export interface KitchenTicketLine {
  name: string;
  quantity: number;
  /**
   * Instruction spécifique à la ligne (cuisson, sans oignon…).
   * Les sauts de ligne produisent une ligne de note par élément : c'est ce
   * qui permet de détailler les crans d'une formule sous son libellé.
   */
  note?: string;
}

export interface KitchenTicketData {
  restaurantName?: string;
  /** Vide ou absent ⇒ le bon est marqué « À EMPORTER ». */
  tableNumber?: string | null;
  orderNumber?: string;
  /** Date d'envoi ; par défaut, maintenant. */
  createdAt?: Date;
  guestCount?: number | null;
  /**
   * Rang de l'envoi dans la session de table. > 1 déclenche le bandeau
   * « SUITE », qui évite qu'un cuisinier prenne un rappel pour un doublon.
   */
  sequence?: number | null;
  /** Note générale de commande (allergies, remarques de salle). */
  notes?: string;
  items: KitchenTicketLine[];
}

// =============================================================================
// HELPERS
// =============================================================================

/** Échappement HTML : les noms de plats et notes sont saisis librement. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "19:42" — heure d'envoi, la seule qui intéresse la cuisine. */
function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** "22/07" — utile quand un bon traîne sur le passe. */
function formatDay(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${mo}`;
}

// =============================================================================
// GÉNÉRATION
// =============================================================================

export function buildKitchenTicketHTML(data: KitchenTicketData): string {
  const date = data.createdAt ?? new Date();
  const sequence = data.sequence ?? 1;
  const isFollowUp = sequence > 1;
  const totalItems = data.items.reduce((acc, l) => acc + l.quantity, 0);

  const guests =
    typeof data.guestCount === 'number' && data.guestCount > 0
      ? `${data.guestCount} COUVERT${data.guestCount > 1 ? 'S' : ''}`
      : '';

  const table = String(data.tableNumber ?? '').trim();
  const heading = table ? `TABLE ${table}` : 'À EMPORTER';

  const followUpBlock = isFollowUp
    ? `
    <div class="followup">
      <div class="followup-main">*** SUITE ***</div>
      <div class="followup-sub">ENVOI N&deg;${esc(sequence)}</div>
    </div>`
    : '';

  const itemsBlock = data.items
    .map(
      line => `
      <div class="line">
        <span class="qty">${esc(line.quantity)}</span>
        <span class="name">${esc(line.name)}</span>
      </div>
      ${(line.note ?? '')
        .split('\n')
        .map(n => n.trim())
        .filter(Boolean)
        .map(n => `<div class="line-note">&gt;&gt; ${esc(n)}</div>`)
        .join('')}`,
    )
    .join('');

  const notesBlock = data.notes?.trim()
    ? `
    <div class="sep"></div>
    <div class="notes">
      <div class="notes-title">NOTE</div>
      <div class="notes-body">${esc(data.notes.trim())}</div>
    </div>`
    : '';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      /* Rouleau 80 mm. Passer à 58mm ici si le parc d'imprimantes change. */
      @page { size: 80mm auto; margin: 0; }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        padding: 4mm 3mm;
        width: 80mm;
        font-family: 'Courier New', Courier, monospace;
        font-size: 13px;
        line-height: 1.35;
        color: #000;
        -webkit-print-color-adjust: exact;
      }

      .center { text-align: center; }
      .bold { font-weight: 700; }

      .rule    { border-top: 2px solid #000; margin: 3px 0; }
      .sep     { border-top: 1px dashed #000; margin: 5px 0; }

      .restaurant {
        text-align: center;
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      /* Bandeau SUITE : inversé pour être repérable sur un passe encombré. */
      .followup {
        text-align: center;
        background: #000;
        color: #fff;
        padding: 4px 0;
        margin: 4px 0;
      }
      .followup-main { font-size: 18px; font-weight: 700; letter-spacing: 2px; }
      .followup-sub  { font-size: 13px; font-weight: 700; }

      .table-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-top: 4px;
      }
      .table-no  { font-size: 26px; font-weight: 700; line-height: 1.1; }
      .guests    { font-size: 14px; font-weight: 700; }

      .meta {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        margin-top: 2px;
      }

      .items { margin: 6px 0; }

      .line {
        display: flex;
        align-items: baseline;
        gap: 6px;
        margin: 7px 0 0;
      }
      .qty {
        min-width: 26px;
        font-size: 20px;
        font-weight: 700;
        text-align: right;
      }
      .name {
        flex: 1;
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        word-break: break-word;
      }
      .line-note {
        margin: 1px 0 0 34px;
        font-size: 13px;
        font-style: italic;
      }

      .notes-title { font-size: 12px; font-weight: 700; }
      .notes-body  { font-size: 14px; font-weight: 700; word-break: break-word; }

      .total {
        text-align: center;
        font-size: 14px;
        font-weight: 700;
        padding: 3px 0;
      }

      /* Marge de coupe : sans elle, le massicot ampute la dernière ligne. */
      .tail { height: 12mm; }
    </style>
  </head>
  <body>
    ${data.restaurantName ? `<div class="restaurant">${esc(data.restaurantName)}</div>` : ''}
    <div class="rule"></div>
    ${followUpBlock}

    <div class="table-row">
      <span class="table-no">${esc(heading)}</span>
      ${guests ? `<span class="guests">${esc(guests)}</span>` : ''}
    </div>

    <div class="meta">
      <span>${data.orderNumber ? esc(data.orderNumber) : ''}</span>
      <span>${esc(formatDay(date))} ${esc(formatTime(date))}</span>
    </div>

    <div class="rule"></div>

    <div class="items">${itemsBlock}</div>
    ${notesBlock}

    <div class="rule"></div>
    <div class="total">${esc(totalItems)} ARTICLE${totalItems > 1 ? 'S' : ''}</div>
    <div class="rule"></div>

    <div class="tail"></div>
  </body>
</html>`;
}

// =============================================================================
// MAPPING DEPUIS UNE COMMANDE EXISTANTE
// =============================================================================

/** Libellé d'une ligne, quel que soit son type (plat à la carte ou formule). */
function lineName(item: OrderItem): string {
  return String(
    item.display_name || item.label || item.menu_item_name || '',
  ).trim();
}

/**
 * Notes d'une ligne : les crans d'une formule (« Entrée : Salade César ») plus
 * l'instruction saisie. La cuisine doit voir le détail d'une formule, sinon
 * elle ne sait pas quoi envoyer.
 */
function lineNote(item: OrderItem): string {
  const parts: string[] = [];

  (item.components ?? [])
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .forEach(c => {
      const dish = String(c.menu_item_name ?? '').trim();
      if (dish) parts.push(`${String(c.course_name ?? '').trim()} : ${dish}`);
    });

  const instructions = String(item.special_instructions ?? '').trim();
  if (instructions) parts.push(instructions);

  return parts.join('\n');
}

/**
 * Construit un bon depuis une commande déjà enregistrée — permet la
 * réimpression depuis le détail de commande.
 *
 * `items` est passé à part pour que l'appelant puisse fournir la liste déjà
 * regroupée (`groupIdenticalItems`) et que le bon corresponde à ce qui est
 * affiché à l'écran.
 */
export function kitchenTicketFromOrder(
  order: OrderDetail,
  items: OrderItem[] = order.items ?? [],
): KitchenTicketData {
  return {
    restaurantName: order.restaurant_name,
    tableNumber: order.table_number,
    orderNumber: order.order_number,
    createdAt: order.created_at ? new Date(order.created_at) : new Date(),
    // Le nombre de couverts n'existe pas sur OrderDetail : il est porté par les
    // notes de commande, où la prise de commande l'a préfixé.
    guestCount: null,
    // Présent uniquement si la commande vient de l'endpoint table-orders.
    sequence: (order as any).order_sequence ?? null,
    notes: order.notes ?? '',
    items: items.map(item => ({
      name: lineName(item),
      quantity: item.quantity,
      note: lineNote(item),
    })),
  };
}

// =============================================================================
// IMPRESSION
// =============================================================================

/**
 * ⚠️ SEUL POINT DE COUPLAGE AVEC LE MATÉRIEL.
 *
 * On passe par `expo-print`, qui rend le HTML et ouvre la feuille d'impression
 * système (AirPrint / service d'impression Android). C'est ce que fait déjà
 * `Receipt.tsx` pour le ticket de caisse.
 *
 * Si le parc tourne en réalité sur un pont ESC/POS Bluetooth, c'est
 * EXCLUSIVEMENT cette fonction qu'il faut réécrire : `buildKitchenTicketHTML`
 * et tous les appelants restent inchangés.
 */
export async function printKitchenTicket(data: KitchenTicketData): Promise<void> {
  const html = buildKitchenTicketHTML(data);
  await Print.printAsync({ html });
}