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

  // Générer un PDF du ticket - VERSION AMÉLIORÉE
  async generateReceiptPDF(orderId: any): Promise<Blob> {
    const _id = (orderId && typeof orderId === "object") ? orderId.id : orderId;
    
    try {
      // Tentative avec l'API dédiée
      const response = await apiClient.get(`/api/v1/orders/${Number(_id)}/receipt/pdf/`, { 
        responseType: "blob",
        timeout: 30000 // Timeout de 30 secondes
      });
      
      // Vérifier que la réponse est bien un blob
      if (response instanceof Blob && response.size > 0) {
        return response;
      }
      
      throw new Error('Réponse PDF invalide du serveur');
    } catch (error) {
      console.warn('API PDF failed, will use fallback:', error);
      throw error; // Laisser le composant gérer le fallback
    }
  }

  // Alternative : générer PDF côté client si l'API ne fonctionne pas
  async generateReceiptPDFFromHTML(html: string): Promise<Blob> {
    try {
      // Cette méthode pourrait utiliser jsPDF ou une autre librairie
      // pour générer un PDF côté client
      const response = await fetch('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      return await response.blob();
    } catch (error) {
      throw new Error('Impossible de générer le PDF côté client');
    }
  }

  // Méthode utilitaire pour valider un blob PDF
  private isValidPDFBlob(blob: Blob): boolean {
    return blob instanceof Blob && 
           blob.size > 0 && 
           blob.type.includes('pdf');
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