"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";

export default function CreateRestaurantPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [siret, setSiret] = useState("");
  const [email, setEmail] = useState("");
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

    try {
      const res = await fetch(api.restaurants, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          description,
          address,
          siret,
          email,
        }),
      });

      const raw = await res.clone().text();
      const json = await res.json().catch(() => ({}));
      setDebug({ status: res.status, response: raw });

      if (!res.ok) throw new Error(json.detail || "Erreur lors de la création du restaurant");

      router.push("/restaurants/dashboard");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">Créer un restaurant</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Nom du restaurant"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <input
            type="text"
            placeholder="Adresse complète"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <input
            type="text"
            placeholder="Numéro de SIRET"
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
          <input
            type="email"
            placeholder="Email de contact"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" className="w-full">Enregistrer le restaurant</Button>
        </form>

        {debug && (
          <div className="mt-6 p-4 border border-gray-300 rounded bg-gray-100 text-sm text-gray-800">
            <p className="mb-1 font-semibold">Réponse brute :</p>
            <pre className="whitespace-pre-wrap break-words">{debug.response}</pre>
          </div>
        )}
      </div>
    </main>
  );
}