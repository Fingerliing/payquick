"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "../../store/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  is_available: boolean;
}

interface Menu {
  id: number;
  items: MenuItem[];
}

export default function RestaurantMenu({ restaurantId }: { restaurantId: number }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    price: "",
    category: "Entrée"
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    fetchMenu();
  }, [restaurantId]);

  const fetchMenu = async () => {
    try {
      const res = await fetch(`${API_URL}/api/restaurants/${restaurantId}/menu`);
      if (res.ok) {
        const data = await res.json();
        setMenu(data);
      } else {
        setError("Erreur lors du chargement du menu");
      }
    } catch (err) {
      setError("Erreur réseau");
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/restaurants/${restaurantId}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newItem,
          price: parseFloat(newItem.price)
        })
      });

      if (res.ok) {
        setSuccess("Item ajouté avec succès");
        setNewItem({
          name: "",
          description: "",
          price: "",
          category: "Entrée"
        });
        fetchMenu();
      } else {
        const data = await res.json();
        setError(data.error || "Erreur lors de l'ajout de l'item");
      }
    } catch (err) {
      setError("Erreur réseau");
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet item ?")) return;

    try {
      const res = await fetch(`${API_URL}/api/menu/items/${itemId}`, {
        method: "DELETE"
      });

      if (res.ok) {
        setSuccess("Item supprimé avec succès");
        fetchMenu();
      } else {
        setError("Erreur lors de la suppression");
      }
    } catch (err) {
      setError("Erreur réseau");
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const res = await fetch(`${API_URL}/api/menu/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_available: !item.is_available
        })
      });

      if (res.ok) {
        setSuccess("Disponibilité mise à jour");
        fetchMenu();
      } else {
        setError("Erreur lors de la mise à jour");
      }
    } catch (err) {
      setError("Erreur réseau");
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Gestion du menu</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <form onSubmit={handleAddItem} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nom</label>
          <input
            type="text"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={newItem.description}
            onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Prix (€)</label>
          <input
            type="number"
            step="0.01"
            value={newItem.price}
            onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Catégorie</label>
          <select
            value={newItem.category}
            onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="Entrée">Entrée</option>
            <option value="Plat">Plat</option>
            <option value="Dessert">Dessert</option>
            <option value="Boisson">Boisson</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
        >
          Ajouter au menu
        </button>
      </form>

      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4">Items du menu</h3>
        <div className="space-y-4">
          {menu?.items.map((item) => (
            <div
              key={item.id}
              className="border rounded-lg p-4 flex justify-between items-center"
            >
              <div>
                <h4 className="font-medium">{item.name}</h4>
                <p className="text-gray-600">{item.description}</p>
                <p className="text-indigo-600 font-medium">{item.price}€</p>
                <span className="text-sm text-gray-500">{item.category}</span>
              </div>
              <div className="space-x-2">
                <button
                  onClick={() => handleToggleAvailability(item)}
                  className={`px-3 py-1 rounded ${
                    item.is_available
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {item.is_available ? "Disponible" : "Indisponible"}
                </button>
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 