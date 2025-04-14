"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function RestaurateurLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/restaurateur/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError("✅ Votre compte est en cours de validation par l'équipe.");
        } else {
          setError(data.error || "Erreur lors de la connexion");
        }
      } else {
        login(data.user.username);
        router.push("/restaurants/dashboard");
      }
    } catch (e) {
      setError("Erreur réseau");
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Connexion restaurateur</h2>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Nom d'utilisateur"
          className="w-full border p-2 rounded"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          className="w-full border p-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
          Se connecter
        </button>
      </form>
      <div className="text-center mt-6">
        <p className="text-sm">Pas encore de compte ?</p>
        <button
          onClick={() => router.push("/restaurants/register")}
          className="mt-2 underline text-blue-600 hover:text-blue-800"
        >
          Créer un compte restaurateur
        </button>
      </div>
    </div>
  );
}
