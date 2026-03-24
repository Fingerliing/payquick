// frontend/EatAndGo/components/guards/UnpaidOrderGate.tsx
//
// Composant portail : bloque l'accès à certaines routes (menu, panier)
// tant que le client a des commandes impayées.
// Usage :
//   <UnpaidOrderGate>
//     <VotrePageMenu />
//   </UnpaidOrderGate>

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnpaidOrderGuard } from '@/hooks/useUnpaidOrderGuard';
import { Header } from '@/components/ui/Header';
import { Loading } from '@/components/ui/Loading';
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
  SHADOWS,
} from '@/utils/designSystem';

interface UnpaidOrderGateProps {
  children: React.ReactNode;
}

export function UnpaidOrderGate({ children }: UnpaidOrderGateProps) {
  const { hasUnpaid, unpaidOrders, isLoading } = useUnpaidOrderGuard();
  const screenType = useScreenType();
  const insets = useSafeAreaInsets();

  // Pendant le premier check, laisser passer (UX fluide)
  if (isLoading && unpaidOrders.length === 0) {
    return <>{children}</>;
  }

  // Pas de commande impayée → accès normal
  if (!hasUnpaid) {
    return <>{children}</>;
  }

  // ── Écran de blocage ──────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Header
        title="Accès restreint"
        leftIcon="arrow-back"
        onLeftPress={() => router.back()}
      />

      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: getResponsiveValue(SPACING.xl, screenType),
          paddingBottom: insets.bottom + 20,
        }}
      >
        {/* Icône */}
        <View
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: '#FEE2E2',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: getResponsiveValue(SPACING.lg, screenType),
          }}
        >
          <Ionicons name="lock-closed" size={48} color="#B91C1C" />
        </View>

        {/* Titre */}
        <Text
          style={{
            fontSize: getResponsiveValue(
              { mobile: 22, tablet: 26, desktop: 28 },
              screenType
            ),
            fontWeight: '700',
            color: COLORS.text.primary,
            textAlign: 'center',
            marginBottom: getResponsiveValue(SPACING.sm, screenType),
          }}
        >
          Paiement en attente
        </Text>

        {/* Message */}
        <Text
          style={{
            fontSize: getResponsiveValue(
              { mobile: 15, tablet: 16, desktop: 17 },
              screenType
            ),
            color: COLORS.text.secondary,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: getResponsiveValue(SPACING.xl, screenType),
            maxWidth: 360,
          }}
        >
          Vous avez{' '}
          {unpaidOrders.length === 1
            ? 'une commande impayée'
            : `${unpaidOrders.length} commandes impayées`}
          . Veuillez régler vos commandes avant de pouvoir accéder au menu ou passer une nouvelle commande.
        </Text>

        {/* Liste des commandes impayées */}
        <View
          style={{
            width: '100%',
            maxWidth: 400,
            marginBottom: getResponsiveValue(SPACING.xl, screenType),
          }}
        >
          {unpaidOrders.map((order) => (
            <Pressable
              key={order.id}
              onPress={() =>
                router.push({ pathname: '/order/[id]', params: { id: String(order.id) } })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: COLORS.surface.primary ?? COLORS.surface,
                borderRadius: BORDER_RADIUS.lg,
                padding: getResponsiveValue(SPACING.md, screenType),
                marginBottom: getResponsiveValue(SPACING.sm, screenType),
                borderWidth: 1,
                borderColor: COLORS.border.light,
                ...SHADOWS.sm,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: '#FEF3C7',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: getResponsiveValue(SPACING.sm, screenType),
                }}
              >
                <Ionicons name="receipt-outline" size={20} color="#D97706" />
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontWeight: '600',
                    color: COLORS.text.primary,
                    fontSize: 14,
                  }}
                >
                  #{order.order_number}
                </Text>
                <Text
                  style={{
                    color: COLORS.text.secondary,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {order.restaurant_name} — {order.total_amount} €
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: '#FEE2E2',
                  borderRadius: BORDER_RADIUS.sm,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#B91C1C', fontSize: 11, fontWeight: '600' }}>
                  Impayée
                </Text>
              </View>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={COLORS.text.light}
                style={{ marginLeft: 8 }}
              />
            </Pressable>
          ))}
        </View>

        {/* Bouton principal → Aller aux commandes */}
        <Pressable
          onPress={() => router.navigate('/(client)/orders')}
          style={{
            backgroundColor: COLORS.primary,
            borderRadius: BORDER_RADIUS.lg,
            paddingHorizontal: 32,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            ...SHADOWS.md,
          }}
        >
          <Ionicons name="card-outline" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            Voir mes commandes
          </Text>
        </Pressable>

        {/* Bouton secondaire → Retour */}
        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: getResponsiveValue(SPACING.md, screenType),
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: COLORS.text.secondary,
              fontSize: 14,
              textDecorationLine: 'underline',
            }}
          >
            Retour
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
