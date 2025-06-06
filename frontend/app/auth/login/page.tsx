"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [role, setRole] = useState<string>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebug(null);

    try {
      const res = await fetch(api.login, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });

      const raw = await res.clone().text();
      const json = await res.json().catch(() => ({}));
      setDebug({ status: res.status, response: raw });

      if (!res.ok) throw new Error(json.detail || "Email ou mot de passe invalide");

      const token = json.access;
      localStorage.setItem("token", token);
      localStorage.setItem("refresh", json.refresh);

      await fetchUser(token);

      const user = useAuthStore.getState().user;
      if (next !== "/") {
        router.push(next);
      } else if (user?.role === "restaurateur") {
        router.push("/restaurants/dashboard");
      } else if (user?.role === "client") {
        router.push("/clients/dashboard");
      } else {
        router.push("/");
      }
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

        {debug && (
          <div className="mt-6 p-4 border border-gray-300 rounded bg-gray-100 text-sm text-gray-800">
            <p className="mb-1 font-semibold">Réponse brute :</p>
            <pre className="whitespace-pre-wrap break-words">{debug.response}</pre>
          </div>
        )}

        <p className="text-sm text-gray-600 text-center mt-6">
          Pas encore de compte ? <Link href="/auth/register" className="text-primary hover:underline">Créer un compte</Link>
        </p>
      </div>
    </main>
  );
}
