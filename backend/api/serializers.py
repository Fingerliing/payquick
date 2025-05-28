from rest_framework import serializers
from .models import Restaurant, Menu, MenuItem, ClientProfile, RestaurateurProfile, Order
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