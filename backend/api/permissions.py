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