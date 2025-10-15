export interface CartItem {
  /** Identifiant local unique (front) pour gérer le panier et l’UI */
  id: string;

  /** ID du MenuItem backend, utilisé pour créer la commande -> items[].menu_item */
  menuItemId: number;

  name: string;
  description?: string;
  image?: string;

  /** Prix unitaire affiché (le backend recalculera de toute façon) */
  price: number;

  quantity: number;

  /** Contexte restaurant (panier mono-restaurant) */
  restaurantId: number;
  restaurantName: string;

  /** Notes par item côté client, mappées vers special_instructions */
  specialInstructions?: string;

  /** Options (ex: { sauce: 'mayo' }) mappées vers customizations */
  customizations?: Record<string, any>;
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