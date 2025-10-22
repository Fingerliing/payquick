import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collaborativeSessionService } from '@/services/collaborativeSessionService';

interface SessionOrder {
  id: string;
  order_number: string;
  participant_name: string;
  participant_id: string;
  status: string;
  payment_status: string;
  total_amount: number;
  items_count: number;
  created_at: string;
  notes?: string;
}

interface SessionOrdersViewProps {
  sessionId: string;
  currentParticipantId?: string;
  onOrderPress?: (order: SessionOrder) => void;
}

export const SessionOrdersView: React.FC<SessionOrdersViewProps> = ({
  sessionId,
  currentParticipantId,
  onOrderPress,
}) => {
  const [orders, setOrders] = useState<SessionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [groupBy, setGroupBy] = useState<'participant' | 'status'>('participant');

  useEffect(() => {
    loadOrders();
    
    // Rafraîchir toutes les 5 secondes
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const loadOrders = async () => {
    try {
      const summary = await collaborativeSessionService.getSessionSummary(sessionId);
      setOrders(summary.orders);
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#FF9800';
      case 'confirmed': return '#2196F3';
      case 'preparing': return '#9C27B0';
      case 'ready': return '#4CAF50';
      case 'served': return '#757575';
      case 'cancelled': return '#F44336';
      default: return '#666';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'En attente',
      confirmed: 'Confirmée',
      preparing: 'En préparation',
      ready: 'Prête',
      served: 'Servie',
      cancelled: 'Annulée',
    };
    return labels[status] || status;
  };

  const getPaymentStatusIcon = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'paid': return 'checkmark-circle';
      case 'unpaid': return 'time';
      case 'pending': return 'hourglass';
      default: return 'help-circle';
    }
  };

  const getPaymentStatusColor = (paymentStatus: string) => {
    switch (paymentStatus) {
      case 'paid': return '#4CAF50';
      case 'unpaid': return '#F44336';
      case 'pending': return '#FF9800';
      default: return '#666';
    }
  };

  const groupOrdersByParticipant = () => {
    const grouped = orders.reduce((acc, order) => {
      const key = order.participant_id || 'unknown';
      if (!acc[key]) {
        acc[key] = {
          participant_name: order.participant_name,
          orders: [],
          total: 0,
        };
      }
      acc[key].orders.push(order);
      acc[key].total += order.total_amount;
      return acc;
    }, {} as Record<string, { participant_name: string; orders: SessionOrder[]; total: number }>);

    return Object.entries(grouped);
  };

  const groupOrdersByStatus = () => {
    const grouped = orders.reduce((acc, order) => {
      const key = order.status;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(order);
      return acc;
    }, {} as Record<string, SessionOrder[]>);

    return Object.entries(grouped);
  };

  const renderOrderCard = (order: SessionOrder, showParticipant: boolean = true) => {
    const isMyOrder = order.participant_id === currentParticipantId;

    return (
      <TouchableOpacity
        key={order.id}
        style={[styles.orderCard, isMyOrder && styles.myOrderCard]}
        onPress={() => onOrderPress?.(order)}
      >
        <View style={styles.orderHeader}>
          <View style={styles.orderNumberContainer}>
            <Text style={styles.orderNumber}>#{order.order_number}</Text>
            {isMyOrder && (
              <View style={styles.myOrderBadge}>
                <Text style={styles.myOrderBadgeText}>Ma commande</Text>
              </View>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
            <Text style={styles.statusText}>{getStatusLabel(order.status)}</Text>
          </View>
        </View>

        {showParticipant && (
          <View style={styles.participantRow}>
            <Ionicons name="person" size={16} color="#666" />
            <Text style={styles.participantText}>{order.participant_name}</Text>
          </View>
        )}

        <View style={styles.orderDetails}>
          <View style={styles.orderDetail}>
            <Ionicons name="receipt" size={16} color="#666" />
            <Text style={styles.orderDetailText}>{order.items_count} article(s)</Text>
          </View>
          
          <View style={styles.orderDetail}>
            <Ionicons name="time" size={16} color="#666" />
            <Text style={styles.orderDetailText}>
              {new Date(order.created_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
          </View>

          <View style={styles.orderDetail}>
            <Ionicons
              name={getPaymentStatusIcon(order.payment_status)}
              size={16}
              color={getPaymentStatusColor(order.payment_status)}
            />
            <Text style={[styles.orderDetailText, { color: getPaymentStatusColor(order.payment_status) }]}>
              {order.payment_status === 'paid' ? 'Payé' : 'Non payé'}
            </Text>
          </View>
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.orderTotal}>{order.total_amount.toFixed(2)} €</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGroupedByParticipant = () => {
    const grouped = groupOrdersByParticipant();

    return (
      <FlatList
        data={grouped}
        keyExtractor={([participantId]) => participantId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        renderItem={({ item: [participantId, data] }) => (
          <View style={styles.groupSection}>
            <View style={styles.groupHeader}>
              <View style={styles.participantAvatar}>
                <Text style={styles.participantInitial}>
                  {data.participant_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.groupHeaderInfo}>
                <Text style={styles.groupHeaderName}>{data.participant_name}</Text>
                <Text style={styles.groupHeaderStats}>
                  {data.orders.length} commande(s) • {data.total.toFixed(2)} €
                </Text>
              </View>
            </View>
            {data.orders.map(order => renderOrderCard(order, false))}
          </View>
        )}
      />
    );
  };

  const renderGroupedByStatus = () => {
    const grouped = groupOrdersByStatus();
    const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'];
    const sortedGrouped = grouped.sort((a, b) => {
      return statusOrder.indexOf(a[0]) - statusOrder.indexOf(b[0]);
    });

    return (
      <FlatList
        data={sortedGrouped}
        keyExtractor={([status]) => status}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        renderItem={({ item: [status, orders] }) => (
          <View style={styles.groupSection}>
            <View style={[styles.statusGroupHeader, { backgroundColor: getStatusColor(status) }]}>
              <Text style={styles.statusGroupHeaderText}>
                {getStatusLabel(status)} ({orders.length})
              </Text>
            </View>
            {orders.map(order => renderOrderCard(order, true))}
          </View>
        )}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Commandes de la session</Text>
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleButton, groupBy === 'participant' && styles.toggleButtonActive]}
            onPress={() => setGroupBy('participant')}
          >
            <Ionicons
              name="people"
              size={18}
              color={groupBy === 'participant' ? '#FFF' : '#666'}
            />
            <Text style={[styles.toggleText, groupBy === 'participant' && styles.toggleTextActive]}>
              Par personne
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, groupBy === 'status' && styles.toggleButtonActive]}
            onPress={() => setGroupBy('status')}
          >
            <Ionicons
              name="list"
              size={18}
              color={groupBy === 'status' ? '#FFF' : '#666'}
            />
            <Text style={[styles.toggleText, groupBy === 'status' && styles.toggleTextActive]}>
              Par statut
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={64} color="#CCC" />
          <Text style={styles.emptyStateText}>Aucune commande pour le moment</Text>
          <Text style={styles.emptyStateSubtext}>
            Soyez le premier à commander !
          </Text>
        </View>
      ) : (
        groupBy === 'participant' ? renderGroupedByParticipant() : renderGroupedByStatus()
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#FFF',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E2A78',
    marginBottom: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    gap: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#1E2A78',
  },
  toggleText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#FFF',
  },
  groupSection: {
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  participantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E2A78',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  groupHeaderInfo: {
    flex: 1,
  },
  groupHeaderName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E2A78',
    marginBottom: 4,
  },
  groupHeaderStats: {
    fontSize: 14,
    color: '#666',
  },
  statusGroupHeader: {
    padding: 12,
  },
  statusGroupHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  orderCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  myOrderCard: {
    borderColor: '#1E2A78',
    borderWidth: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E2A78',
  },
  myOrderBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  myOrderBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1E2A78',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  participantText: {
    fontSize: 14,
    color: '#666',
  },
  orderDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  orderDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderDetailText: {
    fontSize: 12,
    color: '#666',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E2A78',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
  },
});