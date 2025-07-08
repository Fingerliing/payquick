from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from api.models import Restaurant, Table, Order, OrderItem, Menu, MenuItem
from api.serializers.order_serializers import OrderSerializer
from api.utils.order_utils import notify_order_updated
from drf_spectacular.utils import extend_schema, OpenApiResponse, OpenApiParameter

@extend_schema(tags=["Order • Commandes"])
class OrderViewSet(viewsets.ModelViewSet):
    """
    Gère les commandes dans un restaurant.
    Filtrées automatiquement selon le restaurateur connecté.
    Inclut des actions pour : payer, changer de statut, soumettre une commande, etc.
    """
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

    @extend_schema(
        summary="Soumettre une commande",
        description="Crée une commande avec une liste d’items pour une table donnée.",
        request={
            'application/json': {
                'type': 'object',
                'properties': {
                    'restaurant': {'type': 'integer'},
                    'table_identifiant': {'type': 'string'},
                    'items': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'menu_item_id': {'type': 'integer'},
                                'quantity': {'type': 'integer'}
                            },
                            'required': ['menu_item_id', 'quantity']
                        }
                    }
                },
                'required': ['restaurant', 'table_identifiant', 'items']
            }
        },
        responses={201: OpenApiResponse(description="Commande créée")}
    )
    @action(detail=False, methods=["post"])
    def submit_order(self, request):
        """Crée une nouvelle commande avec une liste d’items pour une table donnée."""
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

    @extend_schema(summary="Marquer comme payée")
    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        """Marque la commande comme payée."""
        order = self.get_object()
        order.is_paid = True
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"is_paid": True}, status=status.HTTP_200_OK)

    @extend_schema(summary="Marquer comme en cours")
    @action(detail=True, methods=["post"])
    def mark_in_progress(self, request, pk=None):
        """Passe la commande au statut "en cours de préparation"."""
        order = self.get_object()
        order.status = "in_progress"
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"status": "in_progress"}, status=status.HTTP_200_OK)

    @extend_schema(summary="Marquer comme servie")
    @action(detail=True, methods=["post"])
    def mark_served(self, request, pk=None):
        """Marque la commande comme servie."""
        order = self.get_object()
        order.status = "served"
        order.save()
        notify_order_updated(OrderSerializer(order).data)
        return Response({"status": "served"}, status=status.HTTP_200_OK)

    @extend_schema(summary="Détails d'une commande")
    @action(detail=True, methods=["get"])
    def details(self, request, pk=None):
        """Retourne les détails d’une commande (items, quantités, prix)."""
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


    @extend_schema(
        summary="Lister les commandes d’un restaurant",
        parameters=[
            OpenApiParameter(name="restaurant_id", required=True, type=int, location=OpenApiParameter.QUERY)
        ]
    )
    @action(detail=False, methods=["get"], url_path="by_restaurant", url_name="by-restaurant")
    def by_restaurant_path(self, request):
        restaurant_id = request.query_params.get("restaurant_id")
        """Retourne les commandes associées à un restaurant donné (admin/staff)."""
        if not restaurant_id:
            return Response({"error": "Missing restaurant_id"}, status=400)

        orders = Order.objects.filter(restaurant__id=restaurant_id).order_by('-created_at')
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    @extend_schema(
        summary="Menu actif via QR code",
        parameters=[
            OpenApiParameter(name="identifiant", required=True, type=str, location=OpenApiParameter.PATH)
        ]
    )
    @action(detail=False, methods=["get"], url_path="menu/table/(?P<identifiant>[^/.]+)")
    def menu_by_table(self, request, identifiant=None):
        """Retourne le menu actif (et ses items) d’une table identifiée via QR code."""
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
