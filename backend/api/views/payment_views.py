from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.db import transaction
from decimal import Decimal

from api.models import (
    Order, RestaurateurProfile,
    DraftOrder, OrderItem, MenuItem
)
from api.throttles import StripeCheckoutThrottle
import stripe
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

# Initialise ta clé Stripe globale
stripe.api_key = settings.STRIPE_SECRET_KEY


# ---------- Helper : transformer une DraftOrder en Order ----------
@transaction.atomic
def _create_order_from_draft(draft: DraftOrder, paid: bool) -> Order:
    """
    Crée une Order finale depuis une DraftOrder (invité).
    - Montants : draft.amount (centimes) -> Order (euros Decimal)
    - Items : copie MenuItem, quantité, prix unitaire
    - Statuts : payment_status en fonction de 'paid'
    """
    # Gestion expiration simple (si ton modèle expose is_expired(), utilise-le)
    if hasattr(draft, "is_expired") and draft.is_expired():
        draft.status = "expired"
        draft.save(update_fields=["status"])
        raise ValueError("Draft expired")

    subtotal = Decimal(draft.amount) / Decimal(100)  # centimes -> euros
    tax_amount = Decimal("0.00")  # adapte si TVA
    total_amount = subtotal + tax_amount

    order = Order.objects.create(
        restaurant=draft.restaurant,
        order_type="dine_in" if draft.table_number else "takeaway",
        table_number=draft.table_number or "",
        customer_name=getattr(draft, "customer_name", "") or "",
        phone=getattr(draft, "phone", "") or "",
        status="pending",
        payment_status="paid" if paid else "pending",
        payment_method=draft.payment_method,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total_amount,
        notes="",
        source="guest",
        guest_contact_name=getattr(draft, "customer_name", "") or "",
        guest_phone=getattr(draft, "phone", "") or "",
        guest_email=getattr(draft, "email", None),
    )

    # Création des items
    # draft.items est supposé être un JSON du type [{menu_item_id, quantity, options?}, ...]
    for it in draft.items or []:
        mi = MenuItem.objects.get(
            id=it["menu_item_id"],
            menu__restaurant=draft.restaurant
        )
        qty = int(it["quantity"])
        unit_price = mi.price  # Decimal en euros (selon ton modèle)
        OrderItem.objects.create(
            order=order,
            # ⚠️ Si ton OrderItem pointe sur un autre champ, adapte ici :
            menu_item=mi,
            quantity=qty,
            unit_price=unit_price,
            total_price=unit_price * qty,
            # Si tu as un champ 'customizations' JSONField :
            customizations=it.get("options") or {},
            special_instructions=""
        )

    return order


# ---------- 1. Création de la session Stripe Checkout ----------
@extend_schema(
    tags=["Paiement"],
    summary="Créer une session Stripe Checkout",
    description="Crée une session de paiement Stripe Checkout pour une commande non payée.",
    parameters=[
        OpenApiParameter(name='order_id', description='ID de la commande à payer', required=True, type=int, location=OpenApiParameter.PATH)
    ],
    responses={
        200: OpenApiResponse(description="URL de redirection Stripe"),
        400: OpenApiResponse(description="Commande déjà payée ou restaurateur sans compte Stripe"),
        404: OpenApiResponse(description="Commande introuvable")
    }
)
class CreateCheckoutSessionView(APIView):
    """
    Crée une session Stripe Checkout pour une commande non payée.
    Retourne l'URL sécurisée vers Stripe Checkout.
    """
    throttle_classes = [StripeCheckoutThrottle]
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            if getattr(order, "is_paid", False):
                return Response({"error": "Order already paid."}, status=status.HTTP_400_BAD_REQUEST)

            # Préparer les items de la commande
            line_items = [
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": getattr(item.menu_item, "name", "Item")},
                        "unit_amount": int(Decimal(item.menu_item.price) * 100),
                    },
                    "quantity": item.quantity,
                }
                for item in order.order_items.all()
            ]

            restaurateur = getattr(order, "restaurateur", None)
            if not restaurateur or not restaurateur.stripe_account_id:
                return Response({"error": "No Stripe account linked."}, status=status.HTTP_400_BAD_REQUEST)

            # Commission 2% (en centimes) sur le total de commande
            platform_fee_cents = int(order.total_amount * Decimal("100")) * 2 // 100

            # Création de la session Stripe Checkout
            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=line_items,
                mode="payment",
                success_url=f"{settings.DOMAIN}/success?order={order_id}",
                cancel_url=f"{settings.DOMAIN}/cancel?order={order_id}",
                metadata={"order_id": str(order_id)},
                payment_intent_data={
                    "application_fee_amount": platform_fee_cents,
                    "transfer_data": {
                        "destination": restaurateur.stripe_account_id,
                    }
                }
            )

            return Response({"checkout_url": session.url})

        except Order.DoesNotExist:
            return Response({"error": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ---------- 2. Webhook Stripe sécurisé ----------
@extend_schema(exclude=True)
@method_decorator(csrf_exempt, name='dispatch')
class StripeWebhookView(APIView):
    permission_classes = []

    def post(self, request):
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.error.SignatureVerificationError):
            return HttpResponse(status=400)

        etype = event.get("type")

        # a) Paiement via Checkout (existant)
        if etype == "checkout.session.completed":
            session = event["data"]["object"]
            order_id = (session.get("metadata") or {}).get("order_id")
            if order_id:
                try:
                    order = Order.objects.get(id=order_id)
                    if not getattr(order, "is_paid", False):
                        order.is_paid = True
                        order.payment_status = "paid"  # si tu as ce champ
                        order.save(update_fields=["is_paid", "payment_status"])
                        # TODO: notifier via WS le restaurateur
                except Order.DoesNotExist:
                    pass

        # b) Paiement invité via PaymentIntent (mode PaymentSheet)
        elif etype == "payment_intent.succeeded":
            pi = event["data"]["object"]
            metadata = pi.get("metadata") or {}
            draft_id = metadata.get("draft_order_id")
            if draft_id:
                try:
                    draft = DraftOrder.objects.get(id=draft_id)
                    # Créer la commande finale payée
                    order = _create_order_from_draft(draft, paid=True)
                    draft.status = "pi_succeeded"
                    draft.save(update_fields=["status"])
                    # TODO: notifier via WS (room restaurant:{id})
                except DraftOrder.DoesNotExist:
                    pass
                except Exception:
                    # en cas d'erreur de création, ne pas renvoyer 4xx au webhook (réessaies Stripe)
                    pass

        elif etype == "payment_intent.payment_failed":
            pi = event["data"]["object"]
            metadata = pi.get("metadata") or {}
            draft_id = metadata.get("draft_order_id")
            if draft_id:
                DraftOrder.objects.filter(id=draft_id).update(status="failed")

        # c) Vérification d'identité (existant)
        elif etype == "identity.verification_session.verified":
            session = event["data"]["object"]
            rest_id = (session.get("metadata") or {}).get("restaurateur_id")
            if rest_id:
                try:
                    restaurateur = RestaurateurProfile.objects.get(id=rest_id)
                    restaurateur.stripe_verified = True
                    restaurateur.save(update_fields=["stripe_verified"])
                except RestaurateurProfile.DoesNotExist:
                    pass

        return HttpResponse(status=200)


# ---------- 3. Création du compte Stripe Connect ----------
@extend_schema(
    tags=["Stripe"],
    summary="Créer un compte Stripe Connect",
    description="Crée un compte Stripe pour un restaurateur et renvoie un lien d'onboarding.",
    responses={
        200: OpenApiResponse(description="Lien Stripe d'onboarding"),
        400: OpenApiResponse(description="Compte déjà existant")
    }
)
class CreateStripeAccountView(APIView):
    """
    Crée un compte Stripe Connect pour un restaurateur et retourne un lien d'onboarding.
    Nécessite l'authentification.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        restaurateur = RestaurateurProfile.objects.get(user=user)

        if restaurateur.stripe_account_id:
            return Response({"error": "Stripe account already created."}, status=status.HTTP_400_BAD_REQUEST)

        account = stripe.Account.create(
            type="standard",
            email=user.email,
            business_type="individual",
        )

        restaurateur.stripe_account_id = account.id
        restaurateur.save(update_fields=["stripe_account_id"])

        account_link = stripe.AccountLink.create(
            account=account.id,
            refresh_url=f"{settings.DOMAIN}/onboarding/refresh",
            return_url=f"{settings.DOMAIN}/onboarding/success",
            type="account_onboarding",
        )

        return Response({"onboarding_url": account_link.url})


# ---------- 4. Vérification du compte Stripe ----------
@extend_schema(
    tags=["Stripe"],
    summary="Statut du compte Stripe",
    description="Retourne le statut du compte Stripe du restaurateur connecté.",
    responses={
        200: OpenApiResponse(description="Statut Stripe"),
        400: OpenApiResponse(description="Aucun compte Stripe lié")
    }
)
class StripeAccountStatusView(APIView):
    """
    Retourne l'état de vérification Stripe d'un restaurateur (charges, virements, etc.).
    Nécessite l'authentification.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        restaurateur = RestaurateurProfile.objects.get(user=user)

        if not restaurateur.stripe_account_id:
            return Response({"error": "No Stripe account linked."}, status=status.HTTP_400_BAD_REQUEST)

        account = stripe.Account.retrieve(restaurateur.stripe_account_id)

        return Response({
            "charges_enabled": account.charges_enabled,
            "payouts_enabled": account.payouts_enabled,
            "requirements": account.requirements
        })


@extend_schema(
    tags=["Stripe"],
    summary="Créer une session Stripe Identity",
    description="Crée une session de vérification d'identité Stripe pour le restaurateur connecté.",
    responses={
        201: OpenApiResponse(description="URL Stripe Identity"),
        500: OpenApiResponse(description="Erreur Stripe")
    }
)
class StripeIdentitySessionView(APIView):
    """
    Crée une session Stripe Identity pour le restaurateur connecté.
    Nécessite une authentification. Renvoie l'URL sécurisée vers Stripe Identity.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            restaurateur = request.user.restaurateur_profile

            session = stripe.identity.VerificationSession.create(
                type="document",
                metadata={"restaurateur_id": str(restaurateur.id)},
                return_url=f"{settings.DOMAIN}/dashboard?verified=true"
            )

            return Response({"verification_url": session.url}, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@extend_schema(
    tags=["Paiement Mobile"],
    summary="Créer un PaymentIntent pour mobile",
    description="Crée un PaymentIntent Stripe pour l'app mobile (PaymentSheet)",
)
class CreatePaymentIntentView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            order_id = request.data.get('order_id')
            if not order_id:
                return Response(
                    {'error': 'order_id is required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
                return Response(
                    {'error': 'Not authorized'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            if order.payment_status == 'paid':
                return Response(
                    {'error': 'Order already paid'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Créer le PaymentIntent
            intent = stripe.PaymentIntent.create(
                amount=int(order.total_amount * 100),  # Centimes
                currency='eur',
                metadata={
                    'order_id': str(order.id),
                    'user_id': str(request.user.id) if request.user.is_authenticated else None,
                },
                automatic_payment_methods={'enabled': True}
            )
            
            return Response({
                'client_secret': intent.client_secret,
                'payment_intent_id': intent.id
            })
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Order not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

@extend_schema(
    tags=["Paiement Mobile"],
    summary="Mettre à jour le statut de paiement",
)
class UpdatePaymentStatusView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
                return Response(
                    {'error': 'Not authorized'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            payment_status = request.data.get('payment_status')
            if payment_status not in ['paid', 'cash_pending', 'failed']:
                return Response(
                    {'error': 'Invalid payment status'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            order.payment_status = payment_status
            order.save()
            
            return Response({'success': True})
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Order not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    def post(self, request):
        """Crée un PaymentIntent pour l'app mobile (PaymentSheet)"""
        order_id = request.data.get('order_id')
        order = Order.objects.get(id=order_id)
        
        intent = stripe.PaymentIntent.create(
            amount=int(order.total_amount * 100),  # centimes
            currency='eur',
            metadata={'order_id': str(order.id)},
            automatic_payment_methods={'enabled': True}
        )
        
        return Response({
            'client_secret': intent.client_secret,
            'payment_intent_id': intent.id
        })