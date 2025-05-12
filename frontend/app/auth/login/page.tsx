"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch("/api/token/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });

      if (!res.ok) throw new Error("Email ou mot de passe invalide");

      const data = await res.json();
      const token = data.access;

      localStorage.setItem("token", token);
      await fetchUser(token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">Connexion</h1>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Adresse email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button type="submit" className="w-full">Se connecter</Button>
        </form>

        <p className="text-sm text-gray-600 text-center mt-6">
          Pas encore de compte ? <Link href="/auth/register" className="text-primary hover:underline">Créer un compte</Link>
        </p>
      </div>
    </main>
  );
}
