from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from api.models import Menu, MenuItem
from api.serializers import MenuSerializer, MenuItemSerializer
from api.permissions import IsRestaurateur, IsOwnerOrReadOnly
from drf_spectacular.utils import extend_schema, OpenApiResponse

@extend_schema(tags=["Menu • Menus"])
class MenuViewSet(viewsets.ModelViewSet):
    """
    Gère les menus d'un restaurateur : création, consultation, modification, suppression.
    Filtrage automatique par restaurateur propriétaire.
    """
    serializer_class = MenuSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur, IsOwnerOrReadOnly]

    def get_queryset(self):
        return Menu.objects.filter(restaurant__owner=self.request.user.restaurateur_profile)
    
    @extend_schema(
        summary="Activer ce menu (et désactiver les autres)",
        description="Rend ce menu disponible et désactive tous les autres menus du même restaurant.",
        responses={
            200: OpenApiResponse(description="Menu activé", response=MenuSerializer)
        }
    )
    @action(detail=True, methods=["post"])
    def toggle_is_available(self, request, pk=None):
        menu = self.get_object()
        restaurant = menu.restaurant
        Menu.objects.filter(restaurant=restaurant).update(is_available=False)
        menu.is_available = True
        menu.save()
        return Response({"id": menu.id, "is_available": menu.is_available}) 

@extend_schema(tags=["Menu Items"])
class MenuItemViewSet(viewsets.ModelViewSet):
    """
    Gère les plats (items) d'un menu : création, modification, suppression.
    Filtrage automatique par restaurateur via le lien au menu.
    """
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

    def get_queryset(self):
        try:
            return MenuItem.objects.filter(menu__restaurant__owner=self.request.user.restaurateur_profile)
        except AttributeError:
            # Si l'utilisateur n'a pas de restaurateur_profile
            return MenuItem.objects.none()
        
    @extend_schema(
        summary="Activer ou désactiver un item",
        description="Change la disponibilité d'un plat sans le supprimer.",
        responses={
            200: OpenApiResponse(description="Disponibilité modifiée")
        }
    )
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

    @action(detail=False, methods=["get"])
    def allergens(self, request):
        """
        Retourne la liste des allergènes disponibles
        """
        allergens = [
            {'id': 'gluten', 'name': 'Gluten', 'icon': '🌾', 'description': 'Blé, seigle, orge, avoine'},
            {'id': 'crustaceans', 'name': 'Crustacés', 'icon': '🦐', 'description': 'Crevettes, crabes, homards'},
            {'id': 'eggs', 'name': 'Œufs', 'icon': '🥚', 'description': 'Œufs et produits à base d\'œufs'},
            {'id': 'fish', 'name': 'Poissons', 'icon': '🐟', 'description': 'Poissons et produits à base de poissons'},
            {'id': 'peanuts', 'name': 'Arachides', 'icon': '🥜', 'description': 'Cacahuètes et produits dérivés'},
            {'id': 'soybeans', 'name': 'Soja', 'icon': '🫘', 'description': 'Soja et produits à base de soja'},
            {'id': 'milk', 'name': 'Lait', 'icon': '🥛', 'description': 'Lait et produits laitiers (lactose)'},
            {'id': 'nuts', 'name': 'Fruits à coque', 'icon': '🌰', 'description': 'Amandes, noisettes, noix, etc.'},
            {'id': 'celery', 'name': 'Céleri', 'icon': '🥬', 'description': 'Céleri et produits à base de céleri'},
            {'id': 'mustard', 'name': 'Moutarde', 'icon': '🟡', 'description': 'Moutarde et produits dérivés'},
            {'id': 'sesame', 'name': 'Sésame', 'icon': '◯', 'description': 'Graines de sésame et produits dérivés'},
            {'id': 'sulphites', 'name': 'Sulfites', 'icon': '🍷', 'description': 'Anhydride sulfureux et sulfites'},
            {'id': 'lupin', 'name': 'Lupin', 'icon': '🌸', 'description': 'Lupin et produits à base de lupin'},
            {'id': 'molluscs', 'name': 'Mollusques', 'icon': '🐚', 'description': 'Escargots, moules, huîtres, etc.'},
        ]
        return Response(allergens)

    @action(detail=False, methods=["get"])
    def by_allergen(self, request):
        """
        Filtre les plats par allergène
        """
        allergen = request.query_params.get('allergen')
        if not allergen:
            return Response({'error': 'Paramètre allergen requis'}, status=400)
        
        items = self.get_queryset().filter(allergens__contains=[allergen])
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def dietary_options(self, request):
        """
        Filtre les plats par options diététiques
        """
        vegetarian = request.query_params.get('vegetarian') == 'true'
        vegan = request.query_params.get('vegan') == 'true'
        gluten_free = request.query_params.get('gluten_free') == 'true'
        
        queryset = self.get_queryset()
        
        if vegetarian:
            queryset = queryset.filter(is_vegetarian=True)
        if vegan:
            queryset = queryset.filter(is_vegan=True)
        if gluten_free:
            queryset = queryset.filter(is_gluten_free=True)
        
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)