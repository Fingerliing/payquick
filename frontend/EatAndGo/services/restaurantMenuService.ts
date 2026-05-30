/**
 * Service API — Menu public d'un restaurant (côté client/diner).
 *
 * Emplacement : frontend/EatAndGo/services/restaurantMenuService.ts
 *
 * Ce service NE redéfinit PAS de routes : il s'appuie sur les services
 * existants du projet —
 *   - menuService.getPublicMenusByRestaurant()  -> /api/v1/menus/public/<id>/menus/
 *   - categoryService.getCategoriesByRestaurant() -> /api/v1/menu/categories/restaurant/<id>/
 * et n'ajoute qu'un appel direct : la charte graphique
 *   - /api/v1/restaurants/<id>/branding/   (endpoint introduit par la feature IA)
 *
 * Le paramètre `?lang=` est propagé via un appel direct aux menus publics
 * (les services existants ne l'exposent pas) pour récupérer les
 * `display_name` / `display_description` déjà résolus côté backend.
 *
 * `apiClient.get` est générique (`get<T>`) mais renvoie `T = any` par
 * défaut ; on caste explicitement le résultat plutôt que de paramétrer
 * l'appel, par cohérence avec les autres services du projet.
 */
import { apiClient } from '@/services/api';
import { categoryService } from '@/services/categoryService';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface ApiRestaurant {
  id: string;
  name: string;
  description?: string;
  cuisine?: string;
}

export interface ApiMenuCategory {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  order?: number;
  display_name?: string;
  translations?: Record<string, Record<string, string>>;
}

export interface ApiMenuSubCategory {
  id: string;
  name: string;
  category: string;
  order?: number;
  display_name?: string;
  translations?: Record<string, Record<string, string>>;
}

export interface ApiMenuItem {
  id: string;
  name: string;
  description: string;
  /** Nom résolu dans la langue demandée (repli français). */
  display_name?: string;
  /** Description résolue dans la langue demandée (repli français). */
  display_description?: string;
  /** Langues réellement disponibles pour ce plat. */
  available_languages?: string[];
  price: number | string;
  image_url?: string | null;
  category: string;
  category_name?: string;
  category_icon?: string;
  /** Ordre de la categorie tel que defini cote restaurateur. */
  category_order?: number;
  subcategory?: string | null;
  subcategory_name?: string | null;
  /** Ordre de la sous-categorie tel que defini cote restaurateur. */
  subcategory_order?: number;
  allergens?: string[];
  is_vegetarian?: boolean;
  is_vegan?: boolean;
  is_gluten_free?: boolean;
  preparation_time?: number;
  is_available?: boolean;
}

/** Charte graphique d'un restaurant (cf. RestaurantBranding backend). */
export interface ApiRestaurantBranding {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  style_descriptor?: string;
}

export interface RestaurantMenuBundle {
  restaurant: ApiRestaurant;
  categories: ApiMenuCategory[];
  subcategories: ApiMenuSubCategory[];
  items: ApiMenuItem[];
  branding: ApiRestaurantBranding | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Extrait un tableau d'une réponse, qu'elle soit paginée, nue ou objet unique. */
function asList<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (data && typeof data === 'object') return [data as T];
  return [];
}

export const restaurantMenuService = {
  /**
   * Charge tout le nécessaire pour l'écran menu client.
   *
   * @param restaurantId  Identifiant du restaurant.
   * @param lang          Code langue d'affichage ('' ou 'fr' = français).
   */
  async getMenuBundle(
    restaurantId: string,
    lang: string = '',
  ): Promise<RestaurantMenuBundle> {
    const langQuery = lang && lang !== 'fr' ? { lang } : undefined;

    // Trois sources, en parallèle :
    //  1. Menus publics du restaurant (contiennent les `items`), avec ?lang=
    //  2. Catégories du restaurant (sous-catégories nichées)
    //  3. Charte graphique — optionnelle (404 -> thème par défaut)
    const [menusRaw, categoriesRaw, brandingRaw] = await Promise.all([
      apiClient.get(`/api/v1/menus/public/${restaurantId}/menus/`, {
        params: langQuery,
      }),
      categoryService
        .getCategoriesByRestaurant(restaurantId)
        .catch(() => null),
      apiClient
        .get(`/api/v1/restaurants/${restaurantId}/branding/`)
        .catch(() => null),
    ]);

    // ── Menus -> items agrégés ──────────────────────────────────────────────
    const menus = asList<any>(menusRaw);
    const items: ApiMenuItem[] = menus.flatMap((menu) =>
      asList<ApiMenuItem>(menu?.items),
    );

    // ── Restaurant : infos portées par le premier menu ─────────────────────
    const firstMenu: any = menus[0] || {};
    const restaurant: ApiRestaurant = {
      id: String(restaurantId),
      name: firstMenu.restaurant_name || 'Restaurant',
      description: firstMenu.restaurant_description,
      cuisine: firstMenu.restaurant_cuisine,
    };

    // ── Catégories + sous-catégories ───────────────────────────────────────
    // getCategoriesByRestaurant renvoie les catégories avec leurs
    // `subcategories` nichées (cf. MenuCategorySerializer). On aplatit.
    const categories: ApiMenuCategory[] = [];
    const subcategories: ApiMenuSubCategory[] = [];

    const rawCategories = asList<any>(categoriesRaw);
    if (rawCategories.length > 0) {
      rawCategories.forEach((cat: any, index: number) => {
        categories.push({
          id: String(cat.id),
          name: cat.name,
          display_name: cat.display_name,
          icon: cat.icon,
          color: cat.color,
          order: cat.order ?? index + 1,
          translations: cat.translations,
        });
        asList<any>(cat.subcategories).forEach((sub: any, subIndex: number) => {
          subcategories.push({
            id: String(sub.id),
            name: sub.name,
            display_name: sub.display_name,
            category: String(cat.id),
            order: sub.order ?? subIndex + 1,
            translations: sub.translations,
          });
        });
      });
    } else {
      // Repli : reconstruit les catégories depuis les items si l'appel
      // catégories a échoué ou n'a rien renvoyé.
      const catMap = new Map<string, ApiMenuCategory>();
      const subMap = new Map<string, ApiMenuSubCategory>();
      items.forEach((it, index) => {
        if (it.category && !catMap.has(it.category)) {
          catMap.set(it.category, {
            id: it.category,
            name: it.category_name || 'Catégorie',
            icon: it.category_icon,
            // Privilegie l'ordre defini cote restaurateur (expose par
            // MenuItemSerializer). Fallback : position de decouverte.
            order: it.category_order ?? index + 1,
          });
        }
        if (it.subcategory && !subMap.has(it.subcategory)) {
          subMap.set(it.subcategory, {
            id: it.subcategory,
            name: it.subcategory_name || 'Sous-catégorie',
            category: it.category,
            order: it.subcategory_order ?? index + 1,
          });
        }
      });
      categories.push(...catMap.values());
      subcategories.push(...subMap.values());
    }

    return {
      restaurant,
      categories,
      subcategories,
      items,
      branding: (brandingRaw as ApiRestaurantBranding) ?? null,
    };
  },
};

export default restaurantMenuService;