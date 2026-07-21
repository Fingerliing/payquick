import { apiClient } from './api';
import {
  AvailabilityResponse,
  CancelReservationResponse,
  CheckInResponse,
  CreateReservationPayload,
  PreOrderPayload,
  PreOrderResponse,
  Reservation,
  ReservationHistoryResponse,
} from '../types/reservation';

export class ReservationService {
  /** Créneaux disponibles pour une date et un nombre de couverts (public) */
  async getAvailability(
    restaurantId: number,
    date: string, // YYYY-MM-DD
    partySize: number,
  ): Promise<AvailabilityResponse> {
    return apiClient.get(`/api/v1/reservations/availability/?restaurant_id=${restaurantId}&date=${date}&party_size=${partySize}`,
    );
  }

  /** Créer une réservation (table assignée automatiquement) */
  async create(payload: CreateReservationPayload): Promise<Reservation> {
    return apiClient.post('/api/v1/reservations/', payload);
  }

  /** Pré-commande avec paiement 100% obligatoire → PaymentIntent */
  async createPreOrder(
    reservationId: string,
    payload: PreOrderPayload,
  ): Promise<PreOrderResponse> {
    return apiClient.post(`/api/v1/reservations/${reservationId}/pre_order/`, payload);
  }

  /** Annulation (remboursement intégral si avant la deadline) */
  async cancel(reservationId: string): Promise<CancelReservationResponse> {
    return apiClient.post(`/api/v1/reservations/${reservationId}/cancel/`);
  }

  /** Check-in à l'arrivée — qrCode optionnel pour vérifier la bonne table */
  async checkIn(
    reservationId: string,
    qrCode?: string,
  ): Promise<CheckInResponse> {
    return apiClient.post(`/api/v1/reservations/${reservationId}/check_in/`,
      qrCode ? { qr_code: qrCode } : {},
    );
  }

  /** Mes réservations (client connecté) */
  async getMine(): Promise<Reservation[]> {
    return apiClient.get('/api/v1/reservations/mine/');
  }

  /** Planning restaurateur pour une date */
  async getPlanning(
    restaurantId: number,
    date: string, // YYYY-MM-DD
  ): Promise<Reservation[]> {
    return apiClient.get(`/api/v1/reservations/planning/?restaurant_id=${restaurantId}&date=${date}`,
    );
  }

  /**
   * Changer le statut d'une réservation (restaurateur).
   * status: 'seated' | 'completed' | 'no_show' | 'confirmed'
   */
  async setStatus(
    reservationId: string,
    status: 'seated' | 'completed' | 'no_show' | 'confirmed',
  ): Promise<Reservation> {
    return apiClient.post(
      `/api/v1/reservations/${reservationId}/set_status/`,
      { status },
    );
  }

  /**
   * Historique / réservations à venir (restaurateur).
   * period: 'upcoming' (à venir) | 'past' (passées) | 'all'
   */
  async getHistory(
    restaurantId: number,
    options: {
      period?: 'upcoming' | 'past' | 'all';
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ReservationHistoryResponse> {
    const params = new URLSearchParams({
      restaurant_id: String(restaurantId),
      period: options.period ?? 'upcoming',
      limit: String(options.limit ?? 30),
      offset: String(options.offset ?? 0),
    });
    if (options.status) params.append('status', options.status);
    if (options.search) params.append('search', options.search);
    return apiClient.get(`/api/v1/reservations/history/?${params.toString()}`);
  }

  /**
   * Réservation active du client sur une table donnée (pour l'interception
   * du scan QR) : cherche dans /mine/ une résa confirmed sur cette table
   * dans la fenêtre de check-in (±30 min).
   */
  async findCheckableReservation(
    tableNumber: string,
    restaurantId: number,
  ): Promise<Reservation | null> {
    try {
      const mine = await this.getMine();
      const now = Date.now();
      const THIRTY_MIN = 30 * 60 * 1000;
      return (
        mine.find(
          (r) =>
            r.status === 'confirmed' &&
            r.restaurant === restaurantId &&
            r.table_number === tableNumber &&
            Math.abs(new Date(r.starts_at).getTime() - now) <= THIRTY_MIN,
        ) ?? null
      );
    } catch {
      // Invité non connecté (401) ou erreur réseau → flux classique
      return null;
    }
  }
}

export const reservationService = new ReservationService();