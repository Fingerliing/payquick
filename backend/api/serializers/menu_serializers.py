from rest_framework import serializers
from api.models import Menu, MenuItem

class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ['id', 'name', 'description', 'price', 'category', 'is_available', 'menu']

class MenuSerializer(serializers.ModelSerializer):
    items = MenuItemSerializer(many=True, read_only=True)
    restaurant_owner_id = serializers.SerializerMethodField()

    class Meta:
        model = Menu
        fields = ['id', 'name', 'restaurant', 'items', 'created_at', 'updated_at', 'restaurant_owner_id']

    def get_restaurant_owner_id(self, obj):
        return obj.restaurant.owner.id