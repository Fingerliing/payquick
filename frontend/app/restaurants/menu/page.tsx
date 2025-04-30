import { Button } from "@/components/ui/button";

export default function RestaurantMenuPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Créer / Modifier le menu</h1>

      <form className="w-full max-w-xl space-y-4 bg-white p-6 rounded-xl shadow">
        <input
          type="text"
          placeholder="Nom du plat"
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <textarea
          placeholder="Description"
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="Prix (€)"
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
        <select
          className="w-full border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          required
        >
          <option value="">Catégorie</option>
          <option value="Entrée">Entrée</option>
          <option value="Plat">Plat</option>
          <option value="Dessert">Dessert</option>
        </select>

        <Button type="submit" className="w-full">Ajouter au menu</Button>
      </form>

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}
