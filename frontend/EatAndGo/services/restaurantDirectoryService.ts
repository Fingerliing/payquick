/**
 * Service API — Répertoire des restaurants partenaires.
 *
 * S'appuie sur l'`apiClient` axios existant (`@/services/api`) qui déballe déjà
 * le `.data`. Convention projet : on caste le résultat plutôt que de paramétrer
 * l'appel générique (cf. restaurantMenuService).
 *
 * Endpoints backend (cf. restaurant_urls.py) :
 *   GET  /api/v1/restaurants/public/               liste + filtres
 *   GET  /api/v1/restaurants/public/nearby/        autour de moi (distance_km)
 *   GET  /api/v1/restaurants/public/cuisines/      types de cuisine
 *   POST /api/v1/restaurants/enrich-siret/         enrichissement SIRET
 *   GET  /api/v1/restaurants/reviews/              avis (public, ?restaurant=<id>)
 *   GET  /api/v1/restaurants/reviews/eligibility/  éligibilité (client auth)
 *   POST /api/v1/restaurants/reviews/              déposer un avis (client auth)
 */
import { apiClient } from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface DirectoryRestaurant {
  id: string;
  name: string;
  description?: string;
  cuisine?: string;
  priceRange?: number;
  address?: string;
  city?: string;
  zipCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  rating?: number;
  reviewCount?: number;
  image_url?: string | null;
  can_receive_orders?: boolean;
  /** Présent uniquement sur l'endpoint "nearby". */
  distance_km?: number;
}

export interface NearbyResponse {
  count: number;
  radius_km: number;
  results: DirectoryRestaurant[];
}

export interface DirectoryParams {
  search?: string;
  cuisine?: string;
  city?: string;
  accepts_meal_vouchers?: boolean;
  ordering?: string;
}

export interface CuisineOption {
  value: string;
  label: string;
}

export interface SiretEnrichment {
  siret: string;
  siren: string;
  raison_sociale: string;
  enseigne: string;
  address: string;
  zip_code: string;
  city: string;
  ape_code: string;
  is_active_insee: boolean;
  is_diffusible: boolean;
  is_restauration: boolean;
  latitude: number | null;
  longitude: number | null;
  geocoding_score: number | null;
  warnings: string[];
}

export interface RestaurantReview {
  id: number;
  restaurant: string;
  client_name: string;
  rating: number;
  comment: string;
  is_verified_purchase: boolean;
  created_at: string;
}

export interface ReviewEligibility {
  has_ordered: boolean;
  already_reviewed: boolean;
  can_review: boolean;
  order_id: number | null;
}

export interface SubmitReviewPayload {
  restaurant: string | number;
  rating: number;
  comment?: string;
  order?: number;
}

// Le backend peut renvoyer un tableau brut OU une pagination DRF.
type MaybePaginated<T> = T[] | { results: T[]; count?: number };

function unwrapList<T>(res: MaybePaginated<T>): T[] {
  if (Array.isArray(res)) return res;
  return res?.results ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────
class RestaurantDirectoryService {
  /** Liste filtrable du répertoire. */
  async getDirectory(params: DirectoryParams = {}): Promise<DirectoryRestaurant[]> {
    const res = (await apiClient.get('/api/v1/restaurants/public/', { params })) as MaybePaginated<DirectoryRestaurant>;
    return unwrapList(res);
  }

  /** Restaurants partenaires autour d'un point. */
  async getNearby(
    latitude: number,
    longitude: number,
    radiusKm = 10,
    cuisine?: string,
    limit = 100
  ): Promise<NearbyResponse> {
    return apiClient.get('/api/v1/restaurants/public/nearby/', {
      params: {
        lat: latitude,
        lng: longitude,
        radius: radiusKm,
        limit,
        ...(cuisine ? { cuisine } : {}),
      },
    });
  }

  /** Types de cuisine disponibles (pour les filtres). */
  async getCuisines(): Promise<CuisineOption[]> {
    const res = (await apiClient.get('/api/v1/restaurants/public/cuisines/')) as CuisineOption[];
    return Array.isArray(res) ? res : [];
  }

  /** Villes ayant au moins un restaurant actif. */
  async getCities(): Promise<string[]> {
    const res = (await apiClient.get('/api/v1/restaurants/public/cities/')) as string[];
    return Array.isArray(res) ? res : [];
  }

  /** Enrichissement SIRET (onboarding restaurateur). */
  async enrichSiret(siret: string): Promise<SiretEnrichment> {
    return apiClient.post('/api/v1/restaurants/enrich-siret/', { siret });
  }

  /** Avis d'un restaurant. */
  async getReviews(restaurantId: string | number): Promise<RestaurantReview[]> {
    const res = (await apiClient.get('/api/v1/restaurants/reviews/', {
      params: { restaurant: restaurantId },
    })) as MaybePaginated<RestaurantReview>;
    return unwrapList(res);
  }

  /**
   * Éligibilité du client courant à laisser un avis sur un restaurant.
   * Nécessite un client authentifié ; renvoie `can_review=false` sinon.
   */
  async getReviewEligibility(restaurantId: string | number): Promise<ReviewEligibility> {
    return apiClient.get('/api/v1/restaurants/reviews/eligibility/', {
      params: { restaurant: restaurantId },
    });
  }

  /** Déposer un avis (client authentifié ayant commandé). */
  async submitReview(payload: SubmitReviewPayload): Promise<RestaurantReview> {
    return apiClient.post('/api/v1/restaurants/reviews/', payload);
  }

  // ── Modération (restaurateur propriétaire / staff) ─────────────────────────

  /** Tous les avis d'un restaurant, y compris masqués (pour modération). */
  async getModerationReviews(
    restaurantId: string | number
  ): Promise<{ count: number; results: (RestaurantReview & { is_visible: boolean })[] }> {
    return apiClient.get('/api/v1/restaurants/reviews/moderation/', {
      params: { restaurant: restaurantId },
    });
  }

  /** Masquer un avis abusif. */
  async hideReview(reviewId: number): Promise<{ id: number; is_visible: boolean }> {
    return apiClient.post(`/api/v1/restaurants/reviews/${reviewId}/hide/`, {});
  }

  /** Réafficher un avis masqué. */
  async unhideReview(reviewId: number): Promise<{ id: number; is_visible: boolean }> {
    return apiClient.post(`/api/v1/restaurants/reviews/${reviewId}/unhide/`, {});
  }
}

export const restaurantDirectoryService = new RestaurantDirectoryService();
export default restaurantDirectoryService;