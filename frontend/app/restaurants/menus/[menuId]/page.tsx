"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Resthome } from "@/components/ui/resthome";

type MenuItem = {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  is_available: boolean;
};

export default function MenuDetailPage() {
  const { menuId } = useParams();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuName, setMenuName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || typeof menuId !== "string") return;
  
    const fetchMenuItems = async () => {
      try {
        const resItems = await fetch(api.menuItemsDetails(menuId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const itemsData = await resItems.json();
        console.log("Réponse menu-items :", itemsData);
        setItems(itemsData);
  
        const resMenu = await fetch(api.menuDetails(menuId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const menuData = await resMenu.json();
        setMenuName(menuData.name);
      } catch (err) {
        setError("Erreur lors du chargement du menu.");
      }
    };
  
    fetchMenuItems();
  }, [menuId]);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <Resthome />

      <h1 className="text-3xl font-bold text-gray-800 mb-4">Menu : {menuName}</h1>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="w-full max-w-3xl space-y-4">
        {items.map((item) => (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow border">
            <h2 className="text-xl font-semibold text-gray-800">{item.name}</h2>
            <p className="text-gray-600 text-sm mb-1">{item.description}</p>
            <p className="text-gray-700 font-medium">
              {item.category} — {item.price} €
            </p>
            {!item.is_available && (
              <p className="text-sm text-red-500">Indisponible</p>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-gray-500 text-center">Ce menu ne contient encore aucun élément.</p>
        )}
      </div>
    </main>
  );
}