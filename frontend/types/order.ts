export interface Order {
  [id: number]: number;
}

export interface OrderItem {
  menu_item: string;
  quantity: number;
  price: number;
}

export interface OrderDetails {
  order: number;
  table: string;
  status: "pending" | "in_progress" | "served";
  items: OrderItem[];
}