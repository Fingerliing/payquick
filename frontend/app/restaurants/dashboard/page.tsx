import Link from "next/link";
import RoleGuard from "@/components/auth/roleGuard";

export default function RestaurateurDashboardPage() {
  return (
    <RoleGuard role="restaurateur">
      <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
        <h1 className="text-4xl font-bold text-gray-800 mb-8">Dashboard Restaurateur</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <Link href="/restaurants/create" className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Ajouter un restaurant</h2>
            <p className="text-gray-600">Ajoutez votre établissement à l'application.</p>
          </Link>

          <Link href="/restaurants/menu" className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Créer / Modifier le menu</h2>
            <p className="text-gray-600">Ajoutez ou modifiez vos plats et boissons.</p>
          </Link>

          <Link href="/restaurants/qrcode" className="bg-white border rounded-xl p-6 shadow hover:shadow-lg transition">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Générer des QR codes</h2>
            <p className="text-gray-600">Créez les QR à placer sur les tables de votre restaurant.</p>
          </Link>
        </div>

        <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
      </main>
    </RoleGuard> 
  );
}
