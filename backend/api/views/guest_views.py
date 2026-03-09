import logging
from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions, throttling
from django.conf import settings
import datetime, stripe

from api.models import DraftOrder, Restaurant, MenuItem
from api.serializers import GuestPrepareSerializer, GuestPrepareResponse, DraftStatusQuery, DraftStatusResponse
from api.services import create_order_from_draft

stripe.api_key = settings.STRIPE_SECRET_KEY
logger = logging.getLogger(__name__)


class GuestThrottle(throttling.UserRateThrottle):
    rate = "10/min"


def compute_amount_cents(restaurant, items):
    amount_cents = 0
    for it in items:
        mi = get_object_or_404(
            MenuItem, id=it["menu_item_id"],
            menu__restaurant=restaurant, is_available=True
        )
        # MenuItem.price en euros → centimes
        amount_cents += int(Decimal(mi.price) * 100) * int(it["quantity"])
    return amount_cents


class GuestPrepare(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [GuestThrottle]

    def post(self, request):
        s = GuestPrepareSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        rest = get_object_or_404(Restaurant, id=data["restaurant_id"], is_active=True)
        if not rest.can_receive_orders:
            return Response({"detail": "Restaurant indisponible"}, status=403)

        amount = compute_amount_cents(rest, data["items"])
        draft = DraftOrder.objects.create(
            restaurant=rest,
            table_number=data.get("table_number") or None,
            items=data["items"],
            amount=amount,
            currency="eur",
            customer_name=data["customer_name"],
            phone=data["phone"],
            email=data.get("email") or None,
            payment_method=data["payment_method"],
            expires_at=timezone.now() + datetime.timedelta(minutes=15),
        )

        client_secret = None
        if draft.payment_method == "online":
            # Commission 2% (en centimes) sur le total de commande
            platform_fee_cents = amount * 2 // 100

            pi = stripe.PaymentIntent.create(
                amount=amount,
                currency="eur",
                automatic_payment_methods={"enabled": True},
                application_fee_amount=platform_fee_cents,
                metadata={
                    "draft_order_id": str(draft.id),
                    "restaurant_id": str(rest.id),
                },
            )
            draft.payment_intent_id = pi.id
            draft.save(update_fields=["payment_intent_id"])
            client_secret = pi.client_secret

        resp = GuestPrepareResponse({
            "draft_order_id": draft.id,
            "amount": amount,
            "currency": "eur",
            "payment_intent_client_secret": client_secret,
        })
        return Response(resp.data, status=status.HTTP_201_CREATED)


class GuestConfirmCash(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        q = DraftStatusQuery(data=request.data)
        q.is_valid(raise_exception=True)
        draft = get_object_or_404(DraftOrder, id=q.validated_data["draft_order_id"])

        if draft.payment_method != "cash":
            return Response({"detail": "Draft not cash"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # create_order_from_draft gère le verrou SELECT FOR UPDATE, la garde
            # de statut et la mise à jour vers 'confirmed_cash' — le tout dans
            # une seule transaction atomique.  Ne pas mettre à jour draft.status
            # ici : la vue ne voit qu'une snapshot non verrouillée.
            order = create_order_from_draft(draft, paid=False)
        except ValueError as e:
            error_msg = str(e)
            if "already consumed" in error_msg:
                # Rejeu détecté : renvoyer 409 Conflict avec l'id de commande
                # existante pour que le client puisse afficher la confirmation.
                from api.models import Order
                existing = Order.objects.filter(
                    restaurant=draft.restaurant,
                    guest_phone=draft.phone,
                    created_at__gte=draft.created_at,
                ).order_by("-id").first()
                return Response(
                    {
                        "detail": "Order already created for this draft.",
                        "order_id": existing.id if existing else None,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            if "expired" in error_msg:
                return Response({"detail": "Draft has expired."}, status=status.HTTP_410_GONE)
            logger.exception("Unexpected error in GuestConfirmCash: %s", e)
            return Response({"detail": "Could not confirm order."}, status=status.HTTP_400_BAD_REQUEST)

        # TODO: notifier via WS (room du restaurant)
        return Response({
            "order_id": order.id,
            "status": order.status,
            "payment_status": order.payment_status,
        }, status=status.HTTP_200_OK)


class GuestDraftStatus(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        q = DraftStatusQuery(data=request.query_params)
        q.is_valid(raise_exception=True)
        draft = get_object_or_404(DraftOrder, id=q.validated_data["draft_order_id"])
        from api.models import Order
        o = Order.objects.filter(
            restaurant=draft.restaurant,
            guest_phone=draft.phone,
            created_at__gte=draft.created_at
        ).order_by("-id").first()
        return Response(DraftStatusResponse({
            "status": draft.status,
            "order_id": o.id if o else None
        }).data)