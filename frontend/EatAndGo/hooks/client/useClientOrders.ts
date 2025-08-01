import { useState, useEffect } from 'react';
import { clientOrderService } from '@/services/clientOrderService';
import { useAuth } from '@/contexts/AuthContext';

export const useClientOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isClient } = useAuth();

  const loadOrders = async () => {
    if (!isClient) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await clientOrderService.getMyOrders() as any;
      setOrders(response.results || response);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du chargement');
      console.error('Error loading client orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const createOrder = async (cartItems: any[], restaurantId: number, tableNumber?: number) => {
    try {
      setLoading(true);
      const order = await clientOrderService.createOrderFromCart(
        cartItems,
        restaurantId,
        tableNumber
      );
      
      // Recharger la liste des commandes
      await loadOrders();
      
      return order;
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création');
      console.error('Error creating order:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [isClient]);

  return {
    orders,
    loading,
    error,
    loadOrders,
    createOrder,
    clearError: () => setError(null),
  };
};