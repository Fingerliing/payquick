from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from api.models import Order, RestaurateurProfile
from api.throttles import StripeCheckoutThrottle
import stripe
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

# Initialise ta clé Stripe globale
stripe.api_key = settings.STRIPE_SECRET_KEY

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
            if order.is_paid:
                return Response({"error": "Order already paid."}, status=status.HTTP_400_BAD_REQUEST)

            # Préparer les items de la commande
            line_items = [
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": item.menu_item.name},
                        "unit_amount": int(item.menu_item.price * 100),
                    },
                    "quantity": item.quantity,
                }
                for item in order.order_items.all()
            ]

            restaurateur = order.restaurateur
            if not restaurateur.stripe_account_id:
                return Response({"error": "No Stripe account linked."}, status=status.HTTP_400_BAD_REQUEST)

            # Création de la session Stripe Checkout
            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=line_items,
                mode="payment",
                success_url=f"{settings.DOMAIN}/success?order={order_id}",
                cancel_url=f"{settings.DOMAIN}/cancel?order={order_id}",
                metadata={"order_id": str(order_id)},
                payment_intent_data={
                    "application_fee_amount": 0,
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

        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            order_id = session["metadata"].get("order_id")
            try:
                order = Order.objects.get(id=order_id)
                if not order.is_paid:
                    order.is_paid = True
                    order.save()
                    print(f"[✓] Payment confirmed for order {order_id}")
            except Order.DoesNotExist:
                print(f"[✗] Order {order_id} not found")
        elif event["type"] == "identity.verification_session.verified":
            session = event["data"]["object"]
            rest_id = session["metadata"].get("restaurateur_id")
            if rest_id:
                try:
                    restaurateur = RestaurateurProfile.objects.get(id=rest_id)
                    restaurateur.stripe_verified = True
                    restaurateur.save()
                    print(f"[✓] Restaurateur #{rest_id} vérifié via Stripe Identity.")
                except RestaurateurProfile.DoesNotExist:
                    print(f"[✗] Restaurateur #{rest_id} introuvable pour vérification Stripe.")


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
        restaurateur.save()

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
