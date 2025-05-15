import { create } from "zustand";
import { api } from "@/lib/api";

interface User {
  username: string;
  email: string;
  role: "client" | "restaurateur" | "unknown";
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  logout: () => void;
  fetchUser: (token: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  logout: () => set({ user: null, isAuthenticated: false }),

  fetchUser: async (token) => {
    try {
      const res = await fetch(api.me, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("/api/me échoué:", res.status, errorText);
        throw new Error("Échec de récupération de l'utilisateur");
      }

      const data = await res.json();
      set({
        user: {
          username: data.username,
          email: data.email,
          role: data.role || "unknown",
        },
        isAuthenticated: true,
      });
    } catch (err) {
      console.error("Erreur auth:", err);
      set({ user: null, isAuthenticated: false });
    }
  },
}));
