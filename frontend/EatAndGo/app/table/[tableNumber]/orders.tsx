import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/contexts/CartContext';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TableOrders } from '@/components/order/TableOrders';
import { Alert as InlineAlert } from '@/components/ui/Alert';
import { tableOrderService, TableOrdersResponse } from '@/services/tableOrderService';
import {
  useScreenType,
  getResponsiveValue,
  COLORS,
  SPACING,
  BORDER_RADIUS,
} from '@/utils/designSystem';

export default function TableOrdersScreen() {
  const params = useLocalSearchParams<{ tableNumber: string; restaurantId: string }>();
  const { cart } = useCart();

  const [tableOrders, setTableOrders] = useState<TableOrdersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const screenType = useScreenType();
  const { width } = useWindowDimensions();
  const { tableNumber, restaurantId } = params;

  const layoutConfig = {
    containerPadding: getResponsiveValue(SPACING.container, screenType),
    maxContentWidth: screenType === 'desktop' ? 1000 : undefined,
    useGridLayout: screenType === 'desktop' && width > 1200,
  };

  const styles = {
    container: { flex: 1, backgroundColor: COLORS.background },
    content: {
      flex: 1,
      maxWidth: layoutConfig.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    },
    actionsContainer: { padding: getResponsiveValue(SPACING.md, screenType), gap: 8 },
  };

  const loadTableOrders = useCallback(async (showLoader = true) => {
    if (!restaurantId || !tableNumber) {
      setError('Paramètres manquants');
      setIsLoading(false);
      return;
    }
    try {
      if (showLoader) setIsLoading(true);
      setError(null);
      const response = await tableOrderService.getTableOrders(
        parseInt(restaurantId),
        tableNumber
      );
      setTableOrders(response);
    } catch (err: any) {
      console.error('Error loading table orders:', err);
      setError(err.message || 'Erreur lors du chargement des commandes');
      showToast('error', err.message || 'Erreur lors du chargement des commandes', 'Erreur');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [restaurantId, tableNumber]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadTableOrders(false);
  }, [loadTableOrders]);

  const handleGoToCart = useCallback(() => {
    router.push('/(client)/cart');
  }, []);

  const handleGoToMenu = useCallback(() => {
    if (restaurantId && tableNumber) {
      router.push(`/menu/client/${restaurantId}?tableNumber=${tableNumber}`);
    }
  }, [restaurantId, tableNumber]);

  const handleEndSession = useCallback(async () => {
    try {
      await tableOrderService.endTableSession(parseInt(restaurantId!), tableNumber!);
      showToast('success', 'La session de table a été terminée avec succès.', 'Session terminée');
      router.back();
    } catch (err: any) {
      showToast('error', err.message || 'Impossible de terminer la session', 'Erreur');
    }
  }, [restaurantId, tableNumber]);

  useEffect(() => {
    loadTableOrders();
  }, [loadTableOrders]);

  const iconSize = getResponsiveValue({ mobile: 24, tablet: 26, desktop: 28 }, screenType);

  if (isLoading && !tableOrders) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title={`Table ${tableNumber || ''}`}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
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
          <Text>Chargement des commandes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !tableOrders) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title={`Table ${tableNumber || ''}`}
          leftIcon="arrow-back"
          onLeftPress={() => router.back()}
        />
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
          <Text style={{ textAlign: 'center', marginTop: 8, color: COLORS.text.secondary }}>
            {error}
          </Text>
          <Button title="Réessayer" onPress={() => loadTableOrders()} style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

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
          {tableOrders?.current_session && (
            <Card
              style={{
                margin: 16,
                padding: 16,
                backgroundColor: COLORS.primary + '10',
                borderRadius: BORDER_RADIUS.lg,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="people" size={iconSize} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: COLORS.primary }}>Session active</Text>
                  <Text style={{ color: COLORS.text.secondary }}>
                    Démarrée à{' '}
                    {new Date(tableOrders.current_session.started_at).toLocaleTimeString('fr-FR')}
                  </Text>
                </View>
              </View>
            </Card>
          )}

          {tableOrders && (
            <TableOrders
              restaurantId={parseInt(restaurantId!)}
              tableNumber={tableNumber!}
              data={tableOrders}
              isLoading={isLoading}
              error={error}
              refetch={loadTableOrders}
              onAddOrder={handleGoToMenu}
              onOrderPress={(order) => router.push(`/order/${order.id}` as any)}
            />
          )}
        </ScrollView>

        <View style={styles.actionsContainer}>
          <Button
            title="Commander pour cette table"
            onPress={handleGoToMenu}
            variant="primary"
            leftIcon="restaurant-outline"
            fullWidth
            style={{ backgroundColor: COLORS.secondary }}
            textStyle={{ color: COLORS.text.primary, fontWeight: '700' }}
          />

          {cart.itemCount > 0 && (
            <Button
              title={`Voir le panier (${cart.itemCount})`}
              onPress={handleGoToCart}
              variant="outline"
              leftIcon="basket-outline"
              fullWidth
              style={{ borderColor: COLORS.secondary }}
              textStyle={{ color: COLORS.secondary }}
            />
          )}

          {tableOrders?.current_session && (
            <Button
              title="Terminer la session"
              onPress={handleEndSession}
              variant="outline"
              leftIcon="log-out-outline"
              fullWidth
              style={{ borderColor: COLORS.error }}
              textStyle={{ color: COLORS.error }}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
