from rest_framework import serializers
from .models import Restaurant, Menu, MenuItem, ClientProfile, RestaurateurProfile, Order

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

class OrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Order
        fields = [
            "id",
            "restaurateur",
            "table_number",
            "items",
            "status",
            "is_paid",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]