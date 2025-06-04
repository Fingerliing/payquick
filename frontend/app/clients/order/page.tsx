"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MenuItem } from "@/types/menu";

export default function ClientOrderPage() {
  const searchParams = useSearchParams();
  const restaurantId = searchParams.get("restaurantId");
  const tableId = searchParams.get("tableId");

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!restaurantId) return;
    fetch(`/api/menus/by_restaurant/${restaurantId}/`)
      .then(res => res.json())
      .then(data => setMenu(data.menu_items || data));
  }, [restaurantId]);

  const updateQuantity = (id: number, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) + delta),
    }));
  };

  const handleCheckout = async () => {
    if (!restaurantId || !tableId) {
      alert("Restaurant ou table introuvable.");
      return;
    }

    const items = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([id, quantity]) => ({
        menu_item: Number(id),
        quantity,
      }));

    const orderRes = await fetch("/api/orders/create/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant: restaurantId,
        table_identifiant: tableId,
        items,
      }),
    });

    const order = await orderRes.json();

    const checkoutRes = await fetch(`/api/orders/${order.id}/create-checkout-session/`, {
      method: "POST",
    });

    const { url } = await checkoutRes.json();
    window.location.href = url;
  };

  const total = menu.reduce(
    (sum, item) => sum + (quantities[item.id] || 0) * item.price,
    0
  );

  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <h1 className="text-2xl font-bold mb-6">Menu</h1>
      <div className="space-y-4">
        {menu.map(item => (
          <Card key={item.id}>
            <CardContent className="flex justify-between items-center p-4">
              <div>
                <h3 className="text-lg font-semibold">{item.name}</h3>
                <p className="text-sm text-gray-600">{item.price.toFixed(2)} €</p>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => updateQuantity(item.id, -1)}>-</Button>
                <span>{quantities[item.id] || 0}</span>
                <Button onClick={() => updateQuantity(item.id, 1)}>+</Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-between text-xl font-bold mt-4">
          <span>Total :</span>
          <span>{total.toFixed(2)} €</span>
        </div>

        <Button className="w-full mt-4" onClick={handleCheckout} disabled={total === 0}>
          Payer maintenant
        </Button>
      </div>
    </main>
  );
}