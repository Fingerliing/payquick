"use client";

import { useAuthStore } from "../../store/authStore";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import "../styles/theme.css";
import "../styles/components.css";

export default function ClientDashboard() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/clients/login");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="card max-w-xl mx-auto p-6">
      <h1 className="section-title">Bienvenue {user} !</h1>
      <p className="section-subtitle">Vous êtes connecté en tant que client.</p>
      <button
        onClick={() => {
          logout();
          router.push("/clients/login");
        }}
        className="btn btn-secondary"
      >
        Se déconnecter
      </button>
    </div>
  );
}
