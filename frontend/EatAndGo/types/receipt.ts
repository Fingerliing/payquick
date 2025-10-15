// Schéma de données conforme aux normes françaises
export interface ProcessedReceiptItem {
  name: string;
  description?: string;
  price: number; // Prix unitaire HT
  price_ttc: number; // Prix unitaire TTC
  quantity: number;
  total_price_ht: number; // Total HT pour cet article
  total_price_ttc: number; // Total TTC pour cet article
  tva_rate: number; // Taux de TVA (ex: 0.20 pour 20%)
  tva_amount: number; // Montant TVA pour cet article
  customizations?: Record<string, string | string[]>;
}

export interface ReceiptProps {
  orderId: string;
  order?: any;
  showActions?: boolean;
  onClose?: () => void;
  autoSendEmail?: boolean;
  customerEmail?: string;
}

export type VatDetailsMap = Record<string, { ht: number; tva: number }>;

export interface ReceiptViewData {
  order: {
    id?: number | string;
    order_number: string;
    order_type?: 'dine_in' | 'takeaway' | string;
    table_number?: string | number | null;
    sequential_number?: string; // Numéro séquentiel
    items: ProcessedReceiptItem[];
    subtotal_ht: number; // Sous-total HT
    subtotal_ttc: number; // Sous-total TTC
    total_tva: number; // Total TVA
    total_amount: number; // Total TTC final (avec pourboire)
    vat_details?: VatDetailsMap;
  };
  restaurantInfo: {
    name: string;
    address?: string;
    city?: string;
    postal_code?: string;
    phone?: string;
    email?: string;
    siret?: string;
    tva_number?: string; // Numéro de TVA intracommunautaire
    legal_form?: string; // Forme juridique
  };
  paymentInfo: {
    method?: string;
    amount?: number;
    tip?: number;
    transactionId?: string;
    paidAt: string; // ISO format
    sequential_receipt_number?: string; // Numéro séquentiel du ticket
  };
  customerInfo?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  legalInfo: {
    warranty_notice?: string; // Mention garantie légale si applicable
    tva_notice?: string; // Mention TVA non applicable si exonéré
    receipt_notice?: string; // Mention sur la conservation du ticket
  };
}