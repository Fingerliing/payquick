from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from .models import Restaurant, ClientProfile, Menu, MenuItem, RestaurateurProfile, Order
from .serializers import RestaurantSerializer, ClientProfileSerializer, MenuSerializer, MenuItemSerializer, RestaurateurProfileSerializer, OrderSerializer
from rest_framework.permissions import IsAuthenticated
from .permissions import IsRestaurateur, IsClient, IsAdmin
from rest_framework import filters
from rest_framework.decorators import action
from rest_framework import status


class RestaurantViewSet(viewsets.ModelViewSet):
    queryset = Restaurant.objects.all()
    serializer_class = RestaurantSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

class ClientProfileViewSet(viewsets.ModelViewSet):
    queryset = ClientProfile.objects.all()
    serializer_class = ClientProfileSerializer
    permission_classes = [IsAuthenticated, IsClient]

class MenuViewSet(viewsets.ModelViewSet):
    queryset = Menu.objects.all()
    serializer_class = MenuSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.all()
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated]

class MeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if ClientProfile.objects.filter(user=user).exists():
            role = "client"
        elif RestaurateurProfile.objects.filter(user=user).exists():
            role = "restaurateur"
        else:
            role = "unknown"

        return Response({
            "username": user.username,
            "email": user.email,
            "role": role,
        })
    
class RestaurateurProfileViewSet(viewsets.ModelViewSet):
    queryset = RestaurateurProfile.objects.all()
    serializer_class = RestaurateurProfileSerializer
    permission_classes = [IsAuthenticated, IsRestaurateur]

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['status', 'table_number', 'is_paid']

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.all()
        if hasattr(user, 'restaurateur_profile'):
            qs = qs.filter(restaurateur=user.restaurateur_profile)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        if hasattr(self.request.user, 'restaurateur_profile'):
            serializer.save(restaurateur=self.request.user.restaurateur_profile)
        else:
            serializer.save()
    
    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        order = self.get_object()
        order.is_paid = True
        order.save()
        return Response({"status": "paid"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def mark_served(self, request, pk=None):
        order = self.get_object()
        order.status = "served"
        order.save()
        return Response({"status": "served"}, status=status.HTTP_200_OK)