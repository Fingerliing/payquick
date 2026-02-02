"""
Vues de vérification SMS pour EatQuickeR

Supporte:
- Utilisateurs authentifiés (vérification de numéro pour compte existant)
- Utilisateurs non authentifiés (vérification lors de l'inscription)
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db import transaction
from django.utils import timezone
from django.conf import settings
from api.models import PhoneVerification, ClientProfile
from api.services.sms_service import sms_service
from api.serializers.verification_serializers import (
    SendVerificationSerializer, 
    VerifyCodeSerializer
)
from drf_spectacular.utils import (
    extend_schema, 
    OpenApiResponse, 
    OpenApiParameter,
    OpenApiExample
)
from drf_spectacular.types import OpenApiTypes
import logging

logger = logging.getLogger(__name__)


@extend_schema(
    tags=["Vérification • SMS"],
    summary="Envoyer un code de vérification SMS",
    description="""
    Envoie un code de vérification SMS au numéro de téléphone spécifié.
    
    **Fonctionnalités :**
    - Génération d'un code à 6 chiffres
    - Protection contre le spam (délai de 60 secondes entre les envois)
    - Expiration automatique du code après un délai configuré
    - Validation du format du numéro de téléphone
    - Fonctionne avec ou sans authentification
    
    **Cas d'utilisation :**
    - Vérification de numéro pour un utilisateur connecté
    - Vérification de numéro lors de l'inscription (sans compte)
    
    **Limitations :**
    - Un seul code actif par numéro de téléphone
    - Délai minimum de 60 secondes entre les demandes
    - Expiration automatique selon SMS_CODE_EXPIRY_MINUTES
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
                        "expires_in": 300
                    }
                )
            ]
        ),
        400: OpenApiResponse(description="Données invalides"),
        429: OpenApiResponse(description="Trop de tentatives"),
        500: OpenApiResponse(description="Erreur d'envoi SMS")
    }
)
class SendVerificationCodeView(APIView):
    """Envoie un code de vérification SMS"""
    permission_classes = [AllowAny]
    # authentication_classes = []  # Permet les requêtes sans token
    
    def post(self, request):
        serializer = SendVerificationSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        phone_number = serializer.validated_data['phone_number']
        
        # Récupérer l'utilisateur s'il est authentifié
        user = None
        if request.user and request.user.is_authenticated:
            user = request.user
        
        # Construire la requête pour vérifier les tentatives récentes
        # Filtrer par user OU par phone_number si pas d'user
        if user:
            recent_query = PhoneVerification.objects.filter(
                user=user,
                phone_number=phone_number,
                is_verified=False
            )
        else:
            # Sans utilisateur, on filtre uniquement par numéro de téléphone
            recent_query = PhoneVerification.objects.filter(
                user__isnull=True,
                phone_number=phone_number,
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
            verification = PhoneVerification.objects.create(
                user=user,  # Peut être None
                phone_number=phone_number
            )
            verification.generate_code()
            verification.save()
            
            # Envoyer le SMS
            success = sms_service.send_verification_code(phone_number, verification.code)
            
            if success:
                verification.last_resend_at = timezone.now()
                verification.save(update_fields=['last_resend_at'])
                
                return Response({
                    'message': 'Code de vérification envoyé avec succès.',
                    'verification_id': str(verification.id),
                    'expires_in': getattr(settings, 'SMS_CODE_EXPIRY_MINUTES', 5) * 60
                }, status=status.HTTP_200_OK)
            else:
                verification.delete()
                return Response({
                    'error': 'Impossible d\'envoyer le SMS. Veuillez réessayer.'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Vérification • SMS"],
    summary="Vérifier un code SMS",
    description="""
    Vérifie le code SMS reçu et valide le numéro de téléphone.
    
    **Processus de vérification :**
    1. Validation du format du code (6 chiffres)
    2. Vérification de l'expiration du code
    3. Contrôle du nombre de tentatives
    4. Mise à jour du profil client si succès (utilisateur connecté uniquement)
    
    **Identification de la vérification :**
    - Par `verification_id` (recommandé)
    - Par `phone_number`
    - Si utilisateur connecté, filtre aussi par utilisateur
    
    **Sécurité :**
    - Limitation du nombre de tentatives (selon SMS_MAX_ATTEMPTS)
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
class VerifyPhoneCodeView(APIView):
    """Vérifie le code SMS"""
    permission_classes = [AllowAny]
    # authentication_classes = []  # Permet les requêtes sans token
    
    def post(self, request):
        serializer = VerifyCodeSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        code = serializer.validated_data['code']
        verification_id = serializer.validated_data.get('verification_id')
        phone_number = serializer.validated_data.get('phone_number')
        
        # Récupérer l'utilisateur s'il est authentifié
        user = None
        if request.user and request.user.is_authenticated:
            user = request.user
        
        # Construire la requête pour trouver la vérification
        query = PhoneVerification.objects.filter(is_verified=False)
        
        # Filtrer par user si connecté, sinon chercher les vérifications sans user
        if user:
            query = query.filter(user=user)
        else:
            # Pour les utilisateurs non connectés, on peut chercher par:
            # 1. verification_id (plus sûr)
            # 2. phone_number avec user=None
            if not verification_id:
                query = query.filter(user__isnull=True)
        
        # Ajouter les filtres optionnels
        if verification_id:
            query = query.filter(id=verification_id)
        if phone_number:
            query = query.filter(phone_number=phone_number)
            
        verification = query.order_by('-created_at').first()
        
        if not verification:
            return Response({
                'error': 'Aucune vérification en cours trouvée.'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Vérifier l'expiration
        if verification.is_expired():
            return Response({
                'error': 'Le code a expiré. Veuillez en demander un nouveau.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Vérifier le nombre de tentatives
        max_attempts = getattr(settings, 'SMS_MAX_ATTEMPTS', 5)
        if verification.attempts >= max_attempts:
            return Response({
                'error': 'Trop de tentatives. Veuillez demander un nouveau code.'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Vérifier le code
        if verification.code == code:
            with transaction.atomic():
                verification.mark_verified()
                
                # Mettre à jour le profil client si utilisateur connecté
                if user and hasattr(user, 'clientprofile'):
                    try:
                        profile = user.clientprofile
                        profile.phone = verification.phone_number
                        # Ajouter phone_verified si le champ existe
                        if hasattr(profile, 'phone_verified'):
                            profile.phone_verified = True
                            profile.save(update_fields=['phone', 'phone_verified'])
                        else:
                            profile.save(update_fields=['phone'])
                    except Exception as e:
                        logger.warning(f"Erreur mise à jour profil client: {e}")
                
                return Response({
                    'message': 'Numéro de téléphone vérifié avec succès.',
                    'verified': True,
                    'phone_number': verification.phone_number,
                    'verification_id': str(verification.id)
                }, status=status.HTTP_200_OK)
        else:
            verification.increment_attempts()
            remaining = max_attempts - verification.attempts
            return Response({
                'error': 'Code incorrect.',
                'attempts_remaining': remaining
            }, status=status.HTTP_400_BAD_REQUEST)