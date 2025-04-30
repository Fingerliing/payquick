import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const fakeCart = [
  { id: 1, name: "Salade César", price: 8.5, quantity: 1 },
  { id: 2, name: "Burger Gourmet", price: 15, quantity: 2 },
];

export default function ClientOrderPage() {
  const total = fakeCart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <main className="min-h-screen flex flex-col items-center bg-gray-50 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Votre commande</h1>

      <section className="w-full max-w-2xl space-y-6">
        {fakeCart.map((item) => (
          <Card key={item.id}>
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">{item.name}</h3>
                <p className="text-gray-500 text-sm">x{item.quantity}</p>
              </div>
              <p className="text-gray-800 font-semibold">{(item.price * item.quantity).toFixed(2)} €</p>
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-between items-center text-lg font-semibold border-t pt-4">
          <span>Total</span>
          <span>{total.toFixed(2)} €</span>
        </div>

        <Button className="w-full">Payer maintenant</Button>
      </section>

      <footer className="mt-20 text-gray-500 text-sm">© 2025 Eat & Go. Tous droits réservés.</footer>
    </main>
  );
}
