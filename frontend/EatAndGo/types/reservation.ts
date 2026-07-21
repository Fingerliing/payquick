/**
 * Types du système de réservation et du plan de salle.
 * Miroir des serializers backend (reservation_serializers.py, floor_plan_views.py).
 */

// ─── Réservations ────────────────────────────────────────────────────────

export type ReservationStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'expired';

export interface Reservation {
  id: string;
  restaurant: number;
  restaurant_name: string;
  table_number: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  starts_at: string; // ISO
  ends_at: string; // ISO
  duration_minutes: number;
  party_size: number;
  status: ReservationStatus;
  special_requests: string;
  pre_order_id: string | null;
  pre_order_total: string | null; // Decimal sérialisé
  is_refundable: boolean;
  free_cancellation_deadline: string | null; // ISO
  checked_in_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface AvailabilitySlot {
  starts_at: string; // ISO
  time: string; // "HH:MM" locale restaurant
  available_tables: number;
}

export interface AvailabilityResponse {
  date: string; // YYYY-MM-DD
  party_size: number;
  duration_minutes: number;
  /** false si le restaurant a désactivé la pré-commande prépayée */
  preorders_enabled?: boolean;
  slots: AvailabilitySlot[];
  reason?: 'no_table_for_party_size';
}

export interface CreateReservationPayload {
  restaurant: number;
  starts_at: string; // ISO
  party_size: number;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  special_requests?: string;
  with_pre_order: boolean;
}

/** Items envoyés à POST /reservations/{id}/pre_order/ — même format que
 *  le flux de commande classique (OrderCreateSerializer). */
export interface PreOrderPayload {
  items: Array<{
    menu_item: number;
    quantity: number;
    special_instructions?: string;
  }>;
  formules?: Array<{
    formule: number;
    quantity: number;
    selections: Array<{ course: number; item: number }>;
  }>;
}

export interface PreOrderResponse {
  client_secret: string;
  payment_intent_id: string;
  order_id: string;
  amount: string; // Decimal sérialisé
  payment_deadline: string | null; // ISO
}

export interface CancelReservationResponse {
  success: boolean;
  refunded: boolean;
  message: string;
}

export interface CheckInResponse {
  success: boolean;
  status: ReservationStatus;
  kitchen_fired: boolean;
  table_number: string | null;
}

// ─── Plan de salle ───────────────────────────────────────────────────────

export type TableShape = 'square' | 'round' | 'rect';

export type FloorPlanTableStatus =
  | 'free'
  | 'occupied'
  | 'seated'
  | 'reserved_soon'
  | 'blocked';

export type OccupancySource = 'manual' | 'order' | 'blocked';

export interface FloorPlanOccupancy {
  id: string;
  source: OccupancySource;
  party_size: number;
  started_at: string; // ISO
  expected_end_at: string; // ISO
  is_overdue: boolean;
  notes: string;
}

export interface FloorPlanReservationSummary {
  id: string;
  customer_name: string;
  party_size: number;
  has_paid_pre_order: boolean;
  /** présent sur current_reservation */
  ends_at?: string; // ISO
  /** présents sur next_reservation */
  starts_at?: string; // ISO
  time?: string; // "HH:MM"
}

export interface FloorPlanTable {
  id: string;
  number: string;
  capacity: number;
  /** Capacité avec rallonge (table modulable) — null si non modulable */
  capacity_max: number | null;
  zone: string;
  pos_x: number | null; // 0..1, null = jamais placée
  pos_y: number | null;
  shape: TableShape;
  status: FloorPlanTableStatus;
  has_app_orders: boolean;
  occupancy: FloorPlanOccupancy | null;
  current_reservation: FloorPlanReservationSummary | null;
  next_reservation: FloorPlanReservationSummary | null;
}

export interface FloorPlanResponse {
  restaurant_id: string;
  timestamp: string; // ISO
  reservations_enabled: boolean;
  tables: FloorPlanTable[];
  summary: Partial<Record<FloorPlanTableStatus, number>>;
}

export interface BulkSetupGroup {
  capacity: number;
  count: number;
}

export interface LayoutItem {
  table_id: string;
  pos_x?: number; // 0..1
  pos_y?: number; // 0..1
  shape?: TableShape;
  zone?: string;
  capacity?: number;
  /** null = non modulable */
  capacity_max?: number | null;
}

export interface OccupyTablePayload {
  table_id: string;
  party_size?: number;
  duration_minutes?: number;
  blocked?: boolean;
  notes?: string;
  force?: boolean;
}

/** Réponse 409 de POST /floor-plan/occupy/ quand une résa arrive bientôt */
export interface OccupyConflictResponse {
  error: 'reservation_conflict';
  message: string;
  reservation: {
    id: string;
    starts_at: string;
    customer_name: string;
    party_size: number;
  };
  alternatives: Array<{ id: string; number: string; capacity: number }>;
  hint: string;
}

/** Réponse de GET /reservations/history/ (restaurateur) */
export interface ReservationHistoryResponse {
  count: number;
  limit: number;
  offset: number;
  has_more: boolean;
  stats: {
    total: number;
    covers: number;
    no_shows: number;
    cancelled: number;
    with_pre_order: number;
  };
  results: Reservation[];
}