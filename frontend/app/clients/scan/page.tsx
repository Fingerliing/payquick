import { Button } from "@/components/ui/button";

export default function ClientScanPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Scanner un QR Code</h1>
      <p className="text-gray-600 mb-8 text-center max-w-md">
        Scannez le QR code ou entrez l'identifiant du restaurant figurant dans le QR code pour accéder à son menu.
      </p>
      <form action="/client/restaurant" method="GET" className="w-full max-w-sm flex flex-col gap-4">
        <input
          type="text"
          name="id"
          placeholder="Identifiant du restaurant"
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <Button type="submit" className="w-full">Voir le Menu</Button>
      </form>
    </main>
  );
}
