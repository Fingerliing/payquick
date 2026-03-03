// checkout.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Contexts & Hooks
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSession } from '@/contexts/SessionContext';
import { useSessionCart } from '@/hooks/session/useSessionCart';

// Components
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert as InlineAlert } from '@/components/ui/Alert';

// Services & Utils
import { clientOrderService } from '@/services/clientOrderService';
import { QRSessionUtils } from '@/utils/qrSessionUtils';
import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

export default function CheckoutScreen() {
  const params = useLocalSearchParams();
  const { cart, clearCart, setTableNumber } = useCart();
  const { isAuthenticated, user } = useAuth();
  const screenType = useScreenType();

  // Typage sûr des paramètres
  const restaurantId = params.restaurantId as string | undefined;
  const tableNumber = params.tableNumber as string | undefined;
  const sessionId = params.sessionId as string | undefined;

  // États du formulaire
  const [customerName, setCustomerName] = useState(user?.first_name || '');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 🔔 Toast / Alert custom
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

  // SessionContext : source de vérité pour la session active
  const { session, participantId: ctxParticipantId } = useSession();
  const isSessionMode = !!session && !!sessionId;

  const [effectiveTableNumber, setEffectiveTableNumber] = useState(
    tableNumber || cart.tableNumber || session?.table_number || ''
  );

  // Panier partagé en mode session
  const sessionCart = useSessionCart({
    sessionId: session?.id,
    participantId: ctxParticipantId,
    enabled: isSessionMode,
  });

  // Aliases pour compatibilité avec le reste du code
  const isInSession = isSessionMode;
  const currentParticipant = session?.participants?.find(p => p.id === ctxParticipantId) ?? null;

  // Charger les données de session QR au montage
  useEffect(() => {
    const loadQRSession = async () => {
      const qrData = await QRSessionUtils.getSession();
      const resolved = qrData?.tableNumber || session?.table_number;
      if (resolved && !effectiveTableNumber) {
        setEffectiveTableNumber(resolved);
        setTableNumber(resolved);
      }
    };
    loadQRSession();
  }, []);

  // Validation du panier
  const getEffectiveRestaurantId = () => {
    return restaurantId 
      ? parseInt(restaurantId) 
      : cart.restaurantId || 0;
  };

  const getEffectiveTableNumber = () => {
    return effectiveTableNumber || tableNumber || cart.tableNumber || session?.table_number || '';
  };

  // Validation
  const validateCheckout = () => {
    const restaurantId = getEffectiveRestaurantId();
    const tableNumber = getEffectiveTableNumber();

    if (!restaurantId) {
      return { valid: false, error: 'Restaurant non défini' };
    }

    if (!tableNumber) {
      return { valid: false, error: 'Numéro de table requis' };
    }

    const itemsToValidate = isSessionMode ? sessionCart.items : cart.items;
    if (itemsToValidate.length === 0) {
      return { valid: false, error: 'Panier vide' };
    }

    if (!customerName.trim()) {
      return { valid: false, error: 'Nom requis' };
    }

    return { 
      valid: true, 
      restaurantId, 
      tableNumber 
    };
  };

  // Soumission de la commande
  const handleSubmitOrder = async () => {
    const validation = validateCheckout();
    
    if (!validation.valid) {
      showToast('error', validation.error || '', 'Erreur');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: any = {
        restaurant: validation.restaurantId,
        order_type: 'dine_in' as const,
        table_number: String(validation.tableNumber),
        customer_name: customerName.trim(),
        phone: '',
        payment_method: 'cash',
        notes: notes.trim() || null,
        items: isSessionMode
          ? sessionCart.items.map(i => ({
              id: i.id,
              menuItemId: i.menu_item,
              name: i.menu_item_name,
              price: parseFloat(i.menu_item_price || '0'),
              quantity: i.quantity,
              specialInstructions: i.special_instructions || '',
              customizations: i.customizations || {},
            }))
          : cart.items,
      };

      const context: any = {};
      if (session && currentParticipant) {
        context.session_id = session.id;
        context.participant_id = currentParticipant.id;
      }

      console.log('📤 Creating order with session context:', {
        payload,
        context,
        hasSession: !!session,
        participantId: currentParticipant?.id
      });

      const order = await clientOrderService.createFromCart(payload);

      if (!order || !order.id) {
        console.warn('⚠️ Order created but no data returned');
        isSessionMode ? await sessionCart.clearMyItems() : clearCart();
        showToast(
          'success',
          isInSession 
            ? 'Votre commande a été ajoutée à la session collaborative.'
            : 'Votre commande a été envoyée au restaurant.',
          'Commande passée !'
        );
        // router.replace('/orders' as any);
        return;
      }

      console.log('✅ Order created successfully:', order);
      isSessionMode ? await sessionCart.clearMyItems() : clearCart();

      if (isInSession && session) {
        showToast(
          'success',
          `Votre commande #${order.order_number} a été ajoutée à la session collaborative.`,
          'Commande ajoutée !'
        );
        router.replace(`/order/payment?orderId=${order.id}` as any);
      } else {
        router.replace(`/order/${order.id}` as any);
      }
    } catch (error: any) {
      console.error('❌ Error creating order:', error);
      showToast('error', error?.message || 'Erreur lors de la création de la commande', 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Valeurs responsive
  const spacing = {
    container: getResponsiveValue(SPACING.md, screenType),
    card: getResponsiveValue(SPACING.md, screenType),
    section: getResponsiveValue(SPACING.sm, screenType),
  };

  const iconSize = getResponsiveValue({ mobile: 24, tablet: 28, desktop: 32 }, screenType);
  const fontSize = {
    title: getResponsiveValue(TYPOGRAPHY.fontSize.lg, screenType),
    subtitle: getResponsiveValue(TYPOGRAPHY.fontSize.base, screenType),
    body: getResponsiveValue(TYPOGRAPHY.fontSize.sm, screenType),
  };

  if (false) { // supprimé : SessionContext est synchrone, pas de sessionLoading
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <Header 
          title="Finaliser la commande" 
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ 
            marginTop: getResponsiveValue(SPACING.md, screenType), 
            color: COLORS.text.secondary,
            fontSize: fontSize.body,
          }}>
            Chargement de la session...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeItems = isSessionMode ? sessionCart.items : cart.items;
  if (activeItems.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <Header 
          title="Finaliser la commande" 
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
        <View style={{ 
          flex: 1, 
          justifyContent: 'center', 
          alignItems: 'center', 
          padding: getResponsiveValue(SPACING['2xl'], screenType)
        }}>
          <Ionicons 
            name="bag-outline" 
            size={getResponsiveValue({ mobile: 70, tablet: 80, desktop: 90 }, screenType)} 
            color={COLORS.border.dark} 
          />
          <Text style={{ 
            fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
            fontWeight: TYPOGRAPHY.fontWeight.bold, 
            color: COLORS.text.primary, 
            marginTop: getResponsiveValue(SPACING.md, screenType)
          }}>
            Votre panier est vide
          </Text>
          <Button 
            title="Retour au menu"
            onPress={() => router.back()}
            style={{ 
              backgroundColor: COLORS.border.dark, 
              marginTop: getResponsiveValue(SPACING.md, screenType)
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header 
        title="Finaliser la commande" 
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

      <ScrollView contentContainerStyle={{ padding: spacing.container }}>
        {isInSession && session && (
          <Card style={{ 
            marginBottom: spacing.card, 
            backgroundColor: '#E8F5E8', 
            borderColor: COLORS.success,
            borderWidth: 1,
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              gap: getResponsiveValue(SPACING.sm, screenType)
            }}>
              <Ionicons name="people" size={iconSize} color={COLORS.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ 
                  fontSize: fontSize.subtitle, 
                  fontWeight: TYPOGRAPHY.fontWeight.semibold, 
                  color: '#2D5A2D', 
                  marginBottom: 4 
                }}>
                  Session collaborative
                </Text>
                <Text style={{ fontSize: fontSize.body, color: '#2D5A2D' }}>
                  Table {session.table_number} • {session.participant_count} participant(s)
                </Text>
                {currentParticipant && (
                  <Text style={{ 
                    fontSize: fontSize.body, 
                    color: '#2D5A2D', 
                    marginTop: 4 
                  }}>
                    Vous êtes : {currentParticipant.display_name}
                    {currentParticipant.is_host && ' (Hôte)'}
                  </Text>
                )}
              </View>
            </View>
          </Card>
        )}

        <Card style={{ marginBottom: spacing.card }}>
          <Text style={{ 
            fontSize: fontSize.title, 
            fontWeight: TYPOGRAPHY.fontWeight.semibold, 
            color: COLORS.text.primary,
            marginBottom: getResponsiveValue(SPACING.sm, screenType)
          }}>
            Détails de la commande
          </Text>
          
          <Text style={{ 
            fontSize: fontSize.subtitle, 
            color: COLORS.text.primary, 
            marginBottom: getResponsiveValue(SPACING.xs, screenType)
          }}>
            Restaurant: {cart.restaurantName || `ID ${getEffectiveRestaurantId()}`}
          </Text>
          
          <View style={{ marginTop: getResponsiveValue(SPACING.xs, screenType) }}>
            <Text style={{ 
              fontSize: fontSize.body, 
              fontWeight: TYPOGRAPHY.fontWeight.medium, 
              color: COLORS.text.primary,
              marginBottom: getResponsiveValue(SPACING.xs, screenType)
            }}>
              Numéro de table
            </Text>
            <View style={{ 
              backgroundColor: COLORS.border.light,
              padding: getResponsiveValue(SPACING.sm, screenType),
              borderRadius: 8,
            }}>
              <Text style={{ 
                fontSize: fontSize.subtitle, 
                fontWeight: TYPOGRAPHY.fontWeight.semibold, 
                color: COLORS.primary 
              }}>
                Table {getEffectiveTableNumber() || 'Non définie'}
              </Text>
            </View>
          </View>
        </Card>

        <Card style={{ marginBottom: spacing.card }}>
          <Text style={{ 
            fontSize: fontSize.title, 
            fontWeight: TYPOGRAPHY.fontWeight.semibold, 
            color: COLORS.text.primary,
            marginBottom: getResponsiveValue(SPACING.md, screenType)
          }}>
            Vos informations
          </Text>
          
          <Input
            label="Nom"
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Entrez votre nom"
            required
            style={{ marginBottom: getResponsiveValue(SPACING.md, screenType) }}
          />
          
          <Input
            label="Instructions spéciales (optionnel)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: Sans oignons, allergies..."
            multiline
            numberOfLines={3}
          />
        </Card>

        <Card style={{ marginBottom: spacing.card }}>
          <Text style={{ 
            fontSize: fontSize.title, 
            fontWeight: TYPOGRAPHY.fontWeight.semibold, 
            color: COLORS.text.primary,
            marginBottom: getResponsiveValue(SPACING.sm, screenType)
          }}>
            Résumé ({(isSessionMode ? sessionCart.items_count : cart.itemCount)} article{(isSessionMode ? sessionCart.items_count : cart.itemCount) > 1 ? 's' : ''})
          </Text>
          
          {(isSessionMode
            ? sessionCart.items.map(i => ({
                id: i.id,
                name: i.menu_item_name,
                price: parseFloat(i.menu_item_price || '0'),
                quantity: i.quantity,
                specialInstructions: i.special_instructions || undefined,
              }))
            : cart.items
          ).map((item) => (
            <View 
              key={item.id}
              style={{ 
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: getResponsiveValue(SPACING.xs, screenType),
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border.light
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ 
                  fontSize: fontSize.body, 
                  fontWeight: TYPOGRAPHY.fontWeight.medium, 
                  color: COLORS.text.primary 
                }}>
                  {item.quantity}x {item.name}
                </Text>
                {item.specialInstructions && (
                  <Text style={{ 
                    fontSize: fontSize.body, 
                    color: COLORS.text.secondary, 
                    marginTop: 2 
                  }}>
                    {item.specialInstructions}
                  </Text>
                )}
              </View>
              <Text style={{ 
                fontSize: fontSize.body, 
                fontWeight: TYPOGRAPHY.fontWeight.semibold, 
                color: COLORS.primary 
              }}>
                {(item.price * item.quantity).toFixed(2)} €
              </Text>
            </View>
          ))}
          
          <View style={{ 
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingTop: getResponsiveValue(SPACING.sm, screenType),
            marginTop: getResponsiveValue(SPACING.sm, screenType),
            borderTopWidth: 2,
            borderTopColor: COLORS.primary
          }}>
            <Text style={{ 
              fontSize: fontSize.title, 
              fontWeight: TYPOGRAPHY.fontWeight.bold,
              color: COLORS.text.primary,
            }}>
              Total
            </Text>
            <Text style={{ 
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
              fontWeight: TYPOGRAPHY.fontWeight.bold, 
              color: COLORS.primary 
            }}>
              {(isSessionMode ? sessionCart.total : cart.total).toFixed(2)} €
            </Text>
          </View>
        </Card>

        <Button
          title={isSubmitting ? "Envoi en cours..." : isSessionMode ? "Passer commande" : "Valider la commande"}
          onPress={handleSubmitOrder}
          disabled={isSubmitting}
          fullWidth
          leftIcon={<Ionicons name="checkmark-circle" size={iconSize} color={COLORS.text.inverse} />}
        />
      </ScrollView>
    </SafeAreaView>
  );
}