"use client";

import { useAuthStore } from "../../../store/authStore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import RestaurantMenu from "../../components/RestaurantMenu";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Restaurant {
  id: number;
  name: string;
  description: string;
  owner: string;
}

export default function RestaurateurDashboard() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<number | null>(null);
  const [showMenuForm, setShowMenuForm] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/restaurants/login");
    } else {
      fetchRestaurants();
    }
  }, [isAuthenticated, router]);

  const fetchRestaurants = async () => {
    try {
      const res = await fetch(`${API_URL}/api/restaurants`);
      if (res.ok) {
        const data = await res.json();
        setRestaurants(data.filter((r: Restaurant) => r.owner === user));
      }
    } catch (err) {
      console.error("Erreur lors du chargement des restaurants:", err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Espace restaurateur</h1>
        <div className="max-w-2xl mx-auto p-4">
          <button
            onClick={() => setShowMenuForm(true)}
            className="mb-4 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Créer un menu
          </button>

          {showMenuForm && <RestaurantMenu />}
        </div>
        <button
          onClick={() => {
            logout();
            router.push("/restaurants/login");
          }}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Se déconnecter
        </button>
      </div>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Mes restaurants</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {restaurants.map((restaurant) => (
            <div
              key={restaurant.id}
              className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => setSelectedRestaurant(restaurant.id)}
            >
              <h3 className="font-medium">{restaurant.name}</h3>
              <p className="text-gray-600">{restaurant.description}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedRestaurant && (
        <div className="mt-8">
          <RestaurantMenu restaurantId={selectedRestaurant} />
        </div>
      )}
    </div>
  );
}
