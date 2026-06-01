/**
 * ItemSplitSelector — Interface du mode `items` du paiement divisé.
 *
 * Affiche la liste des articles de la commande. Chaque article peut être
 * claim par un ou plusieurs participants ; si plusieurs claimants, le prix
 * est divisé équitablement entre eux (logique côté backend).
 *
 * - L'utilisateur courant ne peut modifier QUE sa propre portion
 *   (sauf si c'est l'hôte, qui peut tout modifier).
 * - Affiche un récap des montants par portion, un avertissement si des
 *   articles ne sont pas encore attribués, et les boutons de paiement.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SplitPaymentSession, SplitPaymentPortion } from '@/types/splitPayment';
import type { OrderDetail, OrderItem } from '@/types/order';

const COLORS = {
  primary: '#1E2A78',
  secondary: '#FFC845',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  text: { primary: '#0F172A', secondary: '#475569', light: '#64748B' },
  border: { light: '#E2E8F0', medium: '#CBD5E1' },
};

interface ItemSplitSelectorProps {
  order: OrderDetail;
  session: SplitPaymentSession;
  /** ID de la portion contrôlée par l'utilisateur courant */
  currentUserPortionId: string;
  /** Vrai si l'utilisateur courant est l'hôte (peut modifier toutes les portions) */
  isHost: boolean;
  /** Vrai si une opération est en cours (désactive les contrôles) */
  isProcessing: boolean;
  onClaim: (portionId: string, orderItemId: number) => void | Promise<void>;
  onUnclaim: (portionId: string, orderItemId: number) => void | Promise<void>;
  onPayPortion: (portionId: string) => void | Promise<void>;
  onPayAllRemaining: () => void | Promise<void>;
}

const formatCurrency = (value: number): string => `${(value ?? 0).toFixed(2)} €`;

const getItemName = (item: OrderItem): string => item.menu_item_name || 'Article sans nom';

const getItemImage = (item: OrderItem): string | undefined =>
  (item as any).menu_item_image || (item as any).image || undefined;

export const ItemSplitSelector: React.FC<ItemSplitSelectorProps> = ({
  order,
  session,
  currentUserPortionId,
  isHost,
  isProcessing,
  onClaim,
  onUnclaim,
  onPayPortion,
  onPayAllRemaining,
}) => {
  const items = order.items || [];
  const portions = session.portions || [];

  // Portion sélectionnée pour l'édition (host peut switcher entre portions)
  const [selectedPortionId, setSelectedPortionId] = React.useState<string>(currentUserPortionId);

  React.useEffect(() => {
    if (currentUserPortionId && currentUserPortionId !== selectedPortionId && !isHost) {
      setSelectedPortionId(currentUserPortionId);
    }
  }, [currentUserPortionId, isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map orderItemId -> liste de portions qui le claim (ordre stable)
  const claimsByItem = useMemo(() => {
    const map = new Map<number, SplitPaymentPortion[]>();
    for (const item of items) {
      const itemId = Number(item.id);
      const claimants = portions.filter((p) =>
        (p.claimedItemIds ?? []).includes(itemId)
      );
      map.set(itemId, claimants);
    }
    return map;
  }, [items, portions]);

  // Nombre d'articles non claim
  const unclaimedCount = useMemo(() => {
    let count = 0;
    for (const item of items) {
      const claimants = claimsByItem.get(Number(item.id)) || [];
      if (claimants.length === 0) count += 1;
    }
    return count;
  }, [items, claimsByItem]);

  const selectedPortion = portions.find((p) => p.id === selectedPortionId);
  const myPortion = portions.find((p) => p.id === currentUserPortionId);

  const otherUnpaidExist = portions.some(
    (p) => p.id !== currentUserPortionId && !p.isPaid
  );

  const canEditPortion = (portionId: string): boolean => {
    if (isProcessing) return false;
    const p = portions.find((pp) => pp.id === portionId);
    if (!p || p.isPaid) return false;
    if (isHost) return true;
    return portionId === currentUserPortionId;
  };

  const toggleClaim = (orderItemId: number) => {
    if (!selectedPortion) return;
    if (!canEditPortion(selectedPortion.id)) return;

    const claimants = claimsByItem.get(orderItemId) || [];
    const alreadyClaimed = claimants.some((c) => c.id === selectedPortion.id);
    if (alreadyClaimed) {
      onUnclaim(selectedPortion.id, orderItemId);
    } else {
      onClaim(selectedPortion.id, orderItemId);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      {/* Avertissement si articles non claim */}
      {unclaimedCount > 0 && (
        <Card style={{
          padding: 16,
          backgroundColor: COLORS.warning + '12',
          borderWidth: 1,
          borderColor: COLORS.warning + '40',
          borderRadius: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="alert-circle" size={22} color={COLORS.warning} />
            <Text style={{
              flex: 1,
              fontSize: 14,
              fontWeight: '600',
              color: COLORS.warning,
            }}>
              {unclaimedCount} article(s) sans attribution
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: COLORS.text.secondary, marginTop: 6 }}>
            Chaque article doit être pris en charge par au moins une personne
            avant que le paiement puisse commencer.
          </Text>
        </Card>
      )}

      {/* Sélecteur de portion (host uniquement) */}
      {isHost && portions.length > 1 && (
        <Card style={{ padding: 16, borderRadius: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.text.secondary, marginBottom: 10 }}>
            En tant qu'hôte, vous pouvez modifier la part de chaque personne :
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {portions.map((p) => {
              const isSelected = p.id === selectedPortionId;
              const isPaid = p.isPaid;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => !isPaid && setSelectedPortionId(p.id)}
                  disabled={isPaid}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderColor: isSelected ? COLORS.primary : COLORS.border.light,
                    backgroundColor: isSelected ? COLORS.primary + '12' : COLORS.surface,
                    opacity: isPaid ? 0.5 : 1,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{
                    fontSize: 13,
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? COLORS.primary : COLORS.text.primary,
                  }}>
                    {p.name || 'Anonyme'}
                    {isPaid ? ' ✓' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      )}

      {/* Liste des articles */}
      <Card style={{ padding: 16, borderRadius: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Ionicons name="restaurant-outline" size={20} color={COLORS.primary} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text.primary }}>
            Articles à attribuer
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {items.map((item) => {
            const itemId = Number(item.id);
            const claimants = claimsByItem.get(itemId) || [];
            const claimedByMe = !!selectedPortion && claimants.some((c) => c.id === selectedPortion.id);
            const editable = !!selectedPortion && canEditPortion(selectedPortion.id);
            const itemImg = getItemImage(item);
            const itemPrice = parseFloat(String(item.total_price)) || 0;
            const sharePerClaimant = claimants.length > 0
              ? itemPrice / claimants.length
              : itemPrice;

            return (
              <TouchableOpacity
                key={String(item.id)}
                onPress={() => editable && toggleClaim(itemId)}
                disabled={!editable}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: claimedByMe ? COLORS.primary : COLORS.border.light,
                  backgroundColor: claimedByMe ? COLORS.primary + '08' : COLORS.surface,
                  opacity: editable ? 1 : 0.85,
                }}
              >
                {/* Checkbox */}
                <View style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: claimedByMe ? COLORS.primary : COLORS.border.medium,
                  backgroundColor: claimedByMe ? COLORS.primary : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {claimedByMe && (
                    <Ionicons name="checkmark" size={16} color={COLORS.surface} />
                  )}
                </View>

                {/* Image (si dispo) */}
                {!!itemImg && (
                  <Image
                    source={{ uri: itemImg }}
                    style={{ width: 40, height: 40, borderRadius: 6 }}
                  />
                )}

                {/* Nom + claimants */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text.primary }}>
                    {item.quantity}× {getItemName(item)}
                  </Text>
                  {claimants.length === 0 ? (
                    <Text style={{ fontSize: 12, color: COLORS.warning, marginTop: 2 }}>
                      ⚠ Aucune attribution
                    </Text>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {claimants.map((c) => (
                        <View
                          key={c.id}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 10,
                            backgroundColor: c.id === currentUserPortionId
                              ? COLORS.primary
                              : COLORS.surfaceSecondary,
                          }}
                        >
                          <Text style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: c.id === currentUserPortionId ? COLORS.surface : COLORS.text.secondary,
                          }}>
                            {c.name || 'Anonyme'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Prix */}
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text.primary }}>
                    {formatCurrency(itemPrice)}
                  </Text>
                  {claimants.length > 1 && (
                    <Text style={{ fontSize: 11, color: COLORS.text.secondary, marginTop: 2 }}>
                      {claimants.length} × {formatCurrency(sharePerClaimant)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Récap des portions */}
      <Card style={{ padding: 16, borderRadius: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text.primary, marginBottom: 12 }}>
          Récapitulatif
        </Text>
        <View style={{ gap: 8 }}>
          {portions.map((p) => (
            <View
              key={p.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: p.id === currentUserPortionId
                  ? COLORS.primary + '08'
                  : COLORS.surfaceSecondary,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons
                  name={p.isPaid ? 'checkmark-circle' : 'person'}
                  size={18}
                  color={p.isPaid ? COLORS.success : COLORS.text.secondary}
                />
                <Text style={{
                  fontSize: 14,
                  fontWeight: p.id === currentUserPortionId ? '700' : '500',
                  color: COLORS.text.primary,
                }}>
                  {p.name || 'Anonyme'}
                  {p.id === currentUserPortionId ? ' (vous)' : ''}
                </Text>
              </View>
              <Text style={{
                fontSize: 14,
                fontWeight: '700',
                color: p.isPaid ? COLORS.success : COLORS.primary,
              }}>
                {formatCurrency(p.amount)}{p.isPaid ? ' ✓' : ''}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Boutons de paiement */}
      <View style={{ gap: 10 }}>
        {myPortion && !myPortion.isPaid && (
          <Button
            title={
              isProcessing
                ? 'Traitement…'
                : unclaimedCount > 0
                  ? `Payer ma part (${formatCurrency(myPortion.amount)}) — bloqué`
                  : `Payer ma part — ${formatCurrency(myPortion.amount)}`
            }
            onPress={() => onPayPortion(myPortion.id)}
            disabled={isProcessing || unclaimedCount > 0 || myPortion.amount <= 0}
            leftIcon={
              isProcessing ? (
                <ActivityIndicator size="small" color={COLORS.surface} />
              ) : (
                <Ionicons name="card-outline" size={18} color={COLORS.surface} />
              )
            }
            style={{ borderRadius: 12 }}
          />
        )}

        {otherUnpaidExist && (
          <Button
            title="Payer tout le reste"
            onPress={onPayAllRemaining}
            disabled={isProcessing || unclaimedCount > 0}
            variant="outline"
            leftIcon={<Ionicons name="cash-outline" size={18} color={COLORS.primary} />}
            style={{ borderRadius: 12 }}
          />
        )}
      </View>
    </View>
  );
};
