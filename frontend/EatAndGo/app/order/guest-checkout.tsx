import { useState } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  Switch, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { prepareGuestOrder, confirmGuestCash, getDraftStatus } from "@/services/guestOrderService";
import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useCart } from "@/contexts/CartContext";
import { Header } from "@/components/ui/Header";
import { Card } from "@/components/ui/Card";

export default function GuestCheckoutScreen() {
  const router = useRouter();
  const { restaurantId, tableNumber } = useLocalSearchParams<{
    restaurantId: string; 
    tableNumber?: string;
  }>();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [method, setMethod] = useState<"online" | "cash">("online");
  const [loading, setLoading] = useState(false);

  // Récupère le panier courant
  const { cart, clearCart } = useCart();

  // Validation améliorée du téléphone français
  const validatePhone = (phoneNumber: string): boolean => {
    // Accepte différents formats français
    const phoneRegex = /^(?:(?:\+33|0033|0)[1-9](?:[0-9]{8}))$/;
    const cleanPhone = phoneNumber.replace(/[\s.-]/g, '');
    return phoneRegex.test(cleanPhone);
  };

  const validateEmail = (email: string): boolean => {
    if (!email) return true; // Email optionnel
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Vérification du panier
  if (cart.items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande invité" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 16 }}>
            Votre panier est vide
          </Text>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={[styles.btn, { backgroundColor: '#FF6B35' }]}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Retour au menu</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Validation et mapping des items
  const items = cart.items.map((item) => {
    const menuItemId = Number(item.menuItemId || item.id);
    if (isNaN(menuItemId)) {
      throw new Error(`ID d'article invalide: ${item.name}`);
    }
    return {
      menu_item_id: menuItemId,
      quantity: item.quantity,
      options: item.customizations || undefined,
    };
  });

  async function pollUntilOrder(draftId: string): Promise<number | null> {
    const started = Date.now();
    const timeout = 30000; // 30 secondes au lieu de 20
    
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
    // Validations
    if (!name.trim()) {
      Alert.alert("Champs manquants", "Le nom est requis");
      return;
    }
    
    if (!validatePhone(phone)) {
      Alert.alert("Téléphone invalide", "Veuillez saisir un numéro de téléphone français valide");
      return;
    }
    
    if (email && !validateEmail(email)) {
      Alert.alert("Email invalide", "Veuillez saisir une adresse email valide");
      return;
    }
    
    if (!consent) {
      Alert.alert("Consentement requis", "Veuillez accepter la politique de confidentialité.");
      return;
    }

    // Validation des items du panier
    try {
      for (const item of cart.items) {
        const menuItemId = Number(item.menuItemId || item.id);
        if (isNaN(menuItemId)) {
          throw new Error(`ID d'article invalide pour: ${item.name}`);
        }
      }
    } catch (error: any) {
      Alert.alert("Erreur", error.message);
      return;
    }

    setLoading(true);
    
    try {
      const payload = {
        restaurant_id: Number(restaurantId),
        table_number: tableNumber,
        items,
        customer_name: name.trim(),
        phone: phone.replace(/[\s.-]/g, ''), // Nettoie le téléphone
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

      // Paiement en ligne avec Stripe
      if (!resp.payment_intent_client_secret) {
        throw new Error("Impossible d'initialiser le paiement");
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
        throw new Error(`Erreur d'initialisation: ${initError.message}`);
      }

      const { error: presentError } = await presentPaymentSheet();
      
      if (presentError) {
        throw new Error(`Erreur de paiement: ${presentError.message}`);
      }

      // Attendre la création de la commande via webhook
      const orderId = await pollUntilOrder(resp.draft_order_id);
      clearCart();
      
      if (orderId) {
        router.replace({ pathname: "/order/[id]", params: { id: String(orderId) } });
      } else {
        Alert.alert(
          "Paiement confirmé", 
          "Votre commande est en cours de traitement. Consultez vos commandes.",
          [{ text: "OK", onPress: () => router.replace("/orders") }]
        );
      }
      
    } catch (error: any) {
      console.error('Guest checkout error:', error);
      Alert.alert("Erreur", error?.message ?? "Échec de la commande. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Commande invité" 
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()} 
      />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          
          {/* Résumé du panier */}
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
              Votre commande
            </Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
              {cart.itemCount} {cart.itemCount > 1 ? 'articles' : 'article'} • {cart.total.toFixed(2)} €
            </Text>
            {tableNumber && (
              <Text style={{ fontSize: 14, color: '#666' }}>
                Table: {tableNumber}
              </Text>
            )}
          </Card>

          {/* Informations client */}
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
              Vos informations
            </Text>
            
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              Nom / Prénom *
            </Text>
            <TextInput 
              placeholder="Votre nom complet" 
              value={name} 
              onChangeText={setName} 
              style={[styles.input, { marginBottom: 16 }]}
              autoCapitalize="words"
            />
            
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              Téléphone *
            </Text>
            <TextInput 
              placeholder="06 12 34 56 78" 
              keyboardType="phone-pad" 
              value={phone} 
              onChangeText={setPhone} 
              style={[styles.input, { marginBottom: 16 }]}
            />
            
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 8 }}>
              Email (optionnel)
            </Text>
            <TextInput 
              placeholder="votre@email.com" 
              keyboardType="email-address" 
              value={email} 
              onChangeText={setEmail} 
              style={[styles.input, { marginBottom: 0 }]}
              autoCapitalize="none"
            />
          </Card>

          {/* Mode de paiement */}
          <Card style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
              Mode de paiement
            </Text>
            
            <View style={{ 
              flexDirection: "row", 
              alignItems: "center", 
              justifyContent: "space-between",
              backgroundColor: method === "online" ? '#FFF3F0' : 'transparent',
              padding: 12,
              borderRadius: 8,
              marginBottom: 8
            }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '500' }}>Paiement en ligne</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>Carte bancaire via Stripe</Text>
              </View>
              <Switch 
                value={method === "online"} 
                onValueChange={(v) => setMethod(v ? "online" : "cash")}
                trackColor={{ false: '#f0f0f0', true: '#FF6B35' }}
                thumbColor="#fff"
              />
            </View>
            
            {method === "cash" && (
              <View style={{ 
                backgroundColor: '#FFF9E6', 
                padding: 12, 
                borderRadius: 8,
                borderLeftWidth: 3,
                borderLeftColor: '#FFB800'
              }}>
                <Text style={{ fontSize: 14, color: '#8B5A00' }}>
                  💰 Vous paierez directement au restaurant
                </Text>
              </View>
            )}
          </Card>

          {/* Consentement */}
          <Card style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <Switch 
                value={consent} 
                onValueChange={setConsent}
                trackColor={{ false: '#f0f0f0', true: '#FF6B35' }}
                thumbColor="#fff"
              />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                J'accepte la <Text style={{ color: '#FF6B35', textDecorationLine: 'underline' }}>
                politique de confidentialité</Text> et les conditions d'utilisation *
              </Text>
            </View>
          </Card>

          {/* Bouton de validation */}
          <TouchableOpacity 
            disabled={loading} 
            onPress={onSubmit} 
            style={[
              styles.btn,
              { 
                backgroundColor: loading ? '#ccc' : '#FF6B35',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }
            ]}
          >
            {loading && <ActivityIndicator color="#fff" />}
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>
              {loading ? "Traitement..." : `Valider la commande • ${cart.total.toFixed(2)} €`}
            </Text>
          </TouchableOpacity>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = {
  input: { 
    borderWidth: 1, 
    borderColor: "#ddd", 
    borderRadius: 10, 
    padding: 12,
    backgroundColor: '#fff',
    fontSize: 16
  },
  btn: { 
    backgroundColor: "#FF6B35", 
    padding: 16, 
    borderRadius: 12, 
    alignItems: "center",
    minHeight: 52
  },
} as const;