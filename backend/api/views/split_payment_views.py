import stripe
from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import (
    extend_schema, 
    OpenApiParameter, 
    OpenApiResponse, 
    OpenApiExample
)
from drf_spectacular.types import OpenApiTypes
from decimal import Decimal
import uuid

from api.models import Order, SplitPaymentSession, SplitPaymentPortion
from api.serializers.split_payment_serializers import (
    SplitPaymentSessionSerializer,
    CreateSplitPaymentSessionSerializer,
    PayPortionSerializer,
    ConfirmPortionPaymentSerializer,
    SplitPaymentStatusSerializer,
    PaymentHistorySerializer
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
            if order.user and order.user != request.user:
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Vérifier qu'il n'y a pas déjà une session active
            if hasattr(order, 'split_payment_session') and order.split_payment_session.status == 'active':
                return Response(
                    {'error': 'Une session de paiement divisé existe déjà pour cette commande'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Valider les données
            serializer = CreateSplitPaymentSessionSerializer(
                data=request.data, 
                context={'order': order}
            )
            
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
            validated_data = serializer.validated_data
            
            # Créer la session
            session = SplitPaymentSession.objects.create(
                order=order,
                split_type=validated_data['split_type'],
                total_amount=order.total_amount,
                tip_amount=validated_data.get('tip_amount', 0),
                created_by=request.user
            )
            
            # Créer les portions
            portions_data = validated_data['portions']
            portions = []
            
            for i, portion_data in enumerate(portions_data):
                portion = SplitPaymentPortion.objects.create(
                    session=session,
                    name=portion_data.get('name') or f'Personne {i + 1}',
                    amount=portion_data['amount']
                )
                portions.append(portion)
            
            # Mettre à jour le statut de la commande
            order.payment_status = 'partial_paid'
            order.is_split_payment = True
            order.save()
            
            # Retourner la session créée
            response_serializer = SplitPaymentSessionSerializer(session)
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)
            
        except Order.DoesNotExist:
            return Response(
                {'error': 'Commande non trouvée'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Récupérer une session de paiement divisé",
    responses={200: SplitPaymentSessionSerializer}
)
class GetSplitPaymentSessionView(APIView):
    """Récupérer une session de paiement divisé existante"""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
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
    
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
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
            
            # Créer le PaymentIntent
            amount_cents = int(portion.amount * 100)  # Convertir en centimes
            
            # Commission 2% (optionnel, selon votre modèle business)
            platform_fee_cents = amount_cents * 2 // 100
            
            payment_intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency='eur',
                metadata={
                    'order_id': str(order.id),
                    'portion_id': str(portion.id),
                    'split_payment': 'true'
                },
                automatic_payment_methods={'enabled': True},
                # application_fee_amount=platform_fee_cents,  # Décommentez si vous voulez une commission
            )
            
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
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Confirmer le paiement d'une portion",
    request=ConfirmPortionPaymentSerializer
)
class ConfirmPortionPaymentView(APIView):
    """Confirmer qu'une portion a été payée avec succès"""
    
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
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
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Payer toutes les portions restantes"
)
class PayRemainingPortionsView(APIView):
    """Créer un PaymentIntent pour toutes les portions non payées"""
    
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
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
            
            # Calculer le montant total restant
            remaining_amount = sum(portion.amount for portion in unpaid_portions)
            amount_cents = int(remaining_amount * 100)
            
            # Créer le PaymentIntent
            payment_intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency='eur',
                metadata={
                    'order_id': str(order.id),
                    'split_payment': 'true',
                    'remaining_payment': 'true',
                    'portion_ids': ','.join(str(p.id) for p in unpaid_portions)
                },
                automatic_payment_methods={'enabled': True},
            )
            
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
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    tags=["Paiement Divisé"],
    summary="Confirmer le paiement de toutes les portions restantes"
)
class ConfirmRemainingPaymentsView(APIView):
    """Confirmer que toutes les portions restantes ont été payées"""
    
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
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
            return Response(
                {'error': str(e)}, 
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
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
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
    
    permission_classes = [IsAuthenticated]
    
    def post(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
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
            
            # Finaliser la session si pas déjà fait
            if session.status != 'completed':
                session.mark_as_completed()
            
            return Response({'success': True, 'message': 'Paiement divisé finalisé'})
            
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
    
    permission_classes = [IsAuthenticated]
    
    def delete(self, request, order_id):
        try:
            order = Order.objects.get(id=order_id)
            
            # Vérifier l'autorisation
            if order.user and order.user != request.user:
                return Response(
                    {'error': 'Non autorisé'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            session = order.split_payment_session
            
            # Vérifier qu'aucun paiement n'a été effectué
            if session.portions.filter(is_paid=True).exists():
                return Response(
                    {'error': 'Impossible d\'annuler: des paiements ont déjà été effectués'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Annuler la session
            session.status = 'cancelled'
            session.cancelled_at = timezone.now()
            session.save()
            
            # Remettre le statut de la commande
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
            if order.user and order.user != request.user:
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