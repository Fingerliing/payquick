"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const [role, setRole] = useState<string>("");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">Créer un compte</h1>

        <form className="space-y-4">
          <input
            type="text"
            placeholder="Nom"
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          <input
            type="email"
            placeholder="Adresse email"
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          <input
            type="password"
            placeholder="Mot de passe"
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          <select
            required
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Je suis...</option>
            <option value="client">Client</option>
            <option value="restaurateur">Restaurateur</option>
          </select>

          {role === "client" && (
            <input
              type="tel"
              placeholder="Numéro de téléphone"
              maxLength={10}
              className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          )}

          {role === "restaurateur" && (
            <>
              <input
                type="text"
                placeholder="Numéro SIRET"
                className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
              <label className="block text-sm font-medium text-gray-700">Carte d'identité</label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full border border-gray-300 p-2 rounded-lg"
                required
              />
              <label className="block text-sm font-medium text-gray-700">Extrait Kbis</label>
              <input
                type="file"
                accept="image/*,.pdf"
                className="w-full border border-gray-300 p-2 rounded-lg"
                required
              />
            </>
          )}

          <Button type="submit" className="w-full">Créer un compte</Button>
        </form>

        <p className="text-sm text-gray-600 text-center mt-6">
          Déjà inscrit ? <Link href="/auth/login" className="text-primary hover:underline">Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
