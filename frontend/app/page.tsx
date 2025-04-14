"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "../store/authStore";

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (isAuthenticated && user) {
      router.push("/clients/dashboard");
    }
  }, [isAuthenticated, user, router]);

  return (
    <main className="hero fade-in">
      <h1 className="hero-title">Bienvenue sur Restaurant App</h1>
      <p className="hero-subtitle">
        Découvrez et gérez vos restaurants préférés en toute simplicité
      </p>
      <div className="role-buttons">
        <button
          onClick={() => router.push("/restaurants")}
          className="role-button restaurateur"
        >
          <span>🏪</span> Je suis restaurateur
        </button>
        <button
          onClick={() => router.push("/clients/login")}
          className="role-button client"
        >
          <span>👤</span> Je suis client
        </button>
      </div>
    </main>
  );
}
