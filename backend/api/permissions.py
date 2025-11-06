from rest_framework.permissions import BasePermission, SAFE_METHODS
from api.models import RestaurateurProfile
import rest_framework.permissions as permissions

class IsInGroup(BasePermission):
    """
    Vérifie si l'utilisateur appartient à un groupe donné.
    """

    def has_permission(self, request, view):
        return request.user and request.user.groups.filter(name__in=self.groups).exists()

    def __init__(self, groups=None):
        if groups is not None:
            self.groups = groups
        elif hasattr(self, 'required_groups'):
            self.groups = self.required_groups
        else:
            self.groups = []

class IsRestaurateur(IsInGroup):
    def has_permission(self, request, view):
        user = request.user
        print(f"[DEBUG] {user.username} - groupes : {[g.name for g in user.groups.all()]}")
        return user and user.groups.filter(name="restaurateur").exists()

class IsAdmin(IsInGroup):
    required_groups = ["admin"]

class IsClient(IsInGroup):
    required_groups = ["client"]


class IsOwnerOrReadOnly(BasePermission):
    """Permission pour les propriétaires de restaurants ou lecture seule"""
    
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        
        if not request.user.is_authenticated:
            return False
        
        try:
            restaurateur_profile = RestaurateurProfile.objects.get(user=request.user)
            return restaurateur_profile.stripe_verified
        except RestaurateurProfile.DoesNotExist:
            return False
    
class IsOrderOwner(BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.client == request.user or obj.restaurant.owner.user == request.user

class IsValidatedRestaurateur(permissions.BasePermission):
    """Permission pour les restaurateurs validés Stripe"""
    
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        
        try:
            restaurateur_profile = RestaurateurProfile.objects.get(user=request.user)
            return restaurateur_profile.stripe_verified
        except RestaurateurProfile.DoesNotExist:
            return False

class CanCreateRestaurant(permissions.BasePermission):
    """Permission pour créer des restaurants (restaurateurs validés seulement)"""
    
    def has_permission(self, request, view):
        if request.method != 'POST':
            return True
        
        if not request.user.is_authenticated:
            return False
        
        try:
            restaurateur_profile = RestaurateurProfile.objects.get(user=request.user)
            return restaurateur_profile.stripe_verified
        except RestaurateurProfile.DoesNotExist:
            return False


# ============================================================================
# PERMISSIONS COMPTABILITÉ
# ============================================================================

class IsRestaurateurOrAdmin(permissions.BasePermission):
    """Permission pour les restaurateurs ou administrateurs (comptabilité)"""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Admin a tous les droits
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        # Vérifier si c'est un restaurateur actif et vérifié
        try:
            restaurateur = RestaurateurProfile.objects.get(user=request.user)
            return restaurateur.is_active and restaurateur.stripe_verified
        except RestaurateurProfile.DoesNotExist:
            return False
    
    def has_object_permission(self, request, view, obj):
        # Admin peut tout voir
        if request.user.is_staff or request.user.is_superuser:
            return True
        
        # Restaurateur ne peut voir que ses propres données
        try:
            restaurateur = RestaurateurProfile.objects.get(user=request.user)
            
            # Vérifier selon le type d'objet
            if hasattr(obj, 'restaurateur'):
                return obj.restaurateur == restaurateur
            elif hasattr(obj, 'restaurant'):
                return obj.restaurant.owner == restaurateur
            elif hasattr(obj, 'owner'):
                return obj.owner == restaurateur
            
            return False
        except RestaurateurProfile.DoesNotExist:
            return False


class CanExportComptabilite(permissions.BasePermission):
    """Permission pour exporter les données comptables"""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Admin OK
        if request.user.is_staff:
            return True
        
        try:
            restaurateur = RestaurateurProfile.objects.get(user=request.user)
            
            # Vérifier les conditions
            if not restaurateur.is_active or not restaurateur.stripe_verified:
                return False
            
            # Configuration comptable existante
            from api.models import ComptabiliteSettings
            if not ComptabiliteSettings.objects.filter(restaurateur=restaurateur).exists():
                return False
            
            return True
            
        except RestaurateurProfile.DoesNotExist:
            return False


class CanGenerateFEC(permissions.BasePermission):
    """Permission spécifique pour générer le FEC (document légal)"""
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        try:
            restaurateur = RestaurateurProfile.objects.get(user=request.user)
            
            # Conditions strictes pour FEC
            if not (restaurateur.is_active and restaurateur.is_validated and restaurateur.stripe_verified):
                return False
            
            # SIRET valide
            from api.models import ComptabiliteSettings
            try:
                settings = ComptabiliteSettings.objects.get(restaurateur=restaurateur)
                if not settings.siret or len(settings.siret) != 14:
                    return False
            except ComptabiliteSettings.DoesNotExist:
                return False
            
            # Au moins une commande dans l'année
            from api.models import Order
            from django.utils import timezone
            current_year = timezone.now().year
            
            has_orders = Order.objects.filter(
                restaurant__owner=restaurateur,
                created_at__year=current_year,
                payment_status='paid'
            ).exists()
            
            return has_orders
            
        except (RestaurateurProfile.DoesNotExist, AttributeError):
            return False