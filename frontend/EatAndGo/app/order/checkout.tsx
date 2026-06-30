// checkout.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

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
import { AuthGateModal } from '@/components/auth/AuthGateModal';

// Services & Utils
import { clientOrderService } from '@/services/clientOrderService';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';
import { QRSessionUtils } from '@/utils/qrSessionUtils';
import {
  useAppTheme,
  SPACING,
  TYPOGRAPHY,
  useScreenType,
  getResponsiveValue,
} from '@/utils/designSystem';

export default function CheckoutScreen() {
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const { cart, clearCart, setTableNumber } = useCart();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

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
  const { session, participantId: ctxParticipantId, isHost } = useSession();
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

  // ── Gate d'authentification ──────────────────────────────────────────────
  // Si l'utilisateur n'est pas connecté et qu'il atterrit ici (typiquement
  // après "Passer commande" depuis le menu d'un QR scan), on affiche une
  // modale de choix : se connecter, créer un compte, ou continuer en invité.
  //
  // Cas particulier : en session collaborative, on désactive le mode invité.
  // Les invités peuvent rejoindre une session (déjà géré côté backend via
  // guest_name + participantId), mais le checkout final passe soit par
  // l'hôte authentifié, soit par le split payment qui accepte les
  // participants invités via X-Participant-ID.
  const [showAuthGate, setShowAuthGate] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setShowAuthGate(true);
    } else {
      setShowAuthGate(false);
    }
  }, [isAuthenticated, authLoading]);

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
      return { valid: false, error: t('checkout.validation.restaurantMissing') };
    }

    if (!tableNumber) {
      return { valid: false, error: t('checkout.validation.tableRequired') };
    }

    const itemsToValidate = isSessionMode ? sessionCart.items : cart.items;
    if (itemsToValidate.length === 0) {
      return { valid: false, error: t('checkout.validation.cartEmpty') };
    }

    if (!customerName.trim()) {
      return { valid: false, error: t('checkout.validation.nameRequired') };
    }

    return { 
      valid: true, 
      restaurantId, 
      tableNumber 
    };
  };

  // Soumission de la commande
  const handleSubmitOrder = async () => {
    // En session collaborative, seul l'hôte peut passer commande.
    // isSessionMode est false hors session → ce bloc n'est jamais atteint
    // pour les commandes solo ou invité.
    if (isSessionMode && !isHost) {
      showToast('error', t('cart.hostOnlyCheckout'), t('errors.forbidden'));
      return;
    }

    const validation = validateCheckout();
    
    if (!validation.valid) {
      showToast('error', validation.error || '', t('common.error'));
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
            ? t('checkout.toast.addedToSession')
            : t('checkout.toast.sentToRestaurant'),
          t('checkout.toast.orderPlacedTitle')
        );
        // router.replace('/orders' as any);
        return;
      }

      console.log('✅ Order created successfully:', order);
      isSessionMode ? await sessionCart.clearMyItems() : clearCart();

      if (isInSession && session) {
        // Notifier tous les participants du passage en paiement
        try {
          await collaborativeSessionService.sessionAction(session.id, 'payment');
        } catch (e) {
          console.warn('[Checkout] session payment broadcast failed:', e);
        }
        showToast(
          'success',
          t('checkout.toast.addedToSessionNumbered', { number: order.order_number }),
          t('checkout.toast.orderAddedTitle')
        );
        router.replace(`/order/payment?orderId=${order.id}` as any);
      } else {
        router.replace(`/order/${order.id}` as any);
      }
    } catch (error: any) {
      console.error('❌ Error creating order:', error);
      showToast('error', error?.message || t('checkout.toast.createFailed'), t('common.error'));
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

  // Carte "session collaborative" : pastel vert en clair, fond vert sombre
  // teinté en dark pour rester cohérent avec le thème. Le texte passe sur le
  // vert de succès du thème en dark (lisible sur fond sombre).
  const sessionCardBg = isDark ? 'rgba(16, 185, 129, 0.12)' : '#E8F5E8';
  const sessionCardText = isDark ? colors.success : '#2D5A2D';

  // ─── Cas spéciaux d'affichage ─────────────────────────────────────────────

  // 1) Auth encore en chargement → loader plein écran
  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Header
          title={t('checkout.headerTitle')}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{
            marginTop: getResponsiveValue(SPACING.md, screenType),
            color: colors.text.secondary,
            fontSize: fontSize.body,
          }}>
            {t('common.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 2) Non authentifié → AuthGateModal bloquant (rien d'autre affiché)
  //    On ne montre pas le formulaire de checkout en arrière-plan car il
  //    n'est pas utilisable sans authentification.
  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header
          title={t('checkout.headerTitle')}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />

        <View style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: getResponsiveValue(SPACING['2xl'], screenType),
        }}>
          <Ionicons
            name="lock-closed-outline"
            size={getResponsiveValue({ mobile: 60, tablet: 70, desktop: 80 }, screenType)}
            color={colors.border.dark}
          />
          <Text style={{
            fontSize: fontSize.title,
            fontWeight: TYPOGRAPHY.fontWeight.semibold,
            color: colors.text.primary,
            marginTop: getResponsiveValue(SPACING.md, screenType),
            textAlign: 'center',
          }}>
            {t('checkout.authRequired')}
          </Text>
          <Text style={{
            fontSize: fontSize.body,
            color: colors.text.secondary,
            marginTop: getResponsiveValue(SPACING.xs, screenType),
            textAlign: 'center',
          }}>
            {t('checkout.authRequiredHint')}
          </Text>

          <Button
            title={t('checkout.seeOptions')}
            onPress={() => setShowAuthGate(true)}
            style={{ marginTop: getResponsiveValue(SPACING.lg, screenType) }}
          />
        </View>

        <AuthGateModal
          visible={showAuthGate}
          onClose={() => {
            // Si l'utilisateur ferme la modale sans choisir, il revient
            // simplement à l'état d'attente (bouton "Voir les options")
            setShowAuthGate(false);
          }}
          returnTo={pathname || '/order/checkout'}
          guestCheckoutParams={{
            restaurantId: restaurantId ? String(restaurantId) : undefined,
            tableNumber: effectiveTableNumber || tableNumber || undefined,
            sessionId: sessionId || undefined,
          }}
          // Bloquer le mode invité en session collaborative :
          // - la commande groupée est l'affaire de l'hôte authentifié
          // - les invités déjà dans la session passent par split payment
          allowGuest={!isSessionMode}
          title={isSessionMode
            ? t('checkout.authGate.titleSession')
            : t('checkout.authGate.titleSolo')
          }
          subtitle={isSessionMode
            ? t('checkout.authGate.subtitleSession')
            : t('checkout.authGate.subtitleSolo')
          }
        />
      </View>
    );
  }

  // ─── Affichage normal (utilisateur authentifié) ──────────────────────────

  const activeItems = isSessionMode ? sessionCart.items : cart.items;
  if (activeItems.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Header 
          title={t('checkout.headerTitle')}
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
            color={colors.border.dark} 
          />
          <Text style={{ 
            fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
            fontWeight: TYPOGRAPHY.fontWeight.bold, 
            color: colors.text.primary, 
            marginTop: getResponsiveValue(SPACING.md, screenType)
          }}>
            {t('cart.empty')}
          </Text>
          <Button 
            title={t('cart.backToMenu')}
            onPress={() => router.back()}
            style={{ 
              backgroundColor: colors.border.dark, 
              marginTop: getResponsiveValue(SPACING.md, screenType)
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header 
        title={t('checkout.headerTitle')}
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

      <ScrollView contentContainerStyle={{ padding: spacing.container, paddingBottom: 8 }}>
        {isInSession && session && (
          <Card style={{ 
            marginBottom: spacing.card, 
            backgroundColor: sessionCardBg, 
            borderColor: colors.success,
            borderWidth: 1,
          }}>
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              gap: getResponsiveValue(SPACING.sm, screenType)
            }}>
              <Ionicons name="people" size={iconSize} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={{ 
                  fontSize: fontSize.subtitle, 
                  fontWeight: TYPOGRAPHY.fontWeight.semibold, 
                  color: sessionCardText, 
                  marginBottom: 4 
                }}>
                  {t('checkout.session.title')}
                </Text>
                <Text style={{ fontSize: fontSize.body, color: sessionCardText }}>
                  {t('checkout.session.tableInfo', {
                    table: session.table_number,
                    count: session.participant_count,
                  })}
                </Text>
                {currentParticipant && (
                  <Text style={{ 
                    fontSize: fontSize.body, 
                    color: sessionCardText, 
                    marginTop: 4 
                  }}>
                    {t('checkout.session.youAre', { name: currentParticipant.display_name })}
                    {currentParticipant.is_host && t('checkout.session.hostSuffix')}
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
            color: colors.text.primary,
            marginBottom: getResponsiveValue(SPACING.sm, screenType)
          }}>
            {t('checkout.details.title')}
          </Text>
          
          <Text style={{ 
            fontSize: fontSize.subtitle, 
            color: colors.text.primary, 
            marginBottom: getResponsiveValue(SPACING.xs, screenType)
          }}>
            {t('checkout.details.restaurant', {
              name: cart.restaurantName
                || t('checkout.details.restaurantFallback', { id: getEffectiveRestaurantId() }),
            })}
          </Text>
          
          <View style={{ marginTop: getResponsiveValue(SPACING.xs, screenType) }}>
            <Text style={{ 
              fontSize: fontSize.body, 
              fontWeight: TYPOGRAPHY.fontWeight.medium, 
              color: colors.text.primary,
              marginBottom: getResponsiveValue(SPACING.xs, screenType)
            }}>
              {t('checkout.details.tableNumber')}
            </Text>
            <View style={{ 
              backgroundColor: colors.border.light,
              padding: getResponsiveValue(SPACING.sm, screenType),
              borderRadius: 8,
            }}>
              <Text style={{ 
                fontSize: fontSize.subtitle, 
                fontWeight: TYPOGRAPHY.fontWeight.semibold, 
                color: colors.primary 
              }}>
                {t('checkout.details.table', {
                  number: getEffectiveTableNumber() || t('checkout.details.tableUndefined'),
                })}
              </Text>
            </View>
          </View>
        </Card>

        <Card style={{ marginBottom: spacing.card }}>
          <Text style={{ 
            fontSize: fontSize.title, 
            fontWeight: TYPOGRAPHY.fontWeight.semibold, 
            color: colors.text.primary,
            marginBottom: getResponsiveValue(SPACING.md, screenType)
          }}>
            {t('checkout.info.title')}
          </Text>
          
          <Input
            label={t('checkout.info.nameLabel')}
            value={customerName}
            onChangeText={setCustomerName}
            placeholder={t('checkout.info.namePlaceholder')}
            required
            style={{ marginBottom: getResponsiveValue(SPACING.md, screenType) }}
          />
          
          <Input
            label={t('checkout.info.notesLabel')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('checkout.info.notesPlaceholder')}
            multiline
            numberOfLines={3}
          />
        </Card>

        <Card style={{ marginBottom: spacing.card }}>
          <Text style={{ 
            fontSize: fontSize.title, 
            fontWeight: TYPOGRAPHY.fontWeight.semibold, 
            color: colors.text.primary,
            marginBottom: getResponsiveValue(SPACING.sm, screenType)
          }}>
            {t('checkout.summary.title', {
              count: isSessionMode ? sessionCart.items_count : cart.itemCount,
            })}
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
                borderBottomColor: colors.border.light
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ 
                  fontSize: fontSize.body, 
                  fontWeight: TYPOGRAPHY.fontWeight.medium, 
                  color: colors.text.primary 
                }}>
                  {item.quantity}x {item.name}
                </Text>
                {item.specialInstructions && (
                  <Text style={{ 
                    fontSize: fontSize.body, 
                    color: colors.text.secondary, 
                    marginTop: 2 
                  }}>
                    {item.specialInstructions}
                  </Text>
                )}
              </View>
              <Text style={{ 
                fontSize: fontSize.body, 
                fontWeight: TYPOGRAPHY.fontWeight.semibold, 
                color: colors.primary 
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
            borderTopColor: colors.primary
          }}>
            <Text style={{ 
              fontSize: fontSize.title, 
              fontWeight: TYPOGRAPHY.fontWeight.bold,
              color: colors.text.primary,
            }}>
              {t('cart.total')}
            </Text>
            <Text style={{ 
              fontSize: getResponsiveValue(TYPOGRAPHY.fontSize.xl, screenType),
              fontWeight: TYPOGRAPHY.fontWeight.bold, 
              color: colors.primary 
            }}>
              {(isSessionMode ? sessionCart.total : cart.total).toFixed(2)} €
            </Text>
          </View>
        </Card>
      </ScrollView>

      {/* Footer sticky — safe area bottom uniquement */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 16),
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border.light,
      }}>
        <Button
          title={isSubmitting
            ? t('checkout.submit.submitting')
            : isSessionMode
              ? t('checkout.submit.placeGroupOrder')
              : t('checkout.submit.validateOrder')}
          onPress={handleSubmitOrder}
          disabled={isSubmitting}
          fullWidth
          leftIcon={<Ionicons name="checkmark-circle" size={iconSize} color={colors.text.inverse} />}
        />
      </View>
    </View>
  );
}