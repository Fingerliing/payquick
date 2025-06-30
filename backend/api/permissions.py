from rest_framework.permissions import BasePermission, SAFE_METHODS

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
    def has_object_permission(self, request, view, obj):
        # Lecture autorisée pour tout utilisateur authentifié
        if request.method in SAFE_METHODS:
            return True
        # Écriture autorisée uniquement pour le propriétaire
        return obj.restaurant.owner == request.user.restaurateur_profile