import type { CreateFormuleInput } from './order';

/** Résumé d'un plat choisi dans un cran (affichage de la ligne formule). */
export interface CartFormuleSelectionSummary {
  course_name: string;
  item_name: string;
  extra_price?: number;
}

export interface CartItem {
  /** Identifiant local unique (front) pour gérer le panier et l’UI */
  id: string;

  /**
   * Type de ligne. 'dish' (défaut) = plat à la carte ; 'formule' = formule à
   * prix fixe (le détail des plats choisis vit dans `formule`/`formuleSummary`).
   */
  kind?: 'dish' | 'formule';

  /** ID du MenuItem backend, utilisé pour créer la commande -> items[].menu_item.
   *  Non significatif pour une ligne formule (mettre 0). */
  menuItemId: number;

  name: string;
  description?: string;
  image?: string;

  /** Prix unitaire affiché (le backend recalculera de toute façon).
   *  Pour une formule : prix de base + suppléments des plats choisis. */
  price: number;

  quantity: number;

  /** Contexte restaurant (panier mono-restaurant) */
  restaurantId: number;
  restaurantName: string;

  /** Notes par item côté client, mappées vers special_instructions */
  specialInstructions?: string;

  /** Options (ex: { sauce: 'mayo' }) mappées vers customizations */
  customizations?: Record<string, any>;

  /** Présent uniquement quand kind === 'formule' : payload backend (formule +
   *  sélections par cran) consommé par OrderCreateSerializer via createFromCart. */
  formule?: CreateFormuleInput;

  /** Présent uniquement quand kind === 'formule' : résumé lisible pour l'UI. */
  formuleSummary?: CartFormuleSelectionSummary[];
}

/** Argument de addFormuleToCart : ce que le configurateur produit. */
export interface AddFormulePayload {
  /** Payload backend (formule id, quantity, selections) issu de buildFormuleInput. */
  formule: CreateFormuleInput;
  /** Nom affiché de la formule. */
  name: string;
  /** Prix d'UNE formule (base + suppléments). */
  unitPrice: number;
  quantity: number;
  restaurantId: number;
  restaurantName: string;
  /** Résumé des plats choisis (affichage de la ligne panier). */
  summary: CartFormuleSelectionSummary[];
}

export interface Cart {
  items: CartItem[];
  restaurantId?: number;
  restaurantName?: string;
  tableNumber?: string;

  /** Montants calculés côté front pour affichage; le backend reste la source de vérité */
  subtotal: number;   // somme des (price * quantity)
  total: number;      // = subtotal (pas de deliveryFee/tax gérés côté front)

  itemCount: number;
}

export interface CartContextType {
  cart: Cart;

  // Ajoute un item (si restaurant différent => reset du panier)
  addToCart: (item: Omit<CartItem, 'quantity' | 'id'> & { id?: string }, quantity?: number) => void;

  // Ajoute une formule configurée (toujours une nouvelle ligne, jamais fusionnée)
  addFormuleToCart: (payload: AddFormulePayload) => void;

  // Supprime par identifiant local d’item (id)
  removeFromCart: (itemId: string) => void;

  // Met à jour la quantité
  updateQuantity: (itemId: string, quantity: number) => void;

  // Reset complet
  clearCart: () => void;

  // Helpers d’affichage
  getCartTotal: () => number;   // = cart.total
  getItemCount: () => number;   // = cart.itemCount

  // Panier mono-restaurant : true si vide ou même restaurant
  isCartForRestaurant: (restaurantId: number) => boolean;

  // Ajoute une méthode pour définir le numéro de table
  setTableNumber: (tableNumber: string) => void;
}