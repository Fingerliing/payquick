from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from api.models import Restaurant, Table, Order, OrderItem, Menu, MenuItem, RestaurateurProfile
from api.serializers.order_serializers import OrderSerializer
from api.permissions import IsRestaurateur
from api.utils.order_utils import notify_order_updated

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['status', 'table__identifiant']
    
    def get_queryset(self):
        return Order.objects.filter(restaurant__owner=self.request.user.restaurateur_profile)

    def perform_create(self, serializer):
        user = self.request.user
        data = self.request.data
        restaurant = get_object_or_404(Restaurant, id=data.get("restaurant"))
        table = get_object_or_404(Table, id=data.get("table"))
        serializer.save(
            restaurateur=user.restaurateur_profile,
            restaurant=restaurant,
            table=table
        )
    @action(detail=False, methods=["post"])
    def submit_order(self, request):
        data = request.data
        restaurant_id = data.get("restaurant")
        table_id = data.get("table_identifiant")
        items = data.get("items", [])

        if not restaurant_id or not table_id or not items:
            return Response({"error": "Missing required fields."}, status=400)

        try:
            restaurant = Restaurant.objects.get(id=restaurant_id)
            table = Table.objects.get(identifiant=table_id, restaurant=restaurant)
            restaurateur = restaurant.owner
        except Restaurant.DoesNotExist:
            return Response({"error": "Restaurant not found."}, status=404)
        except Table.DoesNotExist:
            return Response({"error": "Table not found."}, status=404)
        except RestaurateurProfile.DoesNotExist:
            return Response({"error": "Restaurateur not found."}, status=404)

        order = Order.objects.create(
            restaurant=restaurant,
            table=table,
            restaurateur=restaurateur,
            status="pending"
        )

        for item in items:
            OrderItem.objects.create(
                order=order,
                menu_item_id=item["menu_item_id"],
                quantity=item["quantity"]
            )

        return Response({"order_id": order.id}, status=201)

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        order = self.get_object()
        order.is_paid = True
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"is_paid": True}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def mark_in_progress(self, request, pk=None):
        order = self.get_object()
        order.status = "in_progress"
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"status": "in_progress"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def mark_served(self, request, pk=None):
        order = self.get_object()
        order.status = "served"
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"status": "served"}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def details(self, request, pk=None):
        order = self.get_object()
        items = OrderItem.objects.filter(order=order)
        contenu = [
            {
                "name": item.menu_item.name,
                "quantity": item.quantity,
                "price": float(item.menu_item.price)
            } for item in items
        ]
        return Response({
            "order": order.id,
            "table": order.table.identifiant,
            "status": order.status,
            "items": contenu
        })

    @action(detail=False, methods=["get"], url_path="by_restaurant/(?P<restaurant_id>[^/.]+)")
    def by_restaurant_path(self, request, restaurant_id=None):
        if not restaurant_id:
            return Response({"error": "Missing restaurant_id"}, status=400)

        orders = Order.objects.filter(restaurant__id=restaurant_id).order_by('-created_at')
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="menu/table/(?P<identifiant>[^/.]+)")
    def menu_by_table(self, request, identifiant=None):
        table = get_object_or_404(Table, identifiant=identifiant)
        menu = Menu.objects.filter(restaurant=table.restaurant, disponible=True).first()
        if not menu:
            return Response({"error": "No active menu"}, status=404)

        items = MenuItem.objects.filter(menu=menu, is_available=True)
        data = [
            {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "price": str(item.price),
            }
            for item in items
        ]
        return Response({"menu": menu.name, "items": data})
