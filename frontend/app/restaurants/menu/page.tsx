"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Resthome } from "@/components/ui/resthome";
import { api } from "@/lib/api";

export default function RestaurantMenuPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const menuId = searchParams.get("menuId");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebug(null);

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Utilisateur non authentifié");
      return;
    }

    if (!menuId) {
      setError("Aucun menu sélectionné.");
      return;
    }

    try {
      const res = await fetch(api.menuItems, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          description,
          price,
          category,
          menu: menuId,
        }),
      });

      const raw = await res.clone().text();
      const json = await res.json().catch(() => ({}));
      setDebug({ status: res.status, response: raw });

      if (!res.ok) throw new Error(json.detail || "Erreur lors de la création de l'élément de menu");

      setName("");
      setDescription("");
      setPrice("");
      setCategory("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <Resthome/>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Ajouter au menu</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4 bg-white p-6 rounded-xl shadow">
        <input
          type="text"
          placeholder="Nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="Prix (€)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        >
          <option value="">Catégorie</option>
          <option value="Menu">Menu</option>
          <option value="Entrée">Entrée</option>
          <option value="Plat">Plat</option>
          <option value="Dessert">Dessert</option>
          <option value="Boisson">Boisson</option>
        </select>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <Button type="submit" className="w-full">Ajouter au menu</Button>
        <Button variant="outline" onClick={() => router.back()} className="w-full mt-4">
          Revenir à la liste des menus
        </Button>
      </form>

      {debug && (
        <div className="mt-6 p-4 border border-gray-300 rounded bg-gray-100 text-sm text-gray-800">
          <p className="mb-1 font-semibold">Réponse brute :</p>
          <pre className="whitespace-pre-wrap break-words">{debug.response}</pre>
        </div>
      )}

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}