import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/contexts/CartContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TableOrders } from '@/components/order/TableOrders';
import { tableOrderService, TableOrdersResponse } from '@/services/tableOrderService';
import { 
  useScreenType, 
  getResponsiveValue, 
  COLORS, 
  SPACING, 
  BORDER_RADIUS 
} from '@/utils/designSystem';

export default function TableOrdersScreen() {
  const params = useLocalSearchParams<{ 
    tableNumber: string; 
    restaurantId: string; 
  }>();
  
  const { cart } = useCart();
  const [tableOrders, setTableOrders] = useState<TableOrdersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const screenType = useScreenType();
  const { width } = useWindowDimensions();

  const { tableNumber, restaurantId } = params;

  // Configuration responsive
  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
    useGridLayout: screenType === 'desktop' && width > 1200,
  };

  // Styles responsive
  const styles = {
    container: {
      flex: 1,
      backgroundColor: COLORS.background,
    },

    content: {
      flex: 1,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },

    sessionCard: {
      margin: getResponsiveValue(SPACING.md, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.primary + '10',
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.primary + '30',
      shadowColor: COLORS.shadow?.default || 'rgba(0, 0, 0, 0.1)',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },

    sessionContent: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    sessionInfo: {
      flex: 1,
    },

    sessionTitle: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      fontWeight: '600' as const,
      color: COLORS.primary,
      marginBottom: getResponsiveValue(SPACING.xs, screenType),
    },

    sessionText: {
      fontSize: getResponsiveValue(
        { mobile: 14, tablet: 15, desktop: 16 },
        screenType
      ),
      color: COLORS.text?.primary || '#111827',
      lineHeight: getResponsiveValue(
        { mobile: 18, tablet: 20, desktop: 22 },
        screenType
      ),
      marginBottom: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    statsCard: {
      margin: getResponsiveValue(SPACING.md, screenType),
      marginTop: getResponsiveValue(SPACING.sm, screenType),
      padding: getResponsiveValue(SPACING.lg, screenType),
      backgroundColor: COLORS.surface || '#FFFFFF',
      borderRadius: BORDER_RADIUS.lg,
      shadowColor: COLORS.shadow?.default || 'rgba(0, 0, 0, 0.1)',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: COLORS.border?.light || '#E5E7EB',
    },

    statsRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
    },

    statItem: {
      alignItems: 'center' as const,
    },

    statValue: {
      fontSize: getResponsiveValue(
        { mobile: 24, tablet: 28, desktop: 32 },
        screenType
      ),
      fontWeight: 'bold' as const,
      color: COLORS.text?.primary || '#111827',
    },

    statLabel: {
      fontSize: getResponsiveValue(
        { mobile: 12, tablet: 13, desktop: 14 },
        screenType
      ),
      color: COLORS.text?.secondary || '#6B7280',
      marginTop: getResponsiveValue(SPACING.xs, screenType) / 2,
    },

    actionsContainer: {
      padding: getResponsiveValue(SPACING.md, screenType),
      gap: getResponsiveValue(SPACING.sm, screenType),
    },

    errorContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      padding: getResponsiveValue(
        { mobile: 40, tablet: 60, desktop: 80 },
        screenType
      ),
    },

    errorText: {
      textAlign: 'center' as const,
      marginTop: getResponsiveValue(SPACING.md, screenType),
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text?.secondary || '#6B7280',
    },

    loadingContainer: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    },

    loadingText: {
      fontSize: getResponsiveValue(
        { mobile: 16, tablet: 18, desktop: 20 },
        screenType
      ),
      color: COLORS.text?.secondary || '#6B7280',
    },
  };

  // Charger les commandes de la table
  const loadTableOrders = useCallback(async (showLoader = true) => {
    if (!restaurantId || !tableNumber) {
      setError('Paramètres manquants');
      setIsLoading(false);
      return;
    }

    try {
      if (showLoader) {
        setIsLoading(true);
      }
      setError(null);
      
      const response = await tableOrderService.getTableOrders(
        parseInt(restaurantId), 
        tableNumber
      );
      
      setTableOrders(response);
    } catch (err: any) {
      console.error('Error loading table orders:', err);
      setError(err.message || 'Erreur lors du chargement des commandes');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [restaurantId, tableNumber]);

  // Rafraîchir les données
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadTableOrders(false);
  }, [loadTableOrders]);

  // Navigation vers le panier
  const handleGoToCart = useCallback(() => {
    router.push('/(client)/cart');
  }, []);

  // Navigation vers le menu
  const handleGoToMenu = useCallback(() => {
    if (restaurantId && tableNumber) {
      router.push(`/menu/client/${restaurantId}?tableNumber=${tableNumber}`);
    }
  }, [restaurantId, tableNumber]);

  // Terminer la session de table
  const handleEndSession = useCallback(() => {
    Alert.alert(
      'Terminer la session',
      'Êtes-vous sûr de vouloir terminer cette session de table ? Toutes les commandes en cours devront être finalisées.',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Terminer', 
          style: 'destructive',
          onPress: async () => {
            try {
              await tableOrderService.endTableSession(
                parseInt(restaurantId!), 
                tableNumber!
              );
              Alert.alert('Session terminée', 'La session de table a été terminée avec succès.');
              router.back();
            } catch (err: any) {
              Alert.alert('Erreur', err.message || 'Impossible de terminer la session');
            }
          }
        }
      ]
    );
  }, [restaurantId, tableNumber]);

  // Charger les données au montage
  useEffect(() => {
    loadTableOrders();
  }, [loadTableOrders]);

  const iconSize = getResponsiveValue(
    { mobile: 24, tablet: 26, desktop: 28 },
    screenType
  );

  // Rendu conditionnel pour l'état de chargement initial
  if (isLoading && !tableOrders) {
    return (
      <SafeAreaView style={styles.container}>
        <Header 
          title={`Table ${tableNumber || ''}`}
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement des commandes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Rendu conditionnel pour l'état d'erreur
  if (error && !tableOrders) {
    return (
      <SafeAreaView style={styles.container}>
        <Header 
          title={`Table ${tableNumber || ''}`}
          leftIcon="arrow-back" 
          onLeftPress={() => router.back()}
        />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error || '#EF4444'} />
          <Text style={styles.errorText}>{error}</Text>
          <Button 
            title="Réessayer" 
            onPress={() => loadTableOrders()} 
            style={{ 
              marginTop: getResponsiveValue(SPACING.md, screenType),
              minWidth: getResponsiveValue(
                { mobile: 120, tablet: 140, desktop: 160 }, 
                screenType
              )
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Rendu principal
  return (
    <SafeAreaView style={styles.container}>
      <Header 
        title={`Table ${tableNumber || ''}`}
        subtitle={tableOrders?.restaurant_name}
        leftIcon="arrow-back" 
        onLeftPress={() => router.back()}
        rightIcon="refresh"
        onRightPress={handleRefresh}
      />

      <View style={styles.content}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={isRefreshing} 
              onRefresh={handleRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Informations de session */}
          {tableOrders?.current_session && (
            <Card style={styles.sessionCard}>
              <View style={styles.sessionContent}>
                <Ionicons name="people" size={iconSize} color={COLORS.primary} />
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionTitle}>Session active</Text>
                  <Text style={styles.sessionText}>
                    Démarrée à {new Date(tableOrders.current_session.started_at).toLocaleTimeString('fr-FR')}
                  </Text>
                  {tableOrders.current_session.guest_count > 1 && (
                    <Text style={styles.sessionText}>
                      {tableOrders.current_session.guest_count} personnes
                    </Text>
                  )}
                </View>
              </View>
            </Card>
          )}

          {/* Statistiques de la table */}
          {tableOrders && (
            <Card style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.warning || '#F59E0B' }]}>
                    {tableOrders.table_statistics.active_orders}
                  </Text>
                  <Text style={styles.statLabel}>Actives</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {tableOrders.table_statistics.total_orders}
                  </Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.success || '#10B981' }]}>
                    {tableOrders.table_statistics.total_revenue.toFixed(2)} €
                  </Text>
                  <Text style={styles.statLabel}>Revenue</Text>
                </View>
              </View>
            </Card>
          )}

          {/* Composant TableOrders pour afficher les commandes */}
          {tableOrders && (
            <TableOrders
              restaurantId={parseInt(restaurantId!)}
              tableNumber={tableNumber!}
              data={tableOrders}
              isLoading={isLoading}
              error={error}
              refetch={loadTableOrders}
              onAddOrder={handleGoToMenu}
              onOrderPress={(order) => {
                router.push(`/order/${order.id}` as any);
              }}
            />
          )}
        </ScrollView>

        {/* Actions rapides */}
        <View style={styles.actionsContainer}>
          <Button
            title="Commander pour cette table"
            onPress={handleGoToMenu}
            variant="primary"
            leftIcon="restaurant-outline"
            fullWidth
            style={{
              backgroundColor: COLORS.secondary || '#FFC845',
            }}
            textStyle={{
              color: COLORS.text?.primary || '#111827',
              fontWeight: '700' as const,
            }}
          />
          
          {cart.itemCount > 0 && (
            <Button
              title={`Voir le panier (${cart.itemCount})`}
              onPress={handleGoToCart}
              variant="outline"
              leftIcon="basket-outline"
              fullWidth
              style={{
                borderColor: COLORS.secondary || '#FFC845',
              }}
              textStyle={{
                color: COLORS.secondary || '#FFC845',
              }}
            />
          )}

          {tableOrders?.current_session && (
            <Button
              title="Terminer la session"
              onPress={handleEndSession}
              variant="outline"
              leftIcon="log-out-outline"
              fullWidth
              style={{
                borderColor: COLORS.error || '#EF4444',
              }}
              textStyle={{
                color: COLORS.error || '#EF4444',
              }}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}