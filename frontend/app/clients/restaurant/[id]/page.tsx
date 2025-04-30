import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: "Entrée" | "Plat" | "Dessert";
}

const fakeMenu: MenuItem[] = [
  { id: 1, name: "Salade César", description: "Laitue, poulet grillé, parmesan, croûtons", price: 8.5, category: "Entrée" },
  { id: 2, name: "Burger Gourmet", description: "Boeuf Angus, cheddar vieilli, sauce maison", price: 15, category: "Plat" },
  { id: 3, name: "Tarte au citron", description: "Tarte maison au citron meringué", price: 6, category: "Dessert" },
];

export default function RestaurantPage({ searchParams }: { searchParams: { id?: string } }) {
  if (!searchParams.id) {
    notFound();
  }

  return (
    <main className="min-h-screen flex flex-col items-center bg-gray-50 p-6">
      <header className="w-full max-w-6xl flex justify-between items-center py-6">
        <h1 className="text-3xl font-bold text-gray-800">Restaurant #{searchParams.id}</h1>
        <Button asChild>
          <a href="/client/scan">Scanner un autre QR</a>
        </Button>
      </header>

      <section className="w-full max-w-4xl mt-10">
        <h2 className="text-2xl font-bold mb-6 text-gray-700">Menu</h2>
        <div className="space-y-10">
          {['Entrée', 'Plat', 'Dessert'].map((category) => (
            <div key={category}>
              <h3 className="text-xl font-semibold mb-4 text-primary">{category}s</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {fakeMenu.filter(item => item.category === category).map((item) => (
                  <Card key={item.id} className="hover:shadow-md transition">
                    <CardContent className="p-6">
                      <h4 className="text-lg font-bold mb-2">{item.name}</h4>
                      <p className="text-gray-600 mb-2">{item.description}</p>
                      <p className="text-gray-800 font-semibold">{item.price.toFixed(2)} €</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}
