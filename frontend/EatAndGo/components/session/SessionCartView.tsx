/**
 * Affiche le panier partagé d'une session collaborative en temps réel.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSessionCart, SessionCartItem } from '@/hooks/session/useSessionCart';

// ─── Types ────────────────────────────────────────────────────────────────

interface SessionCartViewProps {
  sessionId: string;
  participantId?: string;
  /** Si true, affiche les contrôles de quantité (mode édition) */
  editable?: boolean;
  /** Callback quand le total change */
  onTotalChange?: (total: number) => void;
}

// ─── Sous-composant : item du panier ─────────────────────────────────────

interface CartItemRowProps {
  item: SessionCartItem;
  isOwn: boolean;
  editable: boolean;
  onQuantityChange: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}

const CartItemRow: React.FC<CartItemRowProps> = ({
  item,
  isOwn,
  editable,
  onQuantityChange,
  onRemove,
}) => (
  <View style={[styles.itemRow, isOwn && styles.itemRowOwn]}>
    {item.menu_item_image ? (
      <Image source={{ uri: item.menu_item_image }} style={styles.itemImage} />
    ) : (
      <View style={[styles.itemImage, styles.itemImagePlaceholder]}>
        <Ionicons name="restaurant-outline" size={20} color="#666" />
      </View>
    )}

    <View style={styles.itemInfo}>
      <Text style={styles.itemName} numberOfLines={1}>{item.menu_item_name}</Text>
      {item.special_instructions ? (
        <Text style={styles.itemNote} numberOfLines={1}>
          📝 {item.special_instructions}
        </Text>
      ) : null}
      <Text style={styles.participantBadge}>
        {isOwn ? '👤 Moi' : `👤 ${item.participant_name}`}
      </Text>
    </View>

    <View style={styles.itemRight}>
      {editable && isOwn ? (
        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() =>
              item.quantity === 1
                ? onRemove(item.id)
                : onQuantityChange(item.id, item.quantity - 1)
            }
          >
            <Ionicons
              name={item.quantity === 1 ? 'trash-outline' : 'remove'}
              size={16}
              color={item.quantity === 1 ? '#F44336' : '#1E2A78'}
            />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => onQuantityChange(item.id, item.quantity + 1)}
          >
            <Ionicons name="add" size={16} color="#1E2A78" />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.qtyBadge}>×{item.quantity}</Text>
      )}
      <Text style={styles.itemPrice}>
        {(parseFloat(item.total_price)).toFixed(2)} €
      </Text>
    </View>
  </View>
);

// ─── Composant principal ──────────────────────────────────────────────────

export const SessionCartView: React.FC<SessionCartViewProps> = ({
  sessionId,
  participantId,
  editable = true,
  onTotalChange,
}) => {
  const {
    items,
    total,
    items_count,
    isLoading,
    isConnected,
    error,
    updateItem,
    removeItem,
    itemsByParticipant,
  } = useSessionCart({ sessionId, participantId });

  // Notifier le parent quand le total change
  React.useEffect(() => {
    onTotalChange?.(total);
  }, [total]);

  const handleQuantityChange = (itemId: string, quantity: number) => {
    updateItem(itemId, { quantity });
  };

  const handleRemove = (itemId: string) => {
    removeItem(itemId);
  };

  if (isLoading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1E2A78" />
        <Text style={styles.loadingText}>Chargement du panier…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="cart-outline" size={48} color="#666" />
        <Text style={styles.emptyText}>Le panier est vide</Text>
        <Text style={styles.emptySubText}>
          Les articles ajoutés par tous les participants apparaîtront ici
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Barre de connexion WS */}
      <View style={[styles.wsBar, isConnected ? styles.wsConnected : styles.wsDisconnected]}>
        <Ionicons
          name={isConnected ? 'wifi' : 'wifi-outline'}
          size={12}
          color={isConnected ? '#4CAF50' : '#FF9800'}
        />
        <Text style={[styles.wsText, { color: isConnected ? '#4CAF50' : '#FF9800' }]}>
          {isConnected ? 'Synchronisé en temps réel' : 'Reconnexion…'}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Articles groupés par participant */}
        {Object.entries(itemsByParticipant).map(([participantName, participantItems]) => (
          <View key={participantName} style={styles.participantSection}>
            <Text style={styles.participantHeader}>
              👤 {participantId && participantItems[0]?.participant === participantId
                ? 'Mes articles'
                : participantName}
            </Text>
            {participantItems.map(item => (
              <CartItemRow
                key={item.id}
                item={item}
                isOwn={item.participant === participantId}
                editable={editable}
                onQuantityChange={handleQuantityChange}
                onRemove={handleRemove}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Footer total */}
      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Text style={styles.footerLabel}>
            {items_count} article{items_count > 1 ? 's' : ''}
          </Text>
          <Text style={styles.footerTotal}>{total.toFixed(2)} €</Text>
        </View>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
  },

  // WS status bar
  wsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  wsConnected: { backgroundColor: '#f0fdf4' },
  wsDisconnected: { backgroundColor: '#fffbeb' },
  wsText: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Participant section
  participantSection: {
    marginBottom: 8,
  },
  participantHeader: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFF',
    gap: 8,
  },
  itemRowOwn: {
    backgroundColor: '#fafffe',
  },
  itemImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  itemImagePlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  itemNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  participantBadge: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },

  // Quantity controls
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 100,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
  qtyBadge: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E2A78',
  },

  // Footer
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    padding: 16,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 14,
    color: '#666',
  },
  footerTotal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E2A78',
  },
});