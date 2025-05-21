"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Resthome } from "@/components/ui/resthome";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function RestaurantMenusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get("restaurantId");

  const [menus, setMenus] = useState<any[]>([]);
  const [newMenuName, setNewMenuName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const fetchMenus = async () => {
    if (!restaurantId || !token) return;
    try {
      const res = await fetch(api.menu, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setMenus(data);
    } catch (err) {
      console.error("Erreur lors du chargement des menus");
    }
  };

  useEffect(() => {
    fetchMenus();
  }, [restaurantId]);

  const handleCreateMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebug(null);

    if (!restaurantId || !token) {
      setError("Token ou restaurant manquant");
      return;
    }

    try {
      const res = await fetch(api.menu, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newMenuName,
          restaurant: restaurantId,
        }),
      });

      const raw = await res.clone().text();
      const json = await res.json().catch(() => ({}));
      setDebug({ status: res.status, response: raw });

      if (!res.ok) throw new Error(json.detail || "Erreur lors de la création du menu");

      setNewMenuName("");
      fetchMenus();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <Resthome/>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Menus du restaurant</h1>

      <form onSubmit={handleCreateMenu} className="w-full max-w-xl space-y-4 bg-white p-6 rounded-xl shadow mb-8">
        <input
          type="text"
          placeholder="Nom du menu"
          value={newMenuName}
          onChange={(e) => setNewMenuName(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
        <Button type="submit" className="w-full">Créer le menu</Button>
      </form>

      <div className="w-full max-w-xl space-y-4">
        {menus.map((menu) => (
          <div key={menu.id} className="bg-white border rounded-xl p-4 shadow hover:shadow-lg transition flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{menu.name}</h2>
              <Link href={`/restaurants/menus/${menu.id}`} className="text-lg font-semibold text-primary hover:underline">{menu.name}</Link>
            </div>
            <Button onClick={() => router.push(`/restaurants/menu?menuId=${menu.id}`)}>
              Ajouter des items
            </Button>
          </div>
        ))}
      </div>

      {debug && (
        <div className="mt-6 p-4 border border-gray-300 rounded bg-gray-100 text-sm text-gray-800 max-w-xl w-full">
          <p className="mb-1 font-semibold">Réponse brute :</p>
          <pre className="whitespace-pre-wrap break-words">{debug.response}</pre>
        </div>
      )}

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}