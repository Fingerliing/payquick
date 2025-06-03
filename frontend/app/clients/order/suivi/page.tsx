'use client'

import useSWR from 'swr'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface Item {
  plat: string;
  quantite: number;
  prix: number;
}

interface OrderData {
  commande: number;
  table: string;
  status: string;
  plats: Item[];
}

export default function OrderStatus() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const { data, mutate } = useSWR<OrderData>(
    orderId ? `/api/orders/${orderId}/details/` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  if (!orderId) return <p className="text-red-600">Commande inconnue.</p>;
  if (!data) return <p className="text-gray-500">Chargement...</p>;

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Commande #{data.commande}</h1>
      <p className="mb-2 text-sm text-gray-600">Table : {data.table}</p>
      <p className="mb-4 text-sm font-medium">Statut : <span className="capitalize text-blue-600">{data.status}</span></p>

      <ul className="mb-4">
        {data.plats.map((item, idx) => (
          <li key={idx} className="text-gray-800">
            • {item.plat} x{item.quantite} ({item.prix} €)
          </li>
        ))}
      </ul>

      {data.status === 'served' && (
        <p className="text-green-600 font-semibold">Votre commande a été servie. Bon appétit !</p>
      )}
    </div>
  );
}
