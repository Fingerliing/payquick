"use client";

import "../styles/theme.css";
import "../styles/components.css";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../store/authStore";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

declare global {
  interface Window {
    grecaptcha: any;
  }
}

export default function RestaurateurRegisterForm() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    siret: "",
  });
  const [idCard, setIdCard] = useState<File | null>(null);
  const [kbis, setKbis] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const login = useAuthStore((state) => state.login);

  useEffect(() => {
    // Charger le script reCAPTCHA
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (file: File | null) => void) => {
    const file = e.target.files?.[0] || null;
    setter(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idCard || !kbis) {
      setError("Veuillez fournir les deux documents demandés.");
      return;
    }

    // Vérifier le captcha
    const recaptchaToken = window.grecaptcha?.getResponse();
    if (!recaptchaToken) {
      setError("Veuillez compléter le captcha.");
      return;
    }

    const form = new FormData();
    form.append("username", formData.username);
    form.append("password", formData.password);
    form.append("email", formData.email);
    form.append("siret", formData.siret);
    form.append("id_card", idCard);
    form.append("kbis", kbis);
    form.append("recaptcha_response", recaptchaToken);

    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'inscription");
      } else {
        setSuccess(true);
        setError("");
        setFormData({ username: "", password: "", email: "", siret: "" });
        setIdCard(null);
        setKbis(null);
        window.grecaptcha?.reset();

        // Connexion automatique
        try {
          const loginRes = await fetch(`${API_URL}/api/restaurateur/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: formData.username,
              password: formData.password
            })
          });
          const loginData = await loginRes.json();
          
          if (loginRes.ok) {
            login(loginData.user.username);
            router.push("/restaurants/dashboard");
          } else {
            setError("✅ Inscription réussie ! Votre compte est en cours de validation par l'équipe. Vous pourrez vous connecter une fois votre compte validé.");
            setTimeout(() => {
              router.push("/restaurants/login");
            }, 3000);
          }
        } catch (err) {
          setError("✅ Inscription réussie ! Votre compte est en cours de validation par l'équipe. Vous pourrez vous connecter une fois votre compte validé.");
          setTimeout(() => {
            router.push("/restaurants/login");
          }, 3000);
        }
      }
    } catch (err) {
      setError("Erreur réseau lors de la requête.");
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Inscription restaurateur</h2>
      {success && <p className="text-green-600 mb-2">Inscription réussie ✅</p>}
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <input name="username" value={formData.username} onChange={handleChange} placeholder="Nom d'utilisateur" className="w-full border p-2 rounded" required />
        <input name="password" type="password" value={formData.password} onChange={handleChange} placeholder="Mot de passe" className="w-full border p-2 rounded" required />
        <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email" className="w-full border p-2 rounded" required />
        <input name="siret" value={formData.siret} onChange={handleChange} placeholder="Numéro de SIRET" className="w-full border p-2 rounded" required />

        <div>
          <label htmlFor="id_card" className="block mb-1 font-medium">Pièce d'identité</label>
          <div className="flex items-center gap-2">
            <label className="inline-block cursor-pointer bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">
              Choisir un fichier
              <input 
                id="id_card" 
                type="file" 
                accept=".jpg,.jpeg,.png,.pdf" 
                className="hidden" 
                onChange={(e) => handleFileChange(e, setIdCard)} 
              />
            </label>
            {idCard && (
              <span className="text-sm text-gray-600">
                {idCard.name}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">Formats autorisés : JPG, PNG, PDF</p>
        </div>

        <div>
          <label htmlFor="kbis" className="block mb-1 font-medium">Extrait Kbis</label>
          <div className="flex items-center gap-2">
            <label className="inline-block cursor-pointer bg-gray-200 px-4 py-2 rounded hover:bg-gray-300">
              Choisir un fichier
              <input 
                id="kbis" 
                type="file" 
                accept=".jpg,.jpeg,.png,.pdf" 
                className="hidden" 
                onChange={(e) => handleFileChange(e, setKbis)} 
              />
            </label>
            {kbis && (
              <span className="text-sm text-gray-600">
                {kbis.name}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">Formats autorisés : JPG, PNG, PDF</p>
        </div>

        <div className="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></div>

        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded w-full">
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
