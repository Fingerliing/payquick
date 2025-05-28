"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const fetchUser = useAuthStore((state) => state.fetchUser);

  const [form, setForm] = useState({
    nom: "",
    email: "",
    password: "",
    role: "",
    telephone: "",
    siret: "",
  });
  const [cni, setCni] = useState<File | null>(null);
  const [kbis, setKbis] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDebug(null);

    const formData = new FormData();
    formData.append("username", form.email);
    formData.append("password", form.password);
    formData.append("role", form.role);
    formData.append("nom", form.nom);

    if (form.role === "client") {
      formData.append("telephone", form.telephone);
    } else if (form.role === "restaurateur") {
      formData.append("siret", form.siret);
      if (cni) formData.append("cni", cni);
      if (kbis) formData.append("kbis", kbis);
    }

    try {
      const res = await fetch(api.register, {
        method: "POST",
        body: formData,
      });

      const raw = await res.clone().text();
      const json = await res.json().catch(() => ({}));
      setDebug({ status: res.status, response: raw });

      if (!res.ok) throw new Error(json.detail || "Erreur lors de l'inscription");

      const token = json.access;
      localStorage.setItem("token", token);
      localStorage.setItem("refresh", json.refresh);

      await fetchUser(token);

      const user = useAuthStore.getState().user;
      if (user?.role === "restaurateur") {
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
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">Créer un compte</h1>

        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            name="nom"
            placeholder="Nom"
            value={form.nom}
            onChange={handleChange}
            className="w-full border border-gray-300 p-3 rounded-lg"
            required
          />

          <input
            type="email"
            name="email"
            placeholder="Adresse email"
            value={form.email}
            onChange={handleChange}
            className="w-full border border-gray-300 p-3 rounded-lg"
            required
          />

          <input
            type="password"
            name="password"
            placeholder="Mot de passe"
            value={form.password}
            onChange={handleChange}
            className="w-full border border-gray-300 p-3 rounded-lg"
            required
          />

          <select
            name="role"
            value={form.role}
            onChange={handleChange}
            className="w-full border border-gray-300 p-3 rounded-lg"
            required
          >
            <option value="">Je suis...</option>
            <option value="client">Client</option>
            <option value="restaurateur">Restaurateur</option>
          </select>

          {form.role === "client" && (
            <input
              type="tel"
              name="telephone"
              placeholder="Numéro de téléphone"
              maxLength={10}
              value={form.telephone}
              onChange={handleChange}
              className="w-full border border-gray-300 p-3 rounded-lg"
              required
            />
          )}

          {form.role === "restaurateur" && (
            <>
              <input
                type="text"
                name="siret"
                placeholder="Numéro SIRET"
                value={form.siret}
                onChange={handleChange}
                className="w-full border border-gray-300 p-3 rounded-lg"
                required
              />

              <label className="block text-sm font-medium text-gray-700">Carte d'identité</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setCni(e.target.files?.[0] || null)}
                className="w-full border border-gray-300 p-2 rounded-lg"
                required
              />

              <label className="block text-sm font-medium text-gray-700">Extrait Kbis</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setKbis(e.target.files?.[0] || null)}
                className="w-full border border-gray-300 p-2 rounded-lg"
                required
              />
            </>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" className="w-full">Créer un compte</Button>
        </form>

        {debug && (
          <div className="mt-6 p-4 border border-gray-300 rounded bg-gray-100 text-sm text-gray-800">
            <p className="mb-1 font-semibold">Réponse brute :</p>
            <pre className="whitespace-pre-wrap break-words">{debug.response}</pre>
          </div>
        )}

        <p className="text-sm text-gray-600 text-center mt-6">
          Déjà inscrit ? <Link href="/auth/login" className="text-primary hover:underline">Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
