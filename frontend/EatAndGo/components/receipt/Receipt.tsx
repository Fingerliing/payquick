import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert, useAlert } from '@/components/ui/Alert';
import { receiptService, ReceiptData as ServiceReceipt } from '@/services/receiptService';
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';

interface ReceiptProps {
  orderId: string;
  order?: any;
  showActions?: boolean;
  onClose?: () => void;
  autoSendEmail?: boolean;
  customerEmail?: string;
}

// Schéma de données conforme aux normes françaises
interface ProcessedReceiptItem {
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

interface ReceiptViewData {
  order: {
    id?: number | string;
    order_number: string;
    order_type?: 'dine_in' | 'takeaway' | string;
    table_number?: string | number | null;
    sequential_number?: string; // Numéro séquentiel obligatoire en France
    items: ProcessedReceiptItem[];
    subtotal_ht: number; // Sous-total HT
    subtotal_ttc: number; // Sous-total TTC
    total_tva: number; // Total TVA
    total_amount: number; // Total TTC final (avec pourboire)
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
    legal_form?: string; // Forme juridique (SARL, SAS, etc.)
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

export const Receipt: React.FC<ReceiptProps> = ({
  orderId,
  order,
  showActions = true,
  onClose,
  autoSendEmail = false,
  customerEmail,
}) => {
  const [loading, setLoading] = useState(true);
  const [receiptData, setReceiptData] = useState<ReceiptViewData | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState(customerEmail || '');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [receiptHTML, setReceiptHTML] = useState('');

  const screenType = useScreenType();

  const {
    alertState,
    showAlert,
    hideAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  } = useAlert();

  useEffect(() => {
    loadReceiptData();
  }, [orderId]);

  useEffect(() => {
    if (autoSendEmail && customerEmail && receiptData) {
      handleSendEmail(customerEmail);
    }
  }, [autoSendEmail, customerEmail, receiptData]);

  // Fonction pour mieux récupérer le nom des articles

  const getItemName = (item: any): string => {
    console.log('item', item);
    // Priorité : name > title > menu_item_name > menu_item.name > product_name > item_name > description tronquée
    if (item.name && item.name.trim()) return item.name.trim();
    if (item.title && item.title.trim()) return item.title.trim();
    if (item.menu_item_name && item.menu_item_name.trim()) return item.menu_item_name.trim(); // Added this line
    if (item.menu_item?.name && item.menu_item.name.trim()) return item.menu_item.name.trim();
    if (item.product_name && item.product_name.trim()) return item.product_name.trim();
    if (item.item_name && item.item_name.trim()) return item.item_name.trim();
    if (item.description && item.description.trim()) {
      // Tronquer la description à 50 caractères max
      return item.description.trim().substring(0, 50) + (item.description.length > 50 ? '...' : '');
    }
    return 'Article sans nom';
  };

  // Calcul correct de la TVA selon les normes françaises
  const calculateTVA = (priceTTC: number, tvaRate: number = 0.20) => {
    const priceHT = priceTTC / (1 + tvaRate);
    const tvaAmount = priceTTC - priceHT;
    return {
      priceHT: Math.round(priceHT * 100) / 100,
      tvaAmount: Math.round(tvaAmount * 100) / 100
    };
  };

  // Mapping service -> UI avec calculs TVA conformes
  const mapServiceToView = (data: ServiceReceipt): ReceiptViewData => {
    const rawItems = (data as any).items || (data as any).order_items || [];
    const DEFAULT_TVA_RATE = 0.20; // 20% pour la restauration

    const processedItems: ProcessedReceiptItem[] = rawItems.map((item: any): ProcessedReceiptItem => {
      const name = getItemName(item);
      const quantity = Number(item.quantity ?? 1);
      const priceTTC = Number(item.price ?? item.unit_price ?? 0);
      const tvaRate = Number(item.tva_rate ?? item.tax_rate ?? DEFAULT_TVA_RATE);
      
      const { priceHT, tvaAmount: unitTvaAmount } = calculateTVA(priceTTC, tvaRate);
      const totalTTC = priceTTC * quantity;
      const totalHT = priceHT * quantity;
      const totalTvaAmount = unitTvaAmount * quantity;

      return {
        name,
        description: item.description,
        price: priceHT,
        price_ttc: priceTTC,
        quantity,
        total_price_ht: Math.round(totalHT * 100) / 100,
        total_price_ttc: Math.round(totalTTC * 100) / 100,
        tva_rate: tvaRate,
        tva_amount: Math.round(totalTvaAmount * 100) / 100,
        customizations: item.customizations,
      };
    });

    // Calculs totaux
    const subtotalHT = processedItems.reduce((sum: number, item) => sum + item.total_price_ht, 0);
    const subtotalTTC = processedItems.reduce((sum: number, item) => sum + item.total_price_ttc, 0);
    const totalTVA = processedItems.reduce((sum: number, item) => sum + item.tva_amount, 0);
    const tipAmount = Number((data as any).tip_amount ?? 0);
    const totalAmount = subtotalTTC + tipAmount;

    return {
      order: {
        id: (data as any).order_id ?? (data as any).id,
        order_number: (data as any).order_number ?? 'N/A',
        order_type: (data as any).order_type,
        table_number: (data as any).table_number ?? null,
        sequential_number: (data as any).sequential_number ?? (data as any).order_number,
        items: processedItems,
        subtotal_ht: Math.round(subtotalHT * 100) / 100,
        subtotal_ttc: Math.round(subtotalTTC * 100) / 100,
        total_tva: Math.round(totalTVA * 100) / 100,
        total_amount: Math.round(totalAmount * 100) / 100,
      },
      restaurantInfo: {
        name: (data as any).restaurant_name ?? 'Restaurant',
        address: (data as any).restaurant_address,
        city: (data as any).restaurant_city,
        postal_code: (data as any).restaurant_postal_code,
        phone: (data as any).restaurant_phone,
        email: (data as any).restaurant_email,
        siret: (data as any).restaurant_siret,
        tva_number: (data as any).restaurant_tva_number,
        legal_form: (data as any).restaurant_legal_form,
      },
      paymentInfo: {
        method: (data as any).payment_method ?? 'cash',
        amount: Math.round(totalAmount * 100) / 100,
        tip: tipAmount,
        transactionId: (data as any).transaction_id,
        paidAt: (data as any).paid_at ?? new Date().toISOString(),
        sequential_receipt_number: (data as any).sequential_receipt_number,
      },
      customerInfo: {
        name: (data as any).customer_name,
        email: (data as any).customer_email,
        phone: (data as any).customer_phone,
      },
      legalInfo: {
        warranty_notice: (data as any).warranty_notice,
        tva_notice: (data as any).tva_notice,
        receipt_notice: 'Ticket à conserver comme justificatif',
      },
    };
  };

  // Mapping ordre brut -> UI
  const mapOrderPropToView = (ord: any): ReceiptViewData => {
    console.log('ord', ord);
    const rawItems = ord.items ?? [];
    const DEFAULT_TVA_RATE = 0.20;

    const processedItems: ProcessedReceiptItem[] = rawItems.map((item: any): ProcessedReceiptItem => {
      const name = getItemName(item);
      const quantity = Number(item.quantity ?? 1);
      const priceTTC = Number(item.price ?? item.unit_price ?? 0);
      const tvaRate = Number(item.tva_rate ?? DEFAULT_TVA_RATE);
      
      const { priceHT, tvaAmount: unitTvaAmount } = calculateTVA(priceTTC, tvaRate);
      const totalTTC = priceTTC * quantity;
      const totalHT = priceHT * quantity;
      const totalTvaAmount = unitTvaAmount * quantity;

      return {
        name,
        description: item.description,
        price: priceHT,
        price_ttc: priceTTC,
        quantity,
        total_price_ht: Math.round(totalHT * 100) / 100,
        total_price_ttc: Math.round(totalTTC * 100) / 100,
        tva_rate: tvaRate,
        tva_amount: Math.round(totalTvaAmount * 100) / 100,
        customizations: item.customizations,
      };
    });

    const subtotalHT = processedItems.reduce((sum: number, item) => sum + item.total_price_ht, 0);
    const subtotalTTC = processedItems.reduce((sum: number, item) => sum + item.total_price_ttc, 0);
    const totalTVA = processedItems.reduce((sum: number, item) => sum + item.tva_amount, 0);
    const tipAmount = Number(ord.tip_amount ?? 0);
    const totalAmount = subtotalTTC + tipAmount;

    return {
      order: {
        id: ord.id ?? ord.order_id,
        order_number: ord.order_number ?? ord.number ?? 'N/A',
        order_type: ord.order_type,
        table_number: ord.table_number ?? null,
        sequential_number: ord.sequential_number ?? ord.order_number,
        items: processedItems,
        subtotal_ht: Math.round(subtotalHT * 100) / 100,
        subtotal_ttc: Math.round(subtotalTTC * 100) / 100,
        total_tva: Math.round(totalTVA * 100) / 100,
        total_amount: Math.round(totalAmount * 100) / 100,
      },
      restaurantInfo: {
        name: ord.restaurant_name ?? 'Restaurant',
        address: ord.restaurant_address,
        city: ord.restaurant_city,
        postal_code: ord.restaurant_postal_code,
        phone: ord.restaurant_phone,
        email: ord.restaurant_email,
        siret: ord.restaurant_siret,
        tva_number: ord.restaurant_tva_number,
        legal_form: ord.restaurant_legal_form,
      },
      paymentInfo: {
        method: ord.payment_method ?? 'cash',
        amount: Math.round(totalAmount * 100) / 100,
        tip: tipAmount,
        transactionId: ord.transaction_id,
        paidAt: ord.payment_date ?? new Date().toISOString(),
        sequential_receipt_number: ord.sequential_receipt_number,
      },
      customerInfo: {
        name: ord.customer_name,
        email: ord.customer_email,
        phone: ord.customer_phone,
      },
      legalInfo: {
        warranty_notice: ord.warranty_notice,
        tva_notice: ord.tva_notice,
        receipt_notice: 'Ticket à conserver comme justificatif',
      },
    };
  };

  // Génération HTML conforme aux normes françaises
  const buildReceiptHTML = (data: ReceiptViewData) => {
    console.log('data', data);
    const lines: string[] = [];
    const dateFormatted = formatDate(data.paymentInfo.paidAt);
    
    lines.push('<!DOCTYPE html>');
    lines.push('<html><head><meta charset="utf-8"/><title>Ticket de caisse</title></head>');
    lines.push('<body style="font-family: \'Courier New\', monospace; font-size: 12px; line-height: 1.2; max-width: 300px; margin: 0; padding: 10px;">');
    
    // En-tête restaurant (obligatoire)
    lines.push(`<div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">`);
    lines.push(`<strong style="font-size: 14px;">${data.restaurantInfo.name}</strong><br/>`);
    if (data.restaurantInfo.address) {
      lines.push(`${data.restaurantInfo.address}<br/>`);
    }
    if (data.restaurantInfo.postal_code && data.restaurantInfo.city) {
      lines.push(`${data.restaurantInfo.postal_code} ${data.restaurantInfo.city}<br/>`);
    }
    if (data.restaurantInfo.phone) {
      lines.push(`Tél: ${data.restaurantInfo.phone}<br/>`);
    }
    if (data.restaurantInfo.siret) {
      lines.push(`SIRET: ${data.restaurantInfo.siret}<br/>`);
    }
    if (data.restaurantInfo.tva_number) {
      lines.push(`TVA: ${data.restaurantInfo.tva_number}<br/>`);
    }
    lines.push('</div>');

    // Informations obligatoires du ticket
    lines.push('<div style="margin-bottom: 8px;">');
    lines.push(`<strong>TICKET N° ${data.paymentInfo.sequential_receipt_number || data.order.order_number}</strong><br/>`);
    lines.push(`Date: ${dateFormatted}<br/>`);
    if (data.order.table_number) {
      lines.push(`Table: ${data.order.table_number}<br/>`);
    }
    lines.push(`Type: ${data.order.order_type === 'dine_in' ? 'Sur place' : 'À emporter'}<br/>`);
    if (data.paymentInfo.method) {
      const paymentLabel = data.paymentInfo.method === 'cash' ? 'Espèces' : 
                           data.paymentInfo.method === 'card' ? 'Carte bancaire' : 
                           data.paymentInfo.method;
      lines.push(`Paiement: ${paymentLabel}<br/>`);
    }
    lines.push('</div>');

    // Détail des articles (obligatoire)
    lines.push('<div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 8px 0;">');
    
    for (const item of data.order.items) {
      lines.push(`<div style="margin-bottom: 2px;">`);
      lines.push(`<div>${item.name}</div>`);
      lines.push(`<div style="display: flex; justify-content: space-between;">`);
      lines.push(`<span>${item.quantity} x ${item.price_ttc.toFixed(2)}€</span>`);
      lines.push(`<span><strong>${item.total_price_ttc.toFixed(2)}€</strong></span>`);
      lines.push('</div>');
      
      // Affichage du taux de TVA pour chaque article (obligatoire)
      lines.push(`<div style="font-size: 10px; color: #666;">TVA ${(item.tva_rate * 100).toFixed(1)}%: ${item.tva_amount.toFixed(2)}€</div>`);
      
      if (item.customizations) {
        const customText = Object.entries(item.customizations)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join(' | ');
        if (customText) {
          lines.push(`<div style="font-size: 10px; font-style: italic; color: #666;">${customText}</div>`);
        }
      }
      lines.push('</div>');
    }
    lines.push('</div>');

    // Récapitulatif des totaux (obligatoire)
    lines.push('<div style="text-align: right; line-height: 1.4;">');
    lines.push(`Sous-total HT: ${data.order.subtotal_ht.toFixed(2)}€<br/>`);
    lines.push(`TVA totale: ${data.order.total_tva.toFixed(2)}€<br/>`);
    lines.push(`<strong>Sous-total TTC: ${data.order.subtotal_ttc.toFixed(2)}€</strong><br/>`);
    
    if (data.paymentInfo.tip && data.paymentInfo.tip > 0) {
      lines.push(`Pourboire: ${data.paymentInfo.tip.toFixed(2)}€<br/>`);
    }
    
    lines.push(`<div style="border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; font-size: 14px;">`);
    lines.push(`<strong>TOTAL TTC: ${data.order.total_amount.toFixed(2)}€</strong>`);
    lines.push('</div>');
    lines.push('</div>');

    // Code-barres simulé
    if (data.order.order_number) {
      lines.push('<div style="text-align: center; margin: 12px 0; font-family: monospace; font-size: 18px; letter-spacing: 1px;">');
      lines.push(`||||| ${data.order.order_number} |||||`);
      lines.push('</div>');
    }

    // Mentions légales obligatoires
    lines.push('<div style="font-size: 10px; text-align: center; border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px;">');
    lines.push('MERCI DE VOTRE VISITE<br/>');
    lines.push('À BIENTÔT<br/><br/>');
    lines.push(`${data.legalInfo.receipt_notice}<br/>`);
    
    if (data.legalInfo.warranty_notice) {
      lines.push(`<br/>${data.legalInfo.warranty_notice}`);
    }
    
    if (data.legalInfo.tva_notice) {
      lines.push(`<br/>${data.legalInfo.tva_notice}`);
    }
    lines.push('</div>');

    lines.push('</body></html>');
    return lines.join('');
  };

  const toHTMLFromService = (payload: any): string => {
    try {
      const result = (receiptService as any).generateReceiptData
        ? (receiptService as any).generateReceiptData(payload)
        : (receiptService as any).generateReceiptHTML?.(payload);
      if (typeof result === 'string') return result;
      if (result && typeof result === 'object' && 'html' in result) return (result as any).html || '';
      return '';
    } catch {
      return '';
    }
  };

  const loadReceiptData = async () => {
    try {
      setLoading(true);

      if (order) {
        const data = mapOrderPropToView(order);
        setReceiptData(data);
        const htmlCandidate = toHTMLFromService({ ...(order as any) });
        setReceiptHTML(htmlCandidate || buildReceiptHTML(data));
      } else {
        const serviceData = await receiptService.generateReceiptData(Number(orderId));
        const data = mapServiceToView(serviceData);
        setReceiptData(data);
        const htmlCandidate = toHTMLFromService(serviceData);
        setReceiptHTML(htmlCandidate || buildReceiptHTML(data));
      }
    } catch (error) {
      console.error('Error loading receipt:', error);
      showError("Impossible de charger le ticket", "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!receiptHTML && receiptData) {
      setReceiptHTML(buildReceiptHTML(receiptData));
    }
    const html = receiptHTML || (receiptData ? buildReceiptHTML(receiptData) : '');

    try {
      if (Platform.OS === 'web') {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.print();
        }
      } else {
        await Print.printAsync({ html });
      }
    } catch (error) {
      console.error('Error printing:', error);
      showError("Impossible d'imprimer le ticket", "Erreur");
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const blob = await receiptService.generateReceiptPDF(Number(orderId));

      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob as any);
        const a = document.createElement('a');
        a.href = url;
        const number = receiptData?.order.order_number ?? orderId;
        a.download = `ticket_${number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('PDF téléchargé avec succès');
      } else {
        showInfo('PDF téléchargé avec succès');
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      showError('Impossible de télécharger le PDF', 'Erreur');
    }
  };

  const handleSendEmail = async (emailAddress?: string) => {
    const targetEmail = emailAddress || email;

    if (!targetEmail || !targetEmail.includes('@')) {
      showError('Veuillez entrer une adresse email valide', 'Erreur');
      return;
    }

    setSendingEmail(true);
    try {
      const result = await receiptService.sendReceiptByEmail({
        order_id: Number(orderId),
        email: targetEmail,
        format: 'pdf',
        language: 'fr',
      } as any);
      
      if ((result as any).success) {
        showSuccess(`Ticket envoyé à ${targetEmail}`, 'Succès');
        setShowEmailModal(false);
        setEmail('');
      } else {
        showError((result as any).message ?? 'Erreur inconnue', 'Erreur');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      showError("Impossible d'envoyer le ticket", "Erreur");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleShare = async () => {
    try {
      const html = receiptHTML || (receiptData ? buildReceiptHTML(receiptData) : '');
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri);
    } catch (error) {
      console.error('Error sharing:', error);
      showError("Impossible de partager le ticket", "Erreur");
    }
  };

  const formatPrice = (price: number) => `${Number(price || 0).toFixed(2)} €`;
  
  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return date;
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    headerTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600',
      color: COLORS.text.primary,
    },
    closeButton: {
      padding: getResponsiveValue(SPACING.xs, screenType),
    },
    content: {
      flex: 1,
      padding: getResponsiveValue(SPACING.container, screenType),
    },
    alertContainer: {
      paddingHorizontal: getResponsiveValue(SPACING.container, screenType),
      paddingTop: 8,
      zIndex: 1000,
    },
    receiptPreview: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.xl, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      shadowColor: COLORS.shadow.default,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    receiptHeader: {
      alignItems: 'center',
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
      paddingBottom: getResponsiveValue(SPACING.lg, screenType),
      borderBottomWidth: 2,
      borderBottomColor: COLORS.border.default,
      borderStyle: 'dashed',
    },
    restaurantName: {
      fontSize: getResponsiveValue({ mobile: 20, tablet: 24, desktop: 28 }, screenType),
      fontWeight: 'bold',
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },
    restaurantInfo: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    infoLabel: {
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      fontWeight: '500',
      color: COLORS.text.secondary,
    },
    infoValue: {
      fontSize: getResponsiveValue({ mobile: 13, tablet: 14, desktop: 15 }, screenType),
      color: COLORS.text.primary,
    },
    itemsSection: {
      marginVertical: getResponsiveValue(SPACING.lg, screenType),
      paddingVertical: getResponsiveValue(SPACING.lg, screenType),
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: COLORS.border.light,
    },
    item: {
      marginVertical: getResponsiveValue(SPACING.sm, screenType),
      paddingBottom: getResponsiveValue(SPACING.sm, screenType),
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border.light,
    },
    itemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },
    itemName: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '500',
      color: COLORS.text.primary,
      flex: 1,
    },
    itemPrice: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      fontWeight: '600',
      color: COLORS.text.primary,
    },
    itemDetails: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: COLORS.text.secondary,
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
    tvaDetails: {
      fontSize: getResponsiveValue({ mobile: 11, tablet: 12, desktop: 13 }, screenType),
      color: COLORS.text.secondary,
      fontStyle: 'italic',
      marginLeft: getResponsiveValue(SPACING.sm, screenType),
    },
    totalsSection: {
      paddingTop: getResponsiveValue(SPACING.lg, screenType),
      borderTopWidth: 2,
      borderTopColor: COLORS.text.primary,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: getResponsiveValue(SPACING.xs, screenType),
    },
    totalLabel: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: COLORS.text.secondary,
    },
    totalValue: {
      fontSize: getResponsiveValue({ mobile: 14, tablet: 15, desktop: 16 }, screenType),
      color: COLORS.text.secondary,
    },
    finalTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      paddingTop: getResponsiveValue(SPACING.sm, screenType),
      borderTopWidth: 1,
      borderTopColor: COLORS.border.default,
    },
    finalTotalLabel: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: 'bold',
      color: COLORS.text.primary,
    },
    finalTotalValue: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: 'bold',
      color: COLORS.secondary,
    },
    actionsContainer: {
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface,
      borderTopWidth: 1,
      borderTopColor: COLORS.border.light,
    },
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    actionButton: {
      flex: 1,
      minWidth: screenType === 'mobile' ? '45%' : '30%',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: COLORS.surface,
      borderRadius: BORDER_RADIUS.lg,
      padding: getResponsiveValue(SPACING.xl, screenType),
      width: '90%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: getResponsiveValue({ mobile: 18, tablet: 20, desktop: 22 }, screenType),
      fontWeight: '600',
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    emailInput: {
      borderWidth: 1,
      borderColor: COLORS.border.light,
      borderRadius: BORDER_RADIUS.md,
      padding: getResponsiveValue(SPACING.sm, screenType),
      fontSize: getResponsiveValue({ mobile: 16, tablet: 17, desktop: 18 }, screenType),
      marginBottom: getResponsiveValue(SPACING.lg, screenType),
    },
    modalButtons: {
      flexDirection: 'row',
      gap: getResponsiveValue(SPACING.sm, screenType),
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    barcode: {
      alignItems: 'center',
      marginVertical: getResponsiveValue(SPACING.lg, screenType),
    },
    barcodeText: {
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType),
      letterSpacing: 2,
      color: COLORS.text.primary,
    },
    footer: {
      alignItems: 'center',
      marginTop: getResponsiveValue(SPACING.xl, screenType),
      paddingTop: getResponsiveValue(SPACING.xl, screenType),
      borderTopWidth: 2,
      borderTopColor: COLORS.border.default,
      borderStyle: 'dashed',
    },
    thankYou: {
      fontSize: getResponsiveValue({ mobile: 16, tablet: 18, desktop: 20 }, screenType),
      fontWeight: 'bold',
      color: COLORS.text.primary,
      marginBottom: getResponsiveValue(SPACING.sm, screenType),
    },
    footerInfo: {
      fontSize: getResponsiveValue({ mobile: 12, tablet: 13, desktop: 14 }, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      lineHeight: 18,
    },
    legalNotice: {
      fontSize: getResponsiveValue({ mobile: 10, tablet: 11, desktop: 12 }, screenType),
      color: COLORS.text.secondary,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: getResponsiveValue(SPACING.sm, screenType),
    },
  });

  const iconSize = getResponsiveValue({ mobile: 20, tablet: 22, desktop: 24 }, screenType);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 16, color: COLORS.text.secondary }}>Chargement du ticket...</Text>
      </View>
    );
  }

  if (!receiptData) {
    return (
      <View style={styles.container}>
        <Text>Aucune donnée de ticket disponible</Text>
      </View>
    );
  }

  const { order: orderData, restaurantInfo, paymentInfo, legalInfo } = receiptData;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Ticket N° {paymentInfo.sequential_receipt_number || orderData.order_number}
        </Text>
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={iconSize} color={COLORS.text.secondary} />
          </Pressable>
        )}
      </View>

      {/* Alert Display */}
      {alertState && (
        <View style={styles.alertContainer}>
          <Alert
            variant={alertState.variant}
            title={alertState.title}
            message={alertState.message}
            onPress={hideAlert}
          />
        </View>
      )}

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.receiptPreview}>
          {/* Restaurant Header */}
          <View style={styles.receiptHeader}>
            <Text style={styles.restaurantName}>{restaurantInfo.name}</Text>
            <Text style={styles.restaurantInfo}>
              {[
                restaurantInfo.address?.trim(),
                [restaurantInfo.postal_code, restaurantInfo.city].filter(Boolean).join(' '),
                restaurantInfo.phone ? `Tél: ${restaurantInfo.phone}` : '',
                restaurantInfo.email || '',
                restaurantInfo.siret ? `SIRET: ${restaurantInfo.siret}` : '',
                restaurantInfo.tva_number ? `TVA: ${restaurantInfo.tva_number}` : ''
              ]
                .filter(Boolean)
                .join('\n')}
            </Text>
          </View>

          {/* Order Info */}
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>N° Ticket:</Text>
              <Text style={styles.infoValue}>
                {paymentInfo.sequential_receipt_number || orderData.order_number}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date:</Text>
              <Text style={styles.infoValue}>{formatDate(paymentInfo.paidAt)}</Text>
            </View>
            {!!orderData.table_number && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Table:</Text>
                <Text style={styles.infoValue}>{String(orderData.table_number)}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Type:</Text>
              <Text style={styles.infoValue}>
                {orderData.order_type === 'dine_in' ? 'Sur place' : 'À emporter'}
              </Text>
            </View>
            {paymentInfo.method && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Paiement:</Text>
                <Text style={styles.infoValue}>
                  {paymentInfo.method === 'cash' ? 'Espèces' : 
                   paymentInfo.method === 'card' ? 'Carte bancaire' : 
                   paymentInfo.method}
                </Text>
              </View>
            )}
          </View>

          {/* Items avec détail TVA */}
          <View style={styles.itemsSection}>
            {(orderData.items || []).map((item, index) => (
              <View key={index} style={styles.item}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>{formatPrice(item.total_price_ttc)}</Text>
                </View>
                <Text style={styles.itemDetails}>
                  {item.quantity} x {formatPrice(item.price_ttc)} TTC
                </Text>
                <Text style={styles.tvaDetails}>
                  TVA {(item.tva_rate * 100).toFixed(1)}%: {formatPrice(item.tva_amount)}
                </Text>
                {item.customizations && Object.keys(item.customizations).length > 0 && (
                  <Text style={styles.itemDetails}>
                    {Object.entries(item.customizations)
                      .map(([key, value]) => 
                        `${key}: ${Array.isArray(value) ? value.join(', ') : value}`
                      )
                      .join(' | ')}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* Totals conformes */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total HT:</Text>
              <Text style={styles.totalValue}>{formatPrice(orderData.subtotal_ht)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA totale:</Text>
              <Text style={styles.totalValue}>{formatPrice(orderData.total_tva)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total TTC:</Text>
              <Text style={styles.totalValue}>{formatPrice(orderData.subtotal_ttc)}</Text>
            </View>
            {paymentInfo.tip && paymentInfo.tip > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Pourboire:</Text>
                <Text style={styles.totalValue}>{formatPrice(paymentInfo.tip)}</Text>
              </View>
            )}
            <View style={styles.finalTotalRow}>
              <Text style={styles.finalTotalLabel}>TOTAL TTC:</Text>
              <Text style={styles.finalTotalValue}>{formatPrice(orderData.total_amount)}</Text>
            </View>
          </View>

          {/* Barcode */}
          <View style={styles.barcode}>
            <Text style={styles.barcodeText}>
              *{paymentInfo.sequential_receipt_number || orderData.order_number}*
            </Text>
          </View>

          {/* Footer avec mentions légales */}
          <View style={styles.footer}>
            <Text style={styles.thankYou}>MERCI DE VOTRE VISITE !</Text>
            <Text style={styles.footerInfo}>À bientôt</Text>
            <Text style={styles.legalNotice}>{legalInfo.receipt_notice}</Text>
            {legalInfo.warranty_notice && (
              <Text style={styles.legalNotice}>{legalInfo.warranty_notice}</Text>
            )}
            {legalInfo.tva_notice && (
              <Text style={styles.legalNotice}>{legalInfo.tva_notice}</Text>
            )}
          </View>
        </Card>
      </ScrollView>

      {/* Actions */}
      {showActions && (
        <View style={styles.actionsContainer}>
          <View style={styles.actionsGrid}>
            <View style={styles.actionButton}>
              <Button title="Imprimer" onPress={handlePrint} leftIcon="print" fullWidth />
            </View>
            <View style={styles.actionButton}>
              <Button title="PDF" onPress={handleDownloadPDF} leftIcon="document" variant="outline" fullWidth />
            </View>
            <View style={styles.actionButton}>
              <Button title="Email" onPress={() => setShowEmailModal(true)} leftIcon="mail" variant="outline" fullWidth />
            </View>
            {Platform.OS !== 'web' && (
              <View style={styles.actionButton}>
                <Button title="Partager" onPress={handleShare} leftIcon="share" variant="outline" fullWidth />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Email Modal */}
      <Modal visible={showEmailModal} transparent animationType="fade" onRequestClose={() => setShowEmailModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Envoyer le ticket par email</Text>

            <TextInput
              style={styles.emailInput}
              value={email}
              onChangeText={setEmail}
              placeholder="Adresse email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalButtons}>
              <Button title="Annuler" onPress={() => setShowEmailModal(false)} variant="outline" fullWidth disabled={sendingEmail} />
              <Button title="Envoyer" onPress={() => handleSendEmail()} fullWidth loading={sendingEmail} disabled={sendingEmail} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default Receipt;