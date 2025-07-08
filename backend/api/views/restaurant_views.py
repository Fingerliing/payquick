from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from api.models import Restaurant
from api.serializers import RestaurantSerializer
from api.permissions import IsRestaurateur, IsOwnerOrReadOnly
from drf_spectacular.utils import extend_schema

@extend_schema(
    tags=["Restaurants"],
    summary="Gérer ses restaurants",
    description="CRUD des restaurants pour le restaurateur connecté. Seuls ses propres restaurants sont visibles."
)
class RestaurantViewSet(viewsets.ModelViewSet):
    """
    Gère les restaurateurs : création, consultation, modification, suppression.
    Filtrage automatique par restaurateur propriétaire.
    """
    queryset = Restaurant.objects.all()
    serializer_class = RestaurantSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur, IsOwnerOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user.restaurateur_profile)

    def get_queryset(self):
        return Restaurant.objects.filter(owner=self.request.user.restaurateur_profile)