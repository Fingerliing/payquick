from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from api.models import Order, RestaurateurProfile
import stripe

# Initialise ta clé Stripe globale
stripe.api_key = settings.STRIPE_SECRET_KEY

# ---------- 1. Création de la session Stripe Checkout ----------
class CreateCheckoutSessionView(APIView):
    """
    Crée une session Stripe Checkout pour une commande non payée.
    Retourne l'URL sécurisée vers Stripe Checkout.
    """
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

        return HttpResponse(status=200)

# ---------- 3. Création du compte Stripe Connect ----------
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
