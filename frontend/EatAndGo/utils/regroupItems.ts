import { OrderItem } from "@/types/order";
import { ProcessedReceiptItem } from "@/types/receipt"

export const groupIdenticalItems = (items: OrderItem[]): OrderItem[] => {
  const groupedMap = new Map<string, OrderItem>();

  items.forEach(item => {
    const customizationsKey = JSON.stringify(item.customizations || {});
    const instructionsKey = item.special_instructions || '';
    const uniqueKey = `${item.menu_item}-${customizationsKey}-${instructionsKey}`;

    if (groupedMap.has(uniqueKey)) {
      const existing = groupedMap.get(uniqueKey)!;
      groupedMap.set(uniqueKey, {
        ...existing,
        quantity: existing.quantity + item.quantity,
        total_price: (parseFloat(existing.total_price) + parseFloat(item.total_price)).toFixed(2),
      });
    } else {
      groupedMap.set(uniqueKey, { ...item });
    }
  });

  return Array.from(groupedMap.values());
};

export const groupIdenticalReceiptItems = (items: ProcessedReceiptItem[]): ProcessedReceiptItem[] => {
  const groupedMap = new Map<string, ProcessedReceiptItem>();

  items.forEach(item => {
    const customizationsKey = JSON.stringify(item.customizations || {});
    const uniqueKey = `${item.name}-${customizationsKey}`;

    if (groupedMap.has(uniqueKey)) {
      const existing = groupedMap.get(uniqueKey)!;
      groupedMap.set(uniqueKey, {
        ...existing,
        quantity: existing.quantity + item.quantity,
        total_price_ht: Math.round((existing.total_price_ht + item.total_price_ht) * 100) / 100,
        total_price_ttc: Math.round((existing.total_price_ttc + item.total_price_ttc) * 100) / 100,
        tva_amount: Math.round((existing.tva_amount + item.tva_amount) * 100) / 100,
      });
    } else {
      groupedMap.set(uniqueKey, { ...item });
    }
  });

  return Array.from(groupedMap.values());
};