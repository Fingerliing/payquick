"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const role = user.role;
      if (role === "client") router.push("/client/dashboard");
      else if (role === "restaurateur") router.push("/restaurant/dashboard");
    }
  }, [isAuthenticated, user, router]);

  return (
    <main className="home">
      <div className="home-background"></div>

      <div className="home-header">
        <h1 className="home-title animate-fade-in-up">
          Bienvenue sur Eat & Go
        </h1>
        <p className="home-subtitle animate-fade-in-up delay-100">
          L'application pour commander et gérer en toute simplicité.
        </p>
      </div>

      <div className="home-actions animate-fade-in-up delay-200">
        <button className="btn btn-primary" onClick={() => router.push("/auth/login")}>Se connecter</button>
        <button className="btn btn-secondary" onClick={() => router.push("/auth/register")}>Créer un compte</button>
      </div>

      <div className="theme-toggle animate-fade-in-up delay-200">
        <label className="switch">
          <input type="checkbox" checked={isDark} onChange={() => setIsDark(!isDark)} />
          <span className="slider round"></span>
        </label>
        <span className="toggle-label">{isDark ? "Mode sombre" : "Mode clair"}</span>
      </div>
    </main>
  );
} 
