from rest_framework.permissions import BasePermission

class IsInGroup(BasePermission):
    """
    Vérifie si l'utilisateur appartient à un groupe donné.
    """

    def has_permission(self, request, view):
        return request.user and request.user.groups.filter(name__in=self.groups).exists()

    def __init__(self, groups=None):
        self.groups = groups if groups else []

class IsRestaurateur(IsInGroup):
    def has_permission(self, request, view):
        user = request.user
        print(f"[DEBUG] {user.username} - groupes : {[g.name for g in user.groups.all()]}")
        return user and user.groups.filter(name="restaurateur").exists()

class IsAdmin(IsInGroup):
    required_groups = ["admin"]

class IsClient(IsInGroup):
    required_groups = ["client"]