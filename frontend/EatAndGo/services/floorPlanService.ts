import { apiClient } from './api';
import {
  BulkSetupGroup,
  FloorPlanResponse,
  LayoutItem,
  OccupyTablePayload,
} from '../types/reservation';

export class FloorPlanService {
  /** Plan de salle avec statuts temps réel */
  async getFloorPlan(restaurantId: number): Promise<FloorPlanResponse> {
    return apiClient.get(`/floor-plan/?restaurant_id=${restaurantId}`);
  }

  /** Création en masse : [{capacity: 2, count: 6}, {capacity: 4, count: 4}] */
  async bulkSetup(
    restaurantId: number,
    groups: BulkSetupGroup[],
  ): Promise<{ created: Array<{ id: string; number: string; capacity: number }>; count: number }> {
    return apiClient.post('/floor-plan/bulk_setup/', {
      restaurant_id: restaurantId,
      groups,
    });
  }

  /** Sauvegarder les positions (coordonnées relatives 0..1) */
  async saveLayout(
    restaurantId: number,
    layout: LayoutItem[],
  ): Promise<{ updated: number }> {
    return apiClient.post('/floor-plan/layout/', {
      restaurant_id: restaurantId,
      layout,
    });
  }

  /**
   * Marquer une table occupée (walk-in) ou bloquée.
   * ⚠️ Peut renvoyer un 409 OccupyConflictResponse si une réservation
   * démarre pendant l'occupation prévue → afficher le warning + les
   * alternatives, puis rappeler avec force=true si le staff insiste.
   */
  async occupy(payload: OccupyTablePayload): Promise<{
    success: boolean;
    occupancy_id: string;
    expected_end_at: string;
    warning_overridden: boolean;
  }> {
    return apiClient.post('/floor-plan/occupy/', payload);
  }

  /** Libérer une table */
  async release(tableId: string): Promise<{ success: boolean; released: number }> {
    return apiClient.post('/floor-plan/release/', { table_id: tableId });
  }

  /** Prolonger une occupation (défaut +30 min) */
  async extend(
    tableId: string,
    minutes = 30,
  ): Promise<{ success: boolean; expected_end_at: string }> {
    return apiClient.post('/floor-plan/extend/', {
      table_id: tableId,
      minutes,
    });
  }
}

export const floorPlanService = new FloorPlanService();
