from datetime import datetime
from django.db.models import Sum
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from drf_spectacular.types import OpenApiTypes

from api.models import Order
from api.serializers.order_serializers import OrderCreateSerializer, OrderReadSerializer
from api.permissions import IsRestaurateur

###############################################################################
# PERMISSIONS                                                                 #
###############################################################################

class IsOrderOwner(permissions.BasePermission):
    """Autorise le client ou le restaurateur propriétaire de la commande."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        return (
            obj.client_id == getattr(user, "id", None)
            or getattr(getattr(obj.restaurant, "owner", None), "user", None) == user
        )

###############################################################################
# VIEWSET                                                                     #
###############################################################################

@extend_schema(tags=["Order • Commandes"])
class OrderViewSet(viewsets.ModelViewSet):
    """ViewSet complet pour la gestion des **commandes** côté clients & restaurateurs."""

    queryset = (
        Order.objects
        .select_related("restaurant__owner__user", "table", "client")
        .prefetch_related("order_items__menu_item")
    )
    serializer_class = OrderReadSerializer
    permission_classes = [permissions.IsAuthenticated, IsOrderOwner]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["restaurant__name", "status"]
    ordering_fields = ["created_at", "status", "total_price"]
    ordering = ["-created_at"]

    # ---------------------------------------------------------------------
    # Sélection dynamique du serializer
    # ---------------------------------------------------------------------
    def get_serializer_class(self):
        return OrderCreateSerializer if self.action == "create" else OrderReadSerializer

    # ---------------------------------------------------------------------
    # Queryset dynamique selon le rôle + filtres query‑params
    # ---------------------------------------------------------------------
    def get_queryset(self):
        user = self.request.user
        qs = self.queryset

        # Filtrage par rôle
        if getattr(user, "is_staff", False):
            qs = qs  # Accès complet
        elif hasattr(user, "restaurateur_profile"):
            qs = qs.filter(restaurant__owner=user.restaurateur_profile)
        else:
            qs = qs.filter(client=user)

        # Filtres optionnels
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        try:
            if date_from:
                qs = qs.filter(created_at__date__gte=datetime.fromisoformat(date_from))
            if date_to:
                qs = qs.filter(created_at__date__lte=datetime.fromisoformat(date_to))
        except ValueError:
            pass  # Laisser la validation OpenAPI avertir l'utilisateur

        return qs

    # ---------------------------------------------------------------------
    # CRÉATION (override pour logs / headers)
    # ---------------------------------------------------------------------
    @extend_schema(
        summary="Créer une commande",
        description="Création d'une commande depuis un panier client.",
        request=OrderCreateSerializer,
        responses={201: OrderReadSerializer},
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        serializer.save()

    # ---------------------------------------------------------------------
    # ACTION : mise à jour du statut par le restaurateur
    # ---------------------------------------------------------------------
    @extend_schema(
        summary="Mettre à jour le statut",
        description="Permet au restaurateur de passer la commande à un nouveau statut.",
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": [s for s, _ in Order.STATUS_CHOICES],
                    }
                },
                "required": ["status"],
            }
        },
        responses={
            200: OrderReadSerializer,
            400: OpenApiResponse(description="Statut invalide"),
            403: OpenApiResponse(description="Action non autorisée"),
        },
    )
    @action(detail=True, methods=["patch"], url_path="update_status")
    def update_status(self, request, pk=None):
        order = self.get_object()

        # Vérification de l'autorisation côté restaurateur
        if not hasattr(request.user, "restaurateur_profile") or order.restaurant.owner.user != request.user:
            return Response({"detail": "Action réservée au restaurateur."}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get("status")
        allowed_status = dict(Order.STATUS_CHOICES).keys()
        if new_status not in allowed_status:
            return Response({"detail": f"Statut invalide. Possibles : {', '.join(allowed_status)}"}, status=status.HTTP_400_BAD_REQUEST)

        order.status = new_status
        order.save(update_fields=["status", "updated_at"])
        return Response(OrderReadSerializer(order, context=self.get_serializer_context()).data)

    # ---------------------------------------------------------------------
    # ACTION : statistiques rapides pour le restaurateur
    # ---------------------------------------------------------------------
    @extend_schema(
        summary="Statistiques des commandes (restaurateur)",
        description="Retourne des indicateurs clés (totaux par statut, chiffre d'affaires estimé).",
        parameters=[
            OpenApiParameter(
                name="status",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filtrer uniquement un statut donné",
            ),
        ],
        responses={200: OpenApiTypes.OBJECT},
    )
    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsRestaurateur])
    def stats(self, request):
        restaurateur = request.user.restaurateur_profile
        qs = self.queryset.filter(restaurant__owner=restaurateur)
        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)

        data = {
            "total": qs.count(),
            "pending": qs.filter(status="pending").count(),
            "in_progress": qs.filter(status="in_progress").count(),
            "served": qs.filter(status="served").count(),
            "cancelled": qs.filter(status="cancelled").count(),
            "revenue_estimated": qs.filter(status="served").aggregate(total=Sum("order_items__price_snapshot"))[
                "total"
            ]
            or 0,
        }
        return Response(data)