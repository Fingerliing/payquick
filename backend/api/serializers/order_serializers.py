from decimal import Decimal
from rest_framework import serializers
from api.models import Order, OrderItem, MenuItem

###############################################################################
# SERIALISERS D’ITEMS DE COMMANDE                                              #
###############################################################################

class OrderItemWriteSerializer(serializers.Serializer):
    """Serializer utilisé par le frontend pour transmettre les lignes du panier."""

    menu_item_id = serializers.PrimaryKeyRelatedField(
        source="menu_item",
        queryset=MenuItem.objects.filter(is_available=True),
        help_text="Identifiant du MenuItem commandé (doit être disponible)",
    )
    quantity = serializers.IntegerField(
        min_value=1,
        max_value=20,
        help_text="Quantité commandée (1‑20)",
    )
    special_request = serializers.CharField(
        allow_blank=True,
        required=False,
        max_length=250,
        help_text="Demande particulière (optionnel, 250 car. max)",
    )

    def validate(self, attrs):
        """S’assure qu’un même MenuItem n’est pas envoyé plusieurs fois."""
        request_items = self.context.get("request_items", [])
        menu_item = attrs["menu_item"]
        if menu_item.id in request_items:
            raise serializers.ValidationError("MenuItem en double dans la commande.")
        request_items.append(menu_item.id)
        self.context["request_items"] = request_items
        return attrs

    def to_internal_value(self, data):
        internal = super().to_internal_value(data)
        # Fixer le prix au moment de la commande (protection contre les futures hausses)
        internal["price_snapshot"] = internal["menu_item"].price
        return internal


class OrderItemReadSerializer(serializers.ModelSerializer):
    """Serializer côté lecture : inclut un total de ligne et le nom du plat."""

    menuItemName = serializers.CharField(source="menu_item.name", read_only=True)
    lineTotal = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = (
            "id",
            "menu_item",        # id du MenuItem (pour debug ou besoin interne)
            "menuItemName",      # nom lisible du plat (frontend)
            "quantity",
            "price_snapshot",
            "special_request",
            "lineTotal",
        )
        read_only_fields = fields

    def get_lineTotal(self, obj):
        return obj.line_total

###############################################################################
# SERIALISERS DE COMMANDE                                                     #
###############################################################################

class OrderCreateSerializer(serializers.ModelSerializer):
    """Création d’une commande depuis le panier frontend."""

    # Champs d’entrée
    items = OrderItemWriteSerializer(many=True, write_only=True)

    # Champs de sortie immédiate
    totalPrice = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True, source="total_price"
    )
    createdAt = serializers.DateTimeField(read_only=True, source="created_at")

    class Meta:
        model = Order
        fields = (
            "id",
            "restaurant",
            "table",
            "items",
            "status",
            "createdAt",
            "totalPrice",
        )
        read_only_fields = ("status", "createdAt", "totalPrice")

    # ---------------------------------------------------------------------
    # VALIDATIONS
    # ---------------------------------------------------------------------
    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("La commande doit contenir au moins un item.")
        return items

    def validate(self, attrs):
        """Vérifie que tous les items appartiennent au même restaurant."""
        restaurant = attrs["restaurant"]
        for item in attrs["items"]:
            if item["menu_item"].menu.restaurant_id != restaurant.id:
                raise serializers.ValidationError(
                    "Tous les items doivent appartenir au même restaurant.",
                )
        return attrs

    # ---------------------------------------------------------------------
    # CRÉATION
    # ---------------------------------------------------------------------
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        user = self.context["request"].user if self.context.get("request") else None
        order = Order.objects.create(client=user, **validated_data)

        # Création des OrderItem
        order_items = [OrderItem(order=order, **item) for item in items_data]
        OrderItem.objects.bulk_create(order_items)
        return order


class OrderReadSerializer(serializers.ModelSerializer):
    """Serializer détaillé d’une commande – utilisé pour le suivi côté mobile."""

    orderItems = OrderItemReadSerializer(source="order_items", many=True)
    restaurantName = serializers.CharField(source="restaurant.name", read_only=True)
    statusDisplay = serializers.CharField(source="get_status_display", read_only=True)
    totalPrice = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True, source="total_price"
    )
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = Order
        fields = (
            "id",
            "restaurant",
            "restaurantName",
            "table",
            "status",
            "statusDisplay",
            "orderItems",
            "totalPrice",
            "createdAt",
            "updatedAt",
        )
        read_only_fields = fields