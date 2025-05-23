'use client'

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function OrdersPage() {
  const { data: orders, mutate } = useSWR('/api/orders/', fetcher, { refreshInterval: 5000 })

  const updateOrder = async (id: string, action: 'mark_paid' | 'mark_served') => {
    await fetch(`/api/orders/${id}/${action}/`, { method: 'POST' })
    mutate()
  }

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6">Commandes en cours</h1>

      {orders?.length === 0 && <p>Aucune commande en attente.</p>}

      {orders?.map((order: any) => (
        <div
          key={order.id}
          className="border border-gray-200 rounded-lg p-4 mb-4 shadow-sm bg-white"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-gray-800">
              Table {order.table_number}
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
  )
}
