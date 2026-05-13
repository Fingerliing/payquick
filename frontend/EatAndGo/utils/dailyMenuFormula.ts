/**
 * Helpers de validation de la formule "menu du jour".
 *
 * Règle métier (option A) :
 * - Si le panier contient AU MOINS un plat appartenant au menu du jour, alors
 *   le client DOIT avoir choisi exactement un plat par catégorie distincte du
 *   menu du jour pour pouvoir passer commande. Sinon il pourrait obtenir un
 *   plat à la carte moins cher en ne prenant qu'une partie de la formule.
 * - Les plats hors menu du jour (à la carte) restent libres : on peut commander
 *   la formule complète + des extras à la carte.
 * - Si le panier ne contient AUCUN plat de la formule, la règle ne s'applique
 *   pas : le client est en mode "à la carte" classique.
 */

import type { PublicDailyMenu, DailyMenu } from '@/services/dailyMenuService';

/** Forme minimale d'un menu du jour utile à la validation formule. */
export type FormulaSource = Pick<
  Partial<PublicDailyMenu & DailyMenu>,
  'items_by_category' | 'is_formula' | 'categories_count' | 'special_price'
>;

/** Forme minimale d'un item de panier utile à la validation. */
export interface FormulaCartLine {
  /** ID entier du MenuItem (FK). */
  menuItemId: number;
  /** Quantité dans le panier. */
  quantity: number;
}

export interface FormulaStatus {
  /** True si le menu du jour est en mode formule (special_price + catégories). */
  isFormula: boolean;
  /** Nombre de catégories distinctes du menu du jour. */
  totalCategories: number;
  /** Nombre de catégories distinctes pour lesquelles au moins 1 plat est dans le panier. */
  pickedCategories: number;
  /** Noms des catégories pour lesquelles aucun plat n'est sélectionné. */
  missingCategoryNames: string[];
  /** True si au moins un plat de la formule est dans le panier. */
  hasFormulaItemsInCart: boolean;
  /** True si la formule est complète OU si elle n'a pas été commencée. */
  isValid: boolean;
  /** True si une catégorie contient plus d'un plat (devrait être impossible avec le swap). */
  hasDuplicateCategoryPicks: boolean;
}

/**
 * Calcule l'état de validation de la formule menu du jour à partir du menu
 * public et du contenu du panier.
 *
 * @param dailyMenu Menu du jour (public ou détail) du restaurant
 * @param cartLines Lignes du panier réduites à { menuItemId, quantity }
 */
export function computeFormulaStatus(
  dailyMenu: FormulaSource | null | undefined,
  cartLines: FormulaCartLine[],
): FormulaStatus {
  const empty: FormulaStatus = {
    isFormula: false,
    totalCategories: 0,
    pickedCategories: 0,
    missingCategoryNames: [],
    hasFormulaItemsInCart: false,
    isValid: true,
    hasDuplicateCategoryPicks: false,
  };

  if (!dailyMenu || !dailyMenu.items_by_category?.length) return empty;

  const cats = dailyMenu.items_by_category;
  const isFormula = dailyMenu.is_formula === true
    || (typeof dailyMenu.special_price === 'number' && dailyMenu.special_price > 0 && cats.length > 0);

  if (!isFormula) return empty;

  // Pour chaque MenuItem.id de la formule, retenir le nom + l'identifiant de catégorie.
  const menuItemIdToCategory = new Map<number, { catKey: string; catName: string }>();
  const categoryOrder: Array<{ key: string; name: string }> = [];
  const seenCatKeys = new Set<string>();

  for (const cat of cats) {
    const catKey = String((cat as any).category_id ?? cat.name);
    if (!seenCatKeys.has(catKey)) {
      seenCatKeys.add(catKey);
      categoryOrder.push({ key: catKey, name: cat.name });
    }
    for (const it of cat.items ?? []) {
      const menuItemId = Number((it as any).menu_item ?? (it as any).id);
      if (Number.isFinite(menuItemId)) {
        menuItemIdToCategory.set(menuItemId, { catKey, catName: cat.name });
      }
    }
  }

  const totalCategories = categoryOrder.length;

  // Compter combien de plats du panier appartiennent à chaque catégorie de la formule.
  const picksByCategory = new Map<string, number>();
  let hasFormulaItemsInCart = false;

  for (const line of cartLines) {
    const cat = menuItemIdToCategory.get(line.menuItemId);
    if (!cat) continue;
    hasFormulaItemsInCart = true;
    picksByCategory.set(cat.catKey, (picksByCategory.get(cat.catKey) ?? 0) + line.quantity);
  }

  const pickedCategories = picksByCategory.size;
  const missingCategoryNames = categoryOrder
    .filter(c => !picksByCategory.has(c.key))
    .map(c => c.name);
  const hasDuplicateCategoryPicks = Array.from(picksByCategory.values()).some(q => q > 1);

  const isValid = !hasFormulaItemsInCart || (
    pickedCategories === totalCategories && !hasDuplicateCategoryPicks
  );

  return {
    isFormula: true,
    totalCategories,
    pickedCategories,
    missingCategoryNames,
    hasFormulaItemsInCart,
    isValid,
    hasDuplicateCategoryPicks,
  };
}

/**
 * Formate un message court à afficher dans un toast/badge pour expliquer ce
 * qu'il manque pour compléter la formule.
 */
export function formatFormulaMissingMessage(status: FormulaStatus): string | null {
  if (status.isValid) return null;
  if (status.hasDuplicateCategoryPicks) {
    return 'Vous avez choisi plusieurs plats dans une même catégorie de la formule.';
  }
  if (status.missingCategoryNames.length === 0) return null;
  if (status.missingCategoryNames.length === 1) {
    return `Il manque un plat dans : ${status.missingCategoryNames[0]}.`;
  }
  return `Il manque un plat dans : ${status.missingCategoryNames.join(', ')}.`;
}
