from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
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
    
    **Limitations :**
    - Un seul code actif par utilisateur et numéro
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
        400: OpenApiResponse(
            description="Données invalides",
            examples=[
                OpenApiExample(
                    "Numéro invalide",
                    value={
                        "phone_number": ["Numéro de téléphone invalide"]
                    }
                )
            ]
        ),
        429: OpenApiResponse(
            description="Trop de tentatives",
            examples=[
                OpenApiExample(
                    "Délai non respecté",
                    value={
                        "error": "Veuillez attendre avant de renvoyer un code.",
                        "retry_after": 60
                    }
                )
            ]
        ),
        500: OpenApiResponse(
            description="Erreur d'envoi SMS",
            examples=[
                OpenApiExample(
                    "Échec SMS",
                    value={
                        "error": "Impossible d'envoyer le SMS. Veuillez réessayer."
                    }
                )
            ]
        )
    },
    examples=[
        OpenApiExample(
            "Numéro français",
            value={
                "phone_number": "+33123456789"
            }
        ),
        OpenApiExample(
            "Numéro international",
            value={
                "phone_number": "+1234567890"
            }
        )
    ]
)
class SendVerificationCodeView(APIView):
    """Envoie un code de vérification SMS"""
    permission_classes = []
    
    def post(self, request):
        serializer = SendVerificationSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        phone_number = serializer.validated_data['phone_number']
        user = request.user
        
        # Vérifier les tentatives récentes
        recent_verification = PhoneVerification.objects.filter(
            user=user,
            phone_number=phone_number,
            is_verified=False
        ).order_by('-created_at').first()
        
        if recent_verification and not recent_verification.is_expired():
            if not recent_verification.can_resend():
                return Response({
                    'error': 'Veuillez attendre avant de renvoyer un code.',
                    'retry_after': 60
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Créer une nouvelle vérification
        with transaction.atomic():
            verification = PhoneVerification.objects.create(
                user=user,
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
                    'verification_id': verification.id,
                    'expires_in': settings.SMS_CODE_EXPIRY_MINUTES * 60
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
    4. Mise à jour du profil client si succès
    
    **Sécurité :**
    - Limitation du nombre de tentatives (selon SMS_MAX_ATTEMPTS)
    - Expiration automatique des codes
    - Invalidation après vérification réussie
    
    **Mise à jour automatique :**
    En cas de succès, met automatiquement à jour le profil client avec :
    - Le numéro de téléphone vérifié
    - Le statut phone_verified = True
    """,
    request=VerifyCodeSerializer,
    responses={
        200: OpenApiResponse(
            description="Code vérifié avec succès",
            examples=[
                OpenApiExample(
                    "Succès",
                    value={
                        "message": "Numéro de téléphone vérifié avec succès.",
                        "verified": True
                    }
                )
            ]
        ),
        400: OpenApiResponse(
            description="Code incorrect ou expiré",
            examples=[
                OpenApiExample(
                    "Code incorrect",
                    value={
                        "error": "Code incorrect.",
                        "attempts_remaining": 2
                    }
                ),
                OpenApiExample(
                    "Code expiré",
                    value={
                        "error": "Le code a expiré. Veuillez en demander un nouveau."
                    }
                ),
                OpenApiExample(
                    "Format invalide",
                    value={
                        "code": ["Le code doit contenir exactement 6 chiffres"]
                    }
                )
            ]
        ),
        404: OpenApiResponse(
            description="Aucune vérification trouvée",
            examples=[
                OpenApiExample(
                    "Vérification introuvable",
                    value={
                        "error": "Aucune vérification en cours trouvée."
                    }
                )
            ]
        ),
        429: OpenApiResponse(
            description="Trop de tentatives",
            examples=[
                OpenApiExample(
                    "Limite atteinte",
                    value={
                        "error": "Trop de tentatives. Veuillez demander un nouveau code."
                    }
                )
            ]
        )
    },
    examples=[
        OpenApiExample(
            "Vérification avec ID",
            value={
                "code": "123456",
                "verification_id": "123e4567-e89b-12d3-a456-426614174000"
            }
        ),
        OpenApiExample(
            "Vérification avec numéro",
            value={
                "code": "123456",
                "phone_number": "+33123456789"
            }
        ),
        OpenApiExample(
            "Vérification code seul",
            value={
                "code": "123456"
            }
        )
    ]
)
class VerifyPhoneCodeView(APIView):
    """Vérifie le code SMS"""
    permission_classes = []
    
    def post(self, request):
        serializer = VerifyCodeSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        code = serializer.validated_data['code']
        verification_id = serializer.validated_data.get('verification_id')
        phone_number = serializer.validated_data.get('phone_number')
        
        # Trouver la vérification
        query = PhoneVerification.objects.filter(
            user=request.user,
            is_verified=False
        )
        
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
        if verification.attempts >= settings.SMS_MAX_ATTEMPTS:
            return Response({
                'error': 'Trop de tentatives. Veuillez demander un nouveau code.'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Vérifier le code
        if verification.code == code:
            with transaction.atomic():
                verification.mark_verified()
                
                # Mettre à jour le profil client
                if hasattr(request.user, 'client_profile'):
                    profile = request.user.client_profile
                    profile.telephone = verification.phone_number
                    profile.phone_verified = True
                    profile.save(update_fields=['telephone', 'phone_verified'])
                
                return Response({
                    'message': 'Numéro de téléphone vérifié avec succès.',
                    'verified': True
                }, status=status.HTTP_200_OK)
        else:
            verification.increment_attempts()
            return Response({
                'error': 'Code incorrect.',
                'attempts_remaining': settings.SMS_MAX_ATTEMPTS - verification.attempts
            }, status=status.HTTP_400_BAD_REQUEST)