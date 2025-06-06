export interface Order {
  [id: number]: number;
}

export interface OrderItem {
  plat: string;
  quantite: number;
  prix: number;
}

export interface OrderDetails {
  commande: number;
  table: string;
  status: "pending" | "in_progress" | "served";
  plats: OrderItem[];
}