import { OrderItem, VATBreakdown } from "@/types/order";

export class VATService {
  // Taux de TVA par catégorie (France)
  static readonly VAT_RATES = {
    FOOD: 0.10,              // 10% restauration (sur place et à emporter)
    DRINK_SOFT: 0.10,        // 10% boissons non alcoolisées
    DRINK_ALCOHOL: 0.20,     // 20% boissons alcoolisées
    PACKAGED: 0.055,         // 5,5% produits préemballés
  };

  // Calcul prix HT depuis TTC
  static calculatePriceExclVAT(priceTTC: number, vatRate: number): number {
    return Math.round((priceTTC / (1 + vatRate)) * 100) / 100;
  }

  // Calcul montant TVA
  static calculateVATAmount(priceTTC: number, vatRate: number): number {
    const priceHT = this.calculatePriceExclVAT(priceTTC, vatRate);
    return Math.round((priceTTC - priceHT) * 100) / 100;
  }

  // Calcul prix TTC depuis HT
  static calculatePriceInclVAT(priceHT: number, vatRate: number): number {
    return Math.round((priceHT * (1 + vatRate)) * 100) / 100;
  }

  // Grouper les items par taux de TVA
  static groupItemsByVATRate(items: OrderItem[]): Map<number, OrderItem[]> {
    const grouped = new Map<number, OrderItem[]>();
    
    items.forEach(item => {
      const rate = item.vat_rate || 0.10;
      if (!grouped.has(rate)) {
        grouped.set(rate, []);
      }
      grouped.get(rate)!.push(item);
    });
    
    return grouped;
  }

  // Calculer le récapitulatif TVA pour une commande
  static calculateVATSummary(items: OrderItem[]): VATBreakdown {
    const grouped = this.groupItemsByVATRate(items);
    const summary: VATBreakdown = {};
    
    grouped.forEach((groupItems, rate) => {
      const rateKey = `${(rate * 100).toFixed(1)}`;
      let totalHT = 0;
      let totalTVA = 0;
      let totalTTC = 0;
      
      groupItems.forEach(item => {
        const priceTTC = Number(item.total_price) || 0;
        const priceHT = this.calculatePriceExclVAT(priceTTC, rate);
        const tva = this.calculateVATAmount(priceTTC, rate);
        
        totalHT += priceHT;
        totalTVA += tva;
        totalTTC += priceTTC;
      });
      
      summary[rateKey] = {
        ht: Math.round(totalHT * 100) / 100,
        tva: Math.round(totalTVA * 100) / 100,
        ttc: Math.round(totalTTC * 100) / 100
      };
    });
    
    return summary;
  }
}