import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Meal } from '@/types/meal';
import { Cart } from '@/types/cart';
import { api } from '@/lib/api';

export default function CommandeTable() {
  const router = useRouter();
  const { table_id } = router.query as { table_id?: string };

  const [menu, setMenu] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!table_id) return;

    fetch(api.orderByTable(table_id))
      .then(res => res.json())
      .then(data => {
        setMenu(data.menu);
        setMeals(data.plats);
        const initialCart: Cart = {};
        data.plats.forEach((m: Meal) => initialCart[m.id] = 0);
        setCart(initialCart);
      });
  }, [table_id]);

  const handleChange = (id: number, value: string) => {
    const quantity = parseInt(value) || 0;
    setCart(prev => ({ ...prev, [id]: quantity }));
  };

  const submitOrder = async () => {
    const items = Object.entries(cart)
      .filter(([_, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ id: parseInt(id), quantity }));

    if (!items.length) {
      alert("Please select at least one dish.");
      return;
    }

    setLoading(true);

    try {
      // 1. Create the order on backend
      const res = await fetch(`/api/commande/table/${table_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plats: items }),
      });

      if (!res.ok) throw new Error("Error while submitting the order.");

      const result = await res.json();
      const orderId = result.order_id;

      // 2. Start the Stripe session
      const stripeSession = await fetch(`/api/payment/create_checkout_session/${orderId}`, {
        method: 'POST',
      });

      const stripeData = await stripeSession.json();
      if (stripeData.checkout_url) {
        window.location.href = stripeData.checkout_url;
      } else {
        throw new Error("Error while creating the payment session.");
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  };

  if (!menu) return <p>Loading menu...</p>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Menu: {menu}</h1>

      {meals.map((meal) => (
        <div key={meal.id} className="mb-4 p-2 border rounded">
          <h2 className="text-lg font-semibold">{meal.nom}</h2>
          <p>{meal.description}</p>
          <span className="text-sm text-gray-700">{meal.prix} €</span>
          <div className="mt-2">
            <label className="mr-2">Quantity:</label>
            <input
              type="number"
              min="0"
              value={cart[meal.id] || 0}
              onChange={(e) => handleChange(meal.id, e.target.value)}
              className="w-16 border p-1"
            />
          </div>
        </div>
      ))}

      <button 
        onClick={submitOrder}
        className={`mt-4 px-4 py-2 ${loading ? 'bg-gray-400' : 'bg-blue-600'} text-white rounded`}
        disabled={loading}
      >
        {loading ? 'Processing...' : 'Submit Order'}
      </button>
    </div>
  );
}
