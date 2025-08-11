import { useState } from "react";
import { View, Text, TextInput, Switch, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { prepareGuestOrder, confirmGuestCash, getDraftStatus } from "@/services/guestOrderService";
import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCart } from "@/contexts/CartContext";

export default function GuestCheckoutScreen() {
  const router = useRouter();
  const { restaurantId, tableNumber } = useLocalSearchParams<{restaurantId:string; tableNumber?:string}>();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [method, setMethod] = useState<"online"|"cash">("online");
  const [loading, setLoading] = useState(false);

  // récupère le panier courant selon ton CartContext:
  const { cart, clearCart } = useCart();

  const items = cart.items.map((i) => ({
    menu_item_id: i.menuItemId,
    quantity: i.quantity,
  }));

  async function pollUntilOrder(draftId: string) {
    const started = Date.now();
    while (Date.now() - started < 20000) { // 20s
      await new Promise(r => setTimeout(r, 2000));
      const st = await getDraftStatus(draftId);
      if (st.order_id) return st.order_id;
    }
    return null;
  }

  async function onSubmit() {
    if (!consent) { Alert.alert("Consentement requis", "Veuillez accepter la politique de confidentialité."); return; }
    if (!name || !phone.match(/^(\+33|0)\d{9}$/)) { Alert.alert("Champs manquants","Nom/Téléphone invalides"); return; }
    setLoading(true);
    try {
      const payload = {
        restaurant_id: Number(restaurantId),
        table_number: tableNumber,
        items,
        customer_name: name,
        phone,
        email: email || undefined,
        payment_method: method,
        consent: true,
      } as const;

      const resp = await prepareGuestOrder(payload);

      if (method === "cash") {
        const r = await confirmGuestCash(resp.draft_order_id);
        clearCart();
        router.replace({ pathname: "/order/[id]", params: { id: String(r.order_id) } });
        return;
      }

      // ONLINE
      if (!resp.payment_intent_client_secret) throw new Error("client_secret absent");
      const { error: iErr } = await initPaymentSheet({
        merchantDisplayName: "EatAndGo",
        paymentIntentClientSecret: resp.payment_intent_client_secret,
      });
      if (iErr) throw iErr;

      const { error: pErr } = await presentPaymentSheet();
      if (pErr) throw pErr;

      // Attendre création commande via webhook
      const orderId = await pollUntilOrder(resp.draft_order_id);
      clearCart();
      if (orderId) {
        router.replace({ pathname: "/order/[id]", params: { id: String(orderId) } });
      } else {
        Alert.alert("Paiement confirmé", "Commande en cours de création… Consulte tes commandes.");
        router.replace(`/order/${orderId}`);
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Échec de la commande");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Commande invité</Text>
      <TextInput placeholder="Nom / Prénom" value={name} onChangeText={setName} style={styles.input}/>
      <TextInput placeholder="Téléphone (FR)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} style={styles.input}/>
      <TextInput placeholder="Email (facultatif)" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input}/>
      <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between" }}>
        <Text>Payer en ligne</Text>
        <Switch value={method==="online"} onValueChange={(v)=>setMethod(v?"online":"cash")} />
      </View>
      <View style={{ flexDirection:"row", alignItems:"center", gap:8 }}>
        <Switch value={consent} onValueChange={setConsent} />
        <Text>J’accepte la politique de confidentialité</Text>
      </View>
      <TouchableOpacity disabled={loading} onPress={onSubmit} style={styles.btn}>
        {loading ? <ActivityIndicator/> : <Text style={{ color:"#fff", fontWeight:"600" }}>Valider la commande</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = {
  input: { borderWidth:1, borderColor:"#ddd", borderRadius:10, padding:12 },
  btn: { backgroundColor:"#0a7ea4", padding:14, borderRadius:12, alignItems:"center" },
} as const;
