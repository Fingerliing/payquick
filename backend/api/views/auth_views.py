from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from django.conf import settings
from django.db import transaction, IntegrityError
from drf_spectacular.utils import extend_schema
import logging
import random
import string

from api.models import ClientProfile, RestaurateurProfile, Restaurant, Order, Menu, PendingRegistration
from api.serializers import (
    RegisterSerializer,
    UserResponseSerializer,
    InitiateRegistrationSerializer,
    VerifyRegistrationSerializer,
    ResendCodeSerializer
)
from api.throttles import RegisterThrottle
from api.services.email_verification_service import email_verification_service

logger = logging.getLogger(__name__)


@extend_schema(
    tags=["Auth"],
    summary="Inscription",
    description="Crée un nouvel utilisateur et retourne les tokens JWT.",
    request=RegisterSerializer,
    responses={
        201: {
            'type': 'object',
            'properties': {
                'access': {'type': 'string'},
                'refresh': {'type': 'string'},
                'user': {
                    'type': 'object',
                    'properties': {
                        'username': {'type': 'string'},
                        'email': {'type': 'string'},
                        'first_name': {'type': 'string'},
                        'role': {'type': 'string'},
                    }
                }
            }
        },
        400: {'description': 'Erreur de validation'}
    }
)
class RegisterView(APIView):
    """
    Crée un nouvel utilisateur (client ou restaurateur) et retourne les tokens JWT.
    Accessible sans authentification.
    """
    throttle_classes = [RegisterThrottle]

    def post(self, request):
        # Ne pas logger request.data — contient le mot de passe en clair
        logger.info("Tentative d'inscription")

        serializer = RegisterSerializer(data=request.data)

        if not serializer.is_valid():
            logger.error(f"Erreurs de validation: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = serializer.save()
            logger.info(f"Utilisateur créé avec succès: {user.username}")

            refresh = RefreshToken.for_user(user)
            user_data = UserResponseSerializer(user).data

            response_data = {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": user_data
            }

            logger.info(f"Inscription réussie pour l'utilisateur: {user.username}")
            return Response(response_data, status=status.HTTP_201_CREATED)

        except IntegrityError as e:
            logger.error(f"Erreur d'intégrité lors de l'inscription: {str(e)}")
            return Response(
                {'email': ['Cet email est déjà utilisé.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            logger.error(f"Erreur inattendue lors de l'inscription: {str(e)}")
            return Response(
                {'error': "Une erreur inattendue s'est produite lors de l'inscription.", 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RegisterViewDetailed(APIView):
    """Version avec gestion d'erreurs plus détaillée"""
    throttle_classes = [RegisterThrottle]

    def post(self, request):
        try:
            # Ne pas logger request.data — contient le mot de passe en clair
            logger.info("Début de l'inscription")

            serializer = RegisterSerializer(data=request.data)

            if not serializer.is_valid():
                logger.error(f"Erreurs de validation du serializer: {serializer.errors}")
                return Response({
                    'error': 'Données invalides',
                    'details': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)

            validated_data = serializer.validated_data
            # Ne pas logger validated_data — contient le mot de passe hashé et les données personnelles

            if User.objects.filter(username=validated_data['username']).exists():
                logger.warning(f"Tentative d'inscription avec un email déjà utilisé: {validated_data['username']}")
                return Response({
                    'error': 'Cet email est déjà utilisé.'
                }, status=status.HTTP_400_BAD_REQUEST)

            logger.info("Création de l'utilisateur...")
            user = serializer.save()
            logger.info(f"Utilisateur créé avec succès: {user.id} - {user.username}")

            role = validated_data.get('role')
            if role == 'client':
                try:
                    profile = ClientProfile.objects.get(user=user)
                    logger.info(f"Profil client créé: {profile.id}")
                except ClientProfile.DoesNotExist:
                    logger.error("Profil client non créé")
                    raise Exception("Échec de création du profil client")
            elif role == 'restaurateur':
                try:
                    profile = RestaurateurProfile.objects.get(user=user)
                    logger.info(f"Profil restaurateur créé: {profile.id}")
                except RestaurateurProfile.DoesNotExist:
                    logger.error("Profil restaurateur non créé")
                    raise Exception("Échec de création du profil restaurateur")

            logger.info("Génération des tokens JWT...")
            refresh = RefreshToken.for_user(user)

            user_data = UserResponseSerializer(user).data
            # Ne pas logger user_data — contient email, téléphone et autres données personnelles

            response_data = {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": user_data
            }

            logger.info(f"Inscription terminée avec succès pour: {user.username}")
            return Response(response_data, status=status.HTTP_201_CREATED)

        except IntegrityError as e:
            logger.error(f"Erreur d'intégrité: {str(e)}")
            return Response({
                'error': 'Cet email est déjà utilisé.',
                'detail': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error(f"Erreur inattendue lors de l'inscription: {str(e)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")

            return Response({
                'error': "Une erreur inattendue s'est produite lors de l'inscription.",
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)