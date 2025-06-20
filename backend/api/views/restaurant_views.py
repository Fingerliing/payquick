from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from api.models import Restaurant
from api.serializers import RestaurantSerializer
from api.permissions import IsRestaurateur

class RestaurantViewSet(viewsets.ModelViewSet):
    queryset = Restaurant.objects.all()
    serializer_class = RestaurantSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user.restaurateur_profile)
