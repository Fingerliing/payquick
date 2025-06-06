"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Meal } from "@/types/meal";
import { api } from "@/lib/api";

export default function ClientOrderPage() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("tableId");

  const [meals, setMeals] = useState<Meal[]>([]);
  const [menuName, setMenuName] = useState("");
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!tableId) return;

    fetch(api.orderByTable(tableId))
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          console.error("Erreur API :", data.error);
          return;
        }
        setMenuName(data.menu);
        setMeals(data.plats);
      })
      .catch(err => {
        console.error("Erreur réseau :", err);
      })
      .finally(() => setLoading(false));
  }, [tableId]);

  const updateQuantity = (id: number, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + delta),
    }));
  };

  const total = meals.reduce(
    (sum, meal) => sum + (quantities[meal.id] || 0) * parseFloat(meal.prix),
    0
  );

  const handleCheckout = async () => {
    if (!tableId) {
      alert("Identifiant de table introuvable.");
      return;
    }

    const selectedMeals = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([id, quantity]) => ({
        id: Number(id),
        quantite: quantity,
      }));

    if (selectedMeals.length === 0) {
      alert("Aucun plat sélectionné.");
      return;
    }

    try {
      const res = await fetch(api.orderByTable(tableId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plats: selectedMeals }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("Erreur API :", data);
        alert("Erreur lors de la commande : " + (data?.error || "inconnue"));
        return;
      }

      alert(`Commande enregistrée (ID ${data.order_id})`);
      window.location.href = `/clients/order/suivi?orderId=${data.order_id}`;
    } catch (error) {
      console.error("Erreur réseau :", error);
      alert("Impossible d'envoyer la commande.");
    }
  };

  if (loading) return <div className="p-6">Chargement du menu...</div>;

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Menu : {menuName}</h1>

      {meals.map(meal => (
        <div key={meal.id} className="border rounded p-4 mb-2 flex justify-between items-center">
          <div>
            <div className="font-semibold">{meal.nom}</div>
            <div className="text-sm text-gray-600">{meal.description}</div>
            <div className="text-sm font-bold mt-1">{meal.prix} €</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => updateQuantity(meal.id, -1)} className="px-2 py-1 bg-gray-200">-</button>
            <span>{quantities[meal.id] || 0}</span>
            <button onClick={() => updateQuantity(meal.id, 1)} className="px-2 py-1 bg-gray-200">+</button>
          </div>
        </div>
      ))}

      <div className="mt-4 text-right font-bold">Total : {total.toFixed(2)} €</div>

      <button
        className="mt-6 px-4 py-2 bg-green-600 text-white rounded"
        onClick={handleCheckout}
        disabled={total === 0}
      >
        Commander
      </button>
    </main>
  );
}
