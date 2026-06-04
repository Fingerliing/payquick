import logging
import stripe
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)
from drf_spectacular.utils import (
    extend_schema, 
    OpenApiParameter, 
    OpenApiResponse, 
    OpenApiExample
)
from drf_spectacular.types import OpenApiTypes
from decimal import Decimal
import uuid

from api.models import (
    Order,
    OrderItem,
    SplitPaymentSession,
    SplitPaymentPortion,
    SplitPaymentItemClaim,
    SessionParticipant,
)
from api.views.payment_views import _is_order_owner
from api.utils.commission_utils import build_stripe_payment_params


def _get_request_participant(request, order):
    """
    Renvoie le SessionParticipant associé à la requête, ou None.
    Priorité : header X-Participant-ID, puis user authentifié.
    """
    collab_session = getattr(order, 'collaborative_session', None)
    if not collab_session:
        return None

    participant_id = (
        request.headers.get('X-Participant-ID', '').strip()
        or request.data.get('participant_id', '')
    )
    if participant_id:
        return SessionParticipant.objects.filter(
            session=collab_session,
            id=participant_id,
            status='active',
        ).first()

    if request.user.is_authenticated:
        return SessionParticipant.objects.filter(
            session=collab_session,
            user=request.user,
            status='active',
        ).first()

    return None


def _broadcast_split_update(order, session):
    """Broadcast un event split_payment_updated au groupe WS de la session collab."""
    try:
        collab_session_id = getattr(order, 'collaborative_session_id', None)
        if not collab_session_id:
            return
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if not channel_layer:
            return
        async_to_sync(channel_layer.group_send)(
            f'session_{collab_session_id}',
            {
                'type': 'split_payment_updated',
                'order_id': str(order.id),
                'session_id': str(collab_session_id),
                'split_session_id': str(session.id),
                'timestamp': timezone.now().isoformat(),
            },
        )
    except Exception as e:
        logger.warning(f"WS notify split_payment_updated failed: {e}")


def _ensure_items_fully_claimed(session):
    """
    Garde-fou : en mode `items`, refuse tout paiement tant que des OrderItem
    ne sont claim par aucune portion. Retourne (ok, err_data, status).
    """
    if session.split_type != 'items':
        return True, None, None
    unclaimed = session.get_unclaimed_order_items()
    unclaimed_count = unclaimed.count()
    if unclaimed_count > 0:
        return False, {
            'error': 'items_not_fully_claimed',
            'message': (
                f"{unclaimed_count} article(s) ne sont pas encore attribués. "
                f"Demandez aux participants de choisir ce qu'ils paient."
            ),
            'unclaimed_count': unclaimed_count,
            'unclaimed_item_ids': list(unclaimed.values_list('id', flat=True)),
        }, status.HTTP_400_BAD_REQUEST
    return True, None, None


def _is_split_payment_participant(request, order):
    """
    Vérifie si l'appelant peut accéder au split payment d'une commande.

    Autorisé si :
    1. L'utilisateur est le propriétaire de la commande (hôte)
    2. L'utilisateur authentifié est un participant actif de la session collaborative
    3. Le header X-Participant-ID correspond à un participant actif de la session

    Cela permet à TOUS les membres d'une session collaborative d'accéder
    à la page de paiement divisé, pas seulement l'hôte.
    """
    # 1. Owner de la commande
    if request.user.is_authenticated and _is_order_owner(request.user, order):
        return True

    # 2/3. Participant de la session collaborative liée à la commande
    collab_session = getattr(order, 'collaborative_session', None)
    if not collab_session:
        return False

    # Chemin auth : utilisateur authentifié → lookup par user
    if request.user.is_authenticated:
        if SessionParticipant.objects.filter(
            session=collab_session,
            user=request.user,
            status='active'
        ).exists():
            return True

    # Chemin guest : header X-Participant-ID
    participant_id = (
        request.headers.get('X-Participant-ID', '').strip()
        or request.data.get('participant_id', '')
    )
    if participant_id:
        if SessionParticipant.objects.filter(
            session=collab_session,
            id=participant_id,
            status='active'
        ).exists():
            return True

    return False
from api.serializers.split_payment_serializers import (
    SplitPaymentSessionSerializer,
    CreateSplitPaymentSessionSerializer,
    PayPortionSerializer,
    ConfirmPortionPaymentSerializer,
    SplitPaymentStatusSerializer,
    PaymentHistorySerializer,
    ClaimItemSerializer,
)

# Configuration Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Créer une session de paiement divisé",
    description="""
    Crée une nouvelle session de paiement divisé pour une commande existante.
    
    **Fonctionnalités :**
    - Division en parts égales ou montants personnalisés
    - Support des pourboires
    - Validation automatique des montants
    - Gestion des permissions utilisateur
    
    **Types de division :**
    - `equal` : Divise le montant total en parts égales
    - `custom` : Permet de spécifier des montants personnalisés
    - `by_item` : Division par article (fonctionnalité future)
    """,
    parameters=[
        OpenApiParameter(
            name='order_id', 
            description='ID de la commande à diviser', 
            required=True, 
            type=OpenApiTypes.INT, 
            location=OpenApiParameter.PATH
        )
    ],
    request=CreateSplitPaymentSessionSerializer,
    responses={
        201: OpenApiResponse(
            response=SplitPaymentSessionSerializer,
            description="Session créée avec succès"
        ),
        400: OpenApiResponse(
            description="Erreur de validation",
            examples=[
                OpenApiExample(
                    "Session déjà existante",
                    value={"error": "Une session de paiement divisé existe déjà pour cette commande"}
                ),
                OpenApiExample(
                    "Montants incorrects", 
                    value={"portions": ["Le total des portions ne correspond pas au montant de la commande"]}
                )
            ]
        ),
        403: OpenApiResponse(
            description="Non autorisé",
            examples=[OpenApiExample("Accès refusé", value={"error": "Non autorisé"})]
        ),
        404: OpenApiResponse(
            description="Commande non trouvée",
            examples=[OpenApiExample("Commande introuvable", value={"error": "Commande non trouvée"})]
        )
    },
    examples=[
        OpenApiExample(
            "Division en 3 parts égales",
            value={
                "split_type": "equal",
                "tip_amount": "5.00",
                "portions": [
                    {"name": "Alice", "amount": "15.00"},
                    {"name": "Bob", "amount": "15.00"},
                    {"name": "Charlie", "amount": "15.00"}
                ]
            }
        ),
        OpenApiExample(
            "Montants personnalisés",
            value={
                "split_type": "custom",
                "tip_amount": "0.00",
                "portions": [
                    {"name": "Alice", "amount": "20.00"},
                    {"name": "Bob", "amount": "10.00"},
                    {"name": "Charlie", "amount": "15.00"}
                ]
            }
        )
    ]
)
class CreateSplitPaymentSessionView(APIView):
    """Créer une session de paiement divisé pour une commande"""
    
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            # Récupérer la commande
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if not _is_order_owner(request.user, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # ── Réutilisation de l'emplacement OneToOne ─────────────────────
            # SplitPaymentSession.order est OneToOne, donc une seule session
            # par commande. Si une existe DÉJÀ (active, cancelled, completed…)
            # et qu'aucune portion n'est payée, on la supprime pour permettre
            # la reconfiguration (changement de mode, etc.). Le cascade Django
            # supprimera aussi les portions et les claims.
            existing = getattr(order, 'split_payment_session', None)
            if existing:
                if existing.portions.filter(is_paid=True).exists():
                    return Response(
                        {'error': 'Une session de paiement divisé existe déjà pour cette commande (des paiements ont déjà été effectués).'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                existing.delete()
            
            # Valider les données
            serializer = CreateSplitPaymentSessionSerializer(
                data=request.data, 
                context={'order': order}
            )
            
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
            validated_data = serializer.validated_data
            split_type = validated_data['split_type']
            
            # Créer la session
            session = SplitPaymentSession.objects.create(
                order=order,
                split_type=split_type,
                total_amount=order.total_amount,
                tip_amount=validated_data.get('tip_amount', 0),
                created_by=request.user
            )
            
            # Créer les portions
            portions_data = validated_data['portions']
            portions = []
            
            for i, portion_data in enumerate(portions_data):
                participant = None
                participant_id = portion_data.get('participant_id')
                if participant_id:
                    participant = SessionParticipant.objects.filter(
                        id=participant_id
                    ).first()

                # Nom : explicite > participant.display_name > fallback générique
                name = portion_data.get('name')
                if not name and participant is not None:
                    name = (
                        getattr(participant, 'display_name', None)
                        or getattr(participant, 'guest_name', None)
                        or f'Personne {i + 1}'
                    )
                if not name:
                    name = f'Personne {i + 1}'

                portion = SplitPaymentPortion.objects.create(
                    session=session,
                    name=name,
                    amount=portion_data.get('amount', 0),
                    participant=participant,
                )
                portions.append(portion)

            # ── Filet de sécurité : sum(portions) doit couvrir le total ──
            # Skip en mode `items` : les montants sont à 0 et seront recalculés
            # au fur et à mesure des claims.
            if split_type != 'items':
                portions_sum = sum(p.amount for p in portions)
                expected_total = order.total_amount + session.tip_amount
                if portions_sum < expected_total:
                    session.delete()
                    logger.error(
                        f"Split session aborted: sum(portions)={portions_sum} "
                        f"< expected={expected_total} for order #{order.id}"
                    )
                    return Response(
                        {'error': f'Le total des portions ({portions_sum}) est inférieur '
                                  f'au montant attendu ({expected_total})'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # Mettre à jour le statut de la commande
            order.payment_status = 'partial_paid'
            order.is_split_payment = True
            order.save()

            # ── Notifier les membres de la session collaborative ──────────────
            try:
                collab_session_id = getattr(order, 'collaborative_session_id', None)
                if collab_session_id:
                    from api.utils.websocket_notifications import notify_split_payment_initiated
                    notify_split_payment_initiated(
                        session_id=str(collab_session_id),
                        order_id=order.id,
                        portions_count=len(portions),
                        total_amount=str(session.total_amount),
                    )
            except Exception as e:
                logger.warning(f"WS notify split_payment_initiated failed: {e}")

            # Retourner la session créée
            response_serializer = SplitPaymentSessionSerializer(session)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception("Unexpected error in split payment view: %s", e)
            return Response(
                {'error': 'An unexpected error occurred. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Récupérer une session de paiement divisé",
    responses={200: SplitPaymentSessionSerializer}
)
class GetSplitPaymentSessionView(APIView):
    """Récupérer une session de paiement divisé existante"""
    
    permission_classes = [AllowAny]
    
    def get(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Récupérer la session
            if not hasattr(order, 'split_payment_session'):
                return Response(
                    {'status': 'not_found'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            session = order.split_payment_session
            serializer = SplitPaymentSessionSerializer(session)
            return Response(serializer.data)
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )

    def delete(self, request, order_id):
        """Annuler la session — délègue à CancelSplitPaymentSessionView."""
        return CancelSplitPaymentSessionView().delete(request, order_id)

@extend_schema(
    tags=["Paiement Divisé"],
    summary="Créer un PaymentIntent pour une portion",
    description="""
    Génère un PaymentIntent Stripe pour payer une portion spécifique du paiement divisé.
    
    **Processus :**
    1. Validation de la portion (non payée, appartient à la session)
    2. Création du PaymentIntent Stripe avec le montant de la portion
    3. Retour du client_secret pour le frontend
    
    **Intégration Frontend :**
    Utilisez le `client_secret` retourné avec Stripe Elements ou Payment Sheet.
    """,
    parameters=[
        OpenApiParameter(
            name='order_id',
            description='ID de la commande',
            required=True,
            type=OpenApiTypes.INT,
            location=OpenApiParameter.PATH
        )
    ],
    request=PayPortionSerializer,
    responses={
        200: OpenApiResponse(
            description="PaymentIntent créé avec succès",
            examples=[
                OpenApiExample(
                    "Succès",
                    value={
                        "client_secret": "pi_1234567890_secret_abcdef",
                        "payment_intent_id": "pi_1234567890",
                        "amount": 15.00
                    }
                )
            ]
        ),
        400: OpenApiResponse(
            description="Erreur de validation",
            examples=[
                OpenApiExample(
                    "Portion déjà payée",
                    value={"error": "Cette portion est déjà payée"}
                ),
                OpenApiExample(
                    "Portion introuvable",
                    value={"error": "Portion non trouvée"}
                )
            ]
        ),
        403: OpenApiResponse(
            description="Non autorisé",
            examples=[OpenApiExample("Accès refusé", value={"error": "Non autorisé"})]
        )
    },
    examples=[
        OpenApiExample(
            "Payer une portion",
            value={"portion_id": "550e8400-e29b-41d4-a716-446655440000"}
        )
    ]
)
class PayPortionView(APIView):
    """Créer un PaymentIntent Stripe pour payer une portion spécifique"""
    
    permission_classes = [AllowAny]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Valider les données
            serializer = PayPortionSerializer(data=request.data)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
            portion_id = serializer.validated_data['portion_id']
            
            # Récupérer la portion
            try:
                portion = SplitPaymentPortion.objects.get(
                    id=portion_id,
                    session__order=order
                )
            except SplitPaymentPortion.DoesNotExist:
                return Response(
                    {'error': 'Portion non trouvée'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            if portion.is_paid:
                return Response(
                    {'error': 'Cette portion est déjà payée'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # ── Garde-fou mode `items` : tous les articles doivent être claim ──
            ok, err_data, err_status = _ensure_items_fully_claimed(portion.session)
            if not ok:
                return Response(err_data, status=err_status)

            # ── Garde-fou Stripe : montant >= 0.50 € ──
            min_amount = Decimal('0.50')
            if Decimal(str(portion.amount)) < min_amount:
                return Response(
                    {
                        'error': 'amount_below_stripe_minimum',
                        'message': (
                            f"Le montant de cette part ({portion.amount} €) est inférieur "
                            f"au minimum accepté par Stripe (0,50 €)."
                        ),
                        'portion_amount': str(portion.amount),
                        'min_amount': str(min_amount),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            # Créer le PaymentIntent
            amount_cents = int(portion.amount * 100)  # Convertir en centimes

            # Commission centralisée + transfer vers le compte du restaurateur
            connect_params = build_stripe_payment_params(
                amount_cents, order.restaurant.owner
            )

            intent_params = {
                'amount': amount_cents,
                'currency': 'eur',
                'metadata': {
                    'order_id': str(order.id),
                    'portion_id': str(portion.id),
                    'split_payment': 'true'
                },
                'automatic_payment_methods': {'enabled': True},
                **connect_params,
            }

            payment_intent = stripe.PaymentIntent.create(**intent_params)
            
            return Response({
                'client_secret': payment_intent.client_secret,
                'payment_intent_id': payment_intent.id,
                'amount': float(portion.amount)
            })
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception("Unexpected error in split payment view: %s", e)
            return Response(
                {'error': 'An unexpected error occurred. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Confirmer le paiement d'une portion",
    request=ConfirmPortionPaymentSerializer
)
class ConfirmPortionPaymentView(APIView):
    """Confirmer qu'une portion a été payée avec succès"""
    
    permission_classes = [AllowAny]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Valider les données
            serializer = ConfirmPortionPaymentSerializer(data=request.data)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
            validated_data = serializer.validated_data
            
            # Récupérer la portion
            try:
                portion = SplitPaymentPortion.objects.get(
                    id=validated_data['portion_id'],
                    session__order=order
                )
            except SplitPaymentPortion.DoesNotExist:
                return Response(
                    {'error': 'Portion non trouvée'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Marquer comme payée
            portion.mark_as_paid(
                payment_intent_id=validated_data['payment_intent_id'],
                user=request.user,
                payment_method=validated_data.get('payment_method', 'online')
            )
            
            # Vérifier si la session est terminée
            session = portion.session
            if session.is_completed:
                return Response({
                    'success': True,
                    'session_completed': True,
                    'message': 'Tous les paiements ont été effectués. Commande finalisée.'
                })
            
            return Response({
                'success': True,
                'session_completed': False,
                'remaining_amount': float(session.remaining_amount),
                'remaining_portions': session.remaining_portions_count
            })
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception("Unexpected error in split payment view: %s", e)
            return Response(
                {'error': 'An unexpected error occurred. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Payer toutes les portions restantes"
)
class PayRemainingPortionsView(APIView):
    """Créer un PaymentIntent pour toutes les portions non payées"""
    
    permission_classes = [AllowAny]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Récupérer la session
            if not hasattr(order, 'split_payment_session'):
                return Response(
                    {'error': 'Aucune session de paiement divisé trouvée'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            session = order.split_payment_session
            unpaid_portions = session.portions.filter(is_paid=False)
            
            if not unpaid_portions.exists():
                return Response(
                    {'error': 'Toutes les portions sont déjà payées'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # ── Garde-fou mode `items` : tous les articles doivent être claim ──
            ok, err_data, err_status = _ensure_items_fully_claimed(session)
            if not ok:
                return Response(err_data, status=err_status)
            
            # Calculer le montant total restant
            remaining_amount = sum(portion.amount for portion in unpaid_portions)
            amount_cents = int(remaining_amount * 100)

            # Commission centralisée + transfer vers le compte du restaurateur
            connect_params = build_stripe_payment_params(
                amount_cents, order.restaurant.owner
            )

            intent_params = {
                'amount': amount_cents,
                'currency': 'eur',
                'metadata': {
                    'order_id': str(order.id),
                    'split_payment': 'true',
                    'remaining_payment': 'true',
                    'portion_ids': ','.join(str(p.id) for p in unpaid_portions)
                },
                'automatic_payment_methods': {'enabled': True},
                **connect_params,
            }

            payment_intent = stripe.PaymentIntent.create(**intent_params)
            
            return Response({
                'client_secret': payment_intent.client_secret,
                'payment_intent_id': payment_intent.id,
                'amount': float(remaining_amount),
                'portion_ids': [str(p.id) for p in unpaid_portions]
            })
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception("Unexpected error in split payment view: %s", e)
            return Response(
                {'error': 'An unexpected error occurred. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Confirmer le paiement de toutes les portions restantes"
)
class ConfirmRemainingPaymentsView(APIView):
    """Confirmer que toutes les portions restantes ont été payées"""
    
    permission_classes = [AllowAny]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            payment_intent_id = request.data.get('payment_intent_id')
            if not payment_intent_id:
                return Response(
                    {'error': 'payment_intent_id requis'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Récupérer la session
            session = order.split_payment_session
            unpaid_portions = session.portions.filter(is_paid=False)
            
            # Marquer toutes les portions restantes comme payées
            for portion in unpaid_portions:
                portion.mark_as_paid(
                    payment_intent_id=payment_intent_id,
                    user=request.user,
                    payment_method='online'
                )
            
            return Response({
                'success': True,
                'session_completed': True,
                'message': 'Tous les paiements ont été effectués. Commande finalisée.'
            })
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.exception("Unexpected error in split payment view: %s", e)
            return Response(
                {'error': 'An unexpected error occurred. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Vérifier le statut du paiement divisé",
    description="""
    Retourne l'état actuel d'une session de paiement divisé.
    
    **Informations fournies :**
    - Statut de completion (toutes les portions payées ou non)
    - Montant restant à payer
    - Nombre de portions non payées
    - Pourcentage de progression
    - Montant total déjà payé
    
    **Utilisation :**
    Idéal pour les mises à jour en temps réel dans l'interface utilisateur.
    """,
    parameters=[
        OpenApiParameter(
            name='order_id',
            description='ID de la commande',
            required=True,
            type=OpenApiTypes.INT,
            location=OpenApiParameter.PATH
        )
    ],
    responses={
        200: OpenApiResponse(
            response=SplitPaymentStatusSerializer,
            description="Statut récupéré avec succès",
            examples=[
                OpenApiExample(
                    "Paiement en cours",
                    value={
                        "is_completed": False,
                        "remaining_amount": "30.00",
                        "remaining_portions": 2,
                        "total_paid": "15.00",
                        "progress_percentage": 33.33
                    }
                ),
                OpenApiExample(
                    "Paiement terminé",
                    value={
                        "is_completed": True,
                        "remaining_amount": "0.00",
                        "remaining_portions": 0,
                        "total_paid": "45.00",
                        "progress_percentage": 100.0
                    }
                )
            ]
        ),
        404: OpenApiResponse(
            description="Session non trouvée",
            examples=[
                OpenApiExample(
                    "Pas de session",
                    value={"error": "Aucune session de paiement divisé trouvée"}
                )
            ]
        )
    }
)
class SplitPaymentStatusView(APIView):
    """Vérifier le statut d'un paiement divisé"""
    
    permission_classes = [AllowAny]
    
    def get(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            if not hasattr(order, 'split_payment_session'):
                return Response(
                    {'error': 'Aucune session de paiement divisé trouvée'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            session = order.split_payment_session
            total_with_tip = session.total_amount + session.tip_amount
            
            progress_percentage = 0
            if total_with_tip > 0:
                progress_percentage = (session.total_paid / total_with_tip) * 100
            
            data = {
                'is_completed': session.is_completed,
                'remaining_amount': session.remaining_amount,
                'remaining_portions': session.remaining_portions_count,
                'total_paid': session.total_paid,
                'progress_percentage': min(100, max(0, progress_percentage))
            }
            
            return Response(data)
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Finaliser le paiement divisé"
)
class CompleteSplitPaymentView(APIView):
    """Finaliser une session de paiement divisé"""
    
    permission_classes = [AllowAny]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            session = order.split_payment_session
            
            if not session.is_completed:
                return Response(
                    {'error': 'Tous les paiements ne sont pas encore effectués'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            # ── Filet de sécurité : vérifier que le montant payé couvre le total ──
            if session.total_paid < order.total_amount:
                logger.error(
                    f"Split completion refused: total_paid={session.total_paid} "
                    f"< order total={order.total_amount} for order #{order.id}"
                )
                return Response(
                    {'error': 'Le montant total payé ne couvre pas le montant de la commande'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Finaliser la session si pas déjà fait
            if session.status != 'completed':
                session.mark_as_completed()

            # Marquer la commande comme payée — le webhook fait pareil
            # (idempotent : on vérifie avant d'écrire)
            if order.payment_status != 'paid':
                order.payment_status = 'paid'
                order.payment_method = 'online'
                order.save(update_fields=['payment_status', 'payment_method'])
                logger.info(f"Order #{order.id} marked as paid via CompleteSplitPaymentView")
            else:
                logger.info(
                    f"Split session finalisée pour commande #{order.id} "
                    f"— payment_status déjà : {order.payment_status}"
                )

            return Response({
                'success': True,
                'message': 'Session de paiement divisé finalisée',
                'payment_status': order.payment_status,
            })
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Annuler une session de paiement divisé"
)
class CancelSplitPaymentSessionView(APIView):
    """Annuler une session de paiement divisé"""
    
    permission_classes = [AllowAny]
    
    def delete(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation (owner OU participant de la session)
            if not _is_split_payment_participant(request, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            if not hasattr(order, 'split_payment_session'):
                return Response(
                    {'error': 'Aucune session de paiement divisé trouvée'},
                    status=status.HTTP_404_NOT_FOUND
                )

            session = order.split_payment_session

            # Cas 1 : l'order a été payée normalement → nettoyer le split orphelin
            if order.payment_status == 'paid':
                session.status = 'cancelled'
                session.cancelled_at = timezone.now()
                session.save()
                order.is_split_payment = False
                order.save(update_fields=['is_split_payment'])
                return Response({'success': True, 'message': 'Session split orpheline annulée'})
            
            # Cas 2 : des portions ont déjà été payées → refuser
            if session.portions.filter(is_paid=True).exists():
                return Response(
                    {'error': 'Impossible d\'annuler: des paiements ont déjà été effectués'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Cas 3 : aucun paiement → annulation classique
            session.status = 'cancelled'
            session.cancelled_at = timezone.now()
            session.save()
            
            order.payment_status = 'unpaid'
            order.is_split_payment = False
            order.save()
            
            return Response({'success': True, 'message': 'Session de paiement divisé annulée'})
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Historique des paiements divisés",
    responses={200: PaymentHistorySerializer}
)
class SplitPaymentHistoryView(APIView):
    """Récupérer l'historique des paiements pour une commande"""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if not _is_order_owner(request.user, order):
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            if not hasattr(order, 'split_payment_session'):
                return Response(
                    {'error': 'Aucune session de paiement divisé trouvée'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            session = order.split_payment_session
            portions = session.portions.all()
            
            from api.serializers.split_payment_serializers import SplitPaymentPortionSerializer
            
            data = {
                'portions': SplitPaymentPortionSerializer(portions, many=True).data,
                'total_paid': session.total_paid,
                'total_remaining': session.remaining_amount
            }
            
            return Response(data)
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )

# ──────────────────────────────────────────────────────────────────────────
# Mode `items` — claim/unclaim d'un OrderItem sur une portion
# ──────────────────────────────────────────────────────────────────────────


def _can_modify_portion(request, order, portion):
    """
    Autorisation pour claim/unclaim :
    - L'hôte (order owner) peut modifier toutes les portions.
    - Un participant ne peut modifier QUE sa propre portion.
    """
    if request.user.is_authenticated and _is_order_owner(request.user, order):
        return True
    participant = _get_request_participant(request, order)
    if participant is None:
        return False
    return portion.participant_id == participant.id


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Claim un article sur une portion (mode `items`)",
    request=ClaimItemSerializer,
)
class ClaimItemView(APIView):
    """Lier un OrderItem à une portion. Recalcul automatique des montants."""

    permission_classes = [AllowAny]

    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)

            if not _is_split_payment_participant(request, order):
                return Response({'error': 'Non autorisé'}, status=status.HTTP_403_FORBIDDEN)

            serializer = ClaimItemSerializer(data=request.data)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            portion_id = serializer.validated_data['portion_id']
            order_item_id = serializer.validated_data['order_item_id']

            try:
                portion = SplitPaymentPortion.objects.select_related('session').get(
                    id=portion_id,
                    session__order=order,
                )
            except SplitPaymentPortion.DoesNotExist:
                return Response({'error': 'Portion non trouvée'}, status=status.HTTP_404_NOT_FOUND)

            if portion.session.split_type != 'items':
                return Response(
                    {'error': 'Cette session n\'est pas en mode "items"'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if portion.is_paid:
                return Response(
                    {'error': 'Cette portion est déjà payée et ne peut plus être modifiée'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not _can_modify_portion(request, order, portion):
                return Response(
                    {'error': 'Vous ne pouvez modifier que votre propre part'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            try:
                order_item = OrderItem.objects.get(id=order_item_id, order=order)
            except OrderItem.DoesNotExist:
                return Response(
                    {'error': 'Article non trouvé dans cette commande'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            # Création idempotente : si le claim existe déjà, on ne fait rien
            SplitPaymentItemClaim.objects.get_or_create(
                portion=portion,
                order_item=order_item,
            )

            # Recalcul des montants pour toutes les portions non payées
            portion.session.recompute_portions_from_claims()

            session = SplitPaymentSession.objects.get(id=portion.session.id)
            _broadcast_split_update(order, session)

            return Response(SplitPaymentSessionSerializer(session).data)

        except Order.DoesNotExist:
            return Response({'error': 'Commande non trouvée'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Unexpected error in ClaimItemView: %s", e)
            return Response(
                {'error': 'An unexpected error occurred. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Unclaim un article d'une portion (mode `items`)",
    request=ClaimItemSerializer,
)
class UnclaimItemView(APIView):
    """Délier un OrderItem d'une portion. Recalcul automatique des montants."""

    permission_classes = [AllowAny]

    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)

            if not _is_split_payment_participant(request, order):
                return Response({'error': 'Non autorisé'}, status=status.HTTP_403_FORBIDDEN)

            serializer = ClaimItemSerializer(data=request.data)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            portion_id = serializer.validated_data['portion_id']
            order_item_id = serializer.validated_data['order_item_id']

            try:
                portion = SplitPaymentPortion.objects.select_related('session').get(
                    id=portion_id,
                    session__order=order,
                )
            except SplitPaymentPortion.DoesNotExist:
                return Response({'error': 'Portion non trouvée'}, status=status.HTTP_404_NOT_FOUND)

            if portion.session.split_type != 'items':
                return Response(
                    {'error': 'Cette session n\'est pas en mode "items"'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if portion.is_paid:
                return Response(
                    {'error': 'Cette portion est déjà payée et ne peut plus être modifiée'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not _can_modify_portion(request, order, portion):
                return Response(
                    {'error': 'Vous ne pouvez modifier que votre propre part'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            SplitPaymentItemClaim.objects.filter(
                portion=portion,
                order_item_id=order_item_id,
            ).delete()

            portion.session.recompute_portions_from_claims()

            session = SplitPaymentSession.objects.get(id=portion.session.id)
            _broadcast_split_update(order, session)

            return Response(SplitPaymentSessionSerializer(session).data)

        except Order.DoesNotExist:
            return Response({'error': 'Commande non trouvée'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.exception("Unexpected error in UnclaimItemView: %s", e)
            return Response(
                {'error': 'An unexpected error occurred. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )