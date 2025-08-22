import { useState, useEffect, useCallback } from 'react';
import { tableOrderService, TableOrdersResponse } from '@/services/tableOrderService';
import { CreateOrderRequest } from '@/types/order'; // ✅ AJOUT: Import manquant

export function useTableOrders(restaurantId: number, tableNumber: string) {
  const [data, setData] = useState<TableOrdersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTableOrders = useCallback(async () => {
    if (!restaurantId || !tableNumber) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await tableOrderService.getTableOrders(restaurantId, tableNumber);
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement des commandes');
      console.error('Error fetching table orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId, tableNumber]);

  const addOrder = useCallback(async (orderData: CreateOrderRequest) => {
    try {
      const newOrder = await tableOrderService.addTableOrder(orderData);
      // Rafraîchir les données après ajout
      await fetchTableOrders();
      return newOrder;
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'ajout de la commande');
      throw err;
    }
  }, [fetchTableOrders]);

  const endSession = useCallback(async () => {
    if (!restaurantId || !tableNumber) return;

    try {
      const result = await tableOrderService.endTableSession(restaurantId, tableNumber);
      // Rafraîchir les données après fin de session
      await fetchTableOrders();
      return result;
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la fin de session');
      throw err;
    }
  }, [restaurantId, tableNumber, fetchTableOrders]);

  useEffect(() => {
    fetchTableOrders();
  }, [fetchTableOrders]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchTableOrders,
    addOrder,
    endSession
  };
}