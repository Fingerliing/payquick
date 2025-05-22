
"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export function DeleteItemButton({
  itemId,
  onDelete,
}: {
  itemId: number;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setLoading(true);
    const res = await fetch(api.menuItems + itemId + "/", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      onDelete();
    }
    setLoading(false);
    setConfirm(false);
  };

  return confirm ? (
    <div className="flex gap-2">
      <button
        onClick={handleDelete}
        disabled={loading}
        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
      >
        Confirmer
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
      >
        Annuler
      </button>
    </div>
  ) : (
    <button
      onClick={() => setConfirm(true)}
      className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-red-500 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:brightness-110 hover:scale-105"
    >
      <span className="absolute inset-0 h-full w-full bg-white opacity-10 transition-all duration-300 group-hover:opacity-20"></span>
      🗑 Supprimer
    </button>
  );
}
