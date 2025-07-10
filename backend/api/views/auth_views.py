from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from api.models import ClientProfile, RestaurateurProfile, Restaurant, Order, Menu
from api.serializers import RegisterSerializer, UserResponseSerializer
from api.throttles import RegisterThrottle
from django.contrib.auth import authenticate
from drf_spectacular.utils import extend_schema
from django.db import IntegrityError
import logging
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
        logger.info(f"Tentative d'inscription avec les données: {request.data}")
        
        serializer = RegisterSerializer(data=request.data)
        
        # Vérifier la validité des données
        if not serializer.is_valid():
            logger.error(f"Erreurs de validation: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Créer l'utilisateur
            user = serializer.save()
            logger.info(f"Utilisateur créé avec succès: {user.username}")
            
            # Générer les tokens JWT
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
                {'error': 'Une erreur inattendue s\'est produite lors de l\'inscription.', 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class RegisterViewDetailed(APIView):
    """
    Version avec gestion d'erreurs plus détaillée
    """
    throttle_classes = [RegisterThrottle]
    
    def post(self, request):
        try:
            logger.info(f"Début de l'inscription - données reçues: {request.data}")
            
            # Validation des données
            serializer = RegisterSerializer(data=request.data)
            
            if not serializer.is_valid():
                logger.error(f"Erreurs de validation du serializer: {serializer.errors}")
                return Response({
                    'error': 'Données invalides',
                    'details': serializer.errors
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Vérification des données avant création
            validated_data = serializer.validated_data
            logger.info(f"Données validées: {validated_data}")
            
            # Vérifier si l'utilisateur existe déjà
            from django.contrib.auth.models import User
            if User.objects.filter(username=validated_data['username']).exists():
                logger.warning(f"Tentative d'inscription avec un email déjà utilisé: {validated_data['username']}")
                return Response({
                    'error': 'Cet email est déjà utilisé.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Créer l'utilisateur
            logger.info("Création de l'utilisateur...")
            user = serializer.save()
            logger.info(f"Utilisateur créé avec succès: {user.id} - {user.username}")
            
            # Vérifier que le profil a été créé
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
            
            # Générer les tokens
            logger.info("Génération des tokens JWT...")
            refresh = RefreshToken.for_user(user)
            
            # Préparer les données utilisateur
            user_data = UserResponseSerializer(user).data
            logger.info(f"Données utilisateur sérialisées: {user_data}")
            
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
            logger.error(f"Type d'erreur: {type(e).__name__}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            return Response({
                'error': 'Une erreur inattendue s\'est produite lors de l\'inscription.',
                'detail': str(e)
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
    Adapté pour ClientProfile et RestaurateurProfile.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            
            # Données de base de l'utilisateur
            user_data = {
                'id': user.id,
                'username': user.username,
                'email': user.email or user.username,  # username est l'email
                'first_name': user.first_name,
                'is_active': user.is_active,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'date_joined': user.date_joined.isoformat(),
                'last_login': user.last_login.isoformat() if user.last_login else None,
            }
            
            # Déterminer le rôle et récupérer le profil
            role = "unknown"
            profile_data = {}
            
            # Vérifier le profil client
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
            
            # Vérifier le profil restaurateur
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
            
            # Données spécifiques aux restaurateurs
            restaurants_data = []
            restaurateur_stats = {}
            
            if role == "restaurateur":
                try:
                    restaurateur_profile = RestaurateurProfile.objects.get(user=user)
                    restaurants = Restaurant.objects.filter(owner=restaurateur_profile)
                    
                    restaurants_data = []
                    for restaurant in restaurants:
                        # Calculer les statistiques pour chaque restaurant
                        total_orders = Order.objects.filter(restaurant=restaurant).count()
                        pending_orders = Order.objects.filter(
                            restaurant=restaurant, 
                            status='pending'
                        ).count()
                        
                        # Nombre de menus
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
                    
                    # Statistiques globales du restaurateur
                    total_restaurants = len(restaurants_data)
                    total_all_orders = sum([r['total_orders'] for r in restaurants_data])
                    total_pending_orders = sum([r['pending_orders'] for r in restaurants_data])
                    
                    restaurateur_stats = {
                        'total_restaurants': total_restaurants,
                        'total_orders': total_all_orders,
                        'pending_orders': total_pending_orders,
                        'active_restaurants': len([r for r in restaurants if hasattr(r, 'is_active') and r.is_active])
                    }
                    
                except RestaurateurProfile.DoesNotExist:
                    pass
            
            # Données spécifiques aux clients
            client_stats = {}
            recent_orders = []
            
            if role == "client":
                # Pour les clients, on peut ajouter des statistiques si nécessaire
                # Par exemple, commandes passées, restaurants favoris, etc.
                client_stats = {
                    'favorite_restaurants': [],  # À implémenter si vous avez ce système
                    'total_orders': 0,  # À implémenter si les clients ont des commandes
                }
            
            # Permissions
            permissions_data = {
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'can_create_restaurant': role == "restaurateur",
                'can_manage_orders': role == "restaurateur" or user.is_staff,
                'groups': [group.name for group in user.groups.all()],
                'user_permissions': [perm.codename for perm in user.user_permissions.all()],
            }
            
            # Rôles calculés
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
            
            # Assembler la réponse complète
            response_data = {
                **user_data,
                'role': role,
                'profile': profile_data,
                'restaurants': restaurants_data,
                'stats': restaurateur_stats if role == "restaurateur" else client_stats,
                'recent_orders': recent_orders,
                'permissions': permissions_data,
                'roles': roles_data,
                'is_authenticated': True,
            }
            
            return Response(response_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {
                    'error': 'Erreur lors de la récupération des données utilisateur',
                    'detail': str(e)
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
    Retourne les tokens JWT s’il est valide.
    Accessible sans authentification.
    """
    authentication_classes = []
    permission_classes = []
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({"detail": "Nom d'utilisateur et mot de passe requis."},
                            status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(request, username=username, password=password)

        if user is not None:
            refresh = RefreshToken.for_user(user)
            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh)
            })
        else:
            return Response({"detail": "Identifiants invalides."},
                            status=status.HTTP_401_UNAUTHORIZED)