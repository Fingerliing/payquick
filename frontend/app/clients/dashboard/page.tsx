import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ClientDashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <h1 className="text-4xl font-bold text-gray-800 mb-8">Bienvenue sur Eat & Go</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        <Link href="/client/scan" className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Scanner un QR Code</h2>
          <p className="text-gray-600">Accédez au menu de votre table en un scan.</p>
        </Link>

        <Link href="/client/order" className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Ma commande</h2>
          <p className="text-gray-600">Consultez ou finalisez votre commande actuelle.</p>
        </Link>
      </div>

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}
