"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import RoleGuard from "@/components/auth/roleGuard";
import { api } from "@/lib/api";

type Restaurant = {
  id: string;
  name: string;
};

export default function RestaurateurDashboardPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    const fetchRestaurants = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch(api.restaurants, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      setRestaurants(data);
    };

    fetchRestaurants();
  }, []);

  return (
    <RoleGuard role="restaurateur">
      <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
        <h1 className="text-4xl font-bold text-gray-800 mb-8">Dashboard Restaurateur</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mb-12">
          <Link href="/restaurants/create" className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Ajouter un restaurant</h2>
            <p className="text-gray-600">Ajoutez votre établissement à l'application.</p>
          </Link>
        </div>

        {restaurants.length > 0 && (
          <div className="w-full max-w-4xl mb-8">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Vos restaurants</h2>
            <ul className="space-y-4">
              {restaurants.map((restaurant) => (
                <li
                  key={restaurant.id}
                  onClick={() => setSelectedRestaurant(restaurant)}
                  className={`cursor-pointer p-4 border rounded-lg shadow-sm ${
                    selectedRestaurant?.id === restaurant.id
                      ? "bg-blue-100 border-blue-400"
                      : "bg-white hover:bg-gray-100"
                  }`}
                >
                  {restaurant.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedRestaurant && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mt-8">
            <Link
              href={`/restaurants/menus?restaurantId=${selectedRestaurant.id}`}
              className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Créer / Modifier le menu</h2>
              <p className="text-gray-600">Ajoutez ou modifiez vos plats et boissons pour {selectedRestaurant.name}.</p>
            </Link>

            <Link
              href={`/restaurants/${selectedRestaurant.id}/qrcode`}
              className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Générer des QR codes</h2>
              <p className="text-gray-600">Créez les QR codes pour les tables de {selectedRestaurant.name}.</p>
            </Link>

            <Link
              href={`/restaurants/menus?restaurantId=${selectedRestaurant.id}`}
              className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Gérer les menus</h2>
              <p className="text-gray-600">Créer et sélectionner un menu pour {selectedRestaurant.name}.</p>
            </Link>
          </div>
        )}
      </main>
    </RoleGuard>
  );
}