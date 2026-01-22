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
import phonenumbers
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
    has_validated_profile = serializers.SerializerMethodField()
    stripe_account_id = serializers.SerializerMethodField()
    stripe_onboarding_completed = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'role',
                  'has_validated_profile','stripe_account_id',
                  'stripe_onboarding_completed']

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
        
    def get_has_validated_profile(self, obj):
        """Retourne le statut de validation Stripe"""
        try:
            if hasattr(obj, 'restaurateur_profile'):
                return obj.restaurateur_profile.stripe_verified
            elif hasattr(obj, 'clientprofile'):
                return True  # Les clients sont toujours validés
            return False
        except:
            return False
    
    def get_stripe_account_id(self, obj):
        """Retourne l'ID du compte Stripe"""
        try:
            if hasattr(obj, 'restaurateur_profile'):
                return obj.restaurateur_profile.stripe_account_id
            return None
        except:
            return None
    
    def get_stripe_onboarding_completed(self, obj):
        """Retourne le statut de l'onboarding Stripe"""
        try:
            if hasattr(obj, 'restaurateur_profile'):
                return obj.restaurateur_profile.stripe_onboarding_completed
            return False
        except:
            return False

class AuthRequestSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

class ClientProfileSerializer(serializers.ModelSerializer):
    """Serializer pour le profil client"""
    type = serializers.SerializerMethodField()
    has_validated_profile = serializers.SerializerMethodField()
    
    class Meta:
        model = ClientProfile
        # FIX: Added 'has_validated_profile' to fields list
        fields = ['id', 'user', 'phone', 'type', 'has_validated_profile']
    
    def get_type(self, obj):
        return 'client'

    def get_has_validated_profile(self, obj):
        return True  # Les clients sont toujours validés

class RestaurateurProfileSerializer(serializers.ModelSerializer):
    """Serializer pour le profil restaurateur"""
    type = serializers.SerializerMethodField()
    has_validated_profile = serializers.SerializerMethodField()
    nom = serializers.SerializerMethodField()
    # FIX: Removed redundant source='siret' - DRF automatically maps field name to model field
    siret = serializers.CharField()
    telephone = serializers.SerializerMethodField()
    
    class Meta:
        model = RestaurateurProfile
        fields = [
            'id', 'user', 'siret', 'is_validated', 'is_active', 
            'created_at', 'stripe_verified', 'stripe_account_id', 'type',
            'stripe_onboarding_completed', 'stripe_account_created',
            'has_validated_profile', 'nom', 'telephone'
        ]
    
    def get_type(self, obj):
        return 'restaurateur'

    def get_has_validated_profile(self, obj):
        return obj.stripe_verified
    
    def get_nom(self, obj):
        return obj.user.first_name
    
    def get_telephone(self, obj):
        # Retourner le téléphone si disponible (à adapter selon votre structure)
        return getattr(obj, 'telephone', '')

class RestaurantBasicSerializer(serializers.ModelSerializer):
    """Serializer basique pour les restaurants dans /me"""
    total_orders = serializers.SerializerMethodField()
    pending_orders = serializers.SerializerMethodField()
    menus_count = serializers.SerializerMethodField()
    can_receive_orders = serializers.SerializerMethodField()
    owner_stripe_validated = serializers.SerializerMethodField()
    
    class Meta:
        model = Restaurant
        fields = [
            'id', 'name', 'description', 'address', 'siret',
            'total_orders', 'pending_orders', 'menus_count',
            'can_receive_orders', 'owner_stripe_validated', 'is_stripe_active'
        ]
    
    def get_total_orders(self, obj):
        return Order.objects.filter(restaurant=obj).count()
    
    def get_pending_orders(self, obj):
        return Order.objects.filter(restaurant=obj, status='pending').count()
    
    def get_menus_count(self, obj):
        return Menu.objects.filter(restaurant=obj).count()

    def get_can_receive_orders(self, obj):
        return obj.can_receive_orders
    
    def get_owner_stripe_validated(self, obj):
        return obj.owner.stripe_verified

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
    nom = serializers.SerializerMethodField()
    telephone = serializers.SerializerMethodField()
    siret = serializers.SerializerMethodField()
    has_validated_profile = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'is_active', 
            'is_staff', 'is_superuser', 'date_joined', 'last_login',
            'role', 'profile', 'restaurants', 'stats', 'permissions', 
            'roles', 'recent_orders', 'is_authenticated',
            'nom', 'telephone', 'siret', 'has_validated_profile'
        ]

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
    
    def get_profile(self, obj):
        """Récupère le profil selon le rôle"""
        role = self.get_role(obj)
        
        if role == "client":
            try:
                profile = ClientProfile.objects.get(user=obj)
                return ClientProfileSerializer(profile).data
            except ClientProfile.DoesNotExist:
                return None
                
        elif role == "restaurateur":
            try:
                profile = RestaurateurProfile.objects.get(user=obj)
                return RestaurateurProfileSerializer(profile).data
            except RestaurateurProfile.DoesNotExist:
                return None
        
        return None

    def get_nom(self, obj):
        """Récupère le nom de l'utilisateur"""
        return obj.first_name or obj.username
    
    def get_telephone(self, obj):
        """Récupère le téléphone selon le rôle"""
        try:
            if hasattr(obj, 'clientprofile'):
                return obj.clientprofile.phone
            return None
        except:
            return None
    
    def get_siret(self, obj):
        """Récupère le SIRET pour les restaurateurs"""
        try:
            if hasattr(obj, 'restaurateur_profile'):
                return obj.restaurateur_profile.siret
            return None
        except:
            return None
    
    def get_has_validated_profile(self, obj):
        """Retourne le statut de validation"""
        role = self.get_role(obj)
        
        if role == "restaurateur":
            try:
                return obj.restaurateur_profile.stripe_verified
            except:
                return False
        elif role == "client":
            return True
        return False
    
    def get_restaurants(self, obj):
        """Récupère les restaurants pour un restaurateur"""
        role = self.get_role(obj)
        
        if role == "restaurateur":
            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
                restaurants = Restaurant.objects.filter(owner=restaurateur_profile)
                return RestaurantBasicSerializer(restaurants, many=True).data
            except RestaurateurProfile.DoesNotExist:
                return []
        
        return []
    
    def get_stats(self, obj):
        """Calcule les statistiques selon le rôle"""
        role = self.get_role(obj)
        
        if role == "restaurateur":
            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
                restaurants = Restaurant.objects.filter(owner=restaurateur_profile)
                
                total_restaurants = restaurants.count()
                # FIX: Query orders through restaurant, not restaurateur field
                total_orders = Order.objects.filter(
                    restaurant__in=restaurants
                ).count()
                pending_orders = Order.objects.filter(
                    restaurant__in=restaurants,
                    status='pending'
                ).count()
                
                validated_restaurants = restaurants.filter(
                    is_stripe_active=True
                ).count()
                
                return {
                    'total_restaurants': total_restaurants,
                    'total_orders': total_orders,
                    'pending_orders': pending_orders,
                    'active_restaurants': validated_restaurants,
                    'stripe_validated': restaurateur_profile.stripe_verified,
                    'stripe_onboarding_completed': restaurateur_profile.stripe_onboarding_completed,
                }
            except RestaurateurProfile.DoesNotExist:
                return {}
        
        elif role == "client":
            return {
                'favorite_restaurants': [],  # À implémenter
                'total_orders': 0,  # À implémenter si nécessaire
            }
        
        return {}
    
    def get_permissions(self, obj):
        """Calcule les permissions de l'utilisateur"""
        role = self.get_role(obj)
        
        can_create_restaurant = False
        if role == "restaurateur":
            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
                can_create_restaurant = restaurateur_profile.stripe_verified
            except RestaurateurProfile.DoesNotExist:
                pass
        
        return {
            'is_staff': obj.is_staff,
            'is_superuser': obj.is_superuser,
            'can_create_restaurant': can_create_restaurant,
            'can_manage_orders': role == "restaurateur" or obj.is_staff,
            'groups': [group.name for group in obj.groups.all()],
            'user_permissions': [perm.codename for perm in obj.user_permissions.all()],
        }
    
    def get_roles(self, obj):
        """Calcule les rôles de l'utilisateur"""
        role = self.get_role(obj)
        
        has_validated_profile = False
        if role == "restaurateur":
            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
                has_validated_profile = restaurateur_profile.stripe_verified
            except RestaurateurProfile.DoesNotExist:
                pass
        elif role == "client":
            has_validated_profile = True
        
        return {
            'is_client': role == "client",
            'is_restaurateur': role == "restaurateur",
            'is_staff': obj.is_staff,
            'is_admin': obj.is_superuser,
            'has_validated_profile': has_validated_profile
        }
    
    def get_recent_orders(self, obj):
        """Récupère les commandes récentes selon le rôle"""
        role = self.get_role(obj)
        
        if role == "restaurateur":
            try:
                restaurateur_profile = RestaurateurProfile.objects.get(user=obj)
                # FIX: Query through restaurant__owner instead of non-existent restaurateur field
                recent_orders = Order.objects.filter(
                    restaurant__owner=restaurateur_profile
                ).order_by('-created_at')[:5]
                
                return [
                    {
                        'id': order.id,
                        'restaurant_name': order.restaurant.name if order.restaurant else 'N/A',
                        'restaurant_id': order.restaurant.id if order.restaurant else None,
                        # FIX: Use table_number (CharField) instead of table.identifiant (doesn't exist)
                        'table': order.table_number or 'N/A',
                        'status': order.status,
                        'is_paid': getattr(order, 'is_paid', order.payment_status == 'paid'),
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

class InitiateRegistrationSerializer(serializers.Serializer):
    """Serializer pour l'initiation de l'inscription"""
    username = serializers.EmailField(required=True)  # Email
    password = serializers.CharField(write_only=True, min_length=8)
    nom = serializers.CharField(required=True, min_length=2)
    role = serializers.ChoiceField(choices=['client', 'restaurateur'])
    telephone = serializers.CharField(required=False, allow_blank=True)
    siret = serializers.CharField(required=False, allow_blank=True)
    admin_phone = serializers.CharField(required=False, allow_blank=True)  # Pour restaurateur
    
    def validate(self, data):
        # Validation selon le rôle
        if data['role'] == 'client':
            if not data.get('telephone'):
                raise serializers.ValidationError({
                    'telephone': 'Le téléphone est obligatoire pour les clients.'
                })
        elif data['role'] == 'restaurateur':
            if not data.get('siret'):
                raise serializers.ValidationError({
                    'siret': 'Le SIRET est obligatoire pour les restaurateurs.'
                })
            # Pour les restaurateurs, on peut utiliser un numéro admin différent
            if not data.get('telephone') and not data.get('admin_phone'):
                raise serializers.ValidationError({
                    'telephone': 'Un numéro de téléphone est requis pour la vérification.'
                })
        
        return data
    
    def validate_telephone(self, value):
        if value:
            try:
                parsed = phonenumbers.parse(value, "FR")
                if not phonenumbers.is_valid_number(parsed):
                    raise serializers.ValidationError("Numéro de téléphone invalide.")
            except phonenumbers.NumberParseException:
                raise serializers.ValidationError("Format de numéro invalide.")
        return value


class VerifyRegistrationSerializer(serializers.Serializer):
    """Serializer pour la vérification du code SMS"""
    registration_id = serializers.UUIDField(required=True)
    code = serializers.CharField(max_length=6, min_length=6)
    
    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError("Le code doit contenir uniquement des chiffres.")
        return value


class ResendCodeSerializer(serializers.Serializer):
    """Serializer pour le renvoi du code"""
    registration_id = serializers.UUIDField(required=True)