'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TableOrderPage({ params }: { params: { id: string, tableNumber: string } }) {
  const [menu, setMenu] = useState<any[]>([])
  const [cart, setCart] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchMenu = async () => {
      const res = await fetch(`/api/menus/by_restaurant/${params.id}/`)
      const data = await res.json()
      setMenu(data.menu.items || [])
    }
    fetchMenu()
  }, [params.id])

  const addToCart = (item: any) => {
    const existing = cart.find((i) => i.id === item.id)
    if (existing) {
      setCart(cart.map((i) =>
        i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
      ))
    } else {
      setCart([...cart, { ...item, quantity: 1 }])
    }
  }

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id))
  }

  const submitOrder = async () => {
    setLoading(true)
    const items = cart.map(({ name, quantity }) => ({ name, quantity }))
    const res = await fetch('/api/orders/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantId: params.id,
        tableNumber: Number(params.tableNumber),
        items,
      }),
    })
    const data = await res.json()
    router.push(`/clients/restaurant/${params.id}/table/${params.tableNumber}/confirmation?order=${data.order.id}`)

    if (res.ok) {
      alert('Commande envoyée !')
      setCart([])
      router.push('/clients/scan')  // ou page de remerciement
    } else {
      alert('Erreur lors de l’envoi')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Commander - Table {params.tableNumber}</h1>

      <h2 className="text-lg font-semibold mb-2">Menu</h2>
      <ul className="space-y-2 mb-6">
        {menu.map((item) => (
          <li key={item.id} className="flex justify-between items-center border p-2 rounded">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-gray-600">{item.description}</p>
            </div>
            <button
              onClick={() => addToCart(item)}
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            >
              Ajouter
            </button>
          </li>
        ))}
      </ul>

      {cart.length > 0 && (
        <div className="border-t pt-4">
          <h2 className="text-lg font-semibold mb-2">Votre commande</h2>
          <ul className="space-y-1 mb-4">
            {cart.map((item, idx) => (
              <li key={idx} className="flex justify-between items-center">
                <span>{item.name} x{item.quantity}</span>
                <button onClick={() => removeFromCart(item.id)} className="text-red-600 text-sm">Supprimer</button>
              </li>
            ))}
          </ul>
          <button
            onClick={submitOrder}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Envoi...' : 'Valider la commande'}
          </button>
        </div>
      )}
    </div>
  )
}