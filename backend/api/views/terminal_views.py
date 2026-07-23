"""
Stripe Terminal / Tap to Pay.

Cohérence Connect — à ne pas casser
-----------------------------------
Le reste de la plateforme fonctionne en *destination charges* :
`build_stripe_payment_params()` pose `application_fee_amount` +
`transfer_data.destination`, et le PaymentIntent vit sur le compte PLATEFORME.

Conséquence directe : la `Location` Terminal et le reader appartiennent eux
aussi au compte plateforme, et les `ConnectionToken` sont créés SANS
`stripe_account`. Passer un jour en direct charges impose de déplacer les trois
en même temps — un mélange des deux produit un « No such location » à la
connexion du reader, en plein service.

Intégrité comptable
-------------------
`payment_method='terminal'` n'est écrit que par `TerminalConfirmView`, après
relecture du PaymentIntent auprès de Stripe. Aucun client HTTP ne peut le
déclarer (cf. `OrderPaymentSerializer.validate_payment_method`). Sans cette
règle, la répartition commissionnable / non commissionnable serait déclarative
et donc non auditable.
"""
import logging

import stripe
from django.conf import settings
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import Order, Restaurant
from api.permissions import IsValidatedRestaurateur
from api.utils.commission_utils import build_stripe_payment_params

logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY


# ============================================================================
# HELPERS
# ============================================================================

def _owned_restaurant(request, restaurant_id):
    """Restaurant appartenant au restaurateur authentifié, ou None."""
    try:
        restaurant = Restaurant.objects.select_related('owner', 'owner__user').get(
            pk=restaurant_id
        )
    except (Restaurant.DoesNotExist, ValueError, TypeError):
        return None

    owner = getattr(restaurant, 'owner', None)
    if owner is None or getattr(owner, 'user_id', None) != request.user.id:
        return None
    return restaurant


def _stripe_unavailable():
    return Response(
        {'error': 'Terminal payment is unavailable. Please use another payment method.'},
        status=status.HTTP_400_BAD_REQUEST,
    )


# ============================================================================
# 1. CONNECTION TOKEN
# ============================================================================

@extend_schema(tags=["Paiement • Tap to Pay"], summary="Jeton de connexion Terminal")
class TerminalConnectionTokenView(APIView):
    """
    Le SDK rappelle cet endpoint à chaque expiration de jeton, y compris
    pendant une transaction : il doit rester rapide et ne jamais renvoyer 500.
    """

    permission_classes = [IsAuthenticated, IsValidatedRestaurateur]

    def post(self, request):
        restaurant = _owned_restaurant(request, request.data.get('restaurant'))
        if restaurant is None:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        try:
            # Pas de `stripe_account=` : destination charges, tout vit sur la
            # plateforme (cf. docstring du module).
            token = stripe.terminal.ConnectionToken.create()
        except stripe.StripeError as e:
            logger.exception("Terminal connection token failed (restaurant %s): %s", restaurant.id, e)
            return _stripe_unavailable()

        return Response({'secret': token.secret})


# ============================================================================
# 2. LOCATION (get-or-create, idempotent)
# ============================================================================

@extend_schema(tags=["Paiement • Tap to Pay"], summary="Location Terminal du restaurant")
class TerminalLocationView(APIView):
    """
    Un reader Terminal doit être rattaché à une `Location`. On en crée une par
    restaurant, à partir de son adresse postale, et on mémorise l'ID pour ne
    pas empiler les doublons à chaque service.
    """

    permission_classes = [IsAuthenticated, IsValidatedRestaurateur]

    def post(self, request):
        restaurant = _owned_restaurant(request, request.data.get('restaurant'))
        if restaurant is None:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        existing = getattr(restaurant, 'stripe_terminal_location_id', '') or ''
        if existing:
            return Response({'location_id': existing})

        if not restaurant.address or not restaurant.city or not restaurant.zip_code:
            return Response(
                {'error': 'Restaurant address is incomplete.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            location = stripe.terminal.Location.create(
                display_name=restaurant.name[:100],
                address={
                    'line1': restaurant.address,
                    'city': restaurant.city,
                    'postal_code': restaurant.zip_code,
                    'country': (restaurant.country or 'FR')[:2].upper(),
                },
                metadata={'restaurant_id': str(restaurant.id)},
            )
        except stripe.StripeError as e:
            logger.exception("Terminal location creation failed (restaurant %s): %s", restaurant.id, e)
            return _stripe_unavailable()

        restaurant.stripe_terminal_location_id = location.id
        restaurant.save(update_fields=['stripe_terminal_location_id'])

        return Response({'location_id': location.id})


# ============================================================================
# 3. PAYMENT INTENT card_present
# ============================================================================

@extend_schema(tags=["Paiement • Tap to Pay"], summary="PaymentIntent Tap to Pay")
class TerminalPaymentIntentView(APIView):
    """
    Crée le PaymentIntent `card_present` sur le compte plateforme, commission
    incluse. Le SDK ne fait ensuite que collecter et confirmer.
    """

    permission_classes = [IsAuthenticated, IsValidatedRestaurateur]

    def post(self, request):
        try:
            order = Order.objects.select_related(
                'restaurant', 'restaurant__owner', 'restaurant__owner__user'
            ).get(pk=request.data.get('order_id'))
        except (Order.DoesNotExist, ValueError, TypeError):
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        owner = getattr(order.restaurant, 'owner', None)
        if owner is None or getattr(owner, 'user_id', None) != request.user.id:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        if order.payment_status == 'paid':
            return Response({'error': 'Order already paid'}, status=status.HTTP_400_BAD_REQUEST)

        amount_cents = int(order.total_amount * 100)
        if amount_cents <= 0:
            return Response({'error': 'Invalid amount'}, status=status.HTTP_400_BAD_REQUEST)

        # Même garde-fou que le flux en ligne : sans compte Connect valide,
        # transfer_data[destination] fait échouer la création côté Stripe.
        if not getattr(owner, 'stripe_account_id', None):
            return Response(
                {'error': 'Card payment is not available for this restaurant.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        connect_params = build_stripe_payment_params(amount_cents, owner)

        try:
            intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency='eur',
                payment_method_types=['card_present'],
                capture_method='automatic',
                metadata={
                    'order_id': str(order.id),
                    'restaurant_id': str(order.restaurant_id),
                    'payment_channel': 'terminal',
                },
                **connect_params,
            )
        except stripe.StripeError as e:
            logger.exception("Terminal PaymentIntent failed (order %s): %s", order.id, e)
            return _stripe_unavailable()

        return Response({
            'client_secret': intent.client_secret,
            'payment_intent_id': intent.id,
            'amount_cents': amount_cents,
        })


# ============================================================================
# 4. CONFIRMATION (seule écriture de payment_method='terminal')
# ============================================================================

@extend_schema(tags=["Paiement • Tap to Pay"], summary="Confirmer un encaissement Tap to Pay")
class TerminalConfirmView(APIView):
    """
    Relit le PaymentIntent auprès de Stripe avant toute écriture. Un PI qui
    n'est pas `succeeded`, pas `card_present`, ou rattaché à une autre commande
    est refusé — c'est ce qui rend la ligne « commissionnable » auditable.

    Idempotent : un second appel sur une commande déjà payée répond 200 sans
    rien réécrire (le webhook peut être passé avant nous).
    """

    permission_classes = [IsAuthenticated, IsValidatedRestaurateur]

    def post(self, request):
        from api.serializers.order_serializers import (
            OrderDetailSerializer,
            OrderPaymentSerializer,
        )

        payment_intent_id = request.data.get('payment_intent_id')
        if not payment_intent_id:
            return Response(
                {'error': 'payment_intent_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            order = Order.objects.select_related(
                'restaurant', 'restaurant__owner'
            ).get(pk=request.data.get('order_id'))
        except (Order.DoesNotExist, ValueError, TypeError):
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        owner = getattr(order.restaurant, 'owner', None)
        if owner is None or getattr(owner, 'user_id', None) != request.user.id:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)

        if order.payment_status == 'paid':
            return Response(OrderDetailSerializer(order, context={'request': request}).data)

        try:
            intent = stripe.PaymentIntent.retrieve(
                payment_intent_id,
                expand=['latest_charge'],
            )
        except stripe.StripeError as e:
            logger.warning("Terminal confirm: retrieve failed for %s: %s", payment_intent_id, e)
            return Response(
                {'error': 'Could not verify payment with Stripe'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if intent.metadata.get('order_id') != str(order.id):
            logger.warning(
                "Terminal confirm: PI %s order mismatch (expected %s, got %s)",
                payment_intent_id, order.id, intent.metadata.get('order_id'),
            )
            return Response(
                {'error': 'Payment intent does not match this order'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if intent.status != 'succeeded':
            return Response(
                {'error': f'Payment intent status is "{intent.status}"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Le canal doit être vérifié sur la charge, pas sur les métadonnées :
        # celles-ci sont posées par nous, `payment_method_details` par Stripe.
        charge = intent.get('latest_charge') or {}
        details = (charge.get('payment_method_details') or {}) if isinstance(charge, dict) else {}
        if details.get('type') != 'card_present':
            logger.warning("Terminal confirm: PI %s is not card_present", payment_intent_id)
            return Response(
                {'error': 'Payment was not collected on a terminal'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            locked = Order.objects.select_for_update().get(pk=order.pk)
            if locked.payment_status != 'paid':
                serializer = OrderPaymentSerializer(
                    locked,
                    data={'payment_method': 'terminal', 'payment_status': 'paid'},
                    partial=True,
                    context={'trusted_source': True},
                )
                serializer.is_valid(raise_exception=True)
                locked = serializer.save()

        logger.info("Order %s marked as paid via Tap to Pay (%s)", order.id, payment_intent_id)
        return Response(OrderDetailSerializer(locked, context={'request': request}).data)