import { useCart } from "@/contexts/CartContext";
import { createOrder } from "@/services/orderService";

export default function CartScreen() {
  const { cart, clearCart } = useCart();
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    try {
      setLoading(true);
      const order = await createOrder(cart.restaurantId!, cart.tableId!, cart.items);
      clearCart();
      router.replace(`/orders/${order.id}`); // Redirige vers l’écran de suivi
    } finally {
      setLoading(false);
    }
  };

  // UI : affiche les items, total, bouton « Commander » qui appelle handleCheckout
}