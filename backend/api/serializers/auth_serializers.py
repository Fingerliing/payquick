from rest_framework import serializers
from django.contrib.auth.models import User
from api.models import ClientProfile, RestaurateurProfile, Restaurant, Order, Menu
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.validators import UniqueValidator
import logging
from django.db import transaction

logger = logging.getLogger(__name__)

class RegisterSerializer(serializers.Serializer):
    username = serializers.EmailField(
        validators=[UniqueValidator(queryset=User.objects.all(), message="Cet email est déjà utilisé.")]
    )
    password = serializers.CharField(write_only=True, min_length=8)
    nom = serializers.CharField(required=True, min_length=2)  # Rendre obligatoire
    role = serializers.ChoiceField(choices=["client", "restaurateur"], required=True)
    telephone = serializers.CharField(required=False, allow_blank=True)
    siret = serializers.CharField(required=False, allow_blank=True)

    def validate(self, data):
        """Validation personnalisée"""
        # Vérifier que le SIRET est fourni pour les restaurateurs
        if data.get("role") == "restaurateur":
            if not data.get("siret"):
                raise serializers.ValidationError({
                    "siret": "Le SIRET est obligatoire pour les restaurateurs."
                })
            
            # Vérifier le format du SIRET
            siret = data.get("siret")
            if not siret.isdigit() or len(siret) != 14:
                raise serializers.ValidationError({
                    "siret": "Le SIRET doit contenir exactement 14 chiffres."
                })
        
        # Vérifier que le téléphone est fourni pour les clients
        if data.get("role") == "client":
            if not data.get("telephone"):
                raise serializers.ValidationError({
                    "telephone": "Le téléphone est obligatoire pour les clients."
                })
        
        return data

    def validate_password(self, value):
        """Validation du mot de passe"""
        if len(value) < 8:
            raise serializers.ValidationError("Le mot de passe doit contenir au moins 8 caractères.")
        return value

    def validate_nom(self, value):
        """Validation du nom"""
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Le nom doit contenir au moins 2 caractères.")
        return value.strip()

    def validate_siret(self, value):
        """Validation du SIRET"""
        if value:
            if not value.isdigit():
                raise serializers.ValidationError("Le SIRET doit contenir uniquement des chiffres.")
            if len(value) != 14:
                raise serializers.ValidationError("Le SIRET doit contenir exactement 14 chiffres.")
            
            # Vérifier l'unicité du SIRET
            if RestaurateurProfile.objects.filter(siret=value).exists():
                raise serializers.ValidationError("Ce SIRET est déjà utilisé.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        """Création de l'utilisateur et de son profil"""
        try:
            role = validated_data["role"]
            
            logger.info(f"Création d'un utilisateur avec le rôle: {role}")
            
            # Créer l'utilisateur
            user = User.objects.create_user(
                username=validated_data["username"],
                password=validated_data["password"],
                first_name=validated_data["nom"],
                email=validated_data["username"]  # L'email est stocké dans username
            )
            
            logger.info(f"Utilisateur créé: {user.id} - {user.username}")
            
            # Créer le profil selon le rôle
            if role == "client":
                profile = ClientProfile.objects.create(
                    user=user,
                    phone=validated_data.get("telephone", "")
                )
                logger.info(f"Profil client créé: {profile.id}")
                
            elif role == "restaurateur":
                profile = RestaurateurProfile.objects.create(
                    user=user,
                    siret=validated_data.get("siret", "")
                )
                logger.info(f"Profil restaurateur créé: {profile.id}")
            
            return user
            
        except Exception as e:
            logger.error(f"Erreur lors de la création de l'utilisateur: {str(e)}")
            raise serializers.ValidationError(f"Erreur lors de la création du compte: {str(e)}")


class UserResponseSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'role']

    def get_email(self, obj):
        return obj.email or obj.username

    def get_role(self, obj):
        """Détermine le rôle de l'utilisateur"""
        try:
            if ClientProfile.objects.filter(user=obj).exists():
                return "client"
            elif RestaurateurProfile.objects.filter(user=obj).exists():
                return "restaurateur"
            return "unknown"
        except Exception as e:
            logger.error(f"Erreur lors de la détermination du rôle: {str(e)}")
            return "unknown"

class AuthRequestSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

class ClientProfileSerializer(serializers.ModelSerializer):
    """Serializer pour le profil client"""
    type = serializers.SerializerMethodField()
    
    class Meta:
        model = ClientProfile
        fields = ['id', 'user', 'phone', 'type']
    
    def get_type(self, obj):
        return 'client'

class RestaurateurProfileSerializer(serializers.ModelSerializer):
    """Serializer pour le profil restaurateur"""
    type = serializers.SerializerMethodField()
    
    class Meta:
        model = RestaurateurProfile
        fields = [
            'id', 'user', 'siret', 'is_validated', 'is_active', 
            'created_at', 'stripe_verified', 'stripe_account_id', 'type'
        ]
    
    def get_type(self, obj):
        return 'restaurateur'

class RestaurantBasicSerializer(serializers.ModelSerializer):
    """Serializer basique pour les restaurants dans /me"""
    total_orders = serializers.SerializerMethodField()
    pending_orders = serializers.SerializerMethodField()
    menus_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Restaurant
        fields = [
            'id', 'name', 'description', 'address', 'siret',
            'total_orders', 'pending_orders', 'menus_count'
        ]
    
    def get_total_orders(self, obj):
        return Order.objects.filter(restaurant=obj).count()
    
    def get_pending_orders(self, obj):
        return Order.objects.filter(restaurant=obj, status='pending').count()
    
    def get_menus_count(self, obj):
        return Menu.objects.filter(restaurant=obj).count()

class UserMeSerializer(serializers.ModelSerializer):
    """Serializer complet pour la vue /me"""
    
    role = serializers.SerializerMethodField()
    profile = serializers.SerializerMethodField()
    restaurants = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    recent_orders = serializers.SerializerMethodField()
    is_authenticated = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'is_active', 
            'is_staff', 'is_superuser', 'date_joined', 'last_login',
            'role', 'profile', 'restaurants', 'stats', 'permissions', 
            'roles', 'recent_orders', 'is_authenticated'
        ]
    
    def get_email(self, obj):
        return obj.email or obj.username
    
    def get_role(self, obj):
        """Détermine le rôle de l'utilisateur"""
        if ClientProfile.objects.filter(user=obj).exists():
            return "client"
        elif RestaurateurProfile.objects.filter(user=obj).exists():
            return "restaurateur"
        return "unknown"
    
    def get_profile(self, obj):
        """Récupère le profil selon le rôle"""
        try:
            client_profile = ClientProfile.objects.get(user=obj)
            return ClientProfileSerializer(client_profile).data
        except ClientProfile.DoesNotExist:
            pass
        
        try:
            restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
            return RestaurateurProfileSerializer(restaurateur_profile).data
        except RestaurateurProfile.DoesNotExist:
            pass
        
        return {}
    
    def get_restaurants(self, obj):
        """Récupère les restaurants pour les restaurateurs"""
        try:
            restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
            restaurants = Restaurant.objects.filter(owner=restaurateur_profile)
            return RestaurantBasicSerializer(restaurants, many=True).data
        except RestaurateurProfile.DoesNotExist:
            return []
    
    def get_stats(self, obj):
        """Calcule les statistiques selon le rôle"""
        role = self.get_role(obj)
        
        if role == "restaurateur":
            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
                restaurants = Restaurant.objects.filter(owner=restaurateur_profile)
                
                total_restaurants = restaurants.count()
                total_orders = Order.objects.filter(
                    restaurateur=restaurateur_profile
                ).count()
                pending_orders = Order.objects.filter(
                    restaurateur=restaurateur_profile,
                    status='pending'
                ).count()
                
                return {
                    'total_restaurants': total_restaurants,
                    'total_orders': total_orders,
                    'pending_orders': pending_orders,
                    'active_restaurants': restaurants.filter(
                        # Si vous avez un champ is_active sur Restaurant
                        # is_active=True
                    ).count() if hasattr(Restaurant, 'is_active') else total_restaurants
                }
            except RestaurateurProfile.DoesNotExist:
                return {}
        
        elif role == "client":
            # Statistiques pour les clients
            return {
                'favorite_restaurants': [],  # À implémenter
                'total_orders': 0,  # À implémenter si nécessaire
            }
        
        return {}
    
    def get_permissions(self, obj):
        """Calcule les permissions de l'utilisateur"""
        role = self.get_role(obj)
        
        return {
            'is_staff': obj.is_staff,
            'is_superuser': obj.is_superuser,
            'can_create_restaurant': role == "restaurateur",
            'can_manage_orders': role == "restaurateur" or obj.is_staff,
            'groups': [group.name for group in obj.groups.all()],
            'user_permissions': [perm.codename for perm in obj.user_permissions.all()],
        }
    
    def get_roles(self, obj):
        """Calcule les rôles de l'utilisateur"""
        role = self.get_role(obj)
        profile_data = self.get_profile(obj)
        
        return {
            'is_client': role == "client",
            'is_restaurateur': role == "restaurateur",
            'is_staff': obj.is_staff,
            'is_admin': obj.is_superuser,
            'has_validated_profile': (
                role == "restaurateur" and 
                profile_data.get('is_validated', False)
            ) or role == "client"
        }
    
    def get_recent_orders(self, obj):
        """Récupère les commandes récentes selon le rôle"""
        role = self.get_role(obj)
        
        if role == "restaurateur":
            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
                recent_orders = Order.objects.filter(
                    restaurateur=restaurateur_profile
                ).order_by('-created_at')[:5]
                
                return [
                    {
                        'id': order.id,
                        'restaurant_name': order.restaurant.name if order.restaurant else 'N/A',
                        'restaurant_id': order.restaurant.id if order.restaurant else None,
                        'table': order.table.identifiant if order.table else 'N/A',
                        'status': order.status,
                        'is_paid': order.is_paid,
                        'created_at': order.created_at.isoformat(),
                        'items_count': order.order_items.count() if hasattr(order, 'order_items') else 0,
                    }
                    for order in recent_orders
                ]
            except RestaurateurProfile.DoesNotExist:
                return []
        
        # Pour les clients, à implémenter si nécessaire
        return []
    
    def get_is_authenticated(self, obj):
        return True

# Version simplifiée de la vue utilisant le serializer
class MeViewWithSerializer(APIView):
    """
    Version simplifiée de la vue /me utilisant le serializer
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            user = request.user
            
            # Optimisation des requêtes
            user = User.objects.select_related().prefetch_related(
                'groups',
                'user_permissions',
                'clientprofile',
                'restaurateur_profile',
                'restaurateur_profile__restaurants',
                'restaurateur_profile__orders'
            ).get(pk=user.pk)
            
            serializer = UserMeSerializer(user)
            return Response(serializer.data, status=status.HTTP_200_OK)
            
        except User.DoesNotExist:
            return Response(
                {'error': 'Utilisateur non trouvé'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {
                    'error': 'Erreur lors de la récupération des données utilisateur',
                    'detail': str(e)
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )