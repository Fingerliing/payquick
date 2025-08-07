import { MenuItem } from '@/types/menu'

export interface Table {
  id: string;
  number: string;
  identifiant: string;
  restaurant: string;
  capacity: number;
  is_active: boolean;
  qr_code?: string;
  qrCodeUrl: string;
  manualCode: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTablesRequest {
  restaurantId: string;
  tableCount: number;
  startNumber?: number;
  capacity?: number;
}

export interface CreateTablesResponse {
  tables: Table[];
  restaurant: string;
  success: boolean;
  message: string;
}

export interface TableQRInfo {
  table_id: string;
  table_number: string;
  identifiant: string;
  qr_code_url: string;
  qr_code_image?: string; // Base64
  manual_code: string;
}

export interface PublicTableMenuResponse {
  success: boolean;
  restaurant: {
    id: string;
    name: string;
    description?: string;
    cuisine: string;
    phone: string;
    address: string;
    price_range: string;
    accepts_meal_vouchers: boolean;
    meal_voucher_info?: string;
  };
  table: {
    number: string;
    identifiant: string;
    capacity: number;
  };
  menu: {
    id: string;
    name: string;
    categories: Record<string, MenuItem[]>;
  };
  ordering_info: {
    can_order: boolean;
    payment_methods: string[];
    accepts_meal_vouchers: boolean;
  };
}