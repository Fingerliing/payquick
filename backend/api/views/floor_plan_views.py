"""
Plan de salle restaurateur.

Endpoints (router: r'floor-plan') :
  GET  /floor-plan/?restaurant_id=          → tables + statut temps réel
  POST /floor-plan/bulk_setup/              → "6 tables de 2, 4 tables de 4..."
  POST /floor-plan/layout/                  → positions des tables sur le plan
  POST /floor-plan/occupy/                  → marquer une table occupée (walk-in)
  POST /floor-plan/release/                 → libérer une table
  POST /floor-plan/extend/                  → prolonger une occupation

Statuts retournés (priorité décroissante) :
  blocked > seated > occupied > reserved_soon > free
"""
import logging
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import Order, Reservation, Restaurant, Table
from api.models.table_occupancy_models import (
    DEFAULT_OCCUPANCY_MINUTES,
    TableOccupancy,
)
from api.utils.floorplan_notifications import notify_floorplan_update

logger = logging.getLogger(__name__)

# Fenêtre d'affichage "réservée bientôt" sur le plan
RESERVED_SOON_MINUTES = 90


def _get_owned_restaurant(request, restaurant_id):
    """Restaurant appartenant au restaurateur connecté, ou None."""
    if not restaurant_id:
        return None
    try:
        restaurant = Restaurant.objects.get(id=restaurant_id)
    except Restaurant.DoesNotExist:
        return None
    user = request.user
    if (
        hasattr(user, 'restaurateur_profile')
        and restaurant.owner == user.restaurateur_profile
    ):
        return restaurant
    return None


class FloorPlanViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    # ══════════════════════════════════════════════════════════════════
    # Plan de salle temps réel
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Plan de salle avec statuts temps réel",
        description=(
            "Fusionne réservations, occupations walk-in et commandes actives "
            "pour donner le statut de chaque table. Prévu pour polling 15s "
            "ou push WebSocket."
        ),
    )
    def list(self, request):
        restaurant = _get_owned_restaurant(
            request, request.query_params.get('restaurant_id')
        )
        if restaurant is None:
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )

        now = timezone.now()
        soon = now + timedelta(minutes=RESERVED_SOON_MINUTES)
        tables = list(
            Table.objects.filter(restaurant=restaurant, is_active=True)
            .order_by('number')
        )
        table_ids = [t.id for t in tables]

        # ── 1. Réservations du moment + à venir (fenêtre "soon") ─────────
        reservations = Reservation.objects.filter(
            table_id__in=table_ids,
            status__in=('confirmed', 'seated'),
            starts_at__lt=soon,
            ends_at__gt=now,
        ).select_related('pre_order')
        res_by_table = {}
        for r in reservations:
            res_by_table.setdefault(r.table_id, []).append(r)

        # ── 2. Occupations actives (manuel + blocages) ───────────────────
        occupancies = TableOccupancy.objects.active().filter(
            table_id__in=table_ids
        )
        occ_by_table = {o.table_id: o for o in occupancies}

        # ── 3. Commandes actives par table_number (walk-ins avec app) ────
        active_orders = (
            Order.objects.filter(
                restaurant=restaurant,
                status__in=['pending', 'confirmed', 'preparing', 'ready'],
                table_number__isnull=False,
            )
            .exclude(table_number='')
            .values('table_number')
            .distinct()
        )
        tables_with_orders = {o['table_number'] for o in active_orders}

        # ── Fusion ────────────────────────────────────────────────────────
        payload = []
        for table in tables:
            occ = occ_by_table.get(table.id)
            table_res = sorted(
                res_by_table.get(table.id, []), key=lambda r: r.starts_at
            )
            seated_res = next(
                (r for r in table_res
                 if r.status == 'seated' and r.starts_at <= now < r.ends_at),
                None,
            )
            next_res = next(
                (r for r in table_res if r.starts_at > now), None
            )
            has_app_orders = table.number in tables_with_orders

            if occ and occ.source == 'blocked':
                table_status = 'blocked'
            elif seated_res:
                table_status = 'seated'
            elif occ or has_app_orders:
                table_status = 'occupied'
            elif next_res:
                table_status = 'reserved_soon'
            else:
                table_status = 'free'

            payload.append({
                'id': str(table.id),
                'number': table.number,
                'capacity': table.capacity,
                'zone': getattr(table, 'zone', '') or '',
                'pos_x': getattr(table, 'pos_x', None),
                'pos_y': getattr(table, 'pos_y', None),
                'shape': getattr(table, 'shape', 'square'),
                'status': table_status,
                'has_app_orders': has_app_orders,
                'occupancy': {
                    'id': str(occ.id),
                    'source': occ.source,
                    'party_size': occ.party_size,
                    'started_at': occ.started_at,
                    'expected_end_at': occ.expected_end_at,
                    'is_overdue': occ.is_overdue,
                    'notes': occ.notes,
                } if occ else None,
                'current_reservation': {
                    'id': str(seated_res.id),
                    'customer_name': seated_res.customer_name,
                    'party_size': seated_res.party_size,
                    'ends_at': seated_res.ends_at,
                    'has_paid_pre_order': seated_res.has_paid_pre_order,
                } if seated_res else None,
                'next_reservation': {
                    'id': str(next_res.id),
                    'customer_name': next_res.customer_name,
                    'party_size': next_res.party_size,
                    'starts_at': next_res.starts_at,
                    'time': timezone.localtime(next_res.starts_at).strftime('%H:%M'),
                    'has_paid_pre_order': next_res.has_paid_pre_order,
                } if next_res else None,
            })

        counts = {}
        for t in payload:
            counts[t['status']] = counts.get(t['status'], 0) + 1

        return Response({
            'restaurant_id': str(restaurant.id),
            'timestamp': now.isoformat(),
            'tables': payload,
            'summary': counts,
        })

    # ══════════════════════════════════════════════════════════════════
    # Setup inventaire : "6 tables de 2, 4 tables de 4"
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Création en masse de tables",
        description=(
            "Body: {restaurant_id, groups: [{capacity: 2, count: 6}, "
            "{capacity: 4, count: 4}]}. Numérotation auto à la suite de "
            "l'existant, QR codes générés par Table.save()."
        ),
    )
    @action(detail=False, methods=['post'])
    def bulk_setup(self, request):
        restaurant = _get_owned_restaurant(
            request, request.data.get('restaurant_id')
        )
        if restaurant is None:
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )

        groups = request.data.get('groups', [])
        if not groups or not isinstance(groups, list):
            return Response(
                {'error': 'groups est requis: [{capacity, count}, ...]'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        total = sum(int(g.get('count', 0)) for g in groups)
        if not (1 <= total <= 100):
            return Response(
                {'error': 'Entre 1 et 100 tables par opération.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Prochain numéro libre (numéros numériques uniquement)
        existing = Table.objects.filter(restaurant=restaurant).values_list(
            'number', flat=True
        )
        numeric = [int(n) for n in existing if str(n).isdigit()]
        next_number = (max(numeric) + 1) if numeric else 1

        created = []
        with transaction.atomic():
            for group in groups:
                capacity = int(group.get('capacity', 2))
                count = int(group.get('count', 0))
                if not (1 <= capacity <= 30):
                    return Response(
                        {'error': f'Capacité invalide: {capacity}'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                for _ in range(count):
                    table = Table.objects.create(
                        restaurant=restaurant,
                        number=str(next_number),
                        capacity=capacity,
                    )
                    created.append({
                        'id': str(table.id),
                        'number': table.number,
                        'capacity': table.capacity,
                    })
                    next_number += 1

        return Response(
            {'created': created, 'count': len(created)},
            status=status.HTTP_201_CREATED,
        )

    # ══════════════════════════════════════════════════════════════════
    # Layout : positions sur le plan
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Sauvegarder le plan de salle",
        description=(
            "Body: {restaurant_id, layout: [{table_id, pos_x, pos_y, shape?, "
            "zone?}]}. Coordonnées relatives 0..1 (responsive)."
        ),
    )
    @action(detail=False, methods=['post'])
    def layout(self, request):
        restaurant = _get_owned_restaurant(
            request, request.data.get('restaurant_id')
        )
        if restaurant is None:
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )

        layout_data = request.data.get('layout', [])
        updated = 0
        with transaction.atomic():
            for item in layout_data:
                fields = {}
                for key in ('pos_x', 'pos_y'):
                    if key in item:
                        value = float(item[key])
                        if not (0 <= value <= 1):
                            return Response(
                                {'error': f'{key} doit être entre 0 et 1'},
                                status=status.HTTP_400_BAD_REQUEST,
                            )
                        fields[key] = value
                if 'shape' in item:
                    fields['shape'] = item['shape']
                if 'zone' in item:
                    fields['zone'] = item['zone'][:50]
                if fields:
                    updated += Table.objects.filter(
                        id=item.get('table_id'), restaurant=restaurant
                    ).update(**fields)

        if updated:
            notify_floorplan_update(restaurant.id, event='layout_changed')

        return Response({'updated': updated})

    # ══════════════════════════════════════════════════════════════════
    # Occupation manuelle (walk-ins)
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Marquer une table occupée (walk-in)",
        description=(
            "Body: {table_id, party_size?, duration_minutes?, blocked?, notes?}. "
            "Si une réservation confirmée démarre pendant l'occupation prévue, "
            "retourne un warning avec les tables libres compatibles "
            "(passer force=true pour outrepasser)."
        ),
    )
    @action(detail=False, methods=['post'])
    def occupy(self, request):
        table_id = request.data.get('table_id')
        try:
            table = Table.objects.select_related('restaurant').get(id=table_id)
        except (Table.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'Table introuvable'}, status=status.HTTP_404_NOT_FOUND
            )

        restaurant = _get_owned_restaurant(request, table.restaurant_id)
        if restaurant is None:
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )

        if TableOccupancy.objects.active().filter(table=table).exists():
            return Response(
                {'error': 'already_occupied',
                 'message': 'Cette table est déjà marquée occupée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        duration = int(request.data.get(
            'duration_minutes', DEFAULT_OCCUPANCY_MINUTES
        ))
        duration = max(15, min(duration, 360))
        now = timezone.now()
        expected_end = now + timedelta(minutes=duration)
        is_blocked = bool(request.data.get('blocked', False))

        # ── Protection des réservations ───────────────────────────────────
        conflicting = Reservation.objects.filter(
            table=table,
            status__in=Reservation.BLOCKING_STATUSES,
            starts_at__lt=expected_end,
            ends_at__gt=now,
        ).order_by('starts_at').first()

        if conflicting and not request.data.get('force'):
            # Suggérer des tables libres de capacité suffisante
            party_size = int(request.data.get('party_size', 2))
            free_ids = self._free_table_ids(
                restaurant, party_size, now, expected_end, exclude=table.id
            )
            alternatives = list(
                Table.objects.filter(id__in=free_ids)
                .order_by('capacity', 'number')
                .values('id', 'number', 'capacity')[:5]
            )
            return Response({
                'error': 'reservation_conflict',
                'message': (
                    f"La table {table.number} est réservée à "
                    f"{timezone.localtime(conflicting.starts_at):%H:%M} "
                    f"({conflicting.customer_name}, {conflicting.party_size} pers.)."
                ),
                'reservation': {
                    'id': str(conflicting.id),
                    'starts_at': conflicting.starts_at,
                    'customer_name': conflicting.customer_name,
                    'party_size': conflicting.party_size,
                },
                'alternatives': alternatives,
                'hint': "Renvoyer force=true pour occuper malgré tout.",
            }, status=status.HTTP_409_CONFLICT)

        occupancy = TableOccupancy.objects.create(
            restaurant=restaurant,
            table=table,
            source='blocked' if is_blocked else 'manual',
            party_size=int(request.data.get('party_size', 2)),
            started_at=now,
            expected_end_at=expected_end,
            created_by=request.user,
            notes=str(request.data.get('notes', ''))[:200],
        )

        notify_floorplan_update(
            restaurant.id, event='table_occupied', table_id=table.id
        )

        return Response({
            'success': True,
            'occupancy_id': str(occupancy.id),
            'expected_end_at': occupancy.expected_end_at,
            'warning_overridden': bool(conflicting),
        }, status=status.HTTP_201_CREATED)

    @extend_schema(summary="Libérer une table", description="Body: {table_id}")
    @action(detail=False, methods=['post'])
    def release(self, request):
        table_id = request.data.get('table_id')
        try:
            table = Table.objects.select_related('restaurant').get(id=table_id)
        except (Table.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'Table introuvable'}, status=status.HTTP_404_NOT_FOUND
            )
        if _get_owned_restaurant(request, table.restaurant_id) is None:
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )

        released = 0
        for occ in TableOccupancy.objects.active().filter(table=table):
            occ.release()
            released += 1

        if released:
            notify_floorplan_update(
                table.restaurant_id, event='table_released', table_id=table.id
            )

        return Response({'success': True, 'released': released})

    @extend_schema(
        summary="Prolonger une occupation",
        description="Body: {table_id, minutes? (défaut 30)}",
    )
    @action(detail=False, methods=['post'])
    def extend(self, request):
        table_id = request.data.get('table_id')
        try:
            table = Table.objects.select_related('restaurant').get(id=table_id)
        except (Table.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'Table introuvable'}, status=status.HTTP_404_NOT_FOUND
            )
        if _get_owned_restaurant(request, table.restaurant_id) is None:
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )

        occ = TableOccupancy.objects.active().filter(table=table).first()
        if not occ:
            return Response(
                {'error': 'Aucune occupation active sur cette table.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        minutes = max(5, min(int(request.data.get('minutes', 30)), 240))
        occ.extend(minutes)

        notify_floorplan_update(
            table.restaurant_id, event='table_extended', table_id=table.id
        )

        return Response({
            'success': True,
            'expected_end_at': occ.expected_end_at,
        })

    # ══════════════════════════════════════════════════════════════════
    # Helpers
    # ══════════════════════════════════════════════════════════════════

    def _free_table_ids(self, restaurant, party_size, starts_at, ends_at,
                        exclude=None):
        tables = Table.objects.filter(
            restaurant=restaurant, is_active=True, capacity__gte=party_size
        )
        if exclude:
            tables = tables.exclude(id=exclude)
        table_ids = list(tables.values_list('id', flat=True))

        busy = set(
            Reservation.objects.filter(
                table_id__in=table_ids,
                status__in=Reservation.BLOCKING_STATUSES,
                starts_at__lt=ends_at,
                ends_at__gt=starts_at,
            ).values_list('table_id', flat=True)
        )
        busy |= set(
            TableOccupancy.objects.overlapping(table_ids, starts_at, ends_at)
            .values_list('table_id', flat=True)
        )
        return [tid for tid in table_ids if tid not in busy]
