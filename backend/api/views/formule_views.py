"""
Vues CRUD restaurateur des formules.

Endpoints (montés sous /api/v1/formules/ — cf. formule_urls.py) ::

    GET    /formules/                liste des formules du restaurateur
    POST   /formules/                crée une formule (+ crans + plats)
    GET    /formules/{id}/           détail complet d'une formule
    PUT    /formules/{id}/           remplace une formule
    PATCH  /formules/{id}/           modifie une formule
    DELETE /formules/{id}/           supprime une formule
    POST   /formules/{id}/toggle/    active / désactive la formule

Le restaurateur ne voit et ne modifie que les formules de ses propres
restaurants (filtrage par restaurant__owner).
"""
import logging

from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from api.models import Formule
from api.permissions import IsRestaurateur
from api.serializers.formule_serializers import (
    FormuleSerializer,
    FormuleListSerializer,
    FormuleClientSerializer,
)

logger = logging.getLogger(__name__)


class FormuleViewSet(viewsets.ModelViewSet):
    """Gère les formules à prix fixe d'un restaurateur.

    Écriture imbriquée (crans + plats) via FormuleSerializer ; payload JSON.
    """
    serializer_class = FormuleSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]
    parser_classes = [JSONParser]

    def get_queryset(self):
        try:
            profile = self.request.user.restaurateur_profile
        except AttributeError:
            return Formule.objects.none()

        qs = (
            Formule.objects
            .filter(restaurant__owner=profile)
            .select_related('restaurant')
            .prefetch_related('courses__items__menu_item')
        )
        # Filtre optionnel par restaurant : ?restaurant=<id>
        restaurant_id = self.request.query_params.get('restaurant')
        if restaurant_id:
            qs = qs.filter(restaurant_id=restaurant_id)
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return FormuleListSerializer
        return FormuleSerializer

    def perform_create(self, serializer):
        # Garde-fou supplémentaire (le queryset du champ est déjà restreint au
        # propriétaire, mais on double-verrouille comme pour les menus).
        restaurant = serializer.validated_data.get('restaurant')
        profile = self.request.user.restaurateur_profile
        if not restaurant or restaurant.owner != profile:
            raise PermissionDenied("Ce restaurant ne vous appartient pas.")
        serializer.save()

    @action(detail=True, methods=['post'], url_path='toggle')
    def toggle_active(self, request, pk=None):
        """Active ou désactive une formule sans la supprimer."""
        formule = self.get_object()
        formule.is_active = not formule.is_active
        formule.save(update_fields=['is_active', 'updated_at'])
        return Response(
            {'id': str(formule.id), 'is_active': formule.is_active},
            status=status.HTTP_200_OK,
        )

    # -- Lecture CLIENT (publique) -------------------------------------------
    @action(
        detail=False,
        methods=['get'],
        url_path=r'public/(?P<restaurant_id>[^/.]+)',
        permission_classes=[AllowAny],
        authentication_classes=[],
    )
    def public_by_restaurant(self, request, restaurant_id=None):
        """Formules ACTIVES d'un restaurant pour le configurateur client.

        Accessible sans authentification. `?lang=` résout les noms/descriptions
        des plats dans la langue demandée (repli français).
        """
        qs = (
            Formule.objects
            .filter(restaurant_id=restaurant_id, is_active=True)
            .prefetch_related('courses__items__menu_item')
            .order_by('order', 'name')
        )
        # Contexte explicite : garantit que `request` (donc ?lang=) est dispo
        # dans FormuleClientItemSerializer pour résoudre les traductions.
        serializer = FormuleClientSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)