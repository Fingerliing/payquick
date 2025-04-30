import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">Connexion</h1>

        <form className="space-y-4">
          <input
            type="email"
            placeholder="Adresse email"
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          <input
            type="password"
            placeholder="Mot de passe"
            className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />

          <Button type="submit" className="w-full">Se connecter</Button>
        </form>

        <p className="text-sm text-gray-600 text-center mt-6">
          Pas encore de compte ? <Link href="/auth/register" className="text-primary hover:underline">Créer un compte</Link>
        </p>
      </div>
    </main>
  );
}
