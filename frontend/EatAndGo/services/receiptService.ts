import { apiClient } from './api';

export interface ReceiptData {
  order_id: number;
  order_number: string;
  restaurant_name: string;
  restaurant_address: string;
  restaurant_phone?: string;
  restaurant_email?: string;
  restaurant_siret?: string;
  
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  table_number?: string;
  
  items: Array<{
    name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    customizations?: string;
    special_instructions?: string;
  }>;
  
  subtotal: number;
  tip_amount?: number;
  tip_percentage?: number;
  tax_amount?: number;
  tax_rate?: number;
  total: number;
  
  payment_method: string;
  payment_status: string;
  payment_date: string;
  
  created_at: string;
  served_at?: string;
  
  transaction_id?: string;
  cashier_name?: string;
  notes?: string;
}

export interface EmailReceiptRequest {
  order_id: number;
  email: string;
  include_qr_code?: boolean;
}

export class ReceiptService {
  // Générer les données du ticket
  async generateReceiptData(orderId: any): Promise<ReceiptData> {
    const _id = (orderId && typeof orderId === "object") ? orderId.id : orderId;
  
    return apiClient.get(`/api/v1/orders/${Number(_id)}/receipt/`);
  }

  // Envoyer le ticket par email
  async sendReceiptByEmail(request: EmailReceiptRequest): Promise<{ success: boolean; message: string }> {
    return apiClient.post('/api/v1/receipts/send-email/', request);
  }

  // Générer un PDF du ticket
  async generateReceiptPDF(orderId: any): Promise<Blob> {
    const _id = (orderId && typeof orderId === "object") ? orderId.id : orderId;
  
    return apiClient.get(`/api/v1/orders/${Number(_id)}/receipt/pdf/`, { responseType: "blob" });
  }

  // Formater le montant pour l'affichage
  formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  // Formater la date pour l'affichage
  formatDate(date: string): string {
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

export const receiptService = new ReceiptService();