'use client'

import useSWR from 'swr'
import { useState, useEffect } from 'react'
import io from 'socket.io-client'
import { useSearchParams } from 'next/navigation';

const socket = io('http://localhost:4000')

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get('restaurantId');
  const { data: orders, mutate, isValidating } = useSWR(
    restaurantId ? `http://localhost:8000/api/orders/by_restaurant/?restaurantId=${restaurantId}` : null,
    fetcher
  )
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid' | 'served' | 'unserved'>('all')
  useEffect(() => {
    socket.on('order_updated', () => {
      console.log('🔄 Mise à jour reçue via WebSocket')
      mutate()
    })

    return () => {
      socket.off('order_updated')
    }
  }, [])

  const updateOrder = async (id: string, action: 'mark_paid' | 'mark_served') => {
    await fetch(`/api/orders/${id}/${action}/`, { method: 'POST' })
    mutate()
  }

  const groupByTable = (orders: any[]) => {
    return orders.reduce((acc: Record<number, any[]>, order) => {
      const table = order.table_number;
      if (!acc[table]) acc[table] = [];
      acc[table].push(order);
      return acc;
    }, {});
  }

  if (!orders) return <p className="text-gray-500">Chargement des commandes...</p>

  const filteredOrders = orders.filter((order: any) => {
    switch (filter) {
      case 'paid': return order.is_paid;
      case 'unpaid': return !order.is_paid;
      case 'served': return order.status === 'served';
      case 'unserved': return order.status !== 'served';
      default: return true;
    }
  });

  if (!restaurantId) {
    return <p className="text-red-600">Aucun restaurant sélectionné.</p>;
  }

  const groupedOrders = groupByTable(filteredOrders);

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Commandes par table</h1>
        {isValidating && <span className="text-sm text-blue-600 animate-pulse">Actualisation…</span>}
      </div>

      <div className="mb-6 flex gap-3 flex-wrap">
        {['all', 'paid', 'unpaid', 'served', 'unserved'].map((option) => (
          <button
            key={option}
            onClick={() => setFilter(option as any)}
            className={`px-3 py-1 rounded text-sm border ${filter === option ? 'bg-blue-600 text-white' : 'bg-white text-gray-800'}`}
          >
            {option === 'all' ? 'Toutes' : option === 'paid' ? 'Payées' : option === 'unpaid' ? 'Non payées' : option === 'served' ? 'Servies' : 'Non servies'}
          </button>
        ))}
      </div>

      {Object.entries(groupedOrders).map(([table, tableOrders]) => (
        <div key={table} className="border border-gray-300 rounded-lg mb-8 p-4 bg-gray-50">
          <h2 className="text-xl font-semibold mb-4">Table {table}</h2>

          {tableOrders.map((order) => (
            <div
              key={order.id}
              className="border border-gray-200 rounded-lg p-4 mb-4 shadow-sm bg-white"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">
                  Commande #{order.id} - {new Date(order.timestamp).toLocaleString()}
                </span>
                <span className={order.is_paid ? 'text-green-600' : 'text-red-500'}>
                  {order.is_paid ? 'Payée' : 'Non payée'}
                </span>
              </div>

              <ul className="mb-3 text-sm text-gray-700">
                {order.items.map((item: any, idx: number) => (
                  <li key={idx}>• {item.name} x{item.quantity}</li>
                ))}
              </ul>

              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500 capitalize">Statut : {order.status}</span>

                {!order.is_paid && (
                  <button
                    onClick={() => updateOrder(order.id, 'mark_paid')}
                    className="text-white bg-green-600 px-3 py-1 rounded hover:bg-green-700"
                  >
                    Marquer payée
                  </button>
                )}

                {order.status !== 'served' && (
                  <button
                    onClick={() => updateOrder(order.id, 'mark_served')}
                    className="text-white bg-blue-600 px-3 py-1 rounded hover:bg-blue-700"
                  >
                    Marquer servie
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
