from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions, throttling
from django.conf import settings
import datetime, stripe

from api.models import DraftOrder, Restaurant, MenuItem
from api.serializers import (
    GuestPrepareSerializer, GuestPrepareResponse,
    DraftStatusQuery, DraftStatusResponse
)
from api.services import create_order_from_draft

stripe.api_key = settings.STRIPE_SECRET_KEY

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
            pi = stripe.PaymentIntent.create(
                amount=amount,
                currency="eur",
                automatic_payment_methods={"enabled": True},
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
            return Response({"detail": "Draft not cash"}, status=400)

        order = create_order_from_draft(draft, paid=False)
        draft.status = "confirmed_cash"
        draft.save(update_fields=["status"])
        # TODO: notifier via WS (room du restaurant)
        return Response({
            "order_id": order.id,
            "status": order.status,
            "payment_status": order.payment_status
        }, status=200)

class GuestDraftStatus(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        q = DraftStatusQuery(data=request.query_params)
        q.is_valid(raise_exception=True)
        draft = get_object_or_404(DraftOrder, id=q.validated_data["draft_order_id"])
        # Tu peux stocker l'order_id sur la draft si tu préfères
        from .models import Order
        o = Order.objects.filter(
            restaurant=draft.restaurant,
            guest_phone=draft.phone,
            created_at__gte=draft.created_at
        ).order_by("-id").first()
        return Response(DraftStatusResponse({
            "status": draft.status,
            "order_id": o.id if o else None
        }).data)
