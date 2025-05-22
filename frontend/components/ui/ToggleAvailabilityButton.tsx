
"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { MenuItem } from "@/types/menu";

export function ToggleAvailabilityButton({
  item,
  onUpdate,
}: {
  item: MenuItem;
  onUpdate: (updated: MenuItem) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    const res = await fetch(api.menuItems + item.id + "/", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ is_available: !item.is_available }),
    });

    if (res.ok) {
      const updated = { ...item, is_available: !item.is_available };
      onUpdate(updated);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:brightness-110 hover:scale-105"
    >
      <span className="absolute inset-0 h-full w-full bg-white opacity-10 transition-all duration-300 group-hover:opacity-20"></span>
      {item.is_available ? "❌ Rendre indisponible" : "✅ Rendre disponible"}
    </button>
  );
}
