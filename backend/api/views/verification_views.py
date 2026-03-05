"""
Vues de vérification par email pour EatQuickeR

Supporte:
- Utilisateurs authentifiés (vérification d'email pour compte existant)
- Utilisateurs non authentifiés (vérification lors de l'inscription)
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from api.models import EmailVerification, ClientProfile
from api.services.email_verification_service import email_verification_service
from api.serializers.verification_serializers import (
    SendVerificationSerializer,
    VerifyCodeSerializer
)
from drf_spectacular.utils import (
    extend_schema,
    OpenApiResponse,
    OpenApiExample
)
import logging

logger = logging.getLogger(__name__)


@extend_schema(
    tags=["Vérification • Email"],
    summary="Envoyer un code de vérification par email",
    description="""
    Envoie un code de vérification à 6 chiffres à l'adresse email spécifiée.

    **Fonctionnalités :**
    - Génération d'un code à 6 chiffres
    - Protection anti-spam (délai de 60 secondes entre les envois)
    - Expiration automatique du code
    - Fonctionne avec ou sans authentification

    **Limitations :**
    - Un seul code actif par adresse email
    - Délai minimum de 60 secondes entre les demandes
    """,
    request=SendVerificationSerializer,
    responses={
        200: OpenApiResponse(
            description="Code envoyé avec succès",
            examples=[
                OpenApiExample(
                    "Succès",
                    value={
                        "message": "Code de vérification envoyé avec succès.",
                        "verification_id": "123e4567-e89b-12d3-a456-426614174000",
                        "expires_in": 600
                    }
                )
            ]
        ),
        400: OpenApiResponse(description="Données invalides"),
        429: OpenApiResponse(description="Trop de tentatives"),
        500: OpenApiResponse(description="Erreur d'envoi email")
    }
)
class SendVerificationCodeView(APIView):
    """Envoie un code de vérification par email"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SendVerificationSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        email = serializer.validated_data['email']

        # Récupérer l'utilisateur s'il est authentifié
        user = None
        if request.user and request.user.is_authenticated:
            user = request.user

        # Vérifier les tentatives récentes
        if user:
            recent_query = EmailVerification.objects.filter(
                user=user,
                email=email,
                is_verified=False
            )
        else:
            recent_query = EmailVerification.objects.filter(
                user__isnull=True,
                email=email,
                is_verified=False
            )

        recent_verification = recent_query.order_by('-created_at').first()

        if recent_verification and not recent_verification.is_expired():
            if not recent_verification.can_resend():
                return Response({
                    'error': 'Veuillez attendre avant de renvoyer un code.',
                    'retry_after': getattr(settings, 'SMS_RESEND_COOLDOWN_SECONDS', 60)
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # Créer une nouvelle vérification
        with transaction.atomic():
            verification = EmailVerification.objects.create(
                user=user,
                email=email
            )
            verification.generate_code()
            verification.save()

            success = email_verification_service.send_verification_code(email, verification.code)

            if success:
                verification.last_resend_at = timezone.now()
                verification.save(update_fields=['last_resend_at'])

                return Response({
                    'message': 'Code de vérification envoyé avec succès.',
                    'verification_id': str(verification.id),
                    'expires_in': getattr(settings, 'SMS_CODE_EXPIRY_MINUTES', 10) * 60
                }, status=status.HTTP_200_OK)
            else:
                verification.delete()
                return Response({
                    'error': "Impossible d'envoyer l'email. Veuillez réessayer."
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Vérification • Email"],
    summary="Vérifier un code email",
    description="""
    Vérifie le code reçu par email et valide l'adresse.

    **Identification de la vérification :**
    - Par `verification_id` (recommandé)
    - Par `email`

    **Sécurité :**
    - Limitation du nombre de tentatives
    - Expiration automatique des codes
    - Invalidation après vérification réussie
    """,
    request=VerifyCodeSerializer,
    responses={
        200: OpenApiResponse(description="Code vérifié avec succès"),
        400: OpenApiResponse(description="Code incorrect ou expiré"),
        404: OpenApiResponse(description="Aucune vérification trouvée"),
        429: OpenApiResponse(description="Trop de tentatives")
    }
)
class VerifyEmailCodeView(APIView):
    """Vérifie le code email"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyCodeSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        code = serializer.validated_data['code']
        verification_id = serializer.validated_data.get('verification_id')
        email = serializer.validated_data.get('email')

        user = None
        if request.user and request.user.is_authenticated:
            user = request.user

        query = EmailVerification.objects.filter(is_verified=False)

        if user:
            query = query.filter(user=user)
        else:
            if not verification_id:
                query = query.filter(user__isnull=True)

        if verification_id:
            query = query.filter(id=verification_id)
        if email:
            query = query.filter(email=email)

        verification = query.order_by('-created_at').first()

        if not verification:
            return Response({
                'error': 'Aucune vérification en cours trouvée.'
            }, status=status.HTTP_404_NOT_FOUND)

        if verification.is_expired():
            return Response({
                'error': 'Le code a expiré. Veuillez en demander un nouveau.'
            }, status=status.HTTP_400_BAD_REQUEST)

        max_attempts = getattr(settings, 'SMS_MAX_ATTEMPTS', 3)
        if verification.attempts >= max_attempts:
            return Response({
                'error': 'Trop de tentatives. Veuillez demander un nouveau code.'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        if verification.code == code:
            with transaction.atomic():
                verification.mark_verified()

                # Mettre à jour le profil client si utilisateur connecté
                if user and hasattr(user, 'clientprofile'):
                    try:
                        profile = user.clientprofile
                        if hasattr(profile, 'email_verified'):
                            profile.email_verified = True
                            profile.save(update_fields=['email_verified'])
                    except Exception as e:
                        logger.warning(f"Erreur mise à jour profil client: {e}")

                return Response({
                    'message': 'Adresse email vérifiée avec succès.',
                    'verified': True,
                    'email': verification.email,
                    'verification_id': str(verification.id)
                }, status=status.HTTP_200_OK)
        else:
            verification.increment_attempts()
            remaining = max_attempts - verification.attempts
            return Response({
                'error': 'Code incorrect.',
                'attempts_remaining': remaining
            }, status=status.HTTP_400_BAD_REQUEST)