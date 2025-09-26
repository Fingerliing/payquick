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
    """
    Webhook Stripe pour gérer les paiements normaux et divisés
    """
    permission_classes = []

    def post(self, request):
        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")

        try:
            # Vérifier la signature du webhook
            event = stripe.Webhook.construct_event(
                payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            logger.warning(f"Invalid webhook signature: {e}")
            return HttpResponse(status=400)

        event_type = event.get("type")
        logger.info(f"Processing webhook event: {event_type}")

        try:
            # Traitement selon le type d'événement
            if event_type == "payment_intent.succeeded":
                self._handle_payment_intent_succeeded(event)
            elif event_type == "payment_intent.payment_failed":
                self._handle_payment_intent_failed(event)
            elif event_type == "checkout.session.completed":
                self._handle_checkout_session_completed(event)
            else:
                logger.info(f"Unhandled event type: {event_type}")

        except Exception as e:
            logger.error(f"Error processing webhook event {event_type}: {e}")
            # Ne pas retourner d'erreur pour éviter que Stripe retente le webhook
            # sauf si c'est vraiment critique

        return HttpResponse(status=200)

    def _handle_payment_intent_succeeded(self, event):
        """Traiter un PaymentIntent réussi"""
        payment_intent = event["data"]["object"]
        payment_intent_id = payment_intent["id"]
        metadata = payment_intent.get("metadata", {})
        
        logger.info(f"Payment intent succeeded: {payment_intent_id}")
        logger.debug(f"Metadata: {metadata}")

        # Vérifier si c'est un paiement divisé
        is_split_payment = metadata.get("split_payment") == "true"
        
        if is_split_payment:
            self._handle_split_payment_success(payment_intent, metadata)
        else:
            self._handle_regular_payment_success(payment_intent, metadata)

    def _handle_split_payment_success(self, payment_intent, metadata):
        """Traiter un paiement divisé réussi"""
        order_id = metadata.get("order_id")
        portion_id = metadata.get("portion_id")
        is_remaining_payment = metadata.get("remaining_payment") == "true"
        
        if not order_id:
            logger.error("No order_id in split payment metadata")
            return

        try:
            order = Order.objects.get(id=order_id)
            
            if not hasattr(order, 'split_payment_session'):
                logger.error(f"No split payment session for order {order_id}")
                return
            
            session = order.split_payment_session
            
            if is_remaining_payment:
                # Paiement de toutes les portions restantes
                self._handle_remaining_payment_success(session, payment_intent["id"])
            elif portion_id:
                # Paiement d'une portion spécifique
                self._handle_single_portion_success(session, portion_id, payment_intent["id"])
            else:
                logger.error("Split payment without portion_id or remaining_payment flag")
                
        except Order.DoesNotExist:
            logger.error(f"Order {order_id} not found for split payment")
        except Exception as e:
            logger.error(f"Error handling split payment success: {e}")

    def _handle_single_portion_success(self, session, portion_id, payment_intent_id):
        """Traiter le succès d'une portion individuelle"""
        try:
            portion = session.portions.get(id=portion_id)
            
            if portion.is_paid:
                logger.warning(f"Portion {portion_id} already marked as paid")
                return
            
            # Marquer la portion comme payée
            portion.mark_as_paid(
                payment_intent_id=payment_intent_id,
                payment_method='online'
            )
            
            logger.info(f"Portion {portion_id} marked as paid")
            
            # Vérifier si toutes les portions sont payées
            if session.is_completed and session.status != 'completed':
                session.mark_as_completed()
                logger.info(f"Split payment session {session.id} completed")
                
                # Envoyer notifications si nécessaire
                self._send_completion_notifications(session.order)
                
        except SplitPaymentPortion.DoesNotExist:
            logger.error(f"Portion {portion_id} not found")
        except Exception as e:
            logger.error(f"Error handling single portion success: {e}")

    def _handle_remaining_payment_success(self, session, payment_intent_id):
        """Traiter le succès du paiement du montant restant"""
        try:
            unpaid_portions = session.portions.filter(is_paid=False)
            
            if not unpaid_portions.exists():
                logger.warning("No unpaid portions found for remaining payment")
                return
            
            # Marquer toutes les portions restantes comme payées
            for portion in unpaid_portions:
                portion.mark_as_paid(
                    payment_intent_id=payment_intent_id,
                    payment_method='online'
                )
            
            logger.info(f"All remaining portions marked as paid for session {session.id}")
            
            # La session devrait être automatiquement complétée par le signal
            if session.status != 'completed':
                session.mark_as_completed()
                
            # Envoyer notifications
            self._send_completion_notifications(session.order)
            
        except Exception as e:
            logger.error(f"Error handling remaining payment success: {e}")

    def _handle_regular_payment_success(self, payment_intent, metadata):
        """Traiter un paiement normal (non divisé)"""
        order_id = metadata.get("order_id")
        
        if not order_id:
            logger.error("No order_id in regular payment metadata")
            return

        try:
            order = Order.objects.get(id=order_id)
            
            if order.payment_status == 'paid':
                logger.warning(f"Order {order_id} already marked as paid")
                return
        
            from api.serializers.order_serializers import OrderPaymentSerializer
            
            serializer = OrderPaymentSerializer(
                order, 
                data={
                    'payment_method': 'online',
                    'payment_status': 'paid'
                }, 
                partial=True
            )
            
            if serializer.is_valid():
                serializer.save()
                logger.info(f"Order {order_id} marked as paid with method 'online'")
            else:
                logger.error(f"Serializer errors: {serializer.errors}")
                
        except Order.DoesNotExist:
            logger.error(f"Order {order_id} not found")
        except Exception as e:
            logger.error(f"Error handling regular payment success: {e}")

    def _handle_payment_intent_failed(self, event):
        """Traiter un échec de PaymentIntent"""
        payment_intent = event["data"]["object"]
        payment_intent_id = payment_intent["id"]
        metadata = payment_intent.get("metadata", {})
        
        logger.warning(f"Payment intent failed: {payment_intent_id}")
        
        order_id = metadata.get("order_id")
        is_split_payment = metadata.get("split_payment") == "true"
        
        if order_id:
            try:
                order = Order.objects.get(id=order_id)
                
                if is_split_payment:
                    # Pour les paiements divisés, on ne change pas le statut global
                    # car d'autres portions peuvent encore être payées
                    logger.info(f"Split payment portion failed for order {order_id}")
                else:
                    # Pour un paiement normal, marquer comme échoué
                    order.payment_status = 'failed'
                    order.save()
                    logger.info(f"Order {order_id} marked as payment failed")
                
                # Envoyer notifications d'échec
                self._send_payment_failure_notifications(order, is_split_payment)
                
            except Order.DoesNotExist:
                logger.error(f"Order {order_id} not found for failed payment")
            except Exception as e:
                logger.error(f"Error handling payment failure: {e}")

    def _handle_checkout_session_completed(self, event):
        """Traiter une session checkout complétée (pour compatibilité)"""
        session = event["data"]["object"]
        metadata = session.get("metadata", {})
        order_id = metadata.get("order_id")
        
        if order_id:
            try:
                order = Order.objects.get(id=order_id)
                if order.payment_status != 'paid':
                    order.payment_status = 'paid'
                    order.payment_method = 'online'
                    order.save()
                    logger.info(f"Order {order_id} marked as paid via checkout session")
            except Order.DoesNotExist:
                logger.error(f"Order {order_id} not found for checkout session")

    def _send_completion_notifications(self, order):
        """Envoyer les notifications de finalisation de commande"""
        try:
            # Ici vous pouvez ajouter la logique pour :
            # - Envoyer un email de confirmation au client
            # - Notifier le restaurant que la commande est payée
            # - Envoyer des notifications push
            # - Déclencher des webhooks tiers
            
            logger.info(f"Split payment completed for order {order.id}")
            
            # Exemple d'intégration avec un système de notifications
            # notification_service.send_order_paid_notification(order)
            
        except Exception as e:
            logger.error(f"Error sending completion notifications: {e}")

    def _send_payment_success_notifications(self, order):
        """Envoyer les notifications de paiement réussi"""
        try:
            logger.info(f"Regular payment completed for order {order.id}")
            
            # Notifications similaires aux paiements divisés
            # notification_service.send_payment_success_notification(order)
            
        except Exception as e:
            logger.error(f"Error sending payment success notifications: {e}")

    def _send_payment_failure_notifications(self, order, is_split_payment=False):
        """Envoyer les notifications d'échec de paiement"""
        try:
            payment_type = "split" if is_split_payment else "regular"
            logger.warning(f"{payment_type.title()} payment failed for order {order.id}")
            
            # Ici vous pouvez ajouter la logique pour :
            # - Notifier le client de l'échec
            # - Proposer des alternatives de paiement
            # - Alerter le support si nécessaire
            
            # notification_service.send_payment_failure_notification(order, is_split_payment)
            
        except Exception as e:
            logger.error(f"Error sending payment failure notifications: {e}")

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

@extend_schema(
    tags=["Paiement Mobile"],
    summary="Mettre à jour le statut de paiement",
)
class UpdatePaymentStatusView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            print(f"📥 Received payment update: {request.data}")
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
                return Response(
                    {'error': 'Not authorized'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            payment_status = request.data.get('payment_status')
            payment_method = request.data.get('payment_method')  # Nouveau champ
            print(f"🔄 Updating order {order_id}: status={payment_status}, method={payment_method}")
            
            if payment_status not in ['paid', 'cash_pending', 'failed']:
                return Response(
                    {'error': 'Invalid payment status'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Mettre à jour le statut
            order.payment_status = payment_status
            
            # Mettre à jour la méthode de paiement si fournie
            if payment_method:
                if payment_method not in ['cash', 'card', 'online']:
                    return Response(
                        {'error': 'Invalid payment method'}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
                order.payment_method = payment_method
            
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