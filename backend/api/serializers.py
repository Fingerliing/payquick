from rest_framework import serializers
from .models import Restaurant, Menu, MenuItem, ClientProfile, RestaurateurProfile, Order, OrderItem
from django.contrib.auth.models import User

class RegisterSerializer(serializers.Serializer):
    username = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    nom = serializers.CharField()
    role = serializers.ChoiceField(choices=["client", "restaurateur"])
    telephone = serializers.CharField(required=False, allow_blank=True)
    siret = serializers.CharField(required=False, allow_blank=True)
    cni = serializers.FileField(required=False)
    kbis = serializers.FileField(required=False)

    def create(self, validated_data):
        role = validated_data["role"]
        user = User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            first_name=validated_data.get("nom", "")
        )

        if role == "client":
            ClientProfile.objects.create(
                user=user,
                phone=validated_data.get("telephone", "")
            )
        elif role == "restaurateur":
            RestaurateurProfile.objects.create(
                user=user,
                siret=validated_data.get("siret", ""),
                cni=validated_data.get("cni"),
                kbis=validated_data.get("kbis"),
            )

        return user

class RestaurantSerializer(serializers.ModelSerializer):
    owner = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Restaurant
        fields = ["id", "name", "description", "address", "owner"]

class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ["id", "name", "description", "price", "category", "is_available", "menu"]

class MenuSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)

    class Meta:
        model = Menu
        fields = ["id", "name", "restaurant", "items", "created_at", "updated_at"]

class ClientProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientProfile
        fields = '__all__'

class RestaurateurProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurateurProfile
        fields = "__all__"

class OrderItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='menu_item.name', read_only=True)
    price = serializers.DecimalField(source='menu_item.price', max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ['menu_item', 'name', 'price', 'quantity']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(source='order_items', many=True, read_only=True)
    table_number = serializers.CharField(source='table.identifiant', read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "table_number",
            "items",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

class OrderCreateSerializer(serializers.Serializer):
    restaurateur = serializers.PrimaryKeyRelatedField(queryset=RestaurateurProfile.objects.all())
    restaurant = serializers.PrimaryKeyRelatedField(queryset=Restaurant.objects.all())
    table_identifiant = serializers.CharField()
    items = serializers.ListField(
        child=serializers.DictField(child=serializers.IntegerField()),
        allow_empty=False
    )

    def validate_items(self, value):
        for item in value:
            if "menu_item" not in item or "quantity" not in item:
                raise serializers.ValidationError("Chaque item doit contenir 'menu_item' et 'quantity'")
        return value

    def create(self, validated_data):
        from .models import OrderItem, Table

        restaurant = validated_data["restaurant"]
        table_id = validated_data["table_identifiant"]
        items_data = validated_data["items"]

        try:
            table = Table.objects.get(identifiant=table_id, restaurant=restaurant)
        except Table.DoesNotExist:
            raise serializers.ValidationError("Table introuvable pour ce restaurant.")

        order = Order.objects.create(restaurant=restaurant, table=table)

        for item in items_data:
            menu_item_id = item["menu_item"]
            quantity = item["quantity"]

            OrderItem.objects.create(
                order=order,
                menu_item_id=menu_item_id,
                quantity=quantity
            )

        return order
