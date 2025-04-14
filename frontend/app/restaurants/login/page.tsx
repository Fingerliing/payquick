"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../store/authStore";

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
          setError("✅ Votre compte est en cours de validation par l'équipe. Vous recevrez un email dès que votre compte sera validé.");
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
      {error && (
        <div className={`mb-4 p-3 rounded ${
          error.includes("en cours de validation") 
            ? "bg-green-50 text-green-700 border border-green-200" 
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {error}
        </div>
      )}
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
      <div className="text-center mt-4">
        <button
          onClick={() => router.push("/")}
          className="text-sm text-gray-500 hover:text-gray-800 underline"
        >
          ← Retour à l'accueil
        </button>
      </div>
    </div>
  );
}
