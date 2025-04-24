"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import "../styles/theme.css";
import "../styles/components.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ClientLoginForm() {
  const login = useAuthStore((state) => state.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/client/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la connexion");
        setSuccess(false);
      } else {
        setSuccess(true);
        setError("");
        login(username);
      }
    } catch (e) {
      setError("Erreur réseau");
    }
  };

  return (
    <div className="card max-w-md mx-auto p-4">
      <h2 className="section-title">Connexion client</h2>
      {success && <p className="text-green-600 mb-4">Connexion réussie ✅</p>}
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Nom d'utilisateur"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="btn btn-primary w-full">
          Se connecter
        </button>
      </form>
    </div>
  );
}
