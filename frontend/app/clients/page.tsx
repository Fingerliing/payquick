"use client";

import RestaurantMap from "../components/RestaurantMap";
import { useState } from "react";
import "../styles/theme.css";
import "../styles/components.css";

export default function ClientsPage() {
  const [search, setSearch] = useState("");

  return (
    <main className="section">
      <div className="text-center mb-6">
        <h1 className="section-title">Explorer les restaurants</h1>
        <p className="section-subtitle">Voici les établissements disponibles autour de vous</p>
      </div>

      <div className="max-w-md mx-auto mb-6">
        <input
          type="text"
          placeholder="Rechercher par ville ou nom..."
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <RestaurantMap filter={search} />
    </main>
  );
}
