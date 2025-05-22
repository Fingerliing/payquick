"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Resthome } from "@/components/ui/resthome";
import { ToggleAvailabilityButton } from "@/components/ui/ToggleAvailabilityButton";
import { DeleteItemButton } from "@/components/ui/DeleteItemButton";
import { MenuItem } from "@/types/menu";

export default function MenuDetailPage() {
  const { menuId } = useParams();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuName, setMenuName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [toast]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token || typeof menuId !== "string") return;

    const fetchMenuItems = async () => {
      try {
        const resItems = await fetch(api.menuItemsDetails(menuId), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const itemsData = await resItems.json();
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
      <style jsx global>{`
        @keyframes slide-in {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }

        @keyframes fade-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        .animate-slide-in {
          animation: slide-in 0.4s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>

      {toast && (
        <div className="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white text-sm font-medium animate-slide-in">
          {toast}
        </div>
      )}

      <Resthome />

      <h1 className="text-3xl font-bold text-gray-800 mb-4">Menu : {menuName}</h1>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="w-full max-w-3xl space-y-4">
        {items.map((item) => (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow border flex flex-col gap-2">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">{item.name}</h2>
              <p className="text-gray-600 text-sm mb-1">{item.description}</p>
              <p className="text-gray-700 font-medium">
                {item.category} — {item.price} €
              </p>
              {!item.is_available && (
                <p className="text-sm text-red-500">Indisponible</p>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <ToggleAvailabilityButton
                item={item}
                onUpdate={(updated) => {
                  setItems((prev) =>
                    prev.map((i) => (i.id === updated.id ? updated : i))
                  );
                  setToast(
                    updated.is_available
                      ? "Élément marqué comme disponible"
                      : "Élément marqué comme indisponible"
                  );
                }}
              />
              <DeleteItemButton
                itemId={item.id}
                onDelete={() => {
                  setItems((prev) => prev.filter((i) => i.id !== item.id));
                  setToast("Élément supprimé avec succès");
                }}
              />
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-gray-500 text-center">Ce menu ne contient encore aucun élément.</p>
        )}
      </div>
    </main>
  );
}