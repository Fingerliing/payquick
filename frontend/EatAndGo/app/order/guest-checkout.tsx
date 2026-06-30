import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { prepareGuestOrder, confirmGuestCash, getDraftStatus } from "@/services/guestOrderService";
import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCart } from "@/contexts/CartContext";
import { useSession } from "@/contexts/SessionContext";
import { QRSessionUtils } from "@/utils/qrSessionUtils";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";
import { Alert as InlineAlert } from "@/components/ui/Alert";
import { useAppTheme, type AppColors } from "@/utils/designSystem";

export default function GuestCheckoutScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { restaurantId, tableNumber: tableNumberParam, sessionId } = useLocalSearchParams<{
    restaurantId: string;
    tableNumber?: string;
    sessionId?: string;
  }>();

  const { cart, clearCart } = useCart();
  const { session } = useSession();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [method, setMethod] = useState<"online" | "cash">("online");
  const [loading, setLoading] = useState(false);

  // ✅ FIX : résolution du tableNumber depuis plusieurs sources
  const [resolvedTableNumber, setResolvedTableNumber] = useState(
    tableNumberParam || cart.tableNumber || session?.table_number || ''
  );

  useEffect(() => {
    if (resolvedTableNumber) return; // déjà résolu, pas besoin d'aller chercher
    const resolve = async () => {
      const qrData = await QRSessionUtils.getSession();
      const resolved = qrData?.tableNumber || session?.table_number;
      if (resolved) {
        setResolvedTableNumber(resolved);
      }
    };
    resolve();
  }, []);

  const [toast, setToast] = useState<{
    visible: boolean;
    variant: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({ visible: false, variant: 'info', message: '' });

  const showToast = (
    variant: 'success' | 'error' | 'warning' | 'info',
    message: string,
    title?: string
  ) => setToast({ visible: true, variant, message, title });

  const hideToast = () => setToast((p) => ({ ...p, visible: false }));

  const validatePhone = (phoneNumber: string): boolean => {
    const phoneRegex = /^(?:(?:\+33|0033|0)[1-9](?:[0-9]{8}))$/;
    const cleanPhone = phoneNumber.replace(/[\s.-]/g, '');
    return phoneRegex.test(cleanPhone);
  };

  const validateEmail = (email: string): boolean => {
    if (!email) return true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title={t('guestCheckout.headerTitle')} leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
          {toast.visible && (
            <InlineAlert
              variant={toast.variant}
              title={toast.title}
              message={toast.message}
              onDismiss={hideToast}
              autoDismiss
            />
          )}
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <Text style={{ fontSize: 16, color: colors.text.secondary, textAlign: 'center', marginBottom: 16 }}>
            {t('cart.empty')}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.btn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: colors.text.inverse, fontWeight: "600" }}>{t('cart.backToMenu')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Lignes plat à la carte uniquement (les formules sont routées à part).
  const items = cart.items
    .filter((it) => it.kind !== 'formule')
    .map((item) => {
      const menuItemId = Number(item.menuItemId || item.id);
      if (isNaN(menuItemId)) {
        throw new Error(t('guestCheckout.toast.invalidItem', { name: item.name }));
      }
      return {
        menu_item_id: menuItemId,
        quantity: item.quantity,
        options: item.customizations || undefined,
      };
    });

  // Lignes formule : on transmet le payload backend déjà construit (CreateFormuleInput),
  // en faisant primer la quantité de la ligne panier.
  const formules = cart.items
    .filter((it) => it.kind === 'formule' && it.formule)
    .map((it) => ({ ...it.formule!, quantity: it.quantity }));

  async function pollUntilOrder(draftId: string): Promise<number | null> {
    const started = Date.now();
    const timeout = 30000;

    while (Date.now() - started < timeout) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const st = await getDraftStatus(draftId);
        if (st.order_id) return st.order_id;
      } catch (error) {
        console.warn('Erreur lors de la vérification du statut:', error);
      }
    }
    return null;
  }

  async function onSubmit() {
    if (!name.trim()) {
      showToast("error", t('guestCheckout.toast.nameRequired'), t('guestCheckout.toast.nameRequiredTitle'));
      return;
    }

    if (!validatePhone(phone)) {
      showToast("error", t('guestCheckout.toast.phoneInvalid'), t('guestCheckout.toast.phoneInvalidTitle'));
      return;
    }

    if (email && !validateEmail(email)) {
      showToast("error", t('guestCheckout.toast.emailInvalid'), t('guestCheckout.toast.emailInvalidTitle'));
      return;
    }

    if (!consent) {
      showToast("warning", t('guestCheckout.toast.consentRequired'), t('guestCheckout.toast.consentRequiredTitle'));
      return;
    }

    // ✅ FIX : vérifier que le tableNumber est bien résolu avant de soumettre
    if (!resolvedTableNumber) {
      showToast("error", t('guestCheckout.toast.tableMissing'), t('guestCheckout.toast.tableMissingTitle'));
      return;
    }

    try {
      for (const item of cart.items) {
        if (item.kind === 'formule') continue; // les formules n'ont pas de menu_item_id
        const menuItemId = Number(item.menuItemId || item.id);
        if (isNaN(menuItemId)) {
          throw new Error(t('guestCheckout.toast.invalidItem', { name: item.name }));
        }
      }
    } catch (error: any) {
      showToast("error", error.message, t('common.error'));
      return;
    }

    setLoading(true);

    try {
      const payload = {
        restaurant_id: Number(restaurantId),
        table_number: resolvedTableNumber, // ✅ FIX : utiliser resolvedTableNumber
        items,
        formules,
        customer_name: name.trim(),
        phone: phone.replace(/[\s.-]/g, ''),
        email: email.trim() || undefined,
        payment_method: method,
        consent: true,
      } as const;

      const resp = await prepareGuestOrder(payload);

      if (method === "cash") {
        const result = await confirmGuestCash(resp.draft_order_id);
        clearCart();
        router.replace({ pathname: "/order/[id]", params: { id: String(result.order_id) } });
        return;
      }

      if (!resp.payment_intent_client_secret) {
        throw new Error(t('guestCheckout.toast.paymentInitFailed'));
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "EatQuickeR",
        paymentIntentClientSecret: resp.payment_intent_client_secret,
        defaultBillingDetails: {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.replace(/[\s.-]/g, ''),
        },
      });

      if (initError) {
        throw new Error(t('guestCheckout.toast.initError', { message: initError.message }));
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        throw new Error(t('guestCheckout.toast.paymentError', { message: presentError.message }));
      }

      const orderId = await pollUntilOrder(resp.draft_order_id);
      clearCart();

      if (orderId) {
        router.replace({ pathname: "/order/[id]", params: { id: String(orderId) } });
      } else {
        showToast("success", t('guestCheckout.toast.processingOrder'), t('guestCheckout.toast.paymentConfirmedTitle'));
        router.replace("/orders" as any);
      }

    } catch (error: any) {
      console.error('Guest checkout error:', error);
      showToast("error", error?.message ?? t('guestCheckout.toast.failed'), t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  // Surfaces theme-aware pour le mode de paiement
  const onlineHighlightBg = isDark ? 'rgba(30, 42, 120, 0.25)' : '#EEF2FF';
  const cashInfoBg = isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFF9E6';
  const cashInfoText = isDark ? colors.warning : '#8B5A00';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Header
        title={t('guestCheckout.headerTitle')}
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />

      <View style={{ paddingHorizontal: 16, marginTop: 8, zIndex: 10 }}>
        {toast.visible && (
          <InlineAlert
            variant={toast.variant}
            title={toast.title}
            message={toast.message}
            onDismiss={hideToast}
            autoDismiss
          />
        )}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16 }}>

          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: colors.text.primary }}>
              {t('order.yourOrder')}
            </Text>
            <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 8 }}>
              {t('cart.item', { count: cart.itemCount })} • {cart.total.toFixed(2)} €
            </Text>
            {/* ✅ FIX : afficher resolvedTableNumber */}
            {resolvedTableNumber ? (
              <Text style={{ fontSize: 14, color: colors.text.secondary }}>
                {t('guestCheckout.tableLabel', { number: resolvedTableNumber })}
              </Text>
            ) : (
              <Text style={{ fontSize: 14, color: colors.error }}>
                {t('guestCheckout.tableUndetected')}
              </Text>
            )}
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: colors.text.primary }}>
              {t('checkout.info.title')}
            </Text>

            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: colors.text.primary }}>
              {t('guestCheckout.form.nameLabel')}
            </Text>
            <TextInput
              placeholder={t('guestCheckout.form.namePlaceholder')}
              placeholderTextColor={colors.text.light}
              value={name}
              onChangeText={setName}
              style={[styles.input, { marginBottom: 16 }]}
              autoCapitalize="words"
            />

            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: colors.text.primary }}>
              {t('guestCheckout.form.phoneLabel')}
            </Text>
            <TextInput
              placeholder={t('guestCheckout.form.phonePlaceholder')}
              placeholderTextColor={colors.text.light}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              style={[styles.input, { marginBottom: 16 }]}
            />

            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8, color: colors.text.primary }}>
              {t('guestCheckout.form.emailLabel')}
            </Text>
            <TextInput
              placeholder={t('guestCheckout.form.emailPlaceholder')}
              placeholderTextColor={colors.text.light}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={[styles.input, { marginBottom: 0 }]}
              autoCapitalize="none"
            />
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: colors.text.primary }}>
              {t('guestCheckout.payment.title')}
            </Text>

            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: method === "online" ? onlineHighlightBg : 'transparent',
              padding: 12,
              borderRadius: 8,
              marginBottom: 8
            }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '500', color: colors.text.primary }}>{t('guestCheckout.payment.online')}</Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary }}>{t('guestCheckout.payment.onlineHint')}</Text>
              </View>
              <Switch
                value={method === "online"}
                onValueChange={(v) => setMethod(v ? "online" : "cash")}
                trackColor={{ false: colors.border.default, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>

            {method === "cash" && (
              <View style={{
                backgroundColor: cashInfoBg,
                padding: 12,
                borderRadius: 8,
                borderLeftWidth: 3,
                borderLeftColor: colors.warning
              }}>
                <Text style={{ fontSize: 14, color: cashInfoText }}>
                  {t('guestCheckout.payment.cashHint')}
                </Text>
              </View>
            )}
          </Card>

          <Card style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <Switch
                value={consent}
                onValueChange={setConsent}
                trackColor={{ false: colors.border.default, true: colors.primary }}
                thumbColor={colors.surface}
              />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.text.primary }}>
                {t('guestCheckout.consent.pre')}
                <Text style={{ color: colors.primary, textDecorationLine: 'underline' }}>
                  {t('guestCheckout.consent.link')}
                </Text>
                {t('guestCheckout.consent.post')}
              </Text>
            </View>
          </Card>

          <TouchableOpacity
            disabled={loading}
            onPress={onSubmit}
            style={[
              styles.btn,
              {
                backgroundColor: loading ? colors.border.dark : colors.primary,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }
            ]}
          >
            {loading && <ActivityIndicator color={colors.text.inverse} />}
            <Text style={{ color: colors.text.inverse, fontWeight: "600", fontSize: 16 }}>
              {loading
                ? t('guestCheckout.processing')
                : t('guestCheckout.submit', { total: cart.total.toFixed(2) })}
            </Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: AppColors) => ({
  input: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text.primary,
  },
  btn: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center" as const,
    minHeight: 52,
  },
});