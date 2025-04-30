"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (isAuthenticated && user) {
      const role = user.role;
      if (role === "client") router.push("/client/dashboard");
      else if (role === "restaurateur") router.push("/restaurant/dashboard");
    }
  }, [isAuthenticated, user, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Bienvenue sur Eat & Go</h1>
        <p className="text-lg text-gray-600">L'application pour commander et gérer en toute simplicité</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-xl">
        <div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition text-center">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Vous êtes restaurateur ?</h2>
          <p className="text-gray-600 mb-6">Créez et gérez votre restaurant, ajoutez votre menu et générez vos QR codes.</p>
          <Button className="w-full" onClick={() => router.push("/auth/login")}>Accès Restaurateur</Button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition text-center">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Vous êtes client ?</h2>
          <p className="text-gray-600 mb-6">Scannez un QR code pour commander directement depuis votre table.</p>
          <Button className="w-full" onClick={() => router.push("/auth/login")}>Accès Client</Button>
        </div>
      </div>

      <footer className="mt-20 text-gray-500 text-sm text-center">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}
