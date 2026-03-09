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
from api.throttles import RegisterThrottle, LoginThrottle, LoginHourThrottle
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
    authentication_classes = []
    permission_classes = []
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
                {'error': "Une erreur inattendue s'est produite lors de l'inscription."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class RegisterViewDetailed(APIView):
    """Version avec gestion d'erreurs plus détaillée"""
    authentication_classes = []
    permission_classes = []
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
                'error': 'Cet email est déjà utilisé.'
            }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.exception(f"Erreur inattendue lors de l'inscription: {str(e)}")
            return Response({
                'error': "Une erreur inattendue s'est produite lors de l'inscription."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Auth"],
    summary="Infos utilisateur connecté",
    description="Retourne les informations du compte utilisateur connecté via un token JWT.",
    responses={
        200: {
            'type': 'object',
            'properties': {
                'username': {'type': 'string'},
                'email': {'type': 'string'},
                'role': {'type': 'string', 'example': 'client'},
            }
        },
        401: {'description': 'Token manquant ou invalide'}
    }
)
@extend_schema(
    tags=["Auth"],
    summary="Données complètes de l'utilisateur connecté",
    description="Retourne toutes les informations de l'utilisateur connecté avec son profil complet.",
    responses={
        200: {
            'type': 'object',
            'properties': {
                'id': {'type': 'integer'},
                'username': {'type': 'string'},
                'email': {'type': 'string'},
                'first_name': {'type': 'string'},
                'is_active': {'type': 'boolean'},
                'is_staff': {'type': 'boolean'},
                'date_joined': {'type': 'string'},
                'role': {'type': 'string', 'enum': ['client', 'restaurateur']},
                'profile': {'type': 'object'},
                'restaurants': {'type': 'array'},
                'stats': {'type': 'object'},
                'permissions': {'type': 'object'},
            }
        },
        401: {'description': 'Token manquant ou invalide'}
    }
)
class MeView(APIView):
    """
    Retourne toutes les informations de l'utilisateur connecté avec son profil complet.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user

            user_data = {
                'id': user.id,
                'username': user.username,
                'email': user.email or user.username,
                'first_name': user.first_name,
                'is_active': user.is_active,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'date_joined': user.date_joined.isoformat(),
                'last_login': user.last_login.isoformat() if user.last_login else None,
            }

            role = "unknown"
            profile_data = {}

            try:
                client_profile = ClientProfile.objects.get(user=user)
                role = "client"
                profile_data = {
                    'id': client_profile.id,
                    'user': client_profile.user.id,
                    'phone': client_profile.phone,
                    'type': 'client'
                }
            except ClientProfile.DoesNotExist:
                pass

            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=user)
                role = "restaurateur"
                profile_data = {
                    'id': restaurateur_profile.id,
                    'user': restaurateur_profile.user.id,
                    'siret': restaurateur_profile.siret,
                    'is_validated': restaurateur_profile.is_validated,
                    'is_active': restaurateur_profile.is_active,
                    'created_at': restaurateur_profile.created_at.isoformat(),
                    'stripe_verified': restaurateur_profile.stripe_verified,
                    'stripe_account_id': restaurateur_profile.stripe_account_id,
                    'type': 'restaurateur'
                }
            except RestaurateurProfile.DoesNotExist:
                pass

            restaurants_data = []
            restaurateur_stats = {}

            if role == "restaurateur":
                try:
                    restaurateur_profile = RestaurateurProfile.objects.get(user=user)
                    restaurants = Restaurant.objects.filter(owner=restaurateur_profile)

                    for restaurant in restaurants:
                        total_orders = Order.objects.filter(restaurant=restaurant).count()
                        pending_orders = Order.objects.filter(
                            restaurant=restaurant,
                            status='pending'
                        ).count()
                        menus_count = Menu.objects.filter(restaurant=restaurant).count()

                        restaurant_data = {
                            'id': restaurant.id,
                            'name': restaurant.name,
                            'description': restaurant.description,
                            'address': restaurant.address,
                            'siret': restaurant.siret,
                            'total_orders': total_orders,
                            'pending_orders': pending_orders,
                            'menus_count': menus_count,
                            'created_at': restaurant.created_at if hasattr(restaurant, 'created_at') else None,
                        }
                        restaurants_data.append(restaurant_data)

                    restaurateur_stats = {
                        'total_restaurants': len(restaurants_data),
                        'total_orders': sum(r['total_orders'] for r in restaurants_data),
                        'pending_orders': sum(r['pending_orders'] for r in restaurants_data),
                        'active_restaurants': len([r for r in restaurants if hasattr(r, 'is_active') and r.is_active])
                    }

                except RestaurateurProfile.DoesNotExist:
                    pass

            client_stats = {}

            if role == "client":
                client_stats = {
                    'favorite_restaurants': [],
                    'total_orders': 0,
                }

            permissions_data = {
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'can_create_restaurant': role == "restaurateur",
                'can_manage_orders': role == "restaurateur" or user.is_staff,
                'groups': [group.name for group in user.groups.all()],
                'user_permissions': [perm.codename for perm in user.user_permissions.all()],
            }

            roles_data = {
                'is_client': role == "client",
                'is_restaurateur': role == "restaurateur",
                'is_staff': user.is_staff,
                'is_admin': user.is_superuser,
                'has_validated_profile': (
                    role == "restaurateur" and
                    profile_data.get('is_validated', False)
                ) or role == "client"
            }

            response_data = {
                **user_data,
                'role': role,
                'profile': profile_data,
                'restaurants': restaurants_data,
                'stats': restaurateur_stats if role == "restaurateur" else client_stats,
                'recent_orders': [],
                'permissions': permissions_data,
                'roles': roles_data,
                'is_authenticated': True,
            }

            return Response(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {
                    'error': 'Erreur lors de la récupération des données utilisateur'
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


@extend_schema(
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'username': {'type': 'string', 'example': 'johndoe'},
                'password': {'type': 'string', 'example': 'secret123'},
            },
            'required': ['username', 'password'],
        }
    },
    responses={
        200: {
            'type': 'object',
            'properties': {
                'access': {'type': 'string'},
                'refresh': {'type': 'string'},
            },
        },
        401: {'description': 'Identifiants invalides'},
        400: {'description': 'Champs manquants'},
    },
    tags=["Auth"],
    summary="Connexion (JWT)",
    description="Authentifie un utilisateur et retourne les tokens JWT."
)
class LoginView(APIView):
    """
    Authentifie un utilisateur avec son username et mot de passe.
    Retourne les tokens JWT s'il est valide.
    """
    authentication_classes = []
    permission_classes = []
    throttle_classes = [LoginThrottle, LoginHourThrottle]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {"detail": "Nom d'utilisateur et mot de passe requis."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = authenticate(request, username=username, password=password)

        if user is not None:
            refresh = RefreshToken.for_user(user)
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh)
            })
        else:
            return Response(
                {"detail": "Identifiants invalides."},
                status=status.HTTP_401_UNAUTHORIZED
            )


@extend_schema(
    tags=["Auth"],
    summary="Initier l'inscription (Étape 1)",
    description="Initie le processus d'inscription et envoie un code de vérification par email.",
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'username': {
                    'type': 'string',
                    'format': 'email',
                    'example': 'user@example.com',
                    'description': "Email de l'utilisateur (utilisé comme username)"
                },
                'password': {
                    'type': 'string',
                    'minLength': 8,
                    'example': 'motdepasse123',
                    'description': 'Mot de passe (minimum 8 caractères)'
                },
                'nom': {
                    'type': 'string',
                    'example': 'Dupont',
                    'description': 'Nom de famille'
                },
                'role': {
                    'type': 'string',
                    'enum': ['client', 'restaurateur'],
                    'example': 'client',
                },
                'telephone': {
                    'type': 'string',
                    'example': '+33612345678',
                    'description': 'Numéro de téléphone (optionnel)'
                }
            },
            'required': ['username', 'password', 'nom', 'role']
        }
    },
    responses={
        201: {
            'type': 'object',
            'properties': {
                'message': {'type': 'string', 'example': 'Code de vérification envoyé avec succès.'},
                'registration_id': {'type': 'string', 'format': 'uuid'},
                'email': {'type': 'string', 'example': 'u***@example.com'},
                'expires_in': {'type': 'integer', 'example': 600}
            }
        },
        400: {'description': 'Données invalides'},
        429: {'description': 'Trop de tentatives'},
        500: {'description': 'Erreur serveur'}
    }
)
class InitiateRegistrationView(APIView):
    """
    Étape 1 : Initie l'inscription et envoie le code de vérification par email.
    Accessible sans authentification.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = InitiateRegistrationSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data

        try:
            # Vérifier si un utilisateur existe déjà
            if User.objects.filter(username=data['username']).exists():
                return Response(
                    {'error': 'Cet email est déjà utilisé.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Vérifier si une inscription est déjà en cours pour cet email
            existing = PendingRegistration.objects.filter(
                email=data['username'],
                is_verified=False
            ).first()

            if existing and not existing.is_registration_expired():
                if not existing.can_resend():
                    return Response({
                        'error': 'Veuillez attendre avant de renvoyer un code.',
                        'retry_after': settings.SMS_RESEND_COOLDOWN_SECONDS,
                        'registration_id': str(existing.id)
                    }, status=status.HTTP_429_TOO_MANY_REQUESTS)

                # Réutiliser l'inscription existante avec un nouveau code
                pending = existing
                pending.generate_code()
                pending.last_resend_at = timezone.now()
                pending.attempts = 0
                pending.save()
            else:
                if existing:
                    existing.delete()

                pending = PendingRegistration.objects.create(
                    email=data['username'],
                    password_hash=make_password(data['password']),
                    nom=data['nom'],
                    role=data['role'],
                    telephone=data.get('telephone', ''),
                    siret=data.get('siret', ''),
                    ip_address=request.META.get('REMOTE_ADDR'),
                    user_agent=request.META.get('HTTP_USER_AGENT', '')
                )
                pending.generate_code()
                pending.save()

            # Envoyer le code par email
            success = email_verification_service.send_verification_code(
                pending.email,
                pending.verification_code
            )

            if success:
                logger.info(f"Code de vérification envoyé à {pending.email}")
                masked_email = email_verification_service.mask_email(pending.email)

                return Response({
                    'message': 'Code de vérification envoyé avec succès.',
                    'registration_id': str(pending.id),
                    'email': masked_email,
                    'expires_in': settings.SMS_CODE_EXPIRY_MINUTES * 60
                }, status=status.HTTP_201_CREATED)
            else:
                pending.delete()
                return Response({
                    'error': "Impossible d'envoyer l'email de vérification. Veuillez réessayer."
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.error(f"Erreur lors de l'initiation de l'inscription: {str(e)}")
            return Response({
                'error': "Une erreur est survenue lors de l'inscription."
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Auth"],
    summary="Vérifier le code email (Étape 2)",
    description="Vérifie le code de vérification reçu par email et crée le compte utilisateur.",
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'registration_id': {
                    'type': 'string',
                    'format': 'uuid',
                    'example': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
                },
                'code': {
                    'type': 'string',
                    'pattern': '^[0-9]{6}$',
                    'example': '123456',
                    'description': 'Code de vérification à 6 chiffres reçu par email'
                }
            },
            'required': ['registration_id', 'code']
        }
    },
    responses={
        201: {'description': 'Compte créé avec succès'},
        400: {'description': 'Code incorrect ou expiré'},
        404: {'description': 'Inscription non trouvée'},
        429: {'description': 'Trop de tentatives'},
        500: {'description': 'Erreur serveur'}
    }
)
class VerifyRegistrationView(APIView):
    """
    Étape 2 : Vérifie le code email et crée le compte utilisateur.
    Accessible sans authentification.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = VerifyRegistrationSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        registration_id = serializer.validated_data['registration_id']
        code = serializer.validated_data['code']

        try:
            try:
                pending = PendingRegistration.objects.get(
                    id=registration_id,
                    is_verified=False
                )
            except PendingRegistration.DoesNotExist:
                return Response({
                    'error': 'Inscription non trouvée ou déjà validée.'
                }, status=status.HTTP_404_NOT_FOUND)

            if pending.is_expired():
                return Response({
                    'error': 'Le code a expiré. Veuillez demander un nouveau code.'
                }, status=status.HTTP_400_BAD_REQUEST)

            if pending.attempts >= settings.SMS_MAX_ATTEMPTS:
                return Response({
                    'error': 'Trop de tentatives incorrectes. Veuillez demander un nouveau code.'
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            if pending.verification_code != code:
                pending.increment_attempts()
                return Response({
                    'error': 'Code incorrect.',
                    'attempts_remaining': settings.SMS_MAX_ATTEMPTS - pending.attempts
                }, status=status.HTTP_400_BAD_REQUEST)

            # Code correct — créer le compte
            with transaction.atomic():
                pending.mark_verified()

                user = User.objects.create(
                    username=pending.email,
                    email=pending.email,
                    password=pending.password_hash,  # déjà hashé
                    first_name=pending.nom
                )

                if pending.role == 'client':
                    ClientProfile.objects.create(
                        user=user,
                        phone=pending.telephone or ''
                    )
                elif pending.role == 'restaurateur':
                    RestaurateurProfile.objects.create(
                        user=user,
                        siret=pending.siret
                    )

                refresh = RefreshToken.for_user(user)
                pending.delete()

                logger.info(f"Compte créé avec succès pour {user.username}")

                return Response({
                    'message': 'Compte créé avec succès.',
                    'user': {
                        'id': user.id,
                        'username': user.username,
                        'nom': user.first_name,
                        'role': pending.role
                    },
                    'access': str(refresh.access_token),
                    'refresh': str(refresh)
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Erreur lors de la vérification du code: {str(e)}")
            return Response({
                'error': 'Une erreur est survenue lors de la vérification.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@extend_schema(
    tags=["Auth"],
    summary="Renvoyer le code de vérification",
    description="Renvoie un nouveau code de vérification par email.",
    request={
        'application/json': {
            'type': 'object',
            'properties': {
                'registration_id': {
                    'type': 'string',
                    'format': 'uuid',
                    'example': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
                }
            },
            'required': ['registration_id']
        }
    },
    responses={
        200: {'description': 'Nouveau code envoyé avec succès'},
        404: {'description': 'Inscription non trouvée'},
        429: {'description': 'Cooldown actif'},
        500: {'description': "Erreur lors de l'envoi de l'email"}
    }
)
class ResendVerificationCodeView(APIView):
    """
    Renvoie un code de vérification par email.
    Accessible sans authentification.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        serializer = ResendCodeSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        registration_id = serializer.validated_data['registration_id']

        try:
            try:
                pending = PendingRegistration.objects.get(
                    id=registration_id,
                    is_verified=False
                )
            except PendingRegistration.DoesNotExist:
                return Response({
                    'error': 'Inscription non trouvée ou déjà validée.'
                }, status=status.HTTP_404_NOT_FOUND)

            if not pending.can_resend():
                return Response({
                    'error': 'Veuillez attendre avant de renvoyer un code.',
                    'retry_after': settings.SMS_RESEND_COOLDOWN_SECONDS
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

            pending.generate_code()
            pending.last_resend_at = timezone.now()
            pending.attempts = 0
            pending.save()

            success = email_verification_service.send_verification_code(
                pending.email,
                pending.verification_code
            )

            if success:
                return Response({
                    'message': 'Nouveau code envoyé avec succès.',
                    'expires_in': settings.SMS_CODE_EXPIRY_MINUTES * 60
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'error': "Impossible d'envoyer l'email. Veuillez réessayer."
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.error(f"Erreur lors du renvoi du code: {str(e)}")
            return Response({
                'error': 'Une erreur est survenue.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)