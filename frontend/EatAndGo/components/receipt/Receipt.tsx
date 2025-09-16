import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
// ⚠️ On n'utilise plus le type ReceiptData du service côté UI, pour éviter le décalage de schémas
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
  order?: any; // payload brut éventuel déjà disponible
  showActions?: boolean;
  onClose?: () => void;
  autoSendEmail?: boolean;
  customerEmail?: string;
}

// Schéma de données attendu par le composant (UI)
interface ReceiptViewData {
  order: {
    id?: number | string;
    order_number: string;
    order_type?: 'dine_in' | 'takeaway' | string;
    table_number?: string | number | null;
    items: Array<{
      name: string;
      price: number;
      quantity: number;
      total_price: number;
      customizations?: Record<string, string | string[]>;
    }>;
    total_amount: number; // TTC hors pourboire
  };
  restaurantInfo: {
    name: string;
    address?: string;
    city?: string;
    postal_code?: string;
    phone?: string;
    email?: string;
    siret?: string;
    tva?: string;
  };
  paymentInfo: {
    method?: string;
    amount?: number; // total TTC (hors pourboire)
    tip?: number;
    transactionId?: string;
    paidAt: string; // ISO
  };
  customerInfo?: {
    name?: string;
    email?: string;
    phone?: string;
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

  useEffect(() => {
    loadReceiptData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (autoSendEmail && customerEmail && receiptData) {
      handleSendEmail(customerEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendEmail, customerEmail, receiptData]);

  // ---- Mapping service -> UI ----
  const mapServiceToView = (data: ServiceReceipt): ReceiptViewData => {
    const items: ReceiptViewData['order']['items'] = (data as any).items || (data as any).order_items || [];
    const totalAmount: number = (data as any).total_amount ?? 0;

    return {
      order: {
        id: (data as any).order_id ?? (data as any).id,
        order_number: (data as any).order_number ?? '—',
        order_type: (data as any).order_type,
        table_number: (data as any).table_number ?? null,
        items: items.map((it: any) => ({
          name: it.name ?? it.title ?? '—',
          price: Number(it.price ?? it.unit_price ?? 0),
          quantity: Number(it.quantity ?? 1),
          total_price: Number(it.total_price ?? it.total ?? (Number(it.price ?? 0) * Number(it.quantity ?? 1))),
          customizations: it.customizations,
        })),
        total_amount: Number(totalAmount),
      },
      restaurantInfo: {
        name: (data as any).restaurant_name ?? 'Restaurant',
        address: (data as any).restaurant_address,
        city: (data as any).restaurant_city,
        postal_code: (data as any).restaurant_postal_code,
        phone: (data as any).restaurant_phone,
        email: (data as any).restaurant_email,
        siret: (data as any).restaurant_siret,
        tva: (data as any).restaurant_tva,
      },
      paymentInfo: {
        method: (data as any).payment_method ?? 'cash',
        amount: Number(totalAmount),
        tip: Number((data as any).tip_amount ?? 0),
        transactionId: (data as any).transaction_id,
        paidAt: (data as any).paid_at ?? new Date().toISOString(),
      },
      customerInfo: {
        name: (data as any).customer_name,
        email: (data as any).customer_email,
        phone: (data as any).customer_phone,
      },
    };
  };

  // ---- Mapping ordre brut -> UI ----
  const mapOrderPropToView = (ord: any): ReceiptViewData => {
    return {
      order: {
        id: ord.id ?? ord.order_id,
        order_number: ord.order_number ?? ord.number ?? '—',
        order_type: ord.order_type,
        table_number: ord.table_number ?? null,
        items: (ord.items ?? []).map((it: any) => ({
          name: it.name ?? it.title ?? '—',
          price: Number(it.price ?? it.unit_price ?? 0),
          quantity: Number(it.quantity ?? 1),
          total_price: Number(it.total_price ?? it.total ?? (Number(it.price ?? 0) * Number(it.quantity ?? 1))),
          customizations: it.customizations,
        })),
        total_amount: Number(ord.total_amount ?? 0),
      },
      restaurantInfo: {
        name: ord.restaurant_name ?? 'Restaurant',
        address: ord.restaurant_address,
        city: ord.restaurant_city,
        postal_code: ord.restaurant_postal_code,
        phone: ord.restaurant_phone,
        email: ord.restaurant_email,
        siret: ord.restaurant_siret,
        tva: ord.restaurant_tva,
      },
      paymentInfo: {
        method: ord.payment_method ?? 'cash',
        amount: Number(ord.total_amount ?? 0),
        tip: Number(ord.tip_amount ?? 0),
        transactionId: ord.transaction_id,
        paidAt: ord.payment_date ?? new Date().toISOString(),
      },
      customerInfo: {
        name: ord.customer_name,
        email: ord.customer_email,
        phone: ord.customer_phone,
      },
    };
  };

  const buildReceiptHTML = (data: ReceiptViewData) => {
    // Fallback léger si le service ne renvoie pas directement du HTML
    const lines: string[] = [];
    lines.push(`<h1 style=\"font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;\">Ticket N° ${data.order.order_number}</h1>`);
    lines.push(`<div><strong>${data.restaurantInfo.name || ''}</strong><br/>${[data.restaurantInfo.address, [data.restaurantInfo.postal_code, data.restaurantInfo.city].filter(Boolean).join(' ')]
      .filter(Boolean).join('<br/>')}</div>`);
    lines.push(`<hr/>`);
    lines.push(`<div>Date: ${formatDate(data.paymentInfo.paidAt)}${data.order.table_number ? ` · Table: ${data.order.table_number}` : ''}</div>`);
    lines.push(`<table style=\"width:100%;border-collapse:collapse;margin-top:8px\">`);
    lines.push(`<thead><tr><th align=\"left\">Article</th><th align=\"right\">Qté</th><th align=\"right\">Prix</th><th align=\"right\">Total</th></tr></thead>`);
    lines.push('<tbody>');
    for (const it of data.order.items) {
      lines.push(`<tr><td>${it.name}</td><td align=\"right\">${it.quantity}</td><td align=\"right\">${it.price.toFixed(2)} €</td><td align=\"right\">${it.total_price.toFixed(2)} €</td></tr>`);
    }
    lines.push('</tbody></table>');
    const subtotal = Number(data.order.total_amount || 0);
    const tip = Number(data.paymentInfo.tip || 0);
    const total = subtotal + tip;
    lines.push(`<hr/><div style=\"text-align:right\">Sous-total: ${subtotal.toFixed(2)} €</div>`);
    if (tip > 0) lines.push(`<div style=\"text-align:right\">Pourboire: ${tip.toFixed(2)} €</div>`);
    lines.push(`<div style=\"font-weight:700;text-align:right\">TOTAL TTC: ${total.toFixed(2)} €</div>`);
    return `<!DOCTYPE html><html><head><meta charset=\"utf-8\"/></head><body>${lines.join('')}</body></html>`;
  };

  const toHTMLFromService = (payload: any): string => {
    try {
      // Certaines versions exposent generateReceiptData au lieu de generateReceiptHTML
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
        // Utiliser le payload existant
        const data = mapOrderPropToView(order);
        setReceiptData(data);
        const htmlCandidate = toHTMLFromService({ ...(order as any) });
        setReceiptHTML(htmlCandidate || buildReceiptHTML(data));
      } else {
        // Récupérer depuis l'API puis mapper vers l'UI
        const serviceData = await receiptService.generateReceiptData(Number(orderId));
        const data = mapServiceToView(serviceData);
        setReceiptData(data);
        const htmlCandidate = toHTMLFromService(serviceData);
        setReceiptHTML(htmlCandidate || buildReceiptHTML(data));
      }
    } catch (error) {
      console.error('Error loading receipt:', error);
      Alert.alert('Erreur', "Impossible de charger le ticket");
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
        // Expo: Print.printAsync n'accepte pas l'option `base64` et ne renvoie pas d'URI
        await Print.printAsync({ html });
      }
    } catch (error) {
      console.error('Error printing:', error);
      Alert.alert('Erreur', "Impossible d'imprimer le ticket");
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
      } else {
        Alert.alert('Info', 'PDF téléchargé avec succès');
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
      Alert.alert('Erreur', 'Impossible de télécharger le PDF');
    }
  };

  const handleSendEmail = async (emailAddress?: string) => {
    const targetEmail = emailAddress || email;

    if (!targetEmail || !targetEmail.includes('@')) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse email valide');
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
        Alert.alert('Succès', `Ticket envoyé à ${targetEmail}`);
        setShowEmailModal(false);
        setEmail('');
      } else {
        Alert.alert('Erreur', (result as any).message ?? 'Erreur inconnue');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      Alert.alert('Erreur', "Impossible d'envoyer le ticket");
    } finally {
      setSendingEmail(false);
    }
  };

  // Helpers d'affichage (on garde local pour que l'UI ne dépende pas du service)
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

  const { order: orderData, restaurantInfo, paymentInfo } = receiptData;

  const subtotal = Number(orderData.total_amount || 0);
  const tip = Number(paymentInfo.tip || 0);
  const total = subtotal + tip;
  const tvaRate = 0.2;
  const tvaAmount = total * tvaRate / (1 + tvaRate);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ticket N° {orderData.order_number}</Text>
        {onClose && (
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={iconSize} color={COLORS.text.secondary} />
          </Pressable>
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.receiptPreview}>
          {/* Restaurant Header */}
          <View style={styles.receiptHeader}>
            <Text style={styles.restaurantName}>{restaurantInfo.name}</Text>
            <Text style={styles.restaurantInfo}>
              {(restaurantInfo.address || '').trim()} {'\n'}
              {[restaurantInfo.postal_code, restaurantInfo.city].filter(Boolean).join(' ')}{' '}\n
              {restaurantInfo.phone ? `Tél: ${restaurantInfo.phone}\n` : ''}
              {restaurantInfo.email || ''}
              {restaurantInfo.siret ? `\nSIRET: ${restaurantInfo.siret}` : ''}
            </Text>
          </View>

          {/* Order Info */}
          <View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>N° Commande:</Text>
              <Text style={styles.infoValue}>{orderData.order_number}</Text>
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
          </View>

          {/* Items */}
          <View style={styles.itemsSection}>
            {(orderData.items || []).map((item, index) => (
              <View key={index} style={styles.item}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>{formatPrice(item.total_price)}</Text>
                </View>
                <Text style={styles.itemDetails}>
                  {item.quantity} x {formatPrice(item.price)}
                </Text>
                {!!item.customizations && (
                  <Text style={styles.itemDetails}>
                    {Object.entries(item.customizations).map(([key, value]) =>
                      `${key}: ${Array.isArray(value) ? value.join(', ') : value}`
                    ).join(' | ')}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total:</Text>
              <Text style={styles.totalValue}>{formatPrice(subtotal)}</Text>
            </View>
            {tip > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Pourboire:</Text>
                <Text style={styles.totalValue}>{formatPrice(tip)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA (20%):</Text>
              <Text style={styles.totalValue}>{formatPrice(tvaAmount)}</Text>
            </View>
            <View style={styles.finalTotalRow}>
              <Text style={styles.finalTotalLabel}>TOTAL TTC:</Text>
              <Text style={styles.finalTotalValue}>{formatPrice(total)}</Text>
            </View>
          </View>

          {/* Barcode */}
          <View style={styles.barcode}>
            <Text style={styles.barcodeText}>*{orderData.order_number}*</Text>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.thankYou}>MERCI DE VOTRE VISITE !</Text>
            <Text style={styles.footerInfo}>À bientôt{'\n'}Ticket à conserver comme justificatif</Text>
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
                <Button title="Partager" onPress={async () => {
                  try {
                    const html = receiptHTML || (receiptData ? buildReceiptHTML(receiptData) : '');
                    const file = await Print.printToFileAsync({ html });
                    await Sharing.shareAsync(file.uri);
                  } catch (error) {
                    console.error('Error sharing:', error);
                    Alert.alert('Erreur', "Impossible de partager le ticket");
                  }
                }} leftIcon="share" variant="outline" fullWidth />
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
