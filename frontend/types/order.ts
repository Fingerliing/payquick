export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: number;
  table_number: string;
  items: OrderItem[];
  status: 'pending' | 'in_progress' | 'served' | 'paid'; // <- ajoute ici si tu l’utilises
  is_paid: boolean;
  created_at: string;
}

export interface OrderDetails {
  order: number;
  table: string;
  status: "pending" | "in_progress" | "served";
  items: OrderItem[];
}