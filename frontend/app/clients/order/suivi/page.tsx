'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { OrderDetails } from '@/types/order';
import { api } from '@/lib/api';
import { fetchWithToken } from '@/lib/fetchs';
import { io, Socket } from 'socket.io-client';
import { toast } from 'react-toastify';
let socket: Socket | null = null;

export default function ClientOrderSuiviPage() {
  const statusSteps = ['pending', 'in_progress', 'served'];
  const statusLabels = {
    pending: 'En attente',
    in_progress: 'En cours',
    served: 'Servie'
  };

  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get('orderId');

  const [data, setData] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Auth
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access');
    const current = window.location.pathname + window.location.search;

    if (!token) {
      return router.replace(`/auth/login?next=${encodeURIComponent(current)}`);
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Initial fetch
  useEffect(() => {
    if (!orderId || !isAuthenticated) return;

    const fetchData = async () => {
      try {
        const res = await fetchWithToken(`${api.orderById(orderId)}/details/`);
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Erreur chargement commande :", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [orderId, isAuthenticated]);

  // Socket.IO listener
  useEffect(() => {
    if (!orderId || !isAuthenticated) return;
  
    socket = io('ws://localhost:4000');
  
    socket.on('connect', () => {
      console.log('🟢 Connecté à WebSocket');
      socket?.emit('join_order', orderId);
    });
  
    socket.on('order_updated', (order: OrderDetails) => {
      if (order.order === Number(orderId)) {
        if (data && data.status !== order.status) {
          toast.info(`Statut mis à jour : ${order.status}`);
        }
        setData(order);
      }
    });
  
    return () => {
      socket?.disconnect();
      console.log('🔴 Déconnecté du WebSocket');
    };
  }, [orderId, isAuthenticated]);

  if (!orderId) return <p className="p-6 text-red-600">Order not found.</p>;
  if (!isAuthenticated) return <p className="p-6 text-gray-500">Authenticating...</p>;
  if (loading || !data) return <p className="p-6 text-gray-500">Loading...</p>;

  const currentStep = statusSteps.indexOf(data.status);
  console.log("[DEBUG] data =", data);

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Commande #{data.order}</h1>
      <p className="mb-2 text-sm text-gray-600">Table : {data.table}</p>

      {/* Barre de progression */}
      <div className="flex items-center justify-between mb-6 relative">
        {statusSteps.map((status, index) => (
          <div key={status} className="flex-1 flex flex-col items-center relative">
            <div className={`w-5 h-5 rounded-full z-10 ${index <= currentStep ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-xs mt-2 text-center">{statusLabels[status as keyof typeof statusLabels]}</span>
            {index < statusSteps.length - 1 && (
              <div className="absolute top-2.5 left-1/2 w-full h-1 -z-10">
                <div className={`h-full ${index < currentStep ? 'bg-green-500' : 'bg-gray-300'} w-full`} />
              </div>
            )}
          </div>
        ))}
      </div>

      {Array.isArray(data.items) && data.items.length > 0 ? (
        <ul className="mb-4">
          {data.items.map((item, idx) => (
            <li key={idx} className="text-gray-800">
              • {item.name} x{item.quantity} ({item.price} €)
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 mb-4">No items in this order.</p>
      )}

      {data.status === 'served' && (
        <p className="text-green-600 font-semibold mt-4">Votre commande a été servie. Bon appétit !</p>
      )}
    </div>
  );
}
