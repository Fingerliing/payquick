import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { clientOrderService } from '@/services/clientOrderService';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { QRAccessButtons } from '@/components/qrCode/QRAccessButton';
import { extractErrorMessage, logAPIError } from '@/types/apiErrors';

export default function ClientCheckoutScreen() {
  const { 
    cart, 
    clearCart, 
    setTableNumber,
    qrSessionData,
    getQRSessionData,
    updateTableFromQR,
    initializeFromQRSession
  } = useCart();
  
  const [notes, setNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [manualTableNumber, setManualTableNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-compléter le numéro de table depuis la session QR ou le cart
  useEffect(() => {
    if (cart.tableNumber && !manualTableNumber) {
      setManualTableNumber(cart.tableNumber);
      console.log('📱 Table number auto-filled:', cart.tableNumber);
    } else if (qrSessionData?.tableNumber && !manualTableNumber) {
      setManualTableNumber(qrSessionData.tableNumber);
      console.log('📱 Table number auto-filled from QR session:', qrSessionData.tableNumber);
    }
  }, [cart.tableNumber, qrSessionData?.tableNumber]);

  const getEffectiveRestaurantId = (): number | null => {
    return cart.restaurantId || null;
  };

  const getEffectiveTableNumber = (): string | null => {
    // Priorité: manualTableNumber > cart.tableNumber > qrSessionData.tableNumber
    if (manualTableNumber.trim()) {
      return manualTableNumber.trim();
    }
    if (cart.tableNumber) {
      return cart.tableNumber;
    }
    if (qrSessionData?.tableNumber) {
      return qrSessionData.tableNumber;
    }
    return null;
  };

  const validateOrder = (): { isValid: boolean; restaurantId?: number; tableNumber?: number } => {
    if (cart.items.length === 0) {
      Alert.alert('Erreur', 'Votre panier est vide');
      return { isValid: false };
    }

    const effectiveRestaurantId = getEffectiveRestaurantId();
    if (!effectiveRestaurantId) {
      Alert.alert('Erreur', 'Restaurant non défini');
      return { isValid: false };
    }

    const effectiveTableNumber = getEffectiveTableNumber();
    if (!effectiveTableNumber) {
      Alert.alert('Erreur', 'Numéro de table requis pour les commandes sur place');
      return { isValid: false };
    }

    const tableNum = parseInt(effectiveTableNumber, 10);
    if (isNaN(tableNum)) {
      Alert.alert('Erreur', 'Numéro de table invalide');
      return { isValid: false };
    }

    // Validate customer name (might be required by backend)
    if (!customerName.trim()) {
      Alert.alert('Erreur', 'Nom du client requis');
      return { isValid: false };
    }

    return { 
      isValid: true, 
      restaurantId: effectiveRestaurantId,
      tableNumber: tableNum
    };
  };

  const handlePlaceOrder = async () => {
    const validation = validateOrder();
    if (!validation.isValid || !validation.restaurantId || !validation.tableNumber) {
      return;
    }
  
    try {
      setLoading(true);
      
      console.log('🔍 Cart items structure check:');
      console.log('Cart items count:', cart.items.length);
      console.log('Cart items raw:', JSON.stringify(cart.items, null, 2));

      // ✅ VALIDATION: Vérifier chaque item
      const itemsValidation = cart.items.map((item, index) => {
        const validation = {
          index,
          isValid: true,
          errors: [] as string[]
        };
        
        if (!item) {
          validation.isValid = false;
          validation.errors.push('Item is null/undefined');
        } else {
          if (!item.menuItemId || typeof item.menuItemId !== 'number') {
            validation.isValid = false;
            validation.errors.push('No ID property found');
          }
          
          if (!item.quantity || isNaN(Number(item.quantity)) || Number(item.quantity) <= 0) {
            validation.isValid = false;
            validation.errors.push(`Invalid quantity: ${item.quantity}`);
          }
          
          console.log(`Item ${index}:`, {
            id: item.id,
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            price: item.price,
            name: item.name,
            allKeys: Object.keys(item)
          });
        }
        
        return validation;
      });
    
      // Afficher les erreurs de validation
      const invalidItems = itemsValidation.filter(v => !v.isValid);
      if (invalidItems.length > 0) {
        console.error('❌ Invalid items found:', invalidItems);
        Alert.alert(
          'Erreur panier', 
          `Des articles du panier sont invalides:\n${invalidItems.map(v => `Article ${v.index}: ${v.errors.join(', ')}`).join('\n')}`
        );
        return;
      }

      // Mettre à jour le numéro de table dans le cart si modifié
      const effectiveTableNumber = getEffectiveTableNumber();
      if (effectiveTableNumber && effectiveTableNumber !== cart.tableNumber) {
        setTableNumber(effectiveTableNumber);
      }
      
      console.log('Cart items before processing:', cart.items);
  
      const payload = {
        restaurant: validation.restaurantId,
        order_type: 'dine_in' as const,
        table_number: String(validation.tableNumber),
        customer_name: customerName.trim(),
        phone: '', // Optionnel
        payment_method: 'cash', // Valeur par défaut
        notes: notes.trim() || null,
        items: cart.items, // ← DIRECT: pas de conversion nécessaire
      };
      
      console.log('📤 Sending order payload:', JSON.stringify(payload, null, 2));
      
      try {
        const order = await clientOrderService.createFromCart(payload);
  
        console.log('✅ Order created successfully:', order);

        if (!order) {
          console.warn('⚠️ Order created but no data returned from server');
          
          // Vider le panier quand même car la commande semble créée
          clearCart();
          
          Alert.alert(
            'Commande en cours de traitement',
            'Votre commande a été acceptée par le restaurant. Vous pouvez vérifier son statut dans "Mes commandes".',
            [
              { 
                text: 'OK', 
                onPress: () => {
                  // Rediriger vers la liste des commandes ou le menu
                  router.replace('/orders'); // ou router.replace('/menu')
                }
              }
            ]
          );
          return;
        }
      
        // ✅ GESTION du cas où order.id est manquant
        if (!order.id) {
          console.warn('⚠️ Order created but missing ID:', order);
          
          clearCart();
          
          Alert.alert(
            'Commande passée !',
            'Votre commande a été envoyée au restaurant. Vous recevrez une notification quand elle sera prête.',
            [
              { 
                text: 'OK', 
                onPress: () => router.replace('/orders')
              }
            ]
          );
          return;
        }
  
        // Vider le panier
        clearCart();
  
        // Rediriger vers le suivi de commande
        router.replace(`/order/${order.id}`);
        
        Alert.alert(
          'Commande passée !',
          'Votre commande a été envoyée au restaurant. Vous recevrez une notification quand elle sera prête.',
          [{ text: 'OK' }]
        );
        
      } catch (err: any) {
        // 🔎 Log brut pour voir exactement ce que renvoie DRF
        const data = err?.response?.data;
        console.log('🧪 Raw server error (checkout):', JSON.stringify(data, null, 2));
      
        // 🧠 Extraire un message lisible
        let errorMessage = 'Erreur inconnue';
        
        if (data) {
          if (data.error) {
            errorMessage = Array.isArray(data.error) ? data.error.join('\n') : String(data.error);
          } else if (data.errors) {
            errorMessage = Array.isArray(data.errors) ? data.errors.join('\n') : String(data.errors);
          } else if (data.non_field_errors) {
            errorMessage = Array.isArray(data.non_field_errors) ? data.non_field_errors.join('\n') : String(data.non_field_errors);
          } else if (data.detail) {
            errorMessage = String(data.detail);
          } else if (typeof data === 'object') {
            // Gestion des erreurs de champ spécifiques
            const fieldErrors = [];
            for (const [field, messages] of Object.entries(data)) {
              if (Array.isArray(messages)) {
                fieldErrors.push(`${field}: ${messages.join(', ')}`);
              } else {
                fieldErrors.push(`${field}: ${messages}`);
              }
            }
            errorMessage = fieldErrors.length > 0 ? fieldErrors.join('\n') : JSON.stringify(data);
          }
        } else {
          errorMessage = err?.message || 'Erreur de connexion';
        }
      
        Alert.alert('Erreur serveur', errorMessage);
      }
  
    } catch (error: unknown) {
      logAPIError(error, 'Checkout error');
      
      const errorMessage = extractErrorMessage(error);
      Alert.alert('Erreur', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const effectiveRestaurantId = getEffectiveRestaurantId();
  const effectiveTableNumber = getEffectiveTableNumber();
  
  if (cart.items.length === 0 || !effectiveRestaurantId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 16 }}>
            {cart.items.length === 0 ? 'Votre panier est vide' : 'Restaurant non défini'}
          </Text>
          
          {qrSessionData && (
            <View style={{ backgroundColor: '#f0f8ff', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#333', textAlign: 'center' }}>
                📱 Session QR active: Restaurant {qrSessionData.restaurantId}, Table {qrSessionData.tableNumber}
              </Text>
            </View>
          )}
          
          <Button 
            title="Retour au menu"
            onPress={() => router.back()}
            style={{ marginTop: 16 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Si pas de numéro de table, afficher un message spécifique
  if (!effectiveTableNumber) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
        <Header title="Commande" leftIcon="arrow-back" onLeftPress={() => router.back()} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#f44336', textAlign: 'center', marginBottom: 16 }}>
            ⚠️ Numéro de table manquant
          </Text>
          <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24 }}>
            Pour passer votre commande, vous devez d'abord scanner le QR code de votre table.
          </Text>
          
          <QRAccessButtons
            title="Scanner le QR code"
            description="Scannez le QR code de votre table pour continuer votre commande"
            compact={false}
            onSuccess={async () => {
              await initializeFromQRSession();           // <-- recharge @qr_session_data dans le Cart
              // Optionnel : forcer l’UI tout de suite (utile si tu veux afficher sans attendre le re-render)
              const data = await getQRSessionData?.();
              if (data?.tableNumber) setTableNumber(data.tableNumber);
              console.log('QR scanné depuis checkout: resync done');
            }}
          />
          
          <Button 
            title="Retour au menu"
            onPress={() => router.back()}
            style={{ backgroundColor: '#ccc', marginTop: 16 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <Header 
        title="Finaliser la commande" 
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()} 
      />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Restaurant et table avec données QR - Table automatique */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Détails de la commande
          </Text>
          
          <Text style={{ fontSize: 16, color: '#333', marginBottom: 8 }}>
            Restaurant: {cart.restaurantName || `ID ${effectiveRestaurantId}`}
          </Text>
          
          {qrSessionData && (
            <View style={{ backgroundColor: '#e8f5e8', padding: 8, borderRadius: 6, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#2d5a2d', fontWeight: '500' }}>
                ✅ Session QR active - Code: {qrSessionData.originalCode}
              </Text>
            </View>
          )}
          
          {/* Affichage automatique du numéro de table (lecture seule) */}
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', marginBottom: 6 }}>
              Numéro de table
            </Text>
            
            {getEffectiveTableNumber() ? (
              <View style={{
                borderWidth: 1,
                borderColor: '#4CAF50',
                borderRadius: 8,
                padding: 12,
                backgroundColor: '#f0f8f0',
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#2d5a2d', flex: 1 }}>
                  Table {getEffectiveTableNumber()}
                </Text>
                <Text style={{ fontSize: 12, color: '#4CAF50', fontWeight: '500' }}>
                  📱 Auto
                </Text>
              </View>
            ) : (
              <View style={{
                borderWidth: 1,
                borderColor: '#f44336',
                borderRadius: 8,
                padding: 12,
                backgroundColor: '#fff5f5',
              }}>
                <Text style={{ fontSize: 14, color: '#f44336', textAlign: 'center' }}>
                  ⚠️ Numéro de table manquant
                </Text>
                <Text style={{ fontSize: 12, color: '#666', textAlign: 'center', marginTop: 4 }}>
                  Veuillez scanner le QR code de votre table
                </Text>
              </View>
            )}
            
            {getEffectiveTableNumber() && (
              <Text style={{ fontSize: 12, color: '#4CAF50', marginTop: 4 }}>
                📱 Numéro récupéré automatiquement depuis le QR code
              </Text>
            )}
          </View>
        </Card>

        {/* Customer Name Field */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Nom du client *
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 12,
              backgroundColor: '#fff',
            }}
            placeholder="Votre nom"
            value={customerName}
            onChangeText={setCustomerName}
            maxLength={100}
          />
        </Card>

        {/* Articles */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Vos articles ({cart.itemCount} {cart.itemCount > 1 ? 'articles' : 'article'})
          </Text>
          {cart.items.map((item, index) => (
            <View 
              key={item.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderBottomWidth: index < cart.items.length - 1 ? 1 : 0,
                borderBottomColor: '#f0f0f0',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500' }}>
                  {item.quantity}x {item.name}
                </Text>
                <Text style={{ fontSize: 12, color: '#888' }}>
                  ID: {item.id} | Qty: {item.quantity}
                </Text>
                {item.specialInstructions && (
                  <Text style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>
                    Note: {item.specialInstructions}
                  </Text>
                )}
                {item.customizations && Object.keys(item.customizations).length > 0 && (
                  <Text style={{ fontSize: 12, color: '#666' }}>
                    Personnalisation incluse
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#FF6B35' }}>
                {(item.price * item.quantity).toFixed(2)} €
              </Text>
            </View>
          ))}
        </Card>

        {/* Notes spéciales */}
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Instructions spéciales (optionnel)
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 8,
              padding: 12,
              minHeight: 80,
              textAlignVertical: 'top',
              backgroundColor: '#fff',
            }}
            placeholder="Allergies, préférences de cuisson, etc..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            maxLength={500}
          />
          {notes.length > 0 && (
            <Text style={{ fontSize: 12, color: '#666', textAlign: 'right', marginTop: 4 }}>
              {notes.length}/500
            </Text>
          )}
        </Card>

        {/* Résumé */}
        <Card style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>
            Résumé
          </Text>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Total</Text>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#FF6B35' }}>
              {cart.total.toFixed(2)} €
            </Text>
          </View>

          {!effectiveTableNumber ? (
            <View>
              <QRAccessButtons
                title="Scanner pour continuer"
                description="Scannez le QR code de votre table pour finaliser votre commande"
                compact={true}
                vertical={true}
                onSuccess={(restaurantId, tableNumber) => {
                  console.log('QR scanné depuis checkout button:', { restaurantId, tableNumber });
                  // La page se rechargera automatiquement grâce au context
                }}
              />
            </View>
          ) : (
            <Button
              title={loading ? "Commande en cours..." : "Confirmer la commande"}
              onPress={handlePlaceOrder}
              loading={loading}
              disabled={loading}
              fullWidth
              style={{ backgroundColor: '#FF6B35' }}
            />
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}