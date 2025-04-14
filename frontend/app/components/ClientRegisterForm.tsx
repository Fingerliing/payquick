"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ClientRegisterForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // @ts-ignore
    const recaptchaToken = grecaptcha.getResponse();
    if (!recaptchaToken) {
      setError("Veuillez compléter le captcha.");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/client/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email, phone, recaptcha: recaptchaToken })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de l'inscription");
      } else {
        setSuccess(true);
        setError("");
        setUsername("");
        setPassword("");
        setEmail("");
        setPhone("");
        // @ts-ignore
        grecaptcha.reset();
      }
    } catch (e) {
      setError("Erreur réseau");
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Créer un compte client</h2>
      {success && <p className="text-green-600 mb-4">Compte créé avec succès ✅</p>}
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
        <input
          type="email"
          placeholder="Email"
          className="w-full border p-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="tel"
          placeholder="Téléphone"
          className="w-full border p-2 rounded"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="g-recaptcha" data-sitekey="VOTRE_CLE_SITE"></div>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
          Créer le compte
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
