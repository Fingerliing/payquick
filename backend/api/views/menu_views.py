from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from api.models import Menu, MenuItem
from api.serializers import MenuSerializer, MenuItemSerializer
from api.permissions import IsRestaurateur, IsOwnerOrReadOnly

class MenuViewSet(viewsets.ModelViewSet):
    """
    Gère les menus d'un restaurateur : création, consultation, modification, suppression.
    Filtrage automatique par restaurateur propriétaire.
    """
    serializer_class = MenuSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur, IsOwnerOrReadOnly]

    def get_queryset(self):
        return Menu.objects.filter(restaurant__owner=self.request.user.restaurateur_profile)

    @action(detail=True, methods=["post"])
    def toggle_disponible(self, request, pk=None):
        """
        Active ce menu et désactive tous les autres menus du même restaurant.
        Utile pour ne rendre qu'un seul menu visible à la fois côté client.
        """
        menu = self.get_object()
        restaurant = menu.restaurant
        Menu.objects.filter(restaurant=restaurant).update(disponible=False)
        menu.disponible = True
        menu.save()
        return Response({"id": menu.id, "disponible": menu.disponible})

class MenuItemViewSet(viewsets.ModelViewSet):
    """
    Gère les plats (items) d'un menu : création, modification, suppression.
    Filtrage automatique par restaurateur via le lien au menu.
    """
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return MenuItem.objects.filter(menu__restaurant__owner=self.request.user.restaurateur_profile)

    @action(detail=True, methods=["post"], url_path="toggle")
    def toggle_availability(self, request, pk=None):
        """
        Active ou désactive la disponibilité d'un item.
        Permet de masquer temporairement un plat sans le supprimer.
        """
        item = self.get_object()
        item.is_available = not item.is_available
        item.save()
        return Response({"id": item.id, "is_available": item.is_available}, status=status.HTTP_200_OK)
