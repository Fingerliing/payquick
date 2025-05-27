'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function ConfirmationPage() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('order')
  const [order, setOrder] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    if (orderId) {
      fetch(`/api/orders/${orderId}/`)
        .then(res => res.json())
        .then(data => setOrder(data))
    }
  }, [orderId])

  const handlePayment = async () => {
    const res = await fetch(`/api/orders/${orderId}/create-checkout-session/`, {
      method: 'POST',
    })
    const data = await res.json()
    if (data.checkout_url) {
      window.location.href = data.checkout_url
    } else {
      alert('Erreur de paiement')
    }
  }

  if (!order) return <p className="p-4">Chargement de votre commande...</p>

  const total = order.items.reduce(
    (acc: number, item: any) => acc + (item.price || 0) * item.quantity,
    0
  )

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Confirmation de votre commande</h1>

      <p className="mb-2">Table : {order.table_number}</p>
      <ul className="mb-4 border rounded p-3">
        {order.items.map((item: any, idx: number) => (
          <li key={idx} className="flex justify-between text-sm">
            <span>{item.name}</span>
            <span>x{item.quantity}</span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between font-semibold text-lg mb-4">
        <span>Total</span>
        <span>{total.toFixed(2)} €</span>
      </div>

      {!order.is_paid ? (
        <button
          onClick={handlePayment}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Payer maintenant
        </button>
      ) : (
        <p className="text-green-600 font-semibold">Commande déjà payée ✅</p>
      )}
    </div>
  )
}
