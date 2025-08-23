import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { useTableOrders } from '@/hooks/useTableOrders';
import { OrderWithTableInfo } from '@/services/tableOrderService';

interface TableOrdersProps {
  restaurantId: number;
  tableNumber: string;
  onAddOrder?: () => void;
  onOrderPress?: (order: OrderWithTableInfo) => void;
}

export function TableOrders({ 
  restaurantId, 
  tableNumber, 
  onAddOrder,
  onOrderPress 
}: TableOrdersProps) {
  const { data, isLoading, error, refetch, endSession } = useTableOrders(restaurantId, tableNumber);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleEndSession = () => {
    if (!data?.current_session) return;

    Alert.alert(
      'Terminer la session',
      'Êtes-vous sûr de vouloir terminer cette session de table ? Toutes les commandes doivent être servies.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await endSession() as any;
              Alert.alert(
                'Session terminée',
                `Session terminée avec succès.\nTotal: ${Number(result.total_amount).toFixed(2)} €\nCommandes: ${result.orders_count}\nDurée: ${result.duration_minutes} min`
              );
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            }
          }
        }
      ]
    );
  };

  const renderOrder = ({ item }: { item: OrderWithTableInfo }) => (
    <TouchableOpacity onPress={() => onOrderPress?.(item)}>
      <Card style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderNumber}>
              Commande #{item.order_number}
              {item.order_sequence > 1 && (
                <Text style={styles.sequenceText}> (#{item.order_sequence})</Text>
              )}
            </Text>
            <Text style={styles.orderTime}>
              {new Date(item.created_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </Text>
            <Text style={styles.customerName}>
              {item.customer_display}
            </Text>
          </View>
          <View style={styles.orderStatus}>
            <StatusBadge status={item.status} />
            <Text style={styles.orderAmount}>
              {Number(item.total_amount).toFixed(2)} €
            </Text>
          </View>
        </View>

        <View style={styles.orderDetails}>
          <Text style={styles.itemsCount}>
            {item.items.length} {item.items.length > 1 ? 'articles' : 'article'}
          </Text>
          
          {item.table_waiting_time > 0 && (
            <View style={styles.waitingTime}>
              <Ionicons name="time-outline" size={16} color="#FF9500" />
              <Text style={styles.waitingTimeText}>
                {item.table_waiting_time} min
              </Text>
            </View>
          )}
        </View>

        {item.notes && (
          <Text style={styles.orderNotes}>
            Note: {item.notes}
          </Text>
        )}
      </Card>
    </TouchableOpacity>
  );

  if (isLoading && !data) {
    return (
      <View style={styles.loading}>
        <Text>Chargement des commandes...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Réessayer" onPress={refetch} />
      </View>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* En-tête avec informations de la table */}
      <Card style={styles.header}>
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.tableTitle}>
              Table {tableNumber} - {data.restaurant_name}
            </Text>
            {data.current_session && (
              <Text style={styles.sessionInfo}>
                Session active depuis {new Date(data.current_session.started_at).toLocaleTimeString('fr-FR')}
                {data.current_session.guest_count > 1 && (
                  <Text> • {data.current_session.guest_count} personnes</Text>
                )}
              </Text>
            )}
          </View>
          <View style={styles.headerStats}>
            <Text style={styles.statText}>
              {data.active_orders.length} active{data.active_orders.length > 1 ? 's' : ''}
            </Text>
            <Text style={styles.statText}>
              Total: {Number(data.table_statistics.total_revenue).toFixed(2)} €
            </Text>
          </View>
        </View>
      </Card>

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title="Nouvelle commande"
          onPress={onAddOrder}
          leftIcon="add"
          style={styles.addButton}
        />
        
        {data.current_session && data.active_orders.length === 0 && (
          <Button
            title="Terminer session"
            onPress={handleEndSession}
            variant="outline"
            style={styles.endSessionButton}
          />
        )}
      </View>

      {/* Commandes actives */}
      {data.active_orders.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Commandes en cours ({data.active_orders.length})
          </Text>
          <FlatList
            data={data.active_orders}
            renderItem={renderOrder}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          />
        </View>
      )}

      {/* Historique récent */}
      {data.completed_orders.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Historique récent ({data.completed_orders.length})
          </Text>
          <FlatList
            data={data.completed_orders}
            renderItem={renderOrder}
            keyExtractor={(item) => item.id.toString()}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false}
          />
        </View>
      )}

      {/* État vide */}
      {data.active_orders.length === 0 && data.completed_orders.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="restaurant-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>Aucune commande</Text>
          <Text style={styles.emptyMessage}>
            Cette table n'a pas encore de commandes.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loading: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  error: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
  },
  errorText: {
    color: '#DC2626',
    marginBottom: 16,
    textAlign: 'center' as const,
  },
  header: {
    margin: 16,
    marginBottom: 8,
  },
  headerContent: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
    marginBottom: 4,
  },
  sessionInfo: {
    fontSize: 14,
    color: '#666',
  },
  headerStats: {
    alignItems: 'flex-end' as const,
  },
  statText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  actions: {
    flexDirection: 'row' as const,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  addButton: {
    flex: 1,
    backgroundColor: '#FF6B35',
  },
  endSessionButton: {
    flex: 1,
    borderColor: '#DC2626',
  },
  section: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
    marginBottom: 12,
  },
  orderCard: {
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 8,
  },
  orderInfo: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#333',
    marginBottom: 2,
  },
  sequenceText: {
    color: '#666',
    fontWeight: 'normal' as const,
  },
  orderTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  customerName: {
    fontSize: 14,
    color: '#333',
  },
  orderStatus: {
    alignItems: 'flex-end' as const,
    gap: 4,
  },
  orderAmount: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#FF6B35',
  },
  orderDetails: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  itemsCount: {
    fontSize: 14,
    color: '#666',
  },
  waitingTime: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  waitingTimeText: {
    fontSize: 14,
    color: '#FF9500',
  },
  orderNotes: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic' as const,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  empty: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center' as const,
  },
};