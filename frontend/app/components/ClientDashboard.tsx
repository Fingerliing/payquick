import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <header className="w-full max-w-6xl flex justify-between items-center py-6">
        <h1 className="text-3xl font-bold text-gray-800">Eat & Go</h1>
        <nav className="flex gap-6">
          <Link href="/menu" className="text-gray-600 hover:text-gray-900">Menu</Link>
          <Link href="/scan" className="text-gray-600 hover:text-gray-900">Scanner un QR</Link>
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
        </nav>
      </header>

      <section className="flex flex-col items-center text-center mt-20">
        <h2 className="text-4xl md:text-6xl font-extrabold text-gray-800 mb-4">Scannez, commandez, savourez</h2>
        <p className="text-gray-600 text-lg md:text-xl mb-8">Accédez au menu de votre table en scannant un QR code et passez commande depuis votre téléphone.</p>
        <Button asChild>
          <Link href="/scan">Scanner un QR Code</Link>
        </Button>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-20 max-w-4xl w-full">
        <Card className="hover:shadow-xl transition">
          <CardContent className="p-6">
            <h3 className="text-2xl font-semibold mb-2">Menu digitalisé</h3>
            <p className="text-gray-600">Consultez le menu complet du restaurant directement depuis votre téléphone.</p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-xl transition">
          <CardContent className="p-6">
            <h3 className="text-2xl font-semibold mb-2">Commande depuis la table</h3>
            <p className="text-gray-600">Passez votre commande sans attendre un serveur, en toute simplicité.</p>
          </CardContent>
        </Card>
      </section>

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}
