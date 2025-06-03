import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Meal } from '@/types/meal';
import { Order } from '@/types/order';

export default function CommandeTable() {
  const router = useRouter();
  const { table_id } = router.query as { table_id?: string };
  const [menu, setMenu] = useState<string | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [order, setOrder] = useState<Order>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!table_id) return;

    fetch(`/api/commande/table/${table_id}`)
      .then(res => res.json())
      .then(data => {
        setMenu(data.menu);
        setMeals(data.plats);
        const initialOrder: Order = {};
        data.plats.forEach((m: Meal) => initialOrder[m.id] = 0);
        setOrder(initialOrder);
      });
  }, [table_id]);

  const handleChange = (id: number, value: string) => {
    const quantite = parseInt(value) || 0;
    setOrder(prev => ({ ...prev, [id]: quantite }));
  };

  const envoyerCommande = async () => {
    const items = Object.entries(order)
      .filter(([_, qte]) => qte > 0)
      .map(([id, quantite]) => ({ id: parseInt(id), quantite }));

    if (!items.length) return alert("Veuillez sélectionner au moins un plat.");
    
    const res = await fetch(`/api/commande/table/${table_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plats: items }),
    });

    if (res.ok) {
      setConfirmation("Commande envoyée avec succès !");
      const resetOrder: Order = {};
      meals.forEach((m) => resetOrder[m.id] = 0);
      setOrder(resetOrder);
      const result = await res.json();
      window.location.href = `/commande/suivi?orderId=${result.order_id}`;
    } else {
      alert("Erreur lors de l'envoi de la commande.");
    }
  };

  if (!menu) return <p>Chargement du menu...</p>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Menu: {menu}</h1>
      {meals.map((meal) => (
        <div key={meal.id} className="mb-4 p-2 border rounded">
          <h2 className="text-lg font-semibold">{meal.nom}</h2>
          <p>{meal.description}</p>
          <span className="text-sm text-gray-700">{meal.prix} €</span>
          <div className="mt-2">
            <label className="mr-2">Quantité :</label>
            <input
              type="number"
              min="0"
              value={order[meal.id] || 0}
              onChange={(e) => handleChange(meal.id, e.target.value)}
              className="w-16 border p-1"
            />
          </div>
        </div>
      ))}
      <button onClick={envoyerCommande} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
        Envoyer la commande
      </button>
      {confirmation && <p className="mt-2 text-green-600">{confirmation}</p>}
    </div>
  );
}
