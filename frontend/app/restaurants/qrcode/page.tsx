import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function RestaurantQRCodePage() {
  const [restaurantId, setRestaurantId] = useState("12345");
  const qrUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/client/restaurant?id=${restaurantId}`;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Générer un QR Code</h1>

      <div className="w-full max-w-xl bg-white p-6 rounded-xl shadow space-y-6">
        <input
          type="text"
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          placeholder="Identifiant du restaurant"
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">Lien associé au QR :</p>
          <p className="break-all text-blue-600 text-sm">{qrUrl}</p>
        </div>

        <div className="flex justify-center">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
            alt="QR Code du restaurant"
            className="rounded-lg border"
          />
        </div>

        <Button className="w-full" onClick={() => window.print()}>Imprimer le QR Code</Button>
      </div>

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}
