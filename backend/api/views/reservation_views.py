"""
API Réservations.

Endpoints (router: r'reservations') :
  GET  /reservations/availability/        → créneaux disponibles (public)
  POST /reservations/                     → créer une réservation (public)
  GET  /reservations/mine/                → réservations du client connecté
  GET  /reservations/planning/            → planning restaurateur (jour)
  POST /reservations/{id}/pre_order/      → pré-commande + PaymentIntent 100%
  POST /reservations/{id}/cancel/         → annulation (+ refund si éligible)
  POST /reservations/{id}/check_in/       → arrivée client (scan QR table)
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal

import stripe
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, ScopedRateThrottle

from api.models import Order, Reservation, Restaurant, Table
from api.models.reservation_models import reservation_payment_deadline
from api.serializers.order_serializers import OrderCreateSerializer
from api.serializers.reservation_serializers import (
    AvailabilityQuerySerializer,
    ReservationCreateSerializer,
    ReservationSerializer,
)
from api.utils.commission_utils import build_stripe_payment_params
from api.utils.floorplan_notifications import notify_floorplan_update

logger = logging.getLogger(__name__)

SLOT_STEP_MINUTES = 30
DEFAULT_DURATION_MINUTES = 90


class ReservationCreateThrottle(AnonRateThrottle):
    scope = 'reservation_create'
    rate = '10/hour'


def _overlapping(table_ids, starts_at, ends_at, exclude_id=None):
    """Réservations bloquantes qui chevauchent [starts_at, ends_at)."""
    qs = Reservation.objects.filter(
        table_id__in=table_ids,
        status__in=Reservation.BLOCKING_STATUSES,
        starts_at__lt=ends_at,
        ends_at__gt=starts_at,
    )
    if exclude_id:
        qs = qs.exclude(id=exclude_id)
    return qs


def _candidate_tables(restaurant, party_size):
    """Tables pouvant accueillir party_size, rallonge comprise.

    Tri : d'abord les tables qui suffisent en config STANDARD (ne pas
    gaspiller une modulable 4→6 pour 2 couverts si une table de 2 est
    libre), puis de la plus petite à la plus grande.
    """
    from django.db.models import Case, IntegerField, Value, When
    from django.db.models.functions import Coalesce

    return (
        Table.objects
        .filter(restaurant=restaurant, is_active=True)
        .annotate(
            effective_capacity=Coalesce('capacity_max', 'capacity'),
        )
        .filter(effective_capacity__gte=party_size)
        .annotate(
            needs_extension=Case(
                When(capacity__gte=party_size, then=Value(0)),
                default=Value(1),
                output_field=IntegerField(),
            ),
        )
        .order_by('needs_extension', 'capacity', 'number')
    )


def _day_periods(restaurant, date):
    """Périodes d'ouverture (start_time, end_time) pour la date donnée.

    OpeningHours.day_of_week : 0 = dimanche (convention frontend existante).
    Python date.weekday()    : 0 = lundi → conversion.
    """
    dow = (date.weekday() + 1) % 7
    oh = restaurant.opening_hours.filter(day_of_week=dow, is_closed=False).first()
    if not oh:
        return []
    periods = [(p.start_time, p.end_time) for p in oh.periods.all()]
    if not periods and oh.opening_time and oh.closing_time:
        # Rétrocompatibilité ancien format
        periods = [(oh.opening_time, oh.closing_time)]
    return periods


def _is_order_paid(order):
    return order and order.payment_status == 'paid'


class ReservationViewSet(viewsets.GenericViewSet):
    permission_classes = [AllowAny]
    queryset = Reservation.objects.select_related(
        'restaurant', 'table', 'pre_order'
    )
    serializer_class = ReservationSerializer

    # ══════════════════════════════════════════════════════════════════
    # Disponibilités
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Créneaux disponibles",
        description="Liste les créneaux réservables pour une date et un nombre de couverts.",
    )
    @action(detail=False, methods=['get'])
    def availability(self, request):
        query = AvailabilityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data

        try:
            restaurant = Restaurant.objects.get(
                id=data['restaurant_id'], is_active=True
            )
        except Restaurant.DoesNotExist:
            return Response(
                {'error': 'Restaurant introuvable'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Fonctionnalité optionnelle, activée par le restaurateur
        # (getattr : robuste tant que la migration n'est pas passée)
        if not getattr(restaurant, 'reservations_enabled', False):
            return Response(
                {'error': 'reservations_disabled',
                 'message': "Ce restaurant n'accepte pas les réservations en ligne."},
                status=status.HTTP_403_FORBIDDEN,
            )

        tables = list(_candidate_tables(restaurant, data['party_size']))
        if not tables:
            return Response({
                'date': data['date'].isoformat(),
                'party_size': data['party_size'],
                'slots': [],
                'reason': 'no_table_for_party_size',
            })

        table_ids = [t.id for t in tables]
        duration = timedelta(minutes=DEFAULT_DURATION_MINUTES)
        step = timedelta(minutes=SLOT_STEP_MINUTES)
        tz = timezone.get_current_timezone()
        now = timezone.now()

        # Précharger toutes les résas bloquantes de la journée en une requête
        day_start = timezone.make_aware(
            datetime.combine(data['date'], datetime.min.time()), tz
        )
        day_end = day_start + timedelta(days=1)
        day_reservations = list(
            _overlapping(table_ids, day_start, day_end)
            .values('table_id', 'starts_at', 'ends_at')
        )

        slots = []
        for start_time, end_time in _day_periods(restaurant, data['date']):
            period_start = timezone.make_aware(
                datetime.combine(data['date'], start_time), tz
            )
            period_end = timezone.make_aware(
                datetime.combine(data['date'], end_time), tz
            )
            cursor = period_start
            while cursor + duration <= period_end:
                if cursor > now + timedelta(minutes=30):
                    slot_end = cursor + duration
                    free_tables = sum(
                        1 for t in tables
                        if not any(
                            r['table_id'] == t.id
                            and r['starts_at'] < slot_end
                            and r['ends_at'] > cursor
                            for r in day_reservations
                        )
                    )
                    if free_tables > 0:
                        slots.append({
                            'starts_at': cursor.isoformat(),
                            'time': timezone.localtime(cursor).strftime('%H:%M'),
                            'available_tables': free_tables,
                        })
                cursor += step

        return Response({
            'date': data['date'].isoformat(),
            'party_size': data['party_size'],
            'duration_minutes': DEFAULT_DURATION_MINUTES,
            'preorders_enabled': getattr(
                restaurant, 'reservation_preorders_enabled', True
            ),
            'slots': slots,
        })

    # ══════════════════════════════════════════════════════════════════
    # Création
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Créer une réservation",
        description=(
            "Assigne automatiquement la plus petite table libre. "
            "with_pre_order=true → statut pending_payment, créneau bloqué "
            "15 min en attendant le paiement de la pré-commande."
        ),
    )
    def create(self, request):
        self.throttle_classes = [ReservationCreateThrottle]
        self.check_throttles(request)

        serializer = ReservationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            restaurant = Restaurant.objects.get(
                id=data['restaurant'], is_active=True
            )
        except Restaurant.DoesNotExist:
            return Response(
                {'error': 'Restaurant introuvable'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not getattr(restaurant, 'reservations_enabled', False):
            return Response(
                {'error': 'reservations_disabled',
                 'message': "Ce restaurant n'accepte pas les réservations en ligne."},
                status=status.HTTP_403_FORBIDDEN,
            )

        starts_at = data['starts_at']
        ends_at = starts_at + timedelta(minutes=DEFAULT_DURATION_MINUTES)

        # Le créneau doit tomber dans une période d'ouverture
        local_start = timezone.localtime(starts_at)
        periods = _day_periods(restaurant, local_start.date())
        in_period = any(
            st <= local_start.time()
            and timezone.localtime(ends_at).time() <= et
            for st, et in periods
        )
        if not in_period:
            return Response(
                {'error': 'slot_outside_opening_hours',
                 'message': 'Ce créneau est en dehors des horaires du restaurant.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with_pre_order = data['with_pre_order']

        with transaction.atomic():
            # Verrouiller les tables candidates : sérialise les créations
            # concurrentes sur ce restaurant → pas de double-booking.
            tables = list(
                _candidate_tables(restaurant, data['party_size'])
                .select_for_update()
            )
            if not tables:
                return Response(
                    {'error': 'no_table_for_party_size',
                     'message': "Aucune table ne peut accueillir ce nombre de couverts."},
                    status=status.HTTP_409_CONFLICT,
                )

            busy_table_ids = set(
                _overlapping([t.id for t in tables], starts_at, ends_at)
                .values_list('table_id', flat=True)
            )
            table = next(
                (t for t in tables if t.id not in busy_table_ids), None
            )
            if table is None:
                return Response(
                    {'error': 'slot_full',
                     'message': 'Plus aucune table disponible sur ce créneau.'},
                    status=status.HTTP_409_CONFLICT,
                )

            reservation = Reservation.objects.create(
                restaurant=restaurant,
                table=table,
                user=request.user if request.user.is_authenticated else None,
                customer_name=data['customer_name'],
                customer_phone=data['customer_phone'],
                customer_email=data.get('customer_email', ''),
                starts_at=starts_at,
                ends_at=ends_at,
                duration_minutes=DEFAULT_DURATION_MINUTES,
                party_size=data['party_size'],
                special_requests=data.get('special_requests', ''),
                status='pending_payment' if with_pre_order else 'confirmed',
                expires_at=reservation_payment_deadline() if with_pre_order else None,
            )

        notify_floorplan_update(
            restaurant.id,
            event='reservation_created',
            table_id=reservation.table_id,
        )

        return Response(
            ReservationSerializer(reservation).data,
            status=status.HTTP_201_CREATED,
        )

    # ══════════════════════════════════════════════════════════════════
    # Pré-commande + paiement 100% obligatoire
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Pré-commander (paiement 100% obligatoire)",
        description=(
            "Crée la commande en statut 'scheduled' (invisible de la file "
            "cuisine) et retourne un PaymentIntent pour la totalité. "
            "La réservation ne sera confirmée qu'au paiement (webhook)."
        ),
    )
    @action(detail=True, methods=['post'])
    def pre_order(self, request, pk=None):
        reservation = self.get_object()

        if not request.user.is_authenticated:
            return Response(
                {'error': 'authentication_required',
                 'message': 'La pré-commande nécessite un compte.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if reservation.status not in ('pending_payment', 'confirmed'):
            return Response(
                {'error': f'Réservation en statut {reservation.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if reservation.pre_order_id:
            return Response(
                {'error': 'pre_order_exists',
                 'message': 'Une pré-commande existe déjà pour cette réservation.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not getattr(
            reservation.restaurant, 'reservation_preorders_enabled', True
        ):
            return Response(
                {'error': 'preorders_disabled',
                 'message': "Ce restaurant n'accepte pas la pré-commande."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if reservation.expires_at and timezone.now() > reservation.expires_at:
            return Response(
                {'error': 'reservation_expired',
                 'message': 'Le délai de paiement est dépassé, recommencez la réservation.'},
                status=status.HTTP_410_GONE,
            )

        # ── Créer la commande via le serializer existant (pricing formules,
        #    menu du jour, TVA — même logique que le flux classique) ──────
        order_payload = {
            'restaurant': reservation.restaurant_id,
            'order_type': 'dine_in',
            'table_number': reservation.table.number if reservation.table else None,
            'customer_name': reservation.customer_name,
            'phone': reservation.customer_phone,
            'payment_method': 'online',
            'notes': f"Pré-commande réservation {timezone.localtime(reservation.starts_at):%d/%m %H:%M}",
            'items': request.data.get('items', []),
            'formules': request.data.get('formules', []),
        }
        order_serializer = OrderCreateSerializer(
            data=order_payload, context={'request': request}
        )
        order_serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            order = order_serializer.save(user=request.user)
            # Hors file cuisine tant que non déclenchée par Celery/check-in
            order.status = 'scheduled'
            order.save(update_fields=['status'])

            reservation.pre_order = order
            if reservation.status == 'confirmed':
                # Résa créée sans pré-commande puis upgrade → repasse en
                # attente de paiement (paiement 100% obligatoire).
                reservation.status = 'pending_payment'
                reservation.expires_at = reservation_payment_deadline()
            reservation.save(
                update_fields=['pre_order', 'status', 'expires_at', 'updated_at']
            )

        # ── PaymentIntent (mêmes conventions que CreatePaymentIntentView) ──
        amount_cents = int(order.total_amount * Decimal('100'))
        if amount_cents < 50:
            return Response(
                {'error': 'amount_below_stripe_minimum'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        restaurateur = getattr(reservation.restaurant, 'owner', None)
        connect_params = build_stripe_payment_params(
            amount_cents, restaurateur
        ) if restaurateur else {}

        try:
            intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency='eur',
                metadata={
                    'order_id': str(order.id),
                    'reservation_id': str(reservation.id),
                    'user_id': str(request.user.id),
                },
                automatic_payment_methods={'enabled': True},
                **connect_params,
            )
        except stripe.error.StripeError as e:
            logger.exception(
                "Stripe error creating pre-order intent for reservation %s: %s",
                reservation.id, e,
            )
            return Response(
                {'error': 'payment_provider_error'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({
            'client_secret': intent.client_secret,
            'payment_intent_id': intent.id,
            'order_id': str(order.id),
            'amount': str(order.total_amount),
            'payment_deadline': reservation.expires_at,
        })

    # ══════════════════════════════════════════════════════════════════
    # Annulation + remboursement
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Annuler une réservation",
        description=(
            "Remboursement intégral si l'annulation intervient avant la "
            "deadline (RESERVATION_FREE_CANCELLATION_MINUTES avant le créneau). "
            "Au-delà : montant conservé par le restaurant."
        ),
    )
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        reservation = self.get_object()

        if not self._can_manage(request, reservation):
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )
        if reservation.status not in ('pending_payment', 'confirmed'):
            return Response(
                {'error': f'Réservation en statut {reservation.status}, annulation impossible.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refunded = False
        if reservation.has_paid_pre_order and reservation.is_refundable():
            pi_id = self._find_payment_intent_id(reservation)
            if pi_id:
                try:
                    refund = stripe.Refund.create(
                        payment_intent=pi_id,
                        # Destination charge : récupérer les fonds du compte
                        # connecté ET la commission plateforme.
                        reverse_transfer=True,
                        refund_application_fee=True,
                        metadata={'reservation_id': str(reservation.id)},
                    )
                    reservation.refund_id = refund.id
                    refunded = True
                except stripe.error.StripeError as e:
                    logger.exception(
                        "Refund failed for reservation %s: %s", reservation.id, e
                    )
                    return Response(
                        {'error': 'refund_failed',
                         'message': "Le remboursement a échoué, contactez le support."},
                        status=status.HTTP_502_BAD_GATEWAY,
                    )

        with transaction.atomic():
            reservation.status = 'cancelled'
            reservation.cancelled_at = timezone.now()
            reservation.save(
                update_fields=['status', 'cancelled_at', 'refund_id', 'updated_at']
            )
            if reservation.pre_order and reservation.pre_order.status == 'scheduled':
                reservation.pre_order.status = 'cancelled'
                reservation.pre_order.save(update_fields=['status'])

        notify_floorplan_update(
            reservation.restaurant_id,
            event='reservation_cancelled',
            table_id=reservation.table_id,
        )

        return Response({
            'success': True,
            'refunded': refunded,
            'message': (
                'Réservation annulée, remboursement intégral en cours.'
                if refunded else
                'Réservation annulée.'
                + ('' if not reservation.pre_order else
                   ' Le montant de la pré-commande est conservé (annulation tardive).')
            ),
        })

    # ══════════════════════════════════════════════════════════════════
    # Check-in (arrivée du client)
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(
        summary="Check-in du client",
        description=(
            "Appelé quand le client scanne le QR de sa table réservée. "
            "Passe la réservation en 'seated' et déclenche la cuisine si "
            "ce n'est pas déjà fait."
        ),
    )
    @action(detail=True, methods=['post'])
    def check_in(self, request, pk=None):
        reservation = self.get_object()

        if reservation.status != 'confirmed':
            return Response(
                {'error': f'Réservation en statut {reservation.status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Tolérance : check-in possible de T-30 min à T+30 min
        now = timezone.now()
        if not (reservation.starts_at - timedelta(minutes=30)
                <= now
                <= reservation.starts_at + timedelta(minutes=30)):
            return Response(
                {'error': 'outside_checkin_window',
                 'message': "Le check-in n'est possible que 30 min avant/après l'heure de réservation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Optionnel : vérification que le QR scanné correspond bien à la table
        qr_code = request.data.get('qr_code')
        if qr_code and reservation.table and reservation.table.qr_code != qr_code:
            return Response(
                {'error': 'wrong_table',
                 'message': f"Votre table réservée est la {reservation.table.number}.",
                 'expected_table': reservation.table.number},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reservation.check_in()

        notify_floorplan_update(
            reservation.restaurant_id,
            event='reservation_seated',
            table_id=reservation.table_id,
        )

        return Response({
            'success': True,
            'status': reservation.status,
            'kitchen_fired': reservation.kitchen_fired_at is not None,
            'table_number': reservation.table.number if reservation.table else None,
        })

    # ══════════════════════════════════════════════════════════════════
    # Listes
    # ══════════════════════════════════════════════════════════════════

    @extend_schema(summary="Mes réservations")
    @action(detail=False, methods=['get'])
    def mine(self, request):
        if not request.user.is_authenticated:
            return Response(
                {'error': 'authentication_required'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        qs = self.get_queryset().filter(user=request.user).order_by('-starts_at')[:50]
        return Response(ReservationSerializer(qs, many=True).data)

    @extend_schema(
        summary="Planning restaurateur",
        description="Réservations d'un restaurant pour une date donnée (?restaurant_id=&date=YYYY-MM-DD).",
    )
    @action(detail=False, methods=['get'])
    def planning(self, request):
        restaurant_id = request.query_params.get('restaurant_id')
        date_str = request.query_params.get('date')
        if not restaurant_id or not date_str:
            return Response(
                {'error': 'restaurant_id et date sont requis'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
        except Restaurant.DoesNotExist:
            return Response(
                {'error': 'Restaurant introuvable'},
                status=status.HTTP_404_NOT_FOUND,
            )

        user = request.user
        is_restaurateur = (
            user.is_authenticated
            and hasattr(user, 'restaurateur_profile')
            and restaurant.owner == user.restaurateur_profile
        )
        if not is_restaurateur:
            return Response(
                {'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN
            )

        try:
            date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response(
                {'error': 'Format de date invalide (attendu YYYY-MM-DD)'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tz = timezone.get_current_timezone()
        day_start = timezone.make_aware(
            datetime.combine(date, datetime.min.time()), tz
        )
        day_end = day_start + timedelta(days=1)

        qs = self.get_queryset().filter(
            restaurant=restaurant,
            starts_at__gte=day_start,
            starts_at__lt=day_end,
        ).exclude(status='expired').order_by('starts_at')

        return Response(ReservationSerializer(qs, many=True).data)

    # ══════════════════════════════════════════════════════════════════
    # Helpers
    # ══════════════════════════════════════════════════════════════════

    def _can_manage(self, request, reservation):
        user = request.user
        if not user.is_authenticated:
            return False
        if reservation.user_id == user.id:
            return True
        return (
            hasattr(user, 'restaurateur_profile')
            and reservation.restaurant.owner == user.restaurateur_profile
        )

    def _find_payment_intent_id(self, reservation):
        """Retrouve le PaymentIntent de la pré-commande via metadata Stripe."""
        try:
            intents = stripe.PaymentIntent.search(
                query=f"metadata['reservation_id']:'{reservation.id}' AND status:'succeeded'",
                limit=1,
            )
            if intents.data:
                return intents.data[0].id
        except stripe.error.StripeError as e:
            logger.exception(
                "PaymentIntent search failed for reservation %s: %s",
                reservation.id, e,
            )
        return None